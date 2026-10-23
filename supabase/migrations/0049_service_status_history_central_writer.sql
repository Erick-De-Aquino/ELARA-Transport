-- 0049: forward-only central history of real operational status transitions.
-- No initial INSERT, backfill, table grants, policies or financial changes.
-- SECURITY DEFINER is required: normal RPC callers cannot insert history directly.
-- Actor/session are validated by existing backend helpers; never use updated_by
-- (which may be stale), caller arguments, custom actor GUCs or cancellation guesses.
-- Active assignment is unique by the existing partial unique index. Driver context
-- must match it. Start/finish stage metadata describes the transition, not a read
-- of progress (start RPC updates progress AFTER services).
create or replace function elara_private.write_service_status_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $history$
declare
  v_user uuid;
  v_driver uuid;
  v_context text;
  v_assignment uuid;
  v_metadata jsonb := pg_catalog.jsonb_build_object('source', 'service_status_transition_trigger');
begin
  v_user := public.rls_current_app_user_id();
  v_context := public.rls_current_active_context();
  if v_user is not null then
    v_metadata := v_metadata || pg_catalog.jsonb_build_object(
      'session_id', public.current_auth_session_id(), 'active_context', v_context);
    if v_context = 'conductor' then
      v_driver := public.rls_current_driver_id();
      -- Do not silently misattribute a conductor without a valid driver link.
      if v_driver is null then
        raise exception 'A valid conductor identity is required for status history.' using errcode = '42501';
      end if;
      v_user := null;
    end if;
  elsif auth.uid() is not null then
    raise exception 'A valid app session is required for status history.' using errcode = '28000';
  end if;

  select a.id into v_assignment
  from public.service_assignments a
  where a.service_id = new.id
    and a.assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required')
    and a.ended_at is null
    and (v_driver is null or a.driver_id = v_driver);

  if v_driver is not null and v_assignment is not null then
    if old.operational_status = 'confirmed' and new.operational_status = 'in_progress' then
      v_metadata := v_metadata || pg_catalog.jsonb_build_object('driver_stage', 'on_way');
    elsif old.operational_status = 'in_progress' and new.operational_status = 'completed' then
      v_metadata := v_metadata || pg_catalog.jsonb_build_object('driver_stage', 'finished');
    end if;
  end if;

  insert into public.service_status_history
    (service_id, from_status, to_status, changed_at, changed_by_user_id,
     changed_by_driver_id, assignment_id, reason, metadata)
  values
    (new.id, old.operational_status, new.operational_status, pg_catalog.clock_timestamp(),
     v_user, v_driver, v_assignment, null, v_metadata);
  return new;
end;
$history$;
alter function elara_private.write_service_status_history() owner to postgres;
revoke all on function elara_private.write_service_status_history() from public, anon, authenticated, service_role;

create trigger write_service_status_history
  after update of operational_status on public.services
  for each row
  when (old.operational_status is distinct from new.operational_status)
  execute function elara_private.write_service_status_history();

