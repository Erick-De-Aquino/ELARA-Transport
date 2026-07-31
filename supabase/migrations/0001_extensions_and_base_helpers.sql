-- ELARA Transport V4.0
-- Migration 0001: extensions and base helpers.
--
-- Conventions for later migrations:
-- - Internal primary keys use uuid.
-- - Audit timestamps use timestamptz.
-- - Monetary amounts use numeric, never float.
-- - Technical identifiers use English snake_case.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

comment on extension pgcrypto is
  'Required for gen_random_uuid() and future UUID-based helpers.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Reusable trigger helper for tables with an updated_at timestamptz column.';

create or replace function public.current_auth_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  raw_session_id text;
begin
  raw_session_id := nullif(auth.jwt() ->> 'session_id', '');

  if raw_session_id is null then
    return null;
  end if;

  return raw_session_id::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

comment on function public.current_auth_session_id() is
  'Safely reads the verified Supabase JWT session_id claim and returns null when absent or invalid.';

do $$
begin
  if not exists (
    select 1
    from pg_extension
    where extname = 'pgcrypto'
  ) then
    raise exception 'Required extension pgcrypto is not installed.';
  end if;

  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Required function public.set_updated_at() was not created.';
  end if;

  if to_regprocedure('public.current_auth_session_id()') is null then
    raise exception 'Required function public.current_auth_session_id() was not created.';
  end if;

  perform public.current_auth_session_id();
end;
$$;
