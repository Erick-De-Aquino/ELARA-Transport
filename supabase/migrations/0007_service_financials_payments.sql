-- ELARA Transport V4.0
-- Migration 0007: service financials and payments.
--
-- This migration creates the financial structure attached to services.
-- It does not create Caja, receivables, expenses, settlements, RLS policies
-- or frontend integration.

create table if not exists public.service_financials (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  currency_code text not null default 'EUR',
  subtotal_amount numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  surcharge_amount numeric(14, 2) not null default 0,
  taxable_base_amount numeric(14, 2) not null default 0,
  tax_rate numeric(7, 4) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  pending_amount numeric(14, 2) not null default 0,
  financial_status text not null default 'pending',
  pricing_status text not null default 'draft',
  finalized_at timestamptz,
  finalized_by uuid references public.app_users(id) on delete restrict,
  notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint service_financials_service_id_unique
    unique (service_id),
  constraint service_financials_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint service_financials_amounts_non_negative
    check (
      subtotal_amount >= 0
      and discount_amount >= 0
      and surcharge_amount >= 0
      and taxable_base_amount >= 0
      and tax_amount >= 0
      and total_amount >= 0
      and paid_amount >= 0
      and pending_amount >= 0
    ),
  constraint service_financials_tax_rate_range
    check (tax_rate >= 0 and tax_rate <= 100),
  constraint service_financials_taxable_formula
    check (taxable_base_amount = round(subtotal_amount + surcharge_amount - discount_amount, 2)),
  constraint service_financials_tax_formula
    check (tax_amount = round(taxable_base_amount * tax_rate / 100, 2)),
  constraint service_financials_total_formula
    check (total_amount = round(taxable_base_amount + tax_amount, 2)),
  constraint service_financials_pending_formula
    check (pending_amount = round(total_amount - paid_amount, 2)),
  constraint service_financials_status_check
    check (financial_status in ('pending', 'paid', 'partial', 'cancelled', 'not_collectible')),
  constraint service_financials_pricing_status_check
    check (pricing_status in ('draft', 'finalized', 'cancelled')),
  constraint service_financials_finalized_fields
    check (pricing_status <> 'finalized' or finalized_at is not null),
  constraint service_financials_paid_status_match
    check (financial_status <> 'paid' or (total_amount > 0 and paid_amount = total_amount and pending_amount = 0)),
  constraint service_financials_partial_status_match
    check (financial_status <> 'partial' or (paid_amount > 0 and pending_amount > 0)),
  constraint service_financials_pending_status_match
    check (financial_status <> 'pending' or paid_amount = 0),
  constraint service_financials_not_overpaid
    check (paid_amount <= total_amount)
);

comment on table public.service_financials is
  'Single normalized financial row per service. Calculated amount columns and financial_status are maintained by database functions.';

create index if not exists service_financials_status_idx
  on public.service_financials (financial_status, pricing_status);

create table if not exists public.service_price_components (
  id uuid primary key default extensions.gen_random_uuid(),
  service_financial_id uuid not null references public.service_financials(id) on delete restrict,
  component_type text not null,
  label text not null,
  quantity numeric(12, 3) not null default 1,
  unit_amount numeric(14, 2) not null default 0,
  line_amount numeric(14, 2) not null default 0,
  tax_rate numeric(7, 4),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint service_price_components_type_check
    check (component_type in (
      'base_fare',
      'waiting_time',
      'extra_stop',
      'distance',
      'night_surcharge',
      'holiday_surcharge',
      'airport_fee',
      'toll',
      'parking',
      'discount',
      'other'
    )),
  constraint service_price_components_label_not_empty
    check (length(trim(label)) > 0),
  constraint service_price_components_quantity_positive
    check (quantity > 0),
  constraint service_price_components_amounts_non_negative
    check (unit_amount >= 0 and line_amount >= 0),
  constraint service_price_components_line_formula
    check (line_amount = round(quantity * unit_amount, 2)),
  constraint service_price_components_tax_rate_range
    check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100)),
  constraint service_price_components_sort_order_non_negative
    check (sort_order >= 0),
  constraint service_price_components_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.service_price_components is
  'Price components used to derive service financial totals. Components cannot be changed once pricing is finalized.';

create index if not exists service_price_components_financial_order_idx
  on public.service_price_components (service_financial_id, sort_order, created_at);

