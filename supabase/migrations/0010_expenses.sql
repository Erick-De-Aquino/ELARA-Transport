-- ELARA Transport V4.0
-- Migration 0010: Expenses domain.
-- Creates expense tables, internal guards and recalculation helpers only.
-- No automatic cash movements, settlements, storage buckets, seed data beyond categories or full RLS.

create table if not exists public.expense_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null,
  name_es text not null,
  description text,
  parent_category_id uuid references public.expense_categories(id) on delete restrict,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  constraint expense_categories_key_unique unique (key),
  constraint expense_categories_key_format check (key = lower(trim(key)) and key ~ '^[a-z][a-z0-9_]*$'),
  constraint expense_categories_name_es_not_empty check (length(trim(name_es)) > 0),
  constraint expense_categories_sort_order_non_negative check (sort_order >= 0),
  constraint expense_categories_not_self_parent check (parent_category_id is null or parent_category_id <> id)
);
comment on table public.expense_categories is 'Catalog of expense categories.';
create index if not exists expense_categories_parent_sort_idx on public.expense_categories (parent_category_id, sort_order, key);

create table if not exists public.expenses (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  service_id uuid references public.services(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  expense_date date not null,
  description text not null,
  currency_code text not null default 'EUR',
  subtotal_amount numeric(14, 2) not null,
  tax_rate numeric(7, 4) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null,
  paid_amount numeric(14, 2) not null default 0,
  pending_amount numeric(14, 2) not null,
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  payment_responsibility text not null default 'elara',
  advanced_by_user_id uuid references public.app_users(id) on delete restrict,
  advanced_by_driver_id uuid references public.drivers(id) on delete restrict,
  reimbursable boolean not null default false,
  reimbursement_status text not null default 'not_applicable',
  approved_at timestamptz,
  approved_by uuid references public.app_users(id) on delete restrict,
  rejected_at timestamptz,
  rejected_by uuid references public.app_users(id) on delete restrict,
  rejection_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  cancellation_reason text,
  notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  constraint expenses_human_code_unique unique (human_code),
  constraint expenses_human_code_format check (human_code ~ '^EXP-[0-9]{6}$'),
  constraint expenses_description_not_empty check (length(trim(description)) > 0),
  constraint expenses_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint expenses_status_check check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  constraint expenses_payment_status_check check (payment_status in ('unpaid', 'paid', 'partial', 'cancelled')),
  constraint expenses_payment_responsibility_check check (payment_responsibility in ('elara', 'user_advance', 'driver_advance')),
  constraint expenses_reimbursement_status_check check (reimbursement_status in ('not_applicable', 'pending', 'reimbursed', 'cancelled')),
  constraint expenses_amounts_valid check (
    subtotal_amount > 0 and tax_rate >= 0 and tax_rate <= 100
    and tax_amount = round(subtotal_amount * tax_rate / 100, 2)
    and total_amount = round(subtotal_amount + tax_amount, 2)
    and paid_amount >= 0 and pending_amount >= 0 and paid_amount <= total_amount
    and pending_amount = round(total_amount - paid_amount, 2)
  ),
  constraint expenses_payment_unpaid_fields check (payment_status <> 'unpaid' or paid_amount = 0),
  constraint expenses_payment_paid_fields check (payment_status <> 'paid' or pending_amount = 0),
  constraint expenses_payment_partial_fields check (payment_status <> 'partial' or (paid_amount > 0 and pending_amount > 0)),
  constraint expenses_approved_fields check (status <> 'approved' or (approved_at is not null and approved_by is not null)),
  constraint expenses_rejected_fields check (status <> 'rejected' or (rejected_at is not null and rejected_by is not null and length(trim(rejection_reason)) > 0)),
  constraint expenses_cancelled_fields check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason)) > 0)),
  constraint expenses_elara_payment_rules check (payment_responsibility <> 'elara' or (advanced_by_user_id is null and advanced_by_driver_id is null and reimbursable = false and reimbursement_status = 'not_applicable')),
  constraint expenses_user_advance_rules check (payment_responsibility <> 'user_advance' or (advanced_by_user_id is not null and advanced_by_driver_id is null and reimbursable = true and reimbursement_status in ('pending', 'reimbursed', 'cancelled'))),
  constraint expenses_driver_advance_rules check (payment_responsibility <> 'driver_advance' or (advanced_by_driver_id is not null and advanced_by_user_id is null and reimbursable = true and reimbursement_status in ('pending', 'reimbursed', 'cancelled')))
);
comment on table public.expenses is 'Central expense record. Calculated amounts and payment/reimbursement statuses are controlled by database helpers.';
comment on column public.expenses.internal_notes is 'Future settlement integration must block changes to expenses included in active settlements using a separate link and historical snapshots.';
create index if not exists expenses_status_date_idx on public.expenses (status, expense_date);
create index if not exists expenses_category_status_idx on public.expenses (category_id, status);
create index if not exists expenses_supplier_status_idx on public.expenses (supplier_id, status);
create index if not exists expenses_driver_status_idx on public.expenses (driver_id, status);
create index if not exists expenses_service_idx on public.expenses (service_id);
create index if not exists expenses_vehicle_idx on public.expenses (vehicle_id);

create table if not exists public.expense_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  allocation_type text not null,
  service_id uuid references public.services(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  allocated_amount numeric(14, 2) not null,
  percentage numeric(7, 4),
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  constraint expense_allocations_type_check check (allocation_type in ('service', 'vehicle', 'driver', 'general')),
  constraint expense_allocations_amount_positive check (allocated_amount > 0),
  constraint expense_allocations_percentage_valid check (percentage is null or (percentage >= 0 and percentage <= 100)),
  constraint expense_allocations_reference_by_type check (
    (allocation_type = 'service' and service_id is not null and vehicle_id is null and driver_id is null)
    or (allocation_type = 'vehicle' and vehicle_id is not null and service_id is null and driver_id is null)
    or (allocation_type = 'driver' and driver_id is not null and service_id is null and vehicle_id is null)
    or (allocation_type = 'general' and service_id is null and vehicle_id is null and driver_id is null)
  )
);
comment on table public.expense_allocations is 'Optional distribution of an expense across operational entities or general cost centers.';
create index if not exists expense_allocations_expense_idx on public.expense_allocations (expense_id);
create index if not exists expense_allocations_service_idx on public.expense_allocations (service_id);
create index if not exists expense_allocations_vehicle_idx on public.expense_allocations (vehicle_id);
create index if not exists expense_allocations_driver_idx on public.expense_allocations (driver_id);

create table if not exists public.expense_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  payment_method text not null,
  payment_status text not null default 'pending',
  amount numeric(14, 2) not null,
  currency_code text not null default 'EUR',
  cash_account_id uuid references public.cash_accounts(id) on delete restrict,
  paid_at timestamptz,
  registered_at timestamptz not null default now(),
  external_reference text,
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  constraint expense_payments_human_code_unique unique (human_code),
  constraint expense_payments_human_code_format check (human_code ~ '^EXPPAY-[0-9]{6}$'),
  constraint expense_payments_method_check check (payment_method in ('cash', 'bank_transfer', 'card', 'other')),
  constraint expense_payments_status_check check (payment_status in ('pending', 'completed', 'cancelled', 'failed', 'reversed')),
  constraint expense_payments_amount_positive check (amount > 0),
  constraint expense_payments_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint expense_payments_cash_account_rule check ((payment_method = 'cash' and cash_account_id is not null) or (payment_method <> 'cash')),
  constraint expense_payments_completed_fields check (payment_status <> 'completed' or paid_at is not null),
  constraint expense_payments_cancelled_fields check (payment_status not in ('cancelled', 'reversed') or (cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason)) > 0))
);
comment on table public.expense_payments is 'Append-preserved payment records for provider expenses. This migration does not create cash movements automatically.';
create unique index if not exists expense_payments_one_completed_per_expense_idx on public.expense_payments (expense_id) where payment_status = 'completed';
create index if not exists expense_payments_expense_status_idx on public.expense_payments (expense_id, payment_status, paid_at);
create index if not exists expense_payments_cash_account_idx on public.expense_payments (cash_account_id, payment_status);

