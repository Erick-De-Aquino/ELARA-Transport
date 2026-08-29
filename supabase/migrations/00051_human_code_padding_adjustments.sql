-- ELARA Transport V4.0
-- Migration 0005a: human code padding adjustments.
--
-- Master records use compact human codes with 4 digits:
-- USR-0001, CL-0001, EMP-0001, DRV-0001, VEH-0001, SUP-0001.
--
-- Transactional records keep 6 digits to preserve operational headroom.
--
-- Driver terminology:
-- - public.drivers contains every operational driver profile.
-- - internal_driver represents ELARA employed drivers.
-- - external_collaborator represents external collaborators.
-- - Internal-driver assignment priority belongs to the Services domain, not this Vehicles migration.

do $$
begin
  if exists (
    select 1
    from public.human_code_counters
    where prefix in ('USR', 'CL', 'EMP', 'DRV', 'VEH', 'SUP')
      and current_value > 9999
  ) then
    raise exception 'Cannot reduce master human code padding to 4: a master counter already exceeds 9999.';
  end if;

  if exists (
    select 1 from public.app_users where human_code !~ '^USR-[0-9]{4}$'
  ) then
    raise exception 'Existing app_users.human_code values are not compatible with USR-0001 format.';
  end if;

  if exists (
    select 1
    from public.customers
    where not (
      (customer_type = 'individual' and human_code ~ '^CL-[0-9]{4}$')
      or
      (customer_type = 'company' and human_code ~ '^EMP-[0-9]{4}$')
    )
  ) then
    raise exception 'Existing customers.human_code values are not compatible with CL/EMP-0001 formats.';
  end if;

  if exists (
    select 1 from public.drivers where human_code !~ '^DRV-[0-9]{4}$'
  ) then
    raise exception 'Existing drivers.human_code values are not compatible with DRV-0001 format.';
  end if;

  if exists (
    select 1 from public.suppliers where human_code !~ '^SUP-[0-9]{4}$'
  ) then
    raise exception 'Existing suppliers.human_code values are not compatible with SUP-0001 format.';
  end if;

  if exists (
    select 1 from public.vehicles where human_code !~ '^VEH-[0-9]{4}$'
  ) then
    raise exception 'Existing vehicles.human_code values are not compatible with VEH-0001 format.';
  end if;
end;
$$;

update public.human_code_counters
set padding = 4
where prefix in ('USR', 'CL', 'EMP', 'DRV', 'VEH', 'SUP')
  and padding <> 4;

update public.human_code_counters
set padding = 6
where prefix in (
  'SRV',
  'PAY',
  'CASH',
  'REM',
  'DIF',
  'ARC',
  'REC',
  'RCP',
  'EXP',
  'EXPPAY',
  'EXPRMB',
  'SET',
  'SETPAY'
)
  and padding <> 6;

alter table public.app_users
  drop constraint if exists app_users_human_code_format;

alter table public.app_users
  add constraint app_users_human_code_format
  check (human_code ~ '^USR-[0-9]{4}$');

alter table public.customers
  drop constraint if exists customers_human_code_format;

alter table public.customers
  add constraint customers_human_code_format
  check (
    (customer_type = 'individual' and human_code ~ '^CL-[0-9]{4}$')
    or
    (customer_type = 'company' and human_code ~ '^EMP-[0-9]{4}$')
  );

alter table public.drivers
  drop constraint if exists drivers_human_code_format;

alter table public.drivers
  add constraint drivers_human_code_format
  check (human_code ~ '^DRV-[0-9]{4}$');

alter table public.suppliers
  drop constraint if exists suppliers_human_code_format;

alter table public.suppliers
  add constraint suppliers_human_code_format
  check (human_code ~ '^SUP-[0-9]{4}$');

alter table public.vehicles
  drop constraint if exists vehicles_human_code_format;

alter table public.vehicles
  add constraint vehicles_human_code_format
  check (human_code ~ '^VEH-[0-9]{4}$');

create or replace function public.assign_customer_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
begin
  v_prefix := case
    when new.customer_type = 'individual' then 'CL'
    when new.customer_type = 'company' then 'EMP'
    else null
  end;

  if v_prefix is null then
    return new;
  end if;

  if nullif(trim(new.human_code), '') is null then
    new.human_code := public.next_human_code(v_prefix);
  else
    new.human_code := upper(trim(new.human_code));
  end if;

  if (
    v_prefix = 'CL' and new.human_code !~ '^CL-[0-9]{4}$'
  ) or (
    v_prefix = 'EMP' and new.human_code !~ '^EMP-[0-9]{4}$'
  ) then
    raise exception 'Invalid customer human_code "%" for customer_type "%".', new.human_code, new.customer_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assign_driver_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.human_code), '') is null then
    new.human_code := public.next_human_code('DRV');
  else
    new.human_code := upper(trim(new.human_code));
  end if;

  if new.human_code !~ '^DRV-[0-9]{4}$' then
    raise exception 'Invalid driver human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assign_supplier_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.human_code), '') is null then
    new.human_code := public.next_human_code('SUP');
  else
    new.human_code := upper(trim(new.human_code));
  end if;

  if new.human_code !~ '^SUP-[0-9]{4}$' then
    raise exception 'Invalid supplier human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prepare_vehicle_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Vehicle human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(new.human_code), '') is null then
      new.human_code := public.next_human_code('VEH');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^VEH-[0-9]{4}$' then
    raise exception 'Invalid vehicle human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  new.plate_country := upper(trim(new.plate_country));
  new.plate_normalized := public.normalize_vehicle_plate(new.plate_original, new.plate_country);

  if new.year is not null and new.year > extract(year from now())::integer + 1 then
    raise exception 'Vehicle year % is outside the allowed range.', new.year
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on table public.drivers is
  'Operational driver profile for every driver. internal_driver represents ELARA employed drivers; external_collaborator represents external collaborators. Internal-driver assignment priority belongs to the Services domain.';

