-- Migration 0028: driver profile update RPCs.
--
-- Allows an authenticated conductor to update only their own availability
-- preference and contact phone through trusted backend functions.

create or replace function public.update_current_driver_availability(
  p_availability text
)
returns table(
  driver_id uuid,
  availability_preference text,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_availability text;
  v_old_driver public.drivers%rowtype;
  v_driver public.drivers%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();
  v_app_user_id := public.rls_current_app_user_id();

  if v_driver_id is null or v_app_user_id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  v_availability := lower(trim(coalesce(p_availability, '')));

  if v_availability not in ('available', 'unavailable') then
    raise exception 'Invalid driver availability preference.'
      using errcode = '23514';
  end if;

  select *
    into v_old_driver
  from public.drivers d
  where d.id = v_driver_id
  for update;

  if v_old_driver.id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  if v_old_driver.availability_preference is not distinct from v_availability then
    return query
      select
        v_old_driver.id,
        v_old_driver.availability_preference,
        v_old_driver.updated_at;
    return;
  end if;

  update public.drivers d
  set
    availability_preference = v_availability,
    updated_by = v_app_user_id
  where d.id = v_old_driver.id
  returning * into v_driver;

  perform public.secure_audit(
    'update',
    'drivers',
    v_driver.id,
    v_driver.human_code,
    to_jsonb(v_old_driver),
    to_jsonb(v_driver),
    'Driver updated own availability preference.',
    jsonb_build_object(
      'operation', 'driver_availability_updated',
      'availability_preference', v_driver.availability_preference
    ),
    v_app_user_id,
    v_driver_id
  );

  return query
    select
      v_driver.id,
      v_driver.availability_preference,
      v_driver.updated_at;
end;
$$;

comment on function public.update_current_driver_availability(text) is
  'Updates availability_preference for the authenticated conductor without trusting driver ids from the client.';

revoke all on function public.update_current_driver_availability(text) from public;
revoke all on function public.update_current_driver_availability(text) from anon;
revoke all on function public.update_current_driver_availability(text) from authenticated;
revoke all on function public.update_current_driver_availability(text) from service_role;

grant execute on function public.update_current_driver_availability(text) to authenticated;

create or replace function public.update_current_driver_phone(
  p_phone text
)
returns table(
  driver_id uuid,
  person_id uuid,
  phone text,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_phone text;
  v_driver public.drivers%rowtype;
  v_old_person public.persons%rowtype;
  v_person public.persons%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();
  v_app_user_id := public.rls_current_app_user_id();

  if v_driver_id is null or v_app_user_id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');

  if v_phone is not null and length(v_phone) > 50 then
    raise exception 'Driver phone cannot exceed 50 characters.'
      using errcode = '23514';
  end if;

  if v_phone is not null and v_phone ~ '[[:cntrl:]]' then
    raise exception 'Driver phone contains invalid characters.'
      using errcode = '23514';
  end if;

  select *
    into v_driver
  from public.drivers d
  where d.id = v_driver_id
  for update;

  if v_driver.id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  select *
    into v_old_person
  from public.persons p
  where p.id = v_driver.person_id
  for update;

  if v_old_person.id is null then
    raise exception 'A valid conductor active context is required.'
      using errcode = '42501';
  end if;

  if v_old_person.phone is not distinct from v_phone then
    return query
      select
        v_driver.id,
        v_old_person.id,
        v_old_person.phone,
        v_old_person.updated_at;
    return;
  end if;

  update public.persons p
  set
    phone = v_phone,
    updated_by = v_app_user_id
  where p.id = v_old_person.id
  returning * into v_person;

  perform public.secure_audit(
    'update',
    'persons',
    v_person.id,
    null,
    to_jsonb(v_old_person),
    to_jsonb(v_person),
    'Driver updated own phone.',
    jsonb_build_object('operation', 'driver_phone_updated'),
    v_app_user_id,
    v_driver_id
  );

  return query
    select
      v_driver.id,
      v_person.id,
      v_person.phone,
      v_person.updated_at;
end;
$$;

comment on function public.update_current_driver_phone(text) is
  'Updates phone for the authenticated conductor person without trusting driver, person or user ids from the client.';

revoke all on function public.update_current_driver_phone(text) from public;
revoke all on function public.update_current_driver_phone(text) from anon;
revoke all on function public.update_current_driver_phone(text) from authenticated;
revoke all on function public.update_current_driver_phone(text) from service_role;

grant execute on function public.update_current_driver_phone(text) to authenticated;

do $$
begin
  if to_regprocedure('public.update_current_driver_availability(text)') is null then
    raise exception 'Missing function public.update_current_driver_availability(text).';
  end if;

  if to_regprocedure('public.update_current_driver_phone(text)') is null then
    raise exception 'Missing function public.update_current_driver_phone(text).';
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('update_current_driver_availability', 'update_current_driver_phone')
      and grantee in ('PUBLIC', 'anon', 'service_role')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'Driver profile update RPCs must not be executable by PUBLIC, anon or service_role.';
  end if;

  if not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'update_current_driver_availability'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'Authenticated execute grant is missing for public.update_current_driver_availability(text).';
  end if;

  if not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'update_current_driver_phone'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'Authenticated execute grant is missing for public.update_current_driver_phone(text).';
  end if;
end;
$$;
