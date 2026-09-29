-- Migration 0036: admin cash discrepancy management RPCs.
--
-- Backend-only administrative management for cash discrepancies.
-- Does not create cash movements or change cash balances.

create or replace function public.get_admin_cash_discrepancies(
  p_status text default null,
  p_type text default null,
  p_driver_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  discrepancy_id uuid,
  human_code text,
  discrepancy_type text,
  status text,
  expected_amount numeric(14, 2),
  actual_amount numeric(14, 2),
  difference_amount numeric(14, 2),
  currency_code text,
  reason_code text,
  reason_details text,
  opened_at timestamptz,
  created_at timestamptz,
  remittance_id uuid,
  remittance_human_code text,
  cash_count_id uuid,
  cash_count_human_code text,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
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
  v_type text;
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  v_actor_id := public.require_admin_user();
  v_status := nullif(trim(coalesce(p_status, '')), '');
  v_type := nullif(trim(coalesce(p_type, '')), '');
  v_search := lower(trim(coalesce(p_search, '')));
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  if v_status is not null
     and v_status not in ('open', 'under_review', 'resolved', 'cancelled') then
    raise exception 'Invalid cash discrepancy status filter.'
      using errcode = '23514';
  end if;

  if v_type is not null
     and v_type not in ('remittance', 'cash_count') then
    raise exception 'Invalid cash discrepancy type filter.'
      using errcode = '23514';
  end if;

  if p_offset is not null and p_offset < 0 then
    raise exception 'Cash discrepancy offset cannot be negative.'
      using errcode = '23514';
  end if;

  return query
    with filtered as (
      select
        discrepancy.id as discrepancy_id,
        discrepancy.human_code,
        discrepancy.discrepancy_type,
        discrepancy.status,
        discrepancy.expected_amount,
        discrepancy.actual_amount,
        discrepancy.difference_amount,
        discrepancy.currency_code,
        discrepancy.reason_code,
        discrepancy.reason_details,
        discrepancy.opened_at,
        discrepancy.created_at,
        remittance.id as remittance_id,
        remittance.human_code as remittance_human_code,
        cash_count.id as cash_count_id,
        cash_count.human_code as cash_count_human_code,
        driver.id as driver_id,
        driver.human_code as driver_human_code,
        coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), '') as driver_name
      from public.cash_discrepancies discrepancy
      left join public.cash_remittances remittance
        on remittance.id = discrepancy.remittance_id
      left join public.cash_counts cash_count
        on cash_count.id = discrepancy.cash_count_id
      left join public.drivers driver
        on driver.id = remittance.driver_id
      left join public.persons driver_person
        on driver_person.id = driver.person_id
      where (v_status is null or discrepancy.status = v_status)
        and (v_type is null or discrepancy.discrepancy_type = v_type)
        and (p_driver_id is null or remittance.driver_id = p_driver_id)
        and (
          v_search = ''
          or lower(discrepancy.human_code) like '%' || v_search || '%'
          or lower(coalesce(remittance.human_code, '')) like '%' || v_search || '%'
          or lower(coalesce(cash_count.human_code, '')) like '%' || v_search || '%'
          or lower(coalesce(driver.human_code, '')) like '%' || v_search || '%'
          or lower(coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), '')) like '%' || v_search || '%'
        )
    ),
    counted as (
      select
        filtered.*,
        count(*) over()::integer as total_count
      from filtered
    )
    select
      counted.discrepancy_id,
      counted.human_code,
      counted.discrepancy_type,
      counted.status,
      counted.expected_amount,
      counted.actual_amount,
      counted.difference_amount,
      counted.currency_code,
      counted.reason_code,
      counted.reason_details,
      counted.opened_at,
      counted.created_at,
      counted.remittance_id,
      counted.remittance_human_code,
      counted.cash_count_id,
      counted.cash_count_human_code,
      counted.driver_id,
      counted.driver_human_code,
      counted.driver_name,
      counted.total_count
    from counted
    order by counted.created_at desc, counted.discrepancy_id desc
    limit v_limit
    offset v_offset;
end;
$$;

comment on function public.get_admin_cash_discrepancies(text, text, uuid, text, integer, integer) is
  'Returns a paginated administrative list of cash discrepancies. Requires active superadmin or administrativo context.';

