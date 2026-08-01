-- ELARA Transport V4.0
-- Migration 0011: settlements domain.
--
-- Creates driver economic settlement tables, internal guards and recalculation helpers only.
-- No public generation/approval/payment/reversal functions, no automatic cash movements,
-- no storage buckets, no full RLS and no frontend integration.

create table if not exists public.settlement_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  driver_type text not null,
  name text not null,
  calculation_method text not null,
  driver_percentage numeric(7, 4) not null,
  elara_percentage numeric(7, 4) not null,
  frequency text not null,
  currency_code text not null default 'EUR',
  effective_from date not null,
  effective_until date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint settlement_rules_driver_type_check
    check (driver_type in ('internal_driver', 'external_collaborator')),
  constraint settlement_rules_name_not_empty
    check (length(trim(name)) > 0),
  constraint settlement_rules_method_check
    check (calculation_method in ('driver_share', 'elara_commission')),
  constraint settlement_rules_percentage_range
    check (driver_percentage >= 0 and driver_percentage <= 100 and elara_percentage >= 0 and elara_percentage <= 100),
  constraint settlement_rules_percentage_sum
    check (round(driver_percentage + elara_percentage, 4) = 100),
  constraint settlement_rules_frequency_check
    check (frequency in ('weekly', 'monthly')),
  constraint settlement_rules_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint settlement_rules_effective_order
    check (effective_until is null or effective_until >= effective_from),
  constraint settlement_rules_driver_method_frequency
    check (
      (driver_type = 'internal_driver' and calculation_method = 'driver_share' and frequency = 'monthly')
      or (driver_type = 'external_collaborator' and calculation_method = 'elara_commission' and frequency = 'weekly')
    )
);

comment on table public.settlement_rules is
  'Versioned rules used to calculate future driver settlements. Percentages are snapshotted into settlements and items.';
comment on column public.settlement_rules.effective_from is
  'Initial built-in rules use a stable literal date so database rebuilds remain deterministic.';

create index if not exists settlement_rules_driver_active_idx
  on public.settlement_rules (driver_type, frequency, effective_from)
  where is_active = true;

create table if not exists public.settlements (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  settlement_rule_id uuid not null references public.settlement_rules(id) on delete restrict,
  driver_type_snapshot text not null,
  frequency_snapshot text not null,
  calculation_method_snapshot text not null,
  period_start date not null,
  period_end date not null,
  currency_code text not null default 'EUR',
  gross_eligible_amount numeric(14, 2) not null default 0,
  expense_deduction_amount numeric(14, 2) not null default 0,
  adjustment_amount numeric(14, 2) not null default 0,
  calculation_base_amount numeric(14, 2) not null default 0,
  driver_percentage numeric(7, 4) not null,
  elara_percentage numeric(7, 4) not null,
  driver_amount numeric(14, 2) not null default 0,
  elara_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  pending_amount numeric(14, 2) not null default 0,
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  generated_at timestamptz,
  submitted_at timestamptz,
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

  constraint settlements_human_code_unique unique (human_code),
  constraint settlements_human_code_format check (human_code ~ '^SET-[0-9]{6}$'),
  constraint settlements_driver_type_check check (driver_type_snapshot in ('internal_driver', 'external_collaborator')),
  constraint settlements_frequency_check check (frequency_snapshot in ('weekly', 'monthly')),
  constraint settlements_method_check check (calculation_method_snapshot in ('driver_share', 'elara_commission')),
  constraint settlements_driver_type_frequency_method check (
    (driver_type_snapshot = 'internal_driver' and frequency_snapshot = 'monthly' and calculation_method_snapshot = 'driver_share')
    or (driver_type_snapshot = 'external_collaborator' and frequency_snapshot = 'weekly' and calculation_method_snapshot = 'elara_commission')
  ),
  constraint settlements_period_order check (period_end >= period_start),
  constraint settlements_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint settlements_amounts_non_negative check (
    gross_eligible_amount >= 0
    and expense_deduction_amount >= 0
    and calculation_base_amount >= 0
    and driver_amount >= 0
    and elara_amount >= 0
    and paid_amount >= 0
    and pending_amount >= 0
  ),
  constraint settlements_percentages_range check (
    driver_percentage >= 0 and driver_percentage <= 100
    and elara_percentage >= 0 and elara_percentage <= 100
  ),
  constraint settlements_percentages_sum check (round(driver_percentage + elara_percentage, 4) = 100),
  constraint settlements_base_formula check (
    calculation_base_amount = greatest(round(gross_eligible_amount - expense_deduction_amount + adjustment_amount, 2), 0)
  ),
  constraint settlements_driver_amount_formula check (
    driver_amount = case
      when calculation_method_snapshot = 'driver_share' then round(calculation_base_amount * driver_percentage / 100, 2)
      when calculation_method_snapshot = 'elara_commission' then round(calculation_base_amount - round(calculation_base_amount * elara_percentage / 100, 2), 2)
    end
  ),
  constraint settlements_elara_amount_formula check (
    elara_amount = round(calculation_base_amount - driver_amount, 2)
  ),
  constraint settlements_pending_formula check (pending_amount = round(driver_amount - paid_amount, 2)),
  constraint settlements_not_overpaid check (paid_amount <= driver_amount),
  constraint settlements_status_check check (status in ('draft', 'generated', 'submitted', 'approved', 'rejected', 'cancelled')),
  constraint settlements_payment_status_check check (payment_status in ('unpaid', 'paid', 'partial', 'cancelled')),
  constraint settlements_payment_unpaid_fields check (payment_status <> 'unpaid' or paid_amount = 0),
  constraint settlements_payment_paid_fields check (payment_status <> 'paid' or pending_amount = 0),
  constraint settlements_payment_partial_fields check (payment_status <> 'partial' or (paid_amount > 0 and pending_amount > 0)),
  constraint settlements_payment_cancelled_status check (payment_status <> 'cancelled' or status = 'cancelled'),
  constraint settlements_generated_fields check (status <> 'generated' or generated_at is not null),
  constraint settlements_submitted_fields check (status <> 'submitted' or submitted_at is not null),
  constraint settlements_approved_fields check (status <> 'approved' or (approved_at is not null and approved_by is not null)),
  constraint settlements_rejected_fields check (status <> 'rejected' or (rejected_at is not null and rejected_by is not null and length(trim(coalesce(rejection_reason, ''))) > 0)),
  constraint settlements_cancelled_fields check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by is not null and length(trim(coalesce(cancellation_reason, ''))) > 0))
);

