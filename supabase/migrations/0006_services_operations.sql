-- ELARA Transport V4.0
-- Migration 0006: services and operational assignments.
--
-- Creates the operational services domain only.
-- No finance, payments, cash, receivables, seed data, full RLS or frontend wiring.

create table if not exists public.services (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_type text not null,
  operational_status text not null default 'pending',
  scheduled_start_at timestamptz not null,
  notes text,
  internal_notes text,
  requested_by_user_id uuid references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  deleted_at timestamptz,
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,
  deleted_by uuid references public.app_users(id) on delete restrict,

  constraint services_human_code_unique
    unique (human_code),
  constraint services_human_code_format
    check (human_code ~ '^SRV-[0-9]{6}$'),
  constraint services_type_not_empty
    check (length(trim(service_type)) > 0),
  constraint services_operational_status_check
    check (operational_status in (
      'pending',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'no_show',
      'not_performed'
    )),
  constraint services_cancelled_at_required
    check (operational_status <> 'cancelled' or cancelled_at is not null),
  constraint services_deleted_by_required
    check (deleted_at is null or deleted_by is not null)
);

comment on table public.services is
  'Operational services. services.operational_status is the source of truth for the service operational state.';

create index if not exists services_customer_scheduled_idx
  on public.services (customer_id, scheduled_start_at);

create index if not exists services_status_scheduled_idx
  on public.services (operational_status, scheduled_start_at);

create table if not exists public.service_locations (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  location_type text not null,
  label text not null,
  address text,
  city text,
  postal_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  sort_order integer not null,
  scheduled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint service_locations_type_check
    check (location_type in ('origin', 'destination', 'stop')),
  constraint service_locations_label_not_empty
    check (length(trim(label)) > 0),
  constraint service_locations_sort_order_non_negative
    check (sort_order >= 0),
  constraint service_locations_latitude_range
    check (latitude is null or latitude between -90 and 90),
  constraint service_locations_longitude_range
    check (longitude is null or longitude between -180 and 180)
);

comment on table public.service_locations is
  'Origin, destination and ordered stops for a service.';

create unique index if not exists service_locations_one_origin_per_service_idx
  on public.service_locations (service_id)
  where location_type = 'origin';

create unique index if not exists service_locations_one_destination_per_service_idx
  on public.service_locations (service_id)
  where location_type = 'destination';

create unique index if not exists service_locations_one_sort_order_per_service_idx
  on public.service_locations (service_id, sort_order);

create table if not exists public.service_passengers (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  person_id uuid references public.persons(id) on delete restrict,
  display_name text not null,
  phone text,
  email text,
  notes text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint service_passengers_display_name_not_empty
    check (length(trim(display_name)) > 0)
);

comment on table public.service_passengers is
  'Passengers for a service. A passenger may be free text and does not require a registered person.';

create unique index if not exists service_passengers_one_primary_per_service_idx
  on public.service_passengers (service_id)
  where is_primary = true;

create table if not exists public.service_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_vehicle_assignment_id uuid references public.driver_vehicle_assignments(id) on delete restrict,
  assignment_status text not null default 'pending_acceptance',
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_driver_id uuid references public.drivers(id) on delete restrict,
  rejected_at timestamptz,
  rejected_by_driver_id uuid references public.drivers(id) on delete restrict,
  rejection_reason text,
  ended_at timestamptz,
  reassignment_reason text,
  internal_priority_exception boolean not null default false,
  priority_exception_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  ended_by uuid references public.app_users(id) on delete restrict,

  constraint service_assignments_status_check
    check (assignment_status in (
      'pending_acceptance',
      'accepted',
      'rejected',
      'ended',
      'cancelled',
      'reassignment_required'
    )),
  constraint service_assignments_accepted_fields_required
    check (assignment_status <> 'accepted' or accepted_at is not null),
  constraint service_assignments_rejected_fields_required
    check (
      assignment_status <> 'rejected'
      or (
        rejected_at is not null
        and length(trim(coalesce(rejection_reason, ''))) > 0
      )
    ),
  constraint service_assignments_ended_fields_required
    check (assignment_status not in ('ended', 'cancelled') or ended_at is not null),
  constraint service_assignments_priority_reason_required
    check (
      internal_priority_exception = false
      or length(trim(coalesce(priority_exception_reason, ''))) > 0
    ),
  constraint service_assignments_accepted_by_driver_matches
    check (accepted_by_driver_id is null or accepted_by_driver_id = driver_id),
  constraint service_assignments_rejected_by_driver_matches
    check (rejected_by_driver_id is null or rejected_by_driver_id = driver_id),
  constraint service_assignments_assigned_before_accepted
    check (accepted_at is null or assigned_at <= accepted_at),
  constraint service_assignments_assigned_before_rejected
    check (rejected_at is null or assigned_at <= rejected_at),
  constraint service_assignments_assigned_before_ended
    check (ended_at is null or assigned_at <= ended_at)
);

