-- ELARA Transport V4.0
-- Migration 0003: identity, roles and sessions.
--
-- Auth credentials live only in auth.users.
-- Public tables store functional identity, roles and active context by session.

create table if not exists public.persons (
  id uuid primary key default extensions.gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  contact_email text,
  phone text,
  country_code text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  created_by uuid,
  updated_by uuid,
  inactive_by uuid,

  constraint persons_first_name_not_empty
    check (length(trim(first_name)) > 0),
  constraint persons_last_name_not_empty
    check (length(trim(last_name)) > 0),
  constraint persons_status_check
    check (status in ('active', 'inactive')),
  constraint persons_inactive_at_required_when_inactive
    check (status <> 'inactive' or inactive_at is not null)
);

comment on table public.persons is
  'Central human identity. Full names are derived from first_name and last_name.';

create table if not exists public.app_users (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null,
  person_id uuid not null,
  human_code text not null default public.next_human_code('USR'),
  status text not null default 'active',
  default_context text not null,
  last_access_at timestamptz,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  created_by uuid,
  updated_by uuid,
  inactive_by uuid,

  constraint app_users_auth_user_id_unique
    unique (auth_user_id),
  constraint app_users_person_id_unique
    unique (person_id),
  constraint app_users_human_code_unique
    unique (human_code),
  constraint app_users_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users(id)
    on delete restrict,
  constraint app_users_person_id_fkey
    foreign key (person_id)
    references public.persons(id)
    on delete restrict,
  constraint app_users_human_code_format
    check (human_code ~ '^USR-[0-9]{6}$'),
  constraint app_users_status_check
    check (status in ('active', 'inactive')),
  constraint app_users_default_context_check
    check (default_context in ('superadmin', 'administrativo', 'conductor')),
  constraint app_users_inactive_at_required_when_inactive
    check (status <> 'inactive' or inactive_at is not null)
);

comment on table public.app_users is
  'Functional ELARA application user linked to auth.users and persons.';

create table if not exists public.roles (
  key text primary key,
  label_es text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,

  constraint roles_key_format
    check (key = lower(trim(key)) and key ~ '^[a-z][a-z_]*$'),
  constraint roles_label_es_not_empty
    check (length(trim(label_es)) > 0)
);

comment on table public.roles is
  'Technical role catalog. Effective permissions depend on the active context, not role accumulation.';

create table if not exists public.user_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null,
  role_key text not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by uuid,
  revoked_by uuid,
  revoked_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),

  constraint user_roles_user_id_fkey
    foreign key (user_id)
    references public.app_users(id)
    on delete restrict,
  constraint user_roles_role_key_fkey
    foreign key (role_key)
    references public.roles(key)
    on update cascade
    on delete restrict,
  constraint user_roles_assigned_by_fkey
    foreign key (assigned_by)
    references public.app_users(id)
    on delete restrict,
  constraint user_roles_revoked_by_fkey
    foreign key (revoked_by)
    references public.app_users(id)
    on delete restrict,
  constraint user_roles_status_check
    check (status in ('active', 'revoked')),
  constraint user_roles_revoked_fields_required
    check (status <> 'revoked' or (revoked_at is not null and ends_at is not null)),
  constraint user_roles_starts_before_ends
    check (ends_at is null or starts_at <= ends_at)
);

comment on table public.user_roles is
  'Active and historical role assignments for app users.';

create unique index if not exists user_roles_one_active_per_user_role_idx
  on public.user_roles (user_id, role_key)
  where status = 'active';

create index if not exists user_roles_active_lookup_idx
  on public.user_roles (user_id, role_key, starts_at, ends_at)
  where status = 'active';

