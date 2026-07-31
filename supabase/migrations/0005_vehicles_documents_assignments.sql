-- ELARA Transport V4.0
-- Migration 0005: vehicles, documents, assignments, odometer and maintenance.
--
-- Vehicles use driver_vehicle_assignments as the source of truth for driver-vehicle links.
-- Document and operational availability are derived from documents, incidents, maintenance and manual state.

create table if not exists public.vehicle_external_owners (
  id uuid primary key default extensions.gen_random_uuid(),
  person_id uuid references public.persons(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  display_name text,
  tax_id text,
  contact_email text,
  contact_phone text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  inactive_by uuid references public.app_users(id) on delete restrict,

  constraint vehicle_external_owners_status_check
    check (status in ('active', 'inactive')),
  constraint vehicle_external_owners_exactly_one_subject
    check (
      (person_id is not null and company_id is null)
      or
      (company_id is not null and person_id is null)
    ),
  constraint vehicle_external_owners_inactive_at_required_when_inactive
    check (status <> 'inactive' or inactive_at is not null)
);

comment on table public.vehicle_external_owners is
  'External owner for vehicles not owned by ELARA.';

create unique index if not exists vehicle_external_owners_one_active_per_person_idx
  on public.vehicle_external_owners (person_id)
  where person_id is not null and status = 'active';

create unique index if not exists vehicle_external_owners_one_active_per_company_idx
  on public.vehicle_external_owners (company_id)
  where company_id is not null and status = 'active';

create table if not exists public.vehicles (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  plate_original text not null,
  plate_normalized text not null,
  plate_country text not null default 'ES',
  brand text not null,
  model text not null,
  color text,
  year integer,
  seats integer,
  ownership_type text not null,
  external_owner_id uuid references public.vehicle_external_owners(id) on delete restrict,
  manual_operational_status text not null default 'unavailable',
  elara_approval_status text not null default 'not_required',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactive_at timestamptz,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  inactive_by uuid references public.app_users(id) on delete restrict,

  constraint vehicles_human_code_unique
    unique (human_code),
  constraint vehicles_plate_normalized_unique
    unique (plate_normalized),
  constraint vehicles_human_code_format
    check (human_code ~ '^VEH-[0-9]{6}$'),
  constraint vehicles_plate_country_format
    check (plate_country ~ '^[A-Z]{2}$'),
  constraint vehicles_brand_not_empty
    check (length(trim(brand)) > 0),
  constraint vehicles_model_not_empty
    check (length(trim(model)) > 0),
  constraint vehicles_ownership_type_check
    check (ownership_type in ('owned', 'external')),
  constraint vehicles_manual_operational_status_check
    check (manual_operational_status in ('available', 'unavailable', 'blocked')),
  constraint vehicles_elara_approval_status_check
    check (elara_approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  constraint vehicles_ownership_consistency
    check (
      (ownership_type = 'owned' and external_owner_id is null and elara_approval_status = 'not_required')
      or
      (ownership_type = 'external' and external_owner_id is not null)
    ),
  constraint vehicles_year_minimum
    check (year is null or year >= 1900),
  constraint vehicles_seats_positive
    check (seats is null or seats > 0)
);

comment on table public.vehicles is
  'Vehicle master data. Document and operational status are derived, not stored as duplicate truth.';

create table if not exists public.vehicle_document_types (
  key text primary key,
  label_es text not null,
  is_required_default boolean not null,
  required_for_owned boolean not null,
  required_for_external boolean not null,
  expires_required boolean not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint vehicle_document_types_key_format
    check (key = lower(trim(key)) and key ~ '^[a-z][a-z_]*$'),
  constraint vehicle_document_types_label_not_empty
    check (length(trim(label_es)) > 0),
  constraint vehicle_document_types_sort_order_positive
    check (sort_order > 0)
);

comment on table public.vehicle_document_types is
  'Configurable vehicle document catalog.';

create table if not exists public.vehicle_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  document_type_key text not null references public.vehicle_document_types(key) on update cascade on delete restrict,
  status text not null default 'pending',
  issued_at date,
  expires_at date,
  reference_number text,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  checksum text,
  notes text,
  validated_at timestamptz,
  validated_by uuid references public.app_users(id) on delete restrict,
  replaced_at timestamptz,
  replaced_by_document_id uuid references public.vehicle_documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint vehicle_documents_status_check
    check (status in ('valid', 'expiring_soon', 'expired', 'pending', 'not_applicable', 'rejected', 'replaced', 'annulled')),
  constraint vehicle_documents_expires_after_issued
    check (issued_at is null or expires_at is null or expires_at >= issued_at),
  constraint vehicle_documents_file_size_non_negative
    check (file_size is null or file_size >= 0),
  constraint vehicle_documents_replaced_metadata
    check (status <> 'replaced' or replaced_at is not null)
);

comment on table public.vehicle_documents is
  'Vehicle document records. Files will use private Supabase Storage paths in later migrations.';

create unique index if not exists vehicle_documents_one_current_per_type_idx
  on public.vehicle_documents (vehicle_id, document_type_key)
  where replaced_at is null and status not in ('replaced', 'annulled');

create table if not exists public.vehicle_status_reasons (
  key text primary key,
  label_es text not null,
  category text not null,
  blocks_operation boolean not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_status_reasons_key_format
    check (key = lower(trim(key)) and key ~ '^[a-z][a-z_]*$'),
  constraint vehicle_status_reasons_label_not_empty
    check (length(trim(label_es)) > 0),
  constraint vehicle_status_reasons_category_check
    check (category in ('documentation', 'maintenance', 'breakdown', 'manual_block', 'external_approval'))
);

comment on table public.vehicle_status_reasons is
  'Technical reasons that can block or explain vehicle operational status.';

create table if not exists public.vehicle_technical_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  reason_key text not null references public.vehicle_status_reasons(key) on update cascade on delete restrict,
  status text not null default 'open',
  severity text not null default 'medium',
  description text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  closed_by uuid references public.app_users(id) on delete restrict,

  constraint vehicle_technical_incidents_status_check
    check (status in ('open', 'resolved', 'cancelled')),
  constraint vehicle_technical_incidents_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint vehicle_technical_incidents_closed_at_required
    check (status = 'open' or closed_at is not null),
  constraint vehicle_technical_incidents_closed_after_opened
    check (closed_at is null or closed_at >= opened_at)
);

