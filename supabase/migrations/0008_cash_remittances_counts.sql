-- ELARA Transport V4.0
-- Migration 0008: cash accounts, remittances and counts.
--
-- Creates the cash domain only.
-- No receivables, expenses, settlements, seed data, full RLS or frontend wiring.

create table if not exists public.cash_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  account_type text not null,
  currency_code text not null default 'EUR',
  driver_id uuid references public.drivers(id) on delete restrict,
  responsible_user_id uuid references public.app_users(id) on delete restrict,
  status text not null default 'active',
  opening_balance numeric(14, 2) not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  closed_by uuid references public.app_users(id) on delete restrict,

  constraint cash_accounts_name_not_empty
    check (length(trim(name)) > 0),
  constraint cash_accounts_type_check
    check (account_type in ('central', 'driver', 'administrative', 'temporary')),
  constraint cash_accounts_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint cash_accounts_status_check
    check (status in ('active', 'suspended', 'closed')),
  constraint cash_accounts_opening_balance_non_negative
    check (opening_balance >= 0),
  constraint cash_accounts_driver_rules
    check (
      (account_type = 'driver' and driver_id is not null)
      or (account_type <> 'driver' and driver_id is null)
    ),
  constraint cash_accounts_closed_fields
    check (status <> 'closed' or closed_at is not null)
);

comment on table public.cash_accounts is
  'Logical cash accounts. The central cash balance is derived from cash_movements, not stored.';

create unique index if not exists cash_accounts_one_active_driver_account_idx
  on public.cash_accounts (driver_id)
  where account_type = 'driver' and status = 'active';

create unique index if not exists cash_accounts_one_active_central_account_idx
  on public.cash_accounts (account_type)
  where account_type = 'central' and status = 'active';

create index if not exists cash_accounts_status_type_idx
  on public.cash_accounts (status, account_type);

create table if not exists public.cash_remittances (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  source_cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  destination_cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  status text not null default 'draft',
  declared_amount numeric(14, 2) not null default 0,
  verified_amount numeric(14, 2),
  currency_code text not null default 'EUR',
  prepared_at timestamptz,
  submitted_at timestamptz,
  received_at timestamptz,
  verified_at timestamptz,
  cancelled_at timestamptz,
  prepared_by_user_id uuid references public.app_users(id) on delete restrict,
  submitted_by_driver_id uuid references public.drivers(id) on delete restrict,
  received_by_user_id uuid references public.app_users(id) on delete restrict,
  verified_by_user_id uuid references public.app_users(id) on delete restrict,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint cash_remittances_human_code_unique
    unique (human_code),
  constraint cash_remittances_human_code_format
    check (human_code ~ '^REM-[0-9]{6}$'),
  constraint cash_remittances_distinct_accounts
    check (source_cash_account_id <> destination_cash_account_id),
  constraint cash_remittances_status_check
    check (status in ('draft', 'prepared', 'submitted', 'received', 'verified', 'cancelled')),
  constraint cash_remittances_amounts_non_negative
    check (declared_amount >= 0 and (verified_amount is null or verified_amount >= 0)),
  constraint cash_remittances_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint cash_remittances_prepared_fields
    check (status <> 'prepared' or prepared_at is not null),
  constraint cash_remittances_submitted_fields
    check (status <> 'submitted' or submitted_at is not null),
  constraint cash_remittances_received_fields
    check (
      status <> 'received'
      or (received_at is not null and received_by_user_id is not null)
    ),
  constraint cash_remittances_verified_fields
    check (
      status <> 'verified'
      or (
        verified_at is not null
        and verified_by_user_id is not null
        and verified_amount is not null
      )
    ),
  constraint cash_remittances_cancelled_fields
    check (
      status <> 'cancelled'
      or (
        cancelled_at is not null
        and length(trim(coalesce(cancellation_reason, ''))) > 0
      )
    )
);

comment on table public.cash_remittances is
  'Cash transfers between cash accounts. State changes do not automatically create cash movements in this migration.';

create index if not exists cash_remittances_driver_status_idx
  on public.cash_remittances (driver_id, status, submitted_at);

create index if not exists cash_remittances_accounts_status_idx
  on public.cash_remittances (source_cash_account_id, destination_cash_account_id, status);

create table if not exists public.cash_counts (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  status text not null default 'draft',
  counted_at timestamptz,
  period_start_at timestamptz,
  period_end_at timestamptz,
  expected_amount numeric(14, 2) not null default 0,
  counted_amount numeric(14, 2) not null default 0,
  difference_amount numeric(14, 2) not null default 0,
  currency_code text not null default 'EUR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  counted_by_user_id uuid references public.app_users(id) on delete restrict,
  verified_by_user_id uuid references public.app_users(id) on delete restrict,
  verified_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  cancellation_reason text,

  constraint cash_counts_human_code_unique
    unique (human_code),
  constraint cash_counts_human_code_format
    check (human_code ~ '^ARC-[0-9]{6}$'),
  constraint cash_counts_status_check
    check (status in ('draft', 'counted', 'verified', 'cancelled')),
  constraint cash_counts_amounts_non_negative
    check (expected_amount >= 0 and counted_amount >= 0),
  constraint cash_counts_difference_formula
    check (difference_amount = round(counted_amount - expected_amount, 2)),
  constraint cash_counts_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint cash_counts_period_order
    check (period_start_at is null or period_end_at is null or period_end_at >= period_start_at),
  constraint cash_counts_counted_fields
    check (
      status <> 'counted'
      or (counted_at is not null and counted_by_user_id is not null)
    ),
  constraint cash_counts_verified_fields
    check (
      status <> 'verified'
      or (verified_at is not null and verified_by_user_id is not null)
    ),
  constraint cash_counts_cancelled_fields
    check (
      status <> 'cancelled'
      or (
        cancelled_at is not null
        and length(trim(coalesce(cancellation_reason, ''))) > 0
      )
    )
);

comment on table public.cash_counts is
  'Cash counts compare the expected balance derived from cash movements against the physically counted amount.';

create index if not exists cash_counts_account_status_idx
  on public.cash_counts (cash_account_id, status, counted_at);

create index if not exists cash_counts_active_period_idx
  on public.cash_counts (cash_account_id, period_start_at, period_end_at)
  where status in ('draft', 'counted')
    and period_start_at is not null
    and period_end_at is not null;

