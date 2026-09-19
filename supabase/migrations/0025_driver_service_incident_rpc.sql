-- ELARA Transport V4.0
-- Migration 0025: driver service incident reporting RPC.
--
-- The frontend must not insert incidents directly. The authenticated conductor
-- is resolved from the active app session and ownership is checked through the
-- real service assignment.

create or replace function public.record_incident_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user uuid;
  v_actor_driver uuid;
begin
  if tg_op = 'INSERT' then
    v_actor_driver := new.reported_by_driver_id;
    v_actor_user := case
      when v_actor_driver is not null then null
      else coalesce(new.reported_by_user_id, new.created_by)
    end;

    insert into public.incident_events (
      incident_id,
      event_type,
      to_status,
      actor_user_id,
      actor_driver_id,
      title,
      metadata
    ) values (
      new.id,
      'incident_created',
      new.status,
      v_actor_user,
      v_actor_driver,
      'Incident created',
      jsonb_build_object('human_code', new.human_code, 'severity', new.severity)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    v_actor_user := coalesce(new.updated_by, new.acknowledged_by, new.resolved_by, new.cancelled_by);
    v_actor_driver := null;

    if new.status is distinct from old.status then
      insert into public.incident_events (
        incident_id,
        event_type,
        from_status,
        to_status,
        actor_user_id,
        title,
        metadata
      ) values (
        new.id,
        case
          when new.status = 'resolved' then 'incident_resolved'
          when new.status = 'cancelled' then 'incident_cancelled'
          else 'status_changed'
        end,
        old.status,
        new.status,
        v_actor_user,
        'Incident status changed',
        jsonb_build_object('from', old.status, 'to', new.status)
      );
    end if;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.create_driver_service_incident(
  p_service_id uuid,
  p_incident_type text,
  p_description text
)
returns table(
  incident_id uuid,
  human_code text,
  service_id uuid,
  category_key text,
  category_name text,
  status text,
  severity text,
  description text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_app_user_id uuid;
  v_category public.incident_categories%rowtype;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_description text;
  v_incident public.incidents%rowtype;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to report an incident.'
      using errcode = '42501';
  end if;

  v_app_user_id := public.rls_current_app_user_id();

  if v_app_user_id is null then
    raise exception 'A valid conductor active context is required to report an incident.'
      using errcode = '42501';
  end if;

  v_description := trim(coalesce(p_description, ''));

  if p_service_id is null then
    raise exception 'A valid service_id is required to report an incident.'
      using errcode = '23514';
  end if;

  if length(v_description) = 0 then
    raise exception 'Incident description cannot be empty.'
      using errcode = '23514';
  end if;

  if length(v_description) > 2000 then
    raise exception 'Incident description cannot exceed 2000 characters.'
      using errcode = '23514';
  end if;

  select *
    into v_category
  from public.incident_categories category
  where category.key = lower(trim(coalesce(p_incident_type, '')))
    and category.is_active = true
    and 'service' = any(category.applies_to)
  limit 1;

  if not found then
    raise exception 'Incident category is not valid for service incidents.'
      using errcode = '23514';
  end if;

  select *
    into v_service
  from public.services service
  where service.id = p_service_id
    and service.deleted_at is null;

  if not found then
    raise exception 'Service was not found or is not available.'
      using errcode = '42501';
  end if;

  select *
    into v_assignment
  from public.service_assignments assignment
  where assignment.service_id = v_service.id
    and assignment.driver_id = v_driver_id
    and (
      (
        v_service.operational_status in ('confirmed', 'in_progress')
        and assignment.assignment_status = 'accepted'
      )
      or (
        v_service.operational_status = 'completed'
        and assignment.assignment_status = 'ended'
        and assignment.accepted_at is not null
        and assignment.ended_at is not null
      )
    )
  order by assignment.assigned_at desc, assignment.created_at desc
  limit 1;

  if not found then
    raise exception 'The selected service cannot receive driver incidents.'
      using errcode = '42501';
  end if;

  insert into public.incidents (
    category_id,
    title,
    description,
    severity,
    status,
    source,
    service_id,
    driver_id,
    vehicle_id,
    customer_id,
    reported_by_driver_id,
    created_by
  ) values (
    v_category.id,
    v_category.name_es,
    v_description,
    v_category.default_severity,
    'open',
    'driver_portal',
    v_service.id,
    v_driver_id,
    v_assignment.vehicle_id,
    v_service.customer_id,
    v_driver_id,
    v_app_user_id
  )
  returning * into v_incident;

  perform public.secure_audit(
    'insert',
    'incidents',
    v_incident.id,
    v_incident.human_code,
    null,
    to_jsonb(v_incident),
    'Driver reported service incident.',
    jsonb_build_object(
      'operation', 'driver_service_incident_created',
      'service_id', v_service.id,
      'service_human_code', v_service.human_code,
      'category_key', v_category.key
    ),
    v_app_user_id,
    v_driver_id
  );

  return query
    select
      v_incident.id,
      v_incident.human_code,
      v_incident.service_id,
      v_category.key,
      v_category.name_es,
      v_incident.status,
      v_incident.severity,
      v_incident.description,
      v_incident.created_at;
end;
$$;

comment on function public.create_driver_service_incident(uuid, text, text) is
  'Creates an open driver_portal incident for an authenticated conductor service without trusting driver/user ids from the client.';

revoke all on function public.create_driver_service_incident(uuid, text, text) from public;
revoke all on function public.create_driver_service_incident(uuid, text, text) from anon;
revoke all on function public.create_driver_service_incident(uuid, text, text) from authenticated;
revoke all on function public.create_driver_service_incident(uuid, text, text) from service_role;

grant execute on function public.create_driver_service_incident(uuid, text, text) to authenticated;

do $$
begin
  if to_regprocedure('public.create_driver_service_incident(uuid, text, text)') is null then
    raise exception 'Missing function public.create_driver_service_incident(uuid, text, text).';
  end if;

  if has_function_privilege('anon', 'public.create_driver_service_incident(uuid, text, text)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.create_driver_service_incident(uuid, text, text).';
  end if;

  if not has_function_privilege('authenticated', 'public.create_driver_service_incident(uuid, text, text)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.create_driver_service_incident(uuid, text, text).';
  end if;
end;
$$;