create table if not exists public.expense_reimbursements (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  reimbursed_user_id uuid references public.app_users(id) on delete restrict,
  reimbursed_driver_id uuid references public.drivers(id) on delete restrict,
  payment_method text not null,
  status text not null default 'pending',
  amount numeric(14, 2) not null,
  currency_code text not null default 'EUR',
  cash_account_id uuid references public.cash_accounts(id) on delete restrict,
  reimbursed_at timestamptz,
  external_reference text,
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  constraint expense_reimbursements_human_code_unique unique (human_code),
  constraint expense_reimbursements_human_code_format check (human_code ~ '^EXPRMB-[0-9]{6}$'),
  constraint expense_reimbursements_beneficiary_one check ((reimbursed_user_id is not null)::integer + (reimbursed_driver_id is not null)::integer = 1),
  constraint expense_reimbursements_method_check check (payment_method in ('cash', 'bank_transfer', 'card', 'other')),
  constraint expense_reimbursements_status_check check (status in ('pending', 'completed', 'cancelled', 'failed', 'reversed')),
  constraint expense_reimbursements_amount_positive check (amount > 0),
  constraint expense_reimbursements_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint expense_reimbursements_cash_account_rule check ((payment_method = 'cash' and cash_account_id is not null) or (payment_method <> 'cash')),
  constraint expense_reimbursements_completed_fields check (status <> 'completed' or reimbursed_at is not null),
  constraint expense_reimbursements_cancelled_fields check (status not in ('cancelled', 'reversed') or (cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason)) > 0))
);
comment on table public.expense_reimbursements is 'Append-preserved reimbursement records for user or driver advances. This migration does not create cash movements automatically.';
create unique index if not exists expense_reimbursements_one_completed_per_expense_idx on public.expense_reimbursements (expense_id) where status = 'completed';
create index if not exists expense_reimbursements_expense_status_idx on public.expense_reimbursements (expense_id, status, reimbursed_at);
create index if not exists expense_reimbursements_user_idx on public.expense_reimbursements (reimbursed_user_id, status);
create index if not exists expense_reimbursements_driver_idx on public.expense_reimbursements (reimbursed_driver_id, status);

create table if not exists public.expense_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  document_type text not null,
  status text not null default 'pending',
  document_number text,
  issued_at date,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  checksum text,
  notes text,
  replaced_at timestamptz,
  replaced_by_document_id uuid references public.expense_documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  constraint expense_documents_type_check check (document_type in ('invoice', 'receipt', 'ticket', 'contract', 'other')),
  constraint expense_documents_status_check check (status in ('pending', 'valid', 'rejected', 'replaced', 'annulled')),
  constraint expense_documents_file_size_non_negative check (file_size is null or file_size >= 0),
  constraint expense_documents_replaced_fields check (status <> 'replaced' or replaced_at is not null),
  constraint expense_documents_not_self_replaced check (replaced_by_document_id is null or replaced_by_document_id <> id),
  constraint expense_documents_no_public_url check (storage_path is null or storage_path !~* '^https?://')
);
comment on table public.expense_documents is 'Expense document metadata only. Binary files will live in private Supabase Storage; public permanent URLs are not stored.';
create unique index if not exists expense_documents_one_current_number_idx on public.expense_documents (expense_id, document_type, document_number) where document_number is not null and status not in ('replaced', 'annulled');
create index if not exists expense_documents_expense_status_idx on public.expense_documents (expense_id, status, document_type);

