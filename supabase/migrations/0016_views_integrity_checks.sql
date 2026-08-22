-- ELARA Transport V4.0
-- Migration 0016: read views and integrity check views.
--
-- Creates only SECURITY INVOKER normal views. These views do not write data,
-- do not repair inconsistencies, do not create triggers, and do not alter RLS.
-- Base table RLS remains the access-control boundary.

drop view if exists public.v_integrity_summary;
drop view if exists public.v_integrity_incidents;
drop view if exists public.v_integrity_settlements;
drop view if exists public.v_integrity_expenses;
drop view if exists public.v_integrity_receivables;
drop view if exists public.v_integrity_cash_movements;
drop view if exists public.v_integrity_service_payments;
drop view if exists public.v_integrity_service_financials;
drop view if exists public.v_integrity_services;
drop view if exists public.v_integrity_vehicle_assignments;
drop view if exists public.v_integrity_document_storage;
drop view if exists public.v_integrity_identity_sessions;
drop view if exists public.v_admin_cash_account_overview;
drop view if exists public.v_admin_settlement_overview;
drop view if exists public.v_admin_receivable_overview;
drop view if exists public.v_admin_service_overview;
drop view if exists public.v_driver_settlement_summary;
drop view if exists public.v_driver_service_overview;

create or replace view public.v_driver_service_overview
with (security_invoker = true)
as
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
  case
    when customer.customer_type = 'company' then coalesce(company.trade_name, company.legal_name)
    else concat_ws(' ', person.first_name, person.last_name)
  end as customer_display_name,
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
from public.services service
join public.service_assignments assignment
  on assignment.service_id = service.id
  and assignment.driver_id = public.rls_current_driver_id()
  and (
    assignment.assignment_status in ('pending_acceptance', 'accepted')
    or (
      assignment.assignment_status = 'ended'
      and assignment.accepted_at is not null
      and assignment.ended_at is not null
    )
  )
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
  select p.display_name, p.phone
  from public.service_passengers p
  where p.service_id = service.id
  order by p.is_primary desc, p.created_at
  limit 1
) passenger on true
left join public.service_driver_progress progress
  on progress.service_id = service.id
  and progress.assignment_id = assignment.id
left join public.service_closures closure on closure.service_id = service.id
where public.rls_current_driver_id() is not null;

comment on view public.v_driver_service_overview is
  'Driver-safe operational service overview. Uses only tables already exposed to drivers by RLS and excludes financial/admin data.';

create or replace view public.v_driver_settlement_summary
with (security_invoker = true)
as
select
  settlement.id as settlement_id,
  settlement.human_code,
  settlement.driver_id,
  settlement.period_start,
  settlement.period_end,
  settlement.status,
  settlement.payment_status,
  settlement.currency_code,
  settlement.driver_type_snapshot,
  settlement.frequency_snapshot,
  settlement.gross_eligible_amount,
  settlement.expense_deduction_amount,
  settlement.adjustment_amount,
  settlement.calculation_base_amount,
  settlement.driver_percentage,
  settlement.elara_percentage,
  settlement.driver_amount,
  settlement.paid_amount,
  settlement.pending_amount,
  payment_summary.completed_payment_count,
  payment_summary.last_payment_at
from public.settlements settlement
left join lateral (
  select
    count(*)::integer as completed_payment_count,
    max(payment.paid_at) as last_payment_at
  from public.settlement_payments payment
  where payment.settlement_id = settlement.id
    and payment.payment_status = 'completed'
) payment_summary on true
where public.rls_current_driver_id() is not null;

comment on view public.v_driver_settlement_summary is
  'Driver-safe settlement summary based on settlement header totals and completed settlement payments. Does not expose settlement_items or snapshots.';

create or replace view public.v_admin_service_overview
with (security_invoker = true)
as
select
  service.id as service_id,
  service.human_code,
  service.service_type,
  service.operational_status,
  service.scheduled_start_at,
  service.customer_id,
  customer.human_code as customer_human_code,
  case
    when customer.customer_type = 'company' then coalesce(company.trade_name, company.legal_name)
    else concat_ws(' ', customer_person.first_name, customer_person.last_name)
  end as customer_display_name,
  assignment.id as current_assignment_id,
  assignment.assignment_status,
  assignment.driver_id,
  driver.human_code as driver_human_code,
  concat_ws(' ', driver_person.first_name, driver_person.last_name) as driver_display_name,
  assignment.vehicle_id,
  vehicle.human_code as vehicle_human_code,
  vehicle.plate_normalized,
  financial.id as service_financial_id,
  financial.pricing_status,
  financial.financial_status,
  financial.currency_code,
  financial.total_amount,
  financial.paid_amount,
  financial.pending_amount,
  receivable.id as active_receivable_id,
  receivable.human_code as active_receivable_code,
  receivable.status as active_receivable_status,
  receivable.pending_amount as active_receivable_pending_amount
from public.services service
join public.customers customer on customer.id = service.customer_id
left join public.companies company on company.id = customer.company_id
left join public.persons customer_person on customer_person.id = customer.person_id
left join lateral (
  select a.*
  from public.service_assignments a
  where a.service_id = service.id
    and a.assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required')
  order by a.assigned_at desc, a.created_at desc
  limit 1
) assignment on true
left join public.drivers driver on driver.id = assignment.driver_id
left join public.persons driver_person on driver_person.id = driver.person_id
left join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
left join public.service_financials financial on financial.service_id = service.id
left join public.receivables receivable
  on receivable.service_id = service.id
  and receivable.status in ('open', 'overdue', 'partial')
where public.rls_is_admin();

comment on view public.v_admin_service_overview is
  'Administrative service overview with customer, current assignment, vehicle, financial status and active receivable summary.';

create or replace view public.v_admin_receivable_overview
with (security_invoker = true)
as
select
  receivable.id as receivable_id,
  receivable.human_code,
  receivable.status,
  receivable.service_id,
  service.human_code as service_human_code,
  receivable.service_financial_id,
  receivable.customer_id,
  customer.human_code as customer_human_code,
  case
    when customer.customer_type = 'company' then coalesce(company.trade_name, company.legal_name)
    else concat_ws(' ', person.first_name, person.last_name)
  end as customer_display_name,
  receivable.currency_code,
  receivable.original_amount,
  receivable.collected_amount,
  receivable.pending_amount,
  receivable.opened_at,
  receivable.due_at,
  receivable.closed_at,
  last_payment.payment_id as last_payment_id,
  last_payment.payment_human_code as last_payment_code,
  last_payment.paid_at as last_payment_at
from public.receivables receivable
join public.services service on service.id = receivable.service_id
join public.customers customer on customer.id = receivable.customer_id
left join public.companies company on company.id = customer.company_id
left join public.persons person on person.id = customer.person_id
left join lateral (
  select payment.id as payment_id, payment.human_code as payment_human_code, payment.paid_at
  from public.receivable_allocations allocation
  join public.service_payments payment on payment.id = allocation.payment_id
  where allocation.receivable_id = receivable.id
    and payment.payment_status = 'completed'
  order by allocation.allocated_at desc, allocation.created_at desc
  limit 1
) last_payment on true
where public.rls_is_admin();

comment on view public.v_admin_receivable_overview is
  'Administrative accounts receivable overview without notes or internal metadata.';

