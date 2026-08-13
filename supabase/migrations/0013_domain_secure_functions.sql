-- ELARA Transport V4.0
-- Migration 0013: secure domain functions.
--
-- First SECURITY DEFINER RPC layer over migrations 0001-0012.
-- No RLS policies, Storage buckets, frontend code, tables or seed data.
-- Operations without enough schema support fail explicitly instead of inventing semantics.

create or replace function public.current_active_context()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_context text;
begin
  select s.active_context
    into v_context
  from public.app_sessions s
  join public.app_users u on u.id = s.app_user_id and u.auth_user_id = s.auth_user_id
  where s.auth_user_id = auth.uid()
    and s.supabase_session_id = public.current_auth_session_id()
    and s.ended_at is null
    and s.expires_at > now()
    and u.status = 'active'
    and public.user_has_active_role(u.id, s.active_context)
  limit 1;

  return v_context;
end;
$$;

create or replace function public.require_current_app_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if public.current_auth_session_id() is null then
    raise exception 'A valid Supabase session_id claim is required.' using errcode = '28000';
  end if;

  select u.id
    into v_user_id
  from public.app_users u
  join public.app_sessions s on s.app_user_id = u.id and s.auth_user_id = u.auth_user_id
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and s.supabase_session_id = public.current_auth_session_id()
    and s.ended_at is null
    and s.expires_at > now()
    and public.user_has_active_role(u.id, s.active_context)
  limit 1;

  if v_user_id is null then
    raise exception 'Active application user and session are required.' using errcode = '28000';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.require_any_role(p_role_keys text[])
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_context text;
  v_roles text[];