create table if not exists public.expense_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  payment_id uuid references public.expense_payments(id) on delete restrict,
  reimbursement_id uuid references public.expense_reimbursements(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint expense_status_history_from_status_check check (from_status is null or from_status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  constraint expense_status_history_to_status_check check (to_status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  constraint expense_status_history_real_change check (from_status is null or from_status <> to_status),
  constraint expense_status_history_metadata_object check (jsonb_typeof(metadata) = 'object')
);
comment on table public.expense_status_history is 'Append-only history of expenses.status transitions. Operational status changes are recorded automatically; future secure payment and reimbursement functions in 0013 may insert enriched history with payment_id or reimbursement_id.';
comment on column public.expense_status_history.payment_id is 'Reserved for future secure payment workflows that need to link an expense status event to an expense payment.';
comment on column public.expense_status_history.reimbursement_id is 'Reserved for future secure reimbursement workflows that need to link an expense status event to an expense reimbursement.';
create index if not exists expense_status_history_expense_changed_idx on public.expense_status_history (expense_id, changed_at);

insert into public.expense_categories (key, name_es, sort_order, is_active)
values
  ('fuel', 'Combustible', 10, true),
  ('tolls', 'Peajes', 20, true),
  ('parking', 'Aparcamiento', 30, true),
  ('maintenance', 'Mantenimiento', 40, true),
  ('repairs', 'Reparaciones', 50, true),
  ('cleaning', 'Limpieza', 60, true),
  ('insurance', 'Seguro', 70, true),
  ('taxes_fees', 'Impuestos y tasas', 80, true),
  ('driver_allowance', 'Dietas de conductor', 90, true),
  ('subcontracted_service', 'Servicio subcontratado', 100, true),
  ('office', 'Oficina', 110, true),
  ('software', 'Software', 120, true),
  ('marketing', 'Marketing', 130, true),
  ('professional_services', 'Servicios profesionales', 140, true),
  ('other', 'Otros', 150, true)
on conflict (key) do nothing;

create or replace function public.prevent_expense_category_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.parent_category_id is null then
    return NEW;
  end if;

  if NEW.parent_category_id = NEW.id then
    raise exception 'La categoría de gasto no puede depender de sí misma';
  end if;

  if exists (
    with recursive ancestors as (
      select c.id, c.parent_category_id
      from public.expense_categories c
      where c.id = NEW.parent_category_id
      union all
      select p.id, p.parent_category_id
      from public.expense_categories p
      inner join ancestors a on a.parent_category_id = p.id
    )
    select 1
    from ancestors
    where id = NEW.id
  ) then
    raise exception 'La jerarquía de categorías de gasto no puede contener ciclos';
  end if;

  return NEW;
end;
$$;

create or replace function public.prevent_expense_category_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.expense_categories c where c.parent_category_id = OLD.id) then
    raise exception 'No se puede eliminar una categoría de gasto con subcategorías';
  end if;

  if exists (select 1 from public.expenses e where e.category_id = OLD.id) then
    raise exception 'No se puede eliminar una categoría de gasto con gastos asociados';
  end if;

  return OLD;
end;
$$;

create or replace function public.assign_expense_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.human_code is null or length(trim(NEW.human_code)) = 0 then
      NEW.human_code := public.next_human_code('EXP');
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.human_code is distinct from OLD.human_code then
      raise exception 'El código humano del gasto no se puede modificar';
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.assign_expense_payment_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.human_code is null or length(trim(NEW.human_code)) = 0 then
      NEW.human_code := public.next_human_code('EXPPAY');
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.human_code is distinct from OLD.human_code then
      raise exception 'El código humano del pago de gasto no se puede modificar';
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.assign_expense_reimbursement_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.human_code is null or length(trim(NEW.human_code)) = 0 then
      NEW.human_code := public.next_human_code('EXPRMB');
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.human_code is distinct from OLD.human_code then
      raise exception 'El código humano del reembolso de gasto no se puede modificar';
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.prepare_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recalculate_allowed boolean := false;
  v_cancel_allowed boolean := false;
  v_approved_cancel_allowed boolean := false;
begin
  if TG_OP = 'INSERT' then
    NEW.description := trim(NEW.description);
    NEW.currency_code := upper(trim(NEW.currency_code));
    NEW.subtotal_amount := round(NEW.subtotal_amount, 2);
    NEW.tax_rate := round(NEW.tax_rate, 4);
    NEW.tax_amount := round(NEW.subtotal_amount * NEW.tax_rate / 100, 2);
    NEW.total_amount := round(NEW.subtotal_amount + NEW.tax_amount, 2);
    NEW.paid_amount := 0;
    NEW.pending_amount := NEW.total_amount;
    NEW.payment_status := 'unpaid';

    if NEW.status <> 'draft' then
      raise exception 'Los gastos nuevos deben comenzar en estado draft';
    end if;
  elsif TG_OP = 'UPDATE' then
    v_recalculate_allowed := current_setting('elara.expense_recalculate', true) is not distinct from OLD.id::text;
    v_cancel_allowed := current_setting('elara.expense_superadmin_cancel', true) is not distinct from OLD.id::text;
    v_approved_cancel_allowed := OLD.status = 'approved' and v_cancel_allowed and NEW.status = 'cancelled';

    if OLD.status in ('rejected', 'cancelled') then
      if not v_recalculate_allowed then
        raise exception 'No se puede modificar un gasto en estado final';
      elsif NEW.human_code is distinct from OLD.human_code
        or NEW.category_id is distinct from OLD.category_id
        or NEW.supplier_id is distinct from OLD.supplier_id
        or NEW.service_id is distinct from OLD.service_id
        or NEW.vehicle_id is distinct from OLD.vehicle_id
        or NEW.driver_id is distinct from OLD.driver_id
        or NEW.expense_date is distinct from OLD.expense_date
        or NEW.description is distinct from OLD.description
        or NEW.currency_code is distinct from OLD.currency_code
        or NEW.subtotal_amount is distinct from OLD.subtotal_amount
        or NEW.tax_rate is distinct from OLD.tax_rate
        or NEW.tax_amount is distinct from OLD.tax_amount
        or NEW.total_amount is distinct from OLD.total_amount
        or NEW.status is distinct from OLD.status
        or NEW.payment_responsibility is distinct from OLD.payment_responsibility
        or NEW.advanced_by_user_id is distinct from OLD.advanced_by_user_id
        or NEW.advanced_by_driver_id is distinct from OLD.advanced_by_driver_id
        or NEW.reimbursable is distinct from OLD.reimbursable
        or NEW.approved_at is distinct from OLD.approved_at
        or NEW.approved_by is distinct from OLD.approved_by
        or NEW.rejected_at is distinct from OLD.rejected_at
        or NEW.rejected_by is distinct from OLD.rejected_by
        or NEW.rejection_reason is distinct from OLD.rejection_reason
        or NEW.cancelled_at is distinct from OLD.cancelled_at
        or NEW.cancelled_by is distinct from OLD.cancelled_by
        or NEW.cancellation_reason is distinct from OLD.cancellation_reason
        or NEW.notes is distinct from OLD.notes
        or NEW.internal_notes is distinct from OLD.internal_notes
        or NEW.created_at is distinct from OLD.created_at
        or NEW.created_by is distinct from OLD.created_by then
        raise exception 'El recálculo interno de gastos finales solo puede modificar campos financieros calculados';
      end if;
    end if;

    if OLD.status = 'approved' then
      if v_recalculate_allowed then
        if NEW.human_code is distinct from OLD.human_code
          or NEW.category_id is distinct from OLD.category_id
          or NEW.supplier_id is distinct from OLD.supplier_id
          or NEW.service_id is distinct from OLD.service_id
          or NEW.vehicle_id is distinct from OLD.vehicle_id
          or NEW.driver_id is distinct from OLD.driver_id
          or NEW.expense_date is distinct from OLD.expense_date
          or NEW.description is distinct from OLD.description
          or NEW.currency_code is distinct from OLD.currency_code
          or NEW.subtotal_amount is distinct from OLD.subtotal_amount
          or NEW.tax_rate is distinct from OLD.tax_rate
          or NEW.tax_amount is distinct from OLD.tax_amount
          or NEW.total_amount is distinct from OLD.total_amount
          or NEW.status is distinct from OLD.status
          or NEW.payment_responsibility is distinct from OLD.payment_responsibility
          or NEW.advanced_by_user_id is distinct from OLD.advanced_by_user_id
          or NEW.advanced_by_driver_id is distinct from OLD.advanced_by_driver_id
          or NEW.reimbursable is distinct from OLD.reimbursable
          or NEW.approved_at is distinct from OLD.approved_at
          or NEW.approved_by is distinct from OLD.approved_by
          or NEW.rejected_at is distinct from OLD.rejected_at
          or NEW.rejected_by is distinct from OLD.rejected_by
          or NEW.rejection_reason is distinct from OLD.rejection_reason
          or NEW.cancelled_at is distinct from OLD.cancelled_at
          or NEW.cancelled_by is distinct from OLD.cancelled_by
          or NEW.cancellation_reason is distinct from OLD.cancellation_reason
          or NEW.notes is distinct from OLD.notes
          or NEW.internal_notes is distinct from OLD.internal_notes
          or NEW.created_at is distinct from OLD.created_at
          or NEW.created_by is distinct from OLD.created_by then
          raise exception 'El recálculo interno de un gasto aprobado solo puede modificar campos financieros calculados';
        end if;
      elsif v_approved_cancel_allowed then
        if NEW.human_code is distinct from OLD.human_code
          or NEW.category_id is distinct from OLD.category_id
          or NEW.supplier_id is distinct from OLD.supplier_id
          or NEW.service_id is distinct from OLD.service_id
          or NEW.vehicle_id is distinct from OLD.vehicle_id
          or NEW.driver_id is distinct from OLD.driver_id
          or NEW.expense_date is distinct from OLD.expense_date
          or NEW.description is distinct from OLD.description
          or NEW.currency_code is distinct from OLD.currency_code
          or NEW.subtotal_amount is distinct from OLD.subtotal_amount
          or NEW.tax_rate is distinct from OLD.tax_rate
          or NEW.tax_amount is distinct from OLD.tax_amount
          or NEW.total_amount is distinct from OLD.total_amount
          or NEW.paid_amount is distinct from OLD.paid_amount
          or NEW.pending_amount is distinct from OLD.pending_amount
          or NEW.payment_responsibility is distinct from OLD.payment_responsibility
          or NEW.advanced_by_user_id is distinct from OLD.advanced_by_user_id
          or NEW.advanced_by_driver_id is distinct from OLD.advanced_by_driver_id
          or NEW.reimbursable is distinct from OLD.reimbursable
          or NEW.approved_at is distinct from OLD.approved_at
          or NEW.approved_by is distinct from OLD.approved_by
          or NEW.rejected_at is distinct from OLD.rejected_at
          or NEW.rejected_by is distinct from OLD.rejected_by
          or NEW.rejection_reason is distinct from OLD.rejection_reason
          or NEW.notes is distinct from OLD.notes
          or NEW.internal_notes is distinct from OLD.internal_notes
          or NEW.created_at is distinct from OLD.created_at
          or NEW.created_by is distinct from OLD.created_by then
          raise exception 'La cancelación controlada de un gasto aprobado solo puede modificar estado, motivo, actor y campos de cierre';
        end if;
      else
        raise exception 'Un gasto aprobado no se puede modificar directamente';
      end if;
    end if;

    if not v_recalculate_allowed then
      if OLD.status = 'draft' and NEW.status not in ('draft', 'submitted', 'cancelled') then
        raise exception 'Transición de estado de gasto no permitida';
      elsif OLD.status = 'submitted' and NEW.status not in ('submitted', 'approved', 'rejected', 'cancelled') then
        raise exception 'Transición de estado de gasto no permitida';
      elsif OLD.status = 'approved' and NEW.status <> OLD.status and not v_approved_cancel_allowed then
        raise exception 'La cancelación de gastos aprobados queda reservada para una función segura futura';
      end if;
    end if;

    NEW.description := trim(NEW.description);
    NEW.currency_code := upper(trim(NEW.currency_code));

    if NEW.subtotal_amount is distinct from OLD.subtotal_amount
      or NEW.tax_rate is distinct from OLD.tax_rate then
      NEW.subtotal_amount := round(NEW.subtotal_amount, 2);
      NEW.tax_rate := round(NEW.tax_rate, 4);
      NEW.tax_amount := round(NEW.subtotal_amount * NEW.tax_rate / 100, 2);
      NEW.total_amount := round(NEW.subtotal_amount + NEW.tax_amount, 2);
    else
      NEW.tax_amount := OLD.tax_amount;
      NEW.total_amount := OLD.total_amount;
    end if;

    if not v_recalculate_allowed then
      if NEW.paid_amount is distinct from OLD.paid_amount
        or NEW.pending_amount is distinct from OLD.pending_amount
        or (NEW.payment_status is distinct from OLD.payment_status and not v_approved_cancel_allowed)
        or (NEW.reimbursement_status is distinct from OLD.reimbursement_status and not v_approved_cancel_allowed) then
        raise exception 'Los campos calculados del gasto solo pueden actualizarse mediante recalculate_expense';
      end if;

      NEW.paid_amount := OLD.paid_amount;
      NEW.pending_amount := OLD.pending_amount;
      if not v_approved_cancel_allowed then
        NEW.payment_status := OLD.payment_status;
        NEW.reimbursement_status := case
          when NEW.payment_responsibility = 'elara' then 'not_applicable'
          when OLD.payment_responsibility is distinct from NEW.payment_responsibility then 'pending'
          else OLD.reimbursement_status
        end;
      end if;
    end if;
  end if;

  if NEW.payment_responsibility = 'elara' then
    NEW.advanced_by_user_id := null;
    NEW.advanced_by_driver_id := null;
    NEW.reimbursable := false;
    if not v_approved_cancel_allowed then
      NEW.reimbursement_status := 'not_applicable';
    end if;
  elsif NEW.payment_responsibility = 'user_advance' then
    NEW.advanced_by_driver_id := null;
    NEW.reimbursable := true;
    if NEW.reimbursement_status = 'not_applicable' then
      NEW.reimbursement_status := 'pending';
    end if;
  elsif NEW.payment_responsibility = 'driver_advance' then
    NEW.advanced_by_user_id := null;
    NEW.reimbursable := true;
    if NEW.reimbursement_status = 'not_applicable' then
      NEW.reimbursement_status := 'pending';
    end if;
  end if;

  if NEW.status = 'approved' and (NEW.approved_at is null or NEW.approved_by is null) then
    raise exception 'La aprobación del gasto requiere fecha y actor';
  end if;

  if NEW.status = 'rejected' and (NEW.rejected_at is null or NEW.rejected_by is null or length(trim(coalesce(NEW.rejection_reason, ''))) = 0) then
    raise exception 'El rechazo del gasto requiere fecha, actor y motivo';
  end if;

  if NEW.status = 'cancelled' and (NEW.cancelled_at is null or NEW.cancelled_by is null or length(trim(coalesce(NEW.cancellation_reason, ''))) = 0) then
    raise exception 'La cancelación del gasto requiere fecha, actor y motivo';
  end if;

  return NEW;
end;
$$;
create or replace function public.prevent_expense_calculated_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancel_allowed boolean := false;
begin
  if current_setting('elara.expense_recalculate', true) is not distinct from OLD.id::text then
    return NEW;
  end if;

  v_cancel_allowed := current_setting('elara.expense_superadmin_cancel', true) is not distinct from OLD.id::text
    and OLD.status = 'approved'
    and NEW.status = 'cancelled';

  if NEW.paid_amount is distinct from OLD.paid_amount
    or NEW.pending_amount is distinct from OLD.pending_amount
    or (NEW.payment_status is distinct from OLD.payment_status and not v_cancel_allowed)
    or (NEW.reimbursement_status is distinct from OLD.reimbursement_status and not v_cancel_allowed) then
    raise exception 'Los campos financieros calculados del gasto solo pueden actualizarse mediante los helpers internos autorizados';
  end if;

  return NEW;
end;
$$;

create or replace function public.prevent_expense_tax_total_direct_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'tax_amount y total_amount son columnas calculadas y no pueden modificarse directamente';
end;
$$;
create or replace function public.validate_expense_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.expense_categories c where c.id = NEW.category_id and c.is_active = true) then
    raise exception 'La categoría del gasto no existe o está inactiva';
  end if;

  if NEW.supplier_id is not null and not exists (select 1 from public.suppliers s where s.id = NEW.supplier_id and s.status = 'active') then
    raise exception 'El proveedor del gasto no existe o está inactivo';
  end if;

  if NEW.service_id is not null and not exists (select 1 from public.services s where s.id = NEW.service_id and s.deleted_at is null) then
    raise exception 'El servicio asociado al gasto no existe o está eliminado';
  end if;

  if NEW.vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = NEW.vehicle_id and v.inactive_at is null) then
    raise exception 'El vehículo asociado al gasto no existe o está inactivo';
  end if;

  if NEW.driver_id is not null and not exists (select 1 from public.drivers d where d.id = NEW.driver_id and d.administrative_status <> 'inactive') then
    raise exception 'El conductor asociado al gasto no existe o está inactivo';
  end if;

  if NEW.advanced_by_user_id is not null and not exists (select 1 from public.app_users u where u.id = NEW.advanced_by_user_id and u.status = 'active') then
    raise exception 'El usuario que adelantó el gasto no existe o está inactivo';
  end if;

  if NEW.advanced_by_driver_id is not null and not exists (select 1 from public.drivers d where d.id = NEW.advanced_by_driver_id and d.administrative_status <> 'inactive') then
    raise exception 'El conductor que adelantó el gasto no existe o está inactivo';
  end if;

  return NEW;