create or replace view public.v_admin_settlement_overview
with (security_invoker = true)
as
select
  settlement.id as settlement_id,
  settlement.human_code,
  settlement.driver_id,
  driver.human_code as driver_human_code,
  concat_ws(' ', person.first_name, person.last_name) as driver_display_name,
  settlement.driver_type_snapshot,
  settlement.frequency_snapshot,
  settlement.period_start,
  settlement.period_end,
  settlement.status,
  settlement.payment_status,
  settlement.currency_code,
  settlement.gross_eligible_amount,
  settlement.expense_deduction_amount,
  settlement.adjustment_amount,
  settlement.calculation_base_amount,
  settlement.driver_amount,
  settlement.elara_amount,
  settlement.paid_amount,
  settlement.pending_amount,
  payment_summary.completed_payment_count,
  payment_summary.last_payment_at
from public.settlements settlement
join public.drivers driver on driver.id = settlement.driver_id
join public.persons person on person.id = driver.person_id
left join lateral (
  select
    count(*)::integer as completed_payment_count,
    max(payment.paid_at) as last_payment_at
  from public.settlement_payments payment
  where payment.settlement_id = settlement.id
    and payment.payment_status = 'completed'
) payment_summary on true
where public.rls_is_admin();

comment on view public.v_admin_settlement_overview is
  'Administrative settlement overview based on settlement header totals and payment aggregates. Does not expose settlement item snapshots.';

create or replace view public.v_admin_cash_account_overview
with (security_invoker = true)
as
select
  account.id as cash_account_id,
  account.name,
  account.account_type,
  account.currency_code,
  account.status,
  account.opening_balance,
  coalesce(round(sum(
    case
      when movement.movement_type = 'inflow' then movement.amount
      when movement.movement_type = 'outflow' then -movement.amount
      else 0
    end
  ), 2), 0) as movement_balance,
  round(account.opening_balance + coalesce(sum(
    case
      when movement.movement_type = 'inflow' then movement.amount
      when movement.movement_type = 'outflow' then -movement.amount
      else 0
    end
  ), 0), 2) as theoretical_balance,
  max(movement.occurred_at) as last_movement_at
from public.cash_accounts account
left join public.cash_movements movement on movement.cash_account_id = account.id
where public.rls_is_admin()
group by account.id;

comment on view public.v_admin_cash_account_overview is
  'Administrative cash account overview. Theoretical balance is derived from opening balance plus valid signed movements.';

create or replace view public.v_integrity_identity_sessions
with (security_invoker = true)
as
select
  'identity'::text as domain,
  'active_session_without_valid_context_role'::text as issue_type,
  'critical'::text as severity,
  'app_sessions'::text as entity_table,
  session.id as entity_id,
  null::text as human_code,
  'Active app_session has no matching active user_role for its active_context.'::text as issue_detail,
  session.active_context as expected_value,
  coalesce(user_role.role_key, 'missing') as actual_value
from public.app_sessions session
join public.app_users app_user on app_user.id = session.app_user_id
left join public.user_roles user_role
  on user_role.user_id = session.app_user_id
  and user_role.role_key = session.active_context
  and user_role.status = 'active'
  and user_role.starts_at <= now()
  and (user_role.ends_at is null or user_role.ends_at > now())
left join public.roles role on role.key = user_role.role_key and role.is_active = true
where public.rls_is_admin()
  and session.ended_at is null
  and session.expires_at > now()
  and (app_user.status <> 'active' or user_role.id is null or role.key is null)
union all
select
  'identity',
  'active_user_without_active_role',
  'warning',
  'app_users',
  app_user.id,
  app_user.human_code,
  'Active app_user has no active role in user_roles.',
  'at least one active role',
  'none'
from public.app_users app_user
where public.rls_is_admin()
  and app_user.status = 'active'
  and not exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.key = user_role.role_key
    where user_role.user_id = app_user.id
      and user_role.status = 'active'
      and user_role.starts_at <= now()
      and (user_role.ends_at is null or user_role.ends_at > now())
      and role.is_active = true
  )
union all
select
  'identity',
  'conductor_session_without_active_driver_link',
  'critical',
  'app_sessions',
  session.id,
  null::text,
  'Active conductor session has no active user_driver_link to an active driver.',
  'active user_driver_link',
  'missing'
from public.app_sessions session
join public.app_users app_user on app_user.id = session.app_user_id
where public.rls_is_admin()
  and session.ended_at is null
  and session.expires_at > now()
  and app_user.status = 'active'
  and session.active_context = 'conductor'
  and not exists (
    select 1
    from public.user_driver_links link
    join public.drivers driver on driver.id = link.driver_id
    where link.user_id = session.app_user_id
      and link.status = 'active'
      and link.started_at <= now()
      and (link.ended_at is null or link.ended_at > now())
      and driver.administrative_status = 'active'
  );

comment on view public.v_integrity_identity_sessions is
  'Administrative integrity issues for active users, roles and app_sessions. Returns only problem rows.';

create or replace view public.v_integrity_document_storage
with (security_invoker = true)
as
select
  'storage'::text as domain,
  'vehicle_document_storage_metadata_invalid'::text as issue_type,
  'warning'::text as severity,
  'vehicle_documents'::text as entity_table,
  document.id as entity_id,
  vehicle.human_code as human_code,
  'Vehicle document Storage metadata does not match the approved bucket/path convention.'::text as issue_detail,
  'vehicle-documents / vehicles/<vehicle_id>/<document_id>/<filename>'::text as expected_value,
  coalesce(document.storage_bucket, 'NULL') || ' / ' || coalesce(document.storage_path, 'NULL') as actual_value
from public.vehicle_documents document
join public.vehicles vehicle on vehicle.id = document.vehicle_id
where public.rls_is_admin()
  and (
    (document.storage_bucket is null and document.storage_path is not null)
    or (document.storage_bucket is not null and document.storage_path is null)
    or (document.storage_bucket is not null and document.storage_bucket <> 'vehicle-documents')
    or (
      document.storage_path is not null
      and not (
        document.storage_path ~* '^vehicles/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
        and split_part(document.storage_path, '/', 2) = document.vehicle_id::text
        and split_part(document.storage_path, '/', 3) = document.id::text
      )
    )
  )
union all
select
  'storage',
  'expense_document_storage_metadata_invalid',
  'warning',
  'expense_documents',
  document.id,
  expense.human_code,
  'Expense document Storage metadata does not match the approved bucket/path convention.',
  'expense-documents / expenses/<expense_id>/<document_id>/<filename>',
  coalesce(document.storage_bucket, 'NULL') || ' / ' || coalesce(document.storage_path, 'NULL')
from public.expense_documents document
join public.expenses expense on expense.id = document.expense_id
where public.rls_is_admin()
  and (
    (document.storage_bucket is null and document.storage_path is not null)
    or (document.storage_bucket is not null and document.storage_path is null)
    or (document.storage_bucket is not null and document.storage_bucket <> 'expense-documents')
    or (
      document.storage_path is not null
      and not (
        document.storage_path ~* '^expenses/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
        and split_part(document.storage_path, '/', 2) = document.expense_id::text
        and split_part(document.storage_path, '/', 3) = document.id::text
      )
    )
  );

comment on view public.v_integrity_document_storage is
  'Administrative metadata-only Storage checks for vehicle and expense documents. Does not query storage.objects.';