comment on table public.settlements is
  'Driver settlement header. Calculated totals and payment_status are maintained by public.recalculate_settlement(uuid).';
comment on column public.settlements.period_start is
  'Inclusive period start. Internal drivers use natural months; external collaborators use inclusive 7-day periods.';
comment on column public.settlements.calculation_base_amount is
  'Derived as gross eligible income minus expense deductions plus adjustments, floored at zero.';

create index if not exists settlements_driver_period_idx
  on public.settlements (driver_id, period_start, period_end, status);
create index if not exists settlements_rule_status_idx
  on public.settlements (settlement_rule_id, status);
create unique index if not exists settlements_one_active_same_period_idx
  on public.settlements (driver_id, period_start, period_end, frequency_snapshot)
  where status in ('draft', 'generated', 'submitted', 'approved');

create table if not exists public.settlement_items (
  id uuid primary key default extensions.gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  item_type text not null,
  service_id uuid references public.services(id) on delete restrict,
  service_assignment_id uuid references public.service_assignments(id) on delete restrict,
  service_financial_id uuid references public.service_financials(id) on delete restrict,
  expense_id uuid references public.expenses(id) on delete restrict,
  source_reference text,
  description text not null,
  occurred_on date,
  gross_amount numeric(14, 2) not null default 0,
  deduction_amount numeric(14, 2) not null default 0,
  adjustment_amount numeric(14, 2) not null default 0,
  eligible_amount numeric(14, 2) not null default 0,
  driver_percentage_snapshot numeric(7, 4) not null,
  elara_percentage_snapshot numeric(7, 4) not null,
  driver_amount_snapshot numeric(14, 2) not null default 0,
  elara_amount_snapshot numeric(14, 2) not null default 0,
  snapshot_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint settlement_items_type_check check (item_type in ('service_income', 'expense_deduction', 'positive_adjustment', 'negative_adjustment', 'other')),
  constraint settlement_items_description_not_empty check (length(trim(description)) > 0),
  constraint settlement_items_amounts_non_negative check (
    gross_amount >= 0
    and deduction_amount >= 0
    and eligible_amount >= 0
    and driver_amount_snapshot >= 0
    and elara_amount_snapshot >= 0
  ),
  constraint settlement_items_percentages_range check (
    driver_percentage_snapshot >= 0 and driver_percentage_snapshot <= 100
    and elara_percentage_snapshot >= 0 and elara_percentage_snapshot <= 100
  ),
  constraint settlement_items_percentages_sum check (round(driver_percentage_snapshot + elara_percentage_snapshot, 4) = 100),
  constraint settlement_items_snapshot_object check (jsonb_typeof(snapshot_data) = 'object'),
  constraint settlement_items_reference_by_type check (
    (
      item_type = 'service_income'
      and service_id is not null
      and service_assignment_id is not null
      and service_financial_id is not null
      and expense_id is null
      and gross_amount > 0
      and deduction_amount = 0
      and adjustment_amount = 0
    )
    or (
      item_type = 'expense_deduction'
      and expense_id is not null
      and service_id is null
      and service_assignment_id is null
      and service_financial_id is null
      and gross_amount = 0
      and deduction_amount > 0
      and adjustment_amount = 0
    )
    or (
      item_type = 'positive_adjustment'
      and service_id is null
      and service_assignment_id is null
      and service_financial_id is null
      and expense_id is null
      and gross_amount = 0
      and deduction_amount = 0
      and adjustment_amount > 0
    )
    or (
      item_type = 'negative_adjustment'
      and service_id is null
      and service_assignment_id is null
      and service_financial_id is null
      and expense_id is null
      and gross_amount = 0
      and deduction_amount = 0
      and adjustment_amount < 0
    )
    or (
      item_type = 'other'
      and service_id is null
      and service_assignment_id is null
      and service_financial_id is null
      and expense_id is null
      and (gross_amount <> 0 or deduction_amount <> 0 or adjustment_amount <> 0)
      and round(gross_amount - deduction_amount + adjustment_amount, 2) <> 0
    )
  )
);

comment on table public.settlement_items is
  'Historical settlement line items. They snapshot services, expenses, adjustments and percentages at settlement time.';

create index if not exists settlement_items_settlement_idx
  on public.settlement_items (settlement_id, item_type, created_at);
create unique index if not exists settlement_items_one_service_per_settlement_idx
  on public.settlement_items (settlement_id, service_id, service_assignment_id)
  where item_type = 'service_income';
create unique index if not exists settlement_items_one_expense_per_settlement_idx
  on public.settlement_items (settlement_id, expense_id)
  where item_type = 'expense_deduction';
create index if not exists settlement_items_service_active_lookup_idx
  on public.settlement_items (service_id, service_assignment_id)
  where item_type = 'service_income';
create index if not exists settlement_items_expense_active_lookup_idx
  on public.settlement_items (expense_id)
  where item_type = 'expense_deduction';

