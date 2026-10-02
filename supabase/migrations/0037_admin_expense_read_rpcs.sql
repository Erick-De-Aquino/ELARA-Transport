-- ELARA Transport V4.0
-- Migration 0037: admin expense read RPCs.
--
-- Read-only backend for Administracion/Superadmin -> Gastos.
-- Does not approve, reject, pay, reimburse, cancel or mutate expenses.

create or replace function public.get_admin_expenses(
  p_status text default null,
  p_category_id uuid default null,
  p_driver_id uuid default null,
  p_service_id uuid default null,
  p_payment_responsibility text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  expense_id uuid,
  human_code text,
  status text,
  expense_date date,
  created_at timestamptz,
  submitted_at timestamptz,
  category_id uuid,
  category_code text,
  category_name text,
  amount numeric(14, 2),
  currency_code text,
  payment_responsibility text,
  payment_status text,
  reimbursement_status text,
  reimbursable boolean,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  service_id uuid,
  service_human_code text,
  vehicle_id uuid,
  vehicle_human_code text,
  vehicle_plate text,
  vehicle_label text,
  supplier_id uuid,
  supplier_human_code text,
  supplier_name text,
  description text,
  notes text,
  paid_amount numeric(14, 2),
  reimbursed_amount numeric(14, 2),
  pending_payment_amount numeric(14, 2),
  pending_reimbursement_amount numeric(14, 2),
  document_count integer,
  latest_status_at timestamptz,
  settlement_reference_count integer,
  has_settlement_reference boolean,
  total_count integer
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_status text;
  v_payment_responsibility text;
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  v_actor_id := public.require_admin_user();
  v_status := nullif(trim(coalesce(p_status, '')), '');
  v_payment_responsibility := nullif(trim(coalesce(p_payment_responsibility, '')), '');
  v_search := lower(trim(coalesce(p_search, '')));
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  if v_status is not null
     and v_status not in ('draft', 'submitted', 'approved', 'rejected', 'cancelled') then
    raise exception 'Invalid expense status filter.'
      using errcode = '23514';
  end if;

  if v_payment_responsibility is not null
     and v_payment_responsibility not in ('elara', 'user_advance', 'driver_advance') then
    raise exception 'Invalid expense payment responsibility filter.'
      using errcode = '23514';
  end if;

  if p_offset is not null and p_offset < 0 then
    raise exception 'Expense offset cannot be negative.'
      using errcode = '23514';
  end if;

  return query
    with filtered as (
      select
        expense.id as expense_id,
        expense.human_code,
        expense.status,
        expense.expense_date,
        expense.created_at,
        status_summary.submitted_at,
        category.id as category_id,
        category.key as category_code,
        category.name_es as category_name,
        expense.total_amount as amount,
        expense.currency_code,
        expense.payment_responsibility,
        expense.payment_status,
        expense.reimbursement_status,
        expense.reimbursable,
        related_driver.id as driver_id,
        related_driver.human_code as driver_human_code,
        coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), '') as driver_name,
        expense.service_id,
        service.human_code as service_human_code,
        expense.vehicle_id,
        vehicle.human_code as vehicle_human_code,
        vehicle.plate_normalized as vehicle_plate,
        nullif(trim(concat_ws(' ', vehicle.human_code, vehicle.plate_normalized, vehicle.brand, vehicle.model)), '') as vehicle_label,
        supplier.id as supplier_id,
        supplier.human_code as supplier_human_code,
        supplier.display_name as supplier_name,
        expense.description,
        expense.notes,
        expense.paid_amount,
        reimbursement_summary.reimbursed_amount,
        case
          when expense.payment_responsibility = 'elara' then expense.pending_amount
          else 0::numeric
        end::numeric(14, 2) as pending_payment_amount,
        case
          when expense.reimbursable then greatest(round(expense.total_amount - reimbursement_summary.reimbursed_amount, 2), 0)
          else 0::numeric
        end::numeric(14, 2) as pending_reimbursement_amount,
        document_summary.document_count,
        status_summary.latest_status_at,
        settlement_summary.settlement_reference_count
      from public.expenses expense
      join public.expense_categories category
        on category.id = expense.category_id
      left join public.services service
        on service.id = expense.service_id
      left join public.vehicles vehicle
        on vehicle.id = expense.vehicle_id
      left join public.suppliers supplier
        on supplier.id = expense.supplier_id
      left join public.drivers related_driver
        on related_driver.id = coalesce(expense.driver_id, expense.advanced_by_driver_id)
      left join public.persons driver_person
        on driver_person.id = related_driver.person_id
      cross join lateral (
        select
          coalesce(round(sum(reimbursement.amount) filter (
            where reimbursement.status = 'completed'
          ), 2), 0)::numeric(14, 2) as reimbursed_amount
        from public.expense_reimbursements reimbursement
        where reimbursement.expense_id = expense.id
      ) reimbursement_summary
      cross join lateral (
        select count(*)::integer as document_count
        from public.expense_documents document
        where document.expense_id = expense.id
      ) document_summary
      cross join lateral (
        select
          max(history.changed_at) filter (where history.to_status = 'submitted') as submitted_at,
          max(history.changed_at) as latest_status_at
        from public.expense_status_history history
        where history.expense_id = expense.id
      ) status_summary
      cross join lateral (
        select count(*)::integer as settlement_reference_count
        from public.settlement_items item
        where item.expense_id = expense.id
          and item.item_type = 'expense_deduction'
      ) settlement_summary
      where (v_status is null or expense.status = v_status)
        and (p_category_id is null or expense.category_id = p_category_id)
        and (p_driver_id is null or coalesce(expense.driver_id, expense.advanced_by_driver_id) = p_driver_id)
        and (p_service_id is null or expense.service_id = p_service_id)
        and (v_payment_responsibility is null or expense.payment_responsibility = v_payment_responsibility)
        and (
          v_search = ''
          or lower(expense.human_code) like '%' || v_search || '%'
          or lower(coalesce(service.human_code, '')) like '%' || v_search || '%'
          or lower(coalesce(related_driver.human_code, '')) like '%' || v_search || '%'
          or lower(coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), '')) like '%' || v_search || '%'
          or lower(coalesce(supplier.display_name, '')) like '%' || v_search || '%'
          or lower(coalesce(expense.description, '')) like '%' || v_search || '%'
        )
    ),
    counted as (
      select
        filtered.*,
        count(*) over()::integer as total_count
      from filtered
    )
    select
      counted.expense_id,
      counted.human_code,
      counted.status,
      counted.expense_date,
      counted.created_at,
      counted.submitted_at,
      counted.category_id,
      counted.category_code,
      counted.category_name,
      counted.amount,
      counted.currency_code,
      counted.payment_responsibility,
      counted.payment_status,
      counted.reimbursement_status,
      counted.reimbursable,
      counted.driver_id,
      counted.driver_human_code,
      counted.driver_name,
      counted.service_id,
      counted.service_human_code,
      counted.vehicle_id,
      counted.vehicle_human_code,
      counted.vehicle_plate,
      counted.vehicle_label,
      counted.supplier_id,
      counted.supplier_human_code,
      counted.supplier_name,
      counted.description,
      counted.notes,
      counted.paid_amount,
      counted.reimbursed_amount,
      counted.pending_payment_amount,
      counted.pending_reimbursement_amount,
      counted.document_count,
      counted.latest_status_at,
      counted.settlement_reference_count,
      counted.settlement_reference_count > 0,
      counted.total_count
    from counted
    order by counted.expense_date desc, counted.created_at desc, counted.human_code desc
    limit v_limit
    offset v_offset;
