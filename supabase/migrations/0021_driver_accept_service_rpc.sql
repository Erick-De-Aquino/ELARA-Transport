-- Migration 0021: driver-facing service acceptance RPC.
-- The frontend must not update service_assignments directly.

create or replace function public.accept_driver_service(p_service_id uuid)
returns table(
  service_id uuid,
  assignment_id uuid,
  assignment_status text,
  accepted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_existing_assignment_status text;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to accept a service.'
      using errcode = '42501';
  end if;

  select service.*
    into v_service
  from public.services service
  where service.id = p_service_id
    and service.deleted_at is null;

  if not found then
    raise exception 'Service was not found or is not available.'
      using errcode = '23503';
  end if;

  if v_service.operational_status in ('completed', 'cancelled', 'no_show', 'not_performed') then
    raise exception 'Service status does not allow acceptance.'
      using errcode = '23514';
  end if;

  select assignment.*
    into v_assignment
  from public.service_assignments assignment
  where assignment.service_id = p_service_id
    and assignment.driver_id = v_driver_id
    and assignment.assignment_status = 'pending_acceptance'
  for update;

  if not found then
    select assignment.assignment_status
      into v_existing_assignment_status
    from public.service_assignments assignment
    where assignment.service_id = p_service_id
      and assignment.driver_id = v_driver_id
    order by assignment.assigned_at desc, assignment.created_at desc
    limit 1;

    if v_existing_assignment_status = 'accepted' then
      raise exception 'Service assignment has already been accepted.'
        using errcode = '23514';
    end if;

    if v_existing_assignment_status is not null then
      raise exception 'Service assignment is not pending acceptance.'
        using errcode = '23514';
    end if;

    raise exception 'Service is not assigned to the current conductor.'
      using errcode = '42501';
  end if;

  return query
    update public.service_assignments assignment
       set assignment_status = 'accepted',
           accepted_at = now(),
           accepted_by_driver_id = v_driver_id
     where assignment.id = v_assignment.id
    returning
      assignment.service_id,
      assignment.id,
      assignment.assignment_status,
      assignment.accepted_at;
end;
$$;

comment on function public.accept_driver_service(uuid) is
  'Allows the authenticated conductor to accept one of their own pending service assignments.';

revoke all on function public.accept_driver_service(uuid) from public;
revoke all on function public.accept_driver_service(uuid) from anon;
revoke all on function public.accept_driver_service(uuid) from authenticated;
revoke all on function public.accept_driver_service(uuid) from service_role;

grant execute on function public.accept_driver_service(uuid) to authenticated;
grant execute on function public.accept_driver_service(uuid) to service_role;

do $$
begin
  if to_regprocedure('public.accept_driver_service(uuid)') is null then
    raise exception 'Missing function public.accept_driver_service(uuid).';
  end if;

  if has_function_privilege('anon', 'public.accept_driver_service(uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.accept_driver_service(uuid).';
  end if;

  if not has_function_privilege('authenticated', 'public.accept_driver_service(uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.accept_driver_service(uuid).';
  end if;

  if not has_function_privilege('service_role', 'public.accept_driver_service(uuid)', 'EXECUTE') then
    raise exception 'service_role must be able to execute public.accept_driver_service(uuid).';
  end if;
end;
$$;