create or replace view public.v_integrity_vehicle_assignments
with (security_invoker = true)
as
select
  'vehicles'::text as domain,
  'active_driver_vehicle_assignment_with_inactive_driver'::text as issue_type,
  'critical'::text as severity,
  'driver_vehicle_assignments'::text as entity_table,
  assignment.id as entity_id,
  driver.human_code as human_code,
  'Active driver-vehicle assignment points to a driver/person that is not active.'::text as issue_detail,
  'active driver and active person'::text as expected_value,
  driver.administrative_status || ' / ' || person.status as actual_value
from public.driver_vehicle_assignments assignment
join public.drivers driver on driver.id = assignment.driver_id
join public.persons person on person.id = driver.person_id
where public.rls_is_admin()
  and assignment.status = 'active'
  and (driver.administrative_status <> 'active' or person.status <> 'active')
union all
select
  'vehicles',
  'active_driver_vehicle_assignment_with_unusable_vehicle',
  'critical',
  'driver_vehicle_assignments',
  assignment.id,
  vehicle.human_code,
  'Active driver-vehicle assignment points to a vehicle blocked by master status or external approval.',
  'active, manually available, approved/not_required',
  coalesce(vehicle.inactive_at::text, 'active') || ' / ' || vehicle.manual_operational_status || ' / ' || vehicle.elara_approval_status
from public.driver_vehicle_assignments assignment
join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
where public.rls_is_admin()
  and assignment.status = 'active'
  and (
    vehicle.inactive_at is not null
    or vehicle.manual_operational_status <> 'available'
    or not (vehicle.ownership_type = 'owned' or vehicle.elara_approval_status = 'approved')
  )
union all
select
  'vehicles',
  'active_assignment_with_open_blocking_vehicle_incident',
  'critical',
  'driver_vehicle_assignments',
  assignment.id,
  vehicle.human_code,
  'Active driver-vehicle assignment points to a vehicle with an open blocking technical incident.',
  'no open blocking incident',
  incident.reason_key
from public.driver_vehicle_assignments assignment
join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
join public.vehicle_technical_incidents incident
  on incident.vehicle_id = vehicle.id
  and incident.status = 'open'
join public.vehicle_status_reasons reason
  on reason.key = incident.reason_key
  and reason.blocks_operation = true
where public.rls_is_admin()
  and assignment.status = 'active'
union all
select
  'vehicles',
  'required_vehicle_document_not_current_valid',
  'critical',
  'vehicles',
  vehicle.id,
  vehicle.human_code,
  'Vehicle lacks a current valid or expiring-soon required document for its ownership type.',
  document_type.key,
  coalesce(document.status, 'missing')
from public.vehicles vehicle
join public.vehicle_document_types document_type
  on document_type.is_active = true
  and (
    (vehicle.ownership_type = 'owned' and document_type.required_for_owned = true)
    or (vehicle.ownership_type = 'external' and document_type.required_for_external = true)
  )
left join public.vehicle_documents document
  on document.vehicle_id = vehicle.id
  and document.document_type_key = document_type.key
  and document.replaced_at is null
  and document.status not in ('replaced', 'annulled')
where public.rls_is_admin()
  and vehicle.inactive_at is null
  and (document.id is null or document.status not in ('valid', 'expiring_soon'));

comment on view public.v_integrity_vehicle_assignments is
  'Administrative semantic checks for active driver-vehicle assignments and required vehicle documents.';

create or replace view public.v_integrity_services
with (security_invoker = true)
as
select
  'services'::text as domain,
  'final_service_missing_closure'::text as issue_type,
  'critical'::text as severity,
  'services'::text as entity_table,
  service.id as entity_id,
  service.human_code,
  'Service in completed/no_show/not_performed status has no service_closure row.'::text as issue_detail,
  service.operational_status as expected_value,
  'missing closure'::text as actual_value
from public.services service
where public.rls_is_admin()
  and service.operational_status in ('completed', 'no_show', 'not_performed')
  and not exists (select 1 from public.service_closures closure where closure.service_id = service.id)
union all
select
  'services',
  'cancelled_service_missing_cancellation',
  'critical',
  'services',
  service.id,
  service.human_code,
  'Cancelled service has no service_cancellation row.',
  'service_cancellations row',
  'missing'
from public.services service
where public.rls_is_admin()
  and service.operational_status = 'cancelled'
  and not exists (select 1 from public.service_cancellations cancellation where cancellation.service_id = service.id)
union all
select
  'services',
  'closure_type_mismatches_service_status',
  'critical',
  'service_closures',
  closure.id,
  service.human_code,
  'Service closure type does not match services.operational_status.',
  service.operational_status,
  closure.closure_type
from public.service_closures closure
join public.services service on service.id = closure.service_id
where public.rls_is_admin()
  and closure.closure_type is distinct from service.operational_status
union all
select
  'services',
  'final_service_has_current_assignment',
  'critical',
  'service_assignments',
  assignment.id,
  service.human_code,
  'Final service still has a current assignment.',
  'ended/rejected/cancelled assignment',
  assignment.assignment_status
from public.service_assignments assignment
join public.services service on service.id = assignment.service_id
where public.rls_is_admin()
  and service.operational_status in ('completed', 'cancelled', 'no_show', 'not_performed')
  and assignment.assignment_status in ('pending_acceptance', 'accepted', 'reassignment_required')
union all
select
  'services',
  'active_progress_on_non_active_service',
  'critical',
  'service_driver_progress',
  progress.id,
  service.human_code,
  'Driver progress is active while service is not in_progress.',
  'service in_progress while progress is active',
  service.operational_status || ' / ' || progress.stage
from public.service_driver_progress progress
join public.services service on service.id = progress.service_id
where public.rls_is_admin()
  and progress.stage <> 'finished'
  and service.operational_status <> 'in_progress'
union all
select
  'services',
  'progress_assignment_driver_mismatch',
  'critical',
  'service_driver_progress',
  progress.id,
  service.human_code,
  'Driver progress does not match its service assignment driver.',
  assignment.driver_id::text,
  progress.driver_id::text
from public.service_driver_progress progress
join public.service_assignments assignment on assignment.id = progress.assignment_id
join public.services service on service.id = progress.service_id
where public.rls_is_admin()
  and (assignment.service_id is distinct from progress.service_id or assignment.driver_id is distinct from progress.driver_id);

comment on view public.v_integrity_services is
  'Administrative semantic checks for service finalization, assignment and driver progress coherence.';

