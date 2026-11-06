-- 0054: accept and confirm atomically through the real driver RPC.
-- Definition only: no backfill or repair of existing accepted/pending services.
-- CREATE OR REPLACE preserves the existing owner, ACL and return contract.
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
  v_actor uuid;
  v_service public.services%rowtype;
  v_assignment public.service_assignments%rowtype;
  v_existing_assignment_status text;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to accept a service.'
      using errcode = '42501';
  end if;

  v_actor := public.require_current_app_user();

  -- Match start/assign lock order; serialize acceptance before inspecting assignments.
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

  -- RETURN QUERY appends the result; failures below still roll back acceptance.
  -- The existing integrity/history triggers remain authoritative.
  update public.services service
     set operational_status = 'confirmed', updated_by = v_actor
   where service.id = p_service_id
     and service.operational_status = 'pending';
end;
$$;