end;
$$;

comment on function public.get_admin_expenses(text, uuid, uuid, uuid, text, text, integer, integer) is
  'Returns a paginated administrative read-only list of expenses. Requires active superadmin or administrativo context.';

create or replace function public.get_admin_expense_detail(p_expense_id uuid)
returns table(
  expense_id uuid,
  human_code text,
  status text,
  expense_date date,
  amount numeric(14, 2),
  subtotal_amount numeric(14, 2),
  tax_rate numeric(7, 4),
  tax_amount numeric(14, 2),
  currency_code text,
  payment_responsibility text,
  payment_status text,
  reimbursement_status text,
  reimbursable boolean,
  paid_amount numeric(14, 2),
  reimbursed_amount numeric(14, 2),
  pending_payment_amount numeric(14, 2),
  pending_reimbursement_amount numeric(14, 2),
  description text,
  notes text,
  internal_notes text,
  rejection_reason text,
  cancellation_reason text,
  created_at timestamptz,
  created_by uuid,
  created_by_human_code text,
  created_by_name text,
  submitted_at timestamptz,
  submitted_by uuid,
  submitted_by_human_code text,
  submitted_by_name text,
  approved_at timestamptz,
  approved_by uuid,
  approved_by_human_code text,
  approved_by_name text,
  rejected_at timestamptz,
  rejected_by uuid,
  rejected_by_human_code text,
  rejected_by_name text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_by_human_code text,
  cancelled_by_name text,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_human_code text,
  updated_by_name text,
  category_id uuid,
  category_code text,
  category_name text,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  advanced_by_driver_id uuid,
  advanced_by_driver_human_code text,
  advanced_by_driver_name text,
  advanced_by_user_id uuid,
  advanced_by_user_human_code text,
  advanced_by_user_name text,
  service_id uuid,
  service_human_code text,
  service_type text,
  service_status text,
  vehicle_id uuid,
  vehicle_human_code text,
  vehicle_plate text,
  vehicle_label text,
  supplier_id uuid,
  supplier_human_code text,
  supplier_name text,
  document_count integer,
  has_documents boolean,
  settlement_reference_count integer,
  has_settlement_reference boolean,
  documents jsonb,
  payments jsonb,
  reimbursements jsonb,
  history jsonb,
  allocations jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_row_count integer;
begin
  v_actor_id := public.require_admin_user();

  if p_expense_id is null then
    raise exception 'Expense id is required.'
      using errcode = '23502';
  end if;

  return query
    select
      expense.id,
      expense.human_code,
      expense.status,
      expense.expense_date,
      expense.total_amount,
      expense.subtotal_amount,
      expense.tax_rate,
      expense.tax_amount,
      expense.currency_code,
      expense.payment_responsibility,
      expense.payment_status,
      expense.reimbursement_status,
      expense.reimbursable,
      expense.paid_amount,
      reimbursement_summary.reimbursed_amount,
      case
        when expense.payment_responsibility = 'elara' then expense.pending_amount
        else 0::numeric
      end::numeric(14, 2),
      case
        when expense.reimbursable then greatest(round(expense.total_amount - reimbursement_summary.reimbursed_amount, 2), 0)
        else 0::numeric
      end::numeric(14, 2),
      expense.description,
      expense.notes,
      expense.internal_notes,
      expense.rejection_reason,
      expense.cancellation_reason,
      expense.created_at,
      created_user.id,
      created_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', created_person.first_name, created_person.last_name)), ''), ''),
      submitted_status.changed_at,
      submitted_user.id,
      submitted_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', submitted_person.first_name, submitted_person.last_name)), ''), ''),
      expense.approved_at,
      approved_user.id,
      approved_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', approved_person.first_name, approved_person.last_name)), ''), ''),
      expense.rejected_at,
      rejected_user.id,
      rejected_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', rejected_person.first_name, rejected_person.last_name)), ''), ''),
      expense.cancelled_at,
      cancelled_user.id,
      cancelled_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', cancelled_person.first_name, cancelled_person.last_name)), ''), ''),
      expense.updated_at,
      updated_user.id,
      updated_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', updated_person.first_name, updated_person.last_name)), ''), ''),
      category.id,
      category.key,
      category.name_es,
      operational_driver.id,
      operational_driver.human_code,
      coalesce(nullif(trim(concat_ws(' ', operational_driver_person.first_name, operational_driver_person.last_name)), ''), ''),
      advanced_driver.id,
      advanced_driver.human_code,
      coalesce(nullif(trim(concat_ws(' ', advanced_driver_person.first_name, advanced_driver_person.last_name)), ''), ''),
      advanced_user.id,
      advanced_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', advanced_user_person.first_name, advanced_user_person.last_name)), ''), ''),
      service.id,
      service.human_code,
      service.service_type,
      service.operational_status,
      vehicle.id,
      vehicle.human_code,
      vehicle.plate_normalized,
      nullif(trim(concat_ws(' ', vehicle.human_code, vehicle.plate_normalized, vehicle.brand, vehicle.model)), ''),
      supplier.id,
      supplier.human_code,
      supplier.display_name,
      document_rows.document_count,
      document_rows.document_count > 0,
      settlement_summary.settlement_reference_count,
      settlement_summary.settlement_reference_count > 0,
      coalesce(document_rows.documents, '[]'::jsonb),
      coalesce(payment_rows.payments, '[]'::jsonb),
      coalesce(reimbursement_rows.reimbursements, '[]'::jsonb),
      coalesce(history_rows.history, '[]'::jsonb),
      coalesce(allocation_rows.allocations, '[]'::jsonb)
    from public.expenses expense
    join public.expense_categories category
      on category.id = expense.category_id
    left join public.services service
      on service.id = expense.service_id
    left join public.vehicles vehicle
      on vehicle.id = expense.vehicle_id
    left join public.suppliers supplier
      on supplier.id = expense.supplier_id
    left join public.drivers operational_driver
      on operational_driver.id = expense.driver_id
    left join public.persons operational_driver_person
      on operational_driver_person.id = operational_driver.person_id
    left join public.drivers advanced_driver
      on advanced_driver.id = expense.advanced_by_driver_id
    left join public.persons advanced_driver_person
      on advanced_driver_person.id = advanced_driver.person_id
    left join public.app_users advanced_user
      on advanced_user.id = expense.advanced_by_user_id
    left join public.persons advanced_user_person
      on advanced_user_person.id = advanced_user.person_id
    left join public.app_users created_user
      on created_user.id = expense.created_by
    left join public.persons created_person
      on created_person.id = created_user.person_id
    left join public.app_users approved_user
      on approved_user.id = expense.approved_by
    left join public.persons approved_person
      on approved_person.id = approved_user.person_id
    left join public.app_users rejected_user
      on rejected_user.id = expense.rejected_by
    left join public.persons rejected_person
      on rejected_person.id = rejected_user.person_id
    left join public.app_users cancelled_user
      on cancelled_user.id = expense.cancelled_by
    left join public.persons cancelled_person
      on cancelled_person.id = cancelled_user.person_id
    left join public.app_users updated_user
      on updated_user.id = expense.updated_by
    left join public.persons updated_person
      on updated_person.id = updated_user.person_id
    left join lateral (
      select history.changed_at, history.changed_by_user_id
      from public.expense_status_history history
      where history.expense_id = expense.id
        and history.to_status = 'submitted'
      order by history.changed_at desc, history.id desc
      limit 1
    ) submitted_status on true
    left join public.app_users submitted_user
      on submitted_user.id = submitted_status.changed_by_user_id
    left join public.persons submitted_person
      on submitted_person.id = submitted_user.person_id
    cross join lateral (
      select
        coalesce(round(sum(reimbursement.amount) filter (
          where reimbursement.status = 'completed'
        ), 2), 0)::numeric(14, 2) as reimbursed_amount
      from public.expense_reimbursements reimbursement
      where reimbursement.expense_id = expense.id
    ) reimbursement_summary
    cross join lateral (
      select count(*)::integer as settlement_reference_count
      from public.settlement_items item
      where item.expense_id = expense.id
        and item.item_type = 'expense_deduction'
    ) settlement_summary
    left join lateral (
      select
        count(document.id)::integer as document_count,
        jsonb_agg(
          jsonb_build_object(
            'document_id', document.id,
            'document_type', document.document_type,
            'status', document.status,
            'document_number', document.document_number,
            'issued_at', document.issued_at,
            'storage_bucket', document.storage_bucket,
            'storage_path', document.storage_path,
            'file_name', document.file_name,
            'mime_type', document.mime_type,
            'file_size', document.file_size,
            'notes', document.notes,
            'replaced_at', document.replaced_at,
            'replaced_by_document_id', document.replaced_by_document_id,
            'created_at', document.created_at,
            'created_by', document_created_user.id,
            'created_by_human_code', document_created_user.human_code,
            'created_by_name', coalesce(nullif(trim(concat_ws(' ', document_created_person.first_name, document_created_person.last_name)), ''), '')
          )
          order by document.created_at, document.id
        ) as documents
      from public.expense_documents document
      left join public.app_users document_created_user
        on document_created_user.id = document.created_by
      left join public.persons document_created_person
        on document_created_person.id = document_created_user.person_id
      where document.expense_id = expense.id
    ) document_rows on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'payment_id', payment.id,
          'human_code', payment.human_code,
          'amount', payment.amount,
          'currency_code', payment.currency_code,
          'payment_method', payment.payment_method,
          'status', payment.payment_status,
          'paid_at', payment.paid_at,
          'registered_at', payment.registered_at,
          'cash_account_id', cash_account.id,
          'cash_account_name', cash_account.name,
          'cash_account_type', cash_account.account_type,
          'external_reference', payment.external_reference,
          'notes', payment.notes,
          'cancelled_at', payment.cancelled_at,
          'cancellation_reason', payment.cancellation_reason,
          'created_at', payment.created_at,
          'created_by', payment_created_user.id,
          'created_by_human_code', payment_created_user.human_code,
          'created_by_name', coalesce(nullif(trim(concat_ws(' ', payment_created_person.first_name, payment_created_person.last_name)), ''), '')
        )
        order by payment.created_at, payment.id
      ) as payments
      from public.expense_payments payment
      left join public.cash_accounts cash_account
        on cash_account.id = payment.cash_account_id
      left join public.app_users payment_created_user
        on payment_created_user.id = payment.created_by
      left join public.persons payment_created_person
        on payment_created_person.id = payment_created_user.person_id
      where payment.expense_id = expense.id
    ) payment_rows on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'reimbursement_id', reimbursement.id,
          'human_code', reimbursement.human_code,
          'amount', reimbursement.amount,
          'currency_code', reimbursement.currency_code,
          'payment_method', reimbursement.payment_method,
          'status', reimbursement.status,
          'reimbursed_at', reimbursement.reimbursed_at,
          'reimbursed_user_id', reimbursed_user.id,
          'reimbursed_user_human_code', reimbursed_user.human_code,
          'reimbursed_user_name', coalesce(nullif(trim(concat_ws(' ', reimbursed_user_person.first_name, reimbursed_user_person.last_name)), ''), ''),
          'reimbursed_driver_id', reimbursed_driver.id,
          'reimbursed_driver_human_code', reimbursed_driver.human_code,
          'reimbursed_driver_name', coalesce(nullif(trim(concat_ws(' ', reimbursed_driver_person.first_name, reimbursed_driver_person.last_name)), ''), ''),
          'cash_account_id', cash_account.id,
          'cash_account_name', cash_account.name,
          'cash_account_type', cash_account.account_type,
          'external_reference', reimbursement.external_reference,
          'notes', reimbursement.notes,
          'cancelled_at', reimbursement.cancelled_at,
          'cancellation_reason', reimbursement.cancellation_reason,
          'created_at', reimbursement.created_at,
          'created_by', reimbursement_created_user.id,
          'created_by_human_code', reimbursement_created_user.human_code,
          'created_by_name', coalesce(nullif(trim(concat_ws(' ', reimbursement_created_person.first_name, reimbursement_created_person.last_name)), ''), '')
        )
        order by reimbursement.created_at, reimbursement.id
      ) as reimbursements
      from public.expense_reimbursements reimbursement
      left join public.app_users reimbursed_user
        on reimbursed_user.id = reimbursement.reimbursed_user_id
      left join public.persons reimbursed_user_person
        on reimbursed_user_person.id = reimbursed_user.person_id
      left join public.drivers reimbursed_driver
        on reimbursed_driver.id = reimbursement.reimbursed_driver_id
      left join public.persons reimbursed_driver_person
        on reimbursed_driver_person.id = reimbursed_driver.person_id
      left join public.cash_accounts cash_account
        on cash_account.id = reimbursement.cash_account_id
      left join public.app_users reimbursement_created_user
        on reimbursement_created_user.id = reimbursement.created_by
      left join public.persons reimbursement_created_person
        on reimbursement_created_person.id = reimbursement_created_user.person_id
      where reimbursement.expense_id = expense.id
    ) reimbursement_rows on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'history_id', history.id,
          'previous_status', history.from_status,
          'new_status', history.to_status,
          'changed_at', history.changed_at,
          'changed_by', history_user.id,
          'changed_by_human_code', history_user.human_code,
          'changed_by_name', coalesce(nullif(trim(concat_ws(' ', history_person.first_name, history_person.last_name)), ''), ''),
          'payment_id', history.payment_id,
          'reimbursement_id', history.reimbursement_id,
          'reason', history.reason,
          'metadata', history.metadata
        )
        order by history.changed_at, history.id
      ) as history
      from public.expense_status_history history
      left join public.app_users history_user
        on history_user.id = history.changed_by_user_id
      left join public.persons history_person
        on history_person.id = history_user.person_id
      where history.expense_id = expense.id
    ) history_rows on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'allocation_id', allocation.id,
          'allocation_type', allocation.allocation_type,
          'service_id', allocation.service_id,
          'service_human_code', allocation_service.human_code,
          'vehicle_id', allocation.vehicle_id,
          'vehicle_human_code', allocation_vehicle.human_code,
          'driver_id', allocation.driver_id,
          'driver_human_code', allocation_driver.human_code,
          'driver_name', coalesce(nullif(trim(concat_ws(' ', allocation_driver_person.first_name, allocation_driver_person.last_name)), ''), ''),
          'allocated_amount', allocation.allocated_amount,
          'percentage', allocation.percentage,
          'description', allocation.description,
          'created_at', allocation.created_at,
          'created_by', allocation_user.id,
          'created_by_human_code', allocation_user.human_code,
          'created_by_name', coalesce(nullif(trim(concat_ws(' ', allocation_user_person.first_name, allocation_user_person.last_name)), ''), '')
        )
        order by allocation.created_at, allocation.id
      ) as allocations
      from public.expense_allocations allocation
      left join public.services allocation_service
        on allocation_service.id = allocation.service_id
      left join public.vehicles allocation_vehicle
        on allocation_vehicle.id = allocation.vehicle_id
      left join public.drivers allocation_driver
        on allocation_driver.id = allocation.driver_id
      left join public.persons allocation_driver_person
        on allocation_driver_person.id = allocation_driver.person_id
      left join public.app_users allocation_user
        on allocation_user.id = allocation.created_by
      left join public.persons allocation_user_person
        on allocation_user_person.id = allocation_user.person_id
      where allocation.expense_id = expense.id
    ) allocation_rows on true
    where expense.id = p_expense_id;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    raise exception 'Expense was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.get_admin_expense_detail(uuid) is
  'Returns read-only administrative detail for one expense, including documents, payments, reimbursements, history and allocations. Requires active superadmin or administrativo context.';