create table if not exists public.cash_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  movement_type text not null,
  movement_category text not null,
  amount numeric(14, 2) not null,
  currency_code text not null default 'EUR',
  occurred_at timestamptz not null default now(),
  service_id uuid references public.services(id) on delete restrict,
  service_payment_id uuid references public.service_payments(id) on delete restrict,
  remittance_id uuid references public.cash_remittances(id) on delete restrict,
  cash_count_id uuid references public.cash_counts(id) on delete restrict,
  original_movement_id uuid references public.cash_movements(id) on delete restrict deferrable initially deferred,
  source_type text,
  source_id uuid,
  idempotency_key text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  actor_driver_id uuid references public.drivers(id) on delete restrict,

  constraint cash_movements_human_code_unique
    unique (human_code),
  constraint cash_movements_human_code_format
    check (human_code ~ '^CASH-[0-9]{6}$'),
  constraint cash_movements_type_check
    check (movement_type in ('inflow', 'outflow')),
  constraint cash_movements_category_check
    check (movement_category in (
      'service_payment',
      'remittance_sent',
      'remittance_received',
      'count_adjustment',
      'reversal',
      'opening_balance',
      'manual_adjustment',
      'other'
    )),
  constraint cash_movements_amount_positive
    check (amount > 0),
  constraint cash_movements_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint cash_movements_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint cash_movements_source_type_not_empty
    check (source_type is null or length(trim(source_type)) > 0),
  constraint cash_movements_idempotency_not_empty
    check (idempotency_key is null or length(trim(idempotency_key)) > 0),
  constraint cash_movements_not_self_original
    check (original_movement_id is null or original_movement_id <> id),
  constraint cash_movements_service_payment_refs
    check (
      movement_category <> 'service_payment'
      or (service_id is not null and service_payment_id is not null)
    ),
  constraint cash_movements_remittance_refs
    check (
      movement_category not in ('remittance_sent', 'remittance_received')
      or remittance_id is not null
    ),
  constraint cash_movements_count_adjustment_refs
    check (movement_category <> 'count_adjustment' or cash_count_id is not null),
  constraint cash_movements_reversal_refs
    check (
      (movement_category = 'reversal' and original_movement_id is not null)
      or (movement_category <> 'reversal' and original_movement_id is null)
    )
);

comment on table public.cash_movements is
  'Append-only cash movements. Amount is always positive; movement_type determines the accounting sign. Reversals use original_movement_id as the only source of truth.';

comment on column public.cash_movements.original_movement_id is
  'For movement_category = reversal, points to the original movement. The original row is never updated with a reverse pointer.';

comment on column public.cash_movements.movement_category is
  'opening_balance is reserved for future imports; calculate_cash_account_balance already includes cash_accounts.opening_balance, so normal setup must not create an extra opening movement.';