create or replace view public.v_integrity_service_financials
with (security_invoker = true)
as
with component_totals as (
  select
    component.service_financial_id,
    coalesce(round(sum(component.line_amount) filter (
      where component.is_active
        and component.component_type not in ('discount', 'night_surcharge', 'holiday_surcharge', 'airport_fee', 'toll', 'parking')
    ), 2), 0) as subtotal_amount,
    coalesce(round(sum(component.line_amount) filter (
      where component.is_active and component.component_type = 'discount'
    ), 2), 0) as discount_amount,
    coalesce(round(sum(component.line_amount) filter (
      where component.is_active
        and component.component_type in ('night_surcharge', 'holiday_surcharge', 'airport_fee', 'toll', 'parking')
    ), 2), 0) as surcharge_amount
  from public.service_price_components component
  group by component.service_financial_id
),
payment_totals as (
  select
    payment.service_financial_id,
    coalesce(round(sum(payment.amount), 2), 0) as paid_amount
  from public.service_payments payment
  where payment.payment_status = 'completed'
  group by payment.service_financial_id
),
expected as (
  select
    financial.*,
    coalesce(component.subtotal_amount, 0) as expected_subtotal_amount,
    coalesce(component.discount_amount, 0) as expected_discount_amount,
    coalesce(component.surcharge_amount, 0) as expected_surcharge_amount,
    round(coalesce(component.subtotal_amount, 0) + coalesce(component.surcharge_amount, 0) - coalesce(component.discount_amount, 0), 2) as expected_taxable_base_amount,
    round(round(coalesce(component.subtotal_amount, 0) + coalesce(component.surcharge_amount, 0) - coalesce(component.discount_amount, 0), 2) * financial.tax_rate / 100, 2) as expected_tax_amount,
    round(
      round(coalesce(component.subtotal_amount, 0) + coalesce(component.surcharge_amount, 0) - coalesce(component.discount_amount, 0), 2)
      + round(round(coalesce(component.subtotal_amount, 0) + coalesce(component.surcharge_amount, 0) - coalesce(component.discount_amount, 0), 2) * financial.tax_rate / 100, 2),
      2
    ) as expected_total_amount,
    coalesce(payment.paid_amount, 0) as expected_paid_amount
  from public.service_financials financial
  left join component_totals component on component.service_financial_id = financial.id
  left join payment_totals payment on payment.service_financial_id = financial.id
)
select
  'service_financials'::text as domain,
  'service_financial_amounts_out_of_sync'::text as issue_type,
  'critical'::text as severity,
  'service_financials'::text as entity_table,
  expected.id as entity_id,
  service.human_code,
  'Service financial materialized amounts do not match components/payments.'::text as issue_detail,
  concat_ws(
    ' / ',
    'subtotal=' || expected.expected_subtotal_amount,
    'discount=' || expected.expected_discount_amount,
    'surcharge=' || expected.expected_surcharge_amount,
    'taxable=' || expected.expected_taxable_base_amount,
    'tax=' || expected.expected_tax_amount,
    'total=' || expected.expected_total_amount,
    'paid=' || expected.expected_paid_amount,
    'pending=' || round(expected.expected_total_amount - expected.expected_paid_amount, 2)
  ) as expected_value,
  concat_ws(
    ' / ',
    'subtotal=' || expected.subtotal_amount,
    'discount=' || expected.discount_amount,
    'surcharge=' || expected.surcharge_amount,
    'taxable=' || expected.taxable_base_amount,
    'tax=' || expected.tax_amount,
    'total=' || expected.total_amount,
    'paid=' || expected.paid_amount,
    'pending=' || expected.pending_amount
  ) as actual_value
from expected
join public.services service on service.id = expected.service_id
where public.rls_is_admin()
  and (
    expected.subtotal_amount <> expected.expected_subtotal_amount
    or expected.discount_amount <> expected.expected_discount_amount
    or expected.surcharge_amount <> expected.expected_surcharge_amount
    or expected.taxable_base_amount <> expected.expected_taxable_base_amount
    or expected.tax_amount <> expected.expected_tax_amount
    or expected.total_amount <> expected.expected_total_amount
    or expected.paid_amount <> expected.expected_paid_amount
    or expected.pending_amount <> round(expected.expected_total_amount - expected.expected_paid_amount, 2)
  )
union all
select
  'service_financials',
  'service_financial_status_out_of_sync',
  'critical',
  'service_financials',
  expected.id,
  service.human_code,
  'service_financials.financial_status does not match current total/paid/pending.',
  case
    when expected.pricing_status = 'cancelled' then 'cancelled'
    when expected.expected_total_amount > 0 and round(expected.expected_total_amount - expected.expected_paid_amount, 2) = 0 then 'paid'
    when expected.expected_paid_amount > 0 and round(expected.expected_total_amount - expected.expected_paid_amount, 2) > 0 then 'partial'
    else 'pending'
  end,
  expected.financial_status
from expected
join public.services service on service.id = expected.service_id
where public.rls_is_admin()
  and expected.financial_status is distinct from (
    case
      when expected.pricing_status = 'cancelled' then 'cancelled'
      when expected.expected_total_amount > 0 and round(expected.expected_total_amount - expected.expected_paid_amount, 2) = 0 then 'paid'
      when expected.expected_paid_amount > 0 and round(expected.expected_total_amount - expected.expected_paid_amount, 2) > 0 then 'partial'
      else 'pending'
    end
  )
union all
select
  'service_financials',
  'completed_service_without_finalized_financial',
  'warning',
  'services',
  service.id,
  service.human_code,
  'Completed/no-show/not-performed service has no finalized financial row.',
  'finalized service_financials row',
  coalesce(financial.pricing_status, 'missing')
from public.services service
left join public.service_financials financial on financial.service_id = service.id
where public.rls_is_admin()
  and service.operational_status in ('completed', 'no_show', 'not_performed')
  and (financial.id is null or financial.pricing_status <> 'finalized');

comment on view public.v_integrity_service_financials is
  'Administrative checks for service financial calculated amounts, status and finalized service coverage.';

create or replace view public.v_integrity_service_payments
with (security_invoker = true)
as
select
  'service_payments'::text as domain,
  'completed_payment_allocation_total_mismatch'::text as issue_type,
  'critical'::text as severity,
  'service_payments'::text as entity_table,
  payment.id as entity_id,
  payment.human_code,
  'Completed service payment amount does not equal its allocation sum.'::text as issue_detail,
  payment.amount::text as expected_value,
  coalesce(round(sum(allocation.allocated_amount), 2), 0)::text as actual_value
from public.service_payments payment
left join public.service_payment_allocations allocation on allocation.payment_id = payment.id
where public.rls_is_admin()
  and payment.payment_status = 'completed'
group by payment.id
having payment.amount <> coalesce(round(sum(allocation.allocated_amount), 2), 0)
union all
select
  'service_payments',
  'payment_allocation_financial_mismatch',
  'critical',
  'service_payment_allocations',
  allocation.id,
  payment.human_code,
  'Service payment allocation points to a different financial row than the payment.',
  payment.service_financial_id::text,
  allocation.service_financial_id::text
from public.service_payment_allocations allocation
join public.service_payments payment on payment.id = allocation.payment_id
where public.rls_is_admin()
  and allocation.service_financial_id is distinct from payment.service_financial_id
union all
select
  'service_payments',
  'service_payment_currency_mismatch',
  'critical',
  'service_payments',
  payment.id,
  payment.human_code,
  'Service payment currency differs from its service financial currency.',
  financial.currency_code,
  payment.currency_code
from public.service_payments payment
join public.service_financials financial on financial.id = payment.service_financial_id
where public.rls_is_admin()
  and payment.currency_code is distinct from financial.currency_code;

comment on view public.v_integrity_service_payments is
  'Administrative checks for service payment allocations and currency coherence.';

create or replace view public.v_integrity_cash_movements
with (security_invoker = true)
as
select
  'cash'::text as domain,
  'cash_reversal_invalid'::text as issue_type,
  'critical'::text as severity,
  'cash_movements'::text as entity_table,
  reversal.id as entity_id,
  reversal.human_code,
  'Cash reversal does not match the original movement or reverses another reversal.'::text as issue_detail,
  'same account, amount and currency; opposite type; original not reversal'::text as expected_value,
  concat_ws(
    ' / ',
    'account=' || reversal.cash_account_id,
    'amount=' || reversal.amount,
    'currency=' || reversal.currency_code,
    'type=' || reversal.movement_type,
    'original_category=' || coalesce(original.movement_category, 'missing')
  ) as actual_value
