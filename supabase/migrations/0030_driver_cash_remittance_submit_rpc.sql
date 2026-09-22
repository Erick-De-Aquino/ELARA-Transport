-- Migration 0030: driver cash remittance submit RPC.
--
-- Allows an authenticated conductor to submit a cash remittance from their
-- own pending cash service-payment movements. The RPC creates remittance
-- items and advances the remittance to submitted, but does not create
-- remittance_sent or remittance_received cash movements.

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
  for update;

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
  for update;

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
    select movement.id, movement.amount, movement.occurred_at
    from public.cash_movements movement
    join public.service_payments payment
      on payment.id = movement.service_payment_id
    where movement.cash_account_id = v_source_account.id
      and movement.actor_driver_id = v_driver_id
      and movement.movement_type = 'inflow'
      and movement.movement_category = 'service_payment'
      and payment.payment_method = 'cash'
      and payment.payment_status = 'completed'
      and not exists (
        select 1
        from public.cash_movements reversal
        where reversal.original_movement_id = movement.id
          and reversal.movement_category = 'reversal'
      )
      and not exists (
        select 1
        from public.cash_remittance_items item
        join public.cash_remittances remittance
          on remittance.id = item.remittance_id
        where remittance.status <> 'cancelled'
          and (
            item.cash_movement_id = movement.id
            or (item.service_payment_id is not null and item.service_payment_id = movement.service_payment_id)
          )
      )
    order by movement.occurred_at, movement.id
    for update of movement
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
    movement.amount,
    'Driver cash remittance item',
    v_app_user_id
  from public.cash_movements movement
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

comment on function public.create_driver_cash_remittance(text) is
  'Creates and submits a cash remittance for the authenticated conductor from their pending cash service-payment movements. Does not create cash movement transfer rows.';

revoke all on function public.create_driver_cash_remittance(text) from public;
revoke all on function public.create_driver_cash_remittance(text) from anon;
revoke all on function public.create_driver_cash_remittance(text) from authenticated;
revoke all on function public.create_driver_cash_remittance(text) from service_role;

grant execute on function public.create_driver_cash_remittance(text) to authenticated;

do $$
begin
  if to_regprocedure('public.create_driver_cash_remittance(text)') is null then
    raise exception 'Missing function public.create_driver_cash_remittance(text).';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = 'public.create_driver_cash_remittance(text)'::regprocedure
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute public.create_driver_cash_remittance(text).';
  end if;

  if has_function_privilege('anon', 'public.create_driver_cash_remittance(text)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.create_driver_cash_remittance(text).';
  end if;

  if not has_function_privilege('authenticated', 'public.create_driver_cash_remittance(text)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.create_driver_cash_remittance(text).';
  end if;

  if has_function_privilege('service_role', 'public.create_driver_cash_remittance(text)', 'EXECUTE') then
    raise exception 'service_role must not execute public.create_driver_cash_remittance(text).';
  end if;
end;
$$;