revoke all on function public.assign_customer_human_code() from public;
revoke all on function public.assign_driver_human_code() from public;
revoke all on function public.assign_supplier_human_code() from public;
revoke all on function public.prepare_vehicle_identity() from public;

revoke execute on function public.assign_customer_human_code() from anon;
revoke execute on function public.assign_driver_human_code() from anon;
revoke execute on function public.assign_supplier_human_code() from anon;
revoke execute on function public.prepare_vehicle_identity() from anon;

revoke execute on function public.assign_customer_human_code() from authenticated;
revoke execute on function public.assign_driver_human_code() from authenticated;
revoke execute on function public.assign_supplier_human_code() from authenticated;
revoke execute on function public.prepare_vehicle_identity() from authenticated;

do $$
declare
  wrong_master_prefixes text[];
  wrong_transaction_prefixes text[];
  missing_constraints text[];
begin
  with expected(prefix) as (
    values ('USR'), ('CL'), ('EMP'), ('DRV'), ('VEH'), ('SUP')
  )
  select array_agg(counter.prefix order by counter.prefix)
  into wrong_master_prefixes
  from public.human_code_counters counter
  join expected on expected.prefix = counter.prefix
  where counter.padding <> 4;

  if wrong_master_prefixes is not null then
    raise exception 'Master prefixes must use padding 4: %.', wrong_master_prefixes;
  end if;

  with expected(prefix) as (
    values
      ('SRV'),
      ('PAY'),
      ('CASH'),
      ('REM'),
      ('DIF'),
      ('ARC'),
      ('REC'),
      ('RCP'),
      ('EXP'),
      ('EXPPAY'),
      ('EXPRMB'),
      ('SET'),
      ('SETPAY')
  )
  select array_agg(counter.prefix order by counter.prefix)
  into wrong_transaction_prefixes
  from public.human_code_counters counter
  join expected on expected.prefix = counter.prefix
  where counter.padding <> 6;

  if wrong_transaction_prefixes is not null then
    raise exception 'Transactional prefixes must use padding 6: %.', wrong_transaction_prefixes;
  end if;

  with expected(table_name, constraint_name) as (
    values
      ('app_users', 'app_users_human_code_format'),
      ('customers', 'customers_human_code_format'),
      ('drivers', 'drivers_human_code_format'),
      ('suppliers', 'suppliers_human_code_format'),
      ('vehicles', 'vehicles_human_code_format')
  )
  select array_agg(expected.constraint_name order by expected.constraint_name)
  into missing_constraints
  from expected
  where not exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conname = expected.constraint_name
      and constraint_record.conrelid = ('public.' || expected.table_name)::regclass
  );

  if missing_constraints is not null then
    raise exception 'Missing adjusted human_code constraints: %.', missing_constraints;
  end if;

  if exists (
    select 1 from public.app_users where human_code !~ '^USR-[0-9]{4}$'
  ) then
    raise exception 'Incompatible app_users.human_code values remain.';
  end if;

  if exists (
    select 1
    from public.customers
    where not (
      (customer_type = 'individual' and human_code ~ '^CL-[0-9]{4}$')
      or
      (customer_type = 'company' and human_code ~ '^EMP-[0-9]{4}$')
    )
  ) then
    raise exception 'Incompatible customers.human_code values remain.';
  end if;

  if exists (
    select 1 from public.drivers where human_code !~ '^DRV-[0-9]{4}$'
  ) then
    raise exception 'Incompatible drivers.human_code values remain.';
  end if;

  if exists (
    select 1 from public.suppliers where human_code !~ '^SUP-[0-9]{4}$'
  ) then
    raise exception 'Incompatible suppliers.human_code values remain.';
  end if;

  if exists (
    select 1 from public.vehicles where human_code !~ '^VEH-[0-9]{4}$'
  ) then
    raise exception 'Incompatible vehicles.human_code values remain.';
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.assign_customer_human_code()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.assign_customer_human_code()', 'EXECUTE')
    or has_function_privilege('anon', 'public.assign_driver_human_code()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.assign_driver_human_code()', 'EXECUTE')
    or has_function_privilege('anon', 'public.assign_supplier_human_code()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.assign_supplier_human_code()', 'EXECUTE')
    or has_function_privilege('anon', 'public.prepare_vehicle_identity()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.prepare_vehicle_identity()', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute human code generation functions.';
  end if;
end;
$$;
