-- Migration 0033: admin cash remittance reception RPC.
--
-- Allows Administracion/Superadmin users to mark a submitted cash remittance
-- as received. This does not verify amounts and does not create cash movements.

create or replace function public.receive_cash_remittance(p_remittance_id uuid)
returns table(
  remittance_id uuid,
  human_code text,
  status text,
  declared_amount numeric(14, 2),
  currency_code text,
  received_at timestamptz,
  received_by_user_id uuid,
  driver_id uuid,
  driver_human_code text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_remittance_before public.cash_remittances%rowtype;
  v_remittance_after public.cash_remittances%rowtype;
  v_source_account public.cash_accounts%rowtype;
  v_destination_account public.cash_accounts%rowtype;
  v_driver_human_code text;
begin
  v_actor_id := public.require_admin_user();

  if p_remittance_id is null then
    raise exception 'Cash remittance id is required.'
      using errcode = '23502';
  end if;

  select *
    into v_remittance_before
  from public.cash_remittances remittance
  where remittance.id = p_remittance_id
  for update;

  if not found then
    raise exception 'Cash remittance was not found.'
      using errcode = '23503';
  end if;

  if v_remittance_before.status = 'received' then
    raise exception 'Cash remittance % is already received.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.status = 'verified' then
    raise exception 'Cash remittance % is already verified.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.status = 'cancelled' then
    raise exception 'Cancelled cash remittance % cannot be received.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.status <> 'submitted' then
    raise exception 'Cash remittance % cannot be received from status %.', v_remittance_before.human_code, v_remittance_before.status
      using errcode = '23514';
  end if;

  if v_remittance_before.received_at is not null
     or v_remittance_before.received_by_user_id is not null then
    raise exception 'Cash remittance % already has reception metadata.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.verified_at is not null
     or v_remittance_before.verified_by_user_id is not null
     or v_remittance_before.verified_amount is not null then
    raise exception 'Cash remittance % already has verification metadata.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.cancelled_at is not null
     or v_remittance_before.cancelled_by is not null then
    raise exception 'Cash remittance % already has cancellation metadata.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.submitted_at is null then
    raise exception 'Submitted cash remittance % must have submitted_at.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_remittance_before.declared_amount <= 0 then
    raise exception 'Cash remittance % must have a positive declared amount.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  select *
    into v_source_account
  from public.cash_accounts account
  where account.id = v_remittance_before.source_cash_account_id;

  if not found then
    raise exception 'Cash remittance % references a missing source cash account.', v_remittance_before.human_code
      using errcode = '23503';
  end if;

  select *
    into v_destination_account
  from public.cash_accounts account
  where account.id = v_remittance_before.destination_cash_account_id;

  if not found then
    raise exception 'Cash remittance % references a missing destination cash account.', v_remittance_before.human_code
      using errcode = '23503';
  end if;

  if v_source_account.id = v_destination_account.id then
    raise exception 'Cash remittance % must use distinct cash accounts.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_source_account.status <> 'active'
     or v_destination_account.status <> 'active' then
    raise exception 'Cash remittance % requires active source and destination cash accounts.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_source_account.currency_code <> v_remittance_before.currency_code
     or v_destination_account.currency_code <> v_remittance_before.currency_code then
    raise exception 'Cash remittance % currency must match source and destination cash accounts.', v_remittance_before.human_code
      using errcode = '23514';
  end if;

  if v_source_account.account_type = 'driver' then
    if v_remittance_before.driver_id is null
       or v_source_account.driver_id is distinct from v_remittance_before.driver_id then
      raise exception 'Driver cash remittance % must be linked to its source driver account.', v_remittance_before.human_code
        using errcode = '23514';
    end if;

    if v_remittance_before.submitted_by_driver_id is null
       or v_remittance_before.submitted_by_driver_id is distinct from v_remittance_before.driver_id then
      raise exception 'Driver cash remittance % must have the submitting driver recorded.', v_remittance_before.human_code
        using errcode = '23514';
    end if;
  end if;

  update public.cash_remittances remittance
     set status = 'received',
         received_at = now(),
         received_by_user_id = v_actor_id,
         updated_by = v_actor_id
   where remittance.id = p_remittance_id
     and remittance.status = 'submitted'
  returning * into v_remittance_after;

  if not found then
    raise exception 'Cash remittance % could not be received because its status changed concurrently.', v_remittance_before.human_code
      using errcode = '40001';
  end if;

  select driver.human_code
    into v_driver_human_code
  from public.drivers driver
  where driver.id = v_remittance_after.driver_id;

  perform public.secure_audit(
    'status_change',
    'cash_remittances',
    v_remittance_after.id,
    v_remittance_after.human_code,
    to_jsonb(v_remittance_before),
    to_jsonb(v_remittance_after),
    'Admin cash remittance received.',
    jsonb_build_object(
      'operation', 'admin_cash_remittance_received',
      'remittance_id', v_remittance_after.id,
      'human_code', v_remittance_after.human_code,
      'driver_id', v_remittance_after.driver_id,
      'declared_amount', v_remittance_after.declared_amount,
      'currency_code', v_remittance_after.currency_code,
      'received_by_app_user_id', v_actor_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_remittance_after.id,
      v_remittance_after.human_code,
      v_remittance_after.status,
      v_remittance_after.declared_amount,
      v_remittance_after.currency_code,
      v_remittance_after.received_at,
      v_remittance_after.received_by_user_id,
      v_remittance_after.driver_id,
      v_driver_human_code;
end;
$$;

comment on function public.receive_cash_remittance(uuid) is
  'Marks a submitted cash remittance as received for active Administracion/Superadmin sessions. Does not verify amounts or create remittance cash movements.';

revoke all on function public.receive_cash_remittance(uuid) from public;
revoke all on function public.receive_cash_remittance(uuid) from anon;
revoke all on function public.receive_cash_remittance(uuid) from authenticated;
revoke all on function public.receive_cash_remittance(uuid) from service_role;

grant execute on function public.receive_cash_remittance(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.receive_cash_remittance(uuid)') is null then
    raise exception 'Missing function public.receive_cash_remittance(uuid).';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = 'public.receive_cash_remittance(uuid)'::regprocedure
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute public.receive_cash_remittance(uuid).';
  end if;

  if has_function_privilege('anon', 'public.receive_cash_remittance(uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.receive_cash_remittance(uuid).';
  end if;

  if not has_function_privilege('authenticated', 'public.receive_cash_remittance(uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.receive_cash_remittance(uuid).';
  end if;

  if has_function_privilege('service_role', 'public.receive_cash_remittance(uuid)', 'EXECUTE') then
    raise exception 'service_role must not execute public.receive_cash_remittance(uuid).';
  end if;
end;
$$;