end;
$$;

create or replace function public.recalculate_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_paid_amount numeric(14, 2);
  v_reimbursed_amount numeric(14, 2);
  v_payment_status text;
  v_reimbursement_status text;
begin
  select *
  into v_expense
  from public.expenses
  where id = p_expense_id
  for update;

  if not found then
    raise exception 'El gasto no existe';
  end if;

  select coalesce(round(sum(p.amount), 2), 0)
  into v_paid_amount
  from public.expense_payments p
  where p.expense_id = p_expense_id
    and p.payment_status = 'completed';

  if v_paid_amount > v_expense.total_amount then
    raise exception 'Los pagos activos superan el total del gasto';
  end if;

  if v_expense.status = 'cancelled' then
    v_payment_status := 'cancelled';
  elsif v_paid_amount = 0 then
    v_payment_status := 'unpaid';
  elsif v_paid_amount = v_expense.total_amount then
    v_payment_status := 'paid';
  else
    v_payment_status := 'partial';
  end if;

  select coalesce(round(sum(r.amount), 2), 0)
  into v_reimbursed_amount
  from public.expense_reimbursements r
  where r.expense_id = p_expense_id
    and r.status = 'completed';

  if v_reimbursed_amount > v_expense.total_amount then
    raise exception 'Los reembolsos activos superan el total del gasto';
  end if;

  if v_expense.status = 'cancelled' then
    v_reimbursement_status := 'cancelled';
  elsif v_expense.reimbursable = false then
    v_reimbursement_status := 'not_applicable';
  elsif v_reimbursed_amount = v_expense.total_amount then
    v_reimbursement_status := 'reimbursed';
  else
    v_reimbursement_status := 'pending';
  end if;

  perform set_config('elara.expense_recalculate', p_expense_id::text, true);

  update public.expenses
  set paid_amount = v_paid_amount,
      pending_amount = round(total_amount - v_paid_amount, 2),
      payment_status = v_payment_status,
      reimbursement_status = v_reimbursement_status,
      updated_at = now()
  where id = p_expense_id;

  perform set_config('elara.expense_recalculate', '', true);
end;
$$;

