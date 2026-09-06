-- ELARA Transport V4.0
-- Migration 0019: driver expenses read API.
--
-- Exposes read-only, driver-scoped expense data for Portal conductor -> Mis gastos.
-- The caller cannot pass driver_id, app_user_id or auth_user_id.

create index if not exists expenses_driver_advance_owner_date_idx
on public.expenses (advanced_by_driver_id, expense_date desc, created_at desc)
where payment_responsibility = 'driver_advance';

create or replace function public.get_driver_expenses()
returns table(
  expense_id uuid,
  human_code text,
  expense_date date,
  description text,
  category_id uuid,
  category_key text,
  category_name text,
  currency_code text,
  amount numeric(14, 2),
  status text,
  payment_status text,
  reimbursable boolean,
  reimbursement_status text,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reimbursed_amount numeric(14, 2),
  last_reimbursed_at timestamptz,
  completed_reimbursement_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to read driver expenses.'
      using errcode = '42501';
  end if;

  return query
  select
    expense.id as expense_id,
    expense.human_code,
    expense.expense_date,
    expense.description,
    category.id as category_id,
    category.key as category_key,
    category.name_es as category_name,
    expense.currency_code,
    expense.total_amount as amount,
    expense.status,
    expense.payment_status,
    expense.reimbursable,
    expense.reimbursement_status,
    expense.approved_at,
    expense.rejected_at,
    expense.cancelled_at,
    expense.created_at,
    expense.updated_at,
    reimbursement.reimbursed_amount,
    reimbursement.last_reimbursed_at,
    reimbursement.completed_reimbursement_count
  from public.expenses expense
  join public.expense_categories category
    on category.id = expense.category_id
  cross join lateral (
    select
      round(sum(reimbursement_record.amount), 2)::numeric(14, 2) as reimbursed_amount,
      max(reimbursement_record.reimbursed_at) as last_reimbursed_at,
      count(*)::integer as completed_reimbursement_count
    from public.expense_reimbursements reimbursement_record
    where reimbursement_record.expense_id = expense.id
      and reimbursement_record.reimbursed_driver_id = v_driver_id
      and reimbursement_record.status = 'completed'
  ) reimbursement
  where expense.payment_responsibility = 'driver_advance'
    and expense.advanced_by_driver_id = v_driver_id
  order by expense.expense_date desc, expense.created_at desc, expense.id desc;
end;
$$;

comment on function public.get_driver_expenses() is
  'Returns UI-safe expenses advanced by the current authenticated conductor. Does not expose operational ELARA expenses, payments, documents, actor IDs or internal notes.';

create or replace function public.get_driver_expense_detail(p_expense_id uuid)
returns table(
  expense_id uuid,
  human_code text,
  expense_date date,
  description text,
  category_id uuid,
  category_key text,
  category_name text,
  currency_code text,
  amount numeric(14, 2),
  status text,
  payment_status text,
  reimbursable boolean,
  reimbursement_status text,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  cancelled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  service_human_code text,
  vehicle_human_code text,
  reimbursed_amount numeric(14, 2),
  last_reimbursed_at timestamptz,
  completed_reimbursement_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to read driver expense detail.'
      using errcode = '42501';
  end if;

  if p_expense_id is null then
    return;
  end if;

  return query
  select
    expense.id as expense_id,
    expense.human_code,
    expense.expense_date,
    expense.description,
    category.id as category_id,
    category.key as category_key,
    category.name_es as category_name,
    expense.currency_code,
    expense.total_amount as amount,
    expense.status,
    expense.payment_status,
    expense.reimbursable,
    expense.reimbursement_status,
    expense.approved_at,
    expense.rejected_at,
    expense.rejection_reason,
    expense.cancelled_at,
    expense.created_at,
    expense.updated_at,
    service.human_code as service_human_code,
    vehicle.human_code as vehicle_human_code,
    reimbursement.reimbursed_amount,
    reimbursement.last_reimbursed_at,
    reimbursement.completed_reimbursement_count
  from public.expenses expense
  join public.expense_categories category
    on category.id = expense.category_id
  left join public.services service
    on service.id = expense.service_id
    and public.rls_driver_can_access_service(expense.service_id)
  left join public.vehicles vehicle
    on vehicle.id = expense.vehicle_id
    and public.rls_driver_can_access_vehicle(expense.vehicle_id)
  cross join lateral (
    select
      round(sum(reimbursement_record.amount), 2)::numeric(14, 2) as reimbursed_amount,
      max(reimbursement_record.reimbursed_at) as last_reimbursed_at,
      count(*)::integer as completed_reimbursement_count
    from public.expense_reimbursements reimbursement_record
    where reimbursement_record.expense_id = expense.id
      and reimbursement_record.reimbursed_driver_id = v_driver_id
      and reimbursement_record.status = 'completed'
  ) reimbursement
  where expense.id = p_expense_id
    and expense.payment_responsibility = 'driver_advance'
    and expense.advanced_by_driver_id = v_driver_id;
end;
$$;

comment on function public.get_driver_expense_detail(uuid) is
  'Returns UI-safe detail for one expense advanced by the current authenticated conductor. Non-owned or missing expenses return no rows.';

revoke all on function public.get_driver_expenses() from public;
revoke all on function public.get_driver_expenses() from anon;
revoke all on function public.get_driver_expenses() from authenticated;
revoke all on function public.get_driver_expenses() from service_role;

revoke all on function public.get_driver_expense_detail(uuid) from public;
revoke all on function public.get_driver_expense_detail(uuid) from anon;
revoke all on function public.get_driver_expense_detail(uuid) from authenticated;
revoke all on function public.get_driver_expense_detail(uuid) from service_role;

grant execute on function public.get_driver_expenses() to authenticated;
grant execute on function public.get_driver_expense_detail(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.get_driver_expenses()') is null then
    raise exception 'Missing function public.get_driver_expenses().';
  end if;

  if to_regprocedure('public.get_driver_expense_detail(uuid)') is null then
    raise exception 'Missing function public.get_driver_expense_detail(uuid).';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    where function_record.oid in (
        'public.get_driver_expenses()'::regprocedure,
        'public.get_driver_expense_detail(uuid)'::regprocedure
      )
      and (
        function_record.prosecdef is distinct from true
        or not ('search_path=public' = any(coalesce(function_record.proconfig, array[]::text[])))
      )
  ) then
    raise exception 'Driver expense read functions must be SECURITY DEFINER with search_path=public.';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid in (
        'public.get_driver_expenses()'::regprocedure,
        'public.get_driver_expense_detail(uuid)'::regprocedure
      )
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute driver expense read functions.';
  end if;

  if has_function_privilege('anon', 'public.get_driver_expenses()', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.get_driver_expenses().';
  end if;

  if has_function_privilege('anon', 'public.get_driver_expense_detail(uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.get_driver_expense_detail(uuid).';
  end if;

  if not has_function_privilege('authenticated', 'public.get_driver_expenses()', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.get_driver_expenses().';
  end if;

  if not has_function_privilege('authenticated', 'public.get_driver_expense_detail(uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.get_driver_expense_detail(uuid).';
  end if;

  if has_function_privilege('service_role', 'public.get_driver_expenses()', 'EXECUTE') then
    raise exception 'service_role must not execute public.get_driver_expenses().';
  end if;

  if has_function_privilege('service_role', 'public.get_driver_expense_detail(uuid)', 'EXECUTE') then
    raise exception 'service_role must not execute public.get_driver_expense_detail(uuid).';
  end if;
end;
$$;
