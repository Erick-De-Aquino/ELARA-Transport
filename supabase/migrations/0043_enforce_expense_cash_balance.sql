-- ELARA Transport V4.0
-- Migration 0043: require sufficient cash balance for expense payments/reimbursements.
-- Scope: these two expense RPCs only; other cash outflows retain their policies.
-- Lock order remains expense -> cash account. At READ COMMITTED, the volatile
-- balance helper queries a fresh snapshot after acquiring the account row lock.
-- No payment, reimbursement, movement, recalculation or audit precedes this check.
-- Reject snapshot isolation rather than relying on stale cash_movements snapshots.
-- Generic adjustments, settlements, reversals and remittances are unchanged.

create unique index if not exists cash_movements_one_expense_reimbursement_idx
  on public.cash_movements (source_type, source_id)
  where source_type = 'expense_reimbursement'
    and movement_category = 'other';

create or replace function public.reimburse_expense(
  p_expense_id uuid,
  p_cash_account_id uuid,
  p_method text,
  p_reference text default null,
  p_notes text default null
)
returns table(
  expense_id uuid,
  human_code text,
  reimbursement_id uuid,
  reimbursement_human_code text,
  cash_movement_id uuid,
  reimbursement_status text,
  amount numeric,
  currency_code text,
  reimbursed_at timestamptz,
  reimbursed_by uuid
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
  v_cash_account public.cash_accounts%rowtype;
  v_available_balance numeric(14, 2);
  v_reimbursement public.expense_reimbursements%rowtype;
  v_cash_movement_id uuid;
  v_method text;
  v_reference text;
  v_notes text;
begin
  v_actor_id := public.require_admin_user();

  if p_expense_id is null then
    raise exception 'Expense id is required.'
      using errcode = '23502';
  end if;

  if p_cash_account_id is null then
    raise exception 'Cash account id is required.'
      using errcode = '23502';
  end if;

  v_method := lower(trim(coalesce(p_method, '')));
  v_reference := nullif(trim(coalesce(p_reference, '')), '');
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  if v_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception 'Invalid expense reimbursement method.'
      using errcode = '23514';
  end if;

  if v_reference is not null and length(v_reference) > 200 then
    raise exception 'Expense reimbursement reference is too long.'
      using errcode = '23514';
  end if;

  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'Expense reimbursement notes are too long.'
      using errcode = '23514';
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

  if v_before.status <> 'approved' then
    raise exception 'Expense % cannot be reimbursed from status %.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  if v_before.payment_responsibility <> 'driver_advance' then
    raise exception 'Only driver advance expenses can be reimbursed by this operation.'
      using errcode = '23514';
  end if;

  if v_before.reimbursable is not true then
    raise exception 'Expense % is not reimbursable.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.reimbursement_status <> 'pending' then
    raise exception 'Expense % cannot be reimbursed because reimbursement_status is %.', v_before.human_code, v_before.reimbursement_status
      using errcode = '23514';
  end if;

  if v_before.advanced_by_driver_id is null then
    raise exception 'Expense % has no driver beneficiary.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.total_amount is null or v_before.total_amount <= 0 then
    raise exception 'Expense % has no positive reimbursable amount.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.currency_code is null or v_before.currency_code !~ '^[A-Z]{3}$' then
    raise exception 'Expense % has an invalid currency.', v_before.human_code
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.expense_reimbursements reimbursement
    where reimbursement.expense_id = v_before.id
      and reimbursement.status = 'completed'
    for update
  ) then
    raise exception 'Expense % already has a completed reimbursement.', v_before.human_code
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.settlement_items item
    join public.settlements settlement on settlement.id = item.settlement_id
    where item.expense_id = v_before.id
      and item.item_type = 'expense_deduction'
      and settlement.status in ('draft', 'generated', 'submitted', 'approved')
  ) then
    raise exception 'Expense is already referenced by a settlement and cannot be reimbursed directly.'
      using errcode = '23514';
  end if;

  select *
    into v_cash_account
  from public.cash_accounts account
  where account.id = p_cash_account_id
  for update;

  if not found then
    raise exception 'Cash account was not found.'
      using errcode = 'P0002';
  end if;

  if v_cash_account.status <> 'active' then
    raise exception 'Cash account must be active.'
      using errcode = '23514';
  end if;

  if v_cash_account.account_type not in ('central', 'administrative') then
    raise exception 'Expense reimbursements must be paid from a central or administrative cash account.'
      using errcode = '23514';
  end if;

  if v_cash_account.currency_code <> v_before.currency_code then
    raise exception 'Expense reimbursement cash account currency must match expense currency.'
      using errcode = '23514';
  end if;

  -- A row lock alone cannot refresh a REPEATABLE READ snapshot.
  -- Use READ COMMITTED so the balance query sees commits made while waiting.
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'Expense cash operations require READ COMMITTED isolation.'
      using errcode = '0A000';
  end if;

  -- The cash account FOR UPDATE lock above is retained until transaction end.
  -- NULL cutoff includes every posted movement, matching the overview view.
  v_available_balance := public.calculate_cash_account_balance(v_cash_account.id);
  if v_available_balance < v_before.total_amount then
    raise exception 'Insufficient cash account balance.'
      using errcode = '23514';
  end if;

  insert into public.expense_reimbursements (
    expense_id,
    reimbursed_driver_id,
    payment_method,
    status,
    amount,
    currency_code,
    cash_account_id,
    reimbursed_at,
    external_reference,
    notes,
    created_by,
    updated_by
  )
  values (
    v_before.id,
    v_before.advanced_by_driver_id,
    v_method,
    'completed',
    v_before.total_amount,
    v_before.currency_code,
    v_cash_account.id,
    now(),
    v_reference,
    v_notes,
    v_actor_id,
    v_actor_id
  )
  returning * into v_reimbursement;

  insert into public.cash_movements (
    cash_account_id,
    movement_type,
    movement_category,
    amount,
    currency_code,
    occurred_at,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata,
    created_by
  )
  values (
    v_cash_account.id,
    'outflow',
    'other',
    v_reimbursement.amount,
    v_reimbursement.currency_code,
    v_reimbursement.reimbursed_at,
    'expense_reimbursement',
    v_reimbursement.id,
    'expense_reimbursement:' || v_reimbursement.id::text,
    'Expense reimbursement ' || v_before.human_code,
    jsonb_build_object(
      'operation', 'admin_expense_reimbursed',
      'expense_id', v_before.id,
      'expense_human_code', v_before.human_code,
      'reimbursement_id', v_reimbursement.id,
      'reimbursement_human_code', v_reimbursement.human_code,
      'beneficiary_driver_id', v_before.advanced_by_driver_id,
      'cash_account_id', v_cash_account.id,
      'method', v_method,
      'reference', v_reference
    ),
    v_actor_id
  )
  returning id into v_cash_movement_id;

  perform set_config('elara.expense_recalculate', v_before.id::text, true);

  update public.expenses expense
     set updated_by = v_actor_id
   where expense.id = v_before.id
  returning * into v_after;

  perform set_config('elara.expense_recalculate', '', true);

  perform public.secure_audit(
    'payment',
    'expense_reimbursements',
    v_reimbursement.id,
    v_reimbursement.human_code,
    null,
    to_jsonb(v_reimbursement),
    'Admin expense reimbursed.',
    jsonb_build_object(
      'operation', 'admin_expense_reimbursed',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'reimbursement_id', v_reimbursement.id,
      'reimbursement_human_code', v_reimbursement.human_code,
      'cash_movement_id', v_cash_movement_id,
      'amount', v_reimbursement.amount,
      'currency_code', v_reimbursement.currency_code,
      'beneficiary_driver_id', v_reimbursement.reimbursed_driver_id,
      'cash_account_id', v_cash_account.id,
      'method', v_method,
      'reference_provided', v_reference is not null,
      'settlement_conflict_checked', true
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_reimbursement.id,
      v_reimbursement.human_code,
      v_cash_movement_id,
      v_after.reimbursement_status,
      v_reimbursement.amount,
      v_reimbursement.currency_code,
      v_reimbursement.reimbursed_at,
      v_actor_id;
end;
$$;

comment on function public.reimburse_expense(uuid, uuid, text, text, text) is
  'Completes a full reimbursement for an approved driver-advance expense, creates the corresponding cash outflow and blocks direct reimbursement when the expense is already referenced by an active settlement. Requires sufficient cash balance under the account lock and active superadmin or administrativo context.';

revoke all on function public.reimburse_expense(uuid, uuid, text, text, text) from public;
revoke all on function public.reimburse_expense(uuid, uuid, text, text, text) from anon;
revoke all on function public.reimburse_expense(uuid, uuid, text, text, text) from authenticated;
revoke all on function public.reimburse_expense(uuid, uuid, text, text, text) from service_role;

grant execute on function public.reimburse_expense(uuid, uuid, text, text, text) to authenticated;

do $$
declare
  v_function regprocedure := 'public.reimburse_expense(uuid,uuid,text,text,text)'::regprocedure;
begin
  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = v_function
      and function_acl.grantee = 0
  ) then
    raise exception 'reimburse_expense must not be executable by PUBLIC.';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'reimburse_expense must not be executable by anon.';
  end if;

  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'reimburse_expense must be executable by authenticated.';
  end if;

  if has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'reimburse_expense must not be executable by service_role.';
  end if;

  if to_regclass('public.cash_movements_one_expense_reimbursement_idx') is null then
    raise exception 'Missing index public.cash_movements_one_expense_reimbursement_idx.';
  end if;
end;
$$;
create unique index if not exists cash_movements_one_expense_payment_idx
  on public.cash_movements (source_type, source_id)
  where source_type = 'expense_payment'
    and movement_category = 'other';

drop function if exists public.register_expense_payment(
  uuid,
  numeric,
  text,
  uuid,
  timestamp with time zone,
  text
);

create or replace function public.register_expense_payment(
  p_expense_id uuid,
  p_cash_account_id uuid,
  p_payment_method text default 'cash',
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns table(
  expense_payment_id uuid,
  cash_movement_id uuid
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
  v_cash_account public.cash_accounts%rowtype;
  v_available_balance numeric(14, 2);
  v_payment public.expense_payments%rowtype;
  v_cash_movement_id uuid;
  v_method text;
  v_notes text;
  v_paid_at timestamptz;
  v_payment_amount numeric(14, 2);
begin
  v_actor_id := public.require_admin_user();

  if p_expense_id is null then
    raise exception 'Expense id is required.' using errcode = '23502';
  end if;

  if p_cash_account_id is null then
    raise exception 'Cash account id is required.' using errcode = '23502';
  end if;

  v_method := lower(trim(coalesce(p_payment_method, 'cash')));
  v_notes := nullif(trim(coalesce(p_notes, '')), '');
  v_paid_at := coalesce(p_paid_at, now());

  if v_method <> 'cash' then
    raise exception 'Only cash expense payments are available in the MVP secure RPC layer.' using errcode = '0A000';
  end if;

  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'Expense payment notes are too long.' using errcode = '23514';
  end if;

  select * into v_before
  from public.expenses expense
  where expense.id = p_expense_id
  for update;

  if not found then
    raise exception 'Expense was not found.' using errcode = 'P0002';
  end if;

  if v_before.status <> 'approved' then
    raise exception 'Expense % cannot be paid from status %.', v_before.human_code, v_before.status using errcode = '23514';
  end if;

  if v_before.payment_responsibility <> 'elara' then
    raise exception 'Only ELARA-paid provider expenses can be paid by this operation.' using errcode = '23514';
  end if;

  if v_before.payment_status <> 'unpaid' then
    raise exception 'Expense % cannot be paid because payment_status is %.', v_before.human_code, v_before.payment_status using errcode = '23514';
  end if;

  v_payment_amount := round(coalesce(v_before.pending_amount, 0), 2);

  if v_payment_amount <= 0 then
    raise exception 'Expense % has no positive pending amount to pay.', v_before.human_code using errcode = '23514';
  end if;

  if public.expense_is_locked_by_settlement(v_before.id) then
    raise exception 'Expense is locked by a settlement.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.expense_payments payment
    where payment.expense_id = v_before.id
      and payment.payment_status = 'completed'
    for update
  ) then
    raise exception 'Expense % already has a completed payment.', v_before.human_code using errcode = '23514';
  end if;

  select * into v_cash_account
  from public.cash_accounts account
  where account.id = p_cash_account_id
  for update;

  if not found then
    raise exception 'Cash account was not found.' using errcode = 'P0002';
  end if;

  if v_cash_account.status <> 'active' then
    raise exception 'Cash account must be active.' using errcode = '23514';
  end if;

  if v_cash_account.account_type not in ('central', 'administrative') then
    raise exception 'Expense payments must use a central or administrative cash account.' using errcode = '23514';
  end if;

  if v_cash_account.currency_code <> v_before.currency_code then
    raise exception 'Expense payment cash account currency must match expense currency.' using errcode = '23514';
  end if;

  -- A row lock alone cannot refresh a REPEATABLE READ snapshot.
  -- Use READ COMMITTED so the balance query sees commits made while waiting.
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'Expense cash operations require READ COMMITTED isolation.'
      using errcode = '0A000';
  end if;

  -- The cash account FOR UPDATE lock above is retained until transaction end.
  -- NULL cutoff includes every posted movement, matching the overview view.
  v_available_balance := public.calculate_cash_account_balance(v_cash_account.id);
  if v_available_balance < v_payment_amount then
    raise exception 'Insufficient cash account balance.'
      using errcode = '23514';
  end if;

  insert into public.expense_payments (
    expense_id,
    payment_method,
    payment_status,
    amount,
    currency_code,
    cash_account_id,
    paid_at,
    notes,
    created_by,
    updated_by
  ) values (
    v_before.id,
    'cash',
    'completed',
    v_payment_amount,
    v_before.currency_code,
    v_cash_account.id,
    v_paid_at,
    v_notes,
    v_actor_id,
    v_actor_id
  ) returning * into v_payment;

  insert into public.cash_movements (
    cash_account_id,
    movement_type,
    movement_category,
    amount,
    currency_code,
    occurred_at,
    source_type,
    source_id,
    idempotency_key,
    description,
    metadata,
    created_by
  ) values (
    v_cash_account.id,
    'outflow',
    'other',
    v_payment.amount,
    v_payment.currency_code,
    v_payment.paid_at,
    'expense_payment',
    v_payment.id,
    'expense_payment:' || v_payment.id::text,
    'Expense payment ' || v_before.human_code,
    jsonb_build_object(
      'operation', 'admin_expense_paid',
      'expense_id', v_before.id,
      'expense_human_code', v_before.human_code,
      'expense_payment_id', v_payment.id,
      'expense_payment_human_code', v_payment.human_code,
      'cash_account_id', v_cash_account.id,
      'method', 'cash',
      'amount_source', 'expenses.pending_amount'
    ),
    v_actor_id
  ) returning id into v_cash_movement_id;

  perform public.recalculate_expense(v_before.id);

  perform set_config('elara.expense_recalculate', v_before.id::text, true);

  update public.expenses expense
     set updated_by = v_actor_id
   where expense.id = v_before.id
  returning * into v_after;

  perform set_config('elara.expense_recalculate', '', true);

  perform public.secure_audit(
    'payment',
    'expense_payments',
    v_payment.id,
    v_payment.human_code,
    null,
    to_jsonb(v_payment),
    'Admin expense paid.',
    jsonb_build_object(
      'operation', 'admin_expense_paid',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'expense_payment_id', v_payment.id,
      'expense_payment_human_code', v_payment.human_code,
      'cash_movement_id', v_cash_movement_id,
      'amount', v_payment.amount,
      'currency_code', v_payment.currency_code,
      'cash_account_id', v_cash_account.id,
      'method', 'cash',
      'settlement_conflict_checked', true,
      'amount_source', 'expenses.pending_amount'
    ),
    v_actor_id,
    null
  );

  expense_payment_id := v_payment.id;
  cash_movement_id := v_cash_movement_id;
  return next;
end;
$$;

comment on function public.register_expense_payment(uuid, uuid, text, timestamp with time zone, text) is
  'Completes a full cash-only provider payment for an approved ELARA expense. The amount is derived from expenses.pending_amount, driver/temporary cash accounts are blocked, and sufficient cash balance is required under the account lock before creating a payment.';

revoke all on function public.register_expense_payment(uuid, uuid, text, timestamp with time zone, text) from public;
revoke all on function public.register_expense_payment(uuid, uuid, text, timestamp with time zone, text) from anon;
revoke all on function public.register_expense_payment(uuid, uuid, text, timestamp with time zone, text) from authenticated;
revoke all on function public.register_expense_payment(uuid, uuid, text, timestamp with time zone, text) from service_role;

grant execute on function public.register_expense_payment(uuid, uuid, text, timestamp with time zone, text) to authenticated;

do $$
declare
  v_new_function regprocedure := 'public.register_expense_payment(uuid,uuid,text,timestamp with time zone,text)'::regprocedure;
  v_function_count integer;
begin
  if to_regprocedure('public.register_expense_payment(uuid,numeric,text,uuid,timestamp with time zone,text)') is not null then
    raise exception 'Legacy register_expense_payment overload with p_amount must not remain installed.';
  end if;

  select count(*) into v_function_count
  from pg_proc function_record
  join pg_namespace namespace_record on namespace_record.oid = function_record.pronamespace
  where namespace_record.nspname = 'public'
    and function_record.proname = 'register_expense_payment';

  if v_function_count <> 1 then
    raise exception 'register_expense_payment must have exactly one installed overload, found %.', v_function_count;
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = v_new_function
      and function_acl.grantee = 0
  ) then
    raise exception 'register_expense_payment must not be executable by PUBLIC.';
  end if;

  if has_function_privilege('anon', v_new_function, 'EXECUTE') then
    raise exception 'register_expense_payment must not be executable by anon.';
  end if;

  if not has_function_privilege('authenticated', v_new_function, 'EXECUTE') then
    raise exception 'register_expense_payment must be executable by authenticated.';
  end if;

  if has_function_privilege('service_role', v_new_function, 'EXECUTE') then
    raise exception 'register_expense_payment must not be executable by service_role.';
  end if;

  if to_regclass('public.cash_movements_one_expense_payment_idx') is null then
    raise exception 'Missing index public.cash_movements_one_expense_payment_idx.';
  end if;
end;
$$;
