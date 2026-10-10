-- Shared cash consumption. Existing remittances remain legacy; no backfill.
-- The driver cash account row serializes reservations, applications and reversals.
-- Historical linked sources stay unavailable in their entirety, without attributing differences.
create schema if not exists elara_private;
revoke all on schema elara_private from public, anon, authenticated, service_role;
alter table public.cash_remittances add column source_model_version smallint not null default 1 check (source_model_version in (1,2));
alter table public.cash_remittances alter column source_model_version set default 2;

create table public.driver_cash_source_allocations (
 id uuid primary key default extensions.gen_random_uuid(),
 cash_movement_id uuid not null references public.cash_movements(id),
 driver_id uuid not null references public.drivers(id),
 cash_account_id uuid not null references public.cash_accounts(id),
 currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
 allocation_type text not null check (allocation_type in ('remittance','settlement_offset')),
 remittance_id uuid references public.cash_remittances(id),
 settlement_id uuid references public.settlements(id),
 amount numeric(14,2) not null check (amount>0),
 status text not null check (status in ('reserved','applied','released')),
 created_at timestamptz not null default now(),
 created_by uuid not null references public.app_users(id),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.app_users(id),
 check ((allocation_type='remittance' and remittance_id is not null and settlement_id is null)
     or (allocation_type='settlement_offset' and settlement_id is not null and remittance_id is null))
);
create index driver_cash_allocations_source on public.driver_cash_source_allocations(cash_movement_id) where status<>'released';
create index driver_cash_allocations_remittance on public.driver_cash_source_allocations(remittance_id);
create index driver_cash_allocations_settlement on public.driver_cash_source_allocations(settlement_id);
alter table public.driver_cash_source_allocations enable row level security;
revoke all on public.driver_cash_source_allocations from public,anon,authenticated,service_role;
grant select on public.driver_cash_source_allocations to authenticated;
create policy cash_allocations_read on public.driver_cash_source_allocations for select to authenticated
 using (public.rls_current_driver_id()=driver_id or public.rls_has_active_context('superadmin') or public.rls_has_active_context('administrativo'));

create view elara_private.driver_cash_available as
select m.id cash_movement_id,m.cash_account_id,c.driver_id driver_id,m.currency_code,
 m.service_payment_id,m.service_id,m.occurred_at,m.amount original_amount,
 coalesce(a.reserved_amount,0) reserved_amount,coalesce(a.applied_amount,0) applied_amount,
 m.amount-coalesce(a.reserved_amount,0)-coalesce(a.applied_amount,0) available_amount
from public.cash_movements m
join public.cash_accounts c on c.id=m.cash_account_id and c.account_type='driver' and (m.actor_driver_id is null or c.driver_id=m.actor_driver_id)
join public.service_payments p on p.id=m.service_payment_id and p.payment_method='cash' and p.payment_status='completed'
left join lateral (select sum(x.amount) filter(where x.status='reserved') reserved_amount,
 sum(x.amount) filter(where x.status='applied') applied_amount
 from public.driver_cash_source_allocations x where x.cash_movement_id=m.id) a on true
where m.movement_type='inflow' and m.movement_category='service_payment'
 and not exists(select 1 from public.cash_movements r where r.original_movement_id=m.id and r.movement_category='reversal')
 and not exists(select 1 from public.cash_remittance_items i join public.cash_remittances r on r.id=i.remittance_id
   where r.source_model_version=1 and r.status<>'cancelled'
   and (i.cash_movement_id=m.id or i.service_payment_id=m.service_payment_id));

-- Materialized capacity guard: atomic updates also protect REPEATABLE READ snapshots.
-- No historical sources are inserted. A row is created only upon a new allocation.
create table elara_private.driver_cash_source_usage (
 cash_movement_id uuid primary key references public.cash_movements(id),
 original_amount numeric(14,2) not null check(original_amount>0),
 allocated_amount numeric(14,2) not null default 0,
 check(allocated_amount>=0 and allocated_amount<=original_amount)
);
alter table elara_private.driver_cash_source_usage enable row level security;
revoke all on elara_private.driver_cash_source_usage from public,anon,authenticated,service_role;

revoke all on elara_private.driver_cash_available from public,anon,authenticated,service_role;


-- Secondary accounting coverage, never the primary source of cash eligibility.
-- Other outflows must not spend cash already committed to either domain.
create view elara_private.driver_cash_coverage as
select c.id cash_account_id,public.calculate_cash_account_balance(c.id) book_balance,
 coalesce((select sum(a.amount) from public.driver_cash_source_allocations a where a.cash_account_id=c.id and (
  a.status='reserved' or (a.status='applied' and (a.allocation_type='settlement_offset' or not exists(
   select 1 from public.cash_movements m where m.remittance_id=a.remittance_id and m.movement_category='remittance_sent'))))),0)
 +coalesce((select sum(r.declared_amount) from public.cash_remittances r where r.source_cash_account_id=c.id
   and r.source_model_version=1 and r.status in ('prepared','submitted','received')),0) committed_amount
from public.cash_accounts c where c.account_type='driver';
revoke all on elara_private.driver_cash_coverage from public,anon,authenticated,service_role;