create or replace function public.recalculate_expense_from_expense_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.status is distinct from OLD.status or NEW.reimbursable is distinct from OLD.reimbursable then
      perform public.recalculate_expense(NEW.id);
    end if;
    return NEW;
  elsif TG_OP = 'INSERT' then
    perform public.recalculate_expense(NEW.id);
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.recalculate_expense_from_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.recalculate_expense(NEW.expense_id);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.expense_id is distinct from OLD.expense_id
      or NEW.payment_status is distinct from OLD.payment_status
      or NEW.amount is distinct from OLD.amount then
      perform public.recalculate_expense(NEW.expense_id);
      if NEW.expense_id is distinct from OLD.expense_id then
        perform public.recalculate_expense(OLD.expense_id);
      end if;
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.recalculate_expense_from_reimbursement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.recalculate_expense(NEW.expense_id);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.expense_id is distinct from OLD.expense_id
      or NEW.status is distinct from OLD.status
      or NEW.amount is distinct from OLD.amount then
      perform public.recalculate_expense(NEW.expense_id);
      if NEW.expense_id is distinct from OLD.expense_id then
        perform public.recalculate_expense(OLD.expense_id);
      end if;
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.record_expense_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_reason text;
begin
  if TG_OP = 'INSERT' then
    v_actor := coalesce(NEW.created_by, NEW.updated_by, NEW.approved_by, NEW.rejected_by, NEW.cancelled_by);
    insert into public.expense_status_history (expense_id, from_status, to_status, changed_by_user_id, reason, metadata)
    values (NEW.id, null, NEW.status, v_actor, null, jsonb_build_object('origin', 'expense_insert'));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.status is distinct from OLD.status then
      v_actor := coalesce(NEW.updated_by, NEW.approved_by, NEW.rejected_by, NEW.cancelled_by, OLD.updated_by, OLD.created_by);
      v_reason := case
        when NEW.status = 'rejected' then NEW.rejection_reason
        when NEW.status = 'cancelled' then NEW.cancellation_reason
        else null
      end;

      insert into public.expense_status_history (expense_id, from_status, to_status, changed_by_user_id, reason, metadata)
      values (NEW.id, OLD.status, NEW.status, v_actor, v_reason, jsonb_build_object('origin', 'expense_status_update'));
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

create or replace function public.prevent_expense_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los gastos no se eliminan físicamente; deben anularse con trazabilidad';
end;
$$;

create or replace function public.prevent_expense_status_history_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    raise exception 'El historial de estados de gastos es append-only';
  elsif TG_OP = 'DELETE' then
    raise exception 'El historial de estados de gastos no se elimina físicamente';
  end if;

  return null;
end;
$$;

create or replace function public.prepare_expense_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_status text;
begin
  if TG_OP = 'DELETE' then
    select e.status into v_expense_status from public.expenses e where e.id = OLD.expense_id;
    if v_expense_status in ('approved', 'cancelled') then
      raise exception 'No se pueden eliminar allocations de un gasto aprobado o cancelado';
    end if;
    return OLD;
  elsif TG_OP = 'UPDATE' then
    select e.status into v_expense_status from public.expenses e where e.id = OLD.expense_id;
    if v_expense_status in ('approved', 'cancelled') then
      raise exception 'No se pueden modificar allocations de un gasto aprobado o cancelado';
    end if;

    if NEW.expense_id is distinct from OLD.expense_id then
      raise exception 'No se puede mover una allocation entre gastos';
    end if;
  elsif TG_OP = 'INSERT' then
    select e.status into v_expense_status from public.expenses e where e.id = NEW.expense_id;
    if v_expense_status in ('approved', 'cancelled') then
      raise exception 'No se pueden crear allocations sobre un gasto aprobado o cancelado';
    end if;
  end if;

  NEW.allocated_amount := round(NEW.allocated_amount, 2);

  if NEW.service_id is not null and not exists (select 1 from public.services s where s.id = NEW.service_id and s.deleted_at is null) then
    raise exception 'El servicio de la allocation no existe o está eliminado';
  end if;

  if NEW.vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = NEW.vehicle_id and v.inactive_at is null) then
    raise exception 'El vehículo de la allocation no existe o está inactivo';
  end if;

  if NEW.driver_id is not null and not exists (select 1 from public.drivers d where d.id = NEW.driver_id and d.administrative_status <> 'inactive') then
    raise exception 'El conductor de la allocation no existe o está inactivo';
  end if;

  return NEW;
end;
$$;

create or replace function public.validate_expense_allocation_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_total numeric(14, 2);
  v_allocated numeric(14, 2);
  v_status text;
begin
  if TG_TABLE_NAME = 'expense_allocations' then
    if TG_OP = 'DELETE' then
      v_expense_id := OLD.expense_id;
    else
      v_expense_id := NEW.expense_id;
    end if;
  elsif TG_TABLE_NAME = 'expenses' then
    v_expense_id := NEW.id;
  end if;

  select e.total_amount, e.status
  into v_total, v_status
  from public.expenses e
  where e.id = v_expense_id;

  select coalesce(round(sum(a.allocated_amount), 2), 0)
  into v_allocated
  from public.expense_allocations a
  where a.expense_id = v_expense_id;

  if v_allocated > v_total then
    raise exception 'Las allocations del gasto superan el total aprobado';
  end if;

  if v_status = 'approved' and v_allocated > 0 and v_allocated <> v_total then
    raise exception 'Un gasto aprobado con allocations debe distribuir el total completo';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;
end;
$$;