create unique index if not exists cash_movements_idempotency_unique_idx
  on public.cash_movements (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists cash_movements_one_reversal_per_original_idx
  on public.cash_movements (original_movement_id)
  where movement_category = 'reversal' and original_movement_id is not null;

create index if not exists cash_movements_account_occurred_idx
  on public.cash_movements (cash_account_id, occurred_at);

create index if not exists cash_movements_source_idx
  on public.cash_movements (source_type, source_id)
  where source_type is not null and source_id is not null;

create table if not exists public.cash_remittance_items (
  id uuid primary key default extensions.gen_random_uuid(),
  remittance_id uuid not null references public.cash_remittances(id) on delete restrict,
  cash_movement_id uuid references public.cash_movements(id) on delete restrict,
  service_payment_id uuid references public.service_payments(id) on delete restrict,
  service_id uuid references public.services(id) on delete restrict,
  amount numeric(14, 2) not null,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint cash_remittance_items_amount_positive
    check (amount > 0),
  constraint cash_remittance_items_source_required
    check (cash_movement_id is not null or service_payment_id is not null)
);

comment on table public.cash_remittance_items is
  'Items declared in a remittance. Items are locked after submission.';

create index if not exists cash_remittance_items_remittance_idx
  on public.cash_remittance_items (remittance_id);

create table if not exists public.cash_count_items (
  id uuid primary key default extensions.gen_random_uuid(),
  cash_count_id uuid not null references public.cash_counts(id) on delete restrict,
  denomination numeric(10, 2) not null,
  quantity integer not null,
  line_amount numeric(14, 2) not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint cash_count_items_denomination_positive
    check (denomination > 0),
  constraint cash_count_items_quantity_non_negative
    check (quantity >= 0),
  constraint cash_count_items_line_formula
    check (line_amount = round(denomination * quantity, 2)),
  constraint cash_count_items_one_denomination
    unique (cash_count_id, denomination)
);

comment on table public.cash_count_items is
  'Physical denomination breakdown for a cash count.';

create table if not exists public.cash_discrepancies (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  discrepancy_type text not null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  cash_count_id uuid references public.cash_counts(id) on delete restrict,
  remittance_id uuid references public.cash_remittances(id) on delete restrict,
  expected_amount numeric(14, 2) not null,
  actual_amount numeric(14, 2) not null,
  difference_amount numeric(14, 2) not null,
  currency_code text not null default 'EUR',
  status text not null default 'open',
  reason_code text,
  reason_details text,
  resolution_notes text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  resolved_by uuid references public.app_users(id) on delete restrict,
  cancelled_by uuid references public.app_users(id) on delete restrict,

  constraint cash_discrepancies_human_code_unique
    unique (human_code),
  constraint cash_discrepancies_human_code_format
    check (human_code ~ '^DIF-[0-9]{6}$'),
  constraint cash_discrepancies_type_check
    check (discrepancy_type in ('cash_count', 'remittance')),
  constraint cash_discrepancies_status_check
    check (status in ('open', 'under_review', 'resolved', 'cancelled')),
  constraint cash_discrepancies_amounts_non_negative
    check (expected_amount >= 0 and actual_amount >= 0),
  constraint cash_discrepancies_difference_formula
    check (difference_amount = round(actual_amount - expected_amount, 2)),
  constraint cash_discrepancies_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint cash_discrepancies_reference_by_type
    check (
      (discrepancy_type = 'cash_count' and cash_count_id is not null and remittance_id is null)
      or (discrepancy_type = 'remittance' and remittance_id is not null and cash_count_id is null)
    ),
  constraint cash_discrepancies_resolved_fields
    check (
      status <> 'resolved'
      or (resolved_at is not null and resolved_by is not null)
    ),
  constraint cash_discrepancies_cancelled_fields
    check (
      status <> 'cancelled'
      or (cancelled_at is not null and cancelled_by is not null)
    )
);

comment on table public.cash_discrepancies is
  'Administrative differences detected in cash counts or remittances. They do not change cash balance automatically.';

create unique index if not exists cash_discrepancies_one_open_per_count_idx
  on public.cash_discrepancies (cash_count_id)
  where discrepancy_type = 'cash_count' and status in ('open', 'under_review');

create unique index if not exists cash_discrepancies_one_open_per_remittance_idx
  on public.cash_discrepancies (remittance_id)
  where discrepancy_type = 'remittance' and status in ('open', 'under_review');

drop trigger if exists set_cash_accounts_updated_at on public.cash_accounts;
create trigger set_cash_accounts_updated_at
before update on public.cash_accounts
for each row
execute function public.set_updated_at();

drop trigger if exists set_cash_remittances_updated_at on public.cash_remittances;
create trigger set_cash_remittances_updated_at
before update on public.cash_remittances
for each row
execute function public.set_updated_at();

drop trigger if exists set_cash_counts_updated_at on public.cash_counts;
create trigger set_cash_counts_updated_at
before update on public.cash_counts
for each row
execute function public.set_updated_at();

drop trigger if exists set_cash_discrepancies_updated_at on public.cash_discrepancies;
create trigger set_cash_discrepancies_updated_at
before update on public.cash_discrepancies
for each row
execute function public.set_updated_at();

create or replace function public.assign_cash_movement_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Cash movement human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('CASH');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^CASH-[0-9]{6}$' then
    raise exception 'Invalid cash movement human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  return new;
end;
$$;

create or replace function public.assign_cash_remittance_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Cash remittance human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('REM');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^REM-[0-9]{6}$' then
    raise exception 'Invalid cash remittance human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  return new;
end;
$$;

create or replace function public.assign_cash_count_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Cash count human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('ARC');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^ARC-[0-9]{6}$' then
    raise exception 'Invalid cash count human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  return new;
end;
$$;

create or replace function public.assign_cash_discrepancy_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Cash discrepancy human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('DIF');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^DIF-[0-9]{6}$' then
    raise exception 'Invalid cash discrepancy human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  return new;
end;
$$;

create or replace function public.prevent_cash_movement_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Cash movements are append-only; create a reversal movement instead.'
    using errcode = '23514';
end;
$$;

create or replace function public.validate_cash_movement_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.cash_accounts%rowtype;
  v_original public.cash_movements%rowtype;
  v_service_payment public.service_payments%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Cash movements are append-only; create a reversal movement instead.'
      using errcode = '23514';
  end if;

  select *
  into v_account
  from public.cash_accounts account
  where account.id = new.cash_account_id;

  if not found then
    raise exception 'Cash movement references a missing cash account.'
      using errcode = '23503';
  end if;

  if v_account.status <> 'active' and new.movement_category not in ('reversal', 'opening_balance') then
    raise exception 'Cash movements require an active cash account.'
      using errcode = '23514';
  end if;

  if new.currency_code <> v_account.currency_code then
    raise exception 'Cash movement currency must match the cash account currency.'
      using errcode = '23514';
  end if;

  if new.movement_category = 'service_payment' then
    select *
    into v_service_payment
    from public.service_payments payment
    where payment.id = new.service_payment_id;

    if not found then
      raise exception 'Cash service payment movement references a missing service payment.'
        using errcode = '23503';
    end if;

    if v_service_payment.service_id <> new.service_id then
      raise exception 'Cash movement service_id must match the service payment.'
        using errcode = '23514';
    end if;

    if v_service_payment.payment_method <> 'cash' then
      raise exception 'Only cash service payments can create cash movements in this domain.'
        using errcode = '23514';
    end if;

    if v_service_payment.payment_status <> 'completed' then
      raise exception 'Cash movement requires a completed service payment.'
        using errcode = '23514';
    end if;

    if v_service_payment.amount <> new.amount or v_service_payment.currency_code <> new.currency_code then
      raise exception 'Cash movement amount and currency must match the service payment.'
        using errcode = '23514';
    end if;
  end if;

  if new.movement_category = 'reversal' then
    select *
    into v_original
    from public.cash_movements movement
    where movement.id = new.original_movement_id;

    if not found then
      raise exception 'Cash reversal references a missing original movement.'
        using errcode = '23503';
    end if;

    if v_original.movement_category = 'reversal' then
      raise exception 'Cash reversal cannot reverse another reversal.'
        using errcode = '23514';
    end if;

    if v_original.cash_account_id <> new.cash_account_id then
      raise exception 'Cash reversal must use the same cash account as the original movement.'
        using errcode = '23514';
    end if;

    if v_original.amount <> new.amount or v_original.currency_code <> new.currency_code then
      raise exception 'Cash reversal must match original amount and currency.'
        using errcode = '23514';
    end if;

    if v_original.movement_type = new.movement_type then
      raise exception 'Cash reversal movement_type must be opposite to the original movement.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.calculate_cash_account_balance(
  p_cash_account_id uuid,
  p_until_at timestamptz default null
)
returns numeric(14, 2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening_balance numeric(14, 2);
  v_movements_total numeric(14, 2);
begin
  select account.opening_balance
  into v_opening_balance
  from public.cash_accounts account
  where account.id = p_cash_account_id;

  if not found then
    raise exception 'Cash account "%" does not exist.', p_cash_account_id
      using errcode = '23503';
  end if;

  select coalesce(round(sum(
    case movement.movement_type
      when 'inflow' then movement.amount
      when 'outflow' then -movement.amount
      else 0
    end
  ), 2), 0)
  into v_movements_total
  from public.cash_movements movement
  where movement.cash_account_id = p_cash_account_id
    and (p_until_at is null or movement.occurred_at <= p_until_at);

  return round(v_opening_balance + v_movements_total, 2);
end;
$$;

comment on function public.calculate_cash_account_balance(uuid, timestamptz) is
  'Returns the derived cash account balance from opening_balance plus signed append-only cash movements.';

create or replace function public.calculate_cash_remittance_items_total(p_remittance_id uuid)
returns numeric(14, 2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(14, 2);
begin
  select coalesce(round(sum(item.amount), 2), 0)
  into v_total
  from public.cash_remittance_items item
  where item.remittance_id = p_remittance_id;

  return v_total;
end;
$$;

create or replace function public.prepare_cash_remittance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.cash_accounts%rowtype;
  v_destination public.cash_accounts%rowtype;
begin
  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Cash remittances must be created in draft status.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status in ('verified', 'cancelled') then
    raise exception 'Final cash remittances cannot be updated directly.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'draft' and new.status not in ('prepared', 'cancelled') then
      raise exception 'Invalid cash remittance status transition: draft can only move to prepared or cancelled.'
        using errcode = '23514';
    elsif old.status = 'prepared' and new.status not in ('submitted', 'cancelled') then
      raise exception 'Invalid cash remittance status transition: prepared can only move to submitted or cancelled.'
        using errcode = '23514';
    elsif old.status = 'submitted' and new.status not in ('received', 'cancelled') then
      raise exception 'Invalid cash remittance status transition: submitted can only move to received or cancelled.'
        using errcode = '23514';
    elsif old.status = 'received' and new.status not in ('verified', 'cancelled') then
      raise exception 'Invalid cash remittance status transition: received can only move to verified or cancelled.'
        using errcode = '23514';
    end if;
  end if;

  select *
  into v_source
  from public.cash_accounts account
  where account.id = new.source_cash_account_id;

  if not found then
    raise exception 'Cash remittance references a missing source cash account.'
      using errcode = '23503';
  end if;

  select *
  into v_destination
  from public.cash_accounts account
  where account.id = new.destination_cash_account_id;

  if not found then
    raise exception 'Cash remittance references a missing destination cash account.'
      using errcode = '23503';
  end if;

  if v_source.currency_code <> new.currency_code or v_destination.currency_code <> new.currency_code then
    raise exception 'Cash remittance currency must match source and destination cash accounts.'
      using errcode = '23514';
  end if;

  if new.status in ('submitted', 'received', 'verified') then
    if v_source.status <> 'active' or v_destination.status <> 'active' then
      raise exception 'Submitted, received or verified remittances require active cash accounts.'
        using errcode = '23514';
    end if;

    if v_source.account_type = 'driver' and new.submitted_by_driver_id is null then
      raise exception 'Driver cash remittances require submitted_by_driver_id when submitted or later.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_cash_remittance_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remittance_id uuid;
  v_remittance public.cash_remittances%rowtype;
  v_items_total numeric(14, 2);
begin
  if tg_table_name = 'cash_remittances' then
    v_remittance_id := new.id;
  elsif tg_op = 'DELETE' then
    v_remittance_id := old.remittance_id;
  else
    v_remittance_id := new.remittance_id;
  end if;

  select *
  into v_remittance
  from public.cash_remittances remittance
  where remittance.id = v_remittance_id;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_remittance.status in ('submitted', 'received', 'verified') then
    v_items_total := public.calculate_cash_remittance_items_total(v_remittance.id);

    if v_items_total <> v_remittance.declared_amount then
      raise exception 'Cash remittance items total must match declared_amount before submission or verification.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prepare_cash_remittance_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remittance_status text;
  v_remittance_id uuid;
  v_existing_remittance_id uuid;
  v_payment public.service_payments%rowtype;
  v_movement public.cash_movements%rowtype;
begin
  if tg_op = 'DELETE' then
    v_remittance_id := old.remittance_id;
  else
    v_remittance_id := new.remittance_id;
  end if;

  select remittance.status
  into v_remittance_status
  from public.cash_remittances remittance
  where remittance.id = v_remittance_id;

  if v_remittance_status is null then
    raise exception 'Cash remittance item references a missing remittance.'
      using errcode = '23503';
  end if;

  if v_remittance_status not in ('draft', 'prepared') then
    raise exception 'Cash remittance items cannot be changed after submission.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.service_payment_id is not null then
    select *
    into v_payment
    from public.service_payments payment
    where payment.id = new.service_payment_id;

    if not found then
      raise exception 'Cash remittance item references a missing service payment.'
        using errcode = '23503';
    end if;

    if new.service_id is not null and new.service_id <> v_payment.service_id then
      raise exception 'Cash remittance item service_id must match the service payment.'
        using errcode = '23514';
    end if;

    new.service_id := v_payment.service_id;
  end if;

  if new.cash_movement_id is not null then
    select *
    into v_movement
    from public.cash_movements movement
    where movement.id = new.cash_movement_id;

    if not found then
      raise exception 'Cash remittance item references a missing cash movement.'
        using errcode = '23503';
    end if;

    if new.service_payment_id is not null and v_movement.service_payment_id is not null and new.service_payment_id <> v_movement.service_payment_id then
      raise exception 'Cash movement and service payment references must represent the same operation.'
        using errcode = '23514';
    end if;

    if new.service_id is not null and v_movement.service_id is not null and new.service_id <> v_movement.service_id then
      raise exception 'Cash remittance item service_id must match the cash movement.'
        using errcode = '23514';
    end if;

    if new.service_id is null then
      new.service_id := v_movement.service_id;
    end if;
  end if;

  if new.cash_movement_id is not null then
    select item.remittance_id
    into v_existing_remittance_id
    from public.cash_remittance_items item
    join public.cash_remittances remittance on remittance.id = item.remittance_id
    where item.cash_movement_id = new.cash_movement_id
      and item.id <> new.id
      and remittance.status <> 'cancelled'
    limit 1;

    if found then
      raise exception 'Cash movement already belongs to another active remittance.'
        using errcode = '23514';
    end if;
  end if;

  if new.service_payment_id is not null then
    select item.remittance_id
    into v_existing_remittance_id
    from public.cash_remittance_items item
    join public.cash_remittances remittance on remittance.id = item.remittance_id
    where item.service_payment_id = new.service_payment_id
      and item.id <> new.id
      and remittance.status <> 'cancelled'
    limit 1;

    if found then
      raise exception 'Service payment already belongs to another active remittance.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prepare_cash_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_currency text;
  v_overlap_id uuid;
begin
  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Cash counts must be created in draft status.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status in ('verified', 'cancelled') then
    raise exception 'Final cash counts cannot be updated directly.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'draft' and new.status not in ('counted', 'cancelled') then
      raise exception 'Invalid cash count status transition: draft can only move to counted or cancelled.'
        using errcode = '23514';
    elsif old.status = 'counted' and new.status not in ('verified', 'cancelled') then
      raise exception 'Invalid cash count status transition: counted can only move to verified or cancelled.'
        using errcode = '23514';
    end if;
  end if;

  select account.currency_code
  into v_account_currency
  from public.cash_accounts account
  where account.id = new.cash_account_id;

  if v_account_currency is null then
    raise exception 'Cash count references a missing cash account.'
      using errcode = '23503';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'Cash count currency must match the cash account currency.'
      using errcode = '23514';
  end if;

  if new.status in ('draft', 'counted')
    and new.period_start_at is not null
    and new.period_end_at is not null
  then
    select existing_count.id
    into v_overlap_id
    from public.cash_counts existing_count
    where existing_count.cash_account_id = new.cash_account_id
      and existing_count.id <> new.id
      and existing_count.status in ('draft', 'counted')
      and existing_count.period_start_at is not null
      and existing_count.period_end_at is not null
      and tstzrange(existing_count.period_start_at, existing_count.period_end_at, '[]')
          && tstzrange(new.period_start_at, new.period_end_at, '[]')
    limit 1;

    if found then
      raise exception 'Cash account already has an active cash count overlapping this period.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_cash_count_calculated_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('elara.cash_count_recalculate', true) is distinct from new.id::text then
    raise exception 'Cash count calculated amounts must be changed through public.recalculate_cash_count(uuid).'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_cash_count(p_cash_count_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count public.cash_counts%rowtype;
  v_until_at timestamptz;
  v_expected numeric(14, 2);
  v_counted numeric(14, 2);
begin
  select *
  into v_count
  from public.cash_counts cash_count
  where cash_count.id = p_cash_count_id
  for update;

  if not found then
    raise exception 'Cash count "%" does not exist.', p_cash_count_id
      using errcode = '23503';
  end if;

  v_until_at := coalesce(v_count.period_end_at, v_count.counted_at, now());
  v_expected := public.calculate_cash_account_balance(v_count.cash_account_id, v_until_at);

  select coalesce(round(sum(item.line_amount), 2), 0)
  into v_counted
  from public.cash_count_items item
  where item.cash_count_id = p_cash_count_id;

  perform set_config('elara.cash_count_recalculate', p_cash_count_id::text, true);

  update public.cash_counts
  set expected_amount = v_expected,
      counted_amount = v_counted,
      difference_amount = round(v_counted - v_expected, 2)
  where id = p_cash_count_id;

  perform set_config('elara.cash_count_recalculate', '', true);

  return;
end;
$$;

comment on function public.recalculate_cash_count(uuid) is
  'Recalculates expected, counted and difference amounts for a cash count without creating discrepancies or adjustments.';

create or replace function public.recalculate_cash_count_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_cash_count(old.cash_count_id);
    return old;
  end if;

  perform public.recalculate_cash_count(new.cash_count_id);
  return new;
end;
$$;

create or replace function public.recalculate_cash_count_from_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_cash_count(new.id);
  return new;
end;
$$;

create or replace function public.prepare_cash_count_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_status text;
  v_cash_count_id uuid;
begin
  if tg_op = 'DELETE' then
    v_cash_count_id := old.cash_count_id;
  else
    v_cash_count_id := new.cash_count_id;
  end if;

  select cash_count.status
  into v_count_status
  from public.cash_counts cash_count
  where cash_count.id = v_cash_count_id;

  if v_count_status is null then
    raise exception 'Cash count item references a missing cash count.'
      using errcode = '23503';
  end if;

  if v_count_status in ('verified', 'cancelled') then
    raise exception 'Cash count items cannot be changed after verification or cancellation.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.line_amount := round(new.denomination * new.quantity, 2);

  return new;
end;
$$;

create or replace function public.validate_cash_count_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash_count_id uuid;
  v_count public.cash_counts%rowtype;
  v_items_total numeric(14, 2);
begin
  if tg_table_name = 'cash_counts' then
    v_cash_count_id := new.id;
  elsif tg_op = 'DELETE' then
    v_cash_count_id := old.cash_count_id;
  else
    v_cash_count_id := new.cash_count_id;
  end if;

  select *
  into v_count
  from public.cash_counts cash_count
  where cash_count.id = v_cash_count_id;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_count.status in ('counted', 'verified') then
    select coalesce(round(sum(item.line_amount), 2), 0)
    into v_items_total
    from public.cash_count_items item
    where item.cash_count_id = v_count.id;

    if v_items_total <> v_count.counted_amount then
      raise exception 'Cash count items total must match counted_amount before counted or verified status.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prepare_cash_discrepancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_currency text;
  v_count public.cash_counts%rowtype;
  v_remittance public.cash_remittances%rowtype;
begin
  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));

  if tg_op = 'INSERT' and new.status <> 'open' then
    raise exception 'Cash discrepancies must be created in open status.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status in ('resolved', 'cancelled') then
    raise exception 'Final cash discrepancies cannot be updated directly.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'open' and new.status not in ('under_review', 'resolved', 'cancelled') then
      raise exception 'Invalid cash discrepancy status transition: open can only move to under_review, resolved or cancelled.'
        using errcode = '23514';
    elsif old.status = 'under_review' and new.status not in ('resolved', 'cancelled') then
      raise exception 'Invalid cash discrepancy status transition: under_review can only move to resolved or cancelled.'
        using errcode = '23514';
    end if;
  end if;

  select account.currency_code
  into v_account_currency
  from public.cash_accounts account
  where account.id = new.cash_account_id;

  if v_account_currency is null then
    raise exception 'Cash discrepancy references a missing cash account.'
      using errcode = '23503';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'Cash discrepancy currency must match cash account currency.'
      using errcode = '23514';
  end if;

  if new.discrepancy_type = 'cash_count' then
    select *
    into v_count
    from public.cash_counts cash_count
    where cash_count.id = new.cash_count_id;

    if not found then
      raise exception 'Cash discrepancy references a missing cash count.'
        using errcode = '23503';
    end if;

    if v_count.cash_account_id <> new.cash_account_id or v_count.currency_code <> new.currency_code then
      raise exception 'Cash discrepancy must match the cash count account and currency.'
        using errcode = '23514';
    end if;
  elsif new.discrepancy_type = 'remittance' then
    select *
    into v_remittance
    from public.cash_remittances remittance
    where remittance.id = new.remittance_id;

    if not found then
      raise exception 'Cash discrepancy references a missing cash remittance.'
        using errcode = '23503';
    end if;

    if v_remittance.currency_code <> new.currency_code then
      raise exception 'Cash discrepancy must match the remittance currency.'
        using errcode = '23514';
    end if;

    if v_remittance.source_cash_account_id <> new.cash_account_id
      and v_remittance.destination_cash_account_id <> new.cash_account_id
    then
      raise exception 'Cash discrepancy account must be part of the remittance.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_cash_account_delete_with_movements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.cash_movements movement
    where movement.cash_account_id = old.id
  ) then
    raise exception 'Cash accounts with movements cannot be physically deleted.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