begin
  select array_agg(lower(trim(role_key)))
    into v_roles
  from unnest(p_role_keys) as role_input(role_key)
  where length(trim(role_key)) > 0;

  if v_roles is null or cardinality(v_roles) = 0 then
    raise exception 'At least one role is required.' using errcode = '42501';
  end if;

  v_user_id := public.require_current_app_user();
  v_context := public.current_active_context();

  if v_context is null or v_context <> all(v_roles) then
    raise exception 'Active context is not authorized for this operation.' using errcode = '42501';
  end if;

  if not exists (select 1 from unnest(v_roles) r where public.user_has_active_role(v_user_id, r)) then
    raise exception 'Required role is not assigned to the active user.' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.require_role(p_role_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.require_any_role(array[p_role_key]);
end;
$$;

create or replace function public.require_admin_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.require_any_role(array['superadmin', 'administrativo']);
end;
$$;

create or replace function public.require_superadmin_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.require_role('superadmin');
end;
$$;

create or replace function public.current_driver_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_driver_id uuid;
begin
  v_user_id := public.require_role('conductor');

  select l.driver_id
    into v_driver_id
  from public.user_driver_links l
  join public.drivers d on d.id = l.driver_id
  where l.user_id = v_user_id
    and l.status = 'active'
    and (l.ended_at is null or l.ended_at > now())
    and d.administrative_status = 'active'
  limit 1;

  if v_driver_id is null then
    raise exception 'The active conductor user is not linked to an active driver.' using errcode = '42501';
  end if;

  return v_driver_id;
end;
$$;

create or replace function public.secure_audit(
  p_action text,
  p_entity_table text,
  p_entity_id uuid,
  p_entity_human_code text,
  p_old_data jsonb,
  p_new_data jsonb,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_app_user_id uuid default null,
  p_actor_driver_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return public.write_audit_log(
    'secure_function', p_action, p_entity_table, p_entity_id, p_entity_human_code,
    p_old_data, p_new_data, p_reason, coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_actor_app_user_id, public.require_current_app_user()), p_actor_driver_id
  );
end;
$$;

create or replace function public.secure_not_implemented(p_operation text, p_reason text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  raise exception 'Decision pending before completing %. %', p_operation, p_reason using errcode = '0A000';
end;
$$;
-- Identity and context RPC.
create or replace function public.set_active_context(p_active_context text)
returns table(app_session_id uuid, active_context text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_context text;
begin
  v_user_id := public.require_current_app_user();
  v_context := lower(trim(coalesce(p_active_context, '')));

  if v_context not in ('superadmin', 'administrativo', 'conductor') then
    raise exception 'Invalid active_context "%".', p_active_context using errcode = '23514';
  end if;
  if not public.user_has_active_role(v_user_id, v_context) then
    raise exception 'The requested active_context is not assigned to the active user.' using errcode = '42501';
  end if;

  update public.app_sessions s
     set active_context = v_context,
         last_seen_at = now()
   where s.auth_user_id = auth.uid()
     and s.app_user_id = v_user_id
     and s.supabase_session_id = public.current_auth_session_id()
     and s.ended_at is null
     and s.expires_at > now()
  returning s.id, s.active_context into app_session_id, active_context;

  if app_session_id is null then
    raise exception 'Current app session was not found.' using errcode = '28000';
  end if;

  return next;
end;
$$;

create or replace function public.assign_user_role(p_user_id uuid, p_role_key text, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_role_key text;
  v_role_id uuid;
begin
  v_actor := public.require_superadmin_user();
  v_role_key := lower(trim(coalesce(p_role_key, '')));

  if not exists (select 1 from public.app_users where id = p_user_id and status = 'active') then
    raise exception 'Target app user must exist and be active.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.roles where key = v_role_key and is_active = true) then
    raise exception 'Role "%" does not exist or is inactive.', v_role_key using errcode = '23514';
  end if;

  select id into v_role_id
  from public.user_roles
  where user_id = p_user_id and role_key = v_role_key and status = 'active'
    and starts_at <= now() and (ends_at is null or ends_at > now())
  limit 1;

  if v_role_id is not null then
    return v_role_id;
  end if;

  insert into public.user_roles (user_id, role_key, status, starts_at, assigned_by, reason)
  values (p_user_id, v_role_key, 'active', now(), v_actor, p_reason)
  returning id into v_role_id;

  return v_role_id;
end;
$$;

create or replace function public.revoke_user_role(p_user_role_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_role public.user_roles%rowtype;
begin
  v_actor := public.require_superadmin_user();
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Role revocation requires a reason.' using errcode = '23514';
  end if;

  select * into v_role from public.user_roles where id = p_user_role_id for update;
  if not found then raise exception 'User role was not found.' using errcode = '23503'; end if;
  if v_role.status = 'revoked' then return v_role.id; end if;

  update public.user_roles
     set status = 'revoked', revoked_at = now(), ends_at = coalesce(ends_at, now()), revoked_by = v_actor, reason = p_reason
   where id = v_role.id;

  return v_role.id;
end;
$$;

-- Services and assignments.
create or replace function public.create_service(
  p_customer_id uuid,
  p_service_type text,
  p_scheduled_start_at timestamptz,
  p_origin_label text,
  p_origin_address text,
  p_destination_label text,
  p_destination_address text,
  p_passenger_display_name text default null,
  p_passenger_phone text default null,
  p_notes text default null
)
returns table(service_id uuid, human_code text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_service_id uuid;
  v_human_code text;
  v_periodic_enabled boolean;
begin
  v_actor := public.require_admin_user();

  if not exists (select 1 from public.customers where id = p_customer_id and status in ('new', 'active')) then
    raise exception 'Service customer must exist and not be blocked or inactive.' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_service_type, ''))) = 0 then raise exception 'Service type is required.' using errcode = '23514'; end if;
  if p_scheduled_start_at is null then raise exception 'scheduled_start_at is required.' using errcode = '23514'; end if;
  if length(trim(coalesce(p_origin_label, ''))) = 0 or length(trim(coalesce(p_destination_label, ''))) = 0 then
    raise exception 'Origin and destination labels are required.' using errcode = '23514';
  end if;

  if lower(trim(p_service_type)) = 'periodic' then
    select coalesce((setting.value_json #>> '{}')::boolean, false)
      into v_periodic_enabled
    from public.app_settings setting
    where setting.setting_key = 'operations.periodic_services_enabled'
      and setting.setting_scope = 'operations'
      and setting.is_active = true
    limit 1;

    if coalesce(v_periodic_enabled, false) = false then
      raise exception 'Periodic services are disabled for the MVP.' using errcode = '0A000';
    end if;
  end if;

  insert into public.services (customer_id, service_type, operational_status, scheduled_start_at, notes, requested_by_user_id, created_by, updated_by)
  values (p_customer_id, trim(p_service_type), 'pending', p_scheduled_start_at, p_notes, v_actor, v_actor, v_actor)
  returning id, public.services.human_code into v_service_id, v_human_code;

  insert into public.service_locations (service_id, location_type, label, address, sort_order, scheduled_at, created_by, updated_by)
  values
    (v_service_id, 'origin', trim(p_origin_label), nullif(trim(coalesce(p_origin_address, '')), ''), 0, p_scheduled_start_at, v_actor, v_actor),
    (v_service_id, 'destination', trim(p_destination_label), nullif(trim(coalesce(p_destination_address, '')), ''), 1, null, v_actor, v_actor);

  if length(trim(coalesce(p_passenger_display_name, ''))) > 0 then
    insert into public.service_passengers (service_id, display_name, phone, is_primary, created_by, updated_by)
    values (v_service_id, trim(p_passenger_display_name), nullif(trim(coalesce(p_passenger_phone, '')), ''), true, v_actor, v_actor);
  end if;

  insert into public.service_financials (service_id, currency_code, created_by, updated_by)
  values (v_service_id, 'EUR', v_actor, v_actor);

  perform public.secure_audit('insert', 'services', v_service_id, v_human_code, null, jsonb_build_object('service_id', v_service_id), 'Service created.', '{}'::jsonb, v_actor, null);

  service_id := v_service_id;
  human_code := v_human_code;
  return next;
end;
$$;

create or replace function public.update_service(p_service_id uuid, p_scheduled_start_at timestamptz default null, p_notes text default null, p_internal_notes text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_service public.services%rowtype;
  v_has_accepted_assignment boolean;
begin
  v_actor := public.require_admin_user();
  select * into v_service from public.services where id = p_service_id for update;
  if not found then raise exception 'Service was not found.' using errcode = '23503'; end if;
  if v_service.operational_status in ('in_progress', 'completed', 'cancelled', 'no_show', 'not_performed') then
    raise exception 'Service cannot be edited in status %.', v_service.operational_status using errcode = '23514';
  end if;

  if v_service.operational_status = 'confirmed' and p_scheduled_start_at is not null then
    select exists (
      select 1
      from public.service_assignments assignment
      where assignment.service_id = p_service_id
        and assignment.assignment_status = 'accepted'
        and assignment.ended_at is null
    ) into v_has_accepted_assignment;

    if v_has_accepted_assignment then
      raise exception 'Confirmed services with an accepted assignment cannot be rescheduled through this MVP function.'
        using errcode = '23514';
    end if;
  end if;

  update public.services
     set scheduled_start_at = coalesce(p_scheduled_start_at, scheduled_start_at),
         notes = coalesce(p_notes, notes),
         internal_notes = coalesce(p_internal_notes, internal_notes),
         updated_by = v_actor
   where id = p_service_id;

  perform public.secure_audit('update', 'services', p_service_id, v_service.human_code, to_jsonb(v_service), jsonb_build_object('service_id', p_service_id), 'Service updated.', '{}'::jsonb, v_actor, null);
  return p_service_id;
end;
$$;
create or replace function public.assign_service(
  p_service_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_internal_priority_exception boolean default false,
  p_priority_exception_reason text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_service public.services%rowtype;
  v_assignment_id uuid;
  v_dva_id uuid;
begin
  v_actor := public.require_admin_user();
  select * into v_service from public.services where id = p_service_id for update;
  if not found then raise exception 'Service was not found.' using errcode = '23503'; end if;
  if v_service.operational_status not in ('pending', 'confirmed') then
    raise exception 'Service status % does not allow assignment.', v_service.operational_status using errcode = '23514';
  end if;
  if not exists (select 1 from public.drivers where id = p_driver_id and administrative_status = 'active') then
    raise exception 'Driver must exist and be active.' using errcode = '23514';
  end if;
  if not public.vehicle_is_assignable(p_vehicle_id) then
    raise exception 'Vehicle is not assignable.' using errcode = '23514';
  end if;

  select id into v_dva_id
  from public.driver_vehicle_assignments
  where driver_id = p_driver_id and vehicle_id = p_vehicle_id and status = 'active'
  limit 1;
  if v_dva_id is null then
    raise exception 'Driver and vehicle do not have an active assignment link.' using errcode = '23514';
  end if;

  update public.service_assignments
     set assignment_status = 'ended', ended_at = now(), ended_by = v_actor, reassignment_reason = 'Superseded by secure assignment.'
   where service_id = p_service_id
     and assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required');

  -- The 0006 integrity trigger is authoritative for internal-driver priority in the MVP.
  -- The stored operations.internal_driver_priority_enabled setting cannot weaken that rule.
  insert into public.service_assignments (
    service_id, driver_id, vehicle_id, driver_vehicle_assignment_id, assignment_status,
    internal_priority_exception, priority_exception_reason, created_by
  ) values (
    p_service_id, p_driver_id, p_vehicle_id, v_dva_id, 'pending_acceptance',
    p_internal_priority_exception,
    p_priority_exception_reason, v_actor
  ) returning id into v_assignment_id;

  perform public.secure_audit('update', 'service_assignments', v_assignment_id, null, null, jsonb_build_object('service_id', p_service_id, 'driver_id', p_driver_id, 'vehicle_id', p_vehicle_id), 'Service assigned.', '{}'::jsonb, v_actor, null);
  return v_assignment_id;
end;
$$;

create or replace function public.reassign_service(p_service_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_reason text, p_internal_priority_exception boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Reassignment requires a reason.' using errcode = '23514'; end if;
  return public.assign_service(p_service_id, p_driver_id, p_vehicle_id, p_internal_priority_exception, p_reason);
end;
$$;

create or replace function public.accept_service_assignment(p_assignment_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_actor uuid;
  v_assignment public.service_assignments%rowtype;
begin
  v_driver_id := public.current_driver_id();
  v_actor := public.require_current_app_user();
  select * into v_assignment from public.service_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Service assignment was not found.' using errcode = '23503'; end if;
  if v_assignment.driver_id <> v_driver_id then raise exception 'Cannot accept another driver assignment.' using errcode = '42501'; end if;
  if v_assignment.assignment_status <> 'pending_acceptance' then raise exception 'Only pending assignments can be accepted.' using errcode = '23514'; end if;

  update public.service_assignments
     set assignment_status = 'accepted', accepted_at = now(), accepted_by_driver_id = v_driver_id
   where id = p_assignment_id;

  update public.services
     set operational_status = 'confirmed', updated_by = v_actor
   where id = v_assignment.service_id and operational_status = 'pending';

  perform public.secure_audit('status_change', 'service_assignments', p_assignment_id, null, to_jsonb(v_assignment), jsonb_build_object('operation','assignment_accepted','status','accepted','service_id',v_assignment.service_id), 'Service assignment accepted.', '{}'::jsonb, v_actor, v_driver_id);
  return p_assignment_id;
end;
$$;

create or replace function public.reject_service_assignment(p_assignment_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_actor uuid;
  v_assignment public.service_assignments%rowtype;
begin
  v_driver_id := public.current_driver_id();
  v_actor := public.require_current_app_user();
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Assignment rejection requires a reason.' using errcode = '23514'; end if;
  select * into v_assignment from public.service_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Service assignment was not found.' using errcode = '23503'; end if;
  if v_assignment.driver_id <> v_driver_id then raise exception 'Cannot reject another driver assignment.' using errcode = '42501'; end if;
  if v_assignment.assignment_status <> 'pending_acceptance' then raise exception 'Only pending assignments can be rejected.' using errcode = '23514'; end if;

  update public.service_assignments
     set assignment_status = 'rejected', rejected_at = now(), rejected_by_driver_id = v_driver_id, rejection_reason = p_reason
   where id = p_assignment_id;
  perform public.secure_audit('status_change', 'service_assignments', p_assignment_id, null, to_jsonb(v_assignment), jsonb_build_object('operation','assignment_rejected','status','rejected','service_id',v_assignment.service_id), p_reason, '{}'::jsonb, v_actor, v_driver_id);
  return p_assignment_id;
end;
$$;

create or replace function public.advance_service_progress(p_service_id uuid, p_stage text, p_notes text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_actor uuid;
  v_assignment public.service_assignments%rowtype;
  v_progress public.service_driver_progress%rowtype;
  v_stage text;
  v_progress_id uuid;
begin
  v_driver_id := public.current_driver_id();
  v_actor := public.require_current_app_user();
  v_stage := lower(trim(coalesce(p_stage, '')));

  if v_stage not in ('on_way', 'waiting_passenger', 'passenger_on_board', 'finishing', 'finished') then
    raise exception 'Invalid service progress stage %.', p_stage using errcode = '23514';
  end if;

  select * into v_assignment
  from public.service_assignments
  where service_id = p_service_id and driver_id = v_driver_id and assignment_status = 'accepted' and ended_at is null
  for update;
  if not found then raise exception 'Active accepted assignment was not found for this driver.' using errcode = '42501'; end if;

  update public.services set operational_status = 'in_progress', updated_by = v_actor
  where id = p_service_id and operational_status = 'confirmed';

  select * into v_progress
  from public.service_driver_progress
  where service_id = p_service_id and assignment_id = v_assignment.id
  for update;

  if not found then
    insert into public.service_driver_progress (service_id, assignment_id, driver_id, stage, last_update_at, notes, updated_by)
    values (p_service_id, v_assignment.id, v_driver_id, 'not_started', now(), p_notes, v_actor)
    returning * into v_progress;
  end if;

  if (v_progress.stage = 'not_started' and v_stage <> 'on_way')
    or (v_progress.stage = 'on_way' and v_stage <> 'waiting_passenger')
    or (v_progress.stage = 'waiting_passenger' and v_stage <> 'passenger_on_board')
    or (v_progress.stage = 'passenger_on_board' and v_stage <> 'finishing')
    or (v_progress.stage = 'finishing' and v_stage <> 'finished')
    or v_progress.stage = 'finished'
  then
    raise exception 'Invalid progress transition from % to %.', v_progress.stage, v_stage using errcode = '23514';
  end if;

  update public.service_driver_progress
     set stage = v_stage,
         started_at = case when v_stage in ('on_way','waiting_passenger','passenger_on_board','finishing','finished') then coalesce(started_at, now()) else started_at end,
         arrived_at = case when v_stage in ('waiting_passenger','passenger_on_board','finishing','finished') then coalesce(arrived_at, now()) else arrived_at end,
         passenger_on_board_at = case when v_stage in ('passenger_on_board','finishing','finished') then coalesce(passenger_on_board_at, now()) else passenger_on_board_at end,
         finished_at = case when v_stage = 'finished' then coalesce(finished_at, now()) else finished_at end,
         last_update_at = now(), notes = coalesce(p_notes, notes), updated_by = v_actor
   where id = v_progress.id
  returning id into v_progress_id;

  perform public.secure_audit('status_change', 'service_driver_progress', v_progress_id, null, to_jsonb(v_progress), jsonb_build_object('operation','service_progress_changed','service_id', p_service_id, 'stage', v_stage), 'Service progress advanced.', '{}'::jsonb, v_actor, v_driver_id);
  return v_progress_id;
end;
$$;

create or replace function public.start_service_on_way(p_service_id uuid, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$ begin return public.advance_service_progress(p_service_id, 'on_way', p_notes); end; $$;
create or replace function public.mark_service_arrived(p_service_id uuid, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$ begin return public.advance_service_progress(p_service_id, 'waiting_passenger', p_notes); end; $$;
create or replace function public.mark_passenger_on_board(p_service_id uuid, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$ begin return public.advance_service_progress(p_service_id, 'passenger_on_board', p_notes); end; $$;
create or replace function public.mark_service_finishing(p_service_id uuid, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$ begin return public.advance_service_progress(p_service_id, 'finishing', p_notes); end; $$;

create or replace function public.complete_service(p_service_id uuid, p_reason_details text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_actor uuid;
  v_assignment_id uuid;
begin
  v_driver_id := public.current_driver_id();
  v_actor := public.require_current_app_user();
  perform public.advance_service_progress(p_service_id, 'finished', p_reason_details);

  select id into v_assignment_id
  from public.service_assignments
  where service_id = p_service_id
    and driver_id = v_driver_id
    and assignment_status = 'accepted'
    and ended_at is null
  for update;

  if v_assignment_id is null then
    raise exception 'An active accepted assignment for the current driver is required to complete the service.'
      using errcode = '23514';
  end if;

  update public.services set operational_status = 'completed', updated_by = v_actor
  where id = p_service_id and operational_status = 'in_progress';
  if not found then raise exception 'Service must be in progress to complete.' using errcode = '23514'; end if;

  update public.service_assignments
     set assignment_status = 'ended', ended_at = now(), ended_by = v_actor
   where id = v_assignment_id
     and assignment_status = 'accepted'
     and ended_at is null;
  if not found then raise exception 'Service assignment was already closed.' using errcode = '23514'; end if;

  insert into public.service_closures (service_id, assignment_id, closure_type, closed_at, closed_by_driver_id, reason_details, created_by)
  values (p_service_id, v_assignment_id, 'completed', now(), v_driver_id, p_reason_details, v_actor);

  perform public.secure_audit('status_change', 'services', p_service_id, null, null, jsonb_build_object('status','completed', 'assignment_id', v_assignment_id), 'Service completed.', '{}'::jsonb, v_actor, v_driver_id);
  return p_service_id;
end;
$$;

create or replace function public.cancel_service(p_service_id uuid, p_reason_code text, p_reason_details text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_service public.services%rowtype;
begin
  v_actor := public.require_admin_user();
  if length(trim(coalesce(p_reason_code, ''))) = 0 then raise exception 'Service cancellation requires a reason code.' using errcode = '23514'; end if;
  select * into v_service from public.services where id = p_service_id for update;
  if not found then raise exception 'Service was not found.' using errcode = '23503'; end if;
  if v_service.operational_status in ('completed', 'cancelled', 'no_show', 'not_performed') then
    raise exception 'Service status % cannot be cancelled.', v_service.operational_status using errcode = '23514';
  end if;

  update public.services set operational_status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, updated_by = v_actor where id = p_service_id;
  insert into public.service_cancellations (service_id, cancelled_at, reason_code, reason_details, source, cancelled_by_user_id, created_by)
  values (p_service_id, now(), trim(p_reason_code), p_reason_details, 'administration', v_actor, v_actor);
  update public.service_assignments set assignment_status = 'cancelled', ended_at = now(), ended_by = v_actor where service_id = p_service_id and assignment_status in ('pending_acceptance','accepted','reassignment_required');

  perform public.secure_audit('cancellation', 'services', p_service_id, v_service.human_code, to_jsonb(v_service), jsonb_build_object('status','cancelled'), p_reason_code, '{}'::jsonb, v_actor, null);
  return p_service_id;
end;
$$;
-- Service financials, payments and cash.
create or replace function public.finalize_service_pricing(p_service_id uuid, p_base_amount numeric, p_tax_rate numeric default null, p_notes text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_fin public.service_financials%rowtype;
  v_tax_rate numeric(7,4);
begin
  v_actor := public.require_admin_user();
  if p_base_amount is null or p_base_amount < 0 then raise exception 'Base amount must be non-negative.' using errcode = '23514'; end if;

  select * into v_fin from public.service_financials where service_id = p_service_id for update;
  if not found then raise exception 'Service financial row was not found.' using errcode = '23503'; end if;
  if v_fin.pricing_status = 'finalized' then raise exception 'Service pricing is already finalized.' using errcode = '23514'; end if;

  v_tax_rate := p_tax_rate;
  if v_tax_rate is null then
    select (setting.value_json #>> '{}')::numeric into v_tax_rate
    from public.app_settings setting
    where setting.setting_key = 'finance.default_tax_rate' and setting.setting_scope = 'finance' and setting.is_active = true
    limit 1;
  end if;
  v_tax_rate := coalesce(v_tax_rate, 0);

  delete from public.service_price_components where service_financial_id = v_fin.id;
  insert into public.service_price_components (service_financial_id, component_type, label, quantity, unit_amount, line_amount, sort_order, created_by, updated_by)
  values (v_fin.id, 'base_fare', 'Base service price', 1, round(p_base_amount,2), round(p_base_amount,2), 0, v_actor, v_actor);

  update public.service_financials
     set tax_rate = round(v_tax_rate, 4), pricing_status = 'finalized', finalized_at = now(), finalized_by = v_actor, notes = coalesce(p_notes, notes), updated_by = v_actor
   where id = v_fin.id;

  perform public.recalculate_service_financial(v_fin.id);
  perform public.secure_audit('update', 'service_financials', v_fin.id, null, to_jsonb(v_fin), jsonb_build_object('pricing_status','finalized'), 'Service pricing finalized.', '{}'::jsonb, v_actor, null);
  return v_fin.id;
end;
$$;

create or replace function public.register_service_payment(
  p_service_id uuid,
  p_amount numeric,
  p_payment_method text default 'cash',
  p_cash_account_id uuid default null,
  p_paid_at timestamptz default now(),
  p_external_reference text default null,
  p_idempotency_key text default null,
  p_notes text default null
)
returns table(payment_id uuid, cash_movement_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_fin public.service_financials%rowtype;
  v_payment_id uuid;
  v_cash_id uuid;
  v_method text;
begin
  v_actor := public.require_admin_user();
  v_method := lower(trim(coalesce(p_payment_method, 'cash')));
  if v_method <> 'cash' then raise exception 'Only cash service payments are active in the MVP.' using errcode = '0A000'; end if;

  select * into v_fin from public.service_financials where service_id = p_service_id for update;
  if not found then raise exception 'Service financial row was not found.' using errcode = '23503'; end if;
  if v_fin.pricing_status <> 'finalized' then raise exception 'Service pricing must be finalized before payment.' using errcode = '23514'; end if;
  if v_fin.financial_status = 'paid' then raise exception 'Service is already paid.' using errcode = '23514'; end if;
  if round(p_amount,2) <> v_fin.pending_amount then raise exception 'Service payment must equal the full pending amount.' using errcode = '23514'; end if;
  if p_cash_account_id is null then raise exception 'Cash account is required for cash payment.' using errcode = '23514'; end if;

  if p_idempotency_key is not null then
    select id into v_payment_id from public.service_payments where idempotency_key = trim(p_idempotency_key) limit 1;
    if v_payment_id is not null then
      select id into v_cash_id
      from public.cash_movements
      where movement_category = 'service_payment'
        and source_type = 'service_payment'
        and source_id = v_payment_id
        and service_payment_id = v_payment_id
      limit 1;
      payment_id := v_payment_id; cash_movement_id := v_cash_id; return next; return;
    end if;
  end if;

  insert into public.service_payments (service_id, service_financial_id, payment_method, payment_status, amount, currency_code, paid_at, external_reference, idempotency_key, notes, created_by, updated_by)
  values (p_service_id, v_fin.id, 'cash', 'completed', round(p_amount,2), v_fin.currency_code, coalesce(p_paid_at, now()), p_external_reference, nullif(trim(coalesce(p_idempotency_key,'')),''), p_notes, v_actor, v_actor)
  returning id into v_payment_id;

  insert into public.service_payment_allocations (payment_id, service_financial_id, allocated_amount, created_by)
  values (v_payment_id, v_fin.id, round(p_amount,2), v_actor);

  insert into public.cash_movements (cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, source_type, source_id, idempotency_key, description, created_by)
  values (p_cash_account_id, 'inflow', 'service_payment', round(p_amount,2), v_fin.currency_code, coalesce(p_paid_at, now()), p_service_id, v_payment_id, 'service_payment', v_payment_id, case when p_idempotency_key is null then null else 'cash:' || trim(p_idempotency_key) end, 'Service payment ' || p_service_id::text, v_actor)
  returning id into v_cash_id;

  perform public.recalculate_service_financial(v_fin.id);
  perform public.secure_audit('payment', 'service_payments', v_payment_id, null, null, jsonb_build_object('amount', round(p_amount,2), 'service_id', p_service_id), 'Service payment registered.', '{}'::jsonb, v_actor, null);

  payment_id := v_payment_id; cash_movement_id := v_cash_id; return next;
end;
$$;

create or replace function public.reverse_service_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_payment public.service_payments%rowtype;
  v_original public.cash_movements%rowtype;
  v_reversal_id uuid;
begin
  v_actor := public.require_superadmin_user();
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Payment reversal requires a reason.' using errcode = '23514'; end if;
  select * into v_payment from public.service_payments where id = p_payment_id for update;
  if not found then raise exception 'Service payment was not found.' using errcode = '23503'; end if;
  if v_payment.payment_status <> 'completed' then raise exception 'Only completed service payments can be reversed.' using errcode = '23514'; end if;

  update public.service_payments
     set payment_status = 'reversed', cancelled_at = now(), cancelled_by = v_actor, cancellation_reason = p_reason, updated_by = v_actor
   where id = p_payment_id;
  perform public.recalculate_service_financial(v_payment.service_financial_id);

  select * into v_original from public.cash_movements where service_payment_id = p_payment_id and movement_category = 'service_payment' limit 1;
  if found then
    insert into public.cash_movements (cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, original_movement_id, source_type, source_id, description, metadata, created_by)
    values (v_original.cash_account_id, 'outflow', 'reversal', v_original.amount, v_original.currency_code, now(), v_original.service_id, v_original.service_payment_id, v_original.id, 'service_payment_reversal', p_payment_id, 'Reversal of service payment', jsonb_build_object('reason', p_reason), v_actor)
    returning id into v_reversal_id;
  end if;

  perform public.secure_audit('reversal', 'service_payments', p_payment_id, v_payment.human_code, to_jsonb(v_payment), jsonb_build_object('status','reversed'), p_reason, '{}'::jsonb, v_actor, null);
  return p_payment_id;
end;
$$;

create or replace function public.create_cash_movement(p_cash_account_id uuid, p_movement_type text, p_amount numeric, p_description text, p_occurred_at timestamptz default now(), p_idempotency_key text default null, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_account public.cash_accounts%rowtype;
  v_id uuid;
  v_type text;
begin
  v_actor := public.require_admin_user();
  v_type := lower(trim(coalesce(p_movement_type, '')));
  if v_type not in ('inflow','outflow') then raise exception 'Invalid cash movement type.' using errcode = '23514'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Cash movement amount must be positive.' using errcode = '23514'; end if;
  if length(trim(coalesce(p_description,''))) = 0 then raise exception 'Manual cash movement requires a description.' using errcode = '23514'; end if;

  select * into v_account from public.cash_accounts where id = p_cash_account_id and status = 'active' for update;
  if not found then raise exception 'Active cash account was not found.' using errcode = '23503'; end if;

  insert into public.cash_movements (cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, source_type, idempotency_key, description, metadata, created_by)
  values (p_cash_account_id, v_type, 'manual_adjustment', round(p_amount,2), v_account.currency_code, coalesce(p_occurred_at, now()), 'manual_adjustment', nullif(trim(coalesce(p_idempotency_key,'')),''), trim(p_description), coalesce(p_metadata,'{}'::jsonb), v_actor)
  returning id into v_id;
  perform public.secure_audit('insert', 'cash_movements', v_id, null, null, jsonb_build_object('operation','manual_cash_movement','cash_account_id', p_cash_account_id, 'movement_type', v_type, 'amount', round(p_amount,2)), trim(p_description), '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;

create or replace function public.reverse_cash_movement(p_cash_movement_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_original public.cash_movements%rowtype;
  v_id uuid;
begin
  v_actor := public.require_superadmin_user();
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'Cash movement reversal requires a reason.' using errcode = '23514'; end if;
  select * into v_original from public.cash_movements where id = p_cash_movement_id for update;
  if not found then raise exception 'Cash movement was not found.' using errcode = '23503'; end if;
  if v_original.movement_category = 'reversal' then raise exception 'A reversal movement cannot be reversed.' using errcode = '23514'; end if;
  if exists (select 1 from public.cash_movements where original_movement_id = p_cash_movement_id and movement_category = 'reversal') then raise exception 'Cash movement has already been reversed.' using errcode = '23514'; end if;

  insert into public.cash_movements (cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, original_movement_id, source_type, source_id, description, metadata, created_by)
  values (v_original.cash_account_id, case when v_original.movement_type='inflow' then 'outflow' else 'inflow' end, 'reversal', v_original.amount, v_original.currency_code, now(), v_original.id, 'cash_movement_reversal', v_original.id, 'Cash movement reversal', jsonb_build_object('reason', p_reason), v_actor)
  returning id into v_id;
  perform public.secure_audit('reversal', 'cash_movements', v_id, null, to_jsonb(v_original), jsonb_build_object('original_movement_id', v_original.id, 'reversal_movement_id', v_id), p_reason, '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;

create or replace function public.create_cash_remittance(p_source_cash_account_id uuid, p_destination_cash_account_id uuid, p_declared_amount numeric, p_notes text default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_id uuid; v_source public.cash_accounts%rowtype; v_destination public.cash_accounts%rowtype;
begin
  v_actor := public.require_admin_user();
  select * into v_source from public.cash_accounts where id=p_source_cash_account_id and status='active' for update;
  if not found then raise exception 'Source cash account must be active.' using errcode='23514'; end if;
  select * into v_destination from public.cash_accounts where id=p_destination_cash_account_id and status='active' for update;
  if not found then raise exception 'Destination cash account must be active.' using errcode='23514'; end if;
  insert into public.cash_remittances (source_cash_account_id,destination_cash_account_id,driver_id,status,declared_amount,currency_code,notes,created_by,updated_by)
  values (p_source_cash_account_id,p_destination_cash_account_id,v_source.driver_id,'draft',round(coalesce(p_declared_amount,0),2),v_source.currency_code,p_notes,v_actor,v_actor)
  returning id into v_id;
  perform public.secure_audit('insert', 'cash_remittances', v_id, null, null, jsonb_build_object('source_cash_account_id', p_source_cash_account_id, 'destination_cash_account_id', p_destination_cash_account_id, 'declared_amount', round(coalesce(p_declared_amount,0),2)), 'Cash remittance created.', '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;

create or replace function public.verify_cash_remittance(p_remittance_id uuid, p_verified_amount numeric)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
begin
  -- 0008 defines remittance states and items, but this RPC signature has no approved way
  -- to receive/link remittance items or model the submit/receive steps safely. Keep internal only.
  perform public.secure_not_implemented(
    'verify_cash_remittance',
    'Decision pending before completing this function: 0008 requires remittance items and prepared/submitted/received/verified transitions, but this RPC signature has no approved remittance item source parameters.'
  );
  return p_remittance_id;
end;
$$;

create or replace function public.create_cash_count(p_cash_account_id uuid, p_counted_amount numeric, p_counted_at timestamptz default now(), p_notes text default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_account public.cash_accounts%rowtype; v_id uuid; v_expected numeric;
begin
  v_actor := public.require_admin_user();
  select * into v_account from public.cash_accounts where id=p_cash_account_id and status='active' for update;
  if not found then raise exception 'Active cash account was not found.' using errcode='23503'; end if;
  v_expected := public.calculate_cash_account_balance(p_cash_account_id, coalesce(p_counted_at, now()));
  insert into public.cash_counts (cash_account_id,status,counted_at,period_end_at,expected_amount,counted_amount,difference_amount,currency_code,notes,created_by,updated_by,counted_by_user_id)
  values (p_cash_account_id,'draft',coalesce(p_counted_at,now()),coalesce(p_counted_at,now()),v_expected,round(p_counted_amount,2),round(p_counted_amount,2)-v_expected,v_account.currency_code,p_notes,v_actor,v_actor,v_actor)
  returning id into v_id;
  update public.cash_counts set status='counted', updated_by=v_actor where id=v_id;
  perform public.secure_audit('insert', 'cash_counts', v_id, null, null, jsonb_build_object('operation','cash_count_created','cash_account_id', p_cash_account_id, 'expected_amount', v_expected, 'counted_amount', round(p_counted_amount,2)), 'Cash count created.', '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;
-- Receivables.
create or replace function public.create_receivable_from_service(p_service_id uuid, p_due_at timestamptz default null, p_notes text default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_service public.services%rowtype; v_fin public.service_financials%rowtype; v_id uuid;
begin
  v_actor := public.require_admin_user();
  select * into v_service from public.services where id=p_service_id for update;
  if not found then raise exception 'Service was not found.' using errcode='23503'; end if;
  if v_service.operational_status <> 'completed' then raise exception 'Only completed services can create receivables.' using errcode='23514'; end if;
  select * into v_fin from public.service_financials where service_id=p_service_id for update;
  if not found then raise exception 'Service financial row was not found.' using errcode='23503'; end if;
  if v_fin.pending_amount <= 0 or v_fin.financial_status = 'paid' then raise exception 'Service has no pending amount.' using errcode='23514'; end if;
  select id into v_id from public.receivables where service_id=p_service_id and status in ('open','overdue','partial') limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.receivables (service_id,service_financial_id,customer_id,status,currency_code,original_amount,pending_amount,due_at,notes,created_by,updated_by)
  values (p_service_id,v_fin.id,v_service.customer_id,'open',v_fin.currency_code,v_fin.pending_amount,v_fin.pending_amount,p_due_at,p_notes,v_actor,v_actor)
  returning id into v_id;
  perform public.secure_audit('insert', 'receivables', v_id, null, null, jsonb_build_object('service_id', p_service_id, 'amount', v_fin.pending_amount), 'Receivable created from service.', '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;

create or replace function public.collect_receivable(p_receivable_id uuid, p_cash_account_id uuid, p_paid_at timestamptz default now(), p_idempotency_key text default null, p_notes text default null)
returns table(payment_id uuid, receivable_allocation_id uuid, cash_movement_id uuid)
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_rec public.receivables%rowtype; v_payment_id uuid; v_spa_id uuid; v_alloc_id uuid; v_cash_id uuid;
begin
  v_actor := public.require_admin_user();
  select * into v_rec from public.receivables where id=p_receivable_id for update;
  if not found then raise exception 'Receivable was not found.' using errcode='23503'; end if;
  if v_rec.status not in ('open','overdue') then raise exception 'Only open receivables can be collected in this phase.' using errcode='23514'; end if;
  if v_rec.pending_amount <= 0 then raise exception 'Receivable has no pending amount.' using errcode='23514'; end if;

  insert into public.service_payments (service_id, service_financial_id, payment_method, payment_status, amount, currency_code, paid_at, idempotency_key, notes, created_by, updated_by)
  values (v_rec.service_id, v_rec.service_financial_id, 'cash', 'completed', v_rec.pending_amount, v_rec.currency_code, coalesce(p_paid_at,now()), nullif(trim(coalesce(p_idempotency_key,'')),''), p_notes, v_actor, v_actor)
  returning id into v_payment_id;
  insert into public.service_payment_allocations (payment_id, service_financial_id, allocated_amount, created_by)
  values (v_payment_id, v_rec.service_financial_id, v_rec.pending_amount, v_actor)
  returning id into v_spa_id;
  insert into public.receivable_allocations (receivable_id, payment_id, service_payment_allocation_id, allocated_amount, created_by)
  values (p_receivable_id, v_payment_id, v_spa_id, v_rec.pending_amount, v_actor)
  returning id into v_alloc_id;
  insert into public.cash_movements (cash_account_id,movement_type,movement_category,amount,currency_code,occurred_at,service_id,service_payment_id,source_type,source_id,idempotency_key,description,created_by)
  values (p_cash_account_id,'inflow','service_payment',v_rec.pending_amount,v_rec.currency_code,coalesce(p_paid_at,now()),v_rec.service_id,v_payment_id,'receivable',p_receivable_id,case when p_idempotency_key is null then null else 'receivable:'||trim(p_idempotency_key) end,'Receivable collection ' || v_rec.human_code,v_actor)
  returning id into v_cash_id;
  perform public.recalculate_service_financial(v_rec.service_financial_id);
  perform public.recalculate_receivable(p_receivable_id);
  perform public.secure_audit('payment', 'receivables', p_receivable_id, v_rec.human_code, to_jsonb(v_rec), jsonb_build_object('payment_id', v_payment_id, 'receivable_allocation_id', v_alloc_id, 'cash_movement_id', v_cash_id, 'amount', v_rec.pending_amount), 'Receivable collected.', '{}'::jsonb, v_actor, null);
  payment_id := v_payment_id; receivable_allocation_id := v_alloc_id; cash_movement_id := v_cash_id; return next;
end;
$$;

create or replace function public.annul_receivable_payment(p_receivable_allocation_id uuid, p_reason text)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
begin
  -- Internal stub only: 0009 has append-only receivable_allocations without an approved reversible status.
  perform public.secure_not_implemented('annul_receivable_payment', '0009 has no reversible receivable_allocation status column; this Superadmin reversal remains reserved for a future corrective migration.');
  return p_receivable_allocation_id;
end;
$$;

-- Expenses.
create or replace function public.create_expense(
  p_category_id uuid,
  p_subtotal_amount numeric,
  p_tax_rate numeric default 0,
  p_description text default null,
  p_expense_date date default current_date,
  p_supplier_id uuid default null,
  p_service_id uuid default null,
  p_vehicle_id uuid default null,
  p_driver_id uuid default null,
  p_payment_responsibility text default 'elara',
  p_reimbursable boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_id uuid; v_responsibility text;
begin
  v_actor := public.require_admin_user();
  v_responsibility := coalesce(nullif(lower(trim(p_payment_responsibility)), ''), 'elara');
  if v_responsibility <> 'elara' then
    raise exception 'Advance expense responsibilities are not available in the MVP secure RPC layer.' using errcode='0A000';
  end if;
  insert into public.expenses (category_id, subtotal_amount, tax_rate, description, expense_date, supplier_id, service_id, vehicle_id, driver_id, payment_responsibility, reimbursable, status, notes, created_by, updated_by)
  values (p_category_id, round(p_subtotal_amount,2), round(coalesce(p_tax_rate,0),4), p_description, coalesce(p_expense_date,current_date), p_supplier_id, p_service_id, p_vehicle_id, p_driver_id, v_responsibility, false, 'draft', p_notes, v_actor, v_actor)
  returning id into v_id;
  perform public.recalculate_expense(v_id);
  perform public.secure_audit('insert', 'expenses', v_id, null, null, jsonb_build_object('category_id', p_category_id, 'subtotal_amount', round(p_subtotal_amount,2), 'payment_responsibility', v_responsibility), 'Expense created.', '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;

create or replace function public.register_expense_payment(p_expense_id uuid, p_amount numeric, p_payment_method text default 'cash', p_cash_account_id uuid default null, p_paid_at timestamptz default now(), p_notes text default null)
returns table(expense_payment_id uuid, cash_movement_id uuid)
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_exp public.expenses%rowtype; v_payment_id uuid; v_cash_id uuid; v_method text;
begin
  v_actor := public.require_admin_user();
  v_method := lower(trim(coalesce(p_payment_method,'cash')));
  if v_method <> 'cash' then
    raise exception 'Only cash expense payments are available in the MVP secure RPC layer.' using errcode='0A000';
  end if;
  select * into v_exp from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense was not found.' using errcode='23503'; end if;
  if v_exp.status <> 'approved' then raise exception 'Only approved expenses can be paid.' using errcode='23514'; end if;
  if round(p_amount,2) <> v_exp.pending_amount then raise exception 'Expense payment must equal the full pending amount.' using errcode='23514'; end if;
  if v_method='cash' and p_cash_account_id is null then raise exception 'Cash account is required.' using errcode='23514'; end if;
  if public.expense_is_locked_by_settlement(p_expense_id) then raise exception 'Expense is locked by a settlement.' using errcode='23514'; end if;

  insert into public.expense_payments (expense_id,payment_method,payment_status,amount,currency_code,cash_account_id,paid_at,notes,created_by,updated_by)
  values (p_expense_id,v_method,'completed',round(p_amount,2),v_exp.currency_code,p_cash_account_id,coalesce(p_paid_at,now()),p_notes,v_actor,v_actor)
  returning id into v_payment_id;
  if v_method='cash' then
    insert into public.cash_movements (cash_account_id,movement_type,movement_category,amount,currency_code,occurred_at,source_type,source_id,description,created_by)
    values (p_cash_account_id,'outflow','other',round(p_amount,2),v_exp.currency_code,coalesce(p_paid_at,now()),'expense_payment',v_payment_id,'Expense payment',v_actor)
    returning id into v_cash_id;
  end if;
  perform public.recalculate_expense(p_expense_id);
  perform public.secure_audit('payment', 'expense_payments', v_payment_id, null, null, jsonb_build_object('expense_id', p_expense_id, 'cash_movement_id', v_cash_id, 'amount', round(p_amount,2)), 'Expense payment registered.', '{}'::jsonb, v_actor, null);
  expense_payment_id := v_payment_id; cash_movement_id := v_cash_id; return next;
end;
$$;

create or replace function public.cancel_expense(p_expense_id uuid, p_reason text)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_exp public.expenses%rowtype;
begin
  v_actor := public.require_superadmin_user();
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Expense cancellation requires a reason.' using errcode='23514'; end if;
  select * into v_exp from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense was not found.' using errcode='23503'; end if;
  if v_exp.status <> 'approved' then raise exception 'Only approved expenses can be cancelled through this function.' using errcode='23514'; end if;
  perform set_config('elara.expense_superadmin_cancel', p_expense_id::text, true);
  update public.expenses set status='cancelled', cancelled_at=now(), cancelled_by=v_actor, cancellation_reason=p_reason, payment_status='cancelled', reimbursement_status='cancelled', updated_by=v_actor where id=p_expense_id;
  perform public.secure_audit('cancellation', 'expenses', p_expense_id, v_exp.human_code, to_jsonb(v_exp), jsonb_build_object('status','cancelled'), p_reason, '{}'::jsonb, v_actor, null);
  return p_expense_id;
end;
$$;

-- Settlements.
create or replace function public.generate_settlement(p_driver_id uuid, p_period_start date, p_period_end date, p_notes text default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_actor uuid;
  v_driver public.drivers%rowtype;
  v_rule public.settlement_rules%rowtype;
  v_id uuid;
  v_item_count integer;
  v_today timestamptz := now();
  v_active_statuses constant text[] := array['draft', 'generated', 'submitted', 'approved'];
  v_expense_count integer := 0;
begin
  v_actor := public.require_admin_user();

  if p_period_start is null or p_period_end is null then
    raise exception 'Settlement period start and end are required.' using errcode='23514';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id and administrative_status = 'active'
  for update;
  if not found then raise exception 'Active driver was not found.' using errcode='23503'; end if;

  select * into v_rule
  from public.settlement_rules rule
  where rule.driver_type = v_driver.driver_type
    and rule.is_active = true
    and rule.effective_from <= p_period_start
    and (rule.effective_until is null or rule.effective_until >= p_period_end)
  order by rule.effective_from desc
  limit 1;
  if not found then raise exception 'No active settlement rule was found for this driver and period.' using errcode='23503'; end if;

  if v_driver.driver_type = 'internal_driver' and v_rule.frequency <> 'monthly' then
    raise exception 'Internal driver settlements require a monthly rule.' using errcode='23514';
  elsif v_driver.driver_type = 'external_collaborator' and v_rule.frequency <> 'weekly' then
    raise exception 'External collaborator settlements require a weekly rule.' using errcode='23514';
  end if;

  if v_driver.driver_type = 'internal_driver' then
    if p_period_start <> date_trunc('month', p_period_start)::date
      or p_period_end <> (date_trunc('month', p_period_start)::date + interval '1 month - 1 day')::date
    then
      raise exception 'Internal driver settlements require a complete natural month period.' using errcode='23514';
    end if;
  elsif v_driver.driver_type = 'external_collaborator' then
    if p_period_end <> p_period_start + 6 then
      raise exception 'External collaborator settlements require an inclusive seven-day period.' using errcode='23514';
    end if;
  end if;

  perform 1
  from public.settlements settlement
  where settlement.driver_id = p_driver_id
    and settlement.status = any(v_active_statuses)
    and settlement.period_start <= p_period_end
    and p_period_start <= settlement.period_end
  for update;

  if found then
    raise exception 'A driver cannot have overlapping active settlements.' using errcode='23514';
  end if;

  insert into public.settlements (driver_id,settlement_rule_id,driver_type_snapshot,frequency_snapshot,calculation_method_snapshot,period_start,period_end,currency_code,driver_percentage,elara_percentage,status,notes,created_by,updated_by)
  values (p_driver_id,v_rule.id,v_rule.driver_type,v_rule.frequency,v_rule.calculation_method,p_period_start,p_period_end,v_rule.currency_code,v_rule.driver_percentage,v_rule.elara_percentage,'draft',p_notes,v_actor,v_actor)
  returning id into v_id;

  with candidate_services as (
    select
      service.id as service_id,
      service.human_code as service_human_code,
      service.service_type,
      service.customer_id,
      service.scheduled_start_at,
      assignment.id as assignment_id,
      assignment.vehicle_id,
      assignment.driver_vehicle_assignment_id,
      financial.id as financial_id,
      financial.currency_code,
      financial.total_amount,
      financial.financial_status,
      closure.closed_at,
      coalesce(closure.closed_at::date, service.scheduled_start_at::date) as occurred_on
    from public.service_assignments assignment
    join public.services service on service.id = assignment.service_id
    join public.service_financials financial on financial.service_id = service.id
    left join public.service_closures closure on closure.service_id = service.id
    where assignment.driver_id = p_driver_id
      and assignment.assignment_status in ('accepted', 'ended')
      and assignment.accepted_at is not null
      and (closure.assignment_id is null or closure.assignment_id = assignment.id)
      and service.operational_status in ('completed', 'no_show', 'not_performed')
      and service.scheduled_start_at <= v_today
      and financial.pricing_status = 'finalized'
      and financial.total_amount > 0
      and financial.currency_code = v_rule.currency_code
      and coalesce(closure.closed_at::date, service.scheduled_start_at::date) between p_period_start and p_period_end
      and not exists (
        select 1
        from public.settlement_items existing_item
        join public.settlements existing_settlement on existing_settlement.id = existing_item.settlement_id
        where existing_item.item_type = 'service_income'
          and existing_item.service_id = service.id
          and existing_item.service_assignment_id = assignment.id
          and existing_settlement.status = any(v_active_statuses)
      )
    order by coalesce(closure.closed_at, service.scheduled_start_at), service.human_code
    for update of assignment, service, financial
  )
  insert into public.settlement_items (
    settlement_id,item_type,service_id,service_assignment_id,service_financial_id,source_reference,description,occurred_on,gross_amount,deduction_amount,adjustment_amount,driver_percentage_snapshot,elara_percentage_snapshot,snapshot_data,created_by
  )
  select
    v_id,
    'service_income',
    candidate.service_id,
    candidate.assignment_id,
    candidate.financial_id,
    candidate.service_human_code,
    'Service income ' || candidate.service_human_code,
    candidate.occurred_on,
    candidate.total_amount,
    0,
    0,
    v_rule.driver_percentage,
    v_rule.elara_percentage,
    jsonb_build_object(
      'service_id', candidate.service_id,
      'service_human_code', candidate.service_human_code,
      'service_type', candidate.service_type,
      'customer_id', candidate.customer_id,
      'assignment_id', candidate.assignment_id,
      'vehicle_id', candidate.vehicle_id,
      'driver_vehicle_assignment_id', candidate.driver_vehicle_assignment_id,
      'service_financial_id', candidate.financial_id,
      'total_amount', candidate.total_amount,
      'financial_status', candidate.financial_status,
      'currency_code', candidate.currency_code,
      'occurred_on', candidate.occurred_on
    ),
    v_actor
  from candidate_services candidate;

  -- No approved, unambiguous expense computability flag exists yet; avoid automatic deductions.
  v_expense_count := 0;

  select count(*) into v_item_count from public.settlement_items where settlement_id = v_id;
  if v_item_count = 0 then
    raise exception 'Settlement generation requires at least one eligible service item.' using errcode='23514';
  end if;

  perform public.recalculate_settlement(v_id);
  update public.settlements set status='generated', generated_at=now(), updated_by=v_actor where id=v_id;
  perform public.secure_audit('insert', 'settlements', v_id, null, null, jsonb_build_object('operation','settlement_generated','driver_id', p_driver_id, 'period_start', p_period_start, 'period_end', p_period_end, 'item_count', v_item_count, 'expense_item_count', v_expense_count), 'Settlement generated.', '{}'::jsonb, v_actor, null);
  return v_id;
end;
$$;

create or replace function public.submit_settlement(p_settlement_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_set public.settlements%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_set from public.settlements where id=p_settlement_id for update; if not found then raise exception 'Settlement was not found.' using errcode='23503'; end if; if v_set.status not in ('draft','generated') then raise exception 'Settlement cannot be submitted from status %.', v_set.status using errcode='23514'; end if; update public.settlements set status='submitted', submitted_at=now(), updated_by=v_actor where id=p_settlement_id; perform public.secure_audit('status_change','settlements',p_settlement_id,v_set.human_code,to_jsonb(v_set),jsonb_build_object('status','submitted'),'Settlement submitted.','{}'::jsonb,v_actor,null); return p_settlement_id; end; $$;

create or replace function public.approve_settlement(p_settlement_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_set public.settlements%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_set from public.settlements where id=p_settlement_id for update; if not found then raise exception 'Settlement was not found.' using errcode='23503'; end if; if v_set.status not in ('submitted','generated') then raise exception 'Settlement cannot be approved from status %.', v_set.status using errcode='23514'; end if; update public.settlements set status='approved', approved_at=now(), approved_by=v_actor, updated_by=v_actor where id=p_settlement_id; perform public.secure_audit('status_change','settlements',p_settlement_id,v_set.human_code,to_jsonb(v_set),jsonb_build_object('operation','settlement_approved','status','approved'),'Settlement approved.','{}'::jsonb,v_actor,null); return p_settlement_id; end; $$;

create or replace function public.reject_settlement(p_settlement_id uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_set public.settlements%rowtype;
begin v_actor:=public.require_admin_user(); if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Settlement rejection requires a reason.' using errcode='23514'; end if; select * into v_set from public.settlements where id=p_settlement_id for update; if not found then raise exception 'Settlement was not found.' using errcode='23503'; end if; if v_set.status not in ('submitted','generated') then raise exception 'Settlement cannot be rejected from status %.', v_set.status using errcode='23514'; end if; update public.settlements set status='rejected', rejected_at=now(), rejected_by=v_actor, rejection_reason=p_reason, updated_by=v_actor where id=p_settlement_id; perform public.secure_audit('status_change','settlements',p_settlement_id,v_set.human_code,to_jsonb(v_set),jsonb_build_object('operation','settlement_rejected','status','rejected'),p_reason,'{}'::jsonb,v_actor,null); return p_settlement_id; end; $$;
create or replace function public.pay_settlement(p_settlement_id uuid, p_cash_account_id uuid, p_paid_at timestamptz default now(), p_notes text default null)
returns table(settlement_payment_id uuid, cash_movement_id uuid)
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_set public.settlements%rowtype; v_cash_account public.cash_accounts%rowtype; v_payment_id uuid; v_cash_id uuid;
begin
  v_actor := public.require_admin_user();
  select * into v_set from public.settlements where id=p_settlement_id for update;
  if not found then raise exception 'Settlement was not found.' using errcode='23503'; end if;
  if v_set.status <> 'approved' then raise exception 'Only approved settlements can be paid.' using errcode='23514'; end if;
  if v_set.pending_amount <= 0 then raise exception 'Settlement has no pending amount.' using errcode='23514'; end if;
  select * into v_cash_account from public.cash_accounts where id=p_cash_account_id and status='active' for update;
  if not found then raise exception 'Active cash account was not found.' using errcode='23503'; end if;
  if v_cash_account.currency_code <> v_set.currency_code then raise exception 'Settlement payment cash account currency must match settlement currency.' using errcode='23514'; end if;
  insert into public.settlement_payments (settlement_id,payment_method,payment_status,amount,currency_code,cash_account_id,paid_at,notes,created_by,updated_by)
  values (p_settlement_id,'cash','completed',v_set.pending_amount,v_set.currency_code,p_cash_account_id,coalesce(p_paid_at,now()),p_notes,v_actor,v_actor)
  returning id into v_payment_id;
  insert into public.cash_movements (cash_account_id,movement_type,movement_category,amount,currency_code,occurred_at,source_type,source_id,description,created_by)
  values (p_cash_account_id,'outflow','other',v_set.pending_amount,v_set.currency_code,coalesce(p_paid_at,now()),'settlement_payment',v_payment_id,'Settlement payment '||v_set.human_code,v_actor)
  returning id into v_cash_id;
  perform public.recalculate_settlement(p_settlement_id);
  perform public.secure_audit('payment','settlement_payments',v_payment_id,null,null,jsonb_build_object('settlement_id',p_settlement_id,'cash_movement_id',v_cash_id,'amount',v_set.pending_amount),'Settlement payment registered.','{}'::jsonb,v_actor,null);
  settlement_payment_id:=v_payment_id; cash_movement_id:=v_cash_id; return next;
end;
$$;

create or replace function public.cancel_settlement(p_settlement_id uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_set public.settlements%rowtype;
begin v_actor:=public.require_admin_user(); if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Settlement cancellation requires a reason.' using errcode='23514'; end if; select * into v_set from public.settlements where id=p_settlement_id for update; if not found then raise exception 'Settlement was not found.' using errcode='23503'; end if; if v_set.status not in ('draft','generated','submitted') then raise exception 'Settlement cannot be cancelled by this function from status %.', v_set.status using errcode='23514'; end if; update public.settlements set status='cancelled', cancelled_at=now(), cancelled_by=v_actor, cancellation_reason=p_reason, updated_by=v_actor where id=p_settlement_id; perform public.secure_audit('cancellation','settlements',p_settlement_id,v_set.human_code,to_jsonb(v_set),jsonb_build_object('status','cancelled'),p_reason,'{}'::jsonb,v_actor,null); return p_settlement_id; end; $$;

create or replace function public.cancel_approved_settlement(p_settlement_id uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_set public.settlements%rowtype;
begin v_actor:=public.require_superadmin_user(); if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Approved settlement cancellation requires a reason.' using errcode='23514'; end if; select * into v_set from public.settlements where id=p_settlement_id for update; if not found then raise exception 'Settlement was not found.' using errcode='23503'; end if; if v_set.status <> 'approved' then raise exception 'Only approved settlements can be cancelled through this function.' using errcode='23514'; end if; perform 1 from public.settlement_payments where settlement_id=p_settlement_id and payment_status='completed' for update; if found then raise exception 'No se puede cancelar una liquidación aprobada con pagos completados mientras la reversión de pagos no esté implementada.' using errcode='23514'; end if; perform set_config('elara.settlement_superadmin_cancel', p_settlement_id::text, true); update public.settlements set status='cancelled', cancelled_at=now(), cancelled_by=v_actor, cancellation_reason=p_reason, updated_by=v_actor where id=p_settlement_id and status='approved'; perform public.secure_audit('cancellation','settlements',p_settlement_id,v_set.human_code,to_jsonb(v_set),jsonb_build_object('status','cancelled'),p_reason,'{}'::jsonb,v_actor,null); return p_settlement_id; end; $$;

create or replace function public.annul_settlement_payment(p_settlement_payment_id uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
begin
  -- Internal stub only: 0011 has no approved internal marker for reverting completed payments safely.
  perform public.secure_not_implemented('annul_settlement_payment', '0011 defines reversed payment status but no approved internal marker for reversing completed settlement payments without risking trigger conflicts.');
  return p_settlement_payment_id;
end;
$$;

-- Incidents.
create or replace function public.create_incident(
  p_category_id uuid,
  p_title text,
  p_description text default null,
  p_severity text default 'medium',
  p_service_id uuid default null,
  p_driver_id uuid default null,
  p_vehicle_id uuid default null,
  p_customer_id uuid default null,
  p_app_user_id uuid default null,
  p_internal_notes text default null
)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_driver uuid; v_context text; v_id uuid; v_source text;
begin
  v_actor := public.require_current_app_user();
  v_context := public.current_active_context();
  if v_context = 'conductor' then
    v_driver := public.current_driver_id();
    if p_driver_id is not null and p_driver_id <> v_driver then raise exception 'Driver incidents can only reference the current driver.' using errcode='42501'; end if;
    if p_app_user_id is not null or p_customer_id is not null then raise exception 'Driver incidents cannot reference arbitrary users or customers.' using errcode='42501'; end if;
    if p_service_id is not null and not exists (select 1 from public.service_assignments assignment where assignment.service_id = p_service_id and assignment.driver_id = v_driver) then raise exception 'Driver incidents can only reference assigned services.' using errcode='42501'; end if;
    if p_vehicle_id is not null and not exists (select 1 from public.driver_vehicle_assignments assignment where assignment.driver_id = v_driver and assignment.vehicle_id = p_vehicle_id and assignment.status = 'active') then raise exception 'Driver incidents can only reference their active vehicle.' using errcode='42501'; end if;
    v_source := 'driver_portal';
  elsif v_context in ('superadmin','administrativo') then
    v_source := 'administration';
  else
    raise exception 'Active context is not authorized for incidents.' using errcode='42501';
  end if;
  insert into public.incidents (category_id,title,description,severity,source,service_id,driver_id,vehicle_id,customer_id,app_user_id,reported_by_user_id,reported_by_driver_id,internal_notes,created_by,updated_by)
  values (p_category_id,p_title,p_description,coalesce(p_severity,''),v_source,p_service_id,coalesce(p_driver_id,v_driver),p_vehicle_id,p_customer_id,p_app_user_id,case when v_context <> 'conductor' then v_actor else null end,case when v_context='conductor' then v_driver else null end,p_internal_notes,v_actor,v_actor)
  returning id into v_id;
  perform public.secure_audit('insert','incidents',v_id,null,null,jsonb_build_object('category_id',p_category_id,'source',v_source),'Incident created.','{}'::jsonb,v_actor,v_driver);
  return v_id;
end;
$$;
create or replace function public.acknowledge_incident(p_incident_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_inc public.incidents%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_inc from public.incidents where id=p_incident_id for update; if not found then raise exception 'Incident was not found.' using errcode='23503'; end if; update public.incidents set status='acknowledged', acknowledged_at=now(), acknowledged_by=v_actor, updated_by=v_actor where id=p_incident_id; return p_incident_id; end; $$;

create or replace function public.investigate_incident(p_incident_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_inc public.incidents%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_inc from public.incidents where id=p_incident_id for update; if not found then raise exception 'Incident was not found.' using errcode='23503'; end if; update public.incidents set status='investigating', updated_by=v_actor where id=p_incident_id; return p_incident_id; end; $$;

create or replace function public.resolve_incident(p_incident_id uuid, p_resolution_summary text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_inc public.incidents%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_inc from public.incidents where id=p_incident_id for update; if not found then raise exception 'Incident was not found.' using errcode='23503'; end if; update public.incidents set status='resolved', resolved_at=now(), resolved_by=v_actor, resolution_summary=p_resolution_summary, updated_by=v_actor where id=p_incident_id; perform public.secure_audit('status_change','incidents',p_incident_id,null,to_jsonb(v_inc),jsonb_build_object('operation','incident_resolved','status','resolved'),'Incident resolved.','{}'::jsonb,v_actor,null); return p_incident_id; end; $$;

create or replace function public.cancel_incident(p_incident_id uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_inc public.incidents%rowtype;
begin v_actor:=public.require_admin_user(); if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Incident cancellation requires a reason.' using errcode='23514'; end if; select * into v_inc from public.incidents where id=p_incident_id for update; if not found then raise exception 'Incident was not found.' using errcode='23503'; end if; update public.incidents set status='cancelled', cancelled_at=now(), cancelled_by=v_actor, resolution_summary=coalesce(v_inc.resolution_summary,p_reason), updated_by=v_actor where id=p_incident_id; perform public.secure_audit('cancellation','incidents',p_incident_id,null,to_jsonb(v_inc),jsonb_build_object('status','cancelled'),p_reason,'{}'::jsonb,v_actor,null); return p_incident_id; end; $$;

create or replace function public.add_incident_comment(p_incident_id uuid, p_content text, p_comment_type text default 'internal', p_is_private boolean default true)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_driver uuid; v_context text; v_id uuid;
begin
  v_actor := public.require_current_app_user();
  v_context := public.current_active_context();
  if v_context = 'conductor' then
    v_driver := public.current_driver_id();
    if not exists (
      select 1 from public.incidents incident
      where incident.id = p_incident_id
        and (
          incident.driver_id = v_driver
          or exists (
            select 1 from public.service_assignments assignment
            where assignment.service_id = incident.service_id and assignment.driver_id = v_driver
          )
        )
    ) then
      raise exception 'Driver comments can only be added to own incidents.' using errcode='42501';
    end if;
  end if;
  insert into public.incident_comments (incident_id,comment_type,content,author_user_id,author_driver_id,is_private)
  values (p_incident_id,coalesce(p_comment_type,'internal'),p_content,case when v_context <> 'conductor' then v_actor else null end,case when v_context='conductor' then v_driver else null end,coalesce(p_is_private,true))
  returning id into v_id;
  return v_id;
end;
$$;

-- Settings and catalogs.
create or replace function public.get_app_setting(p_setting_key text, p_setting_scope text default 'global', p_scope_reference_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_actor uuid; v_setting public.app_settings%rowtype;
begin
  v_actor := public.require_current_app_user();
  select * into v_setting from public.app_settings
  where setting_key=lower(trim(p_setting_key)) and setting_scope=lower(trim(coalesce(p_setting_scope,'global'))) and ((scope_reference_id is null and p_scope_reference_id is null) or scope_reference_id=p_scope_reference_id) and is_active=true
  order by effective_from desc limit 1;
  if not found then return null; end if;
  if v_setting.is_sensitive and not public.user_has_active_role(v_actor,'superadmin') then raise exception 'Sensitive settings require Superadmin.' using errcode='42501'; end if;
  return v_setting.value_json;
end;
$$;

create or replace function public.set_app_setting(p_setting_key text, p_setting_scope text, p_scope_reference_id uuid, p_value_type text, p_value_json jsonb, p_reason text default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_actor uuid; v_key text; v_scope text; v_id uuid; v_context text; v_superadmin_required boolean;
begin
  v_actor := public.require_admin_user();
  v_context := public.current_active_context();
  v_key := lower(trim(p_setting_key)); v_scope := lower(trim(coalesce(p_setting_scope,'global')));
  if public.jsonb_has_sensitive_key(p_value_json) then raise exception 'Secret-like app settings are not allowed through this function.' using errcode='23514'; end if;

  if v_key='operations.periodic_services_enabled' and coalesce((p_value_json #>> '{}')::boolean,false) = true then
    raise exception 'Periodic services cannot be enabled during the MVP.' using errcode='0A000';
  end if;

  v_superadmin_required := true;
  if v_context = 'administrativo'
    and v_scope = 'operations'
    and p_scope_reference_id is null
    and v_key in ('operations.default_service_conflict_minutes', 'operations.vehicle_document_expiring_days')
  then
    v_superadmin_required := false;
  end if;

  if v_superadmin_required then
    perform public.require_superadmin_user();
  end if;

  if v_context = 'administrativo' and v_superadmin_required then
    raise exception 'Administrativo can only modify explicitly allowed operational settings.' using errcode='42501';
  end if;

  if v_key not in (
    'finance.default_currency',
    'finance.default_tax_rate',
    'operations.internal_driver_priority_enabled',
    'operations.default_service_conflict_minutes',
    'operations.vehicle_document_expiring_days',
    'operations.periodic_services_enabled',
    'system.audit_retention_mode',
    'system.environment_label'
  ) then
    raise exception 'Unknown or unsupported setting key for this MVP function.' using errcode='23514';
  end if;

  if length(trim(coalesce(p_reason,'')))=0 and v_superadmin_required then
    raise exception 'Critical setting changes require a reason.' using errcode='23514';
  end if;

  select id into v_id from public.app_settings where setting_key=v_key and setting_scope=v_scope and ((scope_reference_id is null and p_scope_reference_id is null) or scope_reference_id=p_scope_reference_id) and is_active=true for update;
  if v_id is null then
    insert into public.app_settings (setting_key,setting_scope,scope_reference_id,value_type,value_json,updated_by,created_by)
    values (v_key,v_scope,p_scope_reference_id,lower(trim(p_value_type)),p_value_json,v_actor,v_actor)
    returning id into v_id;
  else
    update public.app_settings set value_type=lower(trim(p_value_type)), value_json=p_value_json, updated_by=v_actor where id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_configurable_catalog_item(p_catalog_id uuid, p_item_key text, p_label_es text, p_description text default null, p_sort_order integer default 0, p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_catalog public.configurable_catalogs%rowtype; v_id uuid;
begin v_actor:=public.require_admin_user(); select * into v_catalog from public.configurable_catalogs where id=p_catalog_id and is_active=true for update; if not found then raise exception 'Catalog was not found or inactive.' using errcode='23503'; end if; if v_catalog.is_system and not v_catalog.allow_custom_items then perform public.require_superadmin_user(); end if; insert into public.configurable_catalog_items (catalog_id,item_key,label_es,description,sort_order,metadata,created_by,updated_by) values (p_catalog_id,p_item_key,p_label_es,p_description,coalesce(p_sort_order,0),coalesce(p_metadata,'{}'::jsonb),v_actor,v_actor) returning id into v_id; perform public.secure_audit('insert','configurable_catalog_items',v_id,null,null,jsonb_build_object('catalog_id',p_catalog_id,'item_key',p_item_key),'Catalog item created.','{}'::jsonb,v_actor,null); return v_id; end; $$;

create or replace function public.update_configurable_catalog_item(p_item_id uuid, p_label_es text default null, p_description text default null, p_sort_order integer default null, p_metadata jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_item public.configurable_catalog_items%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_item from public.configurable_catalog_items where id=p_item_id for update; if not found then raise exception 'Catalog item was not found.' using errcode='23503'; end if; if v_item.is_system then perform public.require_superadmin_user(); end if; update public.configurable_catalog_items set label_es=coalesce(p_label_es,label_es), description=coalesce(p_description,description), sort_order=coalesce(p_sort_order,sort_order), metadata=coalesce(p_metadata,metadata), updated_by=v_actor where id=p_item_id; perform public.secure_audit('update','configurable_catalog_items',p_item_id,null,to_jsonb(v_item),jsonb_build_object('item_id',p_item_id),'Catalog item updated.','{}'::jsonb,v_actor,null); return p_item_id; end; $$;

create or replace function public.set_configurable_catalog_item_active(p_item_id uuid, p_is_active boolean)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid; v_item public.configurable_catalog_items%rowtype;
begin v_actor:=public.require_admin_user(); select * into v_item from public.configurable_catalog_items where id=p_item_id for update; if not found then raise exception 'Catalog item was not found.' using errcode='23503'; end if; if v_item.is_system then perform public.require_superadmin_user(); end if; update public.configurable_catalog_items set is_active=coalesce(p_is_active,false), updated_by=v_actor where id=p_item_id; perform public.secure_audit('update','configurable_catalog_items',p_item_id,null,to_jsonb(v_item),jsonb_build_object('is_active',coalesce(p_is_active,false)),'Catalog item active flag changed.','{}'::jsonb,v_actor,null); return p_item_id; end; $$;
-- Permissions.
revoke all on function public.current_active_context() from public;
revoke all on function public.require_current_app_user() from public;
revoke all on function public.require_any_role(text[]) from public;
revoke all on function public.require_role(text) from public;
revoke all on function public.require_admin_user() from public;
revoke all on function public.require_superadmin_user() from public;
revoke all on function public.current_driver_id() from public;
revoke all on function public.secure_audit(text,text,uuid,text,jsonb,jsonb,text,jsonb,uuid,uuid) from public;
revoke all on function public.secure_not_implemented(text,text) from public;

grant execute on function public.current_active_context() to service_role;
grant execute on function public.require_current_app_user() to service_role;
grant execute on function public.require_any_role(text[]) to service_role;
grant execute on function public.require_role(text) to service_role;
grant execute on function public.require_admin_user() to service_role;
grant execute on function public.require_superadmin_user() to service_role;
grant execute on function public.current_driver_id() to service_role;
grant execute on function public.secure_audit(text,text,uuid,text,jsonb,jsonb,text,jsonb,uuid,uuid) to service_role;
grant execute on function public.secure_not_implemented(text,text) to service_role;

revoke all on function public.set_active_context(text) from public;
revoke all on function public.assign_user_role(uuid,text,text) from public;
revoke all on function public.revoke_user_role(uuid,text) from public;
revoke all on function public.create_service(uuid,text,timestamp with time zone,text,text,text,text,text,text,text) from public;
revoke all on function public.update_service(uuid,timestamp with time zone,text,text) from public;
revoke all on function public.assign_service(uuid,uuid,uuid,boolean,text) from public;
revoke all on function public.reassign_service(uuid,uuid,uuid,text,boolean) from public;
revoke all on function public.accept_service_assignment(uuid) from public;
revoke all on function public.reject_service_assignment(uuid,text) from public;
revoke all on function public.advance_service_progress(uuid,text,text) from public;
revoke all on function public.start_service_on_way(uuid,text) from public;
revoke all on function public.mark_service_arrived(uuid,text) from public;
revoke all on function public.mark_passenger_on_board(uuid,text) from public;
revoke all on function public.mark_service_finishing(uuid,text) from public;
revoke all on function public.complete_service(uuid,text) from public;
revoke all on function public.cancel_service(uuid,text,text) from public;
revoke all on function public.finalize_service_pricing(uuid,numeric,numeric,text) from public;
revoke all on function public.register_service_payment(uuid,numeric,text,uuid,timestamp with time zone,text,text,text) from public;
revoke all on function public.reverse_service_payment(uuid,text) from public;
revoke all on function public.create_cash_movement(uuid,text,numeric,text,timestamp with time zone,text,jsonb) from public;
revoke all on function public.reverse_cash_movement(uuid,text) from public;
revoke all on function public.create_cash_remittance(uuid,uuid,numeric,text) from public;
revoke all on function public.verify_cash_remittance(uuid,numeric) from public;
revoke all on function public.create_cash_count(uuid,numeric,timestamp with time zone,text) from public;
revoke all on function public.create_receivable_from_service(uuid,timestamp with time zone,text) from public;
revoke all on function public.collect_receivable(uuid,uuid,timestamp with time zone,text,text) from public;
revoke all on function public.annul_receivable_payment(uuid,text) from public;
revoke all on function public.create_expense(uuid,numeric,numeric,text,date,uuid,uuid,uuid,uuid,text,boolean,text) from public;
revoke all on function public.register_expense_payment(uuid,numeric,text,uuid,timestamp with time zone,text) from public;
revoke all on function public.cancel_expense(uuid,text) from public;
revoke all on function public.generate_settlement(uuid,date,date,text) from public;
revoke all on function public.submit_settlement(uuid) from public;
revoke all on function public.approve_settlement(uuid) from public;
revoke all on function public.reject_settlement(uuid,text) from public;
revoke all on function public.pay_settlement(uuid,uuid,timestamp with time zone,text) from public;
revoke all on function public.cancel_settlement(uuid,text) from public;
revoke all on function public.cancel_approved_settlement(uuid,text) from public;
revoke all on function public.annul_settlement_payment(uuid,text) from public;
revoke all on function public.create_incident(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text) from public;
revoke all on function public.acknowledge_incident(uuid) from public;
revoke all on function public.investigate_incident(uuid) from public;
revoke all on function public.resolve_incident(uuid,text) from public;
revoke all on function public.cancel_incident(uuid,text) from public;
revoke all on function public.add_incident_comment(uuid,text,text,boolean) from public;
revoke all on function public.get_app_setting(text,text,uuid) from public;
revoke all on function public.set_app_setting(text,text,uuid,text,jsonb,text) from public;
revoke all on function public.create_configurable_catalog_item(uuid,text,text,text,integer,jsonb) from public;
revoke all on function public.update_configurable_catalog_item(uuid,text,text,integer,jsonb) from public;
revoke all on function public.set_configurable_catalog_item_active(uuid,boolean) from public;

grant execute on function public.set_active_context(text) to authenticated, service_role;
grant execute on function public.assign_user_role(uuid,text,text) to authenticated, service_role;
grant execute on function public.revoke_user_role(uuid,text) to authenticated, service_role;
grant execute on function public.create_service(uuid,text,timestamp with time zone,text,text,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.update_service(uuid,timestamp with time zone,text,text) to authenticated, service_role;
grant execute on function public.assign_service(uuid,uuid,uuid,boolean,text) to authenticated, service_role;
grant execute on function public.reassign_service(uuid,uuid,uuid,text,boolean) to authenticated, service_role;
grant execute on function public.accept_service_assignment(uuid) to authenticated, service_role;
grant execute on function public.reject_service_assignment(uuid,text) to authenticated, service_role;
grant execute on function public.start_service_on_way(uuid,text) to authenticated, service_role;
grant execute on function public.mark_service_arrived(uuid,text) to authenticated, service_role;
grant execute on function public.mark_passenger_on_board(uuid,text) to authenticated, service_role;
grant execute on function public.mark_service_finishing(uuid,text) to authenticated, service_role;
grant execute on function public.complete_service(uuid,text) to authenticated, service_role;
grant execute on function public.cancel_service(uuid,text,text) to authenticated, service_role;
grant execute on function public.finalize_service_pricing(uuid,numeric,numeric,text) to authenticated, service_role;
grant execute on function public.register_service_payment(uuid,numeric,text,uuid,timestamp with time zone,text,text,text) to authenticated, service_role;
grant execute on function public.reverse_service_payment(uuid,text) to authenticated, service_role;
grant execute on function public.create_cash_movement(uuid,text,numeric,text,timestamp with time zone,text,jsonb) to authenticated, service_role;
grant execute on function public.reverse_cash_movement(uuid,text) to authenticated, service_role;
grant execute on function public.create_cash_remittance(uuid,uuid,numeric,text) to authenticated, service_role;
grant execute on function public.verify_cash_remittance(uuid,numeric) to service_role;
grant execute on function public.create_cash_count(uuid,numeric,timestamp with time zone,text) to authenticated, service_role;
grant execute on function public.create_receivable_from_service(uuid,timestamp with time zone,text) to authenticated, service_role;
grant execute on function public.collect_receivable(uuid,uuid,timestamp with time zone,text,text) to authenticated, service_role;
grant execute on function public.annul_receivable_payment(uuid,text) to service_role;
grant execute on function public.create_expense(uuid,numeric,numeric,text,date,uuid,uuid,uuid,uuid,text,boolean,text) to authenticated, service_role;
grant execute on function public.register_expense_payment(uuid,numeric,text,uuid,timestamp with time zone,text) to authenticated, service_role;
grant execute on function public.cancel_expense(uuid,text) to authenticated, service_role;
grant execute on function public.generate_settlement(uuid,date,date,text) to authenticated, service_role;
grant execute on function public.submit_settlement(uuid) to authenticated, service_role;
grant execute on function public.approve_settlement(uuid) to authenticated, service_role;
grant execute on function public.reject_settlement(uuid,text) to authenticated, service_role;
grant execute on function public.pay_settlement(uuid,uuid,timestamp with time zone,text) to authenticated, service_role;
grant execute on function public.cancel_settlement(uuid,text) to authenticated, service_role;
grant execute on function public.cancel_approved_settlement(uuid,text) to authenticated, service_role;
grant execute on function public.annul_settlement_payment(uuid,text) to service_role;
grant execute on function public.create_incident(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text) to authenticated, service_role;
grant execute on function public.acknowledge_incident(uuid) to authenticated, service_role;
grant execute on function public.investigate_incident(uuid) to authenticated, service_role;
grant execute on function public.resolve_incident(uuid,text) to authenticated, service_role;
grant execute on function public.cancel_incident(uuid,text) to authenticated, service_role;
grant execute on function public.add_incident_comment(uuid,text,text,boolean) to authenticated, service_role;
grant execute on function public.get_app_setting(text,text,uuid) to authenticated, service_role;
grant execute on function public.set_app_setting(text,text,uuid,text,jsonb,text) to authenticated, service_role;
grant execute on function public.create_configurable_catalog_item(uuid,text,text,text,integer,jsonb) to authenticated, service_role;
grant execute on function public.update_configurable_catalog_item(uuid,text,text,integer,jsonb) to authenticated, service_role;
grant execute on function public.set_configurable_catalog_item_active(uuid,boolean) to authenticated, service_role;

-- Static validations. They do not create business rows and do not consume human codes.
do $$
declare
  v_missing text;
begin
  select string_agg(signature, ', ' order by signature)
    into v_missing
  from (
    values
      ('public.require_current_app_user()'),
      ('public.require_any_role(text[])'),
      ('public.set_active_context(text)'),
      ('public.create_service(uuid,text,timestamp with time zone,text,text,text,text,text,text,text)'),
      ('public.assign_service(uuid,uuid,uuid,boolean,text)'),
      ('public.register_service_payment(uuid,numeric,text,uuid,timestamp with time zone,text,text,text)'),
      ('public.collect_receivable(uuid,uuid,timestamp with time zone,text,text)'),
      ('public.create_expense(uuid,numeric,numeric,text,date,uuid,uuid,uuid,uuid,text,boolean,text)'),
      ('public.generate_settlement(uuid,date,date,text)'),
      ('public.create_incident(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text)'),
      ('public.set_app_setting(text,text,uuid,text,jsonb,text)')
  ) as expected(signature)
  where to_regprocedure(signature) is null;

  if v_missing is not null then
    raise exception 'Missing secure function signatures: %', v_missing;
  end if;

  if has_function_privilege('anon', 'public.create_service(uuid,text,timestamp with time zone,text,text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'anon must not execute secure domain RPC functions.';
  end if;

  if has_function_privilege('authenticated', 'public.verify_cash_remittance(uuid,numeric)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.annul_receivable_payment(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.annul_settlement_payment(uuid,text)', 'EXECUTE')
  then
    raise exception 'Stubs must not be executable by authenticated.';
  end if;
end;
$$;
