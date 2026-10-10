-- Version 2: completed service entitlement, per-service rounding and shared cash offsets.
-- No historical recalculation/backfill. No workflow or payment RPC is added.
create extension if not exists btree_gist with schema extensions;
alter table public.settlements add column calculation_version smallint not null default 1 check(calculation_version in (1,2));
alter table public.settlements alter column calculation_version set default 2;
alter table public.settlements add column percentage_source text not null default 'legacy_rule' check(percentage_source in ('legacy_rule','per_service'));
alter table public.settlements alter column percentage_source set default 'per_service';
alter table public.settlements add constraint settlements_percentage_source_version check((calculation_version=1 and percentage_source='legacy_rule') or (calculation_version=2 and percentage_source='per_service'));
comment on column public.settlements.driver_percentage is 'Version 1 aggregate percentage; version 2 header rule reference. Dated economic percentages are snapshotted per service item.';
alter table public.settlements add column cash_offset_amount numeric(14,2) not null default 0;
-- Generated expression preserves legacy payable without updating existing rows.
alter table public.settlements add column payable_amount numeric(14,2) generated always as (driver_amount-cash_offset_amount) stored;
alter table public.settlements drop constraint settlements_driver_amount_formula;
alter table public.settlements add constraint settlements_driver_amount_formula check (
 calculation_version=2 or driver_amount=case
 when calculation_method_snapshot='driver_share' then round(calculation_base_amount*driver_percentage/100,2)
 else round(calculation_base_amount-round(calculation_base_amount*elara_percentage/100,2),2) end);
alter table public.settlements drop constraint settlements_pending_formula;
alter table public.settlements add constraint settlements_pending_formula check(pending_amount=payable_amount-paid_amount);
alter table public.settlements drop constraint settlements_not_overpaid;
alter table public.settlements add constraint settlements_not_overpaid check(paid_amount<=payable_amount);
alter table public.settlements add constraint settlements_cash_offset_bounds check(cash_offset_amount>=0 and cash_offset_amount<=driver_amount and (calculation_version=2 or cash_offset_amount=0));
alter table public.settlements add constraint settlements_v2_service_base check(calculation_version=1 or (expense_deduction_amount=0 and adjustment_amount=0 and calculation_base_amount=gross_eligible_amount));

create table public.driver_settlement_overrides (
 id uuid primary key default extensions.gen_random_uuid(),
 driver_id uuid not null references public.drivers(id),
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 driver_percentage numeric(7,4) not null check(driver_percentage between 0 and 100),
 elara_percentage numeric(7,4) not null check(elara_percentage between 0 and 100),
 effective_from date not null,
 effective_to date check(effective_to>=effective_from),
 status text not null default 'active' check(status in ('active','inactive')),
 source text not null check(length(trim(source))>0),
 notes text,
 created_at timestamptz not null default now(),
 created_by uuid not null references public.app_users(id),
 check(driver_percentage+elara_percentage=100),
 exclude using gist (driver_id extensions.gist_uuid_ops with =, currency_code extensions.gist_text_ops with =,
 daterange(effective_from,effective_to,'[]') with &&) where(status='active')
);
alter table public.driver_settlement_overrides enable row level security;
revoke all on public.driver_settlement_overrides from public,anon,authenticated,service_role;
grant select on public.driver_settlement_overrides to authenticated;
create policy settlement_overrides_admin_read on public.driver_settlement_overrides for select to authenticated
 using(public.rls_has_active_context('superadmin') or public.rls_has_active_context('administrativo'));
alter table public.settlement_items add column settlement_override_id uuid references public.driver_settlement_overrides(id);
alter table public.settlement_items add column percentage_source text check(percentage_source in ('settlement_rule','driver_override'));
-- Existing data has one entitlement per service. Index creation fails rather than choosing a winner if that ever differs.
-- Retained across every settlement status, including cancelled/rejected and paid.
create unique index settlement_service_entitlement_unique on public.settlement_items(service_id) where item_type='service_income';

create function elara_private.service_percentage(p_driver uuid,p_date date,p_currency text) returns jsonb
language plpgsql stable security definer set search_path=public,extensions as $$
declare v_o public.driver_settlement_overrides%rowtype; v_r public.settlement_rules%rowtype; v_count integer; begin
 select * into v_o from public.driver_settlement_overrides where driver_id=p_driver and currency_code=p_currency
 and status='active' and effective_from<=p_date and (effective_to is null or effective_to>=p_date);
 if found then return jsonb_build_object('source','driver_override','override_id',v_o.id,'driver_percentage',v_o.driver_percentage,'elara_percentage',v_o.elara_percentage); end if;
 select count(*) into v_count from public.settlement_rules r join public.drivers d on d.driver_type=r.driver_type
 where d.id=p_driver and r.currency_code=p_currency and r.is_active and r.effective_from<=p_date and (r.effective_until is null or r.effective_until>=p_date);
 if v_count<>1 then return jsonb_build_object('blocker','missing_or_ambiguous_percentage_rule'); end if;
 select r.* into v_r from public.settlement_rules r join public.drivers d on d.driver_type=r.driver_type
 where d.id=p_driver and r.currency_code=p_currency and r.is_active and r.effective_from<=p_date and (r.effective_until is null or r.effective_until>=p_date);
 return jsonb_build_object('source','settlement_rule','rule_id',v_r.id,'driver_percentage',v_r.driver_percentage,'elara_percentage',v_r.elara_percentage);
end $$;

