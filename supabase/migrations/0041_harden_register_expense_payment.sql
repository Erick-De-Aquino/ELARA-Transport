-- ELARA Transport V4.0
-- Migration 0041: harden admin provider expense payment RPC.
--
-- Replaces the historical MVP cash-only provider payment RPC so the payable
-- amount is derived server-side and driver/temporary cash accounts are blocked.
-- The current cash model does not enforce sufficient balance; this RPC preserves
-- that behavior and only validates account ownership/type/currency/status.

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
  'Completes a full cash-only provider payment for an approved ELARA expense. The amount is derived from expenses.pending_amount, driver/temporary cash accounts are blocked, and insufficient cash balance is not enforced by the current cash model.';

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
