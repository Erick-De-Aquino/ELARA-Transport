-- ELARA Transport V4.0
-- Migration 0017: app session bootstrap.
--
-- Creates the authenticated RPC that initializes public.app_sessions from the
-- verified Supabase Auth JWT. The caller cannot pass auth_user_id, app_user_id,
-- session_id or actor ids.

create or replace function public.initialize_app_session(
  p_requested_context text default null
)
returns table(
  app_session_id uuid,
  app_user_id uuid,
  active_context text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_session_id uuid;
  v_jwt_exp_text text;
  v_expires_at timestamptz;
  v_app_user_id uuid;
  v_default_context text;
  v_existing_session public.app_sessions%rowtype;
  v_context text;
  v_active_role_count integer;
begin
  v_auth_user_id := auth.uid();

  if v_auth_user_id is null then
    raise exception 'Authentication is required to initialize an application session.'
      using errcode = '28000';
  end if;

  v_session_id := public.current_auth_session_id();

  if v_session_id is null then
    raise exception 'A valid Supabase session_id claim is required to initialize an application session.'
      using errcode = '28000';
  end if;

  v_jwt_exp_text := nullif(auth.jwt() ->> 'exp', '');

  if v_jwt_exp_text is null then
    raise exception 'A valid Supabase exp claim is required to initialize an application session.'
      using errcode = '28000';
  end if;

  begin
    v_expires_at := to_timestamp(v_jwt_exp_text::double precision);
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'The Supabase exp claim is not a valid timestamp.'
        using errcode = '28000';
  end;

  if v_expires_at <= now() then
    raise exception 'The Supabase access token is expired.'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from auth.sessions auth_session
    where auth_session.id = v_session_id
      and auth_session.user_id = v_auth_user_id
  ) then
    raise exception 'Authenticated Supabase session was not found.'
      using errcode = '28000';
  end if;

  select app_user.id, app_user.default_context
    into v_app_user_id, v_default_context
  from public.app_users app_user
  where app_user.auth_user_id = v_auth_user_id
    and app_user.status = 'active';

  if v_app_user_id is null then
    if exists (
      select 1
      from public.app_users app_user
      where app_user.auth_user_id = v_auth_user_id
    ) then
      raise exception 'The application user for this authenticated account is inactive.'
        using errcode = '28000';
    end if;

    raise exception 'No active application user exists for this authenticated account.'
      using errcode = '28000';
  end if;

  select count(*)
    into v_active_role_count
  from public.user_roles user_role
  join public.roles role_record
    on role_record.key = user_role.role_key
  where user_role.user_id = v_app_user_id
    and user_role.status = 'active'
    and user_role.starts_at <= now()
    and (user_role.ends_at is null or user_role.ends_at > now())
    and role_record.is_active = true;

  if v_active_role_count = 0 then
    raise exception 'The application user has no active role.'
      using errcode = '42501';
  end if;

  if v_default_context is null
    or length(trim(v_default_context)) = 0
    or not public.user_has_active_role(v_app_user_id, v_default_context)
  then
    raise exception 'The application user default_context is not an active role.'
      using errcode = '23514';
  end if;

  if p_requested_context is null then
    v_context := lower(trim(v_default_context));
  else
    v_context := lower(trim(p_requested_context));

    if length(v_context) = 0 then
      raise exception 'Requested active_context cannot be empty.'
        using errcode = '23514';
    end if;

    if v_context not in ('superadmin', 'administrativo', 'conductor') then
      raise exception 'Requested active_context is not valid.'
        using errcode = '23514';
    end if;

    if not public.user_has_active_role(v_app_user_id, v_context) then
      raise exception 'Requested active_context is not assigned to the active application user.'
        using errcode = '42501';
    end if;
  end if;

  select *
    into v_existing_session
  from public.app_sessions app_session
  where app_session.supabase_session_id = v_session_id
  for update;

  if found then
    if v_existing_session.auth_user_id <> v_auth_user_id
      or v_existing_session.app_user_id <> v_app_user_id
    then
      raise exception 'Supabase session_id collision detected for a different application user.'
        using errcode = '23505';
    end if;

    if v_existing_session.ended_at is not null then
      raise exception 'Current application session has already been ended.'
        using errcode = '28000';
    end if;

    if p_requested_context is null then
      v_context := lower(trim(v_existing_session.active_context));

      if not public.user_has_active_role(v_app_user_id, v_context) then
        raise exception 'Current application session active_context is no longer an active role.'
          using errcode = '42501';
      end if;
    end if;

    update public.app_sessions app_session
       set active_context = v_context,
           expires_at = greatest(app_session.expires_at, v_expires_at),
           last_seen_at = now()
     where app_session.id = v_existing_session.id
    returning app_session.id, app_session.app_user_id, app_session.active_context
      into app_session_id, app_user_id, active_context;
  else
    insert into public.app_sessions as app_session (
      auth_user_id,
      app_user_id,
      supabase_session_id,
      active_context,
      expires_at,
      last_seen_at
    ) values (
      v_auth_user_id,
      v_app_user_id,
      v_session_id,
      v_context,
      v_expires_at,
      now()
    )
    returning app_session.id, app_session.app_user_id, app_session.active_context
      into app_session_id, app_user_id, active_context;
  end if;

  return next;
end;
$$;

comment on function public.initialize_app_session(text) is
  'Initializes the current authenticated application session from auth.uid() and the verified Supabase JWT session_id claim.';

revoke all on function public.initialize_app_session(text) from public;
revoke all on function public.initialize_app_session(text) from anon;
revoke all on function public.initialize_app_session(text) from authenticated;
revoke all on function public.initialize_app_session(text) from service_role;

grant execute on function public.initialize_app_session(text) to authenticated;

do $$
begin
  if to_regprocedure('public.initialize_app_session(text)') is null then
    raise exception 'Missing function public.initialize_app_session(text).';
  end if;

  if has_function_privilege('anon', 'public.initialize_app_session(text)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.initialize_app_session(text).';
  end if;

  if not has_function_privilege('authenticated', 'public.initialize_app_session(text)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.initialize_app_session(text).';
  end if;

  if has_function_privilege('service_role', 'public.initialize_app_session(text)', 'EXECUTE') then
    raise exception 'service_role must not execute public.initialize_app_session(text).';
  end if;
end;
$$;
