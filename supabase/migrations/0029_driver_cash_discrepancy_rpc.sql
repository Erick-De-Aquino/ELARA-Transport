-- Migration 0029: driver cash remittance discrepancy RPC.
--
-- Allows an authenticated conductor to report a discrepancy over one of their
-- own visible cash remittances without changing remittance state or movements.

create or replace function public.create_driver_cash_discrepancy(
  p_remittance_id uuid,
  p_description text
)
returns table(
  discrepancy_id uuid,
  human_code text,
  remittance_id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_description text;
  v_remittance public.cash_remittances%rowtype;
  v_discrepancy public.cash_discrepancies%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();
  v_app_user_id := public.rls_current_app_user_id();

  if v_driver_id is null or v_app_user_id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  v_description := trim(coalesce(p_description, ''));

  if length(v_description) = 0 then
    raise exception 'Discrepancy description is required.'
      using errcode = '23514';
  end if;

  if v_description ~ '<[[:alpha:]/][^>]*>' then
    raise exception 'Discrepancy description cannot contain HTML.'
      using errcode = '23514';
  end if;

  select *
    into v_remittance
  from public.cash_remittances remittance
  where remittance.id = p_remittance_id
  for update;

  if v_remittance.id is null or v_remittance.driver_id is distinct from v_driver_id then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  if v_remittance.status not in ('submitted', 'received', 'verified') then
    raise exception 'This remittance status does not allow reporting discrepancies.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.cash_discrepancies discrepancy
    where discrepancy.discrepancy_type = 'remittance'
      and discrepancy.remittance_id = v_remittance.id
      and discrepancy.status in ('open', 'under_review')
  ) then
    raise exception 'An open discrepancy already exists for this remittance.'
      using errcode = '23505';
  end if;

  insert into public.cash_discrepancies (
    discrepancy_type,
    cash_account_id,
    remittance_id,
    expected_amount,
    actual_amount,
    difference_amount,
    currency_code,
    status,
    reason_code,
    reason_details,
    created_by,
    updated_by
  )
  values (
    'remittance',
    v_remittance.source_cash_account_id,
    v_remittance.id,
    v_remittance.declared_amount,
    coalesce(v_remittance.verified_amount, v_remittance.declared_amount),
    round(coalesce(v_remittance.verified_amount, v_remittance.declared_amount) - v_remittance.declared_amount, 2),
    v_remittance.currency_code,
    'open',
    'driver_reported',
    v_description,
    v_app_user_id,
    v_app_user_id
  )
  returning * into v_discrepancy;

  perform public.secure_audit(
    'insert',
    'cash_discrepancies',
    v_discrepancy.id,
    v_discrepancy.human_code,
    null,
    to_jsonb(v_discrepancy),
    'Driver reported cash remittance discrepancy.',
    jsonb_build_object(
      'operation', 'driver_cash_discrepancy_created',
      'remittance_id', v_remittance.id,
      'remittance_human_code', v_remittance.human_code,
      'remittance_status', v_remittance.status
    ),
    v_app_user_id,
    v_driver_id
  );

  return query
    select
      v_discrepancy.id,
      v_discrepancy.human_code,
      v_discrepancy.remittance_id,
      v_discrepancy.status,
      v_discrepancy.created_at;
end;
$$;

comment on function public.create_driver_cash_discrepancy(uuid, text) is
  'Creates an open cash remittance discrepancy for the authenticated conductor over their own submitted, received or verified remittance.';

revoke all on function public.create_driver_cash_discrepancy(uuid, text) from public;
revoke all on function public.create_driver_cash_discrepancy(uuid, text) from anon;
revoke all on function public.create_driver_cash_discrepancy(uuid, text) from authenticated;
revoke all on function public.create_driver_cash_discrepancy(uuid, text) from service_role;

grant execute on function public.create_driver_cash_discrepancy(uuid, text) to authenticated;

do $$
begin
  if to_regprocedure('public.create_driver_cash_discrepancy(uuid, text)') is null then
    raise exception 'Missing function public.create_driver_cash_discrepancy(uuid, text).';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = 'public.create_driver_cash_discrepancy(uuid, text)'::regprocedure
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute public.create_driver_cash_discrepancy(uuid, text).';
  end if;

  if has_function_privilege('anon', 'public.create_driver_cash_discrepancy(uuid, text)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.create_driver_cash_discrepancy(uuid, text).';
  end if;

  if not has_function_privilege('authenticated', 'public.create_driver_cash_discrepancy(uuid, text)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.create_driver_cash_discrepancy(uuid, text).';
  end if;

  if has_function_privilege('service_role', 'public.create_driver_cash_discrepancy(uuid, text)', 'EXECUTE') then
    raise exception 'service_role must not execute public.create_driver_cash_discrepancy(uuid, text).';
  end if;
end;
$$;