create function elara_private.guard_cash_allocation() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
declare v_source record; v_owner record; v_used numeric; v_coverage record; v_delta numeric; begin
 if TG_OP='DELETE' then raise exception 'Cash allocations are append-only.' using errcode='23514'; end if;
 perform 1 from public.cash_accounts where id=new.cash_account_id for no key update;
 if TG_OP='UPDATE' then
  if (to_jsonb(new)-array['status','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['status','updated_at','updated_by'])
    or old.status<>'reserved' or new.status not in ('applied','released') then
   raise exception 'Only reserved allocations may be applied or released; economics are immutable.' using errcode='23514';
  end if;
 end if;
 select * into v_source from elara_private.driver_cash_available where cash_movement_id=new.cash_movement_id;
 if not found or v_source.driver_id<>new.driver_id or v_source.cash_account_id<>new.cash_account_id or v_source.currency_code<>new.currency_code then
  raise exception 'Invalid, reversed or legacy-reserved cash source.' using errcode='23514';
 end if;
 if new.allocation_type='remittance' then
  select * into v_owner from public.cash_remittances where id=new.remittance_id;
  if not found or v_owner.source_model_version<>2 or v_owner.driver_id<>new.driver_id or v_owner.source_cash_account_id<>new.cash_account_id or v_owner.currency_code<>new.currency_code
    or v_owner.status not in ('draft','prepared','submitted','received') then
   raise exception 'Allocation must match an open version 2 driver remittance.' using errcode='23514';
  end if;
 else
  select * into v_owner from public.settlements where id=new.settlement_id;
  if not found or coalesce((to_jsonb(v_owner)->>'calculation_version')::integer,1)<>2 or v_owner.driver_id<>new.driver_id or v_owner.currency_code<>new.currency_code or v_owner.status<>'draft' then
   raise exception 'Settlement cash allocation must match a draft settlement.' using errcode='23514';
  end if;
 end if;
 select coalesce(sum(amount),0) into v_used from public.driver_cash_source_allocations
 where cash_movement_id=new.cash_movement_id and status<>'released' and id<>new.id;
 if new.status<>'released' and v_used+new.amount>v_source.original_amount then
  raise exception 'Cash source would be overallocated.' using errcode='23514';
 end if;
 select * into v_coverage from elara_private.driver_cash_coverage where cash_account_id=new.cash_account_id;
 v_delta:=case when new.status<>'released' then new.amount else 0 end
  -case when TG_OP='UPDATE' and old.status<>'released' then old.amount else 0 end;
 if v_delta>0 and v_coverage.committed_amount+v_delta>v_coverage.book_balance then
  raise exception 'Identified cash sources require reconciliation with account movements.' using errcode='23514';end if;
 insert into elara_private.driver_cash_source_usage(cash_movement_id,original_amount)
 values(new.cash_movement_id,v_source.original_amount) on conflict do nothing;
 update elara_private.driver_cash_source_usage
 set allocated_amount=allocated_amount
   +case when new.status<>'released' then new.amount else 0 end
   -case when TG_OP='UPDATE' and old.status<>'released' then old.amount else 0 end
 where cash_movement_id=new.cash_movement_id;
 new.updated_at:=now(); return new;
end $$;
create trigger guard_cash_allocation before insert or update or delete on public.driver_cash_source_allocations
 for each row execute function elara_private.guard_cash_allocation();

create function elara_private.audit_cash_allocation() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 perform public.secure_audit(case when TG_OP='INSERT' then 'insert' else 'update' end,
 'driver_cash_source_allocations',new.id,null,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),
 'Shared cash source allocation.',jsonb_build_object('operation','driver_cash_source_allocation','source_id',new.cash_movement_id),new.updated_by,new.driver_id);
 return new;
end $$;
create trigger audit_cash_allocation after insert or update on public.driver_cash_source_allocations
 for each row execute function elara_private.audit_cash_allocation();

create function elara_private.guard_cash_reversal() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_account uuid; begin
 if new.movement_category='reversal' then
  select cash_account_id into v_account from public.cash_movements where id=new.original_movement_id;
  perform 1 from public.cash_accounts where id=v_account for no key update;
  if exists(select 1 from public.driver_cash_source_allocations a join public.cash_movements m on m.id=new.original_movement_id
    where a.status<>'released' and (a.cash_movement_id=m.id or (a.remittance_id=m.remittance_id and m.movement_category in ('remittance_sent','remittance_received')))) then
   raise exception 'Allocated cash cannot be reversed without an explicit reconciliation policy.' using errcode='23514';
  end if;
 end if; return new;
end $$;
create trigger guard_shared_cash_reversal before insert on public.cash_movements for each row execute function elara_private.guard_cash_reversal();
create function elara_private.guard_cash_payment() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_account uuid; begin
 if new.payment_status is distinct from old.payment_status or new.payment_method is distinct from old.payment_method or new.amount is distinct from old.amount or new.currency_code is distinct from old.currency_code or new.service_id is distinct from old.service_id or new.service_financial_id is distinct from old.service_financial_id then
  for v_account in select distinct m.cash_account_id from public.cash_movements m where m.service_payment_id=old.id order by m.cash_account_id loop
   perform 1 from public.cash_accounts where id=v_account for no key update;
  end loop;
  if exists(select 1 from public.driver_cash_source_allocations a join public.cash_movements m on m.id=a.cash_movement_id where m.service_payment_id=old.id and a.status<>'released') then
   raise exception 'A cash payment with active allocations cannot be changed or reversed.' using errcode='23514';
  end if;
 end if; return new;
end $$;
create trigger guard_shared_cash_payment before update on public.service_payments for each row execute function elara_private.guard_cash_payment();

create function elara_private.cash_remittance_lifecycle() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 if TG_OP='INSERT' and new.source_model_version<>2 then raise exception 'New remittances require source model 2.' using errcode='23514'; end if;
 if TG_OP='UPDATE' and new.source_model_version<>old.source_model_version then raise exception 'Source model version is immutable.' using errcode='23514'; end if;
 if TG_OP='UPDATE' and new.source_model_version=2 and new.status='cancelled' and old.status<>'cancelled' then
  update public.driver_cash_source_allocations set status='released',updated_by=coalesce(new.updated_by,new.created_by)
   where remittance_id=new.id and status='reserved';
 end if; return new;
end $$;
create trigger aa_cash_remittance_lifecycle before insert or update on public.cash_remittances for each row execute function elara_private.cash_remittance_lifecycle();

create function elara_private.sync_remittance_item_allocation() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_r public.cash_remittances%rowtype; v_m public.cash_movements%rowtype; begin
 select * into v_r from public.cash_remittances where id=case when TG_OP='DELETE' then old.remittance_id else new.remittance_id end;
 if v_r.source_model_version=1 then return null; end if;
 if TG_OP<>'INSERT' then
  update public.driver_cash_source_allocations set status='released',updated_by=coalesce(public.rls_current_app_user_id(),v_r.created_by)
   where remittance_id=old.remittance_id and cash_movement_id=old.cash_movement_id and status='reserved';
 end if;
 if TG_OP<>'DELETE' then
  select * into v_m from public.cash_movements where id=new.cash_movement_id;
  insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,remittance_id,amount,status,created_by,updated_by)
  values(v_m.id,v_r.driver_id,v_r.source_cash_account_id,v_r.currency_code,'remittance',v_r.id,new.amount,'reserved',new.created_by,new.created_by);
 end if; return null;