from public.cash_movements reversal
left join public.cash_movements original on original.id = reversal.original_movement_id
where public.rls_is_admin()
  and reversal.movement_category = 'reversal'
  and (
    original.id is null
    or original.movement_category = 'reversal'
    or reversal.cash_account_id is distinct from original.cash_account_id
    or reversal.amount is distinct from original.amount
    or reversal.currency_code is distinct from original.currency_code
    or reversal.movement_type is not distinct from original.movement_type
  )
union all
select
  'cash',
  'opening_balance_movement_present',
  'warning',
  'cash_movements',
  movement.id,
  movement.human_code,
  'opening_balance category movement exists although opening_balance is already included from cash_accounts.',
  'no normal opening_balance movement',
  movement.amount::text
from public.cash_movements movement
where public.rls_is_admin()
  and movement.movement_category = 'opening_balance'
union all
select
  'cash',
  'service_payment_cash_movement_mismatch',
  'critical',
  'cash_movements',
  movement.id,
  movement.human_code,
  'Cash service_payment movement does not match the referenced service payment.',
  concat_ws(' / ', payment.service_id::text, payment.amount::text, payment.currency_code),
  concat_ws(' / ', movement.service_id::text, movement.amount::text, movement.currency_code)
from public.cash_movements movement
join public.service_payments payment on payment.id = movement.service_payment_id
where public.rls_is_admin()
  and movement.movement_category = 'service_payment'
  and (
    movement.service_id is distinct from payment.service_id
    or movement.amount is distinct from payment.amount
    or movement.currency_code is distinct from payment.currency_code
  );

comment on view public.v_integrity_cash_movements is
  'Administrative checks for cash reversals, opening-balance duplication and service payment movement references.';

create or replace view public.v_integrity_receivables
with (security_invoker = true)
as
with allocation_totals as (
  select
    allocation.receivable_id,
    coalesce(round(sum(allocation.allocated_amount), 2), 0) as collected_amount
  from public.receivable_allocations allocation
  join public.service_payments payment on payment.id = allocation.payment_id
  where payment.payment_status = 'completed'
  group by allocation.receivable_id
),
expected as (
  select
    receivable.*,
    coalesce(total.collected_amount, 0) as expected_collected_amount,
    round(receivable.original_amount - coalesce(total.collected_amount, 0), 2) as expected_pending_amount
  from public.receivables receivable
  left join allocation_totals total on total.receivable_id = receivable.id
)
select
  'receivables'::text as domain,
  'receivable_amounts_out_of_sync'::text as issue_type,
  'critical'::text as severity,
  'receivables'::text as entity_table,
  expected.id as entity_id,
  expected.human_code,
  'Receivable materialized amounts do not match completed receivable allocations.'::text as issue_detail,
  concat_ws(' / ', 'collected=' || expected.expected_collected_amount, 'pending=' || expected.expected_pending_amount) as expected_value,
  concat_ws(' / ', 'collected=' || expected.collected_amount, 'pending=' || expected.pending_amount) as actual_value
from expected
where public.rls_is_admin()
  and expected.status in ('open', 'overdue', 'partial', 'paid')
  and (
    expected.collected_amount <> expected.expected_collected_amount
    or expected.pending_amount <> expected.expected_pending_amount
  )
union all
select
  'receivables',
  'receivable_status_out_of_sync',
  'critical',
  'receivables',
  expected.id,
  expected.human_code,
  'Receivable status does not match calculated collected/pending amounts.',
  case
    when expected.expected_pending_amount = 0 and expected.original_amount > 0 then 'paid'
    when expected.expected_collected_amount > 0 and expected.expected_pending_amount > 0 then 'partial'
    when expected.due_at is not null and expected.due_at < now() then 'overdue'
    else 'open'
  end,
  expected.status
from expected
where public.rls_is_admin()
  and expected.status in ('open', 'overdue', 'partial', 'paid')
  and expected.status is distinct from (
    case
      when expected.expected_pending_amount = 0 and expected.original_amount > 0 then 'paid'
      when expected.expected_collected_amount > 0 and expected.expected_pending_amount > 0 then 'partial'
      when expected.due_at is not null and expected.due_at < now() then 'overdue'
      else 'open'
    end
  )
union all
select
  'receivables',
  'receivable_source_mismatch',
  'critical',
  'receivables',
  receivable.id,
  receivable.human_code,
  'Receivable service/customer/financial references are inconsistent.',
  concat_ws(' / ', service.customer_id::text, financial.service_id::text, financial.currency_code),
  concat_ws(' / ', receivable.customer_id::text, receivable.service_id::text, receivable.currency_code)
from public.receivables receivable
join public.services service on service.id = receivable.service_id
join public.service_financials financial on financial.id = receivable.service_financial_id
where public.rls_is_admin()
  and (
    service.customer_id is distinct from receivable.customer_id
    or financial.service_id is distinct from receivable.service_id
    or financial.currency_code is distinct from receivable.currency_code
  );

comment on view public.v_integrity_receivables is
  'Administrative checks for accounts receivable amount/status recalculation and source coherence.';

create or replace view public.v_integrity_expenses
with (security_invoker = true)
as
with payment_totals as (
  select expense_id, coalesce(round(sum(amount), 2), 0) as paid_amount
  from public.expense_payments
  where payment_status = 'completed'
  group by expense_id
),
reimbursement_totals as (
  select expense_id, coalesce(round(sum(amount), 2), 0) as reimbursed_amount
  from public.expense_reimbursements
  where status = 'completed'
  group by expense_id
),
allocation_totals as (
  select expense_id, coalesce(round(sum(allocated_amount), 2), 0) as allocated_amount
  from public.expense_allocations
  group by expense_id
)
select
  'expenses'::text as domain,
  'expense_payment_amounts_out_of_sync'::text as issue_type,
  'critical'::text as severity,
  'expenses'::text as entity_table,
  expense.id as entity_id,
  expense.human_code,
  'Expense paid/pending amounts do not match completed expense payments.'::text as issue_detail,
  concat_ws(' / ', 'paid=' || coalesce(payment.paid_amount, 0), 'pending=' || round(expense.total_amount - coalesce(payment.paid_amount, 0), 2)) as expected_value,
  concat_ws(' / ', 'paid=' || expense.paid_amount, 'pending=' || expense.pending_amount) as actual_value
from public.expenses expense
left join payment_totals payment on payment.expense_id = expense.id
where public.rls_is_admin()
  and (
    expense.paid_amount <> coalesce(payment.paid_amount, 0)
    or expense.pending_amount <> round(expense.total_amount - coalesce(payment.paid_amount, 0), 2)
  )
union all
select
  'expenses',
  'expense_payment_status_out_of_sync',
  'critical',
  'expenses',
  expense.id,
  expense.human_code,
  'Expense payment_status does not match completed expense payments.',
  case
    when expense.status = 'cancelled' then 'cancelled'
    when coalesce(payment.paid_amount, 0) = 0 then 'unpaid'
    when coalesce(payment.paid_amount, 0) = expense.total_amount then 'paid'
    else 'partial'
  end,
  expense.payment_status