comment on table public.service_assignments is
  'Historical service driver and vehicle assignments. assignment_status is the source of truth for assignment and acceptance.';

create unique index if not exists service_assignments_one_active_per_service_idx
  on public.service_assignments (service_id)
  where assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required');

create index if not exists service_assignments_driver_status_idx
  on public.service_assignments (driver_id, assignment_status, assigned_at);

create table if not exists public.service_driver_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  assignment_id uuid not null references public.service_assignments(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  stage text not null default 'not_started',
  started_at timestamptz,
  arrived_at timestamptz,
  passenger_on_board_at timestamptz,
  finished_at timestamptz,
  last_update_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint service_driver_progress_stage_check
    check (stage in (
      'not_started',
      'on_way',
      'waiting_passenger',
      'passenger_on_board',
      'finishing',
      'finished'
    )),
  constraint service_driver_progress_started_required
    check (stage in ('not_started') or started_at is not null),
  constraint service_driver_progress_arrived_required
    check (stage not in ('waiting_passenger', 'passenger_on_board', 'finishing', 'finished') or arrived_at is not null),
  constraint service_driver_progress_passenger_required
    check (stage not in ('passenger_on_board', 'finishing', 'finished') or passenger_on_board_at is not null),
  constraint service_driver_progress_finished_required
    check (stage <> 'finished' or finished_at is not null),
  constraint service_driver_progress_started_before_arrived
    check (started_at is null or arrived_at is null or started_at <= arrived_at),
  constraint service_driver_progress_arrived_before_passenger
    check (arrived_at is null or passenger_on_board_at is null or arrived_at <= passenger_on_board_at),
  constraint service_driver_progress_passenger_before_finished
    check (passenger_on_board_at is null or finished_at is null or passenger_on_board_at <= finished_at)
);

comment on table public.service_driver_progress is
  'Current driver execution stage. service_driver_progress.stage is the source of truth for the current driver stage.';

create unique index if not exists service_driver_progress_one_active_per_service_idx
  on public.service_driver_progress (service_id)
  where stage <> 'finished';

create table if not exists public.service_closures (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  assignment_id uuid references public.service_assignments(id) on delete restrict,
  closure_type text not null,
  closed_at timestamptz not null,
  closed_by_user_id uuid references public.app_users(id) on delete restrict,
  closed_by_driver_id uuid references public.drivers(id) on delete restrict,
  reason_code text,
  reason_details text,
  rating smallint,
  driver_notes text,
  incident_flag boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint service_closures_type_check
    check (closure_type in ('completed', 'no_show', 'not_performed')),
  constraint service_closures_rating_range
    check (rating is null or rating between 1 and 5),
  constraint service_closures_single_closer
    check (closed_by_user_id is null or closed_by_driver_id is null)
);

comment on table public.service_closures is
  'Final service closure for completed, no-show and not-performed outcomes.';

create unique index if not exists service_closures_one_final_per_service_idx
  on public.service_closures (service_id);

create table if not exists public.service_cancellations (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  cancelled_at timestamptz not null,
  reason_code text not null,
  reason_details text,
  source text not null,
  cancelled_by_user_id uuid references public.app_users(id) on delete restrict,
  cancelled_by_driver_id uuid references public.drivers(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint service_cancellations_reason_not_empty
    check (length(trim(reason_code)) > 0),
  constraint service_cancellations_source_check
    check (source in ('administration', 'driver_portal', 'customer', 'system')),
  constraint service_cancellations_single_canceller
    check (cancelled_by_user_id is null or cancelled_by_driver_id is null)
);

comment on table public.service_cancellations is
  'Final service cancellation record.';

create unique index if not exists service_cancellations_one_final_per_service_idx
  on public.service_cancellations (service_id);

create table if not exists public.service_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  changed_by_driver_id uuid references public.drivers(id) on delete restrict,
  assignment_id uuid references public.service_assignments(id) on delete restrict,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),

  constraint service_status_history_from_status_check
    check (
      from_status is null
      or from_status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'not_performed')
    ),
  constraint service_status_history_to_status_check
    check (to_status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'not_performed')),
  constraint service_status_history_single_actor
    check (changed_by_user_id is null or changed_by_driver_id is null)
);

comment on table public.service_status_history is
  'Append-only history of services.operational_status transitions.';

create index if not exists service_status_history_service_changed_idx
  on public.service_status_history (service_id, changed_at);