create function elara_private.settlement_plan(p_driver uuid,p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path=public,extensions as $$
declare v_d public.drivers%rowtype; v_r public.settlement_rules%rowtype; v_currency text; v_s record; v_percentage jsonb;
 v_reason text; v_items jsonb:='[]';v_excluded jsonb:='[]';v_blockers jsonb:='[]';v_warnings jsonb:='[]';v_reimbursements jsonb;
 v_gross numeric:=0;v_earnings numeric:=0;v_elara numeric:=0;v_cash numeric:=0;v_offset numeric:=0;v_driver_item numeric; begin
 select * into v_d from public.drivers where id=p_driver;
 if not found or v_d.administrative_status<>'active' then v_blockers:=v_blockers||jsonb_build_array('active_driver_required'); end if;
 if p_start is null or p_end is null or p_end<p_start then v_blockers:=v_blockers||jsonb_build_array('invalid_period');
 elsif (v_d.driver_type='internal_driver' and (p_start<>date_trunc('month',p_start)::date or p_end<>(p_start+interval '1 month - 1 day')::date))
 or (v_d.driver_type='external_collaborator' and (extract(isodow from p_start)<>1 or p_end<>p_start+6)) then
  v_blockers:=v_blockers||jsonb_build_array('invalid_natural_period');
 end if;
 select currency_code into v_currency from public.cash_accounts where driver_id=p_driver and account_type='driver' and status='active';
 if v_currency is null then
  select case when count(distinct currency_code)=1 then min(currency_code) end into v_currency from (
   select r.currency_code from public.settlement_rules r where r.driver_type=v_d.driver_type and r.is_active and r.effective_from<=p_end and (r.effective_until is null or r.effective_until>=p_start)
   union select o.currency_code from public.driver_settlement_overrides o where o.driver_id=p_driver and o.status='active' and o.effective_from<=p_end and (o.effective_to is null or o.effective_to>=p_start)
  ) currencies;
  if v_currency is null then v_blockers:=v_blockers||jsonb_build_array('missing_or_ambiguous_currency');end if;
 end if;
 -- Header rule supplies type/frequency/currency metadata. Each service resolves its own dated economic rule/override.
 select * into v_r from public.settlement_rules r where r.driver_type=v_d.driver_type and r.currency_code=v_currency
 order by (r.is_active and r.effective_from<=p_start and (r.effective_until is null or r.effective_until>=p_end)) desc,r.effective_from desc,r.id limit 1;
 if not found then v_blockers:=v_blockers||jsonb_build_array('missing_rule_metadata'); end if;
 if exists(select 1 from public.settlements where driver_id=p_driver and status in ('draft','generated','submitted','approved') and period_start<=p_end and period_end>=p_start) then
  v_blockers:=v_blockers||jsonb_build_array('overlapping_active_settlement');
 end if;
 for v_s in
  select s.id,s.human_code,s.operational_status,f.id financial_id,f.pricing_status,f.total_amount,f.currency_code,f.financial_status,f.paid_amount,f.pending_amount,
   c.id closure_id,c.assignment_id closure_assignment_id,(c.closed_at at time zone 'Europe/Madrid')::date economic_date,
   a.id assignment_id,a.driver_id assignment_driver_id,a.assignment_status,a.accepted_at,
   (select count(*) from public.service_assignments x where x.service_id=s.id and x.assignment_status in ('accepted','ended') and x.accepted_at is not null) assignment_count
  from public.services s left join public.service_financials f on f.service_id=s.id
  left join public.service_closures c on c.service_id=s.id
  left join public.service_assignments a on a.id=c.assignment_id and a.service_id=s.id
  where s.deleted_at is null and exists(select 1 from public.service_assignments x where x.service_id=s.id and x.driver_id=p_driver)
  order by c.closed_at,s.id
 loop
  v_reason:=null;
  if v_s.economic_date is not null and (v_s.economic_date<p_start or v_s.economic_date>p_end) then v_reason:='outside_period';
  elsif v_s.operational_status<>'completed' then v_reason:='service_not_completed';
  elsif v_s.closure_id is null or v_s.assignment_id is null then
   v_reason:='missing_inequivalent_closure_assignment';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason));
  elsif v_s.assignment_count<>1 or v_s.accepted_at is null or v_s.assignment_status not in ('accepted','ended') then
   v_reason:='ambiguous_or_invalid_economic_assignment';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason));
  elsif v_s.assignment_driver_id<>p_driver then v_reason:='other_economic_driver';
  elsif v_s.pricing_status is distinct from 'finalized' or coalesce(v_s.total_amount,0)<=0 then v_reason:='finalized_positive_price_required';
  elsif v_s.currency_code<>v_currency then v_reason:='currency_mismatch';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason));
  elsif exists(select 1 from public.settlement_items where item_type='service_income' and service_id=v_s.id) then v_reason:='service_entitlement_already_consumed';
  end if;
  if v_reason is null then
   v_percentage:=elara_private.service_percentage(p_driver,v_s.economic_date,v_currency);
   if v_percentage ? 'blocker' then v_reason:=v_percentage->>'blocker';v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'reason',v_reason)); end if;
  end if;
  if v_reason is not null then
   v_excluded:=v_excluded||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'human_code',v_s.human_code,'reason',v_reason));continue;
  end if;
  v_driver_item:=round(v_s.total_amount*(v_percentage->>'driver_percentage')::numeric/100,2);
  v_gross:=v_gross+v_s.total_amount;v_earnings:=v_earnings+v_driver_item;v_elara:=v_elara+v_s.total_amount-v_driver_item;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('service_id',v_s.id,'human_code',v_s.human_code,'assignment_id',v_s.assignment_id,'closure_id',v_s.closure_id,
   'financial_id',v_s.financial_id,'economic_date',v_s.economic_date,'service_price',v_s.total_amount,'percentage',v_percentage,
   'driver_amount',v_driver_item,'elara_amount',v_s.total_amount-v_driver_item,'currency_code',v_currency,
   'cx_c',jsonb_build_object('financial_status',v_s.financial_status,'paid_amount',v_s.paid_amount,'pending_amount',v_s.pending_amount)));
 end loop;
 select coalesce(sum(a.available_amount),0) into v_cash from elara_private.driver_cash_available a join public.cash_accounts c on c.id=a.cash_account_id
 where a.driver_id=p_driver and a.currency_code=v_currency and c.status='active';
 if v_cash>(select coalesce(sum(greatest(x.book_balance-x.committed_amount,0)),0) from elara_private.driver_cash_coverage x join public.cash_accounts c on c.id=x.cash_account_id where c.driver_id=p_driver and c.status='active' and c.currency_code=v_currency) then
  v_blockers:=v_blockers||jsonb_build_array('cash_sources_require_reconciliation_with_account_movements');end if;
 v_offset:=least(v_earnings,v_cash);
 if exists(select 1 from public.cash_remittances r where r.driver_id=p_driver and r.source_model_version=1 and r.status<>'cancelled') then
  v_warnings:=v_warnings||jsonb_build_array('legacy_remittance_sources_excluded_without_reconstructing_differences');
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('expense_id',e.id,'human_code',e.human_code,'amount',e.total_amount,'currency_code',e.currency_code,'reimbursement_status',e.reimbursement_status)), '[]') into v_reimbursements
 from public.expenses e where e.advanced_by_driver_id=p_driver and e.payment_responsibility='driver_advance' and e.status='approved' and e.reimbursable;
 return jsonb_build_object('driver',jsonb_build_object('id',v_d.id,'human_code',v_d.human_code,'type',v_d.driver_type),
 'period_start',p_start,'period_end',p_end,'timezone','Europe/Madrid','currency_code',v_currency,'header_rule',to_jsonb(v_r),
 'percentage_source','per_service','eligible_services',v_items,'excluded_services',v_excluded,'gross_service_amount',v_gross,
 'driver_earnings_amount',v_earnings,'elara_amount',v_elara,'compensable_cash_available',v_cash,'cash_offset_proposed',v_offset,
 'remaining_cash_to_remit',v_cash-v_offset,'payable_amount',v_earnings-v_offset,'reimbursements_informational',v_reimbursements,'warnings',v_warnings,'blockers',v_blockers);