comment on table public.vehicle_technical_incidents is
  'Technical incidents or inactive causes associated with vehicles.';

create unique index if not exists vehicle_technical_incidents_one_open_per_reason_idx
  on public.vehicle_technical_incidents (vehicle_id, reason_key)
  where status = 'open';

create table if not exists public.driver_vehicle_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  ended_by uuid references public.app_users(id) on delete restrict,

  constraint driver_vehicle_assignments_status_check
    check (status in ('active', 'ended', 'cancelled')),
  constraint driver_vehicle_assignments_ended_at_required
    check (status = 'active' or ended_at is not null),
  constraint driver_vehicle_assignments_started_before_ended
    check (ended_at is null or started_at <= ended_at)
);

comment on table public.driver_vehicle_assignments is
  'Historical driver-vehicle assignments. One active assignment per driver and per vehicle.';

create unique index if not exists driver_vehicle_assignments_one_active_per_driver_idx
  on public.driver_vehicle_assignments (driver_id)
  where status = 'active';

create unique index if not exists driver_vehicle_assignments_one_active_per_vehicle_idx
  on public.driver_vehicle_assignments (vehicle_id)
  where status = 'active';

create table if not exists public.vehicle_odometer_readings (
  id uuid primary key default extensions.gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  reading_km bigint not null,
  read_at timestamptz not null,
  source text not null,
  is_correction boolean not null default false,
  correction_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  recorded_by uuid references public.app_users(id) on delete restrict,

  constraint vehicle_odometer_readings_km_non_negative
    check (reading_km >= 0),
  constraint vehicle_odometer_readings_source_check
    check (source in ('manual', 'service', 'maintenance', 'import')),
  constraint vehicle_odometer_readings_correction_reason_required
    check (not is_correction or length(trim(coalesce(correction_reason, ''))) > 0)
);

