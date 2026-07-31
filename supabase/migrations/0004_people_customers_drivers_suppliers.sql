-- ELARA Transport V4.0
-- Migration 0004: people, customers, drivers and suppliers.
--
-- Extends identity with commercial relationships and operational driver profiles.
-- No vehicles, services, finance, RLS policies or seed data are created here.

create table if not exists public.companies (
  id uuid primary key default extensions.gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  tax_id text,
  billing_email text,
  billing_phone text,
  billing_address text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  inactive_by uuid references public.app_users(id) on delete restrict,

  constraint companies_legal_name_not_empty
    check (length(trim(legal_name)) > 0),
  constraint companies_status_check
    check (status in ('active', 'inactive')),
  constraint companies_inactive_at_required_when_inactive
    check (status <> 'inactive' or inactive_at is not null)
);

comment on table public.companies is
  'Company master data. Commercial customer code lives in customers, not companies.';

create unique index if not exists companies_tax_id_unique_idx
  on public.companies (upper(nullif(trim(tax_id), '')))
  where nullif(trim(tax_id), '') is not null;

create table if not exists public.customers (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  customer_type text not null,
  person_id uuid references public.persons(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  status text not null default 'new',
  billing_notes text,
  preferences jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  blocked_at timestamptz,
  blocked_by uuid references public.app_users(id) on delete restrict,
  blocked_reason text,
  inactive_at timestamptz,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  inactive_by uuid references public.app_users(id) on delete restrict,

  constraint customers_human_code_unique
    unique (human_code),
  constraint customers_type_check
    check (customer_type in ('individual', 'company')),
  constraint customers_status_check
    check (status in ('new', 'active', 'blocked', 'inactive')),
  constraint customers_exactly_one_subject
    check (
      (customer_type = 'individual' and person_id is not null and company_id is null)
      or
      (customer_type = 'company' and company_id is not null and person_id is null)
    ),
  constraint customers_human_code_format
    check (
      (customer_type = 'individual' and human_code ~ '^CL-[0-9]{6}$')
      or
      (customer_type = 'company' and human_code ~ '^EMP-[0-9]{6}$')
    ),
  constraint customers_blocked_at_required_when_blocked
    check (status <> 'blocked' or blocked_at is not null),
  constraint customers_inactive_at_required_when_inactive
    check (status <> 'inactive' or inactive_at is not null)
);

comment on table public.customers is
  'Commercial relationship with ELARA. Individual customers reference persons; company customers reference companies.';

create unique index if not exists customers_one_not_inactive_per_person_idx
  on public.customers (person_id)
  where person_id is not null and status <> 'inactive';

create unique index if not exists customers_one_not_inactive_per_company_idx
  on public.customers (company_id)
  where company_id is not null and status <> 'inactive';

create table if not exists public.company_contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  role_label text,
  is_primary boolean not null default false,
  status text not null default 'active',
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  inactive_by uuid references public.app_users(id) on delete restrict,

  constraint company_contacts_status_check
    check (status in ('active', 'inactive')),
  constraint company_contacts_ended_at_required_when_inactive
    check (status <> 'inactive' or ended_at is not null),
  constraint company_contacts_started_before_ended
    check (started_at is null or ended_at is null or started_at <= ended_at)
);

comment on table public.company_contacts is
  'People associated with companies as commercial contacts.';

create unique index if not exists company_contacts_one_active_per_company_person_idx
  on public.company_contacts (company_id, person_id)
  where status = 'active';

create unique index if not exists company_contacts_one_primary_active_per_company_idx
  on public.company_contacts (company_id)
  where status = 'active' and is_primary = true;

create table if not exists public.drivers (
  id uuid primary key default extensions.gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete restrict,
  human_code text not null,
  driver_type text not null,
  administrative_status text not null default 'pending_documents',
  availability_preference text not null default 'unavailable',
  base_city text,
  license_expiration date,
  observations text,
  settlement_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  status_changed_by uuid references public.app_users(id) on delete restrict,

  constraint drivers_person_id_unique
    unique (person_id),
  constraint drivers_human_code_unique
    unique (human_code),
  constraint drivers_human_code_format
    check (human_code ~ '^DRV-[0-9]{6}$'),
  constraint drivers_type_check
    check (driver_type in ('internal_driver', 'external_collaborator')),
  constraint drivers_administrative_status_check
    check (administrative_status in ('active', 'pending_documents', 'suspended', 'inactive')),
  constraint drivers_availability_preference_check
    check (availability_preference in ('available', 'unavailable')),
  constraint drivers_inactive_at_required_when_inactive
    check (administrative_status <> 'inactive' or inactive_at is not null),
  constraint drivers_suspended_at_required_when_suspended
    check (administrative_status <> 'suspended' or suspended_at is not null)
);