create or replace function public.prepare_expense_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_becoming_completed boolean := false;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Los pagos de gastos no se eliminan físicamente; deben anularse o revertirse';
  elsif TG_OP = 'UPDATE' then
    if NEW.expense_id is distinct from OLD.expense_id then
      raise exception 'No se puede mover un pago entre gastos';
    end if;

    if OLD.payment_status in ('cancelled', 'reversed') and NEW.payment_status is distinct from OLD.payment_status then
      raise exception 'No se puede reactivar un pago de gasto anulado o revertido';
    end if;

    if OLD.payment_status = 'completed' then
      if NEW.payment_status not in ('completed', 'cancelled', 'reversed') then
        raise exception 'Un pago completado solo puede conservarse, anularse o revertirse';
      end if;

      if NEW.amount is distinct from OLD.amount
        or NEW.currency_code is distinct from OLD.currency_code
        or NEW.payment_method is distinct from OLD.payment_method
        or NEW.cash_account_id is distinct from OLD.cash_account_id then
        raise exception 'No se pueden alterar los datos económicos de un pago completado';
      end if;
    end if;

    v_becoming_completed := NEW.payment_status = 'completed' and OLD.payment_status is distinct from 'completed';
  elsif TG_OP = 'INSERT' then
    v_becoming_completed := NEW.payment_status = 'completed';
  end if;

  NEW.currency_code := upper(trim(NEW.currency_code));
  NEW.amount := round(NEW.amount, 2);

  select *
  into v_expense
  from public.expenses
  where id = NEW.expense_id
  for update;

  if not found then
    raise exception 'El gasto asociado al pago no existe';
  end if;

  if NEW.currency_code <> v_expense.currency_code then
    raise exception 'La moneda del pago debe coincidir con la moneda del gasto';
  end if;

  if v_expense.payment_responsibility <> 'elara' then
    raise exception 'Los gastos adelantados deben reembolsarse, no registrarse como pago a proveedor';
  end if;

  if NEW.payment_method = 'cash' then
    if not exists (
      select 1
      from public.cash_accounts account
      where account.id = NEW.cash_account_id
        and account.status = 'active'
        and account.currency_code = NEW.currency_code
    ) then
      raise exception 'El pago en efectivo requiere una caja activa con la misma moneda';
    end if;
  end if;

  if v_becoming_completed then
    if v_expense.status <> 'approved' then
      raise exception 'Solo se puede pagar un gasto aprobado';
    end if;

    if v_expense.payment_responsibility <> 'elara' then
      raise exception 'Los gastos adelantados deben reembolsarse, no pagarse a proveedor';
    end if;

    if exists (
      select 1
      from public.expense_payments payment
      where payment.expense_id = NEW.expense_id
        and payment.payment_status = 'completed'
        and payment.id <> NEW.id
    ) then
      raise exception 'El gasto ya tiene un pago completado';
    end if;

    if NEW.amount <> v_expense.pending_amount then
      raise exception 'El pago de gasto debe cubrir el pendiente completo';
    end if;

    if NEW.created_by is null or not exists (select 1 from public.app_users u where u.id = NEW.created_by and u.status = 'active') then
      raise exception 'El pago completado requiere un actor activo en created_by';
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function public.prepare_expense_reimbursement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_becoming_completed boolean := false;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Los reembolsos de gastos no se eliminan físicamente; deben anularse o revertirse';
  elsif TG_OP = 'UPDATE' then
    if NEW.expense_id is distinct from OLD.expense_id then
      raise exception 'No se puede mover un reembolso entre gastos';
    end if;

    if OLD.status in ('cancelled', 'reversed') and NEW.status is distinct from OLD.status then
      raise exception 'No se puede reactivar un reembolso anulado o revertido';
    end if;

    if OLD.status = 'completed' then
      if NEW.status not in ('completed', 'cancelled', 'reversed') then
        raise exception 'Un reembolso completado solo puede conservarse, anularse o revertirse';
      end if;

      if NEW.amount is distinct from OLD.amount
        or NEW.currency_code is distinct from OLD.currency_code
        or NEW.payment_method is distinct from OLD.payment_method
        or NEW.cash_account_id is distinct from OLD.cash_account_id
        or NEW.reimbursed_user_id is distinct from OLD.reimbursed_user_id
        or NEW.reimbursed_driver_id is distinct from OLD.reimbursed_driver_id then
        raise exception 'No se pueden alterar los datos económicos de un reembolso completado';
      end if;
    end if;

    v_becoming_completed := NEW.status = 'completed' and OLD.status is distinct from 'completed';
  elsif TG_OP = 'INSERT' then
    v_becoming_completed := NEW.status = 'completed';
  end if;

  NEW.currency_code := upper(trim(NEW.currency_code));
  NEW.amount := round(NEW.amount, 2);

  select *
  into v_expense
  from public.expenses
  where id = NEW.expense_id
  for update;

  if not found then
    raise exception 'El gasto asociado al reembolso no existe';
  end if;

  if NEW.currency_code <> v_expense.currency_code then
    raise exception 'La moneda del reembolso debe coincidir con la moneda del gasto';
  end if;

  if v_expense.reimbursable = false or v_expense.payment_responsibility = 'elara' then
    raise exception 'El gasto no corresponde a un adelanto reembolsable';
  end if;

  if v_expense.payment_responsibility = 'user_advance'
    and (NEW.reimbursed_user_id is distinct from v_expense.advanced_by_user_id or NEW.reimbursed_driver_id is not null) then
    raise exception 'El beneficiario del reembolso no coincide con el usuario que adelantó el gasto';
  end if;

  if v_expense.payment_responsibility = 'driver_advance'
    and (NEW.reimbursed_driver_id is distinct from v_expense.advanced_by_driver_id or NEW.reimbursed_user_id is not null) then
    raise exception 'El beneficiario del reembolso no coincide con el conductor que adelantó el gasto';
  end if;

  if NEW.payment_method = 'cash' then
    if not exists (
      select 1
      from public.cash_accounts account
      where account.id = NEW.cash_account_id
        and account.status = 'active'
        and account.currency_code = NEW.currency_code
    ) then
      raise exception 'El reembolso en efectivo requiere una caja activa con la misma moneda';
    end if;
  end if;

  if v_becoming_completed then
    if v_expense.status <> 'approved' then
      raise exception 'Solo se puede reembolsar un gasto aprobado';
    end if;

    if v_expense.reimbursable = false or v_expense.payment_responsibility = 'elara' then
      raise exception 'El gasto no corresponde a un adelanto reembolsable';
    end if;

    if v_expense.payment_responsibility = 'user_advance'
      and (NEW.reimbursed_user_id is distinct from v_expense.advanced_by_user_id or NEW.reimbursed_driver_id is not null) then
      raise exception 'El beneficiario del reembolso no coincide con el usuario que adelantó el gasto';
    end if;

    if v_expense.payment_responsibility = 'driver_advance'
      and (NEW.reimbursed_driver_id is distinct from v_expense.advanced_by_driver_id or NEW.reimbursed_user_id is not null) then
      raise exception 'El beneficiario del reembolso no coincide con el conductor que adelantó el gasto';
    end if;

    if exists (
      select 1
      from public.expense_reimbursements reimbursement
      where reimbursement.expense_id = NEW.expense_id
        and reimbursement.status = 'completed'
        and reimbursement.id <> NEW.id
    ) then
      raise exception 'El gasto ya tiene un reembolso completado';
    end if;

    if NEW.amount <> v_expense.total_amount then
      raise exception 'El reembolso de gasto debe cubrir el importe completo';
    end if;

    if NEW.created_by is null or not exists (select 1 from public.app_users u where u.id = NEW.created_by and u.status = 'active') then
      raise exception 'El reembolso completado requiere un actor activo en created_by';
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function public.prepare_expense_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_status text;
  v_replacement_allowed boolean := false;
begin
  if TG_OP = 'DELETE' then
    raise exception 'Los documentos de gastos no se eliminan físicamente; deben reemplazarse o anularse';
  elsif TG_OP = 'UPDATE' then
    if NEW.expense_id is distinct from OLD.expense_id then
      raise exception 'No se puede mover un documento entre gastos';
    end if;

    select e.status into v_expense_status from public.expenses e where e.id = NEW.expense_id;
    v_replacement_allowed := current_setting('elara.expense_document_replacement', true) is not distinct from NEW.expense_id::text;

    if v_expense_status = 'approved' and not v_replacement_allowed then
      raise exception 'No se pueden modificar documentos de un gasto aprobado fuera del flujo controlado de reemplazo';
    end if;

    if v_expense_status = 'cancelled' and NEW.status not in ('annulled', OLD.status) then
      raise exception 'No se pueden añadir cambios documentales activos a un gasto cancelado';
    end if;
  elsif TG_OP = 'INSERT' then
    select e.status into v_expense_status from public.expenses e where e.id = NEW.expense_id;

    if not found then
      raise exception 'El gasto del documento no existe';
    end if;

    v_replacement_allowed := current_setting('elara.expense_document_replacement', true) is not distinct from NEW.expense_id::text;

    if v_expense_status = 'approved' and not v_replacement_allowed then
      raise exception 'No se pueden añadir documentos a un gasto aprobado fuera del flujo controlado de reemplazo';
    end if;

    if v_expense_status = 'cancelled' then
      raise exception 'No se pueden añadir documentos a un gasto cancelado';
    end if;
  end if;

  if NEW.storage_bucket is not null then
    NEW.storage_bucket := trim(NEW.storage_bucket);
  end if;

  if NEW.storage_path is not null then
    NEW.storage_path := trim(NEW.storage_path);
  end if;

  if NEW.file_name is not null then
    NEW.file_name := trim(NEW.file_name);
  end if;

  if NEW.status = 'replaced' and NEW.replaced_by_document_id is null then
    raise exception 'Un documento reemplazado debe indicar el documento sustituto';
  end if;

  return NEW;
end;
$$;

drop trigger if exists set_updated_at_expense_categories on public.expense_categories;
create trigger set_updated_at_expense_categories
before update on public.expense_categories
for each row execute function public.set_updated_at();

drop trigger if exists prevent_expense_category_cycle_trigger on public.expense_categories;
create trigger prevent_expense_category_cycle_trigger
before insert or update of parent_category_id
on public.expense_categories
for each row execute function public.prevent_expense_category_cycle();

drop trigger if exists prevent_expense_category_delete_trigger on public.expense_categories;
create trigger prevent_expense_category_delete_trigger
before delete on public.expense_categories
for each row execute function public.prevent_expense_category_delete();

drop trigger if exists set_updated_at_expenses on public.expenses;
create trigger set_updated_at_expenses
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists assign_expense_human_code_trigger on public.expenses;
create trigger assign_expense_human_code_trigger
before insert or update of human_code
on public.expenses
for each row execute function public.assign_expense_human_code();

drop trigger if exists prepare_expense_trigger on public.expenses;
create trigger prepare_expense_trigger
before insert or update
on public.expenses
for each row execute function public.prepare_expense();

drop trigger if exists aa_prevent_expense_tax_total_direct_update_trigger on public.expenses;
create trigger aa_prevent_expense_tax_total_direct_update_trigger
before update of tax_amount, total_amount
on public.expenses
for each row execute function public.prevent_expense_tax_total_direct_update();
comment on trigger aa_prevent_expense_tax_total_direct_update_trigger on public.expenses is 'Column-specific guard: PostgreSQL fires this when tax_amount or total_amount appears in UPDATE SET, independent of later recalculation triggers.';
drop trigger if exists prevent_expense_calculated_update_trigger on public.expenses;
create trigger prevent_expense_calculated_update_trigger
before update of paid_amount, pending_amount, payment_status, reimbursement_status
on public.expenses
for each row execute function public.prevent_expense_calculated_update();