create table if not exists public.settlement_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  settlement_id uuid not null references public.settlements(id) on delete restrict,
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

  constraint settlement_payments_human_code_unique unique (human_code),
  constraint settlement_payments_human_code_format check (human_code ~ '^SETPAY-[0-9]{6}$'),
  constraint settlement_payments_method_check check (payment_method in ('cash', 'bank_transfer', 'card', 'other')),
  constraint settlement_payments_status_check check (payment_status in ('pending', 'completed', 'cancelled', 'failed', 'reversed')),
  constraint settlement_payments_amount_positive check (amount > 0),
  constraint settlement_payments_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint settlement_payments_cash_account_rule check ((payment_method = 'cash' and cash_account_id is not null) or (payment_method <> 'cash')),
  constraint settlement_payments_completed_fields check (payment_status <> 'completed' or (paid_at is not null and created_by is not null)),
  constraint settlement_payments_cancelled_fields check (
    payment_status not in ('cancelled', 'reversed')
    or (cancelled_at is not null and cancelled_by is not null and length(trim(coalesce(cancellation_reason, ''))) > 0)
  )
);

comment on table public.settlement_payments is
  'Append-preserved payments for driver settlements. This migration does not create cash movements automatically.';
create unique index if not exists settlement_payments_one_completed_per_settlement_idx
  on public.settlement_payments (settlement_id)
  where payment_status = 'completed';
create index if not exists settlement_payments_settlement_status_idx
  on public.settlement_payments (settlement_id, payment_status, paid_at);
create index if not exists settlement_payments_cash_account_idx
  on public.settlement_payments (cash_account_id, payment_status);

create table if not exists public.settlement_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  payment_id uuid references public.settlement_payments(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint settlement_status_history_from_status_check
    check (from_status is null or from_status in ('draft', 'generated', 'submitted', 'approved', 'rejected', 'cancelled')),
  constraint settlement_status_history_to_status_check
    check (to_status in ('draft', 'generated', 'submitted', 'approved', 'rejected', 'cancelled')),
  constraint settlement_status_history_real_change
    check (from_status is null or from_status <> to_status),
  constraint settlement_status_history_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.settlement_status_history is
  'Append-only history of settlement.status transitions. Future secure payment/reversal functions may add payment_id context.';

create index if not exists settlement_status_history_settlement_changed_idx
  on public.settlement_status_history (settlement_id, changed_at);

create or replace function public.settlement_app_user_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users app_user
    where app_user.id = p_user_id
      and app_user.status = 'active'
  );
$$;

comment on function public.settlement_app_user_is_active(uuid) is
  'Internal helper used by settlement guards to verify app user actors.';

create or replace function public.assign_settlement_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.human_code is null or length(trim(new.human_code)) = 0 then
      new.human_code := public.next_human_code('SET');
    else
      new.human_code := upper(trim(new.human_code));
      if new.human_code !~ '^SET-[0-9]{6}$' then
        raise exception 'Settlement human_code must use format SET-000001.'
          using errcode = '23514';
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.human_code is distinct from old.human_code then
      raise exception 'Settlement human_code cannot be modified.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.assign_settlement_payment_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.human_code is null or length(trim(new.human_code)) = 0 then
      new.human_code := public.next_human_code('SETPAY');
    else
      new.human_code := upper(trim(new.human_code));
      if new.human_code !~ '^SETPAY-[0-9]{6}$' then
        raise exception 'Settlement payment human_code must use format SETPAY-000001.'
          using errcode = '23514';
      end if;
    end if;
    new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.human_code is distinct from old.human_code then
      raise exception 'Settlement payment human_code cannot be modified.'
        using errcode = '23514';
    end if;
    new.currency_code := upper(trim(coalesce(new.currency_code, old.currency_code, 'EUR')));
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.validate_settlement_rule_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.settlements settlement where settlement.settlement_rule_id = old.id) then
      raise exception 'Settlement rules used by settlements cannot be deleted.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));
  new.name := trim(new.name);
  new.driver_percentage := round(new.driver_percentage, 4);
  new.elara_percentage := round(new.elara_percentage, 4);

  if tg_op = 'UPDATE'
    and exists (select 1 from public.settlements settlement where settlement.settlement_rule_id = old.id)
    and (
      new.driver_percentage is distinct from old.driver_percentage
      or new.elara_percentage is distinct from old.elara_percentage
      or new.calculation_method is distinct from old.calculation_method
      or new.driver_type is distinct from old.driver_type
      or new.frequency is distinct from old.frequency
      or new.currency_code is distinct from old.currency_code
    )
  then
    raise exception 'Settlement rules already used by settlements cannot change percentages or calculation identity.'
      using errcode = '23514';
  end if;

  if new.is_active and exists (
    select 1
    from public.settlement_rules other
    where other.id <> new.id
      and other.is_active = true
      and other.driver_type = new.driver_type
      and other.frequency = new.frequency
      and other.effective_from <= coalesce(new.effective_until, date '9999-12-31')
      and new.effective_from <= coalesce(other.effective_until, date '9999-12-31')
  ) then
    raise exception 'Only one active settlement rule may apply per driver type, frequency and date range.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_settlement_calculated_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancel_allowed boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if current_setting('elara.settlement_recalculate', true) is distinct from old.id::text then
    v_cancel_allowed := current_setting('elara.settlement_superadmin_cancel', true) is not distinct from old.id::text
      and old.status = 'approved'
      and new.status = 'cancelled'
      and new.gross_eligible_amount is not distinct from old.gross_eligible_amount
      and new.expense_deduction_amount is not distinct from old.expense_deduction_amount
      and new.adjustment_amount is not distinct from old.adjustment_amount
      and new.calculation_base_amount is not distinct from old.calculation_base_amount
      and new.driver_amount is not distinct from old.driver_amount
      and new.elara_amount is not distinct from old.elara_amount
      and new.paid_amount is not distinct from old.paid_amount
      and new.pending_amount is not distinct from old.pending_amount;

    if not v_cancel_allowed then
      raise exception 'Calculated settlement amount columns and payment_status must be changed through public.recalculate_settlement(uuid).'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

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
    if new.status <> 'draft' then
      raise exception 'Settlements must be created in draft status.'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
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

    if old.status <> 'draft' and not v_recalculate_allowed then
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
    if new.frequency_snapshot <> 'weekly' or new.period_end <> new.period_start + 6 then
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