create or replace function public.prevent_cash_record_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Cash records with operational history cannot be physically deleted; use status transitions or audited reversals instead.'
    using errcode = '23514';
end;
$$;

drop trigger if exists assign_cash_movements_human_code on public.cash_movements;
create trigger assign_cash_movements_human_code
before insert or update of human_code, currency_code
on public.cash_movements
for each row
execute function public.assign_cash_movement_human_code();

drop trigger if exists validate_cash_movements_integrity on public.cash_movements;
create trigger validate_cash_movements_integrity
before insert or update or delete
on public.cash_movements
for each row
execute function public.validate_cash_movement_integrity();

drop trigger if exists prevent_cash_movements_update_delete on public.cash_movements;
create trigger prevent_cash_movements_update_delete
before update or delete
on public.cash_movements
for each row
execute function public.prevent_cash_movement_changes();

drop trigger if exists assign_cash_remittances_human_code on public.cash_remittances;
create trigger assign_cash_remittances_human_code
before insert or update of human_code, currency_code
on public.cash_remittances
for each row
execute function public.assign_cash_remittance_human_code();

drop trigger if exists prepare_cash_remittances on public.cash_remittances;
create trigger prepare_cash_remittances
before insert or update
on public.cash_remittances
for each row
execute function public.prepare_cash_remittance();