end $$;
create trigger sync_remittance_item_allocation after insert or update or delete on public.cash_remittance_items for each row execute function elara_private.sync_remittance_item_allocation();

create function elara_private.check_remittance_allocations() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_r public.cash_remittances%rowtype; v_reserved numeric; v_applied numeric; begin
 if TG_TABLE_NAME='cash_remittances' then v_id:=new.id; else v_id:=new.remittance_id; end if;
 if v_id is null then return null; end if;
 select * into v_r from public.cash_remittances where id=v_id;
 if v_r.source_model_version=1 then return null; end if;
 select coalesce(sum(amount) filter(where status='reserved'),0),coalesce(sum(amount) filter(where status='applied'),0)
 into v_reserved,v_applied from public.driver_cash_source_allocations where remittance_id=v_id;
 if exists(select 1 from public.driver_cash_source_allocations a where a.remittance_id=v_id and a.status<>'released'
    and (a.driver_id is distinct from v_r.driver_id or a.cash_account_id is distinct from v_r.source_cash_account_id or a.currency_code<>v_r.currency_code))
  or (v_r.status in ('draft','prepared') and v_applied<>0)
  or (v_r.status in ('submitted','received') and (v_reserved<>v_r.declared_amount or v_applied<>0))
  or (v_r.status='verified' and (v_applied<>v_r.verified_amount or v_reserved<>0))
  or (v_r.status='cancelled' and (v_reserved<>0 or v_applied<>0)) then
  raise exception 'Remittance state and structural cash allocations disagree.' using errcode='23514';
 end if; return null;
end $$;
create constraint trigger check_remittance_cash_header after insert or update on public.cash_remittances deferrable initially deferred
 for each row execute function elara_private.check_remittance_allocations();
create constraint trigger check_remittance_cash_allocations after insert or update on public.driver_cash_source_allocations deferrable initially deferred
 for each row execute function elara_private.check_remittance_allocations();

create or replace function public.prepare_cash_remittance_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remittance_status text;
  v_remittance_id uuid;
  v_existing_remittance_id uuid;
  v_payment public.service_payments%rowtype;
  v_movement public.cash_movements%rowtype;
begin
  if tg_op = 'DELETE' then
    v_remittance_id := old.remittance_id;
  else
    v_remittance_id := new.remittance_id;
  end if;

  select remittance.status
  into v_remittance_status
  from public.cash_remittances remittance
  where remittance.id = v_remittance_id;

  if v_remittance_status is null then
    raise exception 'Cash remittance item references a missing remittance.'
      using errcode = '23503';
  end if;

  if v_remittance_status not in ('draft', 'prepared') then
    raise exception 'Cash remittance items cannot be changed after submission.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.service_payment_id is not null then
    select *
    into v_payment
    from public.service_payments payment
    where payment.id = new.service_payment_id;

    if not found then
      raise exception 'Cash remittance item references a missing service payment.'
        using errcode = '23503';
    end if;

    if new.service_id is not null and new.service_id <> v_payment.service_id then
      raise exception 'Cash remittance item service_id must match the service payment.'
        using errcode = '23514';
    end if;

    new.service_id := v_payment.service_id;
  end if;

  if new.cash_movement_id is not null then
    select *
    into v_movement
    from public.cash_movements movement
    where movement.id = new.cash_movement_id;

    if not found then
      raise exception 'Cash remittance item references a missing cash movement.'
        using errcode = '23503';
    end if;

    if new.service_payment_id is not null and v_movement.service_payment_id is not null and new.service_payment_id <> v_movement.service_payment_id then
      raise exception 'Cash movement and service payment references must represent the same operation.'
        using errcode = '23514';
    end if;

    if new.service_id is not null and v_movement.service_id is not null and new.service_id <> v_movement.service_id then
      raise exception 'Cash remittance item service_id must match the cash movement.'
        using errcode = '23514';
    end if;

    if new.service_id is null then
      new.service_id := v_movement.service_id;
    end if;
  end if;

  if new.cash_movement_id is not null then
    select item.remittance_id
    into v_existing_remittance_id
    from public.cash_remittance_items item
    join public.cash_remittances remittance on remittance.id = item.remittance_id
    where item.cash_movement_id = new.cash_movement_id
      and item.id <> new.id
      and remittance.status <> 'cancelled'
      and (remittance.source_model_version=1 or (select source_model_version from public.cash_remittances where id=new.remittance_id)=1)
    limit 1;

    if found then
      raise exception 'Cash movement already belongs to another active remittance.'
        using errcode = '23514';
    end if;
  end if;

  if new.service_payment_id is not null then
    select item.remittance_id
    into v_existing_remittance_id
    from public.cash_remittance_items item
    join public.cash_remittances remittance on remittance.id = item.remittance_id
    where item.service_payment_id = new.service_payment_id
      and item.id <> new.id
      and remittance.status <> 'cancelled'
      and (remittance.source_model_version=1 or (select source_model_version from public.cash_remittances where id=new.remittance_id)=1)
    limit 1;

    if found then
      raise exception 'Service payment already belongs to another active remittance.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_driver_cash_remittance(p_notes text default null)
