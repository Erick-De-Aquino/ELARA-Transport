-- Extend the driver expenses list read path with operational relation labels.
-- The ownership scope remains unchanged: current authenticated conductor only.

drop function if exists public.get_driver_expenses();

create function public.get_driver_expenses()
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
  service_id uuid,
  service_human_code text,
  vehicle_id uuid,
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
    expense.service_id,
    service.human_code as service_human_code,
    expense.vehicle_id,
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
  where expense.payment_responsibility = 'driver_advance'
    and expense.advanced_by_driver_id = v_driver_id
  order by expense.expense_date desc, expense.created_at desc, expense.id desc;
end;
$$;

comment on function public.get_driver_expenses() is
  'Returns UI-safe expenses advanced by the current authenticated conductor, including service/vehicle human codes for list presentation.';

revoke all on function public.get_driver_expenses() from public;
revoke all on function public.get_driver_expenses() from anon;
revoke all on function public.get_driver_expenses() from authenticated;
revoke all on function public.get_driver_expenses() from service_role;

grant execute on function public.get_driver_expenses() to authenticated;

do $$
begin
  if to_regprocedure('public.get_driver_expenses()') is null then
    raise exception 'Missing function public.get_driver_expenses().';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    where function_record.oid = 'public.get_driver_expenses()'::regprocedure
      and (
        function_record.prosecdef is distinct from true
        or not ('search_path=public' = any(coalesce(function_record.proconfig, array[]::text[])))
      )
  ) then
    raise exception 'Driver expense list function must be SECURITY DEFINER with search_path=public.';
  end if;

  if has_function_privilege('anon', 'public.get_driver_expenses()', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.get_driver_expenses().';
  end if;

  if not has_function_privilege('authenticated', 'public.get_driver_expenses()', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.get_driver_expenses().';
  end if;

  if has_function_privilege('service_role', 'public.get_driver_expenses()', 'EXECUTE') then
    raise exception 'service_role must not execute public.get_driver_expenses().';
  end if;
end;
$$;