comment on table public.vehicle_odometer_readings is
  'Append-only odometer reading history.';

create index if not exists vehicle_odometer_readings_vehicle_read_at_idx
  on public.vehicle_odometer_readings (vehicle_id, read_at desc, created_at desc);

create table if not exists public.vehicle_maintenance_records (
  id uuid primary key default extensions.gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  maintenance_type text not null,
  status text not null default 'scheduled',
  opened_at timestamptz not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  odometer_km bigint,
  provider_name text,
  description text,
  cost_reference numeric(14,2),
  next_due_km bigint,
  next_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  completed_by uuid references public.app_users(id) on delete restrict,

  constraint vehicle_maintenance_records_type_not_empty
    check (length(trim(maintenance_type)) > 0),
  constraint vehicle_maintenance_records_status_check
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  constraint vehicle_maintenance_records_completed_after_opened
    check (completed_at is null or completed_at >= opened_at),
  constraint vehicle_maintenance_records_odometer_non_negative
    check (odometer_km is null or odometer_km >= 0),
  constraint vehicle_maintenance_records_next_due_km_check
    check (next_due_km is null or odometer_km is null or next_due_km >= odometer_km),
  constraint vehicle_maintenance_records_cost_non_negative
    check (cost_reference is null or cost_reference >= 0)
);

comment on table public.vehicle_maintenance_records is
  'Vehicle maintenance history and future maintenance references.';

drop trigger if exists set_vehicle_external_owners_updated_at on public.vehicle_external_owners;
create trigger set_vehicle_external_owners_updated_at
before update on public.vehicle_external_owners
for each row
execute function public.set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at
before update on public.vehicles
for each row
execute function public.set_updated_at();

drop trigger if exists set_vehicle_document_types_updated_at on public.vehicle_document_types;
create trigger set_vehicle_document_types_updated_at
before update on public.vehicle_document_types
for each row
execute function public.set_updated_at();

drop trigger if exists set_vehicle_documents_updated_at on public.vehicle_documents;
create trigger set_vehicle_documents_updated_at
before update on public.vehicle_documents
for each row
execute function public.set_updated_at();

drop trigger if exists set_vehicle_status_reasons_updated_at on public.vehicle_status_reasons;
create trigger set_vehicle_status_reasons_updated_at
before update on public.vehicle_status_reasons
for each row
execute function public.set_updated_at();

drop trigger if exists set_vehicle_technical_incidents_updated_at on public.vehicle_technical_incidents;
create trigger set_vehicle_technical_incidents_updated_at
before update on public.vehicle_technical_incidents
for each row
execute function public.set_updated_at();

drop trigger if exists set_vehicle_maintenance_records_updated_at on public.vehicle_maintenance_records;
create trigger set_vehicle_maintenance_records_updated_at
before update on public.vehicle_maintenance_records
for each row
execute function public.set_updated_at();

insert into public.vehicle_document_types (
  key,
  label_es,
  is_required_default,
  required_for_owned,
  required_for_external,
  expires_required,
  sort_order,
  is_active
)
values
  ('insurance', 'Seguro', true, true, true, true, 10, true),
  ('itv', 'ITV', true, true, true, true, 20, true),
  ('circulation_permit', 'Permiso de circulacion', true, true, true, false, 30, true),
  ('vtc_license', 'Licencia VTC', true, true, true, true, 40, true)
on conflict (key) do nothing;

insert into public.vehicle_status_reasons (
  key,
  label_es,
  category,
  blocks_operation,
  is_active
)
values
  ('documentation_missing', 'Documentacion pendiente', 'documentation', true, true),
  ('documentation_expired', 'Documentacion vencida', 'documentation', true, true),
  ('maintenance', 'Mantenimiento', 'maintenance', true, true),
  ('breakdown', 'Averia', 'breakdown', true, true),
  ('manual_block', 'Bloqueo manual', 'manual_block', true, true),
  ('external_review_pending', 'Aprobacion externa pendiente', 'external_approval', true, true),
  ('external_review_rejected', 'Aprobacion externa rechazada', 'external_approval', true, true)
on conflict (key) do nothing;

