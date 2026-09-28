-- Migration 0032: admin cash remittance read RPCs.
--
-- Read-only backend for Administracion/Superadmin Caja -> Rendiciones.
-- Does not receive, verify, cancel or mutate remittances.

create or replace function public.get_admin_cash_remittances(
  p_status text default null,
  p_driver_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  remittance_id uuid,
  human_code text,
  status text,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  source_cash_account_id uuid,
  source_cash_account_name text,
  source_cash_account_type text,
  destination_cash_account_id uuid,
  destination_cash_account_name text,
  destination_cash_account_type text,
  currency_code text,
  declared_amount numeric(14, 2),
  verified_amount numeric(14, 2),
  prepared_at timestamptz,
  submitted_at timestamptz,
  received_at timestamptz,
  verified_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz,
  discrepancy_count integer,
  open_discrepancy_count integer,
  has_open_discrepancy boolean,
  open_difference_amount numeric(14, 2),
  total_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_status text;
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  v_actor_id := public.require_admin_user();
  v_status := nullif(trim(coalesce(p_status, '')), '');
  v_search := lower(trim(coalesce(p_search, '')));
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  if v_status is not null
     and v_status not in ('draft', 'prepared', 'submitted', 'received', 'verified', 'cancelled') then
    raise exception 'Invalid cash remittance status filter.'
      using errcode = '23514';
  end if;

  return query
    with filtered as (
      select
        remittance.id,
        remittance.human_code,
        remittance.status,
        remittance.driver_id,
        driver.human_code as driver_human_code,
        nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), '') as driver_name,
        remittance.source_cash_account_id,
        source_account.name as source_cash_account_name,
        source_account.account_type as source_cash_account_type,
        remittance.destination_cash_account_id,
        destination_account.name as destination_cash_account_name,
        destination_account.account_type as destination_cash_account_type,
        remittance.currency_code,
        remittance.declared_amount,
        remittance.verified_amount,
        remittance.prepared_at,
        remittance.submitted_at,
        remittance.received_at,
        remittance.verified_at,
        remittance.cancelled_at,
        remittance.created_at,
        count(discrepancy.id)::integer as discrepancy_count,
        count(discrepancy.id) filter (
          where discrepancy.status in ('open', 'under_review')
        )::integer as open_discrepancy_count,
        coalesce(round(sum(discrepancy.difference_amount) filter (
          where discrepancy.status in ('open', 'under_review')
        ), 2), 0)::numeric(14, 2) as open_difference_amount
      from public.cash_remittances remittance
      left join public.drivers driver
        on driver.id = remittance.driver_id
      left join public.persons driver_person
        on driver_person.id = driver.person_id
      join public.cash_accounts source_account
        on source_account.id = remittance.source_cash_account_id
      join public.cash_accounts destination_account
        on destination_account.id = remittance.destination_cash_account_id
      left join public.cash_discrepancies discrepancy
        on discrepancy.discrepancy_type = 'remittance'
       and discrepancy.remittance_id = remittance.id
      where (v_status is null or remittance.status = v_status)
        and (p_driver_id is null or remittance.driver_id = p_driver_id)
        and (
          v_search = ''
          or lower(remittance.human_code) like '%' || v_search || '%'
          or lower(coalesce(driver.human_code, '')) like '%' || v_search || '%'
          or lower(coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), '')) like '%' || v_search || '%'
        )
      group by
        remittance.id,
        driver.human_code,
        driver_person.first_name,
        driver_person.last_name,
        source_account.name,
        source_account.account_type,
        destination_account.name,
        destination_account.account_type
    ),
    counted as (
      select
        filtered.*,
        count(*) over()::integer as total_count
      from filtered
    )
    select
      counted.id,
      counted.human_code,
      counted.status,
      counted.driver_id,
      counted.driver_human_code,
      coalesce(counted.driver_name, ''),
      counted.source_cash_account_id,
      counted.source_cash_account_name,
      counted.source_cash_account_type,
      counted.destination_cash_account_id,
      counted.destination_cash_account_name,
      counted.destination_cash_account_type,
      counted.currency_code,
      counted.declared_amount,
      counted.verified_amount,
      counted.prepared_at,
      counted.submitted_at,
      counted.received_at,
      counted.verified_at,
      counted.cancelled_at,
      counted.created_at,
      counted.discrepancy_count,
      counted.open_discrepancy_count,
      counted.open_discrepancy_count > 0,
      counted.open_difference_amount,
      counted.total_count
    from counted
    order by coalesce(counted.submitted_at, counted.created_at) desc,
             counted.created_at desc,
             counted.id desc
    limit v_limit
    offset v_offset;