end $$;

create function public.preview_settlement_generation(p_driver_id uuid,p_period_start date,p_period_end date) returns jsonb
language plpgsql stable security definer set search_path=public,extensions as $$
begin perform public.require_admin_user();return elara_private.settlement_plan(p_driver_id,p_period_start,p_period_end);end $$;

create or replace function public.generate_settlement(p_driver_id uuid,p_period_start date,p_period_end date,p_notes text default null) returns uuid
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid;v_plan jsonb;v_id uuid;v_item jsonb;v_source record;v_remaining numeric;v_rule public.settlement_rules%rowtype;begin
 v_actor:=public.require_admin_user();
 if p_notes ~ '<[[:alpha:]/][^>]*>' then raise exception 'Settlement notes cannot contain HTML.' using errcode='23514';end if;
 perform 1 from public.drivers where id=p_driver_id for update;
 -- Account before sources: shared with remittance. No central-account lock is needed for offset.
 perform 1 from public.cash_accounts where driver_id=p_driver_id and account_type='driver' order by id for no key update;
 perform 1 from public.settlements where driver_id=p_driver_id order by id for update;
 -- Parent service locks also serialize competing entitlement claims and child FK insertion.
 perform 1 from public.services s where exists(select 1 from public.service_assignments a where a.service_id=s.id and a.driver_id=p_driver_id) order by s.id for update;
 perform 1 from public.service_assignments a where exists(select 1 from public.service_assignments x where x.service_id=a.service_id and x.driver_id=p_driver_id) order by a.id for update;
 perform 1 from public.service_closures c where exists(select 1 from public.service_assignments a where a.service_id=c.service_id and a.driver_id=p_driver_id) order by c.id for update;
 perform 1 from public.service_financials f where exists(select 1 from public.service_assignments a where a.service_id=f.service_id and a.driver_id=p_driver_id) order by f.id for update;
 perform 1 from public.settlement_rules r where r.driver_type=(select driver_type from public.drivers where id=p_driver_id) order by r.id for share;
 perform 1 from public.driver_settlement_overrides where driver_id=p_driver_id order by id for share;
 v_plan:=elara_private.settlement_plan(p_driver_id,p_period_start,p_period_end);
 if jsonb_array_length(v_plan->'blockers')>0 then raise exception 'Settlement generation blocked: %',v_plan->'blockers' using errcode='23514';end if;
 if jsonb_array_length(v_plan->'eligible_services')=0 then raise exception 'No eligible unconsumed completed services.' using errcode='23514';end if;
 select * into v_rule from public.settlement_rules where id=(v_plan->'header_rule'->>'id')::uuid;
 insert into public.settlements(driver_id,settlement_rule_id,driver_type_snapshot,frequency_snapshot,calculation_method_snapshot,period_start,period_end,currency_code,driver_percentage,elara_percentage,status,notes,created_by,updated_by)
 values(p_driver_id,v_rule.id,v_rule.driver_type,v_rule.frequency,v_rule.calculation_method,p_period_start,p_period_end,v_rule.currency_code,v_rule.driver_percentage,v_rule.elara_percentage,'draft',p_notes,v_actor,v_actor) returning id into v_id;
 for v_item in select value from jsonb_array_elements(v_plan->'eligible_services') loop
  insert into public.settlement_items(settlement_id,item_type,service_id,service_assignment_id,service_financial_id,settlement_override_id,percentage_source,description,occurred_on,gross_amount,driver_percentage_snapshot,elara_percentage_snapshot,snapshot_data,created_by)
  values(v_id,'service_income',(v_item->>'service_id')::uuid,(v_item->>'assignment_id')::uuid,(v_item->>'financial_id')::uuid,(v_item->'percentage'->>'override_id')::uuid,v_item->'percentage'->>'source',
   'Service '||(v_item->>'human_code'),(v_item->>'economic_date')::date,(v_item->>'service_price')::numeric,(v_item->'percentage'->>'driver_percentage')::numeric,(v_item->'percentage'->>'elara_percentage')::numeric,v_item,v_actor);
 end loop;
 v_remaining:=(v_plan->>'cash_offset_proposed')::numeric;
 for v_source in select a.* from elara_private.driver_cash_available a join public.cash_accounts c on c.id=a.cash_account_id
  where a.driver_id=p_driver_id and a.currency_code=v_rule.currency_code and c.status='active' and a.available_amount>0 order by a.occurred_at,a.cash_movement_id loop
  exit when v_remaining=0;
  insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,settlement_id,amount,status,created_by,updated_by)
  values(v_source.cash_movement_id,p_driver_id,v_source.cash_account_id,v_rule.currency_code,'settlement_offset',v_id,least(v_source.available_amount,v_remaining),'reserved',v_actor,v_actor);
  v_remaining:=greatest(v_remaining-v_source.available_amount,0);
 end loop;
 if v_remaining<>0 then raise exception 'Cash availability changed during generation.' using errcode='40001';end if;
 perform public.recalculate_settlement(v_id);
 update public.settlements set status='generated',generated_at=now(),updated_by=v_actor where id=v_id;
 perform public.secure_audit('insert','settlements',v_id,(select human_code from public.settlements where id=v_id),null,(select to_jsonb(s) from public.settlements s where id=v_id),
 'Settlement generated from unique service entitlements and shared cash sources.',jsonb_build_object('operation','admin_settlement_generated','calculation_version',2,'plan',v_plan),v_actor,p_driver_id);
 return v_id;
