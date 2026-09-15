-- Migration 0023: driver-facing service overview read RPC.
-- Keeps the existing security_invoker view intact and avoids RLS fan-out in the driver read path.

create or replace function public.get_driver_service_overview()
returns table(
  service_id uuid,
  human_code text,
  service_type text,
  operational_status text,
  scheduled_start_at timestamptz,
  assignment_id uuid,
  assignment_status text,
  assigned_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  ended_at timestamptz,
  vehicle_id uuid,
  vehicle_human_code text,
  plate_normalized text,
  brand text,
  model text,
  customer_display_name text,
  origin_label text,
  origin_address text,
  origin_city text,
  destination_label text,
  destination_address text,
  destination_city text,
  primary_passenger_name text,
  primary_passenger_phone text,
  driver_stage text,
  driver_stage_updated_at timestamptz,
  closure_type text,
  closed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to read driver services.'
      using errcode = '42501';
  end if;

  return query
    select
      service.id as service_id,
      service.human_code,
      service.service_type,
      service.operational_status,
      service.scheduled_start_at,
      assignment.id as assignment_id,
      assignment.assignment_status,
      assignment.assigned_at,
      assignment.accepted_at,
      assignment.rejected_at,
      assignment.ended_at,
      assignment.vehicle_id,
      vehicle.human_code as vehicle_human_code,
      vehicle.plate_normalized,
      vehicle.brand,
      vehicle.model,
      coalesce(
        case
          when customer.customer_type = 'company' then coalesce(company.trade_name, company.legal_name)
          else concat_ws(' ', person.first_name, person.last_name)
        end,
        ''
      ) as customer_display_name,
      origin_location.label as origin_label,
      origin_location.address as origin_address,
      origin_location.city as origin_city,
      destination_location.label as destination_label,
      destination_location.address as destination_address,
      destination_location.city as destination_city,
      passenger.display_name as primary_passenger_name,
      passenger.phone as primary_passenger_phone,
      progress.stage as driver_stage,
      progress.last_update_at as driver_stage_updated_at,
      closure.closure_type,
      closure.closed_at
    from public.service_assignments assignment
    join public.services service
      on service.id = assignment.service_id
      and service.deleted_at is null
    join public.customers customer on customer.id = service.customer_id
    left join public.companies company on company.id = customer.company_id
    left join public.persons person on person.id = customer.person_id
    left join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
    left join lateral (
      select location.label, location.address, location.city
      from public.service_locations location
      where location.service_id = service.id
        and location.location_type = 'origin'
      order by location.sort_order, location.created_at
      limit 1
    ) origin_location on true
    left join lateral (
      select location.label, location.address, location.city
      from public.service_locations location
      where location.service_id = service.id
        and location.location_type = 'destination'
      order by location.sort_order, location.created_at
      limit 1
    ) destination_location on true
    left join lateral (
      select passenger_row.display_name, passenger_row.phone
      from public.service_passengers passenger_row
      where passenger_row.service_id = service.id
      order by passenger_row.is_primary desc, passenger_row.created_at
      limit 1
    ) passenger on true
    left join public.service_driver_progress progress
      on progress.service_id = service.id
      and progress.assignment_id = assignment.id
      and progress.driver_id = v_driver_id
    left join public.service_closures closure on closure.service_id = service.id
    where assignment.driver_id = v_driver_id
      and (
        assignment.assignment_status in ('pending_acceptance', 'accepted')
        or (
          assignment.assignment_status = 'ended'
          and assignment.accepted_at is not null
          and assignment.ended_at is not null
        )
      )
    order by service.scheduled_start_at asc, service.id asc;
end;
$$;

comment on function public.get_driver_service_overview() is
  'Returns the authenticated conductor service overview using explicit assignment ownership instead of the security_invoker view read path.';

revoke all on function public.get_driver_service_overview() from public;
revoke all on function public.get_driver_service_overview() from anon;
revoke all on function public.get_driver_service_overview() from authenticated;
revoke all on function public.get_driver_service_overview() from service_role;

grant execute on function public.get_driver_service_overview() to authenticated;
grant execute on function public.get_driver_service_overview() to service_role;

do $$
begin
  if to_regprocedure('public.get_driver_service_overview()') is null then
    raise exception 'Missing function public.get_driver_service_overview().';
  end if;

  if has_function_privilege('anon', 'public.get_driver_service_overview()', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.get_driver_service_overview().';
  end if;

  if not has_function_privilege('authenticated', 'public.get_driver_service_overview()', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.get_driver_service_overview().';
  end if;

  if not has_function_privilege('service_role', 'public.get_driver_service_overview()', 'EXECUTE') then
    raise exception 'service_role must be able to execute public.get_driver_service_overview().';
  end if;
end;
$$;