end;
$$;

comment on function public.get_admin_cash_remittances(text, uuid, text, integer, integer) is
  'Returns a paginated administrative read-only list of cash remittances. Requires active superadmin or administrativo context.';

create or replace function public.get_admin_cash_remittance_detail(p_remittance_id uuid)
returns table(
  remittance_id uuid,
  human_code text,
  status text,
  notes text,
  currency_code text,
  declared_amount numeric(14, 2),
  verified_amount numeric(14, 2),
  prepared_at timestamptz,
  submitted_at timestamptz,
  received_at timestamptz,
  verified_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  source_cash_account_id uuid,
  source_cash_account_name text,
  source_cash_account_type text,
  destination_cash_account_id uuid,
  destination_cash_account_name text,
  destination_cash_account_type text,
  prepared_by_user_id uuid,
  prepared_by_user_human_code text,
  prepared_by_user_name text,
  submitted_by_driver_id uuid,
  submitted_by_driver_human_code text,
  submitted_by_driver_name text,
  received_by_user_id uuid,
  received_by_user_human_code text,
  received_by_user_name text,
  verified_by_user_id uuid,
  verified_by_user_human_code text,
  verified_by_user_name text,
  cancelled_by_user_id uuid,
  cancelled_by_user_human_code text,
  cancelled_by_user_name text,
  items jsonb,
  discrepancies jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_row_count integer;
begin
  v_actor_id := public.require_admin_user();

  if p_remittance_id is null then
    raise exception 'Cash remittance id is required.'
      using errcode = '23502';
  end if;

  return query
    select
      remittance.id,
      remittance.human_code,
      remittance.status,
      remittance.notes,
      remittance.currency_code,
      remittance.declared_amount,
      remittance.verified_amount,
      remittance.prepared_at,
      remittance.submitted_at,
      remittance.received_at,
      remittance.verified_at,
      remittance.cancelled_at,
      remittance.cancellation_reason,
      remittance.created_at,
      driver.id,
      driver.human_code,
      coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), ''),
      source_account.id,
      source_account.name,
      source_account.account_type,
      destination_account.id,
      destination_account.name,
      destination_account.account_type,
      prepared_user.id,
      prepared_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', prepared_person.first_name, prepared_person.last_name)), ''), ''),
      submitted_driver.id,
      submitted_driver.human_code,
      coalesce(nullif(trim(concat_ws(' ', submitted_person.first_name, submitted_person.last_name)), ''), ''),
      received_user.id,
      received_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', received_person.first_name, received_person.last_name)), ''), ''),
      verified_user.id,
      verified_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', verified_person.first_name, verified_person.last_name)), ''), ''),
      cancelled_user.id,
      cancelled_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', cancelled_person.first_name, cancelled_person.last_name)), ''), ''),
      coalesce(item_rows.items, '[]'::jsonb),
      coalesce(discrepancy_rows.discrepancies, '[]'::jsonb)
    from public.cash_remittances remittance
    left join public.drivers driver
      on driver.id = remittance.driver_id
    left join public.persons driver_person
      on driver_person.id = driver.person_id
    join public.cash_accounts source_account
      on source_account.id = remittance.source_cash_account_id
    join public.cash_accounts destination_account
      on destination_account.id = remittance.destination_cash_account_id
    left join public.app_users prepared_user
      on prepared_user.id = remittance.prepared_by_user_id
    left join public.persons prepared_person
      on prepared_person.id = prepared_user.person_id
    left join public.drivers submitted_driver
      on submitted_driver.id = remittance.submitted_by_driver_id
    left join public.persons submitted_person
      on submitted_person.id = submitted_driver.person_id
    left join public.app_users received_user
      on received_user.id = remittance.received_by_user_id
    left join public.persons received_person
      on received_person.id = received_user.person_id
    left join public.app_users verified_user
      on verified_user.id = remittance.verified_by_user_id
    left join public.persons verified_person
      on verified_person.id = verified_user.person_id
    left join public.app_users cancelled_user
      on cancelled_user.id = remittance.cancelled_by
    left join public.persons cancelled_person
      on cancelled_person.id = cancelled_user.person_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'item_id', item.id,
          'cash_movement_id', item.cash_movement_id,
          'cash_movement_human_code', movement.human_code,
          'service_payment_id', item.service_payment_id,
          'service_payment_human_code', payment.human_code,
          'service_id', coalesce(item.service_id, movement.service_id, payment.service_id),
          'service_human_code', service.human_code,
          'amount', item.amount,
          'description', item.description,
          'created_at', item.created_at
        )
        order by item.created_at, item.id
      ) as items
      from public.cash_remittance_items item
      left join public.cash_movements movement
        on movement.id = item.cash_movement_id
      left join public.service_payments payment
        on payment.id = item.service_payment_id
      left join public.services service
        on service.id = coalesce(item.service_id, movement.service_id, payment.service_id)
      where item.remittance_id = remittance.id
    ) item_rows on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'discrepancy_id', discrepancy.id,
          'human_code', discrepancy.human_code,
          'status', discrepancy.status,
          'reason_code', discrepancy.reason_code,
          'reason_details', discrepancy.reason_details,
          'expected_amount', discrepancy.expected_amount,
          'actual_amount', discrepancy.actual_amount,
          'difference_amount', discrepancy.difference_amount,
          'opened_at', discrepancy.opened_at,
          'created_at', discrepancy.created_at,
          'resolved_at', discrepancy.resolved_at,
          'cancelled_at', discrepancy.cancelled_at,
          'resolution_notes', discrepancy.resolution_notes
        )
        order by discrepancy.created_at, discrepancy.id
      ) as discrepancies
      from public.cash_discrepancies discrepancy
      where discrepancy.discrepancy_type = 'remittance'
        and discrepancy.remittance_id = remittance.id
    ) discrepancy_rows on true
    where remittance.id = p_remittance_id;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    raise exception 'Cash remittance was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.get_admin_cash_remittance_detail(uuid) is
  'Returns read-only administrative detail for one cash remittance, including items and discrepancies. Requires active superadmin or administrativo context.';