create table if not exists public.service_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  service_id uuid not null references public.services(id) on delete restrict,
  service_financial_id uuid not null references public.service_financials(id) on delete restrict,
  payment_method text not null default 'cash',
  payment_status text not null default 'pending',
  amount numeric(14, 2) not null,
  currency_code text not null default 'EUR',
  paid_at timestamptz,
  registered_at timestamptz not null default now(),
  external_reference text,
  idempotency_key text,
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint service_payments_human_code_unique
    unique (human_code),
  constraint service_payments_human_code_format
    check (human_code ~ '^PAY-[0-9]{6}$'),
  constraint service_payments_method_check
    check (payment_method in ('cash')),
  constraint service_payments_status_check
    check (payment_status in ('pending', 'completed', 'cancelled', 'failed', 'reversed')),
  constraint service_payments_amount_positive
    check (amount > 0),
  constraint service_payments_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint service_payments_completed_paid_at_required
    check (payment_status <> 'completed' or paid_at is not null),
  constraint service_payments_cancelled_fields_required
    check (
      payment_status not in ('cancelled', 'reversed')
      or (
        cancelled_at is not null
        and cancelled_by is not null
        and length(trim(coalesce(cancellation_reason, ''))) > 0
      )
    ),
  constraint service_payments_idempotency_not_empty
    check (idempotency_key is null or length(trim(idempotency_key)) > 0)
);

comment on table public.service_payments is
  'Service payment records. Initial policy allows only full cash payments; Caja integration is intentionally deferred to a later migration.';

create unique index if not exists service_payments_idempotency_unique_idx
  on public.service_payments (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists service_payments_one_completed_per_financial_idx
  on public.service_payments (service_financial_id)
  where payment_status = 'completed';

create index if not exists service_payments_service_status_idx
  on public.service_payments (service_id, payment_status, registered_at);

create table if not exists public.service_payment_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_id uuid not null references public.service_payments(id) on delete restrict,
  service_financial_id uuid not null references public.service_financials(id) on delete restrict,
  allocated_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint service_payment_allocations_positive
    check (allocated_amount > 0),
  constraint service_payment_allocations_unique_target
    unique (payment_id, service_financial_id)
);

comment on table public.service_payment_allocations is
  'Append-only allocation of a payment to a service financial row. In this phase every payment has exactly one allocation.';

create unique index if not exists service_payment_allocations_one_financial_per_payment_idx
  on public.service_payment_allocations (payment_id);

create index if not exists service_payment_allocations_financial_idx
  on public.service_payment_allocations (service_financial_id, created_at);

create table if not exists public.service_financial_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  service_financial_id uuid not null references public.service_financials(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  payment_id uuid references public.service_payments(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint service_financial_status_history_from_status_check
    check (from_status is null or from_status in ('pending', 'paid', 'partial', 'cancelled', 'not_collectible')),
  constraint service_financial_status_history_to_status_check
    check (to_status in ('pending', 'paid', 'partial', 'cancelled', 'not_collectible')),
  constraint service_financial_status_history_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.service_financial_status_history is
  'Append-only history of financial_status transitions for services.';

create index if not exists service_financial_status_history_financial_changed_idx
  on public.service_financial_status_history (service_financial_id, changed_at);

drop trigger if exists set_service_financials_updated_at on public.service_financials;
create trigger set_service_financials_updated_at
before update on public.service_financials
for each row
execute function public.set_updated_at();

drop trigger if exists set_service_price_components_updated_at on public.service_price_components;
create trigger set_service_price_components_updated_at
before update on public.service_price_components
for each row
execute function public.set_updated_at();

drop trigger if exists set_service_payments_updated_at on public.service_payments;
create trigger set_service_payments_updated_at
before update on public.service_payments
for each row
execute function public.set_updated_at();

create or replace function public.prepare_service_financial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_status text;
  v_has_completed_payment boolean;
begin
  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));
  new.tax_rate := round(coalesce(new.tax_rate, 0), 4);

  if new.currency_code !~ '^[A-Z]{3}$' then
    raise exception 'Service financial currency_code must be an uppercase ISO code.'
      using errcode = '23514';
  end if;

  select service.operational_status
  into v_service_status
  from public.services service
  where service.id = new.service_id;

  if v_service_status is null then
    raise exception 'Service financial row references a missing service.'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.service_payments payment
      where payment.service_financial_id = new.id
        and payment.payment_status = 'completed'
    )
    into v_has_completed_payment;

    -- Future secure administrative correction functions may set this transaction-local marker after explicit authorization.
    if v_has_completed_payment
      and current_setting('elara.service_financial_pricing_correction', true) is distinct from new.id::text
      and (
        new.currency_code is distinct from old.currency_code
        or new.tax_rate is distinct from old.tax_rate
        or new.pricing_status is distinct from old.pricing_status
      )
    then
      raise exception 'Service pricing cannot be changed after a completed payment exists.'
        using errcode = '23514';
    end if;
  end if;

  if new.pricing_status = 'finalized' and new.finalized_at is null then
    new.finalized_at := now();
  end if;

  if new.pricing_status = 'draft' then
    new.finalized_at := null;
    new.finalized_by := null;
  end if;

  if new.pricing_status = 'finalized'
    and v_service_status in ('cancelled', 'no_show', 'not_performed')
    and coalesce(nullif(trim(coalesce(new.notes, '')), ''), nullif(trim(coalesce(new.internal_notes, '')), '')) is null
  then
    raise exception 'Finalized financials on cancelled, no-show or not-performed services require a reason.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.prepare_service_financial() is
  'Normalizes service financial editable fields before persistence and blocks pricing changes after completed payment.';