create or replace function public.prevent_settlement_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Settlements cannot be physically deleted.'
    using errcode = '23514';
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
begin
  if tg_op = 'DELETE' then
    select * into v_settlement from public.settlements settlement where settlement.id = old.settlement_id;
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

  new.description := trim(new.description);
  new.gross_amount := round(coalesce(new.gross_amount, 0), 2);
  new.deduction_amount := round(coalesce(new.deduction_amount, 0), 2);
  new.adjustment_amount := round(coalesce(new.adjustment_amount, 0), 2);
  new.driver_percentage_snapshot := coalesce(new.driver_percentage_snapshot, v_settlement.driver_percentage);
  new.elara_percentage_snapshot := coalesce(new.elara_percentage_snapshot, v_settlement.elara_percentage);
  new.snapshot_data := coalesce(new.snapshot_data, '{}'::jsonb);

  if new.driver_percentage_snapshot <> v_settlement.driver_percentage
    or new.elara_percentage_snapshot <> v_settlement.elara_percentage
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

    if v_service.operational_status not in ('completed', 'no_show', 'not_performed') then
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

  if v_settlement.calculation_method_snapshot = 'driver_share' then
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

create or replace function public.recalculate_settlement(p_settlement_id uuid)
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

create or replace function public.recalculate_settlement_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_old_settlement_id uuid;
  v_status text;
begin
  if tg_op = 'INSERT' then
    v_settlement_id := new.settlement_id;
  elsif tg_op = 'UPDATE' then
    v_settlement_id := new.settlement_id;
    v_old_settlement_id := old.settlement_id;
  elsif tg_op = 'DELETE' then
    v_settlement_id := old.settlement_id;
  end if;

  select settlement.status into v_status from public.settlements settlement where settlement.id = v_settlement_id;
  if v_status = 'draft' then
    perform public.recalculate_settlement(v_settlement_id);
  end if;

  if v_old_settlement_id is not null and v_old_settlement_id <> v_settlement_id then
    select settlement.status into v_status from public.settlements settlement where settlement.id = v_old_settlement_id;
    if v_status = 'draft' then
      perform public.recalculate_settlement(v_old_settlement_id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prepare_settlement_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement public.settlements%rowtype;
  v_cash_account public.cash_accounts%rowtype;
  v_cancel_allowed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Settlement payments cannot be physically deleted.'
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));
  new.amount := round(new.amount, 2);

  select * into v_settlement from public.settlements settlement where settlement.id = new.settlement_id for update;
  if not found then
    raise exception 'Settlement payment references a missing settlement.'
      using errcode = '23503';
  end if;

  if new.currency_code <> v_settlement.currency_code then
    raise exception 'Settlement payment currency must match settlement currency.'
      using errcode = '23514';
  end if;

  if new.payment_method = 'cash' then
    select * into v_cash_account from public.cash_accounts account where account.id = new.cash_account_id;
    if not found then
      raise exception 'Cash settlement payments require an existing cash account.'
        using errcode = '23503';
    end if;
    if v_cash_account.status <> 'active' or v_cash_account.currency_code <> new.currency_code then
      raise exception 'Cash settlement payment requires an active cash account with matching currency.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' and new.payment_status = 'completed' then
    if v_settlement.status <> 'approved' then
      raise exception 'Completed settlement payments require an approved settlement.'
        using errcode = '23514';
    end if;
    if new.amount <> v_settlement.pending_amount then
      raise exception 'Settlement payment amount must equal the current settlement pending amount.'
        using errcode = '23514';
    end if;
    if new.created_by is null or not public.settlement_app_user_is_active(new.created_by) then
      raise exception 'Completed settlement payments require an active created_by actor.'
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.settlement_payments payment
      where payment.settlement_id = new.settlement_id
        and payment.payment_status = 'completed'
    ) then
      raise exception 'Settlement already has a completed payment.'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.payment_status = 'completed' and new.payment_status in ('pending', 'failed') then
      raise exception 'Completed settlement payments cannot return to pending or failed.'
        using errcode = '23514';
    end if;

    if old.payment_status in ('cancelled', 'reversed') then
      raise exception 'Cancelled or reversed settlement payments cannot be reactivated or edited.'
        using errcode = '23514';
    end if;

    if old.payment_status = 'completed' and new.payment_status in ('cancelled', 'reversed') then
      v_cancel_allowed := current_setting('elara.settlement_payment_superadmin_cancel', true) is not distinct from old.id::text;
      if not v_cancel_allowed then
        raise exception 'Cancelling or reversing a completed settlement payment requires the future Superadmin secure function.'
          using errcode = '23514';
      end if;
    end if;

    if new.payment_status = 'completed' and old.payment_status <> 'completed' then
      if v_settlement.status <> 'approved' then
        raise exception 'Completed settlement payments require an approved settlement.'
          using errcode = '23514';
      end if;
      if new.amount <> v_settlement.pending_amount then
        raise exception 'Settlement payment amount must equal the current settlement pending amount.'
          using errcode = '23514';
      end if;
      if new.created_by is null or not public.settlement_app_user_is_active(new.created_by) then
        raise exception 'Completed settlement payments require an active created_by actor.'
          using errcode = '23514';
      end if;
    end if;

    if old.payment_status = 'completed'
      and (
        new.settlement_id is distinct from old.settlement_id
        or new.amount is distinct from old.amount
        or new.currency_code is distinct from old.currency_code
        or new.payment_method is distinct from old.payment_method
        or new.cash_account_id is distinct from old.cash_account_id
        or new.paid_at is distinct from old.paid_at
        or new.created_by is distinct from old.created_by
      )
    then
      raise exception 'Completed settlement payment economics cannot be edited.'
        using errcode = '23514';
    end if;
  end if;

  if new.cancelled_by is not null and not public.settlement_app_user_is_active(new.cancelled_by) then
    raise exception 'Settlement payment cancelled_by must reference an active app user.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_settlement_from_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_settlement(new.settlement_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.recalculate_settlement(new.settlement_id);
    if new.settlement_id is distinct from old.settlement_id then
      perform public.recalculate_settlement(old.settlement_id);
    end if;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.record_settlement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_status text;
  v_actor uuid;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_from_status := null;
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_from_status := old.status;
  else
    return new;
  end if;

  v_actor := case
    when new.status = 'approved' then new.approved_by
    when new.status = 'rejected' then new.rejected_by
    when new.status = 'cancelled' then new.cancelled_by
    else coalesce(new.updated_by, new.created_by)
  end;

  if new.status in ('approved', 'rejected', 'cancelled') and v_actor is null then
    raise exception 'Settlement status history requires an actor for approved, rejected and cancelled statuses.'
      using errcode = '23514';
  end if;

  v_reason := case
    when new.status = 'rejected' then new.rejection_reason
    when new.status = 'cancelled' then new.cancellation_reason
    else null
  end;

  -- Initial NULL -> draft history is recorded deliberately when a settlement is created.
  insert into public.settlement_status_history (
    settlement_id,
    from_status,
    to_status,
    changed_by_user_id,
    reason,
    metadata
  ) values (
    new.id,
    v_from_status,
    new.status,
    v_actor,
    v_reason,
    jsonb_build_object(
      'human_code', new.human_code,
      'payment_status', new.payment_status,
      'driver_id', new.driver_id,
      'period_start', new.period_start,
      'period_end', new.period_end
    )
  );

  return new;
