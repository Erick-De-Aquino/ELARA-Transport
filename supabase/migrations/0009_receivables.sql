-- ELARA Transport V4.0
-- Migration 0009: Receivables domain.
-- Creates CxC tables, internal guards and recalculation helpers only.
-- No automatic collections, cash movements, expenses, settlements, seed data or full RLS.

create table if not exists public.receivables (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  service_id uuid not null references public.services(id) on delete restrict,
  service_financial_id uuid not null references public.service_financials(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'open',
  currency_code text not null default 'EUR',
  original_amount numeric(14, 2) not null,
  collected_amount numeric(14, 2) not null default 0,
  pending_amount numeric(14, 2) not null,
  due_at timestamptz,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  written_off_at timestamptz,
  reason_code text,
  notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  closed_by uuid references public.app_users(id) on delete restrict,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  written_off_by uuid references public.app_users(id) on delete restrict,

  constraint receivables_human_code_unique
    unique (human_code),
  constraint receivables_human_code_format
    check (human_code ~ '^REC-[0-9]{6}$'),
  constraint receivables_status_check
    check (status in ('open', 'overdue', 'paid', 'partial', 'cancelled', 'written_off')),
  constraint receivables_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint receivables_amounts_valid
    check (
      original_amount > 0
      and collected_amount >= 0
      and pending_amount >= 0
      and collected_amount <= original_amount
      and pending_amount = round(original_amount - collected_amount, 2)
    ),
  constraint receivables_paid_fields
    check (status <> 'paid' or (pending_amount = 0 and closed_at is not null and closed_by is not null)),
  constraint receivables_open_fields
    check (status not in ('open', 'overdue') or (collected_amount = 0 and pending_amount > 0)),
  constraint receivables_partial_fields
    check (status <> 'partial' or (collected_amount > 0 and pending_amount > 0)),
  constraint receivables_cancelled_fields
    check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by is not null)),
  constraint receivables_written_off_fields
    check (status <> 'written_off' or (written_off_at is not null and written_off_by is not null)),
  constraint receivables_reason_code_not_empty
    check (reason_code is null or length(trim(reason_code)) > 0)
);

comment on table public.receivables is
  'Accounts receivable derived from a service financial pending amount. Amount columns are controlled by database recalculation.';

create unique index if not exists receivables_one_active_per_financial_idx
  on public.receivables (service_financial_id)
  where status in ('open', 'overdue', 'partial');

create unique index if not exists receivables_one_active_per_service_idx
  on public.receivables (service_id)
  where status in ('open', 'overdue', 'partial');

create index if not exists receivables_customer_status_idx
  on public.receivables (customer_id, status, due_at);

create index if not exists receivables_service_financial_idx
  on public.receivables (service_financial_id, status);

create table if not exists public.receivable_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  payment_id uuid references public.service_payments(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint receivable_status_history_from_status_check
    check (from_status is null or from_status in ('open', 'overdue', 'paid', 'partial', 'cancelled', 'written_off')),
  constraint receivable_status_history_to_status_check
    check (to_status in ('open', 'overdue', 'paid', 'partial', 'cancelled', 'written_off')),
  constraint receivable_status_history_real_change
    check (from_status is null or from_status <> to_status),
  constraint receivable_status_history_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.receivable_status_history is
  'Append-only history of receivables.status transitions.';

create index if not exists receivable_status_history_receivable_changed_idx
  on public.receivable_status_history (receivable_id, changed_at);

create table if not exists public.receivable_collection_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  attempted_at timestamptz not null default now(),
  channel text not null,
  result text not null,
  contacted_person text,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint receivable_collection_attempts_channel_check
    check (channel in ('phone', 'email', 'whatsapp', 'in_person', 'other')),
  constraint receivable_collection_attempts_result_check
    check (result in ('no_answer', 'contacted', 'promised_payment', 'disputed', 'refused', 'invalid_contact', 'other')),
  constraint receivable_collection_attempts_next_action_order
    check (next_action_at is null or next_action_at >= attempted_at)
);

comment on table public.receivable_collection_attempts is
  'Append-only administrative collection attempts. These are not payment records.';

create index if not exists receivable_collection_attempts_receivable_attempted_idx
  on public.receivable_collection_attempts (receivable_id, attempted_at);

create table if not exists public.receivable_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  note_type text not null default 'internal',
  content text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint receivable_notes_type_check
    check (note_type in ('internal', 'customer_contact', 'dispute', 'legal', 'other')),
  constraint receivable_notes_content_not_empty
    check (length(trim(content)) > 0)
);

comment on table public.receivable_notes is
  'Append-only notes for accounts receivable.';

create index if not exists receivable_notes_receivable_created_idx
  on public.receivable_notes (receivable_id, created_at);

create table if not exists public.receivable_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  payment_id uuid not null references public.service_payments(id) on delete restrict,
  service_payment_allocation_id uuid references public.service_payment_allocations(id) on delete restrict,
  human_code text not null,
  allocated_amount numeric(14, 2) not null,
  allocated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint receivable_allocations_human_code_unique
    unique (human_code),
  constraint receivable_allocations_human_code_format
    check (human_code ~ '^RCP-[0-9]{6}$'),
  constraint receivable_allocations_amount_positive
    check (allocated_amount > 0),
  constraint receivable_allocations_payment_unique
    unique (payment_id)
);