create table if not exists public.service_events (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.app_users(id) on delete restrict,
  actor_driver_id uuid references public.drivers(id) on delete restrict,
  assignment_id uuid references public.service_assignments(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  title text,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now(),

  constraint service_events_type_check
    check (event_type in (
      'service_created',
      'service_updated',
      'assignment_created',
      'assignment_accepted',
      'assignment_rejected',
      'assignment_reassigned',
      'internal_driver_priority_overridden',
      'service_started',
      'driver_stage_updated',
      'service_completed',
      'service_cancelled',
      'service_no_show',
      'service_not_performed'
    )),
  constraint service_events_single_actor
    check (actor_user_id is null or actor_driver_id is null)
);

comment on table public.service_events is
  'Append-only operational event log for services.';

create index if not exists service_events_service_occurred_idx
  on public.service_events (service_id, occurred_at);

create table if not exists public.service_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  assignment_id uuid references public.service_assignments(id) on delete restrict,
  snapshot_type text not null,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,

  constraint service_snapshots_type_check
    check (snapshot_type in ('customer', 'passenger', 'driver', 'vehicle', 'route')),
  constraint service_snapshots_data_object_check
    check (jsonb_typeof(snapshot_data) = 'object')
);

comment on table public.service_snapshots is
  'Append-only historical snapshots for audit. Snapshots do not replace live relationships.';

create index if not exists service_snapshots_service_type_idx
  on public.service_snapshots (service_id, snapshot_type, created_at);

drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at
before update on public.services
for each row
execute function public.set_updated_at();

drop trigger if exists set_service_locations_updated_at on public.service_locations;
create trigger set_service_locations_updated_at
before update on public.service_locations
for each row
execute function public.set_updated_at();

drop trigger if exists set_service_passengers_updated_at on public.service_passengers;
create trigger set_service_passengers_updated_at
before update on public.service_passengers
for each row
execute function public.set_updated_at();

drop trigger if exists set_service_driver_progress_updated_at on public.service_driver_progress;
create trigger set_service_driver_progress_updated_at
before update on public.service_driver_progress
for each row
execute function public.set_updated_at();

create or replace function public.assign_service_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.human_code is distinct from old.human_code then
    raise exception 'Service human_code cannot be changed after creation.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if nullif(trim(new.human_code), '') is null then
      new.human_code := public.next_human_code('SRV');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  end if;

  if new.human_code !~ '^SRV-[0-9]{6}$' then
    raise exception 'Invalid service human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.assign_service_human_code() is
  'Assigns SRV human codes and prevents code changes after creation.';