comment on table public.drivers is
  'Operational driver profile for internal drivers and external collaborators. Effective operational status is derived elsewhere.';

create table if not exists public.user_driver_links (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  ended_by uuid references public.app_users(id) on delete restrict,

  constraint user_driver_links_status_check
    check (status in ('active', 'inactive')),
  constraint user_driver_links_ended_at_required_when_inactive
    check (status <> 'inactive' or ended_at is not null),
  constraint user_driver_links_started_before_ended
    check (ended_at is null or started_at <= ended_at)
);

comment on table public.user_driver_links is
  'Historical link between app users and driver profiles. One active link per user and per driver.';

create unique index if not exists user_driver_links_one_active_per_user_idx
  on public.user_driver_links (user_id)
  where status = 'active';

create unique index if not exists user_driver_links_one_active_per_driver_idx
  on public.user_driver_links (driver_id)
  where status = 'active';

create table if not exists public.suppliers (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  supplier_type text not null,
  person_id uuid references public.persons(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  display_name text,
  tax_id text,
  email text,
  phone text,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  notes text,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  inactive_by uuid references public.app_users(id) on delete restrict,

  constraint suppliers_human_code_unique
    unique (human_code),
  constraint suppliers_human_code_format
    check (human_code ~ '^SUP-[0-9]{6}$'),
  constraint suppliers_type_check
    check (supplier_type in ('individual', 'company')),
  constraint suppliers_exactly_one_subject
    check (
      (supplier_type = 'individual' and person_id is not null and company_id is null)
      or
      (supplier_type = 'company' and company_id is not null and person_id is null)
    ),
  constraint suppliers_status_check
    check (status in ('active', 'inactive')),
  constraint suppliers_inactive_at_required_when_inactive
    check (status <> 'inactive' or inactive_at is not null)
);

comment on table public.suppliers is
  'Supplier master data for future expense flows.';

create unique index if not exists suppliers_tax_id_unique_idx
  on public.suppliers (upper(nullif(trim(tax_id), '')))
  where nullif(trim(tax_id), '') is not null;

create unique index if not exists suppliers_one_active_per_person_idx
  on public.suppliers (person_id)
  where person_id is not null and status = 'active';

create unique index if not exists suppliers_one_active_per_company_idx
  on public.suppliers (company_id)
  where company_id is not null and status = 'active';

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

drop trigger if exists set_company_contacts_updated_at on public.company_contacts;
create trigger set_company_contacts_updated_at
before update on public.company_contacts
for each row
execute function public.set_updated_at();

drop trigger if exists set_drivers_updated_at on public.drivers;
create trigger set_drivers_updated_at
before update on public.drivers
for each row
execute function public.set_updated_at();

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

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
    v_prefix = 'CL' and new.human_code !~ '^CL-[0-9]{6}$'
  ) or (
    v_prefix = 'EMP' and new.human_code !~ '^EMP-[0-9]{6}$'
  ) then
    raise exception 'Invalid customer human_code "%" for customer_type "%".', new.human_code, new.customer_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.assign_customer_human_code() is
  'Assigns CL or EMP human codes to customers and rejects mismatched manual values.';

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

  if new.human_code !~ '^DRV-[0-9]{6}$' then
    raise exception 'Invalid driver human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.assign_driver_human_code() is
  'Assigns DRV human codes to drivers and rejects mismatched manual values.';

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

  if new.human_code !~ '^SUP-[0-9]{6}$' then
    raise exception 'Invalid supplier human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.assign_supplier_human_code() is
  'Assigns SUP human codes to suppliers and rejects mismatched manual values.';

drop trigger if exists assign_customers_human_code on public.customers;
create trigger assign_customers_human_code
before insert or update of human_code, customer_type on public.customers
for each row
execute function public.assign_customer_human_code();