comment on table public.receivable_allocations is
  'Append-only linkage between a receivable collection and the completed service payment/allocation that settles it. This migration does not create collections automatically.';

create index if not exists receivable_allocations_receivable_idx
  on public.receivable_allocations (receivable_id, allocated_at);

create index if not exists receivable_allocations_service_payment_allocation_idx
  on public.receivable_allocations (service_payment_allocation_id)
  where service_payment_allocation_id is not null;

drop trigger if exists set_receivables_updated_at on public.receivables;
create trigger set_receivables_updated_at
before update on public.receivables
for each row
execute function public.set_updated_at();

create or replace function public.assign_receivable_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.human_code is distinct from old.human_code then
      raise exception 'Receivable human_code cannot be changed after creation.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('REC');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^REC-[0-9]{6}$' then
    raise exception 'Invalid receivable human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));
  return new;
end;
$$;

create or replace function public.assign_receivable_allocation_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.human_code is distinct from old.human_code then
      raise exception 'Receivable allocation human_code cannot be changed after creation.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.human_code, '')), '') is null then
      new.human_code := public.next_human_code('RCP');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^RCP-[0-9]{6}$' then
    raise exception 'Invalid receivable allocation human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_receivable_calculated_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('elara.receivable_recalculate', true) is distinct from new.id::text then
    if old.status not in ('paid', 'cancelled', 'written_off')
      and new.status in ('cancelled', 'written_off')
      and new.collected_amount = old.collected_amount
      and new.pending_amount = old.pending_amount
      and new.closed_at is not distinct from old.closed_at
    then
      return new;
    end if;

    raise exception 'Calculated receivable columns and derived status must be changed through public.recalculate_receivable(uuid).'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.prepare_receivable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_financial public.service_financials%rowtype;