returns table(
  remittance_id uuid,
  human_code text,
  status text,
  declared_amount numeric(14, 2),
  currency_code text,
  item_count integer,
  submitted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_source_account public.cash_accounts%rowtype;
  v_destination_account public.cash_accounts%rowtype;
  v_remittance public.cash_remittances%rowtype;
  v_notes text;
  v_pending_movement_ids uuid[];
  v_declared_amount numeric(14, 2);
  v_item_count integer;
  v_inserted_count integer;
begin
  v_driver_id := public.rls_current_driver_id();
  v_app_user_id := public.rls_current_app_user_id();

  if v_driver_id is null or v_app_user_id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  if v_notes is not null and v_notes ~ '<[[:alpha:]/][^>]*>' then
    raise exception 'Remittance notes cannot contain HTML.'
      using errcode = '23514';
  end if;

  select *
    into v_source_account
  from public.cash_accounts account
  where account.driver_id = v_driver_id
    and account.account_type = 'driver'
    and account.status = 'active'
  for no key update;

  if v_source_account.id is null then
    raise exception 'An active driver cash account is required to submit a cash remittance.'
      using errcode = '23503';
  end if;

  select *
    into v_destination_account
  from public.cash_accounts account
  where account.account_type = 'central'
    and account.status = 'active'
    and account.currency_code = v_source_account.currency_code
  for no key update;

  if v_destination_account.id is null then
    raise exception 'An active central cash account is required to submit a cash remittance.'
      using errcode = '23503';
  end if;

  select
      array_agg(pending.id order by pending.occurred_at, pending.id),
      count(*)::integer,
      coalesce(round(sum(pending.amount), 2), 0)
    into
      v_pending_movement_ids,
      v_item_count,
      v_declared_amount
  from (
    select movement.cash_movement_id id,movement.available_amount amount,movement.occurred_at
    from elara_private.driver_cash_available movement
    where movement.cash_account_id=v_source_account.id and movement.available_amount>0
    order by movement.occurred_at,movement.cash_movement_id
  ) pending;

  if coalesce(v_item_count, 0) = 0 or coalesce(v_declared_amount, 0) <= 0 then
    raise exception 'No cash is pending to be remitted.'
      using errcode = '23514';
  end if;

  insert into public.cash_remittances (
    source_cash_account_id,
    destination_cash_account_id,
    driver_id,
    status,
    declared_amount,
    currency_code,
    notes,
    created_by,
    updated_by
  )
  values (
    v_source_account.id,
    v_destination_account.id,
    v_driver_id,
    'draft',
    v_declared_amount,
    v_source_account.currency_code,
    v_notes,
    v_app_user_id,
    v_app_user_id
  )
  returning * into v_remittance;

  insert into public.cash_remittance_items (
    remittance_id,
    cash_movement_id,
    service_payment_id,
    service_id,
    amount,
    description,
    created_by
  )
  select
    v_remittance.id,
    movement.id,
    movement.service_payment_id,
    movement.service_id,
    available.available_amount,
    'Driver cash remittance item',
    v_app_user_id
  from public.cash_movements movement
  join elara_private.driver_cash_available available on available.cash_movement_id=movement.id
  where movement.id = any(v_pending_movement_ids)
  order by movement.occurred_at, movement.id;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> v_item_count then
    raise exception 'Cash remittance items changed during submission. Please try again.'
      using errcode = '40001';
  end if;

  update public.cash_remittances
     set status = 'prepared',
         prepared_at = now(),
         prepared_by_user_id = v_app_user_id,
         updated_by = v_app_user_id
   where id = v_remittance.id
  returning * into v_remittance;

  update public.cash_remittances
     set status = 'submitted',
         submitted_at = now(),
         submitted_by_driver_id = v_driver_id,
         updated_by = v_app_user_id
   where id = v_remittance.id
  returning * into v_remittance;

  perform public.secure_audit(
    'insert',
    'cash_remittances',
    v_remittance.id,
    v_remittance.human_code,
    null,
    to_jsonb(v_remittance),
    'Driver submitted cash remittance.',
    jsonb_build_object(
      'operation', 'driver_cash_remittance_submitted',
      'driver_id', v_driver_id,
      'source_cash_account_id', v_source_account.id,
      'destination_cash_account_id', v_destination_account.id,
      'declared_amount', v_remittance.declared_amount,
      'currency_code', v_remittance.currency_code,
      'item_count', v_item_count,
      'cash_movement_ids', v_pending_movement_ids
    ),
    v_app_user_id,
    v_driver_id
  );

  return query
    select
      v_remittance.id,
      v_remittance.human_code,
      v_remittance.status,
      v_remittance.declared_amount,
      v_remittance.currency_code,
      v_item_count,
      v_remittance.submitted_at;
end;
$$;

create or replace function elara_private.verify_cash_remittance_transfer(
  p_remittance_id uuid,
  p_verified_amount numeric
)
returns table(
  remittance_id uuid,
  human_code text,
  status text,
  declared_amount numeric(14, 2),
  verified_amount numeric(14, 2),
  difference_amount numeric(14, 2),
  currency_code text,
  verified_at timestamptz,
  verified_by_user_id uuid,
  driver_id uuid,
  driver_human_code text,
  driver_outflow_movement_id uuid,
  central_inflow_movement_id uuid,
  discrepancy_id uuid,
  discrepancy_status text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_verified_amount numeric(14, 2);
  v_difference_amount numeric(14, 2);
  v_now timestamptz := now();
  v_remittance_before public.cash_remittances%rowtype;
  v_remittance_after public.cash_remittances%rowtype;
  v_source_account public.cash_accounts%rowtype;
  v_destination_account public.cash_accounts%rowtype;
  v_existing_discrepancy public.cash_discrepancies%rowtype;
  v_discrepancy public.cash_discrepancies%rowtype;
  v_driver_human_code text;
  v_driver_outflow_movement_id uuid;
  v_central_inflow_movement_id uuid;
begin
  v_actor_id := public.require_admin_user();

  if p_remittance_id is null then
    raise exception 'Cash remittance id is required.'
      using errcode = '23502';
  end if;

  if p_verified_amount is null then
    raise exception 'Verified amount is required.'
      using errcode = '23502';
  end if;

  if p_verified_amount < 0 then
    raise exception 'Verified amount cannot be negative.'
      using errcode = '23514';
  end if;

  if p_verified_amount <> round(p_verified_amount, 2) then
    raise exception 'Verified amount must use at most two decimal places.'
      using errcode = '23514';
  end if;

  v_verified_amount := round(p_verified_amount, 2);

  if v_verified_amount <= 0 then
    raise exception 'Verified amount must be greater than zero to create remittance cash movements.'
      using errcode = '23514';
  end if;

  select *
    into v_remittance_before
  from public.cash_remittances remittance
  where remittance.id = p_remittance_id
  for no key update;

  if not found then
    raise exception 'Cash remittance was not found.'
      using errcode = '23503';
  end if;

  if v_remittance_before.status = 'verified' then
    raise exception 'Cash remittance % is already verified.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.status = 'cancelled' then
    raise exception 'Cancelled cash remittance % cannot be verified.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.status <> 'received' then
    raise exception 'Cash remittance % cannot be verified from status %.', v_remittance_before.human_code, v_remittance_before.status
      using errcode = '23514';
  end if;

  if v_remittance_before.received_at is null
     or v_remittance_before.received_by_user_id is null then
    raise exception 'Cash remittance % must be received before verification.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.verified_at is not null
     or v_remittance_before.verified_by_user_id is not null
     or v_remittance_before.verified_amount is not null then
    raise exception 'Cash remittance % already has verification metadata.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.declared_amount < 0 then
    raise exception 'Cash remittance % has an invalid declared amount.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  select *
    into v_source_account
  from public.cash_accounts account
  where account.id = v_remittance_before.source_cash_account_id
  for no key update;

  if not found then
    raise exception 'Cash remittance % references a missing source cash account.', v_remittance_before.human_code
      using errcode = '23503';
  end if;

  select *
    into v_destination_account
  from public.cash_accounts account
  where account.id = v_remittance_before.destination_cash_account_id
  for no key update;

  if not found then
    raise exception 'Cash remittance % references a missing destination cash account.', v_remittance_before.human_code
      using errcode = '23503';
  end if;

  if v_source_account.id = v_destination_account.id then
    raise exception 'Cash remittance % must use distinct cash accounts.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_source_account.status <> 'active'
     or v_destination_account.status <> 'active' then
    raise exception 'Cash remittance % requires active source and destination cash accounts.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_source_account.currency_code <> v_remittance_before.currency_code
     or v_destination_account.currency_code <> v_remittance_before.currency_code then
    raise exception 'Cash remittance % currency must match source and destination cash accounts.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_source_account.account_type <> 'driver' then
    raise exception 'Cash remittance % must originate from a driver cash account.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_destination_account.account_type <> 'central' then
    raise exception 'Cash remittance % must be received into the central cash account.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.driver_id is null
     or v_source_account.driver_id is distinct from v_remittance_before.driver_id then
    raise exception 'Driver cash remittance % must be linked to its source driver account.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.submitted_by_driver_id is null
     or v_remittance_before.submitted_by_driver_id is distinct from v_remittance_before.driver_id then
    raise exception 'Driver cash remittance % must have the submitting driver recorded.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.cash_movements movement
    where movement.remittance_id = v_remittance_before.id
      and movement.movement_category in ('remittance_sent', 'remittance_received')
  ) then
    raise exception 'Cash remittance % already has remittance cash movements.', v_remittance_before.human_code
      using errcode = '23505';
  end if;

  v_difference_amount := round(v_verified_amount - v_remittance_before.declared_amount, 2);

  update public.cash_remittances remittance
     set status = 'verified',
         verified_amount = v_verified_amount,
         verified_at = v_now,
         verified_by_user_id = v_actor_id,
         updated_by = v_actor_id
   where remittance.id = v_remittance_before.id
     and remittance.status = 'received'
  returning * into v_remittance_after;

  if not found then
    raise exception 'Cash remittance % could not be verified because its status changed concurrently.', v_remittance_before.human_code
      using errcode = '40001';
  end if;

  insert into public.cash_movements (
    cash_account_id,
    movement_type,
    movement_category,
    amount,
    currency_code,
    occurred_at,
    remittance_id,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata,
    created_by,
    actor_driver_id
  )
  values (
    v_remittance_after.source_cash_account_id,
    'outflow',
    'remittance_sent',
    v_verified_amount,
    v_remittance_after.currency_code,
    v_now,
    v_remittance_after.id,
    'cash_remittance',
    v_remittance_after.id,
    'cash_remittance_verified:' || v_remittance_after.id::text || ':driver_outflow',
    'Driver cash remittance sent after administrative verification.',
    jsonb_build_object(
      'operation', 'admin_cash_remittance_verified',
      'remittance_id', v_remittance_after.id,
      'human_code', v_remittance_after.human_code
    ),
    v_actor_id,
    v_remittance_after.driver_id
  )
  returning id into v_driver_outflow_movement_id;

  insert into public.cash_movements (
    cash_account_id,
    movement_type,
    movement_category,
    amount,
    currency_code,
    occurred_at,
    remittance_id,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata,
    created_by,
    actor_driver_id
  )
  values (
    v_remittance_after.destination_cash_account_id,
    'inflow',
    'remittance_received',
    v_verified_amount,
    v_remittance_after.currency_code,
    v_now,
    v_remittance_after.id,
    'cash_remittance',
    v_remittance_after.id,
    'cash_remittance_verified:' || v_remittance_after.id::text || ':central_inflow',
    'Central cash remittance received after administrative verification.',
    jsonb_build_object(
      'operation', 'admin_cash_remittance_verified',
      'remittance_id', v_remittance_after.id,
      'human_code', v_remittance_after.human_code
    ),
    v_actor_id,
    v_remittance_after.driver_id
  )
  returning id into v_central_inflow_movement_id;

  select *
    into v_existing_discrepancy
  from public.cash_discrepancies discrepancy
  where discrepancy.discrepancy_type = 'remittance'
    and discrepancy.remittance_id = v_remittance_after.id
    and discrepancy.status in ('open', 'under_review')
  order by discrepancy.created_at, discrepancy.id
  limit 1
  for no key update;

  if found then
    update public.cash_discrepancies discrepancy
       set expected_amount = v_remittance_after.declared_amount,
           actual_amount = v_verified_amount,
           difference_amount = v_difference_amount,
           status = 'under_review',
           updated_by = v_actor_id
     where discrepancy.id = v_existing_discrepancy.id
    returning * into v_discrepancy;
  elsif v_difference_amount <> 0 then
    insert into public.cash_discrepancies (
      discrepancy_type,
      cash_account_id,
      remittance_id,
      expected_amount,
      actual_amount,
      difference_amount,
      currency_code,
      status,
      reason_code,
      reason_details,
      created_by,
      updated_by
    )
    values (
      'remittance',
      v_remittance_after.source_cash_account_id,
      v_remittance_after.id,
      v_remittance_after.declared_amount,
      v_verified_amount,
      v_difference_amount,
      v_remittance_after.currency_code,
      'open',
      'admin_verification_difference',
      U&'Diferencia detectada durante la verificaci\00F3n administrativa de la rendici\00F3n.',
      v_actor_id,
      v_actor_id
    )
    returning * into v_discrepancy;

    update public.cash_discrepancies discrepancy
       set status = 'under_review',
           updated_by = v_actor_id
     where discrepancy.id = v_discrepancy.id
    returning * into v_discrepancy;
  end if;

  select driver.human_code
    into v_driver_human_code
  from public.drivers driver
  where driver.id = v_remittance_after.driver_id;

  perform public.secure_audit(
    'status_change',
    'cash_remittances',
    v_remittance_after.id,
    v_remittance_after.human_code,
    to_jsonb(v_remittance_before),
    to_jsonb(v_remittance_after),
    'Admin cash remittance verified.',
    jsonb_build_object(
      'operation', 'admin_cash_remittance_verified',
      'remittance_id', v_remittance_after.id,
      'human_code', v_remittance_after.human_code,
      'driver_id', v_remittance_after.driver_id,
      'declared_amount', v_remittance_after.declared_amount,
      'verified_amount', v_verified_amount,
      'difference_amount', v_difference_amount,
      'currency_code', v_remittance_after.currency_code,
      'driver_outflow_movement_id', v_driver_outflow_movement_id,
      'central_inflow_movement_id', v_central_inflow_movement_id,
      'discrepancy_id', v_discrepancy.id,
      'verified_by_app_user_id', v_actor_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_remittance_after.id,
      v_remittance_after.human_code,
      v_remittance_after.status,
      v_remittance_after.declared_amount,
      v_remittance_after.verified_amount,
      v_difference_amount,
      v_remittance_after.currency_code,
      v_remittance_after.verified_at,
      v_remittance_after.verified_by_user_id,
      v_remittance_after.driver_id,
      v_driver_human_code,
      v_driver_outflow_movement_id,
      v_central_inflow_movement_id,
      v_discrepancy.id,
      v_discrepancy.status;
end;
$$;

create or replace function public.verify_cash_remittance(
  p_remittance_id uuid,
  p_verified_amount numeric
)
returns table(
  remittance_id uuid,
  human_code text,
  status text,
  declared_amount numeric(14, 2),
  verified_amount numeric(14, 2),
  difference_amount numeric(14, 2),
  currency_code text,
  verified_at timestamptz,
  verified_by_user_id uuid,
  driver_id uuid,
  driver_human_code text,
  driver_outflow_movement_id uuid,
  central_inflow_movement_id uuid,
  discrepancy_id uuid,
  discrepancy_status text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_actor uuid; v_r public.cash_remittances%rowtype; v_a record; v_source record; v_remaining numeric; v_total numeric; v_discrepancy uuid; begin
 v_actor:=public.require_admin_user();
 select * into v_r from public.cash_remittances where id=p_remittance_id for no key update;
 if not found then raise exception 'Cash remittance was not found.' using errcode='23503'; end if;
 if v_r.source_model_version=1 then
  return query select * from elara_private.verify_cash_remittance_transfer(p_remittance_id,p_verified_amount); return;
 end if;
 if v_r.status<>'received' then raise exception 'Remittance must be received before verification.' using errcode='23514'; end if;
 if p_verified_amount is null or p_verified_amount<=0 or p_verified_amount<>round(p_verified_amount,2) then
  raise exception 'Verified amount must be positive with at most two decimals.' using errcode='23514'; end if;
 perform 1 from public.cash_accounts where id=v_r.source_cash_account_id for no key update;
 select coalesce(sum(amount),0) into v_total from public.driver_cash_source_allocations where remittance_id=v_r.id and status='reserved';
 if v_total<>v_r.declared_amount then raise exception 'Declared amount must be backed by reservations.' using errcode='23514'; end if;
 select v_total+coalesce(sum(available_amount),0) into v_total from elara_private.driver_cash_available where cash_account_id=v_r.source_cash_account_id;
 if p_verified_amount>v_total then
  -- No under_review remittance state exists: keep received; discrepancy is under_review.
  select d.id into v_discrepancy from public.cash_discrepancies d where d.remittance_id=v_r.id and d.discrepancy_type='remittance' and d.status in ('open','under_review') for no key update;
  if v_discrepancy is null then
   insert into public.cash_discrepancies(discrepancy_type,cash_account_id,remittance_id,status,expected_amount,actual_amount,difference_amount,currency_code,reason_code,created_by,updated_by)
    values('remittance',v_r.source_cash_account_id,v_r.id,'open',v_r.declared_amount,p_verified_amount,round(p_verified_amount-v_r.declared_amount,2),v_r.currency_code,'insufficient_identified_cash_sources',v_actor,v_actor) returning id into v_discrepancy;
  end if;
  update public.cash_discrepancies set status='under_review',expected_amount=v_r.declared_amount,actual_amount=p_verified_amount,difference_amount=round(p_verified_amount-v_r.declared_amount,2),updated_by=v_actor where id=v_discrepancy;
  perform public.secure_audit('update','cash_remittances',v_r.id,v_r.human_code,to_jsonb(v_r),to_jsonb(v_r),
   'Verification deferred: insufficient identified cash sources.',jsonb_build_object('operation','admin_cash_remittance_verification_deferred','verified_amount_attempted',p_verified_amount,'discrepancy_id',v_discrepancy),v_actor,v_r.driver_id);
  return query select v_r.id,v_r.human_code,v_r.status,v_r.declared_amount,v_r.verified_amount,round(p_verified_amount-v_r.declared_amount,2),v_r.currency_code,v_r.verified_at,v_r.verified_by_user_id,v_r.driver_id,
    (select d.human_code from public.drivers d where d.id=v_r.driver_id),null::uuid,null::uuid,v_discrepancy,'under_review'::text;
  return;
 end if;
 v_remaining:=p_verified_amount;
 for v_a in select a.* from public.driver_cash_source_allocations a join public.cash_movements m on m.id=a.cash_movement_id
   where a.remittance_id=v_r.id and a.status='reserved' order by m.occurred_at,m.id,a.id loop
  update public.driver_cash_source_allocations set status='released',updated_by=v_actor where id=v_a.id;
  if v_remaining>0 then
   insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,remittance_id,amount,status,created_by,updated_by)
    values(v_a.cash_movement_id,v_r.driver_id,v_r.source_cash_account_id,v_r.currency_code,'remittance',v_r.id,least(v_a.amount,v_remaining),'applied',v_actor,v_actor);
   v_remaining:=greatest(v_remaining-v_a.amount,0);
  end if;
 end loop;
 for v_source in select * from elara_private.driver_cash_available where cash_account_id=v_r.source_cash_account_id and available_amount>0 order by occurred_at,cash_movement_id loop
  exit when v_remaining=0;
  insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,remittance_id,amount,status,created_by,updated_by)
    values(v_source.cash_movement_id,v_r.driver_id,v_r.source_cash_account_id,v_r.currency_code,'remittance',v_r.id,least(v_source.available_amount,v_remaining),'applied',v_actor,v_actor);
  v_remaining:=greatest(v_remaining-v_source.available_amount,0);
 end loop;
 if v_remaining<>0 then raise exception 'Cash availability changed during verification.' using errcode='40001'; end if;
 return query select * from elara_private.verify_cash_remittance_transfer(p_remittance_id,p_verified_amount);
end;
$$;

create or replace function public.get_driver_cash_finance_summary()
returns table(
  driver_id uuid,
  currency_code text,
  cash_collected_amount numeric(14, 2),
  remitted_amount numeric(14, 2),
  pending_remittance_amount numeric(14, 2),
  open_discrepancy_count integer,
  open_discrepancy_amount numeric(14, 2),
  excess_under_review_amount numeric(14, 2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_cash_account_id uuid;
  v_currency_code text;
  v_cash_collected_amount numeric(14, 2);
  v_remitted_amount numeric(14, 2);
  v_open_discrepancy_count integer;
  v_open_discrepancy_amount numeric(14, 2);
  v_excess_under_review_amount numeric(14, 2);
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to read driver cash finance summary.'
      using errcode = '42501';
  end if;

  select account.id, account.currency_code
    into v_cash_account_id, v_currency_code
  from public.cash_accounts account
  where account.driver_id = v_driver_id
    and account.account_type = 'driver'
    and account.status = 'active';

  if v_cash_account_id is null then
    raise exception 'An active driver cash account is required to read driver cash finance summary.'
      using errcode = '23503';
  end if;

  select coalesce(round(sum(movement.amount), 2), 0)
    into v_cash_collected_amount
  from public.cash_movements movement
  join public.service_payments payment
    on payment.id = movement.service_payment_id
  where movement.cash_account_id = v_cash_account_id
    and (movement.actor_driver_id is null or movement.actor_driver_id = v_driver_id)
    and movement.movement_type = 'inflow'
    and movement.movement_category = 'service_payment'
    and payment.payment_method = 'cash'
    and payment.payment_status = 'completed'
    and not exists (
      select 1
      from public.cash_movements reversal
      where reversal.original_movement_id = movement.id
        and reversal.movement_category = 'reversal'
    );

  select coalesce(round(sum(
      case
        when remittance.status = 'verified' then coalesce(remittance.verified_amount, remittance.declared_amount)
        else remittance.declared_amount
      end
    ), 2), 0)
    into v_remitted_amount
  from public.cash_remittances remittance
  where remittance.driver_id = v_driver_id
    and remittance.source_cash_account_id = v_cash_account_id
    and remittance.currency_code = v_currency_code
    and remittance.status in ('submitted', 'received', 'verified');

  select
      count(*)::integer,
      coalesce(round(sum(discrepancy.difference_amount), 2), 0),
      coalesce(round(sum(greatest(discrepancy.difference_amount, 0)), 2), 0)
    into
      v_open_discrepancy_count,
      v_open_discrepancy_amount,
      v_excess_under_review_amount
  from public.cash_discrepancies discrepancy
  where discrepancy.cash_account_id = v_cash_account_id
    and discrepancy.currency_code = v_currency_code
    and discrepancy.status in ('open', 'under_review');

  driver_id := v_driver_id;
  currency_code := v_currency_code;
  cash_collected_amount := v_cash_collected_amount;
  remitted_amount := v_remitted_amount;
  select coalesce(sum(available_amount),0) into pending_remittance_amount
  from elara_private.driver_cash_available where cash_account_id=v_cash_account_id;
  open_discrepancy_count := v_open_discrepancy_count;
  open_discrepancy_amount := v_open_discrepancy_amount;
  excess_under_review_amount := v_excess_under_review_amount;

  return next;
end;
$$;
revoke all on all functions in schema elara_private from public,anon,authenticated,service_role;
revoke all on function public.create_driver_cash_remittance(text),public.verify_cash_remittance(uuid,numeric),public.get_driver_cash_finance_summary() from public,anon,authenticated,service_role;
grant execute on function public.create_driver_cash_remittance(text),public.verify_cash_remittance(uuid,numeric),public.get_driver_cash_finance_summary() to authenticated;

-- Serialize reversals at the same account before taking original movement/payment locks.
-- FOR NO KEY UPDATE is compatible with child FK key-share locks from cash collection.

create or replace function public.reverse_cash_movement(p_cash_movement_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_original public.cash_movements%rowtype;
  v_id uuid;
begin
  v_actor := public.require_superadmin_user();
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Cash movement reversal requires a reason.' using errcode = '23514'; end if;
  perform 1 from public.cash_accounts where id=(select cash_account_id from public.cash_movements where id=p_cash_movement_id) for no key update;
  select * into v_original from public.cash_movements where id = p_cash_movement_id for update;
  if not found then raise exception 'Cash movement was not found.' using errcode = '23503'; end if;
  if v_original.movement_category = 'reversal' then raise exception 'A reversal movement cannot be reversed.' using errcode = '23514'; end if;
  if exists (select 1 from public.cash_movements where original_movement_id = p_cash_movement_id and movement_category = 'reversal') then raise exception 'Cash movement has already been reversed.' using errcode = '23514'; end if;

  insert into public.cash_movements (cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, original_movement_id, source_type, source_id, description, metadata, created_by)
  values (v_original.cash_account_id, case when v_original.movement_type='inflow' then 'outflow' else 'inflow' end, 'reversal', v_original.amount, v_original.currency_code, now(), v_original.id, 'cash_movement_reversal', v_original.id, 'Cash movement reversal', jsonb_build_object('reason', p_reason), v_actor)
  returning id into v_id;
  perform public.secure_audit('reversal', 'cash_movements', v_id, null, to_jsonb(v_original), jsonb_build_object('original_movement_id', v_original.id, 'reversal_movement_id', v_id), p_reason, '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;
create or replace function public.reverse_service_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_payment public.service_payments%rowtype;
  v_original public.cash_movements%rowtype;
  v_reversal_id uuid;
begin
  v_actor := public.require_superadmin_user();
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Payment reversal requires a reason.' using errcode = '23514'; end if;
  perform 1 from public.cash_accounts where id in (select cash_account_id from public.cash_movements where service_payment_id=p_payment_id) order by id for no key update;
  select * into v_payment from public.service_payments where id = p_payment_id for update;
  if not found then raise exception 'Service payment was not found.' using errcode = '23503'; end if;
  if v_payment.payment_status <> 'completed' then raise exception 'Only completed service payments can be reversed.' using errcode = '23514'; end if;

  update public.service_payments
     set payment_status = 'reversed', cancelled_at = now(), cancelled_by = v_actor, cancellation_reason = p_reason, updated_by = v_actor
   where id = p_payment_id;
  perform public.recalculate_service_financial(v_payment.service_financial_id);

  select * into v_original from public.cash_movements where service_payment_id = p_payment_id and movement_category = 'service_payment' limit 1;
  if found then
    insert into public.cash_movements (cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, original_movement_id, source_type, source_id, description, metadata, created_by)
    values (v_original.cash_account_id, 'outflow', 'reversal', v_original.amount, v_original.currency_code, now(), v_original.service_id, v_original.service_payment_id, v_original.id, 'service_payment_reversal', p_payment_id, 'Reversal of service payment', jsonb_build_object('reason', p_reason), v_actor)
    returning id into v_reversal_id;
  end if;

  perform public.secure_audit('reversal', 'service_payments', p_payment_id, v_payment.human_code, to_jsonb(v_payment), jsonb_build_object('status','reversed'), p_reason, '{}'::jsonb, v_actor, null);
  return p_payment_id;
end;
$$;


create function elara_private.guard_reserved_cash_outflow() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_c record;v_own numeric:=0;begin
 if new.movement_type<>'outflow' then return new;end if;
 perform 1 from public.cash_accounts where id=new.cash_account_id for no key update;
 select * into v_c from elara_private.driver_cash_coverage where cash_account_id=new.cash_account_id;
 if not found then return new;end if;
 if new.movement_category='remittance_sent' then
  select coalesce(sum(amount),0) into v_own from public.driver_cash_source_allocations where remittance_id=new.remittance_id and status='applied';
 end if;
 if v_c.committed_amount-v_own>0 and v_c.book_balance-new.amount<v_c.committed_amount-v_own then
  raise exception 'Cash outflow would spend reserved cash sources.' using errcode='23514';end if;return new;
end $$;
create trigger guard_reserved_cash_outflow before insert on public.cash_movements for each row execute function elara_private.guard_reserved_cash_outflow();
revoke all on function elara_private.guard_reserved_cash_outflow() from public,anon,authenticated,service_role;

-- Source ownership/currency cannot be changed by editing the holder account after cash history exists.
create function elara_private.guard_cash_account_identity() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 if (new.driver_id is distinct from old.driver_id or new.currency_code is distinct from old.currency_code or new.account_type is distinct from old.account_type)
  and exists(select 1 from public.cash_movements where cash_account_id=old.id) then
  raise exception 'Cash account ownership, type and currency are immutable after cash movements.' using errcode='23514';end if;
 return new;
end $$;
create trigger guard_shared_cash_account_identity before update on public.cash_accounts for each row execute function elara_private.guard_cash_account_identity();
revoke all on function elara_private.guard_cash_account_identity() from public,anon,authenticated,service_role;