from public.expenses expense
left join payment_totals payment on payment.expense_id = expense.id
where public.rls_is_admin()
  and expense.payment_status is distinct from (
    case
      when expense.status = 'cancelled' then 'cancelled'
      when coalesce(payment.paid_amount, 0) = 0 then 'unpaid'
      when coalesce(payment.paid_amount, 0) = expense.total_amount then 'paid'
      else 'partial'
    end
  )
union all
select
  'expenses',
  'expense_reimbursement_status_out_of_sync',
  'critical',
  'expenses',
  expense.id,
  expense.human_code,
  'Expense reimbursement_status does not match completed reimbursements and reimbursable flag.',
  case
    when expense.status = 'cancelled' then 'cancelled'
    when expense.reimbursable = false then 'not_applicable'
    when coalesce(reimbursement.reimbursed_amount, 0) = expense.total_amount then 'reimbursed'
    else 'pending'
  end,
  expense.reimbursement_status
from public.expenses expense
left join reimbursement_totals reimbursement on reimbursement.expense_id = expense.id
where public.rls_is_admin()
  and expense.reimbursement_status is distinct from (
    case
      when expense.status = 'cancelled' then 'cancelled'
      when expense.reimbursable = false then 'not_applicable'
      when coalesce(reimbursement.reimbursed_amount, 0) = expense.total_amount then 'reimbursed'
      else 'pending'
    end
  )
union all
select
  'expenses',
  'expense_allocations_exceed_total',
  'warning',
  'expenses',
  expense.id,
  expense.human_code,
  'Expense allocations exceed total_amount.',
  ('<= ' || expense.total_amount)::text,
  coalesce(allocation.allocated_amount, 0)::text
from public.expenses expense
join allocation_totals allocation on allocation.expense_id = expense.id
where public.rls_is_admin()
  and allocation.allocated_amount > expense.total_amount;

comment on view public.v_integrity_expenses is
  'Administrative checks for expense payment/reimbursement derived fields and allocation totals.';

create or replace view public.v_integrity_settlements
with (security_invoker = true)
as
with item_totals as (
  select
    item.settlement_id,
    round(coalesce(sum(case when item.item_type in ('service_income', 'other') then item.gross_amount else 0 end), 0), 2) as gross_eligible_amount,
    round(coalesce(sum(case when item.item_type in ('expense_deduction', 'other') then item.deduction_amount else 0 end), 0), 2) as expense_deduction_amount,
    round(coalesce(sum(case when item.item_type in ('positive_adjustment', 'negative_adjustment', 'other') then item.adjustment_amount else 0 end), 0), 2) as adjustment_amount,
    count(*)::integer as item_count
  from public.settlement_items item
  group by item.settlement_id
),
payment_totals as (
  select settlement_id, round(coalesce(sum(amount), 0), 2) as paid_amount
  from public.settlement_payments
  where payment_status = 'completed'
  group by settlement_id
),
expected as (
  select
    settlement.*,
    coalesce(item.gross_eligible_amount, 0) as expected_gross_eligible_amount,
    coalesce(item.expense_deduction_amount, 0) as expected_expense_deduction_amount,
    coalesce(item.adjustment_amount, 0) as expected_adjustment_amount,
    coalesce(item.item_count, 0) as item_count,
    greatest(
      round(coalesce(item.gross_eligible_amount, 0) - coalesce(item.expense_deduction_amount, 0) + coalesce(item.adjustment_amount, 0), 2),
      0
    ) as expected_calculation_base_amount,
    coalesce(payment.paid_amount, 0) as expected_paid_amount
  from public.settlements settlement
  left join item_totals item on item.settlement_id = settlement.id
  left join payment_totals payment on payment.settlement_id = settlement.id
)
select
  'settlements'::text as domain,
  'settlement_totals_out_of_sync'::text as issue_type,
  'critical'::text as severity,
  'settlements'::text as entity_table,
  expected.id as entity_id,
  expected.human_code,
  'Settlement materialized totals do not match settlement_items and completed payments.'::text as issue_detail,
  concat_ws(
    ' / ',
    'gross=' || expected.expected_gross_eligible_amount,
    'deduction=' || expected.expected_expense_deduction_amount,
    'adjustment=' || expected.expected_adjustment_amount,
    'base=' || expected.expected_calculation_base_amount,
    'paid=' || expected.expected_paid_amount
  ) as expected_value,
  concat_ws(
    ' / ',
    'gross=' || expected.gross_eligible_amount,
    'deduction=' || expected.expense_deduction_amount,
    'adjustment=' || expected.adjustment_amount,
    'base=' || expected.calculation_base_amount,
    'paid=' || expected.paid_amount
  ) as actual_value
from expected
where public.rls_is_admin()
  and (
    expected.gross_eligible_amount <> expected.expected_gross_eligible_amount
    or expected.expense_deduction_amount <> expected.expected_expense_deduction_amount
    or expected.adjustment_amount <> expected.expected_adjustment_amount
    or expected.calculation_base_amount <> expected.expected_calculation_base_amount
    or expected.paid_amount <> expected.expected_paid_amount
    or expected.pending_amount <> round(expected.driver_amount - expected.expected_paid_amount, 2)
  )
union all
select
  'settlements',
  'settlement_driver_elara_amounts_out_of_sync',
  'critical',
  'settlements',
  expected.id,
  expected.human_code,
  'Settlement driver/elara calculated amounts do not match the configured calculation method and percentages.',
  concat_ws(
    ' / ',
    'driver=' || case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
      else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
    end,
    'elara=' || case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2), 2)
      else round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2)
    end
  ),
  concat_ws(' / ', 'driver=' || expected.driver_amount, 'elara=' || expected.elara_amount)
from expected
where public.rls_is_admin()
  and (
    expected.driver_amount <> case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
      else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
    end
    or expected.elara_amount <> case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2), 2)
      else round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2)
    end
  )
union all
select
  'settlements',
  'settlement_payment_status_out_of_sync',
  'critical',
  'settlements',
  expected.id,
  expected.human_code,
  'Settlement payment_status does not match completed settlement payments and expected driver amount.',
  case
    when expected.status = 'cancelled' then 'cancelled'
    when round((case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
      else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
    end) - expected.expected_paid_amount, 2) = 0 then 'paid'
    when expected.expected_paid_amount = 0 and (case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
      else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
    end) > 0 then 'unpaid'
    when expected.expected_paid_amount > 0 and round((case
      when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
      else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
    end) - expected.expected_paid_amount, 2) > 0 then 'partial'
    else 'unpaid'
  end,
  expected.payment_status
from expected
where public.rls_is_admin()
  and expected.payment_status is distinct from (
    case
      when expected.status = 'cancelled' then 'cancelled'
      when round((case
        when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
        else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
      end) - expected.expected_paid_amount, 2) = 0 then 'paid'
      when expected.expected_paid_amount = 0 and (case
        when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
        else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
      end) > 0 then 'unpaid'
      when expected.expected_paid_amount > 0 and round((case
        when expected.calculation_method_snapshot = 'driver_share' then round(expected.expected_calculation_base_amount * expected.driver_percentage / 100, 2)
        else round(expected.expected_calculation_base_amount - round(expected.expected_calculation_base_amount * expected.elara_percentage / 100, 2), 2)
      end) - expected.expected_paid_amount, 2) > 0 then 'partial'
      else 'unpaid'
    end
  )
union all
select
  'settlements',
  'non_draft_settlement_without_items',
  'warning',
  'settlements',
  expected.id,
  expected.human_code,
  'Settlement has left draft workflow without any item.',
  'at least one settlement_item',
  '0'