create table if not exists public.app_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null,
  app_user_id uuid not null,
  supabase_session_id uuid not null,
  active_context text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  last_seen_at timestamptz,
  device_label text,
  ip_hash text,
  user_agent_hash text,
  ended_reason text,

  constraint app_sessions_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users(id)
    on delete restrict,
  constraint app_sessions_app_user_id_fkey
    foreign key (app_user_id)
    references public.app_users(id)
    on delete restrict,
  constraint app_sessions_supabase_session_id_unique
    unique (supabase_session_id),
  constraint app_sessions_active_context_check
    check (active_context in ('superadmin', 'administrativo', 'conductor')),
  constraint app_sessions_expires_after_created
    check (expires_at > created_at),
  constraint app_sessions_ended_after_created
    check (ended_at is null or ended_at >= created_at),
  constraint app_sessions_last_seen_after_created
    check (last_seen_at is null or last_seen_at >= created_at),
  constraint app_sessions_ended_reason_requires_ended_at
    check (ended_reason is null or ended_at is not null)
);

comment on table public.app_sessions is
  'Application session state. active_context is scoped to one Supabase session.';

create index if not exists app_sessions_active_lookup_idx
  on public.app_sessions (auth_user_id, supabase_session_id)
  where ended_at is null;

drop trigger if exists set_persons_updated_at on public.persons;
create trigger set_persons_updated_at
before update on public.persons
for each row
execute function public.set_updated_at();

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

drop trigger if exists set_roles_updated_at on public.roles;
create trigger set_roles_updated_at
before update on public.roles
for each row
execute function public.set_updated_at();

drop trigger if exists set_app_sessions_updated_at on public.app_sessions;
create trigger set_app_sessions_updated_at
before update on public.app_sessions
for each row
execute function public.set_updated_at();

insert into public.roles (key, label_es, is_active)
values
  ('superadmin', 'Superadmin', true),
  ('administrativo', 'Administrativo', true),
  ('conductor', 'Conductor', true)
on conflict (key) do nothing;

create or replace function public.user_has_active_role(
  p_app_user_id uuid,
  p_role_key text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_role_key text;
begin
  v_role_key := lower(trim(coalesce(p_role_key, '')));

  if p_app_user_id is null or v_role_key = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.app_users app_user
    join public.user_roles user_role
      on user_role.user_id = app_user.id
    join public.roles role_record
      on role_record.key = user_role.role_key
    where app_user.id = p_app_user_id
      and app_user.status = 'active'
      and user_role.role_key = v_role_key
      and user_role.status = 'active'
      and user_role.starts_at <= now()
      and (user_role.ends_at is null or user_role.ends_at > now())
      and role_record.is_active = true
  );
end;
$$;

comment on function public.user_has_active_role(uuid, text) is
  'Returns true when an active app user currently holds the requested active role.';

create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_app_user_id uuid;
begin
  v_auth_user_id := auth.uid();

  if v_auth_user_id is null then
    return null;
  end if;

  select app_user.id
  into v_app_user_id
  from public.app_users app_user
  where app_user.auth_user_id = v_auth_user_id
    and app_user.status = 'active'
  limit 1;

  return v_app_user_id;
end;
$$;

comment on function public.current_app_user_id() is
  'Resolves the active ELARA app user for auth.uid(), returning null when absent or inactive.';

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

  lock table public.app_users in share row exclusive mode;
  lock table public.user_roles in share row exclusive mode;

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
  'Transactional guard that prevents revoking or inactivating the last active Superadmin.';

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

revoke all on table public.persons from public;
revoke all on table public.app_users from public;
revoke all on table public.roles from public;
revoke all on table public.user_roles from public;
revoke all on table public.app_sessions from public;

revoke all on table public.persons from anon;
revoke all on table public.app_users from anon;
revoke all on table public.roles from anon;
revoke all on table public.user_roles from anon;
revoke all on table public.app_sessions from anon;

revoke all on table public.persons from authenticated;
revoke all on table public.app_users from authenticated;
revoke all on table public.roles from authenticated;
revoke all on table public.user_roles from authenticated;
revoke all on table public.app_sessions from authenticated;

revoke all on function public.user_has_active_role(uuid, text) from public;
revoke all on function public.current_app_user_id() from public;
revoke all on function public.prevent_last_superadmin_loss() from public;

revoke execute on function public.user_has_active_role(uuid, text) from anon;
revoke execute on function public.current_app_user_id() from anon;
revoke execute on function public.prevent_last_superadmin_loss() from anon;