-- Existing RPC definitions below differ ONLY by removing their explicit history INSERT.
-- CREATE OR REPLACE preserves owner and ACLs; signatures/security/search_path unchanged.
create or replace function public.start_driver_service(p_service_id uuid)
returns table(
  service_id uuid,
  assignment_id uuid,
  operational_status text,
  driver_stage text,
  started_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_started_at timestamptz;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_progress public.service_driver_progress%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to start a service.'
      using errcode = '42501';
  end if;

  v_app_user_id := public.rls_current_app_user_id();
  v_started_at := now();

  select service.*
    into v_service
  from public.services service
  where service.id = p_service_id
    and service.deleted_at is null
  for update;

  if not found then
    raise exception 'Service was not found or is not available.'
      using errcode = '23503';
  end if;

  select assignment.*
    into v_assignment
  from public.service_assignments assignment
  where assignment.service_id = p_service_id
    and assignment.driver_id = v_driver_id
  order by assignment.assigned_at desc, assignment.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Service is not assigned to the current conductor.'
      using errcode = '42501';
  end if;

  if v_assignment.assignment_status = 'pending_acceptance' then
    raise exception 'Service assignment must be accepted before starting.'
      using errcode = '23514';
  end if;

  if v_assignment.assignment_status = 'rejected' then
    raise exception 'Rejected service assignments cannot be started.'
      using errcode = '23514';
  end if;

  if v_assignment.assignment_status in ('ended', 'cancelled') then
    raise exception 'Closed service assignments cannot be started.'
      using errcode = '23514';
  end if;

  if v_assignment.assignment_status <> 'accepted'
    or v_assignment.accepted_at is null
    or v_assignment.accepted_by_driver_id is distinct from v_driver_id
  then
    raise exception 'Service assignment is not valid for starting.'
      using errcode = '23514';
  end if;

  if v_service.operational_status = 'in_progress' then
    raise exception 'Service has already been started.'
      using errcode = '23514';
  end if;

  if v_service.operational_status in ('completed', 'cancelled', 'no_show', 'not_performed') then
    raise exception 'Final service status does not allow starting.'
      using errcode = '23514';
  end if;

  if v_service.operational_status <> 'confirmed' then
    raise exception 'Service must be confirmed before it can be started.'
      using errcode = '23514';
  end if;

  update public.services service
     set operational_status = 'in_progress'
   where service.id = p_service_id
  returning service.* into v_service;

  select progress.*
    into v_progress
  from public.service_driver_progress progress
  where progress.service_id = p_service_id
    and progress.assignment_id = v_assignment.id
  for update;

  if found then
    if v_progress.stage <> 'not_started' then
      raise exception 'Service driver progress has already started.'
        using errcode = '23514';
    end if;

    update public.service_driver_progress progress
       set stage = 'on_way',
           started_at = coalesce(progress.started_at, v_started_at),
           last_update_at = v_started_at,
           updated_by = v_app_user_id
     where progress.id = v_progress.id
    returning progress.* into v_progress;
  else
    insert into public.service_driver_progress (
      service_id,
      assignment_id,
      driver_id,
      stage,
      started_at,
      last_update_at,
      updated_by
    )
    values (
      p_service_id,
      v_assignment.id,
      v_driver_id,
      'on_way',
      v_started_at,
      v_started_at,
      v_app_user_id
    )
    returning * into v_progress;
  end if;


  insert into public.service_events (
    service_id,
    event_type,
    occurred_at,
    actor_driver_id,
    assignment_id,
    vehicle_id,
    title,
    description,
    metadata
  )
  values (
    p_service_id,
    'service_started',
    v_started_at,
    v_driver_id,
    v_assignment.id,
    v_assignment.vehicle_id,
    'Service started',
    'Driver started service.',
    jsonb_build_object('driver_stage', 'on_way')
  );

  service_id := v_service.id;
  assignment_id := v_assignment.id;
  operational_status := v_service.operational_status;
  driver_stage := v_progress.stage;
  started_at := v_progress.started_at;
  return next;
end;
$$;

create or replace function public.advance_driver_service_progress(
  p_service_id uuid,
  p_target_stage text
)
returns table(
  service_id uuid,
  assignment_id uuid,
  operational_status text,
  driver_stage text,
  driver_stage_updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_target_stage text;
  v_expected_stage text;
  v_changed_at timestamptz;
  v_previous_stage text;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_progress public.service_driver_progress%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to update service progress.'
      using errcode = '42501';
  end if;

  v_app_user_id := public.rls_current_app_user_id();
  v_target_stage := lower(trim(coalesce(p_target_stage, '')));
  v_changed_at := now();

  if v_target_stage not in ('waiting_passenger', 'passenger_on_board', 'finishing', 'finished') then
    raise exception 'Invalid service progress target stage.'
      using errcode = '23514';
  end if;

  select service.*
    into v_service
  from public.services service
  where service.id = p_service_id
    and service.deleted_at is null
  for update;

  if not found then
    raise exception 'Service was not found or is not available.'
      using errcode = '23503';
  end if;

  select assignment.*
    into v_assignment
  from public.service_assignments assignment
  where assignment.service_id = p_service_id
    and assignment.driver_id = v_driver_id
  order by assignment.assigned_at desc, assignment.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Service is not assigned to the current conductor.'
      using errcode = '42501';
  end if;

  if v_service.operational_status in ('completed', 'cancelled', 'no_show', 'not_performed') then
    raise exception 'Final service status does not allow progress updates.'
      using errcode = '23514';
  end if;

  if v_assignment.assignment_status <> 'accepted'
    or v_assignment.accepted_at is null
    or v_assignment.ended_at is not null
  then
    raise exception 'Service assignment is not valid for progress updates.'
      using errcode = '23514';
  end if;

  if v_service.operational_status <> 'in_progress' then
    raise exception 'Service must be started before progress can be updated.'
      using errcode = '23514';
  end if;

  select progress.*
    into v_progress
  from public.service_driver_progress progress
  where progress.service_id = p_service_id
    and progress.assignment_id = v_assignment.id
    and progress.driver_id = v_driver_id
  for update;

  if not found then
    raise exception 'Service progress has not been started.'
      using errcode = '23514';
  end if;

  if v_progress.stage = 'finished' then
    raise exception 'Service progress has already been finished.'
      using errcode = '23514';
  end if;

  if v_progress.stage = v_target_stage then
    raise exception 'Service progress is already at target stage.'
      using errcode = '23514';
  end if;

  v_expected_stage := case v_progress.stage
    when 'on_way' then 'waiting_passenger'
    when 'waiting_passenger' then 'passenger_on_board'
    when 'passenger_on_board' then 'finishing'
    when 'finishing' then 'finished'
    else null
  end;

  if v_expected_stage is null then
    raise exception 'Service has not reached a stage that can be advanced by this action.'
      using errcode = '23514';
  end if;

  if v_target_stage <> v_expected_stage then
    raise exception 'Invalid progress transition from % to %.', v_progress.stage, v_target_stage
      using errcode = '23514';
  end if;

  v_previous_stage := v_progress.stage;

  update public.service_driver_progress progress
     set stage = v_target_stage,
         started_at = coalesce(progress.started_at, v_changed_at),
         arrived_at = case
           when v_target_stage in ('waiting_passenger', 'passenger_on_board', 'finishing', 'finished')
             then coalesce(progress.arrived_at, v_changed_at)
           else progress.arrived_at
         end,
         passenger_on_board_at = case
           when v_target_stage in ('passenger_on_board', 'finishing', 'finished')
             then coalesce(progress.passenger_on_board_at, v_changed_at)
           else progress.passenger_on_board_at
         end,
         finished_at = case
           when v_target_stage = 'finished' then coalesce(progress.finished_at, v_changed_at)
           else progress.finished_at
         end,
         last_update_at = v_changed_at,
         updated_by = v_app_user_id
   where progress.id = v_progress.id
  returning progress.* into v_progress;

  if v_target_stage = 'finished' then
    set constraints validate_service_driver_progress_integrity immediate;
    set constraints validate_service_driver_progress_integrity deferred;

    insert into public.service_closures (
      service_id,
      assignment_id,
      closure_type,
      closed_at,
      closed_by_driver_id,
      reason_details,
      created_by
    )
    values (
      p_service_id,
      v_assignment.id,
      'completed',
      v_progress.finished_at,
      v_driver_id,
      'Driver completed service progress.',
      v_app_user_id
    );

    update public.services service
       set operational_status = 'completed',
           updated_by = v_app_user_id
     where service.id = p_service_id
       and service.operational_status = 'in_progress'
    returning service.* into v_service;

    if not found then
      raise exception 'Service must be in progress to complete.'
        using errcode = '23514';
    end if;

    update public.service_assignments assignment
       set assignment_status = 'ended',
           ended_at = v_progress.finished_at,
           ended_by = v_app_user_id
     where assignment.id = v_assignment.id
       and assignment.assignment_status = 'accepted'
       and assignment.ended_at is null
    returning assignment.* into v_assignment;

    if not found then
      raise exception 'Service assignment was already closed.'
        using errcode = '23514';
    end if;


    insert into public.service_events (
      service_id,
      event_type,
      occurred_at,
      actor_driver_id,
      assignment_id,
      vehicle_id,
      title,
      description,
      metadata
    )
    values (
      p_service_id,
      'service_completed',
      v_progress.finished_at,
      v_driver_id,
      v_assignment.id,
      v_assignment.vehicle_id,
      'Service completed',
      'Driver completed service.',
      jsonb_build_object('driver_stage', v_target_stage)
    );
  else
    insert into public.service_events (
      service_id,
      event_type,
      occurred_at,
      actor_driver_id,
      assignment_id,
      vehicle_id,
      title,
      description,
      metadata
    )
    values (
      p_service_id,
      'driver_stage_updated',
      v_changed_at,
      v_driver_id,
      v_assignment.id,
      v_assignment.vehicle_id,
      'Driver stage updated',
      'Driver advanced service progress.',
      jsonb_build_object('from_stage', v_previous_stage, 'to_stage', v_target_stage)
    );
  end if;

  service_id := v_service.id;
  assignment_id := v_assignment.id;
  operational_status := v_service.operational_status;
  driver_stage := v_progress.stage;
  driver_stage_updated_at := v_progress.last_update_at;
  completed_at := v_progress.finished_at;
  return next;
end;
$$;