drop trigger if exists validate_expense_references_trigger on public.expenses;
create trigger validate_expense_references_trigger
before insert or update of category_id, supplier_id, service_id, vehicle_id, driver_id, advanced_by_user_id, advanced_by_driver_id
on public.expenses
for each row execute function public.validate_expense_references();

drop trigger if exists record_expense_status_change_trigger on public.expenses;
create trigger record_expense_status_change_trigger
after insert or update of status
on public.expenses
for each row execute function public.record_expense_status_change();

drop trigger if exists recalculate_expense_from_status_trigger on public.expenses;
create trigger recalculate_expense_from_status_trigger
after insert or update of status, reimbursable
on public.expenses
for each row execute function public.recalculate_expense_from_expense_status();

drop trigger if exists prevent_expense_delete_trigger on public.expenses;
create trigger prevent_expense_delete_trigger
before delete on public.expenses
for each row execute function public.prevent_expense_delete();

drop trigger if exists prepare_expense_allocation_trigger on public.expense_allocations;
create trigger prepare_expense_allocation_trigger
before insert or update or delete
on public.expense_allocations
for each row execute function public.prepare_expense_allocation();

drop trigger if exists validate_expense_allocation_totals_trigger on public.expense_allocations;
create constraint trigger validate_expense_allocation_totals_trigger
after insert or update or delete
on public.expense_allocations
deferrable initially deferred
for each row execute function public.validate_expense_allocation_totals();

drop trigger if exists validate_expense_totals_against_allocations_trigger on public.expenses;
create constraint trigger validate_expense_totals_against_allocations_trigger
after insert or update of status, total_amount
on public.expenses
deferrable initially deferred
for each row execute function public.validate_expense_allocation_totals();

drop trigger if exists set_updated_at_expense_payments on public.expense_payments;
create trigger set_updated_at_expense_payments
before update on public.expense_payments
for each row execute function public.set_updated_at();

drop trigger if exists assign_expense_payment_human_code_trigger on public.expense_payments;
create trigger assign_expense_payment_human_code_trigger
before insert or update of human_code
on public.expense_payments
for each row execute function public.assign_expense_payment_human_code();

drop trigger if exists prepare_expense_payment_trigger on public.expense_payments;
create trigger prepare_expense_payment_trigger
before insert or update or delete
on public.expense_payments
for each row execute function public.prepare_expense_payment();

drop trigger if exists recalculate_expense_from_payment_trigger on public.expense_payments;
create trigger recalculate_expense_from_payment_trigger
after insert or update of expense_id, payment_status, amount
on public.expense_payments
for each row execute function public.recalculate_expense_from_payment();

drop trigger if exists set_updated_at_expense_reimbursements on public.expense_reimbursements;
create trigger set_updated_at_expense_reimbursements
before update on public.expense_reimbursements
for each row execute function public.set_updated_at();

drop trigger if exists assign_expense_reimbursement_human_code_trigger on public.expense_reimbursements;
create trigger assign_expense_reimbursement_human_code_trigger
before insert or update of human_code
on public.expense_reimbursements
for each row execute function public.assign_expense_reimbursement_human_code();

drop trigger if exists prepare_expense_reimbursement_trigger on public.expense_reimbursements;
create trigger prepare_expense_reimbursement_trigger
before insert or update or delete
on public.expense_reimbursements
for each row execute function public.prepare_expense_reimbursement();

drop trigger if exists recalculate_expense_from_reimbursement_trigger on public.expense_reimbursements;
create trigger recalculate_expense_from_reimbursement_trigger
after insert or update of expense_id, status, amount
on public.expense_reimbursements
for each row execute function public.recalculate_expense_from_reimbursement();

drop trigger if exists set_updated_at_expense_documents on public.expense_documents;
create trigger set_updated_at_expense_documents
before update on public.expense_documents
for each row execute function public.set_updated_at();

drop trigger if exists prepare_expense_document_trigger on public.expense_documents;
create trigger prepare_expense_document_trigger
before insert or update or delete
on public.expense_documents
for each row execute function public.prepare_expense_document();

drop trigger if exists prevent_expense_status_history_changes_trigger on public.expense_status_history;
create trigger prevent_expense_status_history_changes_trigger
before update or delete
on public.expense_status_history
for each row execute function public.prevent_expense_status_history_changes();

revoke all on table public.expense_categories from public, anon, authenticated;
revoke all on table public.expenses from public, anon, authenticated;
revoke all on table public.expense_allocations from public, anon, authenticated;
revoke all on table public.expense_payments from public, anon, authenticated;
revoke all on table public.expense_reimbursements from public, anon, authenticated;
revoke all on table public.expense_documents from public, anon, authenticated;
revoke all on table public.expense_status_history from public, anon, authenticated;

grant all on table public.expense_categories to service_role;
grant all on table public.expenses to service_role;
grant all on table public.expense_allocations to service_role;
grant all on table public.expense_payments to service_role;
grant all on table public.expense_reimbursements to service_role;
grant all on table public.expense_documents to service_role;
grant all on table public.expense_status_history to service_role;