create or replace function public.prevent_service_financial_calculated_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('elara.service_financial_recalculate', true) is distinct from new.id::text then
    raise exception 'Calculated financial columns and financial_status must be changed through public.recalculate_service_financial(uuid).'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.prevent_service_financial_calculated_update() is
  'Prevents direct writes to derived service financial amounts and status. Direct table access is revoked from application roles; the guarded path is for database functions.';

create or replace function public.prepare_service_price_component()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pricing_status text;
  v_service_financial_id uuid;
  v_has_completed_payment boolean;
begin
  if tg_op = 'DELETE' then
    v_service_financial_id := old.service_financial_id;
  else
    v_service_financial_id := new.service_financial_id;
  end if;

  select
    financial.pricing_status,
    exists (
      select 1
      from public.service_payments payment
      where payment.service_financial_id = financial.id
        and payment.payment_status = 'completed'
    )
  into v_pricing_status, v_has_completed_payment
  from public.service_financials financial
  where financial.id = v_service_financial_id;

  if v_pricing_status is null then
    raise exception 'Price component references a missing service financial row.'
      using errcode = '23503';
  end if;

  -- Future secure administrative correction functions may set this transaction-local marker after explicit authorization.
  if v_has_completed_payment
    and current_setting('elara.service_financial_pricing_correction', true) is distinct from v_service_financial_id::text
  then
    raise exception 'Price components cannot be changed after a completed service payment exists.'
      using errcode = '23514';
  end if;

  if v_pricing_status = 'finalized' then
    raise exception 'Price components cannot be changed after pricing is finalized.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.label := trim(new.label);
  new.quantity := round(coalesce(new.quantity, 1), 3);
  new.unit_amount := round(coalesce(new.unit_amount, 0), 2);
  new.line_amount := round(new.quantity * new.unit_amount, 2);

  if new.tax_rate is not null then
    new.tax_rate := round(new.tax_rate, 4);
  end if;

  return new;
end;
$$;

comment on function public.prepare_service_price_component() is
  'Normalizes price components and blocks edits once pricing is finalized or a completed payment exists.';

create or replace function public.assign_service_payment_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Service payment human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('PAY');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^PAY-[0-9]{6}$' then
    raise exception 'Invalid service payment human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  return new;
end;
$$;

comment on function public.assign_service_payment_human_code() is
  'Assigns PAY human codes and prevents payment code changes after creation.';