revoke all on function public.get_admin_cash_remittances(text, uuid, text, integer, integer) from public;
revoke all on function public.get_admin_cash_remittances(text, uuid, text, integer, integer) from anon;
revoke all on function public.get_admin_cash_remittances(text, uuid, text, integer, integer) from authenticated;
revoke all on function public.get_admin_cash_remittances(text, uuid, text, integer, integer) from service_role;

revoke all on function public.get_admin_cash_remittance_detail(uuid) from public;
revoke all on function public.get_admin_cash_remittance_detail(uuid) from anon;
revoke all on function public.get_admin_cash_remittance_detail(uuid) from authenticated;
revoke all on function public.get_admin_cash_remittance_detail(uuid) from service_role;

grant execute on function public.get_admin_cash_remittances(text, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_admin_cash_remittance_detail(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.get_admin_cash_remittances(text,uuid,text,integer,integer)') is null then
    raise exception 'Missing function public.get_admin_cash_remittances(text,uuid,text,integer,integer).';
  end if;

  if to_regprocedure('public.get_admin_cash_remittance_detail(uuid)') is null then
    raise exception 'Missing function public.get_admin_cash_remittance_detail(uuid).';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid in (
      'public.get_admin_cash_remittances(text,uuid,text,integer,integer)'::regprocedure,
      'public.get_admin_cash_remittance_detail(uuid)'::regprocedure
    )
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute admin cash remittance read functions.';
  end if;

  if has_function_privilege('anon', 'public.get_admin_cash_remittances(text,uuid,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_admin_cash_remittance_detail(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute admin cash remittance read functions.';
  end if;

  if not has_function_privilege('authenticated', 'public.get_admin_cash_remittances(text,uuid,text,integer,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_admin_cash_remittance_detail(uuid)', 'EXECUTE') then
    raise exception 'authenticated must execute admin cash remittance read functions.';
  end if;

  if has_function_privilege('service_role', 'public.get_admin_cash_remittances(text,uuid,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.get_admin_cash_remittance_detail(uuid)', 'EXECUTE') then
    raise exception 'service_role must not execute admin cash remittance read functions.';
  end if;
end;
$$;