revoke execute on function public.user_has_active_role(uuid, text) from authenticated;
revoke execute on function public.current_app_user_id() from authenticated;
revoke execute on function public.prevent_last_superadmin_loss() from authenticated;

grant select, insert, update, delete on table public.persons to service_role;
grant select, insert, update, delete on table public.app_users to service_role;
grant select, insert, update, delete on table public.roles to service_role;
grant select, insert, update, delete on table public.user_roles to service_role;
grant select, insert, update, delete on table public.app_sessions to service_role;

grant execute on function public.user_has_active_role(uuid, text) to service_role;
grant execute on function public.current_app_user_id() to service_role;

do $$
declare
  missing_tables text[];
  missing_roles text[];
  missing_triggers text[];
  duplicate_count integer;
begin
  with expected(table_name) as (
    values
      ('persons'),
      ('app_users'),
      ('roles'),
      ('user_roles'),
      ('app_sessions')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into missing_tables
  from expected
  where to_regclass('public.' || expected.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing identity tables: %.', missing_tables;
  end if;

  with expected(role_key) as (
    values ('superadmin'), ('administrativo'), ('conductor')
  )
  select array_agg(expected.role_key order by expected.role_key)
  into missing_roles
  from expected
  where not exists (
    select 1
    from public.roles role_record
    where role_record.key = expected.role_key
  );

  if missing_roles is not null then
    raise exception 'Missing initial roles: %.', missing_roles;
  end if;

  if to_regclass('public.app_users_auth_user_id_unique') is null then
    raise exception 'Missing unique constraint/index app_users_auth_user_id_unique.';
  end if;

  if to_regclass('public.app_users_person_id_unique') is null then
    raise exception 'Missing unique constraint/index app_users_person_id_unique.';
  end if;

  if to_regclass('public.app_users_human_code_unique') is null then
    raise exception 'Missing unique constraint/index app_users_human_code_unique.';
  end if;

  if to_regclass('public.user_roles_one_active_per_user_role_idx') is null then
    raise exception 'Missing unique index user_roles_one_active_per_user_role_idx.';
  end if;

  if to_regclass('public.app_sessions_supabase_session_id_unique') is null then
    raise exception 'Missing unique constraint/index app_sessions_supabase_session_id_unique.';
  end if;

  with expected(trigger_name) as (
    values
      ('set_persons_updated_at'),
      ('set_app_users_updated_at'),
      ('set_roles_updated_at'),
      ('set_app_sessions_updated_at'),
      ('protect_last_superadmin_on_user_roles'),
      ('protect_last_superadmin_on_app_users')
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
    raise exception 'Missing identity triggers: %.', missing_triggers;
  end if;

  if to_regprocedure('public.user_has_active_role(uuid, text)') is null then
    raise exception 'Missing function public.user_has_active_role(uuid, text).';
  end if;

  if to_regprocedure('public.current_app_user_id()') is null then
    raise exception 'Missing function public.current_app_user_id().';
  end if;

  if to_regprocedure('public.prevent_last_superadmin_loss()') is null then
    raise exception 'Missing function public.prevent_last_superadmin_loss().';
  end if;

  if exists (
    select 1
    from public.app_users
    where human_code !~ '^USR-[0-9]{6}$'
  ) then
    raise exception 'Invalid USR human code format detected in app_users.';
  end if;

  select count(*)
  into duplicate_count
  from (
    select user_id, role_key
    from public.user_roles
    where status = 'active'
    group by user_id, role_key
    having count(*) > 1
  ) duplicates;

  if duplicate_count <> 0 then
    raise exception 'Duplicate active user roles were detected.';
  end if;

  select count(*)
  into duplicate_count
  from (
    select auth_user_id
    from public.app_users
    group by auth_user_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count <> 0 then
    raise exception 'Duplicate app_users.auth_user_id values were detected.';
  end if;

  select count(*)
  into duplicate_count
  from (
    select person_id
    from public.app_users
    group by person_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count <> 0 then
    raise exception 'Duplicate app_users.person_id values were detected.';
  end if;

  perform public.current_app_user_id();
end;
$$;