drop trigger if exists validate_cash_remittances_totals on public.cash_remittances;
create constraint trigger validate_cash_remittances_totals
after insert or update
on public.cash_remittances
deferrable initially deferred
for each row
execute function public.validate_cash_remittance_totals();

drop trigger if exists prepare_cash_remittance_items on public.cash_remittance_items;
create trigger prepare_cash_remittance_items
before insert or update or delete
on public.cash_remittance_items
for each row
execute function public.prepare_cash_remittance_item();

drop trigger if exists validate_cash_remittance_items_totals on public.cash_remittance_items;
create constraint trigger validate_cash_remittance_items_totals
after insert or update or delete
on public.cash_remittance_items
deferrable initially deferred
for each row
execute function public.validate_cash_remittance_totals();

drop trigger if exists assign_cash_counts_human_code on public.cash_counts;
create trigger assign_cash_counts_human_code
before insert or update of human_code, currency_code
on public.cash_counts
for each row
execute function public.assign_cash_count_human_code();

drop trigger if exists prepare_cash_counts on public.cash_counts;
create trigger prepare_cash_counts
before insert or update
on public.cash_counts
for each row
execute function public.prepare_cash_count();

drop trigger if exists prevent_cash_counts_calculated_update on public.cash_counts;
create trigger prevent_cash_counts_calculated_update
before update of expected_amount, counted_amount, difference_amount
on public.cash_counts
for each row
execute function public.prevent_cash_count_calculated_update();