drop trigger if exists assign_drivers_human_code on public.drivers;
create trigger assign_drivers_human_code
before insert or update of human_code on public.drivers
for each row
execute function public.assign_driver_human_code();

drop trigger if exists assign_suppliers_human_code on public.suppliers;
create trigger assign_suppliers_human_code
before insert or update of human_code on public.suppliers
for each row
execute function public.assign_supplier_human_code();

create or replace function public.validate_people_commercial_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'customers' then
    if new.customer_type = 'individual' and not exists (
      select 1 from public.persons person
      where person.id = new.person_id
        and person.status = 'active'
    ) then
      raise exception 'Individual customers require an active person.'
        using errcode = '23514';
    end if;

    if new.customer_type = 'company' and not exists (
      select 1 from public.companies company
      where company.id = new.company_id
        and company.status = 'active'
    ) then
      raise exception 'Company customers require an active company.'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'company_contacts' then
    if new.status = 'active' and not exists (
      select 1
      from public.companies company
      join public.persons person on person.id = new.person_id
      where company.id = new.company_id
        and company.status = 'active'
        and person.status = 'active'
    ) then
      raise exception 'Active company contacts require an active company and an active person.'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'drivers' then
    if not exists (
      select 1 from public.persons person
      where person.id = new.person_id
        and person.status = 'active'
    ) then
      raise exception 'Drivers require an active person.'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'suppliers' then
    if new.supplier_type = 'individual' and not exists (
      select 1 from public.persons person
      where person.id = new.person_id
        and person.status = 'active'
    ) then
      raise exception 'Individual suppliers require an active person.'
        using errcode = '23514';
    end if;

    if new.supplier_type = 'company' and not exists (
      select 1 from public.companies company
      where company.id = new.company_id
        and company.status = 'active'
    ) then
      raise exception 'Company suppliers require an active company.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_people_commercial_integrity() is
  'Deferred validation for active person/company requirements in customers, contacts, drivers and suppliers.';

create or replace function public.validate_user_driver_link_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_driver_id uuid;
begin
  if tg_table_name = 'user_driver_links' then
    if new.status <> 'active' then
      return new;
    end if;

    if not exists (
      select 1
      from public.app_users app_user
      join public.drivers driver
        on driver.id = new.driver_id
      where app_user.id = new.user_id
        and app_user.status = 'active'
        and driver.administrative_status = 'active'
        and public.user_has_active_role(app_user.id, 'conductor')
    ) then
      raise exception 'Active user-driver links require an active app user, active conductor role and active driver.'
        using errcode = '23514';
    end if;

    return new;
  elsif tg_table_name = 'app_users' then
    v_user_id := new.id;
  elsif tg_table_name = 'drivers' then
    v_driver_id := new.id;
  elsif tg_table_name = 'user_roles' then
    if tg_op = 'DELETE' then
      v_user_id := old.user_id;
    else
      v_user_id := new.user_id;
    end if;
  end if;

  if exists (
    select 1
    from public.user_driver_links link
    join public.app_users app_user
      on app_user.id = link.user_id
    join public.drivers driver
      on driver.id = link.driver_id
    where link.status = 'active'
      and (v_user_id is null or link.user_id = v_user_id)
      and (v_driver_id is null or link.driver_id = v_driver_id)
      and (
        app_user.status <> 'active'
        or driver.administrative_status <> 'active'
        or not public.user_has_active_role(app_user.id, 'conductor')
      )
  ) then
    raise exception 'Existing active user-driver links require an active app user, active conductor role and active driver.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.validate_user_driver_link_integrity() is
  'Deferred validation for active user-driver links and conductor role ownership.';

drop trigger if exists validate_customers_integrity on public.customers;
create constraint trigger validate_customers_integrity
after insert or update on public.customers
deferrable initially deferred
for each row
execute function public.validate_people_commercial_integrity();

drop trigger if exists validate_company_contacts_integrity on public.company_contacts;
create constraint trigger validate_company_contacts_integrity
after insert or update on public.company_contacts
deferrable initially deferred
for each row
execute function public.validate_people_commercial_integrity();

drop trigger if exists validate_drivers_integrity on public.drivers;
create constraint trigger validate_drivers_integrity
after insert or update on public.drivers
deferrable initially deferred
for each row
execute function public.validate_people_commercial_integrity();