create or replace function public.has_available_internal_driver(
  p_scheduled_start_at timestamptz,
  p_excluded_driver_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_scheduled_start_at is null then
    return false;
  end if;

  return exists (
    select 1
    from public.drivers driver
    join public.persons person
      on person.id = driver.person_id
      and person.status = 'active'
    join public.driver_vehicle_assignments driver_vehicle_assignment
      on driver_vehicle_assignment.driver_id = driver.id
      and driver_vehicle_assignment.status = 'active'
    join public.vehicles vehicle
      on vehicle.id = driver_vehicle_assignment.vehicle_id
      and vehicle.inactive_at is null
    where driver.driver_type = 'internal_driver'
      and driver.administrative_status = 'active'
      and driver.availability_preference = 'available'
      and (p_excluded_driver_id is null or driver.id <> p_excluded_driver_id)
      and public.vehicle_is_assignable(driver_vehicle_assignment.vehicle_id)
      and exists (
        select 1
        from public.user_driver_links driver_link
        join public.app_users app_user
          on app_user.id = driver_link.user_id
          and app_user.status = 'active'
        where driver_link.driver_id = driver.id
          and driver_link.status = 'active'
          and exists (
            select 1
            from public.user_roles user_role
            where user_role.user_id = app_user.id
              and user_role.role_key = 'conductor'
              and user_role.status = 'active'
              and user_role.starts_at <= now()
              and (user_role.ends_at is null or user_role.ends_at > now())
          )
      )
      and not exists (
        select 1
        from public.services active_service
        join public.service_assignments active_assignment
          on active_assignment.service_id = active_service.id
          and active_assignment.driver_id = driver.id
          and active_assignment.assignment_status = 'accepted'
        where active_service.operational_status = 'in_progress'
      )
      and not exists (
        select 1
        from public.services scheduled_service
        join public.service_assignments scheduled_assignment
          on scheduled_assignment.service_id = scheduled_service.id
          and scheduled_assignment.driver_id = driver.id
          and scheduled_assignment.assignment_status = 'accepted'
        where scheduled_service.operational_status = 'confirmed'
          and scheduled_service.scheduled_start_at >= p_scheduled_start_at - interval '2 hours'
          and scheduled_service.scheduled_start_at <= p_scheduled_start_at + interval '2 hours'
      )
  );
end;
$$;

comment on function public.has_available_internal_driver(timestamptz, uuid) is
  'Returns whether an internal driver is available for an obvious scheduling window. Route optimization is intentionally out of scope.';

create or replace function public.validate_service_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_final_statuses constant text[] := array['completed', 'cancelled', 'no_show', 'not_performed'];
begin
  if tg_op <> 'UPDATE' or new.operational_status is not distinct from old.operational_status then
    return new;
  end if;

  if old.operational_status = any(v_final_statuses)
    and new.operational_status is distinct from old.operational_status
  then
    raise exception 'Final services cannot return to a previous operational status.'
      using errcode = '23514';
  end if;

  if old.operational_status = 'in_progress' and new.operational_status = 'cancelled' then
    raise exception 'In-progress services cannot be normally cancelled.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_service_transition() is
  'Prevents invalid direct operational status transitions.';

create or replace function public.validate_service_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_origin boolean;
  v_has_destination boolean;
  v_has_accepted_assignment boolean;
  v_has_valid_start_assignment boolean;
begin
  if not exists (
    select 1
    from public.customers customer
    where customer.id = new.customer_id
      and customer.status in ('new', 'active')
  ) then
    raise exception 'Services require an active or new customer.'
      using errcode = '23514';
  end if;

  if new.operational_status in ('confirmed', 'in_progress', 'completed', 'no_show', 'not_performed') then
    select exists (
      select 1 from public.service_locations location
      where location.service_id = new.id and location.location_type = 'origin'
    )
    into v_has_origin;

    select exists (
      select 1 from public.service_locations location
      where location.service_id = new.id and location.location_type = 'destination'
    )
    into v_has_destination;

    if not (v_has_origin and v_has_destination) then
      raise exception 'Services require origin and destination before confirmation.'
        using errcode = '23514';
    end if;
  end if;

  if new.operational_status in ('confirmed', 'in_progress') then
    select exists (
      select 1
      from public.service_assignments assignment
      where assignment.service_id = new.id
        and assignment.assignment_status = 'accepted'
    )
    into v_has_accepted_assignment;

    if not v_has_accepted_assignment then
      raise exception 'Services require an accepted assignment before confirmation.'
        using errcode = '23514';
    end if;
  end if;

  if new.operational_status = 'in_progress' then
    select exists (
      select 1
      from public.service_assignments assignment
      join public.driver_vehicle_assignments driver_vehicle_assignment
        on driver_vehicle_assignment.driver_id = assignment.driver_id
        and driver_vehicle_assignment.vehicle_id = assignment.vehicle_id
        and driver_vehicle_assignment.status = 'active'
      where assignment.service_id = new.id
        and assignment.assignment_status = 'accepted'
        and public.vehicle_is_assignable(assignment.vehicle_id)
    )
    into v_has_valid_start_assignment;

    if not v_has_valid_start_assignment then
      raise exception 'Services require an accepted assignment with a valid driver-vehicle relation before starting.'
        using errcode = '23514';
    end if;
  end if;

  if new.operational_status in ('completed', 'no_show', 'not_performed') and not exists (
    select 1
    from public.service_closures closure_record
    where closure_record.service_id = new.id
      and closure_record.closure_type = new.operational_status
  ) then
    raise exception 'Final closure status requires a matching service closure.'
      using errcode = '23514';
  end if;

  if new.operational_status = 'cancelled' and not exists (
    select 1
    from public.service_cancellations cancellation
    where cancellation.service_id = new.id
  ) then
    raise exception 'Cancelled services require a service cancellation record.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_service_integrity() is
  'Deferred validation for customer, route, assignment and final operational status consistency.';

create or replace function public.validate_service_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_status text;
  v_service_start timestamptz;
  v_driver_type text;
  v_driver_vehicle_assignment_id uuid;
begin
  if new.assignment_status not in ('pending_acceptance', 'accepted', 'reassignment_required') then
    return new;
  end if;

  select service.operational_status, service.scheduled_start_at
  into v_service_status, v_service_start
  from public.services service
  where service.id = new.service_id;

  if v_service_status is null then
    raise exception 'Service assignment references a missing service.'
      using errcode = '23514';
  end if;

  if v_service_status in ('completed', 'cancelled', 'no_show', 'not_performed') then
    raise exception 'Final services cannot receive active assignments.'
      using errcode = '23514';
  end if;

  if v_service_status = 'in_progress' then
    raise exception 'Normal reassignment is not allowed while the service is in progress.'
      using errcode = '23514';
  end if;

  select driver.driver_type
  into v_driver_type
  from public.drivers driver
  where driver.id = new.driver_id
    and driver.administrative_status = 'active';

  if v_driver_type is null then
    raise exception 'Active service assignments require an active driver.'
      using errcode = '23514';
  end if;

  if not public.vehicle_is_assignable(new.vehicle_id) then
    raise exception 'Active service assignments require an assignable vehicle.'
      using errcode = '23514';
  end if;

  select assignment.id
  into v_driver_vehicle_assignment_id
  from public.driver_vehicle_assignments assignment
  where assignment.driver_id = new.driver_id
    and assignment.vehicle_id = new.vehicle_id
    and assignment.status = 'active'
  limit 1;

  if v_driver_vehicle_assignment_id is null then
    raise exception 'Active service assignments require an active driver-vehicle assignment.'
      using errcode = '23514';
  end if;

  if new.driver_vehicle_assignment_id is not null
    and new.driver_vehicle_assignment_id <> v_driver_vehicle_assignment_id
  then
    raise exception 'Service assignment driver_vehicle_assignment_id does not match the active driver-vehicle assignment.'
      using errcode = '23514';
  end if;

  if v_driver_type = 'external_collaborator'
    and public.has_available_internal_driver(v_service_start, new.driver_id)
    and (
      new.internal_priority_exception = false
      or length(trim(coalesce(new.priority_exception_reason, ''))) = 0
    )
  then
    raise exception 'External collaborator assignment requires an internal driver priority exception reason when an internal driver is available.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_service_assignment_integrity() is
  'Deferred validation for service assignment status, driver, vehicle, active driver-vehicle relation and internal driver priority.';

create or replace function public.record_internal_priority_exception_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_record boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_record := new.internal_priority_exception = true;
  elsif tg_op = 'UPDATE' then
    v_should_record :=
      new.internal_priority_exception = true
      and (
        old.internal_priority_exception is distinct from true
        or old.priority_exception_reason is distinct from new.priority_exception_reason
      );
  end if;

  if v_should_record
    and new.assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required')
  then
    insert into public.service_events (
      service_id,
      event_type,
      occurred_at,
      actor_user_id,
      assignment_id,
      vehicle_id,
      title,
      description,
      metadata,
      created_at
    )
    values (
      new.service_id,
      'internal_driver_priority_overridden',
      now(),
      new.created_by,
      new.id,
      new.vehicle_id,
      'Internal driver priority overridden',
      new.priority_exception_reason,
      jsonb_build_object(
        'driver_id', new.driver_id,
        'vehicle_id', new.vehicle_id,
        'driver_vehicle_assignment_id', new.driver_vehicle_assignment_id,
        'priority_exception_reason', new.priority_exception_reason
      ),
      now()
    );
  end if;

  return new;
end;
$$;

comment on function public.record_internal_priority_exception_event() is
  'Records an append-only service event when an external collaborator overrides internal driver priority.';

create or replace function public.validate_service_driver_progress_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.service_assignments%rowtype;
  v_service_status text;
begin
  select *
  into v_assignment
  from public.service_assignments assignment
  where assignment.id = new.assignment_id;

  if v_assignment.id is null then
    raise exception 'Driver progress references a missing assignment.'
      using errcode = '23514';
  end if;

  if v_assignment.service_id <> new.service_id or v_assignment.driver_id <> new.driver_id then
    raise exception 'Driver progress must match the service and driver of its assignment.'
      using errcode = '23514';
  end if;

  if v_assignment.assignment_status <> 'accepted' then
    raise exception 'Driver progress requires an accepted assignment.'
      using errcode = '23514';
  end if;

  select service.operational_status
  into v_service_status
  from public.services service
  where service.id = new.service_id;

  if new.stage <> 'not_started' and v_service_status <> 'in_progress' then
    raise exception 'Only in-progress services can advance driver stages.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.stage <> new.stage then
    if array_position(array['not_started', 'on_way', 'waiting_passenger', 'passenger_on_board', 'finishing', 'finished'], new.stage)
      < array_position(array['not_started', 'on_way', 'waiting_passenger', 'passenger_on_board', 'finishing', 'finished'], old.stage)
    then
      raise exception 'Driver progress stages cannot move backwards.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_service_driver_progress_integrity() is
  'Deferred validation for service driver progress and stage sequence.';

create or replace function public.validate_service_closure_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_status text;
begin
  select service.operational_status
  into v_service_status
  from public.services service
  where service.id = new.service_id;

  if v_service_status is null then
    raise exception 'Service closure references a missing service.'
      using errcode = '23514';
  end if;

  if v_service_status <> new.closure_type then
    raise exception 'Service closure type must match the service final operational status.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_service_closure_integrity() is
  'Deferred validation that final service closures match services.operational_status.';

create or replace function public.validate_service_cancellation_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_status text;
begin
  select service.operational_status
  into v_service_status
  from public.services service
  where service.id = new.service_id;

  if v_service_status is null then
    raise exception 'Service cancellation references a missing service.'
      using errcode = '23514';
  end if;

  if v_service_status <> 'cancelled' then
    raise exception 'Service cancellations require services.operational_status = cancelled.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validate_service_cancellation_integrity() is
  'Deferred validation that cancellation records match cancelled services.';

create or replace function public.prevent_service_physical_delete_with_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.service_locations where service_id = old.id)
    or exists (select 1 from public.service_passengers where service_id = old.id)
    or exists (select 1 from public.service_assignments where service_id = old.id)
    or exists (select 1 from public.service_driver_progress where service_id = old.id)
    or exists (select 1 from public.service_closures where service_id = old.id)
    or exists (select 1 from public.service_cancellations where service_id = old.id)
    or exists (select 1 from public.service_status_history where service_id = old.id)
    or exists (select 1 from public.service_events where service_id = old.id)
    or exists (select 1 from public.service_snapshots where service_id = old.id)
  then
    raise exception 'Services with operational history must be soft-deleted, not physically deleted.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