from expected
where public.rls_is_admin()
  and expected.status in ('generated', 'submitted', 'approved')
  and expected.item_count = 0
union all
select
  'settlements',
  'service_in_multiple_active_settlements',
  'critical',
  'services',
  duplicate.service_id,
  null::text,
  'Service is included in more than one active settlement.',
  'one active settlement',
  duplicate.settlement_codes
from (
  select
    item.service_id,
    string_agg(settlement.human_code, ', ' order by settlement.human_code) as settlement_codes,
    count(distinct settlement.id) as settlement_count
  from public.settlement_items item
  join public.settlements settlement on settlement.id = item.settlement_id
  where item.item_type = 'service_income'
    and settlement.status in ('draft', 'generated', 'submitted', 'approved')
  group by item.service_id
  having count(distinct settlement.id) > 1
) duplicate
where public.rls_is_admin()
union all
select
  'settlements',
  'expense_in_multiple_active_settlements',
  'critical',
  'expenses',
  duplicate.expense_id,
  null::text,
  'Expense is included in more than one active settlement.',
  'one active settlement',
  duplicate.settlement_codes
from (
  select
    item.expense_id,
    string_agg(settlement.human_code, ', ' order by settlement.human_code) as settlement_codes,
    count(distinct settlement.id) as settlement_count
  from public.settlement_items item
  join public.settlements settlement on settlement.id = item.settlement_id
  where item.item_type = 'expense_deduction'
    and settlement.status in ('draft', 'generated', 'submitted', 'approved')
  group by item.expense_id
  having count(distinct settlement.id) > 1
) duplicate
where public.rls_is_admin();

comment on view public.v_integrity_settlements is
  'Administrative checks for settlement totals, required items and double inclusion in active settlements.';

create or replace view public.v_integrity_incidents
with (security_invoker = true)
as
select
  'incidents'::text as domain,
  'incident_relation_not_allowed_by_category'::text as issue_type,
  'warning'::text as severity,
  'incidents'::text as entity_table,
  incident.id as entity_id,
  incident.human_code,
  'Incident has a related entity type not allowed by its category applies_to list.'::text as issue_detail,
  array_to_string(category.applies_to, ',') as expected_value,
  concat_ws(
    ',',
    case when incident.service_id is not null then 'service' end,
    case when incident.driver_id is not null then 'driver' end,
    case when incident.vehicle_id is not null then 'vehicle' end,
    case when incident.customer_id is not null then 'customer' end,
    case when incident.app_user_id is not null then 'user' end,
    case when incident.service_payment_id is not null then 'payment' end,
    case when incident.cash_movement_id is not null then 'cash' end,
    case when incident.receivable_id is not null then 'receivable' end,
    case when incident.expense_id is not null then 'expense' end,
    case when incident.settlement_id is not null then 'settlement' end
  ) as actual_value
from public.incidents incident
join public.incident_categories category on category.id = incident.category_id
where public.rls_is_admin()
  and (
    (incident.service_id is not null and not ('service' = any(category.applies_to)))
    or (incident.driver_id is not null and not ('driver' = any(category.applies_to)))
    or (incident.vehicle_id is not null and not ('vehicle' = any(category.applies_to)))
    or (incident.customer_id is not null and not ('customer' = any(category.applies_to)))
    or (incident.app_user_id is not null and not ('user' = any(category.applies_to)))
    or (incident.service_payment_id is not null and not ('payment' = any(category.applies_to)))
    or (incident.cash_movement_id is not null and not ('cash' = any(category.applies_to)))
    or (incident.receivable_id is not null and not ('receivable' = any(category.applies_to)))
    or (incident.expense_id is not null and not ('expense' = any(category.applies_to)))
    or (incident.settlement_id is not null and not ('settlement' = any(category.applies_to)))
  )
union all
select
  'incidents',
  'incident_without_required_relation',
  'warning',
  'incidents',
  incident.id,
  incident.human_code,
  'Incident category expects an entity relation but the incident has none.',
  array_to_string(category.applies_to, ','),
  'none'
from public.incidents incident
join public.incident_categories category on category.id = incident.category_id
where public.rls_is_admin()
  and not ('system' = any(category.applies_to))
  and not ('other' = any(category.applies_to))
  and incident.service_id is null
  and incident.driver_id is null
  and incident.vehicle_id is null
  and incident.customer_id is null
  and incident.app_user_id is null
  and incident.service_payment_id is null
  and incident.cash_movement_id is null
  and incident.receivable_id is null
  and incident.expense_id is null
  and incident.settlement_id is null
union all
select
  'incidents',
  'incident_final_fields_missing',
  'critical',
  'incidents',
  incident.id,
  incident.human_code,
  'Resolved or cancelled incident has incomplete final actor/date fields.',
  'resolved_at/resolved_by or cancelled_at/cancelled_by',
  incident.status
from public.incidents incident
where public.rls_is_admin()
  and (
    (incident.status = 'resolved' and (incident.resolved_at is null or incident.resolved_by is null))
    or (incident.status = 'cancelled' and (incident.cancelled_at is null or incident.cancelled_by is null))
  );

comment on view public.v_integrity_incidents is
  'Administrative checks for incident category relation semantics and final status fields.';

create or replace view public.v_integrity_summary
with (security_invoker = true)
as
with admin_context as (
  select 1
  where public.rls_is_admin()
)
select 'identity'::text as domain, 'v_integrity_identity_sessions'::text as check_name, 'critical'::text as max_severity, issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_identity_sessions) issue
union all
select 'storage', 'v_integrity_document_storage', 'warning', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_document_storage) issue
union all
select 'vehicles', 'v_integrity_vehicle_assignments', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_vehicle_assignments) issue
union all
select 'services', 'v_integrity_services', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_services) issue
union all
select 'service_financials', 'v_integrity_service_financials', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_service_financials) issue
union all
select 'service_payments', 'v_integrity_service_payments', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_service_payments) issue
union all
select 'cash', 'v_integrity_cash_movements', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_cash_movements) issue
union all
select 'receivables', 'v_integrity_receivables', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_receivables) issue
union all
select 'expenses', 'v_integrity_expenses', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_expenses) issue
union all
select 'settlements', 'v_integrity_settlements', 'critical', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_settlements) issue
union all
select 'incidents', 'v_integrity_incidents', 'warning', issue.issue_count
from admin_context
cross join lateral (select count(*)::bigint as issue_count from public.v_integrity_incidents) issue;

comment on view public.v_integrity_summary is
  'Administrative summary of integrity view issue counts. Each underlying integrity view returns only problem rows.';

revoke all on table public.v_driver_service_overview from public, anon, authenticated;
revoke all on table public.v_driver_settlement_summary from public, anon, authenticated;
revoke all on table public.v_admin_service_overview from public, anon, authenticated;
revoke all on table public.v_admin_receivable_overview from public, anon, authenticated;
revoke all on table public.v_admin_settlement_overview from public, anon, authenticated;
revoke all on table public.v_admin_cash_account_overview from public, anon, authenticated;
revoke all on table public.v_integrity_identity_sessions from public, anon, authenticated;
revoke all on table public.v_integrity_document_storage from public, anon, authenticated;
revoke all on table public.v_integrity_vehicle_assignments from public, anon, authenticated;
revoke all on table public.v_integrity_services from public, anon, authenticated;
revoke all on table public.v_integrity_service_financials from public, anon, authenticated;
revoke all on table public.v_integrity_service_payments from public, anon, authenticated;
revoke all on table public.v_integrity_cash_movements from public, anon, authenticated;
revoke all on table public.v_integrity_receivables from public, anon, authenticated;
revoke all on table public.v_integrity_expenses from public, anon, authenticated;
revoke all on table public.v_integrity_settlements from public, anon, authenticated;
revoke all on table public.v_integrity_incidents from public, anon, authenticated;
revoke all on table public.v_integrity_summary from public, anon, authenticated;