revoke all on function public.get_admin_expenses(text, uuid, uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.get_admin_expenses(text, uuid, uuid, uuid, text, text, integer, integer) from anon;
revoke all on function public.get_admin_expenses(text, uuid, uuid, uuid, text, text, integer, integer) from authenticated;
revoke all on function public.get_admin_expenses(text, uuid, uuid, uuid, text, text, integer, integer) from service_role;

revoke all on function public.get_admin_expense_detail(uuid) from public;
revoke all on function public.get_admin_expense_detail(uuid) from anon;
revoke all on function public.get_admin_expense_detail(uuid) from authenticated;
revoke all on function public.get_admin_expense_detail(uuid) from service_role;

grant execute on function public.get_admin_expenses(text, uuid, uuid, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.get_admin_expense_detail(uuid) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.get_admin_expenses(text,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure,
    'public.get_admin_expense_detail(uuid)'::regprocedure
  ]
  loop
    if exists (
      select 1
      from pg_proc function_record
      where function_record.oid = v_function
        and (
          function_record.prosecdef is distinct from true
          or not ('search_path=public, extensions' = any(coalesce(function_record.proconfig, array[]::text[])))
        )
    ) then
      raise exception 'Admin expense read function % must be SECURITY DEFINER with search_path=public, extensions.', v_function::text;
    end if;

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