end $$;

-- Offsets remain RESERVED: no money leaves a cash account at generation.
-- Reservations survive rejection/cancellation; an explicit future reconciliation must decide release/application.
-- This keeps remittances from using those euros, without changing the raw cash-movement balance.
comment on column public.settlements.cash_offset_amount is 'Reserved compensation against driver earnings. No physical cash movement; never automatically released by settlement status changes.';
comment on column public.settlements.driver_amount is 'Legacy calculated driver amount (v1); sum of rounded per-service driver earnings (v2), before cash compensation.';

create or replace function public.prepare_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.settlement_rules%rowtype;
  v_driver public.drivers%rowtype;
  v_recalculate_allowed boolean;
  v_superadmin_cancel_allowed boolean;
  v_has_items boolean;
  v_active_statuses constant text[] := array['draft', 'generated', 'submitted', 'approved'];
begin
  if tg_op = 'INSERT' then
    if new.calculation_version<>2 then raise exception 'New settlements require calculation version 2.' using errcode='23514';end if;
    if new.status <> 'draft' then
      raise exception 'Settlements must be created in draft status.'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.percentage_source<>old.percentage_source then raise exception 'Percentage source is immutable.' using errcode='23514';end if;
    if new.calculation_version<>old.calculation_version then raise exception 'Calculation version is immutable.' using errcode='23514';end if;
    if new.cash_offset_amount is distinct from old.cash_offset_amount and current_setting('elara.settlement_recalculate',true) is distinct from old.id::text then
     raise exception 'Cash offset must be changed through recalculation.' using errcode='42501';end if;
    v_recalculate_allowed := current_setting('elara.settlement_recalculate', true) is not distinct from old.id::text;
    v_superadmin_cancel_allowed := current_setting('elara.settlement_superadmin_cancel', true) is not distinct from old.id::text;

    if old.status in ('rejected', 'cancelled') and not v_recalculate_allowed then
      raise exception 'Rejected and cancelled settlements cannot be edited or reactivated.'
        using errcode = '23514';
    end if;

    if old.status = 'approved' and not v_recalculate_allowed then
      if not (
        v_superadmin_cancel_allowed
        and new.status = 'cancelled'
        and new.cancelled_at is not null
        and new.cancelled_by is not null
        and length(trim(coalesce(new.cancellation_reason, ''))) > 0
        and new.human_code is not distinct from old.human_code
        and new.driver_id is not distinct from old.driver_id
        and new.settlement_rule_id is not distinct from old.settlement_rule_id
        and new.driver_type_snapshot is not distinct from old.driver_type_snapshot
        and new.frequency_snapshot is not distinct from old.frequency_snapshot
        and new.calculation_method_snapshot is not distinct from old.calculation_method_snapshot
        and new.period_start is not distinct from old.period_start
        and new.period_end is not distinct from old.period_end
        and new.currency_code is not distinct from old.currency_code
        and new.gross_eligible_amount is not distinct from old.gross_eligible_amount
        and new.expense_deduction_amount is not distinct from old.expense_deduction_amount
        and new.adjustment_amount is not distinct from old.adjustment_amount
        and new.calculation_base_amount is not distinct from old.calculation_base_amount
        and new.driver_percentage is not distinct from old.driver_percentage
        and new.elara_percentage is not distinct from old.elara_percentage
        and new.driver_amount is not distinct from old.driver_amount
        and new.elara_amount is not distinct from old.elara_amount
        and new.paid_amount is not distinct from old.paid_amount
        and new.pending_amount is not distinct from old.pending_amount
        and new.generated_at is not distinct from old.generated_at
        and new.submitted_at is not distinct from old.submitted_at
        and new.approved_at is not distinct from old.approved_at
        and new.approved_by is not distinct from old.approved_by
        and new.rejected_at is not distinct from old.rejected_at
        and new.rejected_by is not distinct from old.rejected_by
        and new.rejection_reason is not distinct from old.rejection_reason
        and new.notes is not distinct from old.notes
        and new.internal_notes is not distinct from old.internal_notes
      ) then
        raise exception 'Approved settlements can only be cancelled through the future Superadmin secure function.'
          using errcode = '23514';
      end if;
    end if;

    if (old.status <> 'draft' or (old.calculation_version=2 and exists(select 1 from public.settlement_items where settlement_id=old.id))) and not v_recalculate_allowed then
      if new.driver_id is distinct from old.driver_id
        or new.settlement_rule_id is distinct from old.settlement_rule_id
        or new.driver_type_snapshot is distinct from old.driver_type_snapshot
        or new.frequency_snapshot is distinct from old.frequency_snapshot
        or new.calculation_method_snapshot is distinct from old.calculation_method_snapshot
        or new.period_start is distinct from old.period_start
        or new.period_end is distinct from old.period_end
        or new.currency_code is distinct from old.currency_code
        or new.driver_percentage is distinct from old.driver_percentage
        or new.elara_percentage is distinct from old.elara_percentage
      then
        raise exception 'Driver, rule, period, currency and percentage snapshots cannot change after generated status.'
          using errcode = '23514';
      end if;
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'draft' and new.status in ('generated', 'cancelled'))
        or (old.status = 'generated' and new.status in ('submitted', 'cancelled'))
        or (old.status = 'submitted' and new.status in ('approved', 'rejected', 'cancelled'))
        or (old.status = 'approved' and new.status = 'cancelled' and v_superadmin_cancel_allowed)
      ) then
        raise exception 'Invalid settlement status transition from % to %.', old.status, new.status
          using errcode = '23514';
      end if;
    end if;
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  select * into v_rule
  from public.settlement_rules rule
  where rule.id = new.settlement_rule_id;

  if not found then
    raise exception 'Settlement references a missing settlement rule.'
      using errcode = '23503';
  end if;

  select * into v_driver
  from public.drivers driver
  where driver.id = new.driver_id;

  if not found then
    raise exception 'Settlement references a missing driver.'
      using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    new.driver_type_snapshot := v_rule.driver_type;
    new.frequency_snapshot := v_rule.frequency;
    new.calculation_method_snapshot := v_rule.calculation_method;
    new.driver_percentage := v_rule.driver_percentage;
    new.elara_percentage := v_rule.elara_percentage;
    new.currency_code := v_rule.currency_code;
  end if;

  if new.driver_type_snapshot <> v_driver.driver_type then
    raise exception 'Settlement driver_type snapshot must match the driver.'
      using errcode = '23514';
  end if;

  if new.driver_type_snapshot <> v_rule.driver_type
    or new.frequency_snapshot <> v_rule.frequency
    or new.calculation_method_snapshot <> v_rule.calculation_method
    or new.currency_code <> v_rule.currency_code
  then
    raise exception 'Settlement snapshots must match the selected settlement rule.'
      using errcode = '23514';
  end if;

  if new.status in ('generated', 'submitted', 'approved') and v_driver.administrative_status <> 'active' then
    raise exception 'Generated, submitted or approved settlements require an active driver.'
      using errcode = '23514';
  end if;

  if new.driver_type_snapshot = 'internal_driver' then
    if new.frequency_snapshot <> 'monthly'
      or new.period_start <> date_trunc('month', new.period_start)::date
      or new.period_end <> (date_trunc('month', new.period_start)::date + interval '1 month - 1 day')::date
    then
      raise exception 'Internal driver settlements require a complete natural month period.'
        using errcode = '23514';
    end if;
  elsif new.driver_type_snapshot = 'external_collaborator' then
    if new.frequency_snapshot <> 'weekly' or new.period_end <> new.period_start + 6 or (new.calculation_version=2 and extract(isodow from new.period_start)<>1) then
      raise exception 'External collaborator settlements require an inclusive seven-day period.'
        using errcode = '23514';
    end if;
  end if;

  if new.approved_by is not null and not public.settlement_app_user_is_active(new.approved_by) then
    raise exception 'Settlement approved_by must reference an active app user.'
      using errcode = '23514';
  end if;
  if new.rejected_by is not null and not public.settlement_app_user_is_active(new.rejected_by) then
    raise exception 'Settlement rejected_by must reference an active app user.'
      using errcode = '23514';
  end if;
  if new.cancelled_by is not null and not public.settlement_app_user_is_active(new.cancelled_by) then
    raise exception 'Settlement cancelled_by must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.status in ('generated', 'submitted', 'approved') then
    select exists (
      select 1 from public.settlement_items item where item.settlement_id = new.id
    ) into v_has_items;

    if not v_has_items then
      raise exception 'Generated, submitted or approved settlements require at least one settlement item.'
        using errcode = '23514';
    end if;
  end if;

  if new.status = any(v_active_statuses) and exists (
    select 1
    from public.settlements other
    where other.id <> new.id
      and other.driver_id = new.driver_id
      and other.status = any(v_active_statuses)
      and other.period_start <= new.period_end
      and new.period_start <= other.period_end
  ) then
    raise exception 'A driver cannot have overlapping active settlements.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.validate_settlement_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement public.settlements%rowtype;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_financial public.service_financials%rowtype;
  v_expense public.expenses%rowtype;
  v_item_date date;
  v_item_effect numeric(14, 2);
  v_item_net_effect numeric(14, 2);
  v_percentage jsonb;