end;
$$;

create or replace function public.prevent_settlement_status_history_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Settlement status history is append-only.'
    using errcode = '23514';
end;
$$;

create or replace function public.expense_is_locked_by_settlement(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.settlement_items item
    join public.settlements settlement on settlement.id = item.settlement_id
    where item.expense_id = p_expense_id
      and item.item_type = 'expense_deduction'
      and settlement.status in ('generated', 'submitted', 'approved')
  );
$$;

comment on function public.expense_is_locked_by_settlement(uuid) is
  'Returns true when an expense is included in a generated, submitted or approved settlement item.';

create or replace function public.prevent_locked_expense_by_settlement_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.expense_is_locked_by_settlement(old.id) then
      raise exception 'Expenses included in active settlements cannot be deleted.'
        using errcode = '23514';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if not public.expense_is_locked_by_settlement(old.id) then
      return new;
    end if;

    if new.paid_amount is distinct from old.paid_amount
      or new.pending_amount is distinct from old.pending_amount
      or new.payment_status is distinct from old.payment_status
      or new.reimbursement_status is distinct from old.reimbursement_status
      or new.updated_at is distinct from old.updated_at
      or new.updated_by is distinct from old.updated_by
    then
      if new.human_code is not distinct from old.human_code
        and new.category_id is not distinct from old.category_id
        and new.supplier_id is not distinct from old.supplier_id
        and new.service_id is not distinct from old.service_id
        and new.vehicle_id is not distinct from old.vehicle_id
        and new.driver_id is not distinct from old.driver_id
        and new.expense_date is not distinct from old.expense_date
        and new.description is not distinct from old.description
        and new.currency_code is not distinct from old.currency_code
        and new.subtotal_amount is not distinct from old.subtotal_amount
        and new.tax_rate is not distinct from old.tax_rate
        and new.tax_amount is not distinct from old.tax_amount
        and new.total_amount is not distinct from old.total_amount
        and new.status is not distinct from old.status
        and new.payment_responsibility is not distinct from old.payment_responsibility
        and new.advanced_by_user_id is not distinct from old.advanced_by_user_id
        and new.advanced_by_driver_id is not distinct from old.advanced_by_driver_id
        and new.reimbursable is not distinct from old.reimbursable
        and new.approved_at is not distinct from old.approved_at
        and new.approved_by is not distinct from old.approved_by
        and new.rejected_at is not distinct from old.rejected_at
        and new.rejected_by is not distinct from old.rejected_by
        and new.rejection_reason is not distinct from old.rejection_reason
        and new.cancelled_at is not distinct from old.cancelled_at
        and new.cancelled_by is not distinct from old.cancelled_by
        and new.cancellation_reason is not distinct from old.cancellation_reason
        and new.notes is not distinct from old.notes
        and new.internal_notes is not distinct from old.internal_notes
      then
        return new;
      end if;
    end if;

    raise exception 'Expenses included in active settlements cannot change economic, reference or cancellation fields.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Initial versioned rules use a stable effective date for deterministic rebuilds.
insert into public.settlement_rules (
  driver_type,
  name,
  calculation_method,
  driver_percentage,
  elara_percentage,
  frequency,
  currency_code,
  effective_from,
  is_active,
  notes
)
select
  'internal_driver',
  'Participacion mensual de Chofer interno',
  'driver_share',
  35,
  65,
  'monthly',
  'EUR',
  date '2026-01-01',
  true,
  'Regla inicial estable: chofer interno recibe 35% de la base elegible mensual.'
where not exists (
  select 1 from public.settlement_rules
  where driver_type = 'internal_driver'
    and frequency = 'monthly'
    and effective_from = date '2026-01-01'
);

insert into public.settlement_rules (
  driver_type,
  name,
  calculation_method,
  driver_percentage,
  elara_percentage,
  frequency,
  currency_code,
  effective_from,
  is_active,
  notes
)
select
  'external_collaborator',
  'Comision semanal de Colaborador externo',
  'elara_commission',
  90,
  10,
  'weekly',
  'EUR',
  date '2026-01-01',
  true,
  'Regla inicial estable: ELARA retiene 10% y el colaborador recibe 90% de la base elegible semanal.'
where not exists (
  select 1 from public.settlement_rules
  where driver_type = 'external_collaborator'
    and frequency = 'weekly'
    and effective_from = date '2026-01-01'
);

-- Triggers: updated_at.
drop trigger if exists set_settlement_rules_updated_at on public.settlement_rules;
create trigger set_settlement_rules_updated_at
before update on public.settlement_rules
for each row execute function public.set_updated_at();