drop trigger if exists recalculate_cash_counts_after_edit on public.cash_counts;
create trigger recalculate_cash_counts_after_edit
after insert or update of cash_account_id, period_end_at, counted_at
on public.cash_counts
for each row
execute function public.recalculate_cash_count_from_count();

drop trigger if exists validate_cash_counts_totals on public.cash_counts;
create constraint trigger validate_cash_counts_totals
after insert or update
on public.cash_counts
deferrable initially deferred
for each row
execute function public.validate_cash_count_totals();

drop trigger if exists prepare_cash_count_items on public.cash_count_items;
create trigger prepare_cash_count_items
before insert or update or delete
on public.cash_count_items
for each row
execute function public.prepare_cash_count_item();

drop trigger if exists recalculate_cash_counts_after_items on public.cash_count_items;
create trigger recalculate_cash_counts_after_items
after insert or update or delete
on public.cash_count_items
for each row
execute function public.recalculate_cash_count_from_item();

drop trigger if exists validate_cash_count_items_totals on public.cash_count_items;
create constraint trigger validate_cash_count_items_totals
after insert or update or delete
on public.cash_count_items
deferrable initially deferred
for each row
execute function public.validate_cash_count_totals();

drop trigger if exists assign_cash_discrepancies_human_code on public.cash_discrepancies;
create trigger assign_cash_discrepancies_human_code
before insert or update of human_code, currency_code
on public.cash_discrepancies
for each row
execute function public.assign_cash_discrepancy_human_code();

drop trigger if exists prepare_cash_discrepancies on public.cash_discrepancies;
create trigger prepare_cash_discrepancies
before insert or update
on public.cash_discrepancies
for each row
execute function public.prepare_cash_discrepancy();

drop trigger if exists prevent_cash_remittances_delete on public.cash_remittances;
create trigger prevent_cash_remittances_delete
before delete
on public.cash_remittances
for each row
execute function public.prevent_cash_record_delete();

drop trigger if exists prevent_cash_counts_delete on public.cash_counts;
create trigger prevent_cash_counts_delete
before delete
on public.cash_counts
for each row
execute function public.prevent_cash_record_delete();

drop trigger if exists prevent_cash_discrepancies_delete on public.cash_discrepancies;
create trigger prevent_cash_discrepancies_delete
before delete
on public.cash_discrepancies
for each row
execute function public.prevent_cash_record_delete();

drop trigger if exists prevent_cash_accounts_delete_with_movements on public.cash_accounts;
create trigger prevent_cash_accounts_delete_with_movements
before delete
on public.cash_accounts
for each row
execute function public.prevent_cash_account_delete_with_movements();

revoke all on table public.cash_accounts from public;
revoke all on table public.cash_remittances from public;
revoke all on table public.cash_counts from public;
revoke all on table public.cash_movements from public;
revoke all on table public.cash_remittance_items from public;
revoke all on table public.cash_count_items from public;
revoke all on table public.cash_discrepancies from public;

revoke all on table public.cash_accounts from anon;
revoke all on table public.cash_remittances from anon;
revoke all on table public.cash_counts from anon;
revoke all on table public.cash_movements from anon;
revoke all on table public.cash_remittance_items from anon;
revoke all on table public.cash_count_items from anon;
revoke all on table public.cash_discrepancies from anon;

revoke all on table public.cash_accounts from authenticated;
revoke all on table public.cash_remittances from authenticated;
revoke all on table public.cash_counts from authenticated;
revoke all on table public.cash_movements from authenticated;
revoke all on table public.cash_remittance_items from authenticated;
revoke all on table public.cash_count_items from authenticated;
revoke all on table public.cash_discrepancies from authenticated;

grant select, insert, update, delete on table public.cash_accounts to service_role;
grant select, insert, update, delete on table public.cash_remittances to service_role;
grant select, insert, update, delete on table public.cash_counts to service_role;
grant select, insert, update, delete on table public.cash_movements to service_role;
grant select, insert, update, delete on table public.cash_remittance_items to service_role;
grant select, insert, update, delete on table public.cash_count_items to service_role;
grant select, insert, update, delete on table public.cash_discrepancies to service_role;

revoke all on function public.assign_cash_movement_human_code() from public;
revoke all on function public.assign_cash_remittance_human_code() from public;
revoke all on function public.assign_cash_count_human_code() from public;
revoke all on function public.assign_cash_discrepancy_human_code() from public;
revoke all on function public.prevent_cash_movement_changes() from public;
revoke all on function public.validate_cash_movement_integrity() from public;
revoke all on function public.calculate_cash_account_balance(uuid, timestamptz) from public;
revoke all on function public.calculate_cash_remittance_items_total(uuid) from public;
revoke all on function public.prepare_cash_remittance() from public;
revoke all on function public.validate_cash_remittance_totals() from public;
revoke all on function public.prepare_cash_remittance_item() from public;
revoke all on function public.prepare_cash_count() from public;
revoke all on function public.prevent_cash_count_calculated_update() from public;
revoke all on function public.recalculate_cash_count(uuid) from public;
revoke all on function public.recalculate_cash_count_from_item() from public;
revoke all on function public.recalculate_cash_count_from_count() from public;
revoke all on function public.prepare_cash_count_item() from public;
revoke all on function public.validate_cash_count_totals() from public;
revoke all on function public.prepare_cash_discrepancy() from public;
revoke all on function public.prevent_cash_account_delete_with_movements() from public;
revoke all on function public.prevent_cash_record_delete() from public;