grant select on table public.v_driver_service_overview to authenticated, service_role;
grant select on table public.v_driver_settlement_summary to authenticated, service_role;
grant select on table public.v_admin_service_overview to authenticated, service_role;
grant select on table public.v_admin_receivable_overview to authenticated, service_role;
grant select on table public.v_admin_settlement_overview to authenticated, service_role;
grant select on table public.v_admin_cash_account_overview to authenticated, service_role;
grant select on table public.v_integrity_identity_sessions to authenticated, service_role;
grant select on table public.v_integrity_document_storage to authenticated, service_role;
grant select on table public.v_integrity_vehicle_assignments to authenticated, service_role;
grant select on table public.v_integrity_services to authenticated, service_role;
grant select on table public.v_integrity_service_financials to authenticated, service_role;
grant select on table public.v_integrity_service_payments to authenticated, service_role;
grant select on table public.v_integrity_cash_movements to authenticated, service_role;
grant select on table public.v_integrity_receivables to authenticated, service_role;
grant select on table public.v_integrity_expenses to authenticated, service_role;
grant select on table public.v_integrity_settlements to authenticated, service_role;
grant select on table public.v_integrity_incidents to authenticated, service_role;
grant select on table public.v_integrity_summary to authenticated, service_role;

do $$
declare
  v_missing text[];
  v_not_invoker text[];
  v_anon_select text[];
  v_write_grant text[];
begin
  with expected(view_name) as (
    values
      ('v_driver_service_overview'),
      ('v_driver_settlement_summary'),
      ('v_admin_service_overview'),
      ('v_admin_receivable_overview'),
      ('v_admin_settlement_overview'),
      ('v_admin_cash_account_overview'),
      ('v_integrity_identity_sessions'),
      ('v_integrity_document_storage'),
      ('v_integrity_vehicle_assignments'),
      ('v_integrity_services'),
      ('v_integrity_service_financials'),
      ('v_integrity_service_payments'),
      ('v_integrity_cash_movements'),
      ('v_integrity_receivables'),
      ('v_integrity_expenses'),
      ('v_integrity_settlements'),
      ('v_integrity_incidents'),
      ('v_integrity_summary')
  )
  select array_agg(expected.view_name order by expected.view_name)
  into v_missing
  from expected
  left join pg_class class
    on class.relname = expected.view_name
  left join pg_namespace namespace
    on namespace.oid = class.relnamespace
    and namespace.nspname = 'public'
  where class.oid is null or class.relkind <> 'v';

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception '0016 expected views missing: %', array_to_string(v_missing, ', ');
  end if;

  with expected(view_name) as (
    values
      ('v_driver_service_overview'),
      ('v_driver_settlement_summary'),
      ('v_admin_service_overview'),
      ('v_admin_receivable_overview'),
      ('v_admin_settlement_overview'),
      ('v_admin_cash_account_overview'),
      ('v_integrity_identity_sessions'),
      ('v_integrity_document_storage'),
      ('v_integrity_vehicle_assignments'),
      ('v_integrity_services'),
      ('v_integrity_service_financials'),
      ('v_integrity_service_payments'),
      ('v_integrity_cash_movements'),
      ('v_integrity_receivables'),
      ('v_integrity_expenses'),
      ('v_integrity_settlements'),
      ('v_integrity_incidents'),
      ('v_integrity_summary')
  )
  select array_agg(expected.view_name order by expected.view_name)
  into v_not_invoker
  from expected
  join pg_class class on class.relname = expected.view_name
  join pg_namespace namespace on namespace.oid = class.relnamespace and namespace.nspname = 'public'
  where not (coalesce(class.reloptions, array[]::text[]) @> array['security_invoker=true']);

  if coalesce(array_length(v_not_invoker, 1), 0) > 0 then
    raise exception '0016 views without security_invoker=true: %', array_to_string(v_not_invoker, ', ');
  end if;

  with expected(view_name) as (
    values
      ('v_driver_service_overview'),
      ('v_driver_settlement_summary'),
      ('v_admin_service_overview'),
      ('v_admin_receivable_overview'),
      ('v_admin_settlement_overview'),
      ('v_admin_cash_account_overview'),
      ('v_integrity_identity_sessions'),
      ('v_integrity_document_storage'),
      ('v_integrity_vehicle_assignments'),
      ('v_integrity_services'),
      ('v_integrity_service_financials'),
      ('v_integrity_service_payments'),
      ('v_integrity_cash_movements'),
      ('v_integrity_receivables'),
      ('v_integrity_expenses'),
      ('v_integrity_settlements'),
      ('v_integrity_incidents'),
      ('v_integrity_summary')
  )
  select array_agg(expected.view_name order by expected.view_name)
  into v_anon_select
  from expected
  where has_table_privilege('anon', ('public.' || quote_ident(expected.view_name))::regclass, 'SELECT');

  if coalesce(array_length(v_anon_select, 1), 0) > 0 then
    raise exception '0016 views grant SELECT to anon: %', array_to_string(v_anon_select, ', ');
  end if;

  with expected(view_name) as (
    values
      ('v_driver_service_overview'),
      ('v_driver_settlement_summary'),
      ('v_admin_service_overview'),
      ('v_admin_receivable_overview'),
      ('v_admin_settlement_overview'),
      ('v_admin_cash_account_overview'),
      ('v_integrity_identity_sessions'),
      ('v_integrity_document_storage'),
      ('v_integrity_vehicle_assignments'),
      ('v_integrity_services'),
      ('v_integrity_service_financials'),
      ('v_integrity_service_payments'),
      ('v_integrity_cash_movements'),
      ('v_integrity_receivables'),
      ('v_integrity_expenses'),
      ('v_integrity_settlements'),
      ('v_integrity_incidents'),
      ('v_integrity_summary')
  )
  select array_agg(expected.view_name order by expected.view_name)
  into v_write_grant
  from expected
  where has_table_privilege('authenticated', ('public.' || quote_ident(expected.view_name))::regclass, 'INSERT')
     or has_table_privilege('authenticated', ('public.' || quote_ident(expected.view_name))::regclass, 'UPDATE')
     or has_table_privilege('authenticated', ('public.' || quote_ident(expected.view_name))::regclass, 'DELETE')
     or has_table_privilege('anon', ('public.' || quote_ident(expected.view_name))::regclass, 'INSERT')
     or has_table_privilege('anon', ('public.' || quote_ident(expected.view_name))::regclass, 'UPDATE')
     or has_table_privilege('anon', ('public.' || quote_ident(expected.view_name))::regclass, 'DELETE');

  if coalesce(array_length(v_write_grant, 1), 0) > 0 then
    raise exception '0016 views have unexpected write grants: %', array_to_string(v_write_grant, ', ');
  end if;
end;
$$;
