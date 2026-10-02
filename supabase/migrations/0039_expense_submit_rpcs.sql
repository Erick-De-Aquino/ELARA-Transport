-- ELARA Transport V4.0
-- Migration 0039: expense submit RPCs.
--
-- Adds the missing draft -> submitted workflow step for driver-created and
-- admin-created expenses. It does not create payments, reimbursements, cash
-- movements, settlement items, documents or new columns.

create or replace function public.submit_driver_expense(
  p_expense_id uuid
)
returns table(
  expense_id uuid,
  human_code text,
  status text,
  submitted_at timestamptz,
  submitted_by uuid
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_driver_id uuid;
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  if p_expense_id is null then
    raise exception 'Expense id is required.'
      using errcode = '23502';
  end if;

  v_actor_id := public.rls_current_app_user_id();
  v_driver_id := public.rls_current_driver_id();

  if v_actor_id is null or v_driver_id is null then
    raise exception 'A valid conductor active context is required to submit an expense.'
      using errcode = '42501';
  end if;

  select *
    into v_before
  from public.expenses expense
  where expense.id = p_expense_id
  for update;

  if not found then
    raise exception 'Expense was not found.'
      using errcode = 'P0002';
  end if;

  if v_before.payment_responsibility <> 'driver_advance'
     or v_before.driver_id is distinct from v_driver_id
     or v_before.advanced_by_driver_id is distinct from v_driver_id
     or v_before.created_by is distinct from v_actor_id then
    raise exception 'The selected expense is not available for this driver.'
      using errcode = '42501';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'Expense % cannot be submitted from status %.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.expense_categories category
    where category.id = v_before.category_id
      and category.is_active = true
  ) then
    raise exception 'Expense % cannot be submitted because its category is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  if length(trim(coalesce(v_before.description, ''))) = 0 then
    raise exception 'Expense % cannot be submitted without a description.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.total_amount <= 0 or v_before.subtotal_amount <= 0 then
    raise exception 'Expense % cannot be submitted without a positive amount.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.currency_code !~ '^[A-Z]{3}$' then
    raise exception 'Expense % cannot be submitted with an invalid currency.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.payment_responsibility not in ('driver_advance', 'user_advance', 'elara') then
    raise exception 'Expense % cannot be submitted with an invalid payment responsibility.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.advanced_by_user_id is not null
     or v_before.advanced_by_driver_id is null
     or v_before.reimbursable is distinct from true
     or v_before.reimbursement_status not in ('pending', 'reimbursed', 'cancelled') then
    raise exception 'Expense % does not satisfy driver advance rules.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.supplier_id is not null and not exists (
    select 1
    from public.suppliers supplier
    where supplier.id = v_before.supplier_id
      and supplier.status = 'active'
  ) then
    raise exception 'Expense % cannot be submitted because its supplier is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.service_id is not null and not exists (
    select 1
    from public.services service
    where service.id = v_before.service_id
      and service.deleted_at is null
  ) then
    raise exception 'Expense % cannot be submitted because its service is not available.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.vehicle_id is not null and not exists (
    select 1
    from public.vehicles vehicle
    where vehicle.id = v_before.vehicle_id
      and vehicle.inactive_at is null
  ) then
    raise exception 'Expense % cannot be submitted because its vehicle is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.drivers driver
    where driver.id = v_before.driver_id
      and driver.administrative_status <> 'inactive'
  ) then
    raise exception 'Expense % cannot be submitted because its driver is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  update public.expenses expense
     set status = 'submitted',
         updated_by = v_actor_id
   where expense.id = v_before.id
     and expense.status = 'draft'
  returning * into v_after;

  if not found then
    raise exception 'Expense % could not be submitted because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'expenses',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Driver expense submitted.',
    jsonb_build_object(
      'operation', 'driver_expense_submitted',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'previous_status', v_before.status,
      'amount', v_after.total_amount,
      'currency_code', v_after.currency_code,
      'payment_responsibility', v_after.payment_responsibility,
      'driver_id', v_after.driver_id,
      'service_id', v_after.service_id
    ),
    v_actor_id,
    v_driver_id
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      history.changed_at,
      history.changed_by_user_id
    from public.expense_status_history history
    where history.expense_id = v_after.id
      and history.from_status = 'draft'
      and history.to_status = 'submitted'
    order by history.changed_at desc
    limit 1;
end;
$$;

comment on function public.submit_driver_expense(uuid) is
  'Submits a draft driver_advance expense owned by the authenticated conductor. Does not create payments, reimbursements, cash movements or settlements.';