create or replace function public.normalize_vehicle_plate(
  p_plate_original text,
  p_plate_country text
)
returns text
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v_country text;
  v_compact text;
  v_plate text;
begin
  v_country := upper(trim(coalesce(p_plate_country, '')));

  if v_country = '' then
    raise exception 'Vehicle plate country is required.'
      using errcode = '23514';
  end if;

  if v_country = 'ES' then
    v_compact := upper(regexp_replace(trim(coalesce(p_plate_original, '')), '[[:space:]-]+', '', 'g'));

    if v_compact !~ '^[0-9]{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$' then
      raise exception 'Invalid Spanish vehicle plate "%".', p_plate_original
        using errcode = '23514';
    end if;

    return substring(v_compact from 1 for 4) || '-' || substring(v_compact from 5 for 3);
  end if;

  v_plate := upper(regexp_replace(trim(coalesce(p_plate_original, '')), '[[:space:]]+', ' ', 'g'));

  if v_plate = '' then
    raise exception 'Vehicle plate is required.'
      using errcode = '23514';
  end if;

  return v_country || ':' || v_plate;
end;
$$;

comment on function public.normalize_vehicle_plate(text, text) is
  'Normalizes Spanish plates to 0000-MMM and keeps foreign plates namespaced by country.';

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

  if new.human_code !~ '^VEH-[0-9]{6}$' then
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

comment on function public.prepare_vehicle_identity() is
  'Assigns VEH codes, freezes existing human codes, and normalizes vehicle plates.';

create or replace function public.validate_vehicle_owner_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.person_id is not null and not exists (
    select 1
    from public.persons person
    where person.id = new.person_id
      and person.status = 'active'
  ) then
    raise exception 'Active external vehicle owners require an active person.'
      using errcode = '23514';
  end if;

  if new.status = 'active' and new.company_id is not null and not exists (
    select 1
    from public.companies company
    where company.id = new.company_id
      and company.status = 'active'
  ) then
    raise exception 'Active external vehicle owners require an active company.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_vehicle_owner_integrity() is
  'Deferred validation for active external vehicle owners.';

create or replace function public.validate_vehicle_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ownership_type = 'external' and not exists (
    select 1
    from public.vehicle_external_owners owner_record
    where owner_record.id = new.external_owner_id
      and owner_record.status = 'active'
  ) then
    raise exception 'External vehicles require an active external owner.'
      using errcode = '23514';
  end if;

  if new.year is not null and new.year > extract(year from now())::integer + 1 then
    raise exception 'Vehicle year % is outside the allowed range.', new.year
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_vehicle_integrity() is
  'Deferred validation for vehicle ownership and dynamic year range.';

create or replace function public.validate_vehicle_document_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_required boolean;
begin
  select document_type.expires_required
  into v_expires_required
  from public.vehicle_document_types document_type
  where document_type.key = new.document_type_key;

  if v_expires_required = true
    and new.status not in ('pending', 'rejected')
    and new.expires_at is null
  then
    raise exception 'Vehicle document type "%" requires expires_at for status "%".', new.document_type_key, new.status
      using errcode = '23514';
  end if;

  if new.storage_path is not null and nullif(trim(new.storage_bucket), '') is null then
    raise exception 'Vehicle document storage_path requires storage_bucket.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_vehicle_document_integrity() is
  'Deferred validation for vehicle documents and expiration requirements.';