comment on function public.prevent_service_physical_delete_with_history() is
  'Prevents physical deletion of services once operational history exists.';

create or replace function public.prevent_service_append_only_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Service history, events and snapshots are append-only.'
    using errcode = '23514';
end;
$$;

comment on function public.prevent_service_append_only_changes() is
  'Prevents updates and deletes on append-only service audit tables.';

drop trigger if exists assign_services_human_code on public.services;
create trigger assign_services_human_code
before insert or update of human_code on public.services
for each row
execute function public.assign_service_human_code();

drop trigger if exists validate_services_transition on public.services;
create trigger validate_services_transition
before update of operational_status on public.services
for each row
execute function public.validate_service_transition();

drop trigger if exists prevent_services_physical_delete_with_history on public.services;
create trigger prevent_services_physical_delete_with_history
before delete on public.services
for each row
execute function public.prevent_service_physical_delete_with_history();

drop trigger if exists validate_services_integrity on public.services;
create constraint trigger validate_services_integrity
after insert or update on public.services
deferrable initially deferred
for each row
execute function public.validate_service_integrity();

drop trigger if exists validate_service_assignments_integrity on public.service_assignments;
create constraint trigger validate_service_assignments_integrity
after insert or update on public.service_assignments
deferrable initially deferred
for each row
execute function public.validate_service_assignment_integrity();