create or replace function public.get_admin_cash_discrepancy_detail(p_discrepancy_id uuid)
returns table(
  discrepancy_id uuid,
  human_code text,
  discrepancy_type text,
  status text,
  currency_code text,
  expected_amount numeric(14, 2),
  actual_amount numeric(14, 2),
  difference_amount numeric(14, 2),
  reason_code text,
  reason_details text,
  opened_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  resolution_notes text,
  resolved_by uuid,
  resolved_by_human_code text,
  resolved_by_name text,
  cancelled_by uuid,
  cancelled_by_human_code text,
  cancelled_by_name text,
  remittance_id uuid,
  remittance_human_code text,
  remittance_status text,
  remittance_declared_amount numeric(14, 2),
  remittance_verified_amount numeric(14, 2),
  cash_count_id uuid,
  cash_count_human_code text,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  cash_account_id uuid,
  cash_account_human_code text,
  cash_account_name text,
  cash_account_type text
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

  if p_discrepancy_id is null then
    raise exception 'Cash discrepancy id is required.'
      using errcode = '23502';
  end if;

  return query
    select
      discrepancy.id,
      discrepancy.human_code,
      discrepancy.discrepancy_type,
      discrepancy.status,
      discrepancy.currency_code,
      discrepancy.expected_amount,
      discrepancy.actual_amount,
      discrepancy.difference_amount,
      discrepancy.reason_code,
      discrepancy.reason_details,
      discrepancy.opened_at,
      discrepancy.created_at,
      discrepancy.updated_at,
      discrepancy.resolved_at,
      discrepancy.cancelled_at,
      discrepancy.resolution_notes,
      resolved_user.id,
      resolved_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', resolved_person.first_name, resolved_person.last_name)), ''), ''),
      cancelled_user.id,
      cancelled_user.human_code,
      coalesce(nullif(trim(concat_ws(' ', cancelled_person.first_name, cancelled_person.last_name)), ''), ''),
      remittance.id,
      remittance.human_code,
      remittance.status,
      remittance.declared_amount,
      remittance.verified_amount,
      cash_count.id,
      cash_count.human_code,
      driver.id,
      driver.human_code,
      coalesce(nullif(trim(concat_ws(' ', driver_person.first_name, driver_person.last_name)), ''), ''),
      cash_account.id,
      null::text,
      cash_account.name,
      cash_account.account_type
    from public.cash_discrepancies discrepancy
    join public.cash_accounts cash_account
      on cash_account.id = discrepancy.cash_account_id
    left join public.cash_remittances remittance
      on remittance.id = discrepancy.remittance_id
    left join public.cash_counts cash_count
      on cash_count.id = discrepancy.cash_count_id
    left join public.drivers driver
      on driver.id = remittance.driver_id
    left join public.persons driver_person
      on driver_person.id = driver.person_id
    left join public.app_users resolved_user
      on resolved_user.id = discrepancy.resolved_by
    left join public.persons resolved_person
      on resolved_person.id = resolved_user.person_id
    left join public.app_users cancelled_user
      on cancelled_user.id = discrepancy.cancelled_by
    left join public.persons cancelled_person
      on cancelled_person.id = cancelled_user.person_id
    where discrepancy.id = p_discrepancy_id;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    raise exception 'Cash discrepancy was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.get_admin_cash_discrepancy_detail(uuid) is
  'Returns administrative read-only detail for one cash discrepancy. Requires active superadmin or administrativo context.';

create or replace function public.review_cash_discrepancy(p_discrepancy_id uuid)
returns table(
  discrepancy_id uuid,
  human_code text,
  status text,
  difference_amount numeric(14, 2),
  currency_code text,
  updated_by uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_before public.cash_discrepancies%rowtype;
  v_after public.cash_discrepancies%rowtype;
begin
  v_actor_id := public.require_admin_user();

  if p_discrepancy_id is null then
    raise exception 'Cash discrepancy id is required.'
      using errcode = '23502';
  end if;

  select *
    into v_before
  from public.cash_discrepancies discrepancy
  where discrepancy.id = p_discrepancy_id
  for update;

  if not found then
    raise exception 'Cash discrepancy was not found.'
      using errcode = 'P0002';
  end if;

  if v_before.status <> 'open' then
    raise exception 'Cash discrepancy % cannot start review from status %.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  update public.cash_discrepancies discrepancy
     set status = 'under_review',
         updated_by = v_actor_id
   where discrepancy.id = v_before.id
     and discrepancy.status = 'open'
  returning * into v_after;

  if not found then
    raise exception 'Cash discrepancy % could not start review because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'cash_discrepancies',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Admin cash discrepancy review started.',
    jsonb_build_object(
      'operation', 'admin_cash_discrepancy_review_started',
      'previous_status', v_before.status,
      'difference_amount', v_after.difference_amount,
      'currency_code', v_after.currency_code,
      'remittance_id', v_after.remittance_id,
      'cash_count_id', v_after.cash_count_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      v_after.difference_amount,
      v_after.currency_code,
      v_after.updated_by;
end;
$$;

comment on function public.review_cash_discrepancy(uuid) is
  'Moves an open cash discrepancy to under_review. Requires active superadmin or administrativo context.';

create or replace function public.resolve_cash_discrepancy(
  p_discrepancy_id uuid,
  p_resolution_notes text
)
returns table(
  discrepancy_id uuid,
  human_code text,
  status text,
  difference_amount numeric(14, 2),
  currency_code text,
  resolved_at timestamptz,
  resolved_by uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_notes text;
  v_before public.cash_discrepancies%rowtype;
  v_after public.cash_discrepancies%rowtype;
begin
  v_actor_id := public.require_admin_user();

  if p_discrepancy_id is null then
    raise exception 'Cash discrepancy id is required.'
      using errcode = '23502';
  end if;

  v_notes := trim(coalesce(p_resolution_notes, ''));

  if length(v_notes) = 0 then
    raise exception 'Cash discrepancy resolution notes are required.'
      using errcode = '23514';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Cash discrepancy resolution notes are too long.'
      using errcode = '23514';
  end if;

  select *
    into v_before
  from public.cash_discrepancies discrepancy
  where discrepancy.id = p_discrepancy_id
  for update;

  if not found then
    raise exception 'Cash discrepancy was not found.'
      using errcode = 'P0002';
  end if;

  if v_before.status not in ('open', 'under_review') then
    raise exception 'Cash discrepancy % cannot be resolved from status %.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  update public.cash_discrepancies discrepancy
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = v_actor_id,
         resolution_notes = v_notes,
         updated_by = v_actor_id
   where discrepancy.id = v_before.id
     and discrepancy.status in ('open', 'under_review')
  returning * into v_after;

  if not found then
    raise exception 'Cash discrepancy % could not be resolved because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'cash_discrepancies',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Admin cash discrepancy resolved.',
    jsonb_build_object(
      'operation', 'admin_cash_discrepancy_resolved',
      'previous_status', v_before.status,
      'difference_amount', v_after.difference_amount,
      'currency_code', v_after.currency_code,
      'remittance_id', v_after.remittance_id,
      'cash_count_id', v_after.cash_count_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      v_after.difference_amount,
      v_after.currency_code,
      v_after.resolved_at,
      v_after.resolved_by;
end;
$$;

comment on function public.resolve_cash_discrepancy(uuid, text) is
  'Resolves an open or under_review cash discrepancy without creating cash movements. Requires active superadmin or administrativo context.';

create or replace function public.cancel_cash_discrepancy(
  p_discrepancy_id uuid,
  p_reason text
)
returns table(
  discrepancy_id uuid,
  human_code text,
  status text,
  difference_amount numeric(14, 2),
  currency_code text,
  cancelled_at timestamptz,
  cancelled_by uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_reason text;
  v_before public.cash_discrepancies%rowtype;
  v_after public.cash_discrepancies%rowtype;
begin
  v_actor_id := public.require_superadmin_user();

  if p_discrepancy_id is null then
    raise exception 'Cash discrepancy id is required.'
      using errcode = '23502';
  end if;

  v_reason := trim(coalesce(p_reason, ''));

  if length(v_reason) = 0 then
    raise exception 'Cash discrepancy cancellation reason is required.'
      using errcode = '23514';
  end if;

  if length(v_reason) > 1000 then
    raise exception 'Cash discrepancy cancellation reason is too long.'
      using errcode = '23514';
  end if;

  select *
    into v_before
  from public.cash_discrepancies discrepancy
  where discrepancy.id = p_discrepancy_id
  for update;

  if not found then
    raise exception 'Cash discrepancy was not found.'
      using errcode = 'P0002';
  end if;

  if v_before.status not in ('open', 'under_review') then
    raise exception 'Cash discrepancy % cannot be cancelled from status %.', v_before.human_code, v_before.status
      using errcode = '23514';
  end if;

  update public.cash_discrepancies discrepancy
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_actor_id,
         resolution_notes = v_reason,
         updated_by = v_actor_id
   where discrepancy.id = v_before.id
     and discrepancy.status in ('open', 'under_review')
  returning * into v_after;

  if not found then
    raise exception 'Cash discrepancy % could not be cancelled because its status changed concurrently.', v_before.human_code
      using errcode = '40001';
  end if;

  perform public.secure_audit(
    'status_change',
    'cash_discrepancies',
    v_after.id,
    v_after.human_code,
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Admin cash discrepancy cancelled.',
    jsonb_build_object(
      'operation', 'admin_cash_discrepancy_cancelled',
      'previous_status', v_before.status,
      'cancellation_reason', v_reason,
      'difference_amount', v_after.difference_amount,
      'currency_code', v_after.currency_code,
      'remittance_id', v_after.remittance_id,
      'cash_count_id', v_after.cash_count_id
    ),
    v_actor_id,
    null
  );

  return query
    select
      v_after.id,
      v_after.human_code,
      v_after.status,
      v_after.difference_amount,
      v_after.currency_code,
      v_after.cancelled_at,
      v_after.cancelled_by;
end;
$$;

comment on function public.cancel_cash_discrepancy(uuid, text) is
  'Cancels an open or under_review cash discrepancy without creating cash movements. Requires active superadmin context.';

revoke all on function public.get_admin_cash_discrepancies(text, text, uuid, text, integer, integer) from public;
revoke all on function public.get_admin_cash_discrepancies(text, text, uuid, text, integer, integer) from anon;
revoke all on function public.get_admin_cash_discrepancies(text, text, uuid, text, integer, integer) from authenticated;
revoke all on function public.get_admin_cash_discrepancies(text, text, uuid, text, integer, integer) from service_role;

revoke all on function public.get_admin_cash_discrepancy_detail(uuid) from public;
revoke all on function public.get_admin_cash_discrepancy_detail(uuid) from anon;
revoke all on function public.get_admin_cash_discrepancy_detail(uuid) from authenticated;
revoke all on function public.get_admin_cash_discrepancy_detail(uuid) from service_role;

revoke all on function public.review_cash_discrepancy(uuid) from public;
revoke all on function public.review_cash_discrepancy(uuid) from anon;
revoke all on function public.review_cash_discrepancy(uuid) from authenticated;
revoke all on function public.review_cash_discrepancy(uuid) from service_role;

revoke all on function public.resolve_cash_discrepancy(uuid, text) from public;
revoke all on function public.resolve_cash_discrepancy(uuid, text) from anon;
revoke all on function public.resolve_cash_discrepancy(uuid, text) from authenticated;
revoke all on function public.resolve_cash_discrepancy(uuid, text) from service_role;

revoke all on function public.cancel_cash_discrepancy(uuid, text) from public;
revoke all on function public.cancel_cash_discrepancy(uuid, text) from anon;
revoke all on function public.cancel_cash_discrepancy(uuid, text) from authenticated;
revoke all on function public.cancel_cash_discrepancy(uuid, text) from service_role;

grant execute on function public.get_admin_cash_discrepancies(text, text, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_admin_cash_discrepancy_detail(uuid) to authenticated;
grant execute on function public.review_cash_discrepancy(uuid) to authenticated;
grant execute on function public.resolve_cash_discrepancy(uuid, text) to authenticated;
grant execute on function public.cancel_cash_discrepancy(uuid, text) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.get_admin_cash_discrepancies(text,text,uuid,text,integer,integer)'::regprocedure,
    'public.get_admin_cash_discrepancy_detail(uuid)'::regprocedure,
    'public.review_cash_discrepancy(uuid)'::regprocedure,
    'public.resolve_cash_discrepancy(uuid,text)'::regprocedure,
    'public.cancel_cash_discrepancy(uuid,text)'::regprocedure
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