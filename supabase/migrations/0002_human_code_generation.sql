-- ELARA Transport V4.0
-- Migration 0002: central human code generation.
--
-- Human-facing codes are generated in the database, never by the browser.
-- Internal primary keys remain uuid; human codes are operational labels.

create table if not exists public.human_code_counters (
  prefix text primary key,
  current_value bigint not null default 0,
  padding integer not null default 6,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint human_code_counters_prefix_not_empty
    check (length(trim(prefix)) > 0),
  constraint human_code_counters_prefix_uppercase
    check (prefix = upper(prefix)),
  constraint human_code_counters_prefix_format
    check (prefix ~ '^[A-Z]+(-[A-Z]+)*$'),
  constraint human_code_counters_current_value_non_negative
    check (current_value >= 0),
  constraint human_code_counters_padding_range
    check (padding between 1 and 12)
);

comment on table public.human_code_counters is
  'Internal counters for transaction-safe human code generation.';

comment on column public.human_code_counters.prefix is
  'Uppercase ASCII prefix used in visible human codes, for example SRV or CASH.';

comment on column public.human_code_counters.current_value is
  'Last numeric value assigned for the prefix. Values are never reused.';

drop trigger if exists set_human_code_counters_updated_at
  on public.human_code_counters;

create trigger set_human_code_counters_updated_at
before update on public.human_code_counters
for each row
execute function public.set_updated_at();

create or replace function public.next_human_code(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_current_value bigint;
  v_next_value bigint;
  v_padding integer;
  v_is_active boolean;
  v_max_value numeric;
begin
  v_prefix := upper(trim(coalesce(p_prefix, '')));

  if v_prefix = '' then
    raise exception 'Human code prefix is required.'
      using errcode = '22023';
  end if;

  if v_prefix !~ '^[A-Z]+(-[A-Z]+)*$' then
    raise exception 'Invalid human code prefix: "%".', p_prefix
      using errcode = '22023';
  end if;

  select current_value, padding, is_active
  into v_current_value, v_padding, v_is_active
  from public.human_code_counters
  where prefix = v_prefix
  for update;

  if not found then
    raise exception 'Human code prefix "%" does not exist.', v_prefix
      using errcode = 'P0002';
  end if;

  if not v_is_active then
    raise exception 'Human code prefix "%" is inactive.', v_prefix
      using errcode = '22023';
  end if;

  v_max_value := power(10::numeric, v_padding::numeric) - 1;

  if v_current_value >= v_max_value then
    raise exception 'Human code prefix "%" exceeded padding limit %.', v_prefix, v_padding
      using errcode = '22003';
  end if;

  v_next_value := v_current_value + 1;

  update public.human_code_counters
  set current_value = v_next_value
  where prefix = v_prefix;

  return v_prefix || '-' || lpad(v_next_value::text, v_padding, '0');
end;
$$;

comment on function public.next_human_code(text) is
  'Generates the next non-reusable human code for an approved prefix using a row lock.';

revoke all on table public.human_code_counters from public;
revoke all on table public.human_code_counters from anon;
revoke all on table public.human_code_counters from authenticated;

revoke all on function public.next_human_code(text) from public;
revoke execute on function public.next_human_code(text) from anon;
revoke execute on function public.next_human_code(text) from authenticated;

insert into public.human_code_counters (prefix, current_value, padding, is_active)
values
  ('USR', 0, 6, true),
  ('CL', 0, 6, true),
  ('EMP', 0, 6, true),
  ('DRV', 0, 6, true),
  ('VEH', 0, 6, true),
  ('SRV', 0, 6, true),
  ('PAY', 0, 6, true),
  ('CASH', 0, 6, true),
  ('REM', 0, 6, true),
  ('DIF', 0, 6, true),
  ('ARC', 0, 6, true),
  ('REC', 0, 6, true),
  ('RCP', 0, 6, true),
  ('EXP', 0, 6, true),
  ('EXPPAY', 0, 6, true),
  ('EXPRMB', 0, 6, true),
  ('SET', 0, 6, true),
  ('SETPAY', 0, 6, true),
  ('SUP', 0, 6, true)
on conflict (prefix) do nothing;

do $$
declare
  missing_prefixes text[];
  wrong_padding_prefixes text[];
  duplicate_prefix_count integer;
begin
  if to_regclass('public.human_code_counters') is null then
    raise exception 'Required table public.human_code_counters was not created.';
  end if;

  if to_regprocedure('public.next_human_code(text)') is null then
    raise exception 'Required function public.next_human_code(text) was not created.';
  end if;

  with expected(prefix) as (
    values
      ('USR'), ('CL'), ('EMP'), ('DRV'), ('VEH'), ('SRV'), ('PAY'),
      ('CASH'), ('REM'), ('DIF'), ('ARC'), ('REC'), ('RCP'), ('EXP'),
      ('EXPPAY'), ('EXPRMB'), ('SET'), ('SETPAY'), ('SUP')
  )
  select array_agg(expected.prefix order by expected.prefix)
  into missing_prefixes
  from expected
  where not exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix = expected.prefix
  );

  if missing_prefixes is not null then
    raise exception 'Missing initial human code prefixes: %.', missing_prefixes;
  end if;

  with expected(prefix) as (
    values
      ('USR'), ('CL'), ('EMP'), ('DRV'), ('VEH'), ('SRV'), ('PAY'),
      ('CASH'), ('REM'), ('DIF'), ('ARC'), ('REC'), ('RCP'), ('EXP'),
      ('EXPPAY'), ('EXPRMB'), ('SET'), ('SETPAY'), ('SUP')
  )
  select array_agg(counter.prefix order by counter.prefix)
  into wrong_padding_prefixes
  from public.human_code_counters counter
  join expected on expected.prefix = counter.prefix
  where counter.padding <> 6;

  if wrong_padding_prefixes is not null then
    raise exception 'Initial human code prefixes must use padding 6: %.', wrong_padding_prefixes;
  end if;

  select count(*) - count(distinct prefix)
  into duplicate_prefix_count
  from public.human_code_counters;

  if duplicate_prefix_count <> 0 then
    raise exception 'Duplicate human code prefixes were detected.';
  end if;

  if exists (
    select 1
    from public.human_code_counters
    where current_value < 0
  ) then
    raise exception 'Human code counters cannot contain negative values.';
  end if;
end;
$$;
