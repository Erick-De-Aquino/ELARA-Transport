-- Migration 0022: driver-facing service start RPC.
-- The frontend must not update services, service_assignments or service_driver_progress directly.

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
    'confirmed',
    'in_progress',
    v_started_at,
    v_driver_id,
    v_assignment.id,
    'Driver started service.',
    jsonb_build_object('driver_stage', 'on_way')
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

comment on function public.start_driver_service(uuid) is
  'Allows the authenticated conductor to start one of their own accepted and confirmed services.';

revoke all on function public.start_driver_service(uuid) from public;
revoke all on function public.start_driver_service(uuid) from anon;
revoke all on function public.start_driver_service(uuid) from authenticated;
revoke all on function public.start_driver_service(uuid) from service_role;

grant execute on function public.start_driver_service(uuid) to authenticated;
grant execute on function public.start_driver_service(uuid) to service_role;

do $$
begin
  if to_regprocedure('public.start_driver_service(uuid)') is null then
    raise exception 'Missing function public.start_driver_service(uuid).';
  end if;

  if has_function_privilege('anon', 'public.start_driver_service(uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.start_driver_service(uuid).';
  end if;

  if not has_function_privilege('authenticated', 'public.start_driver_service(uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.start_driver_service(uuid).';
  end if;

  if not has_function_privilege('service_role', 'public.start_driver_service(uuid)', 'EXECUTE') then
    raise exception 'service_role must be able to execute public.start_driver_service(uuid).';
  end if;
end;
$$;