create or replace function public.vehicle_is_assignable(p_vehicle_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_vehicle_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.vehicles vehicle
    where vehicle.id = p_vehicle_id
      and vehicle.inactive_at is null
      and vehicle.manual_operational_status = 'available'
      and (
        (vehicle.ownership_type = 'owned' and vehicle.elara_approval_status = 'not_required')
        or
        (vehicle.ownership_type = 'external' and vehicle.elara_approval_status = 'approved')
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.vehicle_technical_incidents incident
    join public.vehicle_status_reasons reason
      on reason.key = incident.reason_key
    where incident.vehicle_id = p_vehicle_id
      and incident.status = 'open'
      and reason.blocks_operation = true
      and reason.is_active = true
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.vehicle_maintenance_records maintenance
    where maintenance.vehicle_id = p_vehicle_id
      and maintenance.status = 'in_progress'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.vehicles vehicle
    join public.vehicle_document_types document_type
      on document_type.is_active = true
      and (
        (vehicle.ownership_type = 'owned' and document_type.required_for_owned = true)
        or
        (vehicle.ownership_type = 'external' and document_type.required_for_external = true)
      )
    where vehicle.id = p_vehicle_id
      and not exists (
        select 1
        from public.vehicle_documents document
        where document.vehicle_id = vehicle.id
          and document.document_type_key = document_type.key
          and document.replaced_at is null
          and document.status in ('valid', 'expiring_soon')
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.vehicle_is_assignable(uuid) is
  'Returns true when a vehicle is active, approved, manually available, not blocked, and has valid required documents.';

create or replace function public.validate_driver_vehicle_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  if not exists (
    select 1
    from public.drivers driver
    where driver.id = new.driver_id
      and driver.administrative_status = 'active'
  ) then
    raise exception 'Active driver-vehicle assignments require an active driver.'
      using errcode = '23514';
  end if;

  if not public.vehicle_is_assignable(new.vehicle_id) then
    raise exception 'Vehicle "%" is not assignable.', new.vehicle_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_driver_vehicle_assignment() is
  'Deferred validation for active driver-vehicle assignments.';

create or replace function public.validate_vehicle_odometer_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest_km bigint;
begin
  select max(reading_km)
  into v_latest_km
  from public.vehicle_odometer_readings reading
  where reading.vehicle_id = new.vehicle_id
    and reading.id <> new.id;

  if v_latest_km is not null and new.reading_km < v_latest_km then
    if not new.is_correction then
      raise exception 'Normal odometer readings cannot decrease from % km to % km.', v_latest_km, new.reading_km
        using errcode = '23514';
    end if;

    if length(trim(coalesce(new.correction_reason, ''))) = 0 then
      raise exception 'Decreasing odometer corrections require a reason.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_vehicle_odometer_reading() is
  'Validates odometer monotonicity unless an explicit correction is recorded.';

drop trigger if exists prepare_vehicles_identity on public.vehicles;
create trigger prepare_vehicles_identity
before insert or update of human_code, plate_original, plate_country, year on public.vehicles
for each row
execute function public.prepare_vehicle_identity();

drop trigger if exists validate_vehicle_external_owners_integrity on public.vehicle_external_owners;
create constraint trigger validate_vehicle_external_owners_integrity
after insert or update on public.vehicle_external_owners
deferrable initially deferred
for each row
execute function public.validate_vehicle_owner_integrity();

drop trigger if exists validate_vehicles_integrity on public.vehicles;
create constraint trigger validate_vehicles_integrity
after insert or update on public.vehicles
deferrable initially deferred
for each row
execute function public.validate_vehicle_integrity();

drop trigger if exists validate_vehicle_documents_integrity on public.vehicle_documents;
create constraint trigger validate_vehicle_documents_integrity
after insert or update on public.vehicle_documents
deferrable initially deferred
for each row
execute function public.validate_vehicle_document_integrity();

drop trigger if exists validate_driver_vehicle_assignments_integrity on public.driver_vehicle_assignments;
create constraint trigger validate_driver_vehicle_assignments_integrity
after insert or update on public.driver_vehicle_assignments
deferrable initially deferred
for each row
execute function public.validate_driver_vehicle_assignment();

drop trigger if exists validate_vehicle_odometer_readings_integrity on public.vehicle_odometer_readings;
create constraint trigger validate_vehicle_odometer_readings_integrity
after insert or update on public.vehicle_odometer_readings
deferrable initially deferred
for each row
execute function public.validate_vehicle_odometer_reading();

revoke all on table public.vehicle_external_owners from public;
revoke all on table public.vehicles from public;
revoke all on table public.vehicle_document_types from public;
revoke all on table public.vehicle_documents from public;
revoke all on table public.vehicle_status_reasons from public;
revoke all on table public.vehicle_technical_incidents from public;
revoke all on table public.driver_vehicle_assignments from public;
revoke all on table public.vehicle_odometer_readings from public;
revoke all on table public.vehicle_maintenance_records from public;

revoke all on table public.vehicle_external_owners from anon;
revoke all on table public.vehicles from anon;
revoke all on table public.vehicle_document_types from anon;
revoke all on table public.vehicle_documents from anon;
revoke all on table public.vehicle_status_reasons from anon;
revoke all on table public.vehicle_technical_incidents from anon;
revoke all on table public.driver_vehicle_assignments from anon;
revoke all on table public.vehicle_odometer_readings from anon;
revoke all on table public.vehicle_maintenance_records from anon;

revoke all on table public.vehicle_external_owners from authenticated;
revoke all on table public.vehicles from authenticated;
revoke all on table public.vehicle_document_types from authenticated;
revoke all on table public.vehicle_documents from authenticated;
revoke all on table public.vehicle_status_reasons from authenticated;
revoke all on table public.vehicle_technical_incidents from authenticated;
revoke all on table public.driver_vehicle_assignments from authenticated;
revoke all on table public.vehicle_odometer_readings from authenticated;
revoke all on table public.vehicle_maintenance_records from authenticated;

grant select, insert, update, delete on table public.vehicle_external_owners to service_role;
grant select, insert, update, delete on table public.vehicles to service_role;
grant select, insert, update, delete on table public.vehicle_document_types to service_role;
grant select, insert, update, delete on table public.vehicle_documents to service_role;
grant select, insert, update, delete on table public.vehicle_status_reasons to service_role;
grant select, insert, update, delete on table public.vehicle_technical_incidents to service_role;
grant select, insert, update, delete on table public.driver_vehicle_assignments to service_role;
grant select, insert, update, delete on table public.vehicle_odometer_readings to service_role;
grant select, insert, update, delete on table public.vehicle_maintenance_records to service_role;

revoke all on function public.normalize_vehicle_plate(text, text) from public;
revoke all on function public.prepare_vehicle_identity() from public;
revoke all on function public.validate_vehicle_owner_integrity() from public;
revoke all on function public.validate_vehicle_integrity() from public;
revoke all on function public.validate_vehicle_document_integrity() from public;
revoke all on function public.vehicle_is_assignable(uuid) from public;
revoke all on function public.validate_driver_vehicle_assignment() from public;
revoke all on function public.validate_vehicle_odometer_reading() from public;

revoke execute on function public.normalize_vehicle_plate(text, text) from anon;
revoke execute on function public.prepare_vehicle_identity() from anon;
revoke execute on function public.validate_vehicle_owner_integrity() from anon;
revoke execute on function public.validate_vehicle_integrity() from anon;
revoke execute on function public.validate_vehicle_document_integrity() from anon;
revoke execute on function public.vehicle_is_assignable(uuid) from anon;
revoke execute on function public.validate_driver_vehicle_assignment() from anon;
revoke execute on function public.validate_vehicle_odometer_reading() from anon;

revoke execute on function public.normalize_vehicle_plate(text, text) from authenticated;
revoke execute on function public.prepare_vehicle_identity() from authenticated;
revoke execute on function public.validate_vehicle_owner_integrity() from authenticated;
revoke execute on function public.validate_vehicle_integrity() from authenticated;
revoke execute on function public.validate_vehicle_document_integrity() from authenticated;
revoke execute on function public.vehicle_is_assignable(uuid) from authenticated;
revoke execute on function public.validate_driver_vehicle_assignment() from authenticated;
revoke execute on function public.validate_vehicle_odometer_reading() from authenticated;

grant execute on function public.vehicle_is_assignable(uuid) to service_role;
grant execute on function public.normalize_vehicle_plate(text, text) to service_role;

do $$
declare
  missing_tables text[];
  missing_document_types text[];
  missing_status_reasons text[];
  missing_triggers text[];
begin
  with expected(table_name) as (
    values
      ('vehicle_external_owners'),
      ('vehicles'),
      ('vehicle_document_types'),
      ('vehicle_documents'),
      ('vehicle_status_reasons'),
      ('vehicle_technical_incidents'),
      ('driver_vehicle_assignments'),
      ('vehicle_odometer_readings'),
      ('vehicle_maintenance_records')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into missing_tables
  from expected
  where to_regclass('public.' || expected.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing vehicle domain tables: %.', missing_tables;
  end if;

  with expected(key) as (
    values ('insurance'), ('itv'), ('circulation_permit'), ('vtc_license')
  )
  select array_agg(expected.key order by expected.key)
  into missing_document_types
  from expected
  where not exists (
    select 1
    from public.vehicle_document_types document_type
    where document_type.key = expected.key
  );

  if missing_document_types is not null then
    raise exception 'Missing initial vehicle document types: %.', missing_document_types;
  end if;

  with expected(key) as (
    values
      ('documentation_missing'),
      ('documentation_expired'),
      ('maintenance'),
      ('breakdown'),
      ('manual_block'),
      ('external_review_pending'),
      ('external_review_rejected')
  )
  select array_agg(expected.key order by expected.key)
  into missing_status_reasons
  from expected
  where not exists (
    select 1
    from public.vehicle_status_reasons reason
    where reason.key = expected.key
  );

  if missing_status_reasons is not null then
    raise exception 'Missing initial vehicle status reasons: %.', missing_status_reasons;
  end if;

  with expected(trigger_name) as (
    values
      ('set_vehicle_external_owners_updated_at'),
      ('set_vehicles_updated_at'),
      ('set_vehicle_document_types_updated_at'),
      ('set_vehicle_documents_updated_at'),
      ('set_vehicle_status_reasons_updated_at'),
      ('set_vehicle_technical_incidents_updated_at'),
      ('set_vehicle_maintenance_records_updated_at'),
      ('prepare_vehicles_identity'),
      ('validate_vehicle_external_owners_integrity'),
      ('validate_vehicles_integrity'),
      ('validate_vehicle_documents_integrity'),
      ('validate_driver_vehicle_assignments_integrity'),
      ('validate_vehicle_odometer_readings_integrity')
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
    raise exception 'Missing vehicle domain triggers: %.', missing_triggers;
  end if;

  if to_regprocedure('public.vehicle_is_assignable(uuid)') is null then
    raise exception 'Missing function public.vehicle_is_assignable(uuid).';
  end if;

  if public.normalize_vehicle_plate('1234 BCD', 'ES') <> '1234-BCD' then
    raise exception 'Vehicle plate normalization failed for Spanish sample.';
  end if;

  if to_regclass('public.vehicles_plate_normalized_unique') is null then
    raise exception 'Missing unique constraint/index vehicles_plate_normalized_unique.';
  end if;

  if to_regclass('public.driver_vehicle_assignments_one_active_per_driver_idx') is null then
    raise exception 'Missing partial unique index driver_vehicle_assignments_one_active_per_driver_idx.';
  end if;

  if to_regclass('public.driver_vehicle_assignments_one_active_per_vehicle_idx') is null then
    raise exception 'Missing partial unique index driver_vehicle_assignments_one_active_per_vehicle_idx.';
  end if;

  if to_regclass('public.vehicle_technical_incidents_one_open_per_reason_idx') is null then
    raise exception 'Missing partial unique index vehicle_technical_incidents_one_open_per_reason_idx.';
  end if;

  if to_regclass('public.vehicle_documents_one_current_per_type_idx') is null then
    raise exception 'Missing partial unique index vehicle_documents_one_current_per_type_idx.';
  end if;

  if exists (
    select 1
    from public.vehicles
    where human_code !~ '^VEH-[0-9]{6}$'
  ) then
    raise exception 'Invalid VEH human_code format detected.';
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute public.next_human_code(text).';
  end if;

  if has_table_privilege('anon', 'public.vehicles', 'SELECT')
    or has_table_privilege('authenticated', 'public.vehicles', 'SELECT')
    or has_table_privilege('anon', 'public.vehicle_documents', 'SELECT')
    or has_table_privilege('authenticated', 'public.vehicle_documents', 'SELECT')
    or has_table_privilege('anon', 'public.driver_vehicle_assignments', 'SELECT')
    or has_table_privilege('authenticated', 'public.driver_vehicle_assignments', 'SELECT')
  then
    raise exception 'anon/authenticated must not have direct access to vehicle domain tables.';
  end if;
end;
$$;