drop trigger if exists set_settlements_updated_at on public.settlements;
create trigger set_settlements_updated_at
before update on public.settlements
for each row execute function public.set_updated_at();

drop trigger if exists set_settlement_payments_updated_at on public.settlement_payments;
create trigger set_settlement_payments_updated_at
before update on public.settlement_payments
for each row execute function public.set_updated_at();

-- Triggers: rules and settlements.
drop trigger if exists validate_settlement_rule_integrity_trigger on public.settlement_rules;
create trigger validate_settlement_rule_integrity_trigger
before insert or update or delete on public.settlement_rules
for each row execute function public.validate_settlement_rule_integrity();

drop trigger if exists assign_settlement_human_code_trigger on public.settlements;
create trigger assign_settlement_human_code_trigger
before insert or update of human_code on public.settlements
for each row execute function public.assign_settlement_human_code();

drop trigger if exists aa_prevent_settlement_calculated_update_trigger on public.settlements;
create trigger aa_prevent_settlement_calculated_update_trigger
before update of gross_eligible_amount, expense_deduction_amount, adjustment_amount, calculation_base_amount, driver_amount, elara_amount, paid_amount, pending_amount, payment_status
on public.settlements
for each row execute function public.prevent_settlement_calculated_update();

drop trigger if exists prepare_settlement_trigger on public.settlements;
create trigger prepare_settlement_trigger
before insert or update on public.settlements
for each row execute function public.prepare_settlement();

drop trigger if exists record_settlement_status_change_trigger on public.settlements;
create trigger record_settlement_status_change_trigger
after insert or update of status on public.settlements
for each row execute function public.record_settlement_status_change();

drop trigger if exists prevent_settlement_delete_trigger on public.settlements;
create trigger prevent_settlement_delete_trigger
before delete on public.settlements
for each row execute function public.prevent_settlement_delete();

-- Triggers: items.
drop trigger if exists validate_settlement_item_trigger on public.settlement_items;
create trigger validate_settlement_item_trigger
before insert or update or delete on public.settlement_items
for each row execute function public.validate_settlement_item();

drop trigger if exists recalculate_settlement_from_item_trigger on public.settlement_items;
create trigger recalculate_settlement_from_item_trigger
after insert or update or delete on public.settlement_items
for each row execute function public.recalculate_settlement_from_item();

-- Triggers: payments.
drop trigger if exists assign_settlement_payment_human_code_trigger on public.settlement_payments;
create trigger assign_settlement_payment_human_code_trigger
before insert or update of human_code, currency_code on public.settlement_payments
for each row execute function public.assign_settlement_payment_human_code();

drop trigger if exists prepare_settlement_payment_trigger on public.settlement_payments;
create trigger prepare_settlement_payment_trigger
before insert or update or delete on public.settlement_payments
for each row execute function public.prepare_settlement_payment();

drop trigger if exists recalculate_settlement_from_payment_trigger on public.settlement_payments;
create trigger recalculate_settlement_from_payment_trigger
after insert or update of settlement_id, payment_status, amount
on public.settlement_payments
for each row execute function public.recalculate_settlement_from_payment();

-- Triggers: history and expense locks.
drop trigger if exists prevent_settlement_status_history_changes_trigger on public.settlement_status_history;
create trigger prevent_settlement_status_history_changes_trigger
before update or delete on public.settlement_status_history
for each row execute function public.prevent_settlement_status_history_changes();

drop trigger if exists prevent_locked_expense_by_settlement_changes_trigger on public.expenses;
create trigger prevent_locked_expense_by_settlement_changes_trigger
before update or delete on public.expenses
for each row execute function public.prevent_locked_expense_by_settlement_changes();

-- Security: close direct access until RLS and domain secure functions are added later.
revoke all on table public.settlement_rules from public, anon, authenticated;
revoke all on table public.settlements from public, anon, authenticated;
revoke all on table public.settlement_items from public, anon, authenticated;
revoke all on table public.settlement_payments from public, anon, authenticated;
revoke all on table public.settlement_status_history from public, anon, authenticated;

grant select, insert, update, delete on table public.settlement_rules to service_role;
grant select, insert, update, delete on table public.settlements to service_role;
grant select, insert, update, delete on table public.settlement_items to service_role;
grant select, insert, update, delete on table public.settlement_payments to service_role;
grant select, insert on table public.settlement_status_history to service_role;

