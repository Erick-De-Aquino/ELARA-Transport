-- Migration 0031: end current app session RPC.
--
-- Allows an authenticated user to explicitly end only the public.app_sessions
-- row that belongs to the current Supabase Auth session. The caller cannot pass
-- auth_user_id, app_user_id or session ids.

create or replace function public.end_current_app_session()
returns table(
  app_session_id uuid,
  ended_at timestamptz,
  session_was_ended boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_session_id uuid;
  v_app_session public.app_sessions%rowtype;
begin
  v_auth_user_id := auth.uid();

  if v_auth_user_id is null then
    raise exception 'Authentication is required to end the current application session.'
      using errcode = '28000';
  end if;

  v_session_id := public.current_auth_session_id();

  if v_session_id is null then
    raise exception 'A valid Supabase session_id claim is required to end the current application session.'
      using errcode = '28000';
  end if;

  select *
    into v_app_session
  from public.app_sessions app_session
  where app_session.auth_user_id = v_auth_user_id
    and app_session.supabase_session_id = v_session_id
  for update;

  if v_app_session.id is null then
    raise exception 'Current application session was not found.'
      using errcode = '28000';
  end if;

  if v_app_session.ended_at is null then
    update public.app_sessions app_session
       set ended_at = now(),
           ended_reason = 'logout',
           last_seen_at = now()
     where app_session.id = v_app_session.id
       and app_session.auth_user_id = v_auth_user_id
       and app_session.supabase_session_id = v_session_id
       and app_session.ended_at is null
    returning *
      into v_app_session;

    session_was_ended := true;
  else
    session_was_ended := false;
  end if;

  app_session_id := v_app_session.id;
  ended_at := v_app_session.ended_at;

  return next;
end;
$$;

comment on function public.end_current_app_session() is
  'Ends the current public.app_sessions row derived from auth.uid() and the verified Supabase JWT session_id claim.';

revoke all on function public.end_current_app_session() from public;
revoke all on function public.end_current_app_session() from anon;
revoke all on function public.end_current_app_session() from authenticated;
revoke all on function public.end_current_app_session() from service_role;

grant execute on function public.end_current_app_session() to authenticated;

do $$
begin
  if to_regprocedure('public.end_current_app_session()') is null then
    raise exception 'Missing function public.end_current_app_session().';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = 'public.end_current_app_session()'::regprocedure
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute public.end_current_app_session().';
  end if;

  if has_function_privilege('anon', 'public.end_current_app_session()', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.end_current_app_session().';
  end if;

  if not has_function_privilege('authenticated', 'public.end_current_app_session()', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.end_current_app_session().';
  end if;

  if has_function_privilege('service_role', 'public.end_current_app_session()', 'EXECUTE') then
    raise exception 'service_role must not execute public.end_current_app_session().';
  end if;
end;
$$;