drop trigger if exists record_service_assignments_priority_exception_event on public.service_assignments;
create trigger record_service_assignments_priority_exception_event
after insert or update of internal_priority_exception, priority_exception_reason, assignment_status on public.service_assignments
for each row
execute function public.record_internal_priority_exception_event();

drop trigger if exists validate_service_driver_progress_integrity on public.service_driver_progress;
create constraint trigger validate_service_driver_progress_integrity
after insert or update on public.service_driver_progress
deferrable initially deferred
for each row
execute function public.validate_service_driver_progress_integrity();

drop trigger if exists validate_service_closures_integrity on public.service_closures;
create constraint trigger validate_service_closures_integrity
after insert or update on public.service_closures
deferrable initially deferred
for each row
execute function public.validate_service_closure_integrity();

drop trigger if exists validate_service_cancellations_integrity on public.service_cancellations;
create constraint trigger validate_service_cancellations_integrity
after insert or update on public.service_cancellations
deferrable initially deferred
for each row
execute function public.validate_service_cancellation_integrity();

drop trigger if exists prevent_service_status_history_updates on public.service_status_history;
create trigger prevent_service_status_history_updates
before update or delete on public.service_status_history
for each row
execute function public.prevent_service_append_only_changes();

drop trigger if exists prevent_service_events_updates on public.service_events;
create trigger prevent_service_events_updates
before update or delete on public.service_events
for each row
execute function public.prevent_service_append_only_changes();

drop trigger if exists prevent_service_snapshots_updates on public.service_snapshots;
create trigger prevent_service_snapshots_updates
before update or delete on public.service_snapshots
for each row
execute function public.prevent_service_append_only_changes();

revoke all on table public.services from public;
revoke all on table public.service_locations from public;
revoke all on table public.service_passengers from public;
revoke all on table public.service_assignments from public;
revoke all on table public.service_driver_progress from public;
revoke all on table public.service_closures from public;
revoke all on table public.service_cancellations from public;
revoke all on table public.service_status_history from public;
revoke all on table public.service_events from public;
revoke all on table public.service_snapshots from public;

revoke all on table public.services from anon;
revoke all on table public.service_locations from anon;
revoke all on table public.service_passengers from anon;
revoke all on table public.service_assignments from anon;
revoke all on table public.service_driver_progress from anon;
revoke all on table public.service_closures from anon;
revoke all on table public.service_cancellations from anon;
revoke all on table public.service_status_history from anon;
revoke all on table public.service_events from anon;
revoke all on table public.service_snapshots from anon;

