-- ELARA Transport V4.0
-- Migration 0038: admin expense review RPCs.
--
-- Adds real administrative approve/reject actions for expenses.
-- Does not pay, reimburse, cancel, create cash movements, upload documents or touch settlements.

create or replace function public.approve_expense(
  p_expense_id uuid,
  p_notes text default null
)
returns table(
  expense_id uuid,
  human_code text,
  status text,
  approved_at timestamptz,
  approved_by uuid
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_notes text;
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  v_actor_id := public.require_admin_user();

  if p_expense_id is null then
    raise exception 'Expense id is required.'
      using errcode = '23502';
  end if;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'Expense approval notes are too long.'
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

  if v_before.status = 'approved' then
    raise exception 'Expense % is already approved.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.status = 'rejected' then
    raise exception 'Expense % is already rejected and cannot be approved.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.status = 'cancelled' then
    raise exception 'Expense % is cancelled and cannot be approved.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.status <> 'submitted' then
    raise exception 'Expense % cannot be approved from status %. Submit it before approval.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  update public.expenses expense
     set status = 'approved',
         approved_at = now(),
         approved_by = v_actor_id,
         internal_notes = coalesce(v_notes, expense.internal_notes),
         updated_by = v_actor_id
   where expense.id = v_before.id
     and expense.status = 'submitted'
  returning * into v_after;

  if not found then
    raise exception 'Expense % could not be approved because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'expenses',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Admin expense approved.',
    jsonb_build_object(
      'operation', 'admin_expense_approved',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'previous_status', v_before.status,
      'amount', v_after.total_amount,
      'currency_code', v_after.currency_code,
      'payment_responsibility', v_after.payment_responsibility,
      'driver_id', v_after.driver_id,
      'advanced_by_driver_id', v_after.advanced_by_driver_id,
      'service_id', v_after.service_id,
      'notes_provided', v_notes is not null
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      v_after.approved_at,
      v_after.approved_by;
end;
$$;

comment on function public.approve_expense(uuid, text) is
  'Approves a submitted expense without creating payments, reimbursements, cash movements or settlements. Requires active superadmin or administrativo context.';

create or replace function public.reject_expense(
  p_expense_id uuid,
  p_reason text
)
returns table(
  expense_id uuid,
  human_code text,
  status text,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_reason text;
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  v_actor_id := public.require_admin_user();

  if p_expense_id is null then
    raise exception 'Expense id is required.'
      using errcode = '23502';
  end if;

  v_reason := trim(coalesce(p_reason, ''));

  if length(v_reason) = 0 then
    raise exception 'Expense rejection reason is required.'
      using errcode = '23514';
  end if;

  if length(v_reason) > 1000 then
    raise exception 'Expense rejection reason is too long.'
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

  if v_before.status = 'rejected' then
    raise exception 'Expense % is already rejected.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.status = 'approved' then
    raise exception 'Expense % is already approved and cannot be rejected.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.status = 'cancelled' then
    raise exception 'Expense % is cancelled and cannot be rejected.', v_before.human_code
      using errcode = '23514';
  end if;

  if v_before.status <> 'submitted' then
    raise exception 'Expense % cannot be rejected from status %. Submit it before rejection.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  update public.expenses expense
     set status = 'rejected',
         rejected_at = now(),
         rejected_by = v_actor_id,
         rejection_reason = v_reason,
         updated_by = v_actor_id
   where expense.id = v_before.id
     and expense.status = 'submitted'
  returning * into v_after;

  if not found then
    raise exception 'Expense % could not be rejected because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'expenses',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Admin expense rejected.',
    jsonb_build_object(
      'operation', 'admin_expense_rejected',
      'expense_id', v_after.id,
      'human_code', v_after.human_code,
      'previous_status', v_before.status,
      'reason', v_reason,
      'amount', v_after.total_amount,
      'currency_code', v_after.currency_code,
      'payment_responsibility', v_after.payment_responsibility,
      'driver_id', v_after.driver_id,
      'advanced_by_driver_id', v_after.advanced_by_driver_id,
      'service_id', v_after.service_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      v_after.rejected_at,
      v_after.rejected_by,
      v_after.rejection_reason;
end;
$$;

comment on function public.reject_expense(uuid, text) is
  'Rejects a submitted expense without creating payments, reimbursements, cash movements or settlements. Requires active superadmin or administrativo context.';

revoke all on function public.approve_expense(uuid, text) from public;
revoke all on function public.approve_expense(uuid, text) from anon;
revoke all on function public.approve_expense(uuid, text) from authenticated;
revoke all on function public.approve_expense(uuid, text) from service_role;

revoke all on function public.reject_expense(uuid, text) from public;
revoke all on function public.reject_expense(uuid, text) from anon;
revoke all on function public.reject_expense(uuid, text) from authenticated;
revoke all on function public.reject_expense(uuid, text) from service_role;

grant execute on function public.approve_expense(uuid, text) to authenticated;
grant execute on function public.reject_expense(uuid, text) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.approve_expense(uuid,text)'::regprocedure,
    'public.reject_expense(uuid,text)'::regprocedure
  ]
  loop
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