drop trigger if exists validate_suppliers_integrity on public.suppliers;
create constraint trigger validate_suppliers_integrity
after insert or update on public.suppliers
deferrable initially deferred
for each row
execute function public.validate_people_commercial_integrity();

drop trigger if exists validate_user_driver_links_integrity on public.user_driver_links;
create constraint trigger validate_user_driver_links_integrity
after insert or update on public.user_driver_links
deferrable initially deferred
for each row
execute function public.validate_user_driver_link_integrity();

drop trigger if exists validate_app_users_driver_links_integrity on public.app_users;
create constraint trigger validate_app_users_driver_links_integrity
after update on public.app_users
deferrable initially deferred
for each row
execute function public.validate_user_driver_link_integrity();

drop trigger if exists validate_drivers_user_links_integrity on public.drivers;
create constraint trigger validate_drivers_user_links_integrity
after update on public.drivers
deferrable initially deferred
for each row
execute function public.validate_user_driver_link_integrity();

drop trigger if exists validate_user_roles_driver_links_integrity on public.user_roles;
create constraint trigger validate_user_roles_driver_links_integrity
after insert or update or delete on public.user_roles
deferrable initially deferred
for each row
execute function public.validate_user_driver_link_integrity();

revoke all on table public.companies from public;
revoke all on table public.customers from public;
revoke all on table public.company_contacts from public;
revoke all on table public.drivers from public;
revoke all on table public.user_driver_links from public;
revoke all on table public.suppliers from public;

revoke all on table public.companies from anon;
revoke all on table public.customers from anon;
revoke all on table public.company_contacts from anon;
revoke all on table public.drivers from anon;
revoke all on table public.user_driver_links from anon;
revoke all on table public.suppliers from anon;

revoke all on table public.companies from authenticated;
revoke all on table public.customers from authenticated;
revoke all on table public.company_contacts from authenticated;
revoke all on table public.drivers from authenticated;
revoke all on table public.user_driver_links from authenticated;
revoke all on table public.suppliers from authenticated;

grant select, insert, update, delete on table public.companies to service_role;
grant select, insert, update, delete on table public.customers to service_role;
grant select, insert, update, delete on table public.company_contacts to service_role;
grant select, insert, update, delete on table public.drivers to service_role;
grant select, insert, update, delete on table public.user_driver_links to service_role;
grant select, insert, update, delete on table public.suppliers to service_role;

revoke all on function public.assign_customer_human_code() from public;
revoke all on function public.assign_driver_human_code() from public;
revoke all on function public.assign_supplier_human_code() from public;
revoke all on function public.validate_people_commercial_integrity() from public;
revoke all on function public.validate_user_driver_link_integrity() from public;

revoke execute on function public.assign_customer_human_code() from anon;
revoke execute on function public.assign_driver_human_code() from anon;
revoke execute on function public.assign_supplier_human_code() from anon;
revoke execute on function public.validate_people_commercial_integrity() from anon;
revoke execute on function public.validate_user_driver_link_integrity() from anon;

revoke execute on function public.assign_customer_human_code() from authenticated;
revoke execute on function public.assign_driver_human_code() from authenticated;
revoke execute on function public.assign_supplier_human_code() from authenticated;
revoke execute on function public.validate_people_commercial_integrity() from authenticated;
revoke execute on function public.validate_user_driver_link_integrity() from authenticated;

do $$
declare
  missing_tables text[];
  missing_triggers text[];