revoke all on table public.services from authenticated;
revoke all on table public.service_locations from authenticated;
revoke all on table public.service_passengers from authenticated;
revoke all on table public.service_assignments from authenticated;
revoke all on table public.service_driver_progress from authenticated;
revoke all on table public.service_closures from authenticated;
revoke all on table public.service_cancellations from authenticated;
revoke all on table public.service_status_history from authenticated;
revoke all on table public.service_events from authenticated;
revoke all on table public.service_snapshots from authenticated;

grant select, insert, update, delete on table public.services to service_role;
grant select, insert, update, delete on table public.service_locations to service_role;
grant select, insert, update, delete on table public.service_passengers to service_role;
grant select, insert, update, delete on table public.service_assignments to service_role;
grant select, insert, update, delete on table public.service_driver_progress to service_role;
grant select, insert, update, delete on table public.service_closures to service_role;
grant select, insert, update, delete on table public.service_cancellations to service_role;
grant select, insert on table public.service_status_history to service_role;
grant select, insert on table public.service_events to service_role;
grant select, insert on table public.service_snapshots to service_role;

revoke all on function public.assign_service_human_code() from public;
revoke all on function public.has_available_internal_driver(timestamptz, uuid) from public;
revoke all on function public.validate_service_transition() from public;
revoke all on function public.validate_service_integrity() from public;
revoke all on function public.validate_service_assignment_integrity() from public;
revoke all on function public.record_internal_priority_exception_event() from public;
revoke all on function public.validate_service_driver_progress_integrity() from public;
revoke all on function public.validate_service_closure_integrity() from public;
revoke all on function public.validate_service_cancellation_integrity() from public;
revoke all on function public.prevent_service_physical_delete_with_history() from public;
revoke all on function public.prevent_service_append_only_changes() from public;

revoke execute on function public.assign_service_human_code() from anon;
revoke execute on function public.has_available_internal_driver(timestamptz, uuid) from anon;
revoke execute on function public.validate_service_transition() from anon;
revoke execute on function public.validate_service_integrity() from anon;
revoke execute on function public.validate_service_assignment_integrity() from anon;
revoke execute on function public.record_internal_priority_exception_event() from anon;
revoke execute on function public.validate_service_driver_progress_integrity() from anon;
revoke execute on function public.validate_service_closure_integrity() from anon;
revoke execute on function public.validate_service_cancellation_integrity() from anon;
revoke execute on function public.prevent_service_physical_delete_with_history() from anon;
revoke execute on function public.prevent_service_append_only_changes() from anon;

revoke execute on function public.assign_service_human_code() from authenticated;
revoke execute on function public.has_available_internal_driver(timestamptz, uuid) from authenticated;
revoke execute on function public.validate_service_transition() from authenticated;
revoke execute on function public.validate_service_integrity() from authenticated;
revoke execute on function public.validate_service_assignment_integrity() from authenticated;
revoke execute on function public.record_internal_priority_exception_event() from authenticated;
revoke execute on function public.validate_service_driver_progress_integrity() from authenticated;
revoke execute on function public.validate_service_closure_integrity() from authenticated;
revoke execute on function public.validate_service_cancellation_integrity() from authenticated;
revoke execute on function public.prevent_service_physical_delete_with_history() from authenticated;
revoke execute on function public.prevent_service_append_only_changes() from authenticated;

grant execute on function public.has_available_internal_driver(timestamptz, uuid) to service_role;

do $$
declare
  missing_tables text[];
  missing_indexes text[];
  missing_triggers text[];
  missing_functions text[];
  insecure_tables text[];
  executable_functions text[];
