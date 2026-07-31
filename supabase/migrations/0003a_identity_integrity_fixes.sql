-- ELARA Transport V4.0
-- Migration 0003a: identity integrity fixes.
--
-- Corrective migration after QA 0003.
-- Previous migrations are intentionally left unchanged.

do $$
begin
  if exists (
    select 1
    from public.app_sessions app_session
    left join public.app_users app_user
      on app_user.id = app_session.app_user_id
      and app_user.auth_user_id = app_session.auth_user_id
    where app_user.id is null
  ) then
    raise exception 'Cannot add composite app_sessions FK: inconsistent auth_user_id/app_user_id rows exist.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_id_auth_user_id_unique'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_id_auth_user_id_unique
      unique (id, auth_user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_sessions_app_user_auth_user_fkey'
      and conrelid = 'public.app_sessions'::regclass
  ) then
    alter table public.app_sessions
      add constraint app_sessions_app_user_auth_user_fkey
      foreign key (app_user_id, auth_user_id)
      references public.app_users (id, auth_user_id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.validate_app_user_default_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_user_id uuid;
  v_default_context text;
  v_user_status text;
begin
  if tg_table_name = 'app_users' then
    v_app_user_id := new.id;
  elsif tg_table_name = 'user_roles' then
    if tg_op = 'DELETE' then
      v_app_user_id := old.user_id;
    else
      v_app_user_id := new.user_id;
    end if;
  end if;

  if v_app_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  select app_user.default_context, app_user.status
  into v_default_context, v_user_status
  from public.app_users app_user
  where app_user.id = v_app_user_id;

  if not found or v_user_status <> 'active' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if not public.user_has_active_role(v_app_user_id, v_default_context) then
    raise exception 'The default_context "%" is not an active role for this app user.', v_default_context
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.validate_app_user_default_context() is
  'Deferred integrity trigger that requires active app users to have default_context in active roles.';

create or replace function public.validate_app_session_active_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_user_id uuid;
begin
  if tg_table_name = 'app_sessions' then
    if new.ended_at is not null then
      return new;
    end if;

    if not exists (
      select 1
      from public.app_sessions app_session
      join public.app_users app_user
        on app_user.id = app_session.app_user_id
        and app_user.auth_user_id = app_session.auth_user_id
      where app_session.id = new.id
        and app_session.ended_at is null
        and app_user.status = 'active'
        and public.user_has_active_role(app_user.id, app_session.active_context)
    ) then
      raise exception 'The active_context "%" is not valid for this active app session.', new.active_context
        using errcode = '23514';
    end if;

    return new;
  elsif tg_table_name = 'app_users' then
    if tg_op = 'DELETE' then
      v_app_user_id := old.id;
    else
      v_app_user_id := new.id;
    end if;
  elsif tg_table_name = 'user_roles' then
    if tg_op = 'DELETE' then
      v_app_user_id := old.user_id;
    else
      v_app_user_id := new.user_id;
    end if;
  end if;

  if v_app_user_id is not null and exists (
    select 1
    from public.app_sessions app_session
    join public.app_users app_user
      on app_user.id = app_session.app_user_id
      and app_user.auth_user_id = app_session.auth_user_id
    where app_session.app_user_id = v_app_user_id
      and app_session.ended_at is null
      and (
        app_user.status <> 'active'
        or not public.user_has_active_role(app_user.id, app_session.active_context)
      )
  ) then
    raise exception 'Active app sessions must reference an active user and an active role context.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.validate_app_session_active_context() is
  'Deferred integrity trigger that validates active app_sessions against app_users and user_roles.';

create or replace function public.prevent_last_superadmin_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_check boolean := false;
  v_active_superadmins integer;
begin
  if tg_table_name = 'user_roles' then
    if tg_op = 'DELETE' then
      v_should_check :=
        old.role_key = 'superadmin'
        and old.status = 'active'
        and old.starts_at <= now()
        and (old.ends_at is null or old.ends_at > now())
        and exists (
          select 1
          from public.app_users app_user
          where app_user.id = old.user_id
            and app_user.status = 'active'
        );
    elsif tg_op = 'UPDATE' then
      v_should_check :=
        old.role_key = 'superadmin'
        and old.status = 'active'
        and old.starts_at <= now()
        and (old.ends_at is null or old.ends_at > now())
        and exists (
          select 1
          from public.app_users app_user
          where app_user.id = old.user_id
            and app_user.status = 'active'
        )
        and not (
          new.role_key = 'superadmin'
          and new.status = 'active'
          and new.starts_at <= now()
          and (new.ends_at is null or new.ends_at > now())
          and exists (
            select 1
            from public.app_users app_user
            where app_user.id = new.user_id
              and app_user.status = 'active'
          )
        );
    end if;
  elsif tg_table_name = 'app_users' then
    if tg_op = 'DELETE' then
      v_should_check :=
        old.status = 'active'
        and exists (
          select 1
          from public.user_roles user_role
          where user_role.user_id = old.id
            and user_role.role_key = 'superadmin'
            and user_role.status = 'active'
            and user_role.starts_at <= now()
            and (user_role.ends_at is null or user_role.ends_at > now())
        );
    elsif tg_op = 'UPDATE' then
      v_should_check :=
        old.status = 'active'
        and new.status <> 'active'
        and exists (
          select 1
          from public.user_roles user_role
          where user_role.user_id = old.id
            and user_role.role_key = 'superadmin'
            and user_role.status = 'active'
            and user_role.starts_at <= now()
            and (user_role.ends_at is null or user_role.ends_at > now())
        );
    end if;
  end if;

  if not v_should_check then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  perform pg_advisory_xact_lock(451004, 3003);

  select count(distinct app_user.id)
  into v_active_superadmins
  from public.app_users app_user
  join public.user_roles user_role
    on user_role.user_id = app_user.id
  join public.roles role_record
    on role_record.key = user_role.role_key
  where app_user.status = 'active'
    and user_role.role_key = 'superadmin'
    and user_role.status = 'active'
    and user_role.starts_at <= now()
    and (user_role.ends_at is null or user_role.ends_at > now())
    and role_record.is_active = true;

  if v_active_superadmins = 0 then
    raise exception 'At least one active Superadmin is required.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.prevent_last_superadmin_loss() is
  'Transactional guard that prevents the last active Superadmin from being revoked or inactivated.';

drop trigger if exists protect_last_superadmin_on_user_roles on public.user_roles;
create trigger protect_last_superadmin_on_user_roles
after update or delete on public.user_roles
for each row
execute function public.prevent_last_superadmin_loss();

drop trigger if exists protect_last_superadmin_on_app_users on public.app_users;
create trigger protect_last_superadmin_on_app_users
after update or delete on public.app_users
for each row
execute function public.prevent_last_superadmin_loss();

drop trigger if exists validate_app_users_default_context on public.app_users;
create constraint trigger validate_app_users_default_context
after insert or update on public.app_users
deferrable initially deferred
for each row
execute function public.validate_app_user_default_context();

drop trigger if exists validate_user_roles_default_context on public.user_roles;
create constraint trigger validate_user_roles_default_context
after insert or update or delete on public.user_roles
deferrable initially deferred
for each row
execute function public.validate_app_user_default_context();

drop trigger if exists validate_app_sessions_active_context on public.app_sessions;
create constraint trigger validate_app_sessions_active_context
after insert or update on public.app_sessions
deferrable initially deferred
for each row
execute function public.validate_app_session_active_context();

drop trigger if exists validate_app_users_active_sessions_context on public.app_users;
create constraint trigger validate_app_users_active_sessions_context
after update on public.app_users
deferrable initially deferred
for each row
execute function public.validate_app_session_active_context();

drop trigger if exists validate_user_roles_active_sessions_context on public.user_roles;
create constraint trigger validate_user_roles_active_sessions_context
after insert or update or delete on public.user_roles
deferrable initially deferred
for each row
execute function public.validate_app_session_active_context();

revoke all on function public.validate_app_user_default_context() from public;
revoke all on function public.validate_app_session_active_context() from public;
revoke all on function public.prevent_last_superadmin_loss() from public;

revoke execute on function public.validate_app_user_default_context() from anon;
revoke execute on function public.validate_app_session_active_context() from anon;
revoke execute on function public.prevent_last_superadmin_loss() from anon;

revoke execute on function public.validate_app_user_default_context() from authenticated;
revoke execute on function public.validate_app_session_active_context() from authenticated;
revoke execute on function public.prevent_last_superadmin_loss() from authenticated;

do $$
declare
  missing_triggers text[];
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_id_auth_user_id_unique'
      and conrelid = 'public.app_users'::regclass
  ) then
    raise exception 'Missing unique constraint app_users_id_auth_user_id_unique.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_sessions_app_user_auth_user_fkey'
      and conrelid = 'public.app_sessions'::regclass
  ) then
    raise exception 'Missing composite FK app_sessions_app_user_auth_user_fkey.';
  end if;

  if exists (
    select 1
    from public.app_sessions app_session
    left join public.app_users app_user
      on app_user.id = app_session.app_user_id
      and app_user.auth_user_id = app_session.auth_user_id
    where app_user.id is null
  ) then
    raise exception 'Inconsistent app_sessions rows remain after composite FK installation.';
  end if;

  if to_regprocedure('public.validate_app_user_default_context()') is null then
    raise exception 'Missing function public.validate_app_user_default_context().';
  end if;

  if to_regprocedure('public.validate_app_session_active_context()') is null then
    raise exception 'Missing function public.validate_app_session_active_context().';
  end if;

  if to_regprocedure('public.prevent_last_superadmin_loss()') is null then
    raise exception 'Missing function public.prevent_last_superadmin_loss().';
  end if;

  with expected(trigger_name) as (
    values
      ('protect_last_superadmin_on_user_roles'),
      ('protect_last_superadmin_on_app_users'),
      ('validate_app_users_default_context'),
      ('validate_user_roles_default_context'),
      ('validate_app_sessions_active_context'),
      ('validate_app_users_active_sessions_context'),
      ('validate_user_roles_active_sessions_context')
  )
  select array_agg(expected.trigger_name order by expected.trigger_name)
  into missing_triggers
  from expected
  where not exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgname = expected.trigger_name
      and trigger_record.tgisinternal = false
  );

  if missing_triggers is not null then
    raise exception 'Missing identity integrity triggers: %.', missing_triggers;
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.next_human_code(text).';
  end if;

  if has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE') then
    raise exception 'authenticated must not be able to execute public.next_human_code(text).';
  end if;

  perform public.current_app_user_id();
end;
$$;
