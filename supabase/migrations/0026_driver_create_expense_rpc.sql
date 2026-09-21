-- Driver portal expense request RPC.
-- Allows an authenticated conductor to create a reimbursable driver advance expense
-- without trusting driver/user ids or workflow states from the frontend.

create or replace function public.create_driver_expense(
  p_category_key text,
  p_amount numeric,
  p_expense_date date,
  p_description text,
  p_service_id uuid default null
)
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
  service_id uuid,
  service_human_code text,
  vehicle_id uuid,
  vehicle_human_code text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_category public.expense_categories%rowtype;
  v_amount numeric(14, 2);
  v_description text;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_expense public.expenses%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to create an expense.'
      using errcode = '42501';
  end if;

  v_app_user_id := public.rls_current_app_user_id();

  if v_app_user_id is null then
    raise exception 'A valid conductor active context is required to create an expense.'
      using errcode = '42501';
  end if;

  v_description := trim(coalesce(p_description, ''));

  if length(v_description) = 0 then
    raise exception 'Expense description cannot be empty.'
      using errcode = '23514';
  end if;

  if length(v_description) > 2000 then
    raise exception 'Expense description cannot exceed 2000 characters.'
      using errcode = '23514';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);

  if v_amount <= 0 then
    raise exception 'Expense amount must be greater than zero.'
      using errcode = '23514';
  end if;

  if p_expense_date is null then
    raise exception 'Expense date is required.'
      using errcode = '23514';
  end if;

  select *
    into v_category
  from public.expense_categories category
  where category.key = lower(trim(coalesce(p_category_key, '')))
    and category.is_active = true
  limit 1;

  if not found then
    raise exception 'Expense category is not valid.'
      using errcode = '23514';
  end if;

  if p_service_id is not null then
    select *
      into v_service
    from public.services service
    where service.id = p_service_id
      and service.deleted_at is null;

    if not found then
      raise exception 'Service was not found or is not available.'
        using errcode = '42501';
    end if;

    select *
      into v_assignment
    from public.service_assignments assignment
    where assignment.service_id = v_service.id
      and assignment.driver_id = v_driver_id
      and assignment.assignment_status in ('accepted', 'ended')
      and assignment.accepted_at is not null
    order by assignment.assigned_at desc, assignment.created_at desc
    limit 1;

    if not found then
      raise exception 'The selected service is not available for this driver.'
        using errcode = '42501';
    end if;

    if v_assignment.vehicle_id is not null then
      select *
        into v_vehicle
      from public.vehicles vehicle
      where vehicle.id = v_assignment.vehicle_id
        and vehicle.inactive_at is null;
    end if;
  else
    -- If the expense is not tied to a service, attach the latest active vehicle
    -- assignment when one exists; expenses.vehicle_id remains nullable.
    select vehicle.*
      into v_vehicle
    from public.driver_vehicle_assignments assignment
    join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
    where assignment.driver_id = v_driver_id
      and assignment.status = 'active'
      and assignment.ended_at is null
      and vehicle.inactive_at is null
    order by assignment.started_at desc, assignment.created_at desc
    limit 1;
  end if;

  insert into public.expenses (
    category_id,
    service_id,
    vehicle_id,
    driver_id,
    expense_date,
    description,
    currency_code,
    subtotal_amount,
    tax_rate,
    status,
    payment_responsibility,
    advanced_by_driver_id,
    reimbursable,
    reimbursement_status,
    created_by,
    updated_by
  ) values (
    v_category.id,
    p_service_id,
    case when v_vehicle.id is not null then v_vehicle.id else null end,
    v_driver_id,
    p_expense_date,
    v_description,
    'EUR',
    v_amount,
    0,
    'draft',
    'driver_advance',
    v_driver_id,
    true,
    'pending',
    v_app_user_id,
    v_app_user_id
  )
  returning * into v_expense;

  perform public.recalculate_expense(v_expense.id);

  select *
    into v_expense
  from public.expenses expense
  where expense.id = v_expense.id;

  perform public.secure_audit(
    'insert',
    'expenses',
    v_expense.id,
    v_expense.human_code,
    null,
    to_jsonb(v_expense),
    'Driver created expense request.',
    jsonb_build_object(
      'operation', 'driver_expense_created',
      'category_key', v_category.key,
      'service_id', v_expense.service_id,
      'vehicle_id', v_expense.vehicle_id,
      'amount', v_expense.total_amount
    ),
    v_app_user_id,
    v_driver_id
  );

  return query
    select
      v_expense.id,
      v_expense.human_code,
      v_expense.expense_date,
      v_expense.description,
      v_category.id,
      v_category.key,
      v_category.name_es,
      v_expense.currency_code,
      v_expense.total_amount,
      v_expense.status,
      v_expense.payment_status,
      v_expense.reimbursable,
      v_expense.reimbursement_status,
      v_expense.service_id,
      v_service.human_code,
      v_expense.vehicle_id,
      v_vehicle.human_code,
      v_expense.created_at;
end;
$$;

comment on function public.create_driver_expense(text, numeric, date, text, uuid) is
  'Creates a draft reimbursable driver_advance expense for the authenticated conductor without trusting driver/user ids from the client.';

revoke all on function public.create_driver_expense(text, numeric, date, text, uuid) from public;
revoke all on function public.create_driver_expense(text, numeric, date, text, uuid) from anon;
revoke all on function public.create_driver_expense(text, numeric, date, text, uuid) from authenticated;
revoke all on function public.create_driver_expense(text, numeric, date, text, uuid) from service_role;

grant execute on function public.create_driver_expense(text, numeric, date, text, uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.create_driver_expense(text, numeric, date, text, uuid)') is null then
    raise exception 'Missing function public.create_driver_expense(text, numeric, date, text, uuid).';
  end if;

  if has_function_privilege('anon', 'public.create_driver_expense(text, numeric, date, text, uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.create_driver_expense(text, numeric, date, text, uuid).';
  end if;

  if not has_function_privilege('authenticated', 'public.create_driver_expense(text, numeric, date, text, uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.create_driver_expense(text, numeric, date, text, uuid).';
  end if;

  if has_function_privilege('service_role', 'public.create_driver_expense(text, numeric, date, text, uuid)', 'EXECUTE') then
    raise exception 'service_role must not execute public.create_driver_expense(text, numeric, date, text, uuid).';
  end if;
end;
$$;