begin
  with expected(table_name) as (
    values
      ('services'),
      ('service_locations'),
      ('service_passengers'),
      ('service_assignments'),
      ('service_driver_progress'),
      ('service_closures'),
      ('service_cancellations'),
      ('service_status_history'),
      ('service_events'),
      ('service_snapshots')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into missing_tables
  from expected
  where to_regclass('public.' || expected.table_name) is null;

  if missing_tables is not null then
    raise exception 'Missing service domain tables: %.', missing_tables;
  end if;

  if not exists (
    select 1
    from public.human_code_counters
    where prefix = 'SRV'
      and padding = 6
      and is_active = true
  ) then
    raise exception 'SRV human code counter must exist with padding 6 and active status.';
  end if;

  if exists (
    select 1
    from public.services
    where human_code !~ '^SRV-[0-9]{6}$'
  ) then
    raise exception 'Invalid SRV human_code format detected.';
  end if;

  with expected(index_name) as (
    values
      ('service_locations_one_origin_per_service_idx'),
      ('service_locations_one_destination_per_service_idx'),
      ('service_locations_one_sort_order_per_service_idx'),
      ('service_passengers_one_primary_per_service_idx'),
      ('service_assignments_one_active_per_service_idx'),
      ('service_driver_progress_one_active_per_service_idx'),
      ('service_closures_one_final_per_service_idx'),
      ('service_cancellations_one_final_per_service_idx')
  )
  select array_agg(expected.index_name order by expected.index_name)
  into missing_indexes
  from expected
  where to_regclass('public.' || expected.index_name) is null;

  if missing_indexes is not null then
    raise exception 'Missing service domain partial/unique indexes: %.', missing_indexes;
  end if;

  with expected(trigger_name) as (
    values
      ('set_services_updated_at'),
      ('set_service_locations_updated_at'),
      ('set_service_passengers_updated_at'),
      ('set_service_driver_progress_updated_at'),
      ('assign_services_human_code'),
      ('validate_services_transition'),
      ('prevent_services_physical_delete_with_history'),
      ('validate_services_integrity'),
      ('validate_service_assignments_integrity'),
      ('record_service_assignments_priority_exception_event'),
      ('validate_service_driver_progress_integrity'),
      ('validate_service_closures_integrity'),
      ('validate_service_cancellations_integrity'),
      ('prevent_service_status_history_updates'),
      ('prevent_service_events_updates'),
      ('prevent_service_snapshots_updates')
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
    raise exception 'Missing service domain triggers: %.', missing_triggers;
  end if;

  with expected(function_signature) as (
    values
      ('public.assign_service_human_code()'),
      ('public.has_available_internal_driver(timestamp with time zone,uuid)'),
      ('public.validate_service_transition()'),
      ('public.validate_service_integrity()'),
      ('public.validate_service_assignment_integrity()'),
      ('public.record_internal_priority_exception_event()'),
      ('public.validate_service_driver_progress_integrity()'),
      ('public.validate_service_closure_integrity()'),
      ('public.validate_service_cancellation_integrity()'),
      ('public.prevent_service_physical_delete_with_history()'),
      ('public.prevent_service_append_only_changes()')
  )
  select array_agg(expected.function_signature order by expected.function_signature)
  into missing_functions
  from expected
  where to_regprocedure(expected.function_signature) is null;

  if missing_functions is not null then
    raise exception 'Missing service domain functions: %.', missing_functions;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_operational_status_check'
      and conrelid = 'public.services'::regclass
  ) then
    raise exception 'Missing services operational status check.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_assignments_status_check'
      and conrelid = 'public.service_assignments'::regclass
  ) then
    raise exception 'Missing service assignments status check.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_driver_progress_stage_check'
      and conrelid = 'public.service_driver_progress'::regclass
  ) then
    raise exception 'Missing service driver progress stage check.';
  end if;

  with expected(table_name) as (
    values
      ('services'),
      ('service_locations'),
      ('service_passengers'),
      ('service_assignments'),
      ('service_driver_progress'),
      ('service_closures'),
      ('service_cancellations'),
      ('service_status_history'),
      ('service_events'),
      ('service_snapshots')
  )
  select array_agg(expected.table_name order by expected.table_name)
  into insecure_tables
  from expected
  where has_table_privilege('anon', 'public.' || expected.table_name, 'SELECT')
     or has_table_privilege('authenticated', 'public.' || expected.table_name, 'SELECT')
     or has_table_privilege('anon', 'public.' || expected.table_name, 'INSERT')
     or has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT')
     or has_table_privilege('anon', 'public.' || expected.table_name, 'UPDATE')
     or has_table_privilege('authenticated', 'public.' || expected.table_name, 'UPDATE')
     or has_table_privilege('anon', 'public.' || expected.table_name, 'DELETE')
     or has_table_privilege('authenticated', 'public.' || expected.table_name, 'DELETE');

  if insecure_tables is not null then
    raise exception 'anon/authenticated must not have direct access to service domain tables: %.', insecure_tables;
  end if;

  with expected(function_signature) as (
    values
      ('public.assign_service_human_code()'),
      ('public.has_available_internal_driver(timestamp with time zone,uuid)'),
      ('public.validate_service_transition()'),
      ('public.validate_service_integrity()'),
      ('public.validate_service_assignment_integrity()'),
      ('public.record_internal_priority_exception_event()'),
      ('public.validate_service_driver_progress_integrity()'),
      ('public.validate_service_closure_integrity()'),
      ('public.validate_service_cancellation_integrity()'),
      ('public.prevent_service_physical_delete_with_history()'),
      ('public.prevent_service_append_only_changes()')
  )
  select array_agg(expected.function_signature order by expected.function_signature)
  into executable_functions
  from expected
  where has_function_privilege('anon', expected.function_signature, 'EXECUTE')
     or has_function_privilege('authenticated', expected.function_signature, 'EXECUTE');

  if executable_functions is not null then
    raise exception 'anon/authenticated must not execute service domain functions: %.', executable_functions;
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute public.next_human_code(text).';
  end if;
end;
$$;