begin
  new.currency_code := upper(trim(coalesce(new.currency_code, 'EUR')));
  new.original_amount := round(new.original_amount, 2);
  new.collected_amount := round(coalesce(new.collected_amount, 0), 2);
  new.pending_amount := round(new.pending_amount, 2);

  if tg_op = 'UPDATE' then
    if old.status in ('paid', 'cancelled', 'written_off') then
      raise exception 'Final receivables cannot be updated directly.'
        using errcode = '23514';
    end if;

    if new.service_id <> old.service_id
      or new.service_financial_id <> old.service_financial_id
      or new.customer_id <> old.customer_id
      or new.currency_code <> old.currency_code
      or new.original_amount <> old.original_amount
      or new.opened_at <> old.opened_at
    then
      raise exception 'Receivable source, currency, original_amount and opened_at are immutable.'
        using errcode = '23514';
    end if;
  end if;

  select *
  into v_service
  from public.services service
  where service.id = new.service_id;

  if not found then
    raise exception 'Receivable references a missing service.'
      using errcode = '23503';
  end if;

  select *
  into v_financial
  from public.service_financials financial
  where financial.id = new.service_financial_id
  for update;

  if not found then
    raise exception 'Receivable references a missing service financial row.'
      using errcode = '23503';
  end if;

  if v_financial.service_id <> new.service_id then
    raise exception 'Receivable service_id must match the service financial row.'
      using errcode = '23514';
  end if;

  if v_service.customer_id <> new.customer_id then
    raise exception 'Receivable customer_id must match the service customer.'
      using errcode = '23514';
  end if;

  if v_financial.currency_code <> new.currency_code then
    raise exception 'Receivable currency must match the service financial currency.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'Receivables must be created in open status.'
        using errcode = '23514';
    end if;

    if v_service.operational_status not in ('completed', 'no_show', 'not_performed') then
      raise exception 'Receivables can only be opened for completed, no-show or not-performed services.'
        using errcode = '23514';
    end if;

    if v_financial.pricing_status <> 'finalized' then
      raise exception 'Receivables require finalized service pricing.'
        using errcode = '23514';
    end if;

    if v_financial.financial_status not in ('pending', 'partial') then
      raise exception 'Receivables require pending or historically partial service financial status.'
        using errcode = '23514';
    end if;

    if v_financial.pending_amount <= 0 then
      raise exception 'Receivables require a positive service financial pending amount.'
        using errcode = '23514';
    end if;

    if new.original_amount <> v_financial.pending_amount then
      raise exception 'Receivable original_amount must match the current service financial pending_amount.'
        using errcode = '23514';
    end if;

    if new.collected_amount <> 0 or new.pending_amount <> new.original_amount then
      raise exception 'Receivables must start with collected_amount 0 and pending_amount equal to original_amount.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if current_setting('elara.receivable_recalculate', true) is distinct from new.id::text then
        if old.status = 'open' and new.status not in ('cancelled', 'written_off') then
          raise exception 'Invalid receivable status transition: open can only be administratively cancelled or written off.'
            using errcode = '23514';
        elsif old.status = 'overdue' and new.status not in ('cancelled', 'written_off') then
          raise exception 'Invalid receivable status transition: overdue can only be administratively cancelled or written off.'
            using errcode = '23514';
        elsif old.status = 'partial' and new.status <> 'written_off' then
          raise exception 'Invalid receivable status transition: partial can only be administratively written off.'
            using errcode = '23514';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.receivable_is_overdue(
  p_receivable_id uuid,
  p_reference_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable public.receivables%rowtype;
begin
  select *
  into v_receivable
  from public.receivables receivable
  where receivable.id = p_receivable_id;

  if not found then
    raise exception 'Receivable "%" does not exist.', p_receivable_id
      using errcode = '23503';
  end if;

  return v_receivable.status not in ('paid', 'cancelled', 'written_off')
    and v_receivable.pending_amount > 0
    and v_receivable.due_at is not null
    and v_receivable.due_at < p_reference_at;
end;
$$;

create or replace function public.recalculate_receivable(p_receivable_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable public.receivables%rowtype;
  v_collected numeric(14, 2);
  v_pending numeric(14, 2);
  v_status text;
  v_closed_at timestamptz;
  v_closed_by uuid;
begin
  select *
  into v_receivable
  from public.receivables receivable
  where receivable.id = p_receivable_id
  for update;

  if not found then
    raise exception 'Receivable "%" does not exist.', p_receivable_id
      using errcode = '23503';
  end if;

  if v_receivable.status in ('paid', 'cancelled', 'written_off') then
    return;
  end if;

  select coalesce(round(sum(allocation.allocated_amount), 2), 0)
  into v_collected
  from public.receivable_allocations allocation
  join public.service_payments payment on payment.id = allocation.payment_id
  where allocation.receivable_id = p_receivable_id
    and payment.payment_status = 'completed';

  select allocation.created_by
  into v_closed_by
  from public.receivable_allocations allocation
  join public.service_payments payment on payment.id = allocation.payment_id
  where allocation.receivable_id = p_receivable_id
    and payment.payment_status = 'completed'
  order by allocation.allocated_at desc, allocation.created_at desc
  limit 1;

  if v_collected > v_receivable.original_amount then
    raise exception 'Receivable collected amount cannot exceed original amount.'
      using errcode = '23514';
  end if;

  v_pending := round(v_receivable.original_amount - v_collected, 2);

  if v_pending = 0 and v_receivable.original_amount > 0 then
    v_status := 'paid';
    v_closed_at := coalesce(v_receivable.closed_at, now());
    v_closed_by := coalesce(v_closed_by, v_receivable.closed_by, v_receivable.updated_by, v_receivable.created_by);

    if v_closed_by is null then
      raise exception 'Receivable cannot be marked paid without an active closing actor.'
        using errcode = '23514';
    end if;
  elsif v_collected > 0 and v_pending > 0 then
    v_status := 'partial';
    v_closed_at := null;
  elsif v_receivable.due_at is not null and v_receivable.due_at < now() then
    v_status := 'overdue';
    v_closed_at := null;
  else
    v_status := 'open';
    v_closed_at := null;
  end if;

  perform set_config('elara.receivable_recalculate', p_receivable_id::text, true);

  update public.receivables
  set collected_amount = v_collected,
      pending_amount = v_pending,
      status = v_status,
      closed_at = v_closed_at,
      closed_by = case when v_status = 'paid' then v_closed_by else closed_by end
  where id = p_receivable_id;

  perform set_config('elara.receivable_recalculate', '', true);
end;
$$;

create or replace function public.recalculate_receivable_from_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_receivable(new.receivable_id);
  return new;
end;
$$;

create or replace function public.recalculate_receivable_from_due_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('open', 'overdue') and new.due_at is distinct from old.due_at then
    perform public.recalculate_receivable(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.record_receivable_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.receivable_status_history (
      receivable_id,
      from_status,
      to_status,
      changed_at,
      changed_by_user_id,
      reason,
      metadata
    )
    values (
      new.id,
      null,
      new.status,
      now(),
      new.created_by,
      'receivable_opened',
      jsonb_build_object(
        'original_amount', new.original_amount,
        'pending_amount', new.pending_amount,
        'currency_code', new.currency_code
      )
    );

    return new;
  end if;

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  select allocation.payment_id
  into v_payment_id
  from public.receivable_allocations allocation
  where allocation.receivable_id = new.id
  order by allocation.allocated_at desc, allocation.created_at desc
  limit 1;

  insert into public.receivable_status_history (
    receivable_id,
    from_status,
    to_status,
    changed_at,
    changed_by_user_id,
    payment_id,
    reason,
    metadata
  )
  values (
    new.id,
    old.status,
    new.status,
    now(),
    case
      when new.status = 'paid' then new.closed_by
      when new.status = 'cancelled' then new.cancelled_by
      when new.status = 'written_off' then new.written_off_by
      else new.updated_by
    end,
    v_payment_id,
    'receivable_status_changed',
    jsonb_build_object(
      'collected_amount', new.collected_amount,
      'pending_amount', new.pending_amount,
      'due_at', new.due_at
    )
  );

  return new;
end;
$$;

create or replace function public.prepare_receivable_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable public.receivables%rowtype;
  v_payment public.service_payments%rowtype;
  v_service_allocation public.service_payment_allocations%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Receivable allocations are append-only.'
      using errcode = '23514';
  end if;

  new.allocated_amount := round(new.allocated_amount, 2);

  select *
  into v_receivable
  from public.receivables receivable
  where receivable.id = new.receivable_id
  for update;

  if not found then
    raise exception 'Receivable allocation references a missing receivable.'
      using errcode = '23503';
  end if;

  if v_receivable.status in ('paid', 'cancelled', 'written_off') then
    raise exception 'Cannot allocate a payment to a final receivable.'
      using errcode = '23514';
  end if;


  select *
  into v_payment
  from public.service_payments payment
  where payment.id = new.payment_id;

  if not found then
    raise exception 'Receivable allocation references a missing service payment.'
      using errcode = '23503';
  end if;

  if v_payment.payment_status <> 'completed' then
    raise exception 'Receivable allocation requires a completed service payment.'
      using errcode = '23514';
  end if;

  if v_payment.service_financial_id <> v_receivable.service_financial_id
    or v_payment.service_id <> v_receivable.service_id
  then
    raise exception 'Receivable allocation payment must match the receivable service and financial row.'
      using errcode = '23514';
  end if;

  if v_payment.currency_code <> v_receivable.currency_code then
    raise exception 'Receivable allocation payment currency must match the receivable currency.'
      using errcode = '23514';
  end if;

  if new.allocated_amount <> v_payment.amount then
    raise exception 'Receivable allocation amount must match the completed service payment amount.'
      using errcode = '23514';
  end if;

  if new.allocated_amount <> v_receivable.pending_amount then
    raise exception 'Receivable collections must settle the full pending amount in this phase.'
      using errcode = '23514';
  end if;

  -- Current CxC allocations always settle the full pending amount, so the actor is mandatory.
  if new.created_by is null or not exists (
    select 1
    from public.app_users app_user
    where app_user.id = new.created_by
      and app_user.status = 'active'
  ) then
    raise exception 'La allocation que liquida la cuenta por cobrar requiere un actor activo en created_by'
      using errcode = '23514';
  end if;

  if new.service_payment_allocation_id is not null then
    select *
    into v_service_allocation
    from public.service_payment_allocations allocation
    where allocation.id = new.service_payment_allocation_id;

    if not found then
      raise exception 'Receivable allocation references a missing service payment allocation.'
        using errcode = '23503';
    end if;

    if v_service_allocation.payment_id <> v_payment.id
      or v_service_allocation.service_financial_id <> v_payment.service_financial_id
      or v_service_allocation.allocated_amount <> v_payment.amount
    then
      raise exception 'Receivable allocation must match the referenced service payment allocation.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prepare_receivable_collection_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Receivable collection attempts are append-only.'
      using errcode = '23514';
  end if;

  select receivable.status
  into v_status
  from public.receivables receivable
  where receivable.id = new.receivable_id;

  if v_status is null then
    raise exception 'Collection attempt references a missing receivable.'
      using errcode = '23503';
  end if;

  if v_status in ('paid', 'cancelled', 'written_off') then
    raise exception 'Cannot register collection attempts for a final receivable.'
      using errcode = '23514';
  end if;

  if new.contacted_person is not null then
    new.contacted_person := trim(new.contacted_person);
  end if;

  return new;
end;
$$;

create or replace function public.prepare_receivable_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Receivable notes are append-only.'
      using errcode = '23514';
  end if;

  new.content := trim(new.content);

  if length(new.content) = 0 then
    raise exception 'Receivable note content cannot be empty.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_receivable_status_history_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Receivable status history is append-only.'
    using errcode = '23514';
end;
$$;

create or replace function public.prevent_receivable_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Receivables cannot be physically deleted.'
    using errcode = '23514';
end;
$$;

create or replace function public.validate_single_receivable_coherence(p_receivable_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable public.receivables%rowtype;
  v_service public.services%rowtype;
  v_financial public.service_financials%rowtype;
begin
  select *
  into v_receivable
  from public.receivables receivable
  where receivable.id = p_receivable_id;

  if not found then
    raise exception 'Receivable "%" does not exist.', p_receivable_id
      using errcode = '23503';
  end if;

  select *
  into v_service
  from public.services service
  where service.id = v_receivable.service_id;

  if not found then
    raise exception 'Receivable references a missing service.'
      using errcode = '23503';
  end if;

  select *
  into v_financial
  from public.service_financials financial
  where financial.id = v_receivable.service_financial_id;

  if not found then
    raise exception 'Receivable references a missing service financial row.'
      using errcode = '23503';
  end if;

  if v_financial.service_id <> v_receivable.service_id then
    raise exception 'Receivable service and financial row do not match.'
      using errcode = '23514';
  end if;

  if v_service.customer_id <> v_receivable.customer_id then
    raise exception 'Receivable customer does not match the service customer.'
      using errcode = '23514';
  end if;

  if v_financial.currency_code <> v_receivable.currency_code then
    raise exception 'Receivable currency does not match service financial currency.'
      using errcode = '23514';
  end if;

  if v_receivable.status in ('open', 'overdue', 'partial') then
    if v_financial.pricing_status <> 'finalized' then
      raise exception 'Active receivable requires finalized service pricing.'
        using errcode = '23514';
    end if;

    if v_financial.financial_status not in ('pending', 'partial') then
      raise exception 'Active receivable requires pending or partial service financial status.'
        using errcode = '23514';
    end if;

    if v_financial.pending_amount <= 0 or v_receivable.pending_amount <= 0 then
      raise exception 'Active receivable requires positive pending amounts.'
        using errcode = '23514';
    end if;

    if v_financial.pending_amount <> v_receivable.pending_amount then
      raise exception 'Active receivable pending_amount must match service financial pending_amount.'
        using errcode = '23514';
    end if;
  elsif v_receivable.status = 'paid' then
    if v_receivable.pending_amount <> 0 or v_receivable.closed_at is null or v_receivable.closed_by is null then
      raise exception 'Paid receivable requires zero pending amount, closed_at and closed_by.'
        using errcode = '23514';
    end if;

    if v_financial.financial_status <> 'paid' or v_financial.pending_amount <> 0 then
      raise exception 'Paid receivable requires paid service financial status and zero service pending amount.'
        using errcode = '23514';
    end if;
  elsif v_receivable.status = 'cancelled' then
    if v_receivable.cancelled_at is null or v_receivable.cancelled_by is null then
      raise exception 'Cancelled receivable requires cancelled_at and cancelled_by.'
        using errcode = '23514';
    end if;
  elsif v_receivable.status = 'written_off' then
    if v_receivable.written_off_at is null or v_receivable.written_off_by is null then
      raise exception 'Written-off receivable requires written_off_at and written_off_by.'
        using errcode = '23514';
    end if;
  end if;
end;
$$;

create or replace function public.validate_receivable_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable_id uuid;
begin
  if tg_table_name = 'receivables' then
    v_receivable_id := new.id;
    perform public.validate_single_receivable_coherence(v_receivable_id);
  elsif tg_table_name = 'receivable_allocations' then
    v_receivable_id := new.receivable_id;
    perform public.validate_single_receivable_coherence(v_receivable_id);
  elsif tg_table_name = 'service_financials' then
    if tg_op = 'UPDATE' then
      if new.pricing_status is not distinct from old.pricing_status
        and new.financial_status is not distinct from old.financial_status
        and new.currency_code is not distinct from old.currency_code
        and new.total_amount is not distinct from old.total_amount
        and new.paid_amount is not distinct from old.paid_amount
        and new.pending_amount is not distinct from old.pending_amount
      then
        return new;
      end if;
    end if;

    for v_receivable_id in
      select receivable.id
      from public.receivables receivable
      where receivable.service_financial_id = new.id
    loop
      perform public.validate_single_receivable_coherence(v_receivable_id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_receivables_human_code on public.receivables;
create trigger assign_receivables_human_code
before insert or update of human_code, currency_code
on public.receivables
for each row
execute function public.assign_receivable_human_code();

drop trigger if exists prepare_receivables on public.receivables;
create trigger prepare_receivables
before insert or update
on public.receivables
for each row
execute function public.prepare_receivable();

drop trigger if exists prevent_receivables_calculated_update on public.receivables;
create trigger prevent_receivables_calculated_update
before update of collected_amount, pending_amount, status, closed_at
on public.receivables
for each row
execute function public.prevent_receivable_calculated_update();

drop trigger if exists recalculate_receivables_after_due_at on public.receivables;
create trigger recalculate_receivables_after_due_at
after update of due_at
on public.receivables
for each row
execute function public.recalculate_receivable_from_due_at();

drop trigger if exists record_receivables_status_change on public.receivables;
create trigger record_receivables_status_change
after insert or update of status
on public.receivables
for each row
execute function public.record_receivable_status_change();

drop trigger if exists validate_receivables_integrity on public.receivables;
create constraint trigger validate_receivables_integrity
after insert or update on public.receivables
deferrable initially deferred
for each row
execute function public.validate_receivable_integrity();

drop trigger if exists prevent_receivables_delete on public.receivables;
create trigger prevent_receivables_delete
before delete
on public.receivables
for each row
execute function public.prevent_receivable_delete();

drop trigger if exists prevent_receivable_status_history_changes on public.receivable_status_history;
create trigger prevent_receivable_status_history_changes
before update or delete
on public.receivable_status_history
for each row
execute function public.prevent_receivable_status_history_changes();

drop trigger if exists prepare_receivable_collection_attempts on public.receivable_collection_attempts;
create trigger prepare_receivable_collection_attempts
before insert or update or delete
on public.receivable_collection_attempts
for each row
execute function public.prepare_receivable_collection_attempt();

drop trigger if exists prepare_receivable_notes on public.receivable_notes;
create trigger prepare_receivable_notes
before insert or update or delete
on public.receivable_notes
for each row
execute function public.prepare_receivable_note();

drop trigger if exists assign_receivable_allocations_human_code on public.receivable_allocations;
create trigger assign_receivable_allocations_human_code
before insert or update of human_code
on public.receivable_allocations
for each row
execute function public.assign_receivable_allocation_human_code();

drop trigger if exists prepare_receivable_allocations on public.receivable_allocations;
create trigger prepare_receivable_allocations
before insert or update or delete
on public.receivable_allocations
for each row
execute function public.prepare_receivable_allocation();

drop trigger if exists recalculate_receivables_after_allocations on public.receivable_allocations;
create trigger recalculate_receivables_after_allocations
after insert on public.receivable_allocations
for each row
execute function public.recalculate_receivable_from_allocation();

drop trigger if exists validate_receivable_allocations_integrity on public.receivable_allocations;
create constraint trigger validate_receivable_allocations_integrity
after insert on public.receivable_allocations
deferrable initially deferred
for each row
execute function public.validate_receivable_integrity();

drop trigger if exists validate_service_financials_receivables_integrity on public.service_financials;
create constraint trigger validate_service_financials_receivables_integrity
after insert or update of pricing_status, financial_status, currency_code, total_amount, paid_amount, pending_amount
on public.service_financials
deferrable initially deferred
for each row
execute function public.validate_receivable_integrity();

revoke all on table public.receivables from public;
revoke all on table public.receivable_status_history from public;
revoke all on table public.receivable_collection_attempts from public;
revoke all on table public.receivable_notes from public;
revoke all on table public.receivable_allocations from public;

revoke all on table public.receivables from anon;
revoke all on table public.receivable_status_history from anon;
revoke all on table public.receivable_collection_attempts from anon;
revoke all on table public.receivable_notes from anon;
revoke all on table public.receivable_allocations from anon;

revoke all on table public.receivables from authenticated;
revoke all on table public.receivable_status_history from authenticated;
revoke all on table public.receivable_collection_attempts from authenticated;
revoke all on table public.receivable_notes from authenticated;
revoke all on table public.receivable_allocations from authenticated;

grant select, insert, update, delete on table public.receivables to service_role;
grant select, insert on table public.receivable_status_history to service_role;
grant select, insert, update, delete on table public.receivable_collection_attempts to service_role;
grant select, insert, update, delete on table public.receivable_notes to service_role;
grant select, insert, update, delete on table public.receivable_allocations to service_role;

revoke all on function public.assign_receivable_human_code() from public;
revoke all on function public.assign_receivable_allocation_human_code() from public;
revoke all on function public.prevent_receivable_calculated_update() from public;
revoke all on function public.prepare_receivable() from public;
revoke all on function public.validate_single_receivable_coherence(uuid) from public;
revoke all on function public.receivable_is_overdue(uuid, timestamptz) from public;
revoke all on function public.recalculate_receivable(uuid) from public;
revoke all on function public.recalculate_receivable_from_allocation() from public;
revoke all on function public.recalculate_receivable_from_due_at() from public;
revoke all on function public.record_receivable_status_change() from public;
revoke all on function public.prepare_receivable_allocation() from public;
revoke all on function public.prepare_receivable_collection_attempt() from public;
revoke all on function public.prepare_receivable_note() from public;
revoke all on function public.prevent_receivable_status_history_changes() from public;
revoke all on function public.prevent_receivable_delete() from public;
revoke all on function public.validate_receivable_integrity() from public;

revoke execute on function public.assign_receivable_human_code() from anon;
revoke execute on function public.assign_receivable_allocation_human_code() from anon;
revoke execute on function public.prevent_receivable_calculated_update() from anon;
revoke execute on function public.prepare_receivable() from anon;
revoke execute on function public.validate_single_receivable_coherence(uuid) from anon;
revoke execute on function public.receivable_is_overdue(uuid, timestamptz) from anon;
revoke execute on function public.recalculate_receivable(uuid) from anon;
revoke execute on function public.recalculate_receivable_from_allocation() from anon;
revoke execute on function public.recalculate_receivable_from_due_at() from anon;
revoke execute on function public.record_receivable_status_change() from anon;
revoke execute on function public.prepare_receivable_allocation() from anon;
revoke execute on function public.prepare_receivable_collection_attempt() from anon;
revoke execute on function public.prepare_receivable_note() from anon;
revoke execute on function public.prevent_receivable_status_history_changes() from anon;
revoke execute on function public.prevent_receivable_delete() from anon;
revoke execute on function public.validate_receivable_integrity() from anon;

revoke execute on function public.assign_receivable_human_code() from authenticated;
revoke execute on function public.assign_receivable_allocation_human_code() from authenticated;
revoke execute on function public.prevent_receivable_calculated_update() from authenticated;
revoke execute on function public.prepare_receivable() from authenticated;
revoke execute on function public.validate_single_receivable_coherence(uuid) from authenticated;
revoke execute on function public.receivable_is_overdue(uuid, timestamptz) from authenticated;
revoke execute on function public.recalculate_receivable(uuid) from authenticated;
revoke execute on function public.recalculate_receivable_from_allocation() from authenticated;
revoke execute on function public.recalculate_receivable_from_due_at() from authenticated;
revoke execute on function public.record_receivable_status_change() from authenticated;
revoke execute on function public.prepare_receivable_allocation() from authenticated;
revoke execute on function public.prepare_receivable_collection_attempt() from authenticated;
revoke execute on function public.prepare_receivable_note() from authenticated;
revoke execute on function public.prevent_receivable_status_history_changes() from authenticated;
revoke execute on function public.prevent_receivable_delete() from authenticated;
revoke execute on function public.validate_receivable_integrity() from authenticated;

grant execute on function public.receivable_is_overdue(uuid, timestamptz) to service_role;
grant execute on function public.recalculate_receivable(uuid) to service_role;

do $$
declare
  missing_tables text;
  missing_functions text;
  missing_triggers text;
  missing_indexes text;
  forbidden_tables text;
  validation_receivable_id uuid;
begin
  select string_agg(required.table_name, ', ' order by required.table_name)
  into missing_tables
  from (
    values
      ('receivables'),
      ('receivable_status_history'),
      ('receivable_collection_attempts'),
      ('receivable_notes'),
      ('receivable_allocations')
  ) as required(table_name)
  where to_regclass('public.' || required.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing receivables domain tables: %.', missing_tables;
  end if;

  select string_agg(required.function_name, ', ' order by required.function_name)
  into missing_functions
  from (
    values
      ('public.assign_receivable_human_code()'),
      ('public.assign_receivable_allocation_human_code()'),
      ('public.prevent_receivable_calculated_update()'),
      ('public.prepare_receivable()'),
      ('public.validate_single_receivable_coherence(uuid)'),
      ('public.receivable_is_overdue(uuid,timestamp with time zone)'),
      ('public.recalculate_receivable(uuid)'),
      ('public.recalculate_receivable_from_allocation()'),
      ('public.recalculate_receivable_from_due_at()'),
      ('public.record_receivable_status_change()'),
      ('public.prepare_receivable_allocation()'),
      ('public.prepare_receivable_collection_attempt()'),
      ('public.prepare_receivable_note()'),
      ('public.prevent_receivable_status_history_changes()'),
      ('public.prevent_receivable_delete()'),
      ('public.validate_receivable_integrity()')
  ) as required(function_name)
  where to_regprocedure(required.function_name) is null;

  if missing_functions is not null then
    raise exception 'Missing receivables domain functions: %.', missing_functions;
  end if;

  select string_agg(required.trigger_name, ', ' order by required.trigger_name)
  into missing_triggers
  from (
    values
      ('set_receivables_updated_at'),
      ('assign_receivables_human_code'),
      ('prepare_receivables'),
      ('prevent_receivables_calculated_update'),
      ('recalculate_receivables_after_due_at'),
      ('record_receivables_status_change'),
      ('validate_receivables_integrity'),
      ('prevent_receivables_delete'),
      ('prevent_receivable_status_history_changes'),
      ('prepare_receivable_collection_attempts'),
      ('prepare_receivable_notes'),
      ('assign_receivable_allocations_human_code'),
      ('prepare_receivable_allocations'),
      ('recalculate_receivables_after_allocations'),
      ('validate_receivable_allocations_integrity'),
      ('validate_service_financials_receivables_integrity')
  ) as required(trigger_name)
  where not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname = required.trigger_name
      and not trigger_row.tgisinternal
  );

  if missing_triggers is not null then
    raise exception 'Missing receivables domain triggers: %.', missing_triggers;
  end if;

  select string_agg(required.index_name, ', ' order by required.index_name)
  into missing_indexes
  from (
    values
      ('receivables_human_code_unique'),
      ('receivable_allocations_human_code_unique'),
      ('receivables_one_active_per_financial_idx'),
      ('receivables_one_active_per_service_idx'),
      ('receivable_allocations_payment_unique')
  ) as required(index_name)
  where to_regclass('public.' || required.index_name) is null;

  if missing_indexes is not null then
    raise exception 'Missing receivables indexes or constraints: %.', missing_indexes;
  end if;

  if not exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix = 'REC'
      and counter.padding = 6
      and counter.is_active is true
  ) or not exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix = 'RCP'
      and counter.padding = 6
      and counter.is_active is true
  ) then
    raise exception 'REC and RCP human code counters must exist, stay active and use padding 6.';
  end if;

  if exists (select 1 from public.receivables where human_code !~ '^REC-[0-9]{6}$') then
    raise exception 'Invalid REC human_code format detected.';
  end if;

  if exists (select 1 from public.receivable_allocations where human_code !~ '^RCP-[0-9]{6}$') then
    raise exception 'Invalid RCP human_code format detected.';
  end if;
  for validation_receivable_id in
    select receivable.id
    from public.receivables receivable
  loop
    perform public.validate_single_receivable_coherence(validation_receivable_id);
  end loop;

  if exists (
    select 1
    from public.receivables receivable
    where original_amount <= 0
       or collected_amount < 0
       or pending_amount < 0
       or collected_amount > original_amount
       or pending_amount <> round(original_amount - collected_amount, 2)
       or currency_code !~ '^[A-Z]{3}$'
  ) then
    raise exception 'Invalid receivable amount or currency detected.';
  end if;

  if exists (
    select 1
    from public.receivables receivable
    where (receivable.status = 'paid' and (receivable.closed_at is null or receivable.closed_by is null))
       or (receivable.status = 'cancelled' and (receivable.cancelled_at is null or receivable.cancelled_by is null))
       or (receivable.status = 'written_off' and (receivable.written_off_at is null or receivable.written_off_by is null))
  ) then
    raise exception 'Final receivable states require timestamp and actor fields.';
  end if;
  if exists (
    select service_financial_id
    from public.receivables
    where status in ('open', 'overdue', 'partial')
    group by service_financial_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate active receivables per service_financial detected.';
  end if;

  if exists (
    select 1
    from public.receivables receivable
    join public.service_financials financial on financial.id = receivable.service_financial_id
    join public.services service on service.id = receivable.service_id
    where financial.service_id <> receivable.service_id
       or service.customer_id <> receivable.customer_id
       or financial.currency_code <> receivable.currency_code
  ) then
    raise exception 'Receivable service/customer/financial coherence violation detected.';
  end if;

  if exists (
    select 1
    from public.receivable_allocations allocation
    join public.service_payments payment on payment.id = allocation.payment_id
    join public.receivables receivable on receivable.id = allocation.receivable_id
    where payment.payment_status <> 'completed'
       or payment.service_financial_id <> receivable.service_financial_id
       or payment.service_id <> receivable.service_id
       or payment.currency_code <> receivable.currency_code
       or payment.amount <> allocation.allocated_amount
  ) then
    raise exception 'Invalid receivable allocation payment coherence detected.';
  end if;

  if exists (
    select payment_id
    from public.receivable_allocations
    group by payment_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate receivable allocations per payment detected.';
  end if;

  if exists (
    select 1
    from public.receivable_status_history history
    where history.from_status = history.to_status
  ) then
    raise exception 'Receivable status history must only contain real changes.';
  end if;
  if exists (
    select 1
    from public.receivable_status_history history
    where history.to_status = 'paid'
      and (history.changed_by_user_id is null or history.payment_id is null)
  ) then
    raise exception 'Paid receivable status history requires actor and payment_id.';
  end if;

  if exists (
    select 1
    from public.receivable_collection_attempts attempt
    where attempt.next_action_at is not null
      and attempt.next_action_at < attempt.attempted_at
  ) then
    raise exception 'Invalid receivable collection attempt next_action_at detected.';
  end if;

  if exists (
    select 1
    from public.receivable_notes note
    where length(trim(note.content)) = 0
  ) then
    raise exception 'Empty receivable note content detected.';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid in ('public.service_payments'::regclass, 'public.cash_movements'::regclass)
      and trigger_row.tgname ilike '%receivable%'
  ) then
    raise exception 'Migration 0009 must not create automatic receivable triggers on service_payments or cash_movements.';
  end if;

  select string_agg(forbidden.table_name, ', ' order by forbidden.table_name)
  into forbidden_tables
  from (
    values
      ('expenses'),
      ('expense_payments'),
      ('expense_reimbursements'),
      ('receivable_payments'),
      ('settlements'),
      ('settlement_payments')
  ) as forbidden(table_name)
  where to_regclass('public.' || forbidden.table_name) is not null;

  if forbidden_tables is not null then
    raise exception 'Migration 0009 must not create later-domain tables: %.', forbidden_tables;
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
        ('receivables'),
        ('receivable_status_history'),
        ('receivable_collection_attempts'),
        ('receivable_notes'),
        ('receivable_allocations')
    ) as table_names(table_name)
    cross join (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE')
    ) as privileges(privilege_name)
    where has_table_privilege('anon', 'public.' || table_name, privileges.privilege_name)
       or has_table_privilege('authenticated', 'public.' || table_name, privileges.privilege_name)
  ) then
    raise exception 'anon/authenticated must not have direct privileges on receivables domain tables.';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.assign_receivable_human_code()'),
        ('public.assign_receivable_allocation_human_code()'),
        ('public.prevent_receivable_calculated_update()'),
        ('public.prepare_receivable()'),
        ('public.receivable_is_overdue(uuid,timestamp with time zone)'),
        ('public.recalculate_receivable(uuid)'),
        ('public.recalculate_receivable_from_allocation()'),
        ('public.recalculate_receivable_from_due_at()'),
        ('public.record_receivable_status_change()'),
        ('public.prepare_receivable_allocation()'),
        ('public.prepare_receivable_collection_attempt()'),
        ('public.prepare_receivable_note()'),
        ('public.prevent_receivable_status_history_changes()'),
        ('public.prevent_receivable_delete()'),
        ('public.validate_receivable_integrity()')
    ) as function_names(function_name)
    where has_function_privilege('anon', function_name, 'EXECUTE')
       or has_function_privilege('authenticated', function_name, 'EXECUTE')
  ) then
    raise exception 'anon/authenticated must not execute receivables domain functions.';
  end if;
end;
$$;