create or replace function public.submit_expense(
  p_expense_id uuid
)
returns table(
  expense_id uuid,
  human_code text,
  status text,
  submitted_at timestamptz,
  submitted_by uuid
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  if p_expense_id is null then
    raise exception 'Expense id is required.'
      using errcode = '23502';
  end if;

  v_actor_id := public.require_admin_user();

  select *
    into v_before
  from public.expenses expense
  where expense.id = p_expense_id
  for update;

  if not found then
    raise exception 'Expense was not found.'
      using errcode = 'P0002';
  end if;

  if v_before.status <> 'draft' then
    raise exception 'Expense % cannot be submitted from status %.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  if v_before.payment_responsibility <> 'elara' then
    raise exception 'Expense % must be an administrative ELARA expense to use submit_expense.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.advanced_by_user_id is not null
     or v_before.advanced_by_driver_id is not null
     or v_before.reimbursable is distinct from false
     or v_before.reimbursement_status <> 'not_applicable' then
    raise exception 'Expense % does not satisfy ELARA payment responsibility rules.', v_before.human_code
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.expense_categories category
    where category.id = v_before.category_id
      and category.is_active = true
  ) then
    raise exception 'Expense % cannot be submitted because its category is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  if length(trim(coalesce(v_before.description, ''))) = 0 then
    raise exception 'Expense % cannot be submitted without a description.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.total_amount <= 0 or v_before.subtotal_amount <= 0 then
    raise exception 'Expense % cannot be submitted without a positive amount.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.currency_code !~ '^[A-Z]{3}$' then
    raise exception 'Expense % cannot be submitted with an invalid currency.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.supplier_id is not null and not exists (
    select 1
    from public.suppliers supplier
    where supplier.id = v_before.supplier_id
      and supplier.status = 'active'
  ) then
    raise exception 'Expense % cannot be submitted because its supplier is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.service_id is not null and not exists (
    select 1
    from public.services service
    where service.id = v_before.service_id
      and service.deleted_at is null
  ) then
    raise exception 'Expense % cannot be submitted because its service is not available.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.vehicle_id is not null and not exists (
    select 1
    from public.vehicles vehicle
    where vehicle.id = v_before.vehicle_id
      and vehicle.inactive_at is null
  ) then
    raise exception 'Expense % cannot be submitted because its vehicle is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.driver_id is not null and not exists (
    select 1
    from public.drivers driver
    where driver.id = v_before.driver_id
      and driver.administrative_status <> 'inactive'
  ) then
    raise exception 'Expense % cannot be submitted because its driver is not active.', v_before.human_code
      using errcode = '23514';
  end if;

  update public.expenses expense
     set status = 'submitted',
         updated_by = v_actor_id
   where expense.id = v_before.id
     and expense.status = 'draft'
  returning * into v_after;

  if not found then
    raise exception 'Expense % could not be submitted because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'expenses',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Admin expense submitted.',
    jsonb_build_object(
      'operation', 'admin_expense_submitted',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'previous_status', v_before.status,
      'amount', v_after.total_amount,
      'currency_code', v_after.currency_code,
      'payment_responsibility', v_after.payment_responsibility,
      'driver_id', v_after.driver_id,
      'service_id', v_after.service_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      history.changed_at,
      history.changed_by_user_id
    from public.expense_status_history history
    where history.expense_id = v_after.id
      and history.from_status = 'draft'
      and history.to_status = 'submitted'
    order by history.changed_at desc
    limit 1;
end;
$$;

comment on function public.submit_expense(uuid) is
  'Submits a draft administrative ELARA expense. Does not create payments, reimbursements, cash movements or settlements.';

revoke all on function public.submit_driver_expense(uuid) from public;
revoke all on function public.submit_driver_expense(uuid) from anon;
revoke all on function public.submit_driver_expense(uuid) from authenticated;
revoke all on function public.submit_driver_expense(uuid) from service_role;

revoke all on function public.submit_expense(uuid) from public;
revoke all on function public.submit_expense(uuid) from anon;
revoke all on function public.submit_expense(uuid) from authenticated;
revoke all on function public.submit_expense(uuid) from service_role;

grant execute on function public.submit_driver_expense(uuid) to authenticated;
grant execute on function public.submit_expense(uuid) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.submit_driver_expense(uuid)'::regprocedure,
    'public.submit_expense(uuid)'::regprocedure
  ]
  loop
    if exists (
      select 1
      from pg_proc function_record
      cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
      where function_record.oid = v_function
        and function_acl.grantee = 0
        and function_acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC must not be able to execute %.', v_function::text;
    end if;

    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'anon must not execute %.', v_function::text;
    end if;

    if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'authenticated must execute %.', v_function::text;
    end if;

    if has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'service_role must not execute %.', v_function::text;
    end if;
  end loop;
end;
$$;
