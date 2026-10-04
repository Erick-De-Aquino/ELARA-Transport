-- ELARA Transport V4.0
-- Migration 0042: harden admin/superadmin expense cancellation.
--
-- Replaces public.cancel_expense(uuid,text) with a safer MVP contract:
-- superadmin only, draft/submitted/approved only, no automatic reversals,
-- and explicit blocking for completed payments, completed reimbursements and
-- active settlement deductions.

create or replace function public.cancel_expense(
  p_expense_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_reason text;
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  if p_expense_id is null then
    raise exception 'Expense id is required.' using errcode = '23502';
  end if;

  v_reason := trim(coalesce(p_reason, ''));

  if length(v_reason) = 0 then
    raise exception 'Expense cancellation requires a reason.' using errcode = '23514';
  end if;

  v_actor_id := public.require_superadmin_user();

  select *
    into v_before
    from public.expenses expense
   where expense.id = p_expense_id
   for update;

  if not found then
    raise exception 'Expense was not found.' using errcode = 'P0002';
  end if;

  if v_before.status not in ('draft', 'submitted', 'approved') then
    raise exception 'Expense cannot be cancelled from status %.', v_before.status using errcode = '23514';
  end if;

  if public.expense_is_locked_by_settlement(v_before.id) then
    raise exception 'Expense is locked by an active settlement.' using errcode = '23514';
  end if;

  perform 1
    from public.expense_payments payment
   where payment.expense_id = v_before.id
     and payment.payment_status = 'completed'
   for update;

  if found then
    raise exception 'Expense has a completed payment and cannot be cancelled without an explicit payment reversal.' using errcode = '23514';
  end if;

  perform 1
    from public.expense_reimbursements reimbursement
   where reimbursement.expense_id = v_before.id
     and reimbursement.status = 'completed'
   for update;

  if found then
    raise exception 'Expense has a completed reimbursement and cannot be cancelled without an explicit reimbursement reversal.' using errcode = '23514';
  end if;

  if v_before.status = 'approved' then
    perform set_config('elara.expense_superadmin_cancel', v_before.id::text, true);
  end if;

  update public.expenses expense
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_actor_id,
         cancellation_reason = v_reason,
         updated_by = v_actor_id
   where expense.id = v_before.id
  returning * into v_after;

  if v_before.status = 'approved' then
    perform set_config('elara.expense_superadmin_cancel', '', true);
  end if;

  select *
    into v_after
    from public.expenses expense
   where expense.id = v_before.id;

  perform public.secure_audit(
    'cancellation',
    'expenses',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_reason,
    jsonb_build_object(
      'operation', 'admin_expense_cancelled',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'previous_status', v_before.status,
      'new_status', v_after.status,
      'cancellation_reason', v_reason,
      'settlement_conflict_checked', true,
      'completed_payment_checked', true,
      'completed_reimbursement_checked', true
    ),
    v_actor_id,
    null
  );

  return v_after.id;
end;
$$;

comment on function public.cancel_expense(uuid, text) is
  'Safely cancels draft/submitted/approved expenses as superadmin only; blocks completed payments, completed reimbursements and active settlement deductions.';

revoke all on function public.cancel_expense(uuid, text) from public;
revoke all on function public.cancel_expense(uuid, text) from anon;
revoke all on function public.cancel_expense(uuid, text) from authenticated;
revoke all on function public.cancel_expense(uuid, text) from service_role;

grant execute on function public.cancel_expense(uuid, text) to authenticated;

do $$
declare
  v_function regprocedure := 'public.cancel_expense(uuid,text)'::regprocedure;
begin
  if has_function_privilege('public', v_function, 'EXECUTE') then
    raise exception 'cancel_expense must not be executable by PUBLIC.';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'cancel_expense must not be executable by anon.';
  end if;

  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'cancel_expense must be executable by authenticated.';
  end if;

  if has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'cancel_expense must not be executable by service_role.';
  end if;
end;
$$;