begin
  with expected(table_name) as (
    values
      ('companies'),
      ('customers'),
      ('company_contacts'),
      ('drivers'),
      ('user_driver_links'),
      ('suppliers')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into missing_tables
  from expected
  where to_regclass('public.' || expected.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing people/customer/driver tables: %.', missing_tables;
  end if;

  with expected(trigger_name) as (
    values
      ('set_companies_updated_at'),
      ('set_customers_updated_at'),
      ('set_company_contacts_updated_at'),
      ('set_drivers_updated_at'),
      ('set_suppliers_updated_at'),
      ('assign_customers_human_code'),
      ('assign_drivers_human_code'),
      ('assign_suppliers_human_code'),
      ('validate_customers_integrity'),
      ('validate_company_contacts_integrity'),
      ('validate_drivers_integrity'),
      ('validate_suppliers_integrity'),
      ('validate_user_driver_links_integrity'),
      ('validate_app_users_driver_links_integrity'),
      ('validate_drivers_user_links_integrity'),
      ('validate_user_roles_driver_links_integrity')
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
    raise exception 'Missing people/customer/driver triggers: %.', missing_triggers;
  end if;

  if to_regclass('public.companies_tax_id_unique_idx') is null then
    raise exception 'Missing unique index companies_tax_id_unique_idx.';
  end if;

  if to_regclass('public.customers_one_not_inactive_per_person_idx') is null then
    raise exception 'Missing partial unique index customers_one_not_inactive_per_person_idx.';
  end if;

  if to_regclass('public.customers_one_not_inactive_per_company_idx') is null then
    raise exception 'Missing partial unique index customers_one_not_inactive_per_company_idx.';
  end if;

  if to_regclass('public.company_contacts_one_active_per_company_person_idx') is null then
    raise exception 'Missing partial unique index company_contacts_one_active_per_company_person_idx.';
  end if;

  if to_regclass('public.company_contacts_one_primary_active_per_company_idx') is null then
    raise exception 'Missing partial unique index company_contacts_one_primary_active_per_company_idx.';
  end if;

  if to_regclass('public.user_driver_links_one_active_per_user_idx') is null then
    raise exception 'Missing partial unique index user_driver_links_one_active_per_user_idx.';
  end if;

  if to_regclass('public.user_driver_links_one_active_per_driver_idx') is null then
    raise exception 'Missing partial unique index user_driver_links_one_active_per_driver_idx.';
  end if;

  if to_regclass('public.suppliers_tax_id_unique_idx') is null then
    raise exception 'Missing unique index suppliers_tax_id_unique_idx.';
  end if;

  if to_regclass('public.suppliers_one_active_per_person_idx') is null then
    raise exception 'Missing partial unique index suppliers_one_active_per_person_idx.';
  end if;

  if to_regclass('public.suppliers_one_active_per_company_idx') is null then
    raise exception 'Missing partial unique index suppliers_one_active_per_company_idx.';
  end if;

  if exists (
    select 1
    from public.customers
    where not (
      (customer_type = 'individual' and person_id is not null and company_id is null and human_code ~ '^CL-[0-9]{6}$')
      or
      (customer_type = 'company' and company_id is not null and person_id is null and human_code ~ '^EMP-[0-9]{6}$')
    )
  ) then
    raise exception 'Invalid customer subject or human_code format detected.';
  end if;

  if exists (
    select 1
    from public.drivers
    where human_code !~ '^DRV-[0-9]{6}$'
  ) then
    raise exception 'Invalid driver human_code format detected.';
  end if;

  if exists (
    select 1
    from public.suppliers
    where not (
      human_code ~ '^SUP-[0-9]{6}$'
      and (
        (supplier_type = 'individual' and person_id is not null and company_id is null)
        or
        (supplier_type = 'company' and company_id is not null and person_id is null)
      )
    )
  ) then
    raise exception 'Invalid supplier subject or human_code format detected.';
  end if;

  if exists (
    select user_id
    from public.user_driver_links
    where status = 'active'
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate active user_driver_links per user detected.';
  end if;

  if exists (
    select driver_id
    from public.user_driver_links
    where status = 'active'
    group by driver_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate active user_driver_links per driver detected.';
  end if;

  if has_table_privilege('anon', 'public.companies', 'SELECT')
    or has_table_privilege('authenticated', 'public.companies', 'SELECT')
    or has_table_privilege('anon', 'public.customers', 'SELECT')
    or has_table_privilege('authenticated', 'public.customers', 'SELECT')
    or has_table_privilege('anon', 'public.company_contacts', 'SELECT')
    or has_table_privilege('authenticated', 'public.company_contacts', 'SELECT')
    or has_table_privilege('anon', 'public.drivers', 'SELECT')
    or has_table_privilege('authenticated', 'public.drivers', 'SELECT')
    or has_table_privilege('anon', 'public.user_driver_links', 'SELECT')
    or has_table_privilege('authenticated', 'public.user_driver_links', 'SELECT')
    or has_table_privilege('anon', 'public.suppliers', 'SELECT')
    or has_table_privilege('authenticated', 'public.suppliers', 'SELECT')
  then
    raise exception 'anon/authenticated must not have direct table access to 0004 tables.';
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute public.next_human_code(text).';
  end if;
end;
$$;
