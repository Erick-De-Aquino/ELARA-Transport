-- Migration 0024: driver-facing service progress RPC.
-- The frontend must not update services, service_assignments or service_driver_progress directly.

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

    insert into public.service_status_history (
      service_id,
      from_status,
      to_status,
      changed_at,
      changed_by_driver_id,
      assignment_id,
      reason,
      metadata
    )
    values (
      p_service_id,
      'in_progress',
      'completed',
      v_progress.finished_at,
      v_driver_id,
      v_assignment.id,
      'Driver completed service.',
      jsonb_build_object('driver_stage', v_target_stage)
    );

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

comment on function public.advance_driver_service_progress(uuid, text) is
  'Allows the authenticated conductor to advance one of their own in-progress services through the existing driver progress stages.';

revoke all on function public.advance_driver_service_progress(uuid, text) from public;
revoke all on function public.advance_driver_service_progress(uuid, text) from anon;
revoke all on function public.advance_driver_service_progress(uuid, text) from authenticated;
revoke all on function public.advance_driver_service_progress(uuid, text) from service_role;

grant execute on function public.advance_driver_service_progress(uuid, text) to authenticated;
grant execute on function public.advance_driver_service_progress(uuid, text) to service_role;

do $$
begin
  if to_regprocedure('public.advance_driver_service_progress(uuid,text)') is null then
    raise exception 'Missing function public.advance_driver_service_progress(uuid,text).';
  end if;

  if has_function_privilege('anon', 'public.advance_driver_service_progress(uuid,text)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.advance_driver_service_progress(uuid,text).';
  end if;

  if not has_function_privilege('authenticated', 'public.advance_driver_service_progress(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.advance_driver_service_progress(uuid,text).';
  end if;

  if not has_function_privilege('service_role', 'public.advance_driver_service_progress(uuid,text)', 'EXECUTE') then
    raise exception 'service_role must be able to execute public.advance_driver_service_progress(uuid,text).';
  end if;
end;
$$;