begin
  if tg_op = 'DELETE' then
    select * into v_settlement from public.settlements settlement where settlement.id = old.settlement_id;
    if v_settlement.calculation_version=2 then raise exception 'Version 2 service entitlements cannot be deleted.' using errcode='23514';end if;
    if v_settlement.status <> 'draft' then
      raise exception 'Settlement items cannot be deleted after the settlement leaves draft.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  select * into v_settlement from public.settlements settlement where settlement.id = new.settlement_id;
  if not found then
    raise exception 'Settlement item references a missing settlement.'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' then
    select * into v_settlement from public.settlements settlement where settlement.id = old.settlement_id;
    if v_settlement.calculation_version=2 then raise exception 'Version 2 service entitlements are immutable.' using errcode='23514';end if;
    if v_settlement.status <> 'draft' then
      raise exception 'Settlement items cannot be updated after the settlement leaves draft.'
        using errcode = '23514';
    end if;
    select * into v_settlement from public.settlements settlement where settlement.id = new.settlement_id;
  end if;

  if v_settlement.status <> 'draft' then
    raise exception 'Settlement items can only be inserted or edited while the settlement is draft.'
      using errcode = '23514';
  end if;

  if v_settlement.calculation_version=2 and new.item_type<>'service_income' then raise exception 'Version 2 accepts service earnings only.' using errcode='23514';end if;
  new.description := trim(new.description);
  new.gross_amount := round(coalesce(new.gross_amount, 0), 2);
  new.deduction_amount := round(coalesce(new.deduction_amount, 0), 2);
  new.adjustment_amount := round(coalesce(new.adjustment_amount, 0), 2);
  new.driver_percentage_snapshot := coalesce(new.driver_percentage_snapshot, v_settlement.driver_percentage);
  new.elara_percentage_snapshot := coalesce(new.elara_percentage_snapshot, v_settlement.elara_percentage);
  new.snapshot_data := coalesce(new.snapshot_data, '{}'::jsonb);

  if v_settlement.calculation_version=1 and (new.driver_percentage_snapshot <> v_settlement.driver_percentage
    or new.elara_percentage_snapshot <> v_settlement.elara_percentage)
  then
    raise exception 'Settlement item percentage snapshots must match the settlement percentage snapshots.'
      using errcode = '23514';
  end if;

  if new.item_type = 'service_income' then
    select * into v_service from public.services service where service.id = new.service_id;
    if not found then
      raise exception 'Settlement service item references a missing service.'
        using errcode = '23503';
    end if;

    if (v_settlement.calculation_version=2 and v_service.operational_status<>'completed') or v_service.operational_status not in ('completed', 'no_show', 'not_performed') then
      raise exception 'Only completed, no-show or not-performed services can be included in settlements.'
        using errcode = '23514';
    end if;

    select * into v_assignment
    from public.service_assignments assignment
    where assignment.id = new.service_assignment_id;

    if not found then
      raise exception 'Settlement service item references a missing service assignment.'
        using errcode = '23503';
    end if;

    if v_assignment.service_id <> new.service_id or v_assignment.driver_id <> v_settlement.driver_id then
      raise exception 'Settlement service item assignment must belong to the settlement driver and service.'
        using errcode = '23514';
    end if;

    select * into v_financial from public.service_financials financial where financial.id = new.service_financial_id;
    if not found then
      raise exception 'Settlement service item references a missing service financial row.'
        using errcode = '23503';
    end if;

    if v_financial.service_id <> new.service_id then
      raise exception 'Settlement service financial row must belong to the referenced service.'
        using errcode = '23514';
    end if;

    if v_financial.pricing_status <> 'finalized' then
      raise exception 'Settlement services require finalized service financials.'
        using errcode = '23514';
    end if;

    if v_financial.currency_code <> v_settlement.currency_code then
      raise exception 'Settlement service item currency must match the settlement currency.'
        using errcode = '23514';
    end if;

    select coalesce(closure.closed_at::date, v_service.scheduled_start_at::date)
    into v_item_date
    from public.services service
    left join public.service_closures closure on closure.service_id = service.id
    where service.id = new.service_id;

    if v_settlement.calculation_version=2 then
     select (c.closed_at at time zone 'Europe/Madrid')::date into v_item_date from public.service_closures c
      where c.service_id=new.service_id and c.assignment_id=new.service_assignment_id;
     if v_item_date is null or v_assignment.accepted_at is null or v_assignment.assignment_status not in ('accepted','ended')
      or (select count(*) from public.service_assignments a where a.service_id=new.service_id and a.assignment_status in ('accepted','ended') and a.accepted_at is not null)<>1 then
      raise exception 'Unique economic assignment and explicit actual closure required.' using errcode='23514';end if;
     if new.gross_amount<>v_financial.total_amount or v_financial.total_amount<=0 then raise exception 'Service price snapshot must equal finalized total.' using errcode='23514';end if;
     v_percentage:=elara_private.service_percentage(v_settlement.driver_id,v_item_date,v_settlement.currency_code);
     if v_percentage ? 'blocker' or new.driver_percentage_snapshot<>(v_percentage->>'driver_percentage')::numeric
       or new.elara_percentage_snapshot<>(v_percentage->>'elara_percentage')::numeric
       or new.settlement_override_id is distinct from (v_percentage->>'override_id')::uuid
       or new.percentage_source is distinct from v_percentage->>'source' then
      raise exception 'Invalid dated percentage source or snapshot.' using errcode='23514';end if;
     new.occurred_on:=v_item_date;
    end if;
    new.occurred_on := coalesce(new.occurred_on, v_item_date);

    if new.occurred_on < v_settlement.period_start or new.occurred_on > v_settlement.period_end then
      raise exception 'Settlement service item date must be inside the settlement period.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.settlement_items other_item
      join public.settlements other_settlement on other_settlement.id = other_item.settlement_id
      where other_item.id <> new.id
        and other_item.item_type = 'service_income'
        and other_item.service_id = new.service_id
        and other_item.service_assignment_id = new.service_assignment_id
        and other_settlement.driver_id = v_settlement.driver_id
        and other_settlement.status in ('draft', 'generated', 'submitted', 'approved')
    ) then
      raise exception 'Service assignment is already included in an active settlement for this driver.'
        using errcode = '23514';
    end if;

    if new.gross_amount <= 0 then
      new.gross_amount := v_financial.total_amount;
    end if;
    new.deduction_amount := 0;
    new.adjustment_amount := 0;
    new.eligible_amount := new.gross_amount;
  elsif new.item_type = 'expense_deduction' then
    select * into v_expense from public.expenses expense where expense.id = new.expense_id;
    if not found then
      raise exception 'Settlement expense item references a missing expense.'
        using errcode = '23503';
    end if;

    if v_expense.status <> 'approved' then
      raise exception 'Only approved expenses can be deducted in settlements.'
        using errcode = '23514';
    end if;

    if v_expense.currency_code <> v_settlement.currency_code then
      raise exception 'Settlement expense item currency must match the settlement currency.'
        using errcode = '23514';
    end if;

    if v_expense.driver_id is not null and v_expense.driver_id <> v_settlement.driver_id then
      raise exception 'Driver-specific expenses can only be included in that driver settlement.'
        using errcode = '23514';
    end if;

    new.occurred_on := coalesce(new.occurred_on, v_expense.expense_date);
    if new.occurred_on < v_settlement.period_start or new.occurred_on > v_settlement.period_end then
      raise exception 'Settlement expense item date must be inside the settlement period.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.settlement_items other_item
      join public.settlements other_settlement on other_settlement.id = other_item.settlement_id
      where other_item.id <> new.id
        and other_item.item_type = 'expense_deduction'
        and other_item.expense_id = new.expense_id
        and other_settlement.status in ('draft', 'generated', 'submitted', 'approved')
    ) then
      raise exception 'Expense is already included in an active settlement.'
        using errcode = '23514';
    end if;

    if new.deduction_amount <= 0 then
      new.deduction_amount := v_expense.total_amount;
    end if;
    new.gross_amount := 0;
    new.adjustment_amount := 0;
    new.eligible_amount := new.deduction_amount;
  elsif new.item_type in ('positive_adjustment', 'negative_adjustment') then
    new.gross_amount := 0;
    new.deduction_amount := 0;
    new.eligible_amount := abs(new.adjustment_amount);
  elsif new.item_type = 'other' then
    v_item_net_effect := round(new.gross_amount - new.deduction_amount + new.adjustment_amount, 2);
    if v_item_net_effect = 0 then
      raise exception 'Other settlement items must have a non-zero net financial impact.'
        using errcode = '23514';
    end if;
    new.eligible_amount := abs(v_item_net_effect);
  end if;

  v_item_effect := case
    when new.item_type = 'service_income' then new.gross_amount
    when new.item_type = 'expense_deduction' then new.deduction_amount
    when new.item_type = 'other' then abs(round(new.gross_amount - new.deduction_amount + new.adjustment_amount, 2))
    else abs(new.adjustment_amount)
  end;

  if v_settlement.calculation_version=2 or v_settlement.calculation_method_snapshot = 'driver_share' then
    new.driver_amount_snapshot := round(v_item_effect * new.driver_percentage_snapshot / 100, 2);
    new.elara_amount_snapshot := round(v_item_effect - new.driver_amount_snapshot, 2);
  else
    new.elara_amount_snapshot := round(v_item_effect * new.elara_percentage_snapshot / 100, 2);
    new.driver_amount_snapshot := round(v_item_effect - new.elara_amount_snapshot, 2);
  end if;

  if new.snapshot_data = '{}'::jsonb then
    new.snapshot_data := jsonb_build_object(
      'item_type', new.item_type,
      'source_reference', new.source_reference,
      'description', new.description,
      'occurred_on', new.occurred_on,
      'gross_amount', new.gross_amount,
      'deduction_amount', new.deduction_amount,
      'adjustment_amount', new.adjustment_amount,
      'driver_percentage', new.driver_percentage_snapshot,
      'elara_percentage', new.elara_percentage_snapshot
    );
  end if;

  return new;