revoke execute on function public.assign_cash_movement_human_code() from anon;
revoke execute on function public.assign_cash_remittance_human_code() from anon;
revoke execute on function public.assign_cash_count_human_code() from anon;
revoke execute on function public.assign_cash_discrepancy_human_code() from anon;
revoke execute on function public.prevent_cash_movement_changes() from anon;
revoke execute on function public.validate_cash_movement_integrity() from anon;
revoke execute on function public.calculate_cash_account_balance(uuid, timestamptz) from anon;
revoke execute on function public.calculate_cash_remittance_items_total(uuid) from anon;
revoke execute on function public.prepare_cash_remittance() from anon;
revoke execute on function public.validate_cash_remittance_totals() from anon;
revoke execute on function public.prepare_cash_remittance_item() from anon;
revoke execute on function public.prepare_cash_count() from anon;
revoke execute on function public.prevent_cash_count_calculated_update() from anon;
revoke execute on function public.recalculate_cash_count(uuid) from anon;
revoke execute on function public.recalculate_cash_count_from_item() from anon;
revoke execute on function public.recalculate_cash_count_from_count() from anon;
revoke execute on function public.prepare_cash_count_item() from anon;
revoke execute on function public.validate_cash_count_totals() from anon;
revoke execute on function public.prepare_cash_discrepancy() from anon;
revoke execute on function public.prevent_cash_account_delete_with_movements() from anon;
revoke execute on function public.prevent_cash_record_delete() from anon;

revoke execute on function public.assign_cash_movement_human_code() from authenticated;
revoke execute on function public.assign_cash_remittance_human_code() from authenticated;
revoke execute on function public.assign_cash_count_human_code() from authenticated;
revoke execute on function public.assign_cash_discrepancy_human_code() from authenticated;
revoke execute on function public.prevent_cash_movement_changes() from authenticated;
revoke execute on function public.validate_cash_movement_integrity() from authenticated;
revoke execute on function public.calculate_cash_account_balance(uuid, timestamptz) from authenticated;
revoke execute on function public.calculate_cash_remittance_items_total(uuid) from authenticated;
revoke execute on function public.prepare_cash_remittance() from authenticated;
revoke execute on function public.validate_cash_remittance_totals() from authenticated;
revoke execute on function public.prepare_cash_remittance_item() from authenticated;
revoke execute on function public.prepare_cash_count() from authenticated;
revoke execute on function public.prevent_cash_count_calculated_update() from authenticated;
revoke execute on function public.recalculate_cash_count(uuid) from authenticated;
revoke execute on function public.recalculate_cash_count_from_item() from authenticated;
revoke execute on function public.recalculate_cash_count_from_count() from authenticated;
revoke execute on function public.prepare_cash_count_item() from authenticated;
revoke execute on function public.validate_cash_count_totals() from authenticated;
revoke execute on function public.prepare_cash_discrepancy() from authenticated;
revoke execute on function public.prevent_cash_account_delete_with_movements() from authenticated;
revoke execute on function public.prevent_cash_record_delete() from authenticated;

grant execute on function public.calculate_cash_account_balance(uuid, timestamptz) to service_role;
grant execute on function public.calculate_cash_remittance_items_total(uuid) to service_role;
grant execute on function public.recalculate_cash_count(uuid) to service_role;

do $$
declare
  missing_tables text;
  missing_functions text;
  missing_triggers text;
  missing_indexes text;
  forbidden_tables text;