create or replace function public.validate_service_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial public.service_financials%rowtype;
  v_service_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Service payments cannot be deleted; use cancellation or reversal instead.'
      using errcode = '23514';
  end if;

  select *
  into v_financial
  from public.service_financials financial
  where financial.id = new.service_financial_id
  for update;

  if not found then
    raise exception 'Service payment references a missing service financial row.'
      using errcode = '23503';
  end if;

  if v_financial.service_id <> new.service_id then
    raise exception 'Service payment service_id must match the service financial row.'
      using errcode = '23514';
  end if;

  select service.operational_status
  into v_service_status
  from public.services service
  where service.id = new.service_id;

  if v_service_status is null then
    raise exception 'Service payment references a missing service.'
      using errcode = '23503';
  end if;

  if new.currency_code <> v_financial.currency_code then
    raise exception 'Service payment currency must match the service financial currency.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.payment_status = 'completed' and new.payment_status in ('pending', 'failed') then
      raise exception 'Completed payments cannot return to pending or failed.'
        using errcode = '23514';
    end if;

    if old.payment_status in ('cancelled', 'reversed') and new.payment_status <> old.payment_status then
      raise exception 'Cancelled or reversed payments cannot be reactivated.'
        using errcode = '23514';
    end if;
  end if;

  if new.payment_status = 'completed' then
    if v_service_status in ('cancelled', 'no_show', 'not_performed') then
      raise exception 'Cannot register a payment for a cancelled, no-show or not-performed service.'
        using errcode = '23514';
    end if;

    if v_financial.pricing_status <> 'finalized' then
      raise exception 'Service pricing must be finalized before registering payment.'
        using errcode = '23514';
    end if;

    if v_financial.pending_amount <= 0 then
      raise exception 'Service has no pending amount to pay.'
        using errcode = '23514';
    end if;

    if new.amount <> v_financial.pending_amount then
      raise exception 'Only full service payments are supported in this phase.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.service_payments existing_payment
      where existing_payment.service_financial_id = new.service_financial_id
        and existing_payment.payment_status = 'completed'
        and existing_payment.id <> new.id
    ) then
      raise exception 'Service already has an active completed payment.'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_service_payment_integrity() is
  'Validates full-payment policy and consistency between service_payments and service_financials.';