end;
$$;

create or replace function elara_private.recalculate_settlement_legacy(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement public.settlements%rowtype;
  v_gross numeric(14, 2);
  v_deduction numeric(14, 2);
  v_adjustment numeric(14, 2);
  v_base numeric(14, 2);
  v_driver_amount numeric(14, 2);
  v_elara_amount numeric(14, 2);
  v_paid_amount numeric(14, 2);
  v_pending_amount numeric(14, 2);
  v_payment_status text;
begin
  if p_settlement_id is null then
    raise exception 'Settlement recalculation requires a settlement id.'
      using errcode = '22004';
  end if;

  select * into v_settlement
  from public.settlements settlement
  where settlement.id = p_settlement_id
  for update;

  if not found then
    raise exception 'Settlement not found for recalculation.'
      using errcode = '23503';
  end if;

  select
    round(coalesce(sum(case when item.item_type in ('service_income', 'other') then item.gross_amount else 0 end), 0), 2),
    round(coalesce(sum(case when item.item_type in ('expense_deduction', 'other') then item.deduction_amount else 0 end), 0), 2),
    round(coalesce(sum(case when item.item_type in ('positive_adjustment', 'negative_adjustment', 'other') then item.adjustment_amount else 0 end), 0), 2)
  into v_gross, v_deduction, v_adjustment
  from public.settlement_items item
  where item.settlement_id = p_settlement_id;

  v_base := greatest(round(v_gross - v_deduction + v_adjustment, 2), 0);

  if v_settlement.calculation_method_snapshot = 'driver_share' then
    v_driver_amount := round(v_base * v_settlement.driver_percentage / 100, 2);
    v_elara_amount := round(v_base - v_driver_amount, 2);
  else
    v_elara_amount := round(v_base * v_settlement.elara_percentage / 100, 2);
    v_driver_amount := round(v_base - v_elara_amount, 2);
  end if;

  select round(coalesce(sum(payment.amount), 0), 2)
  into v_paid_amount
  from public.settlement_payments payment
  where payment.settlement_id = p_settlement_id
    and payment.payment_status = 'completed';

  if v_paid_amount > v_driver_amount then
    raise exception 'Completed settlement payments cannot exceed the driver amount.'
      using errcode = '23514';
  end if;

  v_pending_amount := round(v_driver_amount - v_paid_amount, 2);

  if v_settlement.status = 'cancelled' then
    v_payment_status := 'cancelled';
  elsif v_pending_amount = 0 then
    v_payment_status := 'paid';
  elsif v_paid_amount = 0 and v_driver_amount > 0 then
    v_payment_status := 'unpaid';
  elsif v_paid_amount > 0 and v_pending_amount > 0 then
    v_payment_status := 'partial';
  else
    v_payment_status := 'unpaid';
  end if;

  perform set_config('elara.settlement_recalculate', p_settlement_id::text, true);

  update public.settlements
  set gross_eligible_amount = v_gross,
      expense_deduction_amount = v_deduction,
      adjustment_amount = v_adjustment,
      calculation_base_amount = v_base,
      driver_amount = v_driver_amount,
      elara_amount = v_elara_amount,
      paid_amount = v_paid_amount,
      pending_amount = v_pending_amount,
      payment_status = v_payment_status,
      updated_at = now()
  where id = p_settlement_id;

  perform set_config('elara.settlement_recalculate', '', true);
end;
$$;


create or replace function public.recalculate_settlement(p_settlement_id uuid) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare v_s public.settlements%rowtype;v_gross numeric;v_driver numeric;v_elara numeric;v_cash numeric;v_paid numeric;v_payable numeric;v_marker text;begin
 select * into v_s from public.settlements where id=p_settlement_id for update;
 if not found then raise exception 'Settlement not found.' using errcode='23503';end if;
 if v_s.calculation_version=1 then perform elara_private.recalculate_settlement_legacy(p_settlement_id);return;end if;
 select coalesce(sum(gross_amount),0),coalesce(sum(driver_amount_snapshot),0),coalesce(sum(elara_amount_snapshot),0)
 into v_gross,v_driver,v_elara from public.settlement_items where settlement_id=p_settlement_id and item_type='service_income';
 select coalesce(sum(amount),0) into v_cash from public.driver_cash_source_allocations where settlement_id=p_settlement_id and status<>'released';
 select coalesce(sum(amount),0) into v_paid from public.settlement_payments where settlement_id=p_settlement_id and payment_status='completed';
 v_payable:=v_driver-v_cash;
 if v_cash>v_driver or v_paid>v_payable then raise exception 'Offset or payments exceed driver earnings/payable.' using errcode='23514';end if;
 v_marker:=current_setting('elara.settlement_recalculate',true);
 perform set_config('elara.settlement_recalculate',p_settlement_id::text,true);
 update public.settlements set gross_eligible_amount=v_gross,expense_deduction_amount=0,adjustment_amount=0,calculation_base_amount=v_gross,
 driver_amount=v_driver,elara_amount=v_elara,cash_offset_amount=v_cash,paid_amount=v_paid,pending_amount=v_payable-v_paid,
 payment_status=case when status='cancelled' then 'cancelled' when v_payable-v_paid=0 then 'paid' when v_paid=0 then 'unpaid' else 'partial' end
 where id=p_settlement_id;
 perform set_config('elara.settlement_recalculate',coalesce(v_marker,''),true);
end $$;

create function elara_private.check_settlement_economics() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid;v_s public.settlements%rowtype;v_gross numeric;v_driver numeric;v_elara numeric;v_cash numeric;begin
 if TG_TABLE_NAME='settlements' then v_id:=new.id;else v_id:=new.settlement_id;end if;
 if v_id is null then return null;end if;
 select * into v_s from public.settlements where id=v_id;
 if v_s.calculation_version=1 then return null;end if;
 select coalesce(sum(gross_amount),0),coalesce(sum(driver_amount_snapshot),0),coalesce(sum(elara_amount_snapshot),0)
 into v_gross,v_driver,v_elara from public.settlement_items where settlement_id=v_id;
 select coalesce(sum(amount),0) into v_cash from public.driver_cash_source_allocations where settlement_id=v_id and status<>'released';
 if v_s.gross_eligible_amount<>v_gross or v_s.driver_amount<>v_driver or v_s.elara_amount<>v_elara or v_s.cash_offset_amount<>v_cash then
  raise exception 'Settlement totals must match immutable items and structural cash reservations.' using errcode='23514';end if;return null;
end $$;
create constraint trigger check_settlement_economics_header after insert or update on public.settlements deferrable initially deferred
 for each row execute function elara_private.check_settlement_economics();
create constraint trigger check_settlement_economics_items after insert or update on public.settlement_items deferrable initially deferred
 for each row execute function elara_private.check_settlement_economics();
create constraint trigger check_settlement_economics_cash after insert or update on public.driver_cash_source_allocations deferrable initially deferred
 for each row execute function elara_private.check_settlement_economics();

create function elara_private.guard_settlement_override() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 if TG_OP='DELETE' then raise exception 'Settlement overrides use a soft lifecycle.' using errcode='23514';end if;
 perform 1 from public.drivers where id=new.driver_id for update;
 if TG_OP='UPDATE' and exists(select 1 from public.settlement_items where settlement_override_id=old.id)
  and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
  raise exception 'Referenced override economic history is immutable.' using errcode='23514';end if;
 return new;
end $$;
create trigger guard_settlement_override before insert or update or delete on public.driver_settlement_overrides for each row execute function elara_private.guard_settlement_override();

revoke all on all functions in schema elara_private from public,anon,authenticated,service_role;
revoke all on function public.preview_settlement_generation(uuid,date,date),public.generate_settlement(uuid,date,date,text) from public,anon,authenticated,service_role;
grant execute on function public.preview_settlement_generation(uuid,date,date),public.generate_settlement(uuid,date,date,text) to authenticated;



create function elara_private.audit_settlement_override() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 perform public.secure_audit(case when TG_OP='INSERT' then 'insert' else 'update' end,'driver_settlement_overrides',new.id,null,
 case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),'Settlement percentage override.',
 jsonb_build_object('operation','driver_settlement_override'),coalesce(public.rls_current_app_user_id(),new.created_by),new.driver_id);return new;
end $$;
create trigger audit_settlement_override after insert or update on public.driver_settlement_overrides for each row execute function elara_private.audit_settlement_override();
revoke all on all functions in schema elara_private from public,anon,authenticated,service_role;