revoke all on function public.settlement_app_user_is_active(uuid) from public, anon, authenticated;
revoke all on function public.assign_settlement_human_code() from public, anon, authenticated;
revoke all on function public.assign_settlement_payment_human_code() from public, anon, authenticated;
revoke all on function public.validate_settlement_rule_integrity() from public, anon, authenticated;
revoke all on function public.prevent_settlement_calculated_update() from public, anon, authenticated;
revoke all on function public.prepare_settlement() from public, anon, authenticated;
revoke all on function public.prevent_settlement_delete() from public, anon, authenticated;
revoke all on function public.validate_settlement_item() from public, anon, authenticated;
revoke all on function public.recalculate_settlement(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_settlement_from_item() from public, anon, authenticated;
revoke all on function public.prepare_settlement_payment() from public, anon, authenticated;
revoke all on function public.recalculate_settlement_from_payment() from public, anon, authenticated;
revoke all on function public.record_settlement_status_change() from public, anon, authenticated;
revoke all on function public.prevent_settlement_status_history_changes() from public, anon, authenticated;
revoke all on function public.expense_is_locked_by_settlement(uuid) from public, anon, authenticated;
revoke all on function public.prevent_locked_expense_by_settlement_changes() from public, anon, authenticated;

grant execute on function public.settlement_app_user_is_active(uuid) to service_role;
grant execute on function public.assign_settlement_human_code() to service_role;
grant execute on function public.assign_settlement_payment_human_code() to service_role;
grant execute on function public.validate_settlement_rule_integrity() to service_role;
grant execute on function public.prevent_settlement_calculated_update() to service_role;
grant execute on function public.prepare_settlement() to service_role;
grant execute on function public.prevent_settlement_delete() to service_role;
grant execute on function public.validate_settlement_item() to service_role;
grant execute on function public.recalculate_settlement(uuid) to service_role;
grant execute on function public.recalculate_settlement_from_item() to service_role;
grant execute on function public.prepare_settlement_payment() to service_role;
grant execute on function public.recalculate_settlement_from_payment() to service_role;
grant execute on function public.record_settlement_status_change() to service_role;
grant execute on function public.prevent_settlement_status_history_changes() to service_role;
grant execute on function public.expense_is_locked_by_settlement(uuid) to service_role;
grant execute on function public.prevent_locked_expense_by_settlement_changes() to service_role;

do $$
declare
  v_missing_tables text[];
  v_missing_functions text[];
  v_missing_triggers text[];
  v_forbidden_tables text[];
  v_forbidden_functions text[];
  v_function text;
begin
  with expected(table_name) as (
    values
      ('settlement_rules'),
      ('settlements'),
      ('settlement_items'),
      ('settlement_payments'),
      ('settlement_status_history')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into v_missing_tables
  from expected
  where to_regclass('public.' || expected.table_name) is null;

  if v_missing_tables is not null then
    raise exception 'Missing settlement tables: %', v_missing_tables;
  end if;

  foreach v_function in array array[
    'public.settlement_app_user_is_active(uuid)',
    'public.assign_settlement_human_code()',
    'public.assign_settlement_payment_human_code()',
    'public.validate_settlement_rule_integrity()',
    'public.prevent_settlement_calculated_update()',
    'public.prepare_settlement()',
    'public.prevent_settlement_delete()',
    'public.validate_settlement_item()',
    'public.recalculate_settlement(uuid)',
    'public.recalculate_settlement_from_item()',
    'public.prepare_settlement_payment()',
    'public.recalculate_settlement_from_payment()',
    'public.record_settlement_status_change()',
    'public.prevent_settlement_status_history_changes()',
    'public.expense_is_locked_by_settlement(uuid)',
    'public.prevent_locked_expense_by_settlement_changes()'
  ] loop
    if to_regprocedure(v_function) is null then
      v_missing_functions := array_append(v_missing_functions, v_function);
    end if;
  end loop;

  if v_missing_functions is not null then
    raise exception 'Missing settlement functions: %', v_missing_functions;
  end if;

  with expected(trigger_name) as (
    values
      ('set_settlement_rules_updated_at'),
      ('set_settlements_updated_at'),
      ('set_settlement_payments_updated_at'),
      ('validate_settlement_rule_integrity_trigger'),
      ('assign_settlement_human_code_trigger'),
      ('aa_prevent_settlement_calculated_update_trigger'),
      ('prepare_settlement_trigger'),
      ('record_settlement_status_change_trigger'),
      ('prevent_settlement_delete_trigger'),
      ('validate_settlement_item_trigger'),
      ('recalculate_settlement_from_item_trigger'),
      ('assign_settlement_payment_human_code_trigger'),
      ('prepare_settlement_payment_trigger'),
      ('recalculate_settlement_from_payment_trigger'),
      ('prevent_settlement_status_history_changes_trigger'),
      ('prevent_locked_expense_by_settlement_changes_trigger')
  )
  select array_agg(expected.trigger_name order by expected.trigger_name)
  into v_missing_triggers
  from expected
  where not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname = expected.trigger_name
      and not trigger_row.tgisinternal
  );

  if v_missing_triggers is not null then
    raise exception 'Missing settlement triggers: %', v_missing_triggers;
  end if;

  if not exists (
    select 1
    from public.settlement_rules rule
    where rule.driver_type = 'internal_driver'
      and rule.calculation_method = 'driver_share'
      and rule.driver_percentage = 35
      and rule.elara_percentage = 65
      and rule.frequency = 'monthly'
      and rule.currency_code = 'EUR'
      and rule.effective_from = date '2026-01-01'
      and rule.is_active = true
  ) then
    raise exception 'Missing initial internal driver settlement rule 35/65 monthly.';
  end if;

  if not exists (
    select 1
    from public.settlement_rules rule
    where rule.driver_type = 'external_collaborator'
      and rule.calculation_method = 'elara_commission'
      and rule.driver_percentage = 90
      and rule.elara_percentage = 10
      and rule.frequency = 'weekly'
      and rule.currency_code = 'EUR'
      and rule.effective_from = date '2026-01-01'
      and rule.is_active = true
  ) then
    raise exception 'Missing initial external collaborator settlement rule 90/10 weekly.';
  end if;

  if exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix in ('SET', 'SETPAY')
      and (counter.is_active <> true or counter.padding <> 6)
  ) or not exists (select 1 from public.human_code_counters where prefix = 'SET')
     or not exists (select 1 from public.human_code_counters where prefix = 'SETPAY') then
    raise exception 'SET and SETPAY human code counters must exist, be active and use padding 6.';
  end if;

  if exists (select 1 from public.settlements where human_code !~ '^SET-[0-9]{6}$') then
    raise exception 'Invalid SET human code format detected.';
  end if;

  if exists (select 1 from public.settlement_payments where human_code !~ '^SETPAY-[0-9]{6}$') then
    raise exception 'Invalid SETPAY human code format detected.';
  end if;

  if exists (
    select 1
    from public.settlements settlement
    where settlement.period_end < settlement.period_start
      or settlement.currency_code !~ '^[A-Z]{3}$'
      or settlement.driver_percentage < 0
      or settlement.driver_percentage > 100
      or settlement.elara_percentage < 0
      or settlement.elara_percentage > 100
      or round(settlement.driver_percentage + settlement.elara_percentage, 4) <> 100
      or settlement.calculation_base_amount <> greatest(round(settlement.gross_eligible_amount - settlement.expense_deduction_amount + settlement.adjustment_amount, 2), 0)
      or settlement.driver_amount <> case
        when settlement.calculation_method_snapshot = 'driver_share' then round(settlement.calculation_base_amount * settlement.driver_percentage / 100, 2)
        when settlement.calculation_method_snapshot = 'elara_commission' then round(settlement.calculation_base_amount - round(settlement.calculation_base_amount * settlement.elara_percentage / 100, 2), 2)
      end
      or settlement.elara_amount <> round(settlement.calculation_base_amount - settlement.driver_amount, 2)
      or settlement.pending_amount <> round(settlement.driver_amount - settlement.paid_amount, 2)
  ) then
    raise exception 'Invalid settlement monetary calculation detected.';
  end if;

  if exists (
    select 1
    from public.settlements settlement
    where (settlement.driver_type_snapshot = 'internal_driver' and (settlement.frequency_snapshot <> 'monthly' or settlement.period_start <> date_trunc('month', settlement.period_start)::date or settlement.period_end <> (date_trunc('month', settlement.period_start)::date + interval '1 month - 1 day')::date))
       or (settlement.driver_type_snapshot = 'external_collaborator' and (settlement.frequency_snapshot <> 'weekly' or settlement.period_end <> settlement.period_start + 6))
  ) then
    raise exception 'Invalid settlement period detected.';
  end if;

  if exists (
    select 1
    from public.settlements a
    join public.settlements b on b.id <> a.id
      and b.driver_id = a.driver_id
      and b.status in ('draft', 'generated', 'submitted', 'approved')
      and a.status in ('draft', 'generated', 'submitted', 'approved')
      and b.period_start <= a.period_end
      and a.period_start <= b.period_end
  ) then
    raise exception 'Overlapping active settlements detected.';
  end if;

  if exists (
    select 1
    from public.settlement_items item
    where jsonb_typeof(item.snapshot_data) <> 'object'
      or item.description is null
      or length(trim(item.description)) = 0
      or item.driver_percentage_snapshot < 0
      or item.driver_percentage_snapshot > 100
      or item.elara_percentage_snapshot < 0
      or item.elara_percentage_snapshot > 100
      or round(item.driver_percentage_snapshot + item.elara_percentage_snapshot, 4) <> 100
  ) then
    raise exception 'Invalid settlement item snapshot or percentage data detected.';
  end if;

  if exists (
    select 1
    from public.settlement_items a
    join public.settlements sa on sa.id = a.settlement_id and sa.status in ('draft', 'generated', 'submitted', 'approved')
    join public.settlement_items b on b.id <> a.id
      and b.item_type = 'service_income'
      and a.item_type = 'service_income'
      and b.service_id = a.service_id
      and b.service_assignment_id = a.service_assignment_id
    join public.settlements sb on sb.id = b.settlement_id and sb.status in ('draft', 'generated', 'submitted', 'approved')
  ) then
    raise exception 'Duplicate service income items in active settlements detected.';
  end if;

  if exists (
    select 1
    from public.settlement_items a
    join public.settlements sa on sa.id = a.settlement_id and sa.status in ('draft', 'generated', 'submitted', 'approved')
    join public.settlement_items b on b.id <> a.id
      and b.item_type = 'expense_deduction'
      and a.item_type = 'expense_deduction'
      and b.expense_id = a.expense_id
    join public.settlements sb on sb.id = b.settlement_id and sb.status in ('draft', 'generated', 'submitted', 'approved')
  ) then
    raise exception 'Duplicate expense deduction items in active settlements detected.';
  end if;

  if exists (
    select 1
    from public.settlement_payments payment
    join public.settlements settlement on settlement.id = payment.settlement_id
    where payment.payment_status = 'completed'
      and (payment.amount <> settlement.driver_amount or payment.currency_code <> settlement.currency_code or payment.created_by is null)
  ) then
    raise exception 'Completed settlement payments must be full, currency-coherent and actor-traced.';
  end if;

  if exists (
    select 1
    from public.settlement_status_history history
    where history.to_status in ('approved', 'rejected', 'cancelled')
      and history.changed_by_user_id is null
  ) then
    raise exception 'Final settlement status history entries require an actor.';
  end if;

  with protected(table_name) as (
    values
      ('settlement_rules'),
      ('settlements'),
      ('settlement_items'),
      ('settlement_payments'),
      ('settlement_status_history')
  )
  select array_agg(table_name order by table_name)
  into v_forbidden_tables
  from protected
  where has_table_privilege('anon', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE');

  if v_forbidden_tables is not null then
    raise exception 'Settlement tables expose direct privileges to anon/authenticated: %', v_forbidden_tables;
  end if;

  foreach v_function in array array[
    'public.settlement_app_user_is_active(uuid)',
    'public.assign_settlement_human_code()',
    'public.assign_settlement_payment_human_code()',
    'public.validate_settlement_rule_integrity()',
    'public.prevent_settlement_calculated_update()',
    'public.prepare_settlement()',
    'public.prevent_settlement_delete()',
    'public.validate_settlement_item()',
    'public.recalculate_settlement(uuid)',
    'public.recalculate_settlement_from_item()',
    'public.prepare_settlement_payment()',
    'public.recalculate_settlement_from_payment()',
    'public.record_settlement_status_change()',
    'public.prevent_settlement_status_history_changes()',
    'public.expense_is_locked_by_settlement(uuid)',
    'public.prevent_locked_expense_by_settlement_changes()'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE')
    then
      v_forbidden_functions := array_append(v_forbidden_functions, v_function);
    end if;
  end loop;

  if v_forbidden_functions is not null then
    raise exception 'Settlement functions expose direct EXECUTE to anon/authenticated: %', v_forbidden_functions;
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'next_human_code(text) must remain closed to anon/authenticated.';
  end if;

  if exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'settlement_payments'
      and column_row.column_name = 'cash_movement_id'
  ) then
    raise exception 'Settlement payments must not create or store cash movement references in this migration.';
  end if;
end;
$$;