begin
  select string_agg(required.table_name, ', ' order by required.table_name)
  into missing_tables
  from (
    values
      ('cash_accounts'),
      ('cash_movements'),
      ('cash_remittances'),
      ('cash_remittance_items'),
      ('cash_counts'),
      ('cash_count_items'),
      ('cash_discrepancies')
  ) as required(table_name)
  where to_regclass('public.' || required.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing cash domain tables: %.', missing_tables;
  end if;

  select string_agg(required.function_name, ', ' order by required.function_name)
  into missing_functions
  from (
    values
      ('public.assign_cash_movement_human_code()'),
      ('public.assign_cash_remittance_human_code()'),
      ('public.assign_cash_count_human_code()'),
      ('public.assign_cash_discrepancy_human_code()'),
      ('public.prevent_cash_movement_changes()'),
      ('public.validate_cash_movement_integrity()'),
      ('public.calculate_cash_account_balance(uuid,timestamp with time zone)'),
      ('public.calculate_cash_remittance_items_total(uuid)'),
      ('public.prepare_cash_remittance()'),
      ('public.validate_cash_remittance_totals()'),
      ('public.prepare_cash_remittance_item()'),
      ('public.prepare_cash_count()'),
      ('public.prevent_cash_count_calculated_update()'),
      ('public.recalculate_cash_count(uuid)'),
      ('public.recalculate_cash_count_from_item()'),
      ('public.recalculate_cash_count_from_count()'),
      ('public.prepare_cash_count_item()'),
      ('public.validate_cash_count_totals()'),
      ('public.prepare_cash_discrepancy()'),
      ('public.prevent_cash_account_delete_with_movements()'),
      ('public.prevent_cash_record_delete()')
  ) as required(function_name)
  where to_regprocedure(required.function_name) is null;

  if missing_functions is not null then
    raise exception 'Missing cash domain functions: %.', missing_functions;
  end if;

  select string_agg(required.trigger_name, ', ' order by required.trigger_name)
  into missing_triggers
  from (
    values
      ('set_cash_accounts_updated_at'),
      ('set_cash_remittances_updated_at'),
      ('set_cash_counts_updated_at'),
      ('set_cash_discrepancies_updated_at'),
      ('assign_cash_movements_human_code'),
      ('validate_cash_movements_integrity'),
      ('prevent_cash_movements_update_delete'),
      ('assign_cash_remittances_human_code'),
      ('prepare_cash_remittances'),
      ('validate_cash_remittances_totals'),
      ('prepare_cash_remittance_items'),
      ('validate_cash_remittance_items_totals'),
      ('assign_cash_counts_human_code'),
      ('prepare_cash_counts'),
      ('prevent_cash_counts_calculated_update'),
      ('recalculate_cash_counts_after_edit'),
      ('validate_cash_counts_totals'),
      ('prepare_cash_count_items'),
      ('recalculate_cash_counts_after_items'),
      ('validate_cash_count_items_totals'),
      ('assign_cash_discrepancies_human_code'),
      ('prepare_cash_discrepancies'),
      ('prevent_cash_remittances_delete'),
      ('prevent_cash_counts_delete'),
      ('prevent_cash_discrepancies_delete'),
      ('prevent_cash_accounts_delete_with_movements')
  ) as required(trigger_name)
  where not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname = required.trigger_name
      and not trigger_row.tgisinternal
  );

  if missing_triggers is not null then
    raise exception 'Missing cash domain triggers: %.', missing_triggers;
  end if;

  select string_agg(required.index_name, ', ' order by required.index_name)
  into missing_indexes
  from (
    values
      ('cash_movements_idempotency_unique_idx'),
      ('cash_movements_human_code_unique'),
      ('cash_movements_one_reversal_per_original_idx'),
      ('cash_remittances_human_code_unique'),
      ('cash_counts_human_code_unique'),
      ('cash_discrepancies_human_code_unique'),
      ('cash_discrepancies_one_open_per_count_idx'),
      ('cash_discrepancies_one_open_per_remittance_idx')
  ) as required(index_name)
  where to_regclass('public.' || required.index_name) is null;

  if missing_indexes is not null then
    raise exception 'Missing cash domain indexes or constraints: %.', missing_indexes;
  end if;

  if exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix in ('CASH', 'REM', 'ARC', 'DIF')
      and counter.padding <> 6
  ) then
    raise exception 'Cash domain human code prefixes must keep padding 6.';
  end if;

  if exists (select 1 from public.cash_movements where human_code !~ '^CASH-[0-9]{6}$') then
    raise exception 'Invalid CASH human_code format detected.';
  end if;

  if exists (select 1 from public.cash_remittances where human_code !~ '^REM-[0-9]{6}$') then
    raise exception 'Invalid REM human_code format detected.';
  end if;

  if exists (select 1 from public.cash_counts where human_code !~ '^ARC-[0-9]{6}$') then
    raise exception 'Invalid ARC human_code format detected.';
  end if;

  if exists (select 1 from public.cash_discrepancies where human_code !~ '^DIF-[0-9]{6}$') then
    raise exception 'Invalid DIF human_code format detected.';
  end if;

  if exists (
    select 1
    from public.cash_movements
    where amount <= 0
       or currency_code !~ '^[A-Z]{3}$'
       or movement_type not in ('inflow', 'outflow')
  ) then
    raise exception 'Invalid cash movement amount, currency or movement_type detected.';
  end if;

  if exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'cash_movements'
      and column_row.column_name = 'reversal_movement_id'
  ) then
    raise exception 'cash_movements must not keep reversal_movement_id; original_movement_id is the reversal source of truth.';
  end if;

  if exists (
    select 1
    from public.cash_movements reversal
    join public.cash_movements original on original.id = reversal.original_movement_id
    where reversal.movement_category = 'reversal'
      and (
        reversal.amount <> original.amount
        or reversal.currency_code <> original.currency_code
        or reversal.cash_account_id <> original.cash_account_id
        or reversal.movement_type = original.movement_type
        or original.movement_category = 'reversal'
      )
  ) then
    raise exception 'Invalid cash reversal movement detected.';
  end if;

  if exists (
    select 1
    from public.cash_remittances remittance
    where remittance.status in ('submitted', 'received', 'verified')
      and public.calculate_cash_remittance_items_total(remittance.id) <> remittance.declared_amount
  ) then
    raise exception 'Invalid cash remittance item total detected.';
  end if;

  if exists (
    select 1
    from public.cash_counts cash_count
    where cash_count.status in ('counted', 'verified')
      and cash_count.counted_amount <> (
        select coalesce(round(sum(item.line_amount), 2), 0)
        from public.cash_count_items item
        where item.cash_count_id = cash_count.id
      )
  ) then
    raise exception 'Invalid cash count item total detected.';
  end if;

  if exists (
    select 1
    from public.cash_discrepancies discrepancy
    where discrepancy.difference_amount <> round(discrepancy.actual_amount - discrepancy.expected_amount, 2)
  ) then
    raise exception 'Invalid cash discrepancy difference detected.';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.service_payments'::regclass
      and trigger_row.tgname ilike '%cash%'
  ) then
    raise exception 'Migration 0008 must not create automatic cash movement triggers on service_payments.';
  end if;

  select string_agg(forbidden.table_name, ', ' order by forbidden.table_name)
  into forbidden_tables
  from (
    values
      ('receivables'),
      ('receivable_payments'),
      ('expenses'),
      ('expense_payments'),
      ('expense_reimbursements'),
      ('settlements'),
      ('settlement_payments')
  ) as forbidden(table_name)
  where to_regclass('public.' || forbidden.table_name) is not null;

  if forbidden_tables is not null then
    raise exception 'Migration 0008 must not create later-domain tables: %.', forbidden_tables;
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute public.next_human_code(text).';
  end if;

  if exists (
    select 1
    from (
      values
        ('cash_accounts'),
        ('cash_movements'),
        ('cash_remittances'),
        ('cash_remittance_items'),
        ('cash_counts'),
        ('cash_count_items'),
        ('cash_discrepancies')
    ) as table_names(table_name)
    where has_table_privilege('anon', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE')
  ) then
    raise exception 'anon/authenticated must not have direct privileges on cash domain tables.';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.assign_cash_movement_human_code()'),
        ('public.assign_cash_remittance_human_code()'),
        ('public.assign_cash_count_human_code()'),
        ('public.assign_cash_discrepancy_human_code()'),
        ('public.prevent_cash_movement_changes()'),
        ('public.validate_cash_movement_integrity()'),
        ('public.calculate_cash_account_balance(uuid,timestamp with time zone)'),
        ('public.calculate_cash_remittance_items_total(uuid)'),
        ('public.prepare_cash_remittance()'),
        ('public.validate_cash_remittance_totals()'),
        ('public.prepare_cash_remittance_item()'),
        ('public.prepare_cash_count()'),
        ('public.prevent_cash_count_calculated_update()'),
        ('public.recalculate_cash_count(uuid)'),
        ('public.recalculate_cash_count_from_item()'),
        ('public.recalculate_cash_count_from_count()'),
        ('public.prepare_cash_count_item()'),
        ('public.validate_cash_count_totals()'),
        ('public.prepare_cash_discrepancy()'),
        ('public.prevent_cash_account_delete_with_movements()'),
        ('public.prevent_cash_record_delete()')
    ) as function_names(function_name)
    where has_function_privilege('anon', function_name, 'EXECUTE')
       or has_function_privilege('authenticated', function_name, 'EXECUTE')
  ) then
    raise exception 'anon/authenticated must not execute cash domain functions.';
  end if;
end;
$$;
