-- Migration 0034: admin cash remittance verification RPC.
--
-- Replaces the previously blocked verify_cash_remittance(uuid, numeric)
-- implementation with the real administrative verification workflow.

create unique index if not exists cash_movements_one_remittance_transfer_per_account_idx
  on public.cash_movements (remittance_id, movement_category, cash_account_id)
  where movement_category in ('remittance_sent', 'remittance_received');

drop function if exists public.verify_cash_remittance(uuid, numeric);

create function public.verify_cash_remittance(
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
  for update;

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
  for update;

  if not found then
    raise exception 'Cash remittance % references a missing source cash account.', v_remittance_before.human_code
      using errcode = '23503';
  end if;

  select *
    into v_destination_account
  from public.cash_accounts account
  where account.id = v_remittance_before.destination_cash_account_id
  for update;

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
  for update;

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

comment on function public.verify_cash_remittance(uuid, numeric) is
  'Administratively verifies a received cash remittance, creates the append-only remittance cash movements, and quantifies any open discrepancy.';

revoke all on function public.verify_cash_remittance(uuid, numeric) from public;
revoke all on function public.verify_cash_remittance(uuid, numeric) from anon;
revoke all on function public.verify_cash_remittance(uuid, numeric) from authenticated;
revoke all on function public.verify_cash_remittance(uuid, numeric) from service_role;

grant execute on function public.verify_cash_remittance(uuid, numeric) to authenticated;

do $$
begin
  if to_regprocedure('public.verify_cash_remittance(uuid,numeric)') is null then
    raise exception 'Missing function public.verify_cash_remittance(uuid,numeric).';
  end if;

  if to_regclass('public.cash_movements_one_remittance_transfer_per_account_idx') is null then
    raise exception 'Missing index public.cash_movements_one_remittance_transfer_per_account_idx.';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = 'public.verify_cash_remittance(uuid,numeric)'::regprocedure
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute public.verify_cash_remittance(uuid,numeric).';
  end if;

  if has_function_privilege('anon', 'public.verify_cash_remittance(uuid,numeric)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.verify_cash_remittance(uuid,numeric).';
  end if;

  if not has_function_privilege('authenticated', 'public.verify_cash_remittance(uuid,numeric)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.verify_cash_remittance(uuid,numeric).';
  end if;

  if has_function_privilege('service_role', 'public.verify_cash_remittance(uuid,numeric)', 'EXECUTE') then
    raise exception 'service_role must not execute public.verify_cash_remittance(uuid,numeric).';
  end if;
end;
$$;