revoke all on function public.prevent_expense_category_cycle() from public, anon, authenticated;
revoke all on function public.prevent_expense_category_delete() from public, anon, authenticated;
revoke all on function public.assign_expense_human_code() from public, anon, authenticated;
revoke all on function public.assign_expense_payment_human_code() from public, anon, authenticated;
revoke all on function public.assign_expense_reimbursement_human_code() from public, anon, authenticated;
revoke all on function public.prepare_expense() from public, anon, authenticated;
revoke all on function public.prevent_expense_calculated_update() from public, anon, authenticated;
revoke all on function public.prevent_expense_tax_total_direct_update() from public, anon, authenticated;
revoke all on function public.validate_expense_references() from public, anon, authenticated;
revoke all on function public.recalculate_expense(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_expense_from_expense_status() from public, anon, authenticated;
revoke all on function public.recalculate_expense_from_payment() from public, anon, authenticated;
revoke all on function public.recalculate_expense_from_reimbursement() from public, anon, authenticated;
revoke all on function public.record_expense_status_change() from public, anon, authenticated;
revoke all on function public.prevent_expense_delete() from public, anon, authenticated;
revoke all on function public.prevent_expense_status_history_changes() from public, anon, authenticated;
revoke all on function public.prepare_expense_allocation() from public, anon, authenticated;
revoke all on function public.validate_expense_allocation_totals() from public, anon, authenticated;
revoke all on function public.prepare_expense_payment() from public, anon, authenticated;
revoke all on function public.prepare_expense_reimbursement() from public, anon, authenticated;
revoke all on function public.prepare_expense_document() from public, anon, authenticated;

grant execute on function public.prevent_expense_category_cycle() to service_role;
grant execute on function public.prevent_expense_category_delete() to service_role;
grant execute on function public.assign_expense_human_code() to service_role;
grant execute on function public.assign_expense_payment_human_code() to service_role;
grant execute on function public.assign_expense_reimbursement_human_code() to service_role;
grant execute on function public.prepare_expense() to service_role;
grant execute on function public.prevent_expense_calculated_update() to service_role;
grant execute on function public.prevent_expense_tax_total_direct_update() to service_role;
grant execute on function public.validate_expense_references() to service_role;
grant execute on function public.recalculate_expense(uuid) to service_role;
grant execute on function public.recalculate_expense_from_expense_status() to service_role;
grant execute on function public.recalculate_expense_from_payment() to service_role;
grant execute on function public.recalculate_expense_from_reimbursement() to service_role;
grant execute on function public.record_expense_status_change() to service_role;
grant execute on function public.prevent_expense_delete() to service_role;
grant execute on function public.prevent_expense_status_history_changes() to service_role;
grant execute on function public.prepare_expense_allocation() to service_role;
grant execute on function public.validate_expense_allocation_totals() to service_role;
grant execute on function public.prepare_expense_payment() to service_role;
grant execute on function public.prepare_expense_reimbursement() to service_role;
grant execute on function public.prepare_expense_document() to service_role;

do $$
declare
  v_table text;
  v_function text;
  v_trigger text;
  v_missing_categories text[];
begin
  foreach v_table in array array[
    'expense_categories',
    'expenses',
    'expense_allocations',
    'expense_payments',
    'expense_reimbursements',
    'expense_documents',
    'expense_status_history'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Missing expense table: %', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
      or has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('anon', 'public.' || v_table, 'DELETE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') then
      raise exception 'Direct access to expense table % must remain closed for anon/authenticated', v_table;
    end if;
  end loop;

  select array_agg(required.key order by required.key)
  into v_missing_categories
  from (
    values
      ('fuel'), ('tolls'), ('parking'), ('maintenance'), ('repairs'), ('cleaning'),
      ('insurance'), ('taxes_fees'), ('driver_allowance'), ('subcontracted_service'),
      ('office'), ('software'), ('marketing'), ('professional_services'), ('other')
  ) as required(key)
  where not exists (select 1 from public.expense_categories c where c.key = required.key);

  if v_missing_categories is not null then
    raise exception 'Missing initial expense categories: %', v_missing_categories;
  end if;

  if exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix in ('EXP', 'EXPPAY', 'EXPRMB')
      and (counter.padding <> 6 or counter.is_active is not true)
  ) or (
    select count(*)
    from public.human_code_counters counter
    where counter.prefix in ('EXP', 'EXPPAY', 'EXPRMB')
  ) <> 3 then
    raise exception 'Expense human code counters EXP, EXPPAY and EXPRMB must exist, be active and use padding 6';
  end if;

  if exists (select 1 from public.expenses where human_code !~ '^EXP-[0-9]{6}$') then
    raise exception 'Invalid expense human code detected';
  end if;

  if exists (select 1 from public.expense_payments where human_code !~ '^EXPPAY-[0-9]{6}$') then
    raise exception 'Invalid expense payment human code detected';
  end if;

  if exists (select 1 from public.expense_reimbursements where human_code !~ '^EXPRMB-[0-9]{6}$') then
    raise exception 'Invalid expense reimbursement human code detected';
  end if;

  foreach v_function in array array[
    'public.prevent_expense_category_cycle()',
    'public.prevent_expense_category_delete()',
    'public.assign_expense_human_code()',
    'public.assign_expense_payment_human_code()',
    'public.assign_expense_reimbursement_human_code()',
    'public.prepare_expense()',
    'public.prevent_expense_calculated_update()',
    'public.prevent_expense_tax_total_direct_update()',
    'public.validate_expense_references()',
    'public.recalculate_expense(uuid)',
    'public.recalculate_expense_from_expense_status()',
    'public.recalculate_expense_from_payment()',
    'public.recalculate_expense_from_reimbursement()',
    'public.record_expense_status_change()',
    'public.prevent_expense_delete()',
    'public.prevent_expense_status_history_changes()',
    'public.prepare_expense_allocation()',
    'public.validate_expense_allocation_totals()',
    'public.prepare_expense_payment()',
    'public.prepare_expense_reimbursement()',
    'public.prepare_expense_document()'
  ] loop
    if to_regprocedure(v_function) is null then
      raise exception 'Missing expense function: %', v_function;
    end if;

    if has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'Direct execute privilege on % must remain closed for anon/authenticated', v_function;
    end if;
  end loop;

  foreach v_trigger in array array[
    'assign_expense_human_code_trigger',
    'prepare_expense_trigger',
    'prevent_expense_calculated_update_trigger',
    'aa_prevent_expense_tax_total_direct_update_trigger',
    'validate_expense_references_trigger',
    'record_expense_status_change_trigger',
    'recalculate_expense_from_status_trigger',
    'prevent_expense_delete_trigger',
    'prepare_expense_allocation_trigger',
    'validate_expense_allocation_totals_trigger',
    'assign_expense_payment_human_code_trigger',
    'prepare_expense_payment_trigger',
    'recalculate_expense_from_payment_trigger',
    'assign_expense_reimbursement_human_code_trigger',
    'prepare_expense_reimbursement_trigger',
    'recalculate_expense_from_reimbursement_trigger',
    'prepare_expense_document_trigger',
    'prevent_expense_status_history_changes_trigger'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = v_trigger and not tgisinternal) then
      raise exception 'Missing expense trigger: %', v_trigger;
    end if;
  end loop;

  if exists (
    select 1
    from public.expenses e
    where e.tax_amount <> round(e.subtotal_amount * e.tax_rate / 100, 2)
       or e.total_amount <> round(e.subtotal_amount + e.tax_amount, 2)
       or e.pending_amount <> round(e.total_amount - e.paid_amount, 2)
       or e.paid_amount < 0
       or e.pending_amount < 0
  ) then
    raise exception 'Invalid calculated expense amounts detected';
  end if;

  if exists (
    select 1
    from public.expense_payments p
    join public.expenses e on e.id = p.expense_id
    where p.payment_status = 'completed'
      and (p.amount <> e.total_amount or p.currency_code <> e.currency_code or p.created_by is null)
  ) then
    raise exception 'Completed expense payments must be full, currency-coherent and actor-traced';
  end if;

  if exists (
    select 1
    from public.expense_reimbursements r
    join public.expenses e on e.id = r.expense_id
    where r.status = 'completed'
      and (r.amount <> e.total_amount or r.currency_code <> e.currency_code or r.created_by is null)
  ) then
    raise exception 'Completed expense reimbursements must be full, currency-coherent and actor-traced';
  end if;

  if exists (
    select 1
    from public.expense_reimbursements r
    join public.expenses e on e.id = r.expense_id
    where r.status = 'completed'
      and (
        e.reimbursable is not true
        or (e.payment_responsibility = 'user_advance' and (r.reimbursed_user_id is distinct from e.advanced_by_user_id or r.reimbursed_driver_id is not null))
        or (e.payment_responsibility = 'driver_advance' and (r.reimbursed_driver_id is distinct from e.advanced_by_driver_id or r.reimbursed_user_id is not null))
      )
  ) then
    raise exception 'Invalid expense reimbursement beneficiary detected';
  end if;

  if exists (
    select 1
    from public.expense_allocations a
    join public.expenses e on e.id = a.expense_id
    group by a.expense_id, e.total_amount, e.status
    having round(sum(a.allocated_amount), 2) > e.total_amount
       or (e.status = 'approved' and round(sum(a.allocated_amount), 2) <> e.total_amount)
  ) then
    raise exception 'Invalid expense allocation totals detected';
  end if;

  if exists (
    select 1
    from public.expense_status_history h
    where (h.from_status is not null and h.from_status = h.to_status)
       or jsonb_typeof(h.metadata) <> 'object'
  ) then
    raise exception 'Invalid expense status history detected';
  end if;

  if exists (
    select 1
    from public.expenses e
    where e.status = 'approved' and (e.approved_at is null or e.approved_by is null)
       or e.status = 'rejected' and (e.rejected_at is null or e.rejected_by is null or length(trim(coalesce(e.rejection_reason, ''))) = 0)
       or e.status = 'cancelled' and (e.cancelled_at is null or e.cancelled_by is null or length(trim(coalesce(e.cancellation_reason, ''))) = 0)
  ) then
    raise exception 'Final or approved expenses require actor, date and reason fields according to status';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.cash_movements'::regclass
      and trigger_row.tgname ilike '%expense%'
  ) then
    raise exception 'Expenses migration must not install automatic cash movement triggers';
  end if;

  if exists (
    select 1
    from information_schema.tables table_row
    where table_row.table_schema = 'public'
      and table_row.table_name in ('expense_liquidation_links', 'settlements', 'settlement_service_items', 'settlement_expense_items')
  ) then
    raise exception 'Expenses migration must not create settlement or liquidation tables';
  end if;

  if exists (select 1 from public.expenses)
    or exists (select 1 from public.expense_payments)
    or exists (select 1 from public.expense_reimbursements)
    or exists (select 1 from public.expense_allocations)
    or exists (select 1 from public.expense_documents)
    or exists (select 1 from public.expense_status_history) then
    raise exception 'Migration 0010 must not seed expense business records';
  end if;
end;
$$;