create or replace function public.ensure_completed_service_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'completed' then
    insert into public.service_payment_allocations (
      payment_id,
      service_financial_id,
      allocated_amount,
      created_by
    )
    values (
      new.id,
      new.service_financial_id,
      new.amount,
      new.created_by
    )
    on conflict (payment_id, service_financial_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.ensure_completed_service_payment_allocation() is
  'Creates the single allocation required by a completed service payment in this phase.';

create or replace function public.validate_service_payment_allocation_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.service_payments%rowtype;
  v_allocated_amount numeric(14, 2);
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Service payment allocations are append-only.'
      using errcode = '23514';
  end if;

  select *
  into v_payment
  from public.service_payments payment
  where payment.id = new.payment_id;

  if not found then
    raise exception 'Payment allocation references a missing payment.'
      using errcode = '23503';
  end if;

  if v_payment.service_financial_id <> new.service_financial_id then
    raise exception 'Payment allocation must target the payment service financial row.'
      using errcode = '23514';
  end if;

  select coalesce(round(sum(allocation.allocated_amount), 2), 0)
  into v_allocated_amount
  from public.service_payment_allocations allocation
  where allocation.payment_id = new.payment_id;

  if v_allocated_amount > v_payment.amount then
    raise exception 'Payment allocations cannot exceed the payment amount.'
      using errcode = '23514';
  end if;

  if v_payment.payment_status = 'completed' and v_allocated_amount <> v_payment.amount then
    raise exception 'Completed service payments must be fully allocated.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_service_payment_allocation_integrity() is
  'Keeps service payment allocations append-only and fully allocated for completed payments.';

create or replace function public.prevent_service_financial_status_history_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Service financial status history is append-only.'
    using errcode = '23514';
end;
$$;

comment on function public.prevent_service_financial_status_history_changes() is
  'Blocks updates and deletes on service_financial_status_history.';

create or replace function public.prevent_service_financial_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Service financial rows cannot be physically deleted.'
    using errcode = '23514';
end;
$$;

comment on function public.prevent_service_financial_delete() is
  'Blocks physical deletion of service_financials rows.';

create or replace function public.record_service_financial_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' or new.financial_status is not distinct from old.financial_status then
    return new;
  end if;

  insert into public.service_financial_status_history (
    service_financial_id,
    from_status,
    to_status,
    changed_at,
    changed_by_user_id,
    reason,
    metadata
  )
  values (
    new.id,
    old.financial_status,
    new.financial_status,
    now(),
    new.updated_by,
    'financial_status_recalculated',
    jsonb_build_object(
      'total_amount', new.total_amount,
      'paid_amount', new.paid_amount,
      'pending_amount', new.pending_amount
    )
  );

  return new;
end;
$$;

comment on function public.record_service_financial_status_change() is
  'Records append-only financial status transitions after recalculation.';

create or replace function public.recalculate_service_financial(p_service_financial_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial public.service_financials%rowtype;
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_surcharge numeric(14, 2);
  v_taxable numeric(14, 2);
  v_tax numeric(14, 2);
  v_total numeric(14, 2);
  v_paid numeric(14, 2);
  v_pending numeric(14, 2);
  v_status text;
begin
  select *
  into v_financial
  from public.service_financials financial
  where financial.id = p_service_financial_id
  for update;

  if not found then
    raise exception 'Service financial row "%" does not exist.', p_service_financial_id
      using errcode = '23503';
  end if;

  select
    coalesce(round(sum(component.line_amount) filter (
      where component.is_active
        and component.component_type not in (
          'discount',
          'night_surcharge',
          'holiday_surcharge',
          'airport_fee',
          'toll',
          'parking'
        )
    ), 2), 0),
    coalesce(round(sum(component.line_amount) filter (
      where component.is_active
        and component.component_type = 'discount'
    ), 2), 0),
    coalesce(round(sum(component.line_amount) filter (
      where component.is_active
        and component.component_type in (
          'night_surcharge',
          'holiday_surcharge',
          'airport_fee',
          'toll',
          'parking'
        )
    ), 2), 0)
  into v_subtotal, v_discount, v_surcharge
  from public.service_price_components component
  where component.service_financial_id = p_service_financial_id;

  v_taxable := round(v_subtotal + v_surcharge - v_discount, 2);

  if v_taxable < 0 then
    raise exception 'Service financial taxable base amount cannot be negative.'
      using errcode = '23514';
  end if;

  v_tax := round(v_taxable * v_financial.tax_rate / 100, 2);
  v_total := round(v_taxable + v_tax, 2);

  select coalesce(round(sum(payment.amount), 2), 0)
  into v_paid
  from public.service_payments payment
  where payment.service_financial_id = p_service_financial_id
    and payment.payment_status = 'completed';

  if v_paid > v_total then
    raise exception 'Service financial paid amount cannot exceed total amount.'
      using errcode = '23514';
  end if;

  v_pending := round(v_total - v_paid, 2);

  if v_financial.pricing_status = 'cancelled' then
    v_status := 'cancelled';
  elsif v_total > 0 and v_pending = 0 then
    v_status := 'paid';
  elsif v_paid > 0 and v_pending > 0 then
    v_status := 'partial';
  else
    v_status := 'pending';
  end if;

  perform set_config('elara.service_financial_recalculate', p_service_financial_id::text, true);

  update public.service_financials
  set subtotal_amount = v_subtotal,
      discount_amount = v_discount,
      surcharge_amount = v_surcharge,
      taxable_base_amount = v_taxable,
      tax_amount = v_tax,
      total_amount = v_total,
      paid_amount = v_paid,
      pending_amount = v_pending,
      financial_status = v_status
  where id = p_service_financial_id
  returning *
  into v_financial;

  perform set_config('elara.service_financial_recalculate', '', true);

  return;
end;
$$;

comment on function public.recalculate_service_financial(uuid) is
  'Recalculates service financial totals and financial_status from active price components and completed payments.';

create or replace function public.recalculate_service_financial_from_component()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_service_financial(old.service_financial_id);
    return old;
  end if;

  perform public.recalculate_service_financial(new.service_financial_id);
  return new;
end;
$$;

create or replace function public.recalculate_service_financial_from_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_service_financial(old.service_financial_id);
    return old;
  end if;

  perform public.recalculate_service_financial(new.service_financial_id);
  return new;
end;
$$;

create or replace function public.recalculate_service_financial_from_financial_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_service_financial(new.id);
  return new;
end;
$$;

drop trigger if exists prepare_service_financials on public.service_financials;
create trigger prepare_service_financials
before insert or update of currency_code, tax_rate, pricing_status, finalized_at, finalized_by, notes, internal_notes
on public.service_financials
for each row
execute function public.prepare_service_financial();

drop trigger if exists prevent_service_financials_calculated_update on public.service_financials;
create trigger prevent_service_financials_calculated_update
before update of subtotal_amount, discount_amount, surcharge_amount, taxable_base_amount, tax_amount, total_amount, paid_amount, pending_amount, financial_status
on public.service_financials
for each row
execute function public.prevent_service_financial_calculated_update();

drop trigger if exists prevent_service_financials_delete on public.service_financials;
create trigger prevent_service_financials_delete
before delete
on public.service_financials
for each row
execute function public.prevent_service_financial_delete();

drop trigger if exists recalculate_service_financials_after_edit on public.service_financials;
create trigger recalculate_service_financials_after_edit
after insert or update of tax_rate, pricing_status
on public.service_financials
for each row
execute function public.recalculate_service_financial_from_financial_edit();

drop trigger if exists record_service_financials_status_change on public.service_financials;
create trigger record_service_financials_status_change
after update of financial_status
on public.service_financials
for each row
execute function public.record_service_financial_status_change();

drop trigger if exists prepare_service_price_components on public.service_price_components;
create trigger prepare_service_price_components
before insert or update or delete
on public.service_price_components
for each row
execute function public.prepare_service_price_component();

drop trigger if exists recalculate_after_service_price_components on public.service_price_components;
create trigger recalculate_after_service_price_components
after insert or update or delete
on public.service_price_components
for each row
execute function public.recalculate_service_financial_from_component();

drop trigger if exists assign_service_payments_human_code on public.service_payments;
create trigger assign_service_payments_human_code
before insert or update of human_code, currency_code
on public.service_payments
for each row
execute function public.assign_service_payment_human_code();

drop trigger if exists validate_service_payments_integrity on public.service_payments;
create trigger validate_service_payments_integrity
before insert or update or delete
on public.service_payments
for each row
execute function public.validate_service_payment_integrity();

drop trigger if exists after_service_payments_ensure_allocation on public.service_payments;
create trigger after_service_payments_ensure_allocation
after insert or update of payment_status, amount, service_financial_id
on public.service_payments
for each row
execute function public.ensure_completed_service_payment_allocation();

drop trigger if exists recalculate_after_service_payments on public.service_payments;
create trigger recalculate_after_service_payments
after insert or update or delete
on public.service_payments
for each row
execute function public.recalculate_service_financial_from_payment();

drop trigger if exists validate_service_payment_allocations_integrity on public.service_payment_allocations;
create constraint trigger validate_service_payment_allocations_integrity
after insert or update or delete
on public.service_payment_allocations
deferrable initially deferred
for each row
execute function public.validate_service_payment_allocation_integrity();

-- Completed payment insertion may recalculate once from the allocation trigger and once from the payment trigger; both paths are idempotent and intentionally kept until 0013 centralizes payment flows.
drop trigger if exists recalculate_after_service_payment_allocations on public.service_payment_allocations;
create trigger recalculate_after_service_payment_allocations
after insert or update or delete
on public.service_payment_allocations
for each row
execute function public.recalculate_service_financial_from_payment();

drop trigger if exists prevent_service_financial_status_history_updates on public.service_financial_status_history;
create trigger prevent_service_financial_status_history_updates
before update or delete
on public.service_financial_status_history
for each row
execute function public.prevent_service_financial_status_history_changes();

revoke all on table public.service_financials from public;
revoke all on table public.service_price_components from public;
revoke all on table public.service_payments from public;
revoke all on table public.service_payment_allocations from public;
revoke all on table public.service_financial_status_history from public;

revoke all on table public.service_financials from anon;
revoke all on table public.service_price_components from anon;
revoke all on table public.service_payments from anon;
revoke all on table public.service_payment_allocations from anon;
revoke all on table public.service_financial_status_history from anon;

revoke all on table public.service_financials from authenticated;
revoke all on table public.service_price_components from authenticated;
revoke all on table public.service_payments from authenticated;
revoke all on table public.service_payment_allocations from authenticated;
revoke all on table public.service_financial_status_history from authenticated;

grant select, insert, update, delete on table public.service_financials to service_role;
grant select, insert, update, delete on table public.service_price_components to service_role;
grant select, insert, update, delete on table public.service_payments to service_role;
grant select, insert on table public.service_payment_allocations to service_role;
grant select, insert on table public.service_financial_status_history to service_role;

revoke all on function public.prepare_service_financial() from public;
revoke all on function public.prevent_service_financial_calculated_update() from public;
revoke all on function public.prepare_service_price_component() from public;
revoke all on function public.assign_service_payment_human_code() from public;
revoke all on function public.validate_service_payment_integrity() from public;
revoke all on function public.ensure_completed_service_payment_allocation() from public;
revoke all on function public.validate_service_payment_allocation_integrity() from public;
revoke all on function public.prevent_service_financial_status_history_changes() from public;
revoke all on function public.prevent_service_financial_delete() from public;
revoke all on function public.record_service_financial_status_change() from public;
revoke all on function public.recalculate_service_financial(uuid) from public;
revoke all on function public.recalculate_service_financial_from_component() from public;
revoke all on function public.recalculate_service_financial_from_payment() from public;
revoke all on function public.recalculate_service_financial_from_financial_edit() from public;

revoke execute on function public.prepare_service_financial() from anon;
revoke execute on function public.prevent_service_financial_calculated_update() from anon;
revoke execute on function public.prepare_service_price_component() from anon;
revoke execute on function public.assign_service_payment_human_code() from anon;
revoke execute on function public.validate_service_payment_integrity() from anon;
revoke execute on function public.ensure_completed_service_payment_allocation() from anon;
revoke execute on function public.validate_service_payment_allocation_integrity() from anon;
revoke execute on function public.prevent_service_financial_status_history_changes() from anon;
revoke execute on function public.prevent_service_financial_delete() from anon;
revoke execute on function public.record_service_financial_status_change() from anon;
revoke execute on function public.recalculate_service_financial(uuid) from anon;
revoke execute on function public.recalculate_service_financial_from_component() from anon;
revoke execute on function public.recalculate_service_financial_from_payment() from anon;
revoke execute on function public.recalculate_service_financial_from_financial_edit() from anon;

revoke execute on function public.prepare_service_financial() from authenticated;
revoke execute on function public.prevent_service_financial_calculated_update() from authenticated;
revoke execute on function public.prepare_service_price_component() from authenticated;
revoke execute on function public.assign_service_payment_human_code() from authenticated;
revoke execute on function public.validate_service_payment_integrity() from authenticated;
revoke execute on function public.ensure_completed_service_payment_allocation() from authenticated;
revoke execute on function public.validate_service_payment_allocation_integrity() from authenticated;
revoke execute on function public.prevent_service_financial_status_history_changes() from authenticated;
revoke execute on function public.prevent_service_financial_delete() from authenticated;
revoke execute on function public.record_service_financial_status_change() from authenticated;
revoke execute on function public.recalculate_service_financial(uuid) from authenticated;
revoke execute on function public.recalculate_service_financial_from_component() from authenticated;
revoke execute on function public.recalculate_service_financial_from_payment() from authenticated;
revoke execute on function public.recalculate_service_financial_from_financial_edit() from authenticated;

grant execute on function public.recalculate_service_financial(uuid) to service_role;

do $$
declare
  missing_tables text[];
  missing_triggers text[];
  missing_functions text[];
  forbidden_tables text[];
begin
  with expected(table_name) as (
    values
      ('service_financials'),
      ('service_price_components'),
      ('service_payments'),
      ('service_payment_allocations'),
      ('service_financial_status_history')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into missing_tables
  from expected
  where to_regclass('public.' || expected.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing service financial tables: %.', missing_tables;
  end if;

  if not exists (
    select 1
    from public.human_code_counters
    where prefix = 'PAY'
      and padding = 6
      and is_active = true
  ) then
    raise exception 'PAY human code counter must exist, stay active and use padding 6.';
  end if;

  if to_regclass('public.service_financials_service_id_unique') is null then
    raise exception 'Missing unique constraint/index for one financial row per service.';
  end if;

  if to_regclass('public.service_payments_human_code_unique') is null then
    raise exception 'Missing unique constraint/index for service payment human_code.';
  end if;

  if to_regclass('public.service_payments_one_completed_per_financial_idx') is null then
    raise exception 'Missing unique index for one active completed payment per service financial row.';
  end if;

  if to_regclass('public.service_payment_allocations_one_financial_per_payment_idx') is null then
    raise exception 'Missing unique index for one allocation target per payment.';
  end if;

  with expected(trigger_name) as (
    values
      ('set_service_financials_updated_at'),
      ('set_service_price_components_updated_at'),
      ('set_service_payments_updated_at'),
      ('prepare_service_financials'),
      ('prevent_service_financials_calculated_update'),
      ('prevent_service_financials_delete'),
      ('recalculate_service_financials_after_edit'),
      ('record_service_financials_status_change'),
      ('prepare_service_price_components'),
      ('recalculate_after_service_price_components'),
      ('assign_service_payments_human_code'),
      ('validate_service_payments_integrity'),
      ('after_service_payments_ensure_allocation'),
      ('recalculate_after_service_payments'),
      ('validate_service_payment_allocations_integrity'),
      ('recalculate_after_service_payment_allocations'),
      ('prevent_service_financial_status_history_updates')
  )
  select array_agg(expected.trigger_name order by expected.trigger_name)
  into missing_triggers
  from expected
  where not exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgname = expected.trigger_name
      and not trigger_record.tgisinternal
  );

  if missing_triggers is not null then
    raise exception 'Missing service financial triggers: %.', missing_triggers;
  end if;

  with expected(signature) as (
    values
      ('public.prepare_service_financial()'),
      ('public.prevent_service_financial_calculated_update()'),
      ('public.prepare_service_price_component()'),
      ('public.assign_service_payment_human_code()'),
      ('public.validate_service_payment_integrity()'),
      ('public.ensure_completed_service_payment_allocation()'),
      ('public.validate_service_payment_allocation_integrity()'),
      ('public.prevent_service_financial_status_history_changes()'),
      ('public.prevent_service_financial_delete()'),
      ('public.record_service_financial_status_change()'),
      ('public.recalculate_service_financial(uuid)'),
      ('public.recalculate_service_financial_from_component()'),
      ('public.recalculate_service_financial_from_payment()'),
      ('public.recalculate_service_financial_from_financial_edit()')
  )
  select array_agg(expected.signature order by expected.signature)
  into missing_functions
  from expected
  where to_regprocedure(expected.signature) is null;

  if missing_functions is not null then
    raise exception 'Missing service financial functions: %.', missing_functions;
  end if;

  if exists (
    select 1
    from public.service_payments
    where human_code !~ '^PAY-[0-9]{6}$'
  ) then
    raise exception 'Invalid PAY human_code format detected.';
  end if;

  if exists (
    select 1
    from public.service_financials
    where subtotal_amount < 0
      or discount_amount < 0
      or surcharge_amount < 0
      or taxable_base_amount < 0
      or tax_amount < 0
      or total_amount < 0
      or paid_amount < 0
      or pending_amount < 0
  ) then
    raise exception 'Negative service financial amount detected.';
  end if;

  if exists (
    select 1
    from public.service_payments payment
    join public.service_financials financial on financial.id = payment.service_financial_id
    where financial.service_id <> payment.service_id
  ) then
    raise exception 'Service payment linked to a different service than its financial row.';
  end if;

  if exists (
    select 1
    from public.service_payments
    where payment_method <> 'cash'
  ) then
    raise exception 'Only cash service payments are allowed in this phase.';
  end if;

  if exists (
    select 1
    from public.service_payments payment
    where payment.payment_status = 'completed'
      and not exists (
        select 1
        from public.service_payment_allocations allocation
        where allocation.payment_id = payment.id
          and allocation.service_financial_id = payment.service_financial_id
          and allocation.allocated_amount = payment.amount
      )
  ) then
    raise exception 'Completed service payments must have a full allocation.';
  end if;

  select array_agg(table_name order by table_name)
  into forbidden_tables
  from (
    values
      ('cash_movements'),
      ('driver_remittances'),
      ('cash_counts'),
      ('receivables')
  ) as forbidden(table_name)
  where to_regclass('public.' || forbidden.table_name) is not null;

  if forbidden_tables is not null then
    raise exception 'Migration 0007 must not create later-domain tables: %.', forbidden_tables;
  end if;

  with protected_tables(table_name) as (
    values
      ('service_financials'),
      ('service_price_components'),
      ('service_payments'),
      ('service_payment_allocations'),
      ('service_financial_status_history')
  )
  select array_agg(table_name order by table_name)
  into forbidden_tables
  from protected_tables
  where has_table_privilege('anon', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE');

  if forbidden_tables is not null then
    raise exception 'anon/authenticated must not have direct table privileges on service financial tables: %.', forbidden_tables;
  end if;

  with protected_functions(signature) as (
    values
      ('public.prepare_service_financial()'),
      ('public.prevent_service_financial_calculated_update()'),
      ('public.prepare_service_price_component()'),
      ('public.assign_service_payment_human_code()'),
      ('public.validate_service_payment_integrity()'),
      ('public.ensure_completed_service_payment_allocation()'),
      ('public.validate_service_payment_allocation_integrity()'),
      ('public.prevent_service_financial_status_history_changes()'),
      ('public.prevent_service_financial_delete()'),
      ('public.record_service_financial_status_change()'),
      ('public.recalculate_service_financial(uuid)'),
      ('public.recalculate_service_financial_from_component()'),
      ('public.recalculate_service_financial_from_payment()'),
      ('public.recalculate_service_financial_from_financial_edit()')
  )
  select array_agg(signature order by signature)
  into missing_functions
  from protected_functions
  where has_function_privilege('anon', signature, 'EXECUTE')
     or has_function_privilege('authenticated', signature, 'EXECUTE');

  if missing_functions is not null then
    raise exception 'anon/authenticated must not execute service financial functions: %.', missing_functions;
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute public.next_human_code(text).';
  end if;
end;
$$;




