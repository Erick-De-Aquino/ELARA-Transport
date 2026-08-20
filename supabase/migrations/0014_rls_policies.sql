-- ELARA Transport V4.0
-- Migration 0014: RLS policies.
--
-- Enables row level security and read policies over the public domain tables.
-- Business writes remain routed through SECURITY DEFINER RPCs from 0013.

create or replace function public.rls_current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.app_users u
  join public.app_sessions s on s.app_user_id = u.id and s.auth_user_id = u.auth_user_id
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and s.supabase_session_id = public.current_auth_session_id()
    and s.ended_at is null
    and s.expires_at > now()
    and exists (
      select 1 from public.user_roles ur
      join public.roles r on r.key = ur.role_key
      where ur.user_id = u.id
        and ur.role_key = s.active_context
        and ur.status = 'active'
        and ur.starts_at <= now()
        and (ur.ends_at is null or ur.ends_at > now())
        and r.is_active = true
    )
  limit 1;
$$;

create or replace function public.rls_current_active_context()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.active_context
  from public.app_sessions s
  join public.app_users u on u.id = s.app_user_id and u.auth_user_id = s.auth_user_id
  where u.id = public.rls_current_app_user_id()
    and s.auth_user_id = auth.uid()
    and s.supabase_session_id = public.current_auth_session_id()
    and s.ended_at is null
    and s.expires_at > now()
  limit 1;
$$;

create or replace function public.rls_has_active_context(p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.key = ur.role_key
    where ur.user_id = public.rls_current_app_user_id()
      and ur.role_key = lower(trim(coalesce(p_role_key, '')))
      and ur.role_key = public.rls_current_active_context()
      and ur.status = 'active'
      and ur.starts_at <= now()
      and (ur.ends_at is null or ur.ends_at > now())
      and r.is_active = true
  );
$$;

create or replace function public.rls_is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_has_active_context('superadmin');
$$;

create or replace function public.rls_is_administrativo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_has_active_context('administrativo');
$$;

create or replace function public.rls_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_is_superadmin() or public.rls_is_administrativo();
$$;

create or replace function public.rls_current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.driver_id
  from public.user_driver_links l
  join public.drivers d on d.id = l.driver_id
  where l.user_id = public.rls_current_app_user_id()
    and public.rls_has_active_context('conductor')
    and l.status = 'active'
    and l.started_at <= now()
    and (l.ended_at is null or l.ended_at > now())
    and d.administrative_status = 'active'
  limit 1;
$$;

create or replace function public.rls_driver_can_access_service(p_service_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_current_driver_id() is not null
    and exists (
      select 1
      from public.service_assignments a
      where a.service_id = p_service_id
        and a.driver_id = public.rls_current_driver_id()
        and (
          a.assignment_status in ('pending_acceptance', 'accepted')
          or (
            a.assignment_status = 'ended'
            and a.accepted_at is not null
            and a.ended_at is not null
          )
        )
    );
$$;

create or replace function public.rls_driver_can_access_customer(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_current_driver_id() is not null
    and exists (
      select 1
      from public.services s
      where s.customer_id = p_customer_id
        and public.rls_driver_can_access_service(s.id)
    );
$$;

create or replace function public.rls_driver_can_access_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_current_driver_id() is not null and (
    exists (
      select 1
      from public.driver_vehicle_assignments a
      where a.vehicle_id = p_vehicle_id
        and a.driver_id = public.rls_current_driver_id()
        and a.status = 'active'
        and a.started_at <= now()
        and (a.ended_at is null or a.ended_at > now())
    )
    or exists (
      select 1
      from public.service_assignments a
      where a.vehicle_id = p_vehicle_id
        and a.driver_id = public.rls_current_driver_id()
        and (
          a.assignment_status in ('pending_acceptance', 'accepted')
          or (
            a.assignment_status = 'ended'
            and a.accepted_at is not null
            and a.ended_at is not null
          )
        )
    )
  );
$$;

create or replace function public.rls_driver_can_access_incident(p_incident_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with current_context as (
    select
      public.rls_current_driver_id() as driver_id,
      public.rls_current_app_user_id() as app_user_id
  )
  select exists (
      select 1
      from public.incidents i
      cross join current_context ctx
      where i.id = p_incident_id
        and ctx.driver_id is not null
        and (i.driver_id is null or i.driver_id = ctx.driver_id)
        and (i.reported_by_driver_id is null or i.reported_by_driver_id = ctx.driver_id)
        and not exists (
          select 1
          from public.user_driver_links linked_user
          where linked_user.user_id = i.app_user_id
            and linked_user.status = 'active'
            and linked_user.started_at <= now()
            and (linked_user.ended_at is null or linked_user.ended_at > now())
            and linked_user.driver_id <> ctx.driver_id
        )
        and not exists (
          select 1
          from public.user_driver_links linked_reporter
          where linked_reporter.user_id = i.reported_by_user_id
            and linked_reporter.status = 'active'
            and linked_reporter.started_at <= now()
            and (linked_reporter.ended_at is null or linked_reporter.ended_at > now())
            and linked_reporter.driver_id <> ctx.driver_id
        )
        and (
          i.driver_id = ctx.driver_id
          or i.reported_by_driver_id = ctx.driver_id
          or i.app_user_id = ctx.app_user_id
          or i.reported_by_user_id = ctx.app_user_id
          or (i.service_id is not null and public.rls_driver_can_access_service(i.service_id))
          or (i.vehicle_id is not null and public.rls_driver_can_access_vehicle(i.vehicle_id))
        )
    );
$$;

create or replace function public.rls_driver_can_access_remittance(p_remittance_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_current_driver_id() is not null
    and exists (select 1 from public.cash_remittances r where r.id = p_remittance_id and r.driver_id = public.rls_current_driver_id());
$$;

create or replace function public.rls_driver_can_access_settlement(p_settlement_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rls_current_driver_id() is not null
    and exists (select 1 from public.settlements s where s.id = p_settlement_id and s.driver_id = public.rls_current_driver_id());
$$;

revoke all on function public.rls_current_app_user_id() from public, anon;
revoke all on function public.rls_current_active_context() from public, anon;
revoke all on function public.rls_has_active_context(text) from public, anon;
revoke all on function public.rls_is_superadmin() from public, anon;
revoke all on function public.rls_is_administrativo() from public, anon;
revoke all on function public.rls_is_admin() from public, anon;
revoke all on function public.rls_current_driver_id() from public, anon;
revoke all on function public.rls_driver_can_access_service(uuid) from public, anon;
revoke all on function public.rls_driver_can_access_customer(uuid) from public, anon;
revoke all on function public.rls_driver_can_access_vehicle(uuid) from public, anon;
revoke all on function public.rls_driver_can_access_incident(uuid) from public, anon;
revoke all on function public.rls_driver_can_access_remittance(uuid) from public, anon;
revoke all on function public.rls_driver_can_access_settlement(uuid) from public, anon;

grant execute on function public.rls_current_app_user_id() to authenticated, service_role;
grant execute on function public.rls_current_active_context() to authenticated, service_role;
grant execute on function public.rls_has_active_context(text) to authenticated, service_role;
grant execute on function public.rls_is_superadmin() to authenticated, service_role;
grant execute on function public.rls_is_administrativo() to authenticated, service_role;
grant execute on function public.rls_is_admin() to authenticated, service_role;
grant execute on function public.rls_current_driver_id() to authenticated, service_role;
grant execute on function public.rls_driver_can_access_service(uuid) to authenticated, service_role;
grant execute on function public.rls_driver_can_access_customer(uuid) to authenticated, service_role;
grant execute on function public.rls_driver_can_access_vehicle(uuid) to authenticated, service_role;
grant execute on function public.rls_driver_can_access_incident(uuid) to authenticated, service_role;
grant execute on function public.rls_driver_can_access_remittance(uuid) to authenticated, service_role;
grant execute on function public.rls_driver_can_access_settlement(uuid) to authenticated, service_role;
-- Enable RLS on every public table created by 0001-0013.
alter table public.human_code_counters enable row level security;
alter table public.persons enable row level security;
alter table public.app_users enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.app_sessions enable row level security;
alter table public.companies enable row level security;
alter table public.customers enable row level security;
alter table public.company_contacts enable row level security;
alter table public.drivers enable row level security;
alter table public.user_driver_links enable row level security;
alter table public.suppliers enable row level security;
alter table public.vehicle_external_owners enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_document_types enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.vehicle_status_reasons enable row level security;
alter table public.vehicle_technical_incidents enable row level security;
alter table public.driver_vehicle_assignments enable row level security;
alter table public.vehicle_odometer_readings enable row level security;
alter table public.vehicle_maintenance_records enable row level security;
alter table public.services enable row level security;
alter table public.service_locations enable row level security;
alter table public.service_passengers enable row level security;
alter table public.service_assignments enable row level security;
alter table public.service_driver_progress enable row level security;
alter table public.service_closures enable row level security;
alter table public.service_cancellations enable row level security;
alter table public.service_status_history enable row level security;
alter table public.service_events enable row level security;
alter table public.service_snapshots enable row level security;
alter table public.service_financials enable row level security;
alter table public.service_price_components enable row level security;
alter table public.service_payments enable row level security;
alter table public.service_payment_allocations enable row level security;
alter table public.service_financial_status_history enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.cash_remittances enable row level security;
alter table public.cash_counts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_remittance_items enable row level security;
alter table public.cash_count_items enable row level security;
alter table public.cash_discrepancies enable row level security;
alter table public.receivables enable row level security;
alter table public.receivable_status_history enable row level security;
alter table public.receivable_collection_attempts enable row level security;
alter table public.receivable_notes enable row level security;
alter table public.receivable_allocations enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_allocations enable row level security;
alter table public.expense_payments enable row level security;
alter table public.expense_reimbursements enable row level security;
alter table public.expense_documents enable row level security;
alter table public.expense_status_history enable row level security;
alter table public.settlement_rules enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_items enable row level security;
alter table public.settlement_payments enable row level security;
alter table public.settlement_status_history enable row level security;
alter table public.incident_categories enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
alter table public.incident_comments enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_setting_history enable row level security;
alter table public.configurable_catalogs enable row level security;
alter table public.configurable_catalog_items enable row level security;
alter table public.audit_logs enable row level security;

-- Authenticated users receive read grants only; RLS decides which rows are visible.
revoke all on table public.human_code_counters from anon, authenticated;
revoke all on table public.persons, public.app_users, public.roles, public.user_roles, public.app_sessions, public.companies, public.customers, public.company_contacts, public.drivers, public.user_driver_links, public.suppliers, public.vehicle_external_owners, public.vehicles, public.vehicle_document_types, public.vehicle_documents, public.vehicle_status_reasons, public.vehicle_technical_incidents, public.driver_vehicle_assignments, public.vehicle_odometer_readings, public.vehicle_maintenance_records, public.services, public.service_locations, public.service_passengers, public.service_assignments, public.service_driver_progress, public.service_closures, public.service_cancellations, public.service_status_history, public.service_events, public.service_snapshots, public.service_financials, public.service_price_components, public.service_payments, public.service_payment_allocations, public.service_financial_status_history, public.cash_accounts, public.cash_remittances, public.cash_counts, public.cash_movements, public.cash_remittance_items, public.cash_count_items, public.cash_discrepancies, public.receivables, public.receivable_status_history, public.receivable_collection_attempts, public.receivable_notes, public.receivable_allocations, public.expense_categories, public.expenses, public.expense_allocations, public.expense_payments, public.expense_reimbursements, public.expense_documents, public.expense_status_history, public.settlement_rules, public.settlements, public.settlement_items, public.settlement_payments, public.settlement_status_history, public.incident_categories, public.incidents, public.incident_events, public.incident_comments, public.app_settings, public.app_setting_history, public.configurable_catalogs, public.configurable_catalog_items, public.audit_logs from anon;
revoke insert, update, delete on table public.persons, public.app_users, public.roles, public.user_roles, public.app_sessions, public.companies, public.customers, public.company_contacts, public.drivers, public.user_driver_links, public.suppliers, public.vehicle_external_owners, public.vehicles, public.vehicle_document_types, public.vehicle_documents, public.vehicle_status_reasons, public.vehicle_technical_incidents, public.driver_vehicle_assignments, public.vehicle_odometer_readings, public.vehicle_maintenance_records, public.services, public.service_locations, public.service_passengers, public.service_assignments, public.service_driver_progress, public.service_closures, public.service_cancellations, public.service_status_history, public.service_events, public.service_snapshots, public.service_financials, public.service_price_components, public.service_payments, public.service_payment_allocations, public.service_financial_status_history, public.cash_accounts, public.cash_remittances, public.cash_counts, public.cash_movements, public.cash_remittance_items, public.cash_count_items, public.cash_discrepancies, public.receivables, public.receivable_status_history, public.receivable_collection_attempts, public.receivable_notes, public.receivable_allocations, public.expense_categories, public.expenses, public.expense_allocations, public.expense_payments, public.expense_reimbursements, public.expense_documents, public.expense_status_history, public.settlement_rules, public.settlements, public.settlement_items, public.settlement_payments, public.settlement_status_history, public.incident_categories, public.incidents, public.incident_events, public.incident_comments, public.app_settings, public.app_setting_history, public.configurable_catalogs, public.configurable_catalog_items, public.audit_logs from authenticated;
grant select on table public.persons, public.app_users, public.roles, public.user_roles, public.app_sessions, public.companies, public.customers, public.company_contacts, public.drivers, public.user_driver_links, public.suppliers, public.vehicle_external_owners, public.vehicles, public.vehicle_document_types, public.vehicle_documents, public.vehicle_status_reasons, public.vehicle_technical_incidents, public.driver_vehicle_assignments, public.vehicle_odometer_readings, public.vehicle_maintenance_records, public.services, public.service_locations, public.service_passengers, public.service_assignments, public.service_driver_progress, public.service_closures, public.service_cancellations, public.service_status_history, public.service_events, public.service_snapshots, public.service_financials, public.service_price_components, public.service_payments, public.service_payment_allocations, public.service_financial_status_history, public.cash_accounts, public.cash_remittances, public.cash_counts, public.cash_movements, public.cash_remittance_items, public.cash_count_items, public.cash_discrepancies, public.receivables, public.receivable_status_history, public.receivable_collection_attempts, public.receivable_notes, public.receivable_allocations, public.expense_categories, public.expenses, public.expense_allocations, public.expense_payments, public.expense_reimbursements, public.expense_documents, public.expense_status_history, public.settlement_rules, public.settlements, public.settlement_items, public.settlement_payments, public.settlement_status_history, public.incident_categories, public.incidents, public.incident_events, public.incident_comments, public.app_settings, public.app_setting_history, public.configurable_catalogs, public.configurable_catalog_items, public.audit_logs to authenticated;

-- Identity.
drop policy if exists persons_select_admin on public.persons;
create policy persons_select_admin on public.persons for select to authenticated using (public.rls_is_admin());
drop policy if exists persons_select_own_driver on public.persons;
create policy persons_select_own_driver on public.persons for select to authenticated using (id = (select person_id from public.app_users where id = public.rls_current_app_user_id()));
drop policy if exists app_users_select_admin on public.app_users;
create policy app_users_select_admin on public.app_users for select to authenticated using (public.rls_is_admin());
drop policy if exists app_users_select_own on public.app_users;
create policy app_users_select_own on public.app_users for select to authenticated using (id = public.rls_current_app_user_id());
drop policy if exists roles_select_admin on public.roles;
create policy roles_select_admin on public.roles for select to authenticated using (public.rls_is_admin());
drop policy if exists roles_select_active_authenticated on public.roles;
create policy roles_select_active_authenticated on public.roles for select to authenticated using (is_active = true and public.rls_current_app_user_id() is not null);
drop policy if exists user_roles_select_admin on public.user_roles;
create policy user_roles_select_admin on public.user_roles for select to authenticated using (public.rls_is_admin());
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles for select to authenticated using (user_id = public.rls_current_app_user_id());
drop policy if exists app_sessions_select_superadmin on public.app_sessions;
create policy app_sessions_select_superadmin on public.app_sessions for select to authenticated using (public.rls_is_superadmin());
drop policy if exists app_sessions_select_own on public.app_sessions;
create policy app_sessions_select_own on public.app_sessions for select to authenticated using (app_user_id = public.rls_current_app_user_id() and auth_user_id = auth.uid());

-- Customers and drivers.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated using (public.rls_is_admin() or exists (select 1 from public.customers c where c.company_id = companies.id and public.rls_driver_can_access_customer(c.id)));
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_customer(id));
drop policy if exists company_contacts_select on public.company_contacts;
create policy company_contacts_select on public.company_contacts for select to authenticated using (public.rls_is_admin() or exists (select 1 from public.customers c where c.company_id = company_contacts.company_id and public.rls_driver_can_access_customer(c.id)));
drop policy if exists drivers_select on public.drivers;
create policy drivers_select on public.drivers for select to authenticated using (public.rls_is_admin() or id = public.rls_current_driver_id());
drop policy if exists user_driver_links_select on public.user_driver_links;
create policy user_driver_links_select on public.user_driver_links for select to authenticated using (public.rls_is_admin() or driver_id = public.rls_current_driver_id() or user_id = public.rls_current_app_user_id());
drop policy if exists suppliers_select_admin on public.suppliers;
create policy suppliers_select_admin on public.suppliers for select to authenticated using (public.rls_is_admin());
-- Vehicles.
drop policy if exists vehicle_external_owners_select_admin on public.vehicle_external_owners;
create policy vehicle_external_owners_select_admin on public.vehicle_external_owners for select to authenticated using (public.rls_is_admin());
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_vehicle(id));
drop policy if exists vehicle_document_types_select on public.vehicle_document_types;
create policy vehicle_document_types_select on public.vehicle_document_types for select to authenticated using (public.rls_is_admin() or (is_active = true and public.rls_current_driver_id() is not null));
drop policy if exists vehicle_documents_select on public.vehicle_documents;
create policy vehicle_documents_select on public.vehicle_documents for select to authenticated using (public.rls_is_admin());
drop policy if exists vehicle_status_reasons_select on public.vehicle_status_reasons;
create policy vehicle_status_reasons_select on public.vehicle_status_reasons for select to authenticated using (public.rls_is_admin() or (is_active = true and public.rls_current_driver_id() is not null));
drop policy if exists vehicle_technical_incidents_select on public.vehicle_technical_incidents;
create policy vehicle_technical_incidents_select on public.vehicle_technical_incidents for select to authenticated using (public.rls_is_admin());
drop policy if exists driver_vehicle_assignments_select on public.driver_vehicle_assignments;
create policy driver_vehicle_assignments_select on public.driver_vehicle_assignments for select to authenticated using (public.rls_is_admin() or driver_id = public.rls_current_driver_id());
drop policy if exists vehicle_odometer_readings_select on public.vehicle_odometer_readings;
create policy vehicle_odometer_readings_select on public.vehicle_odometer_readings for select to authenticated using (public.rls_is_admin());
drop policy if exists vehicle_maintenance_records_select on public.vehicle_maintenance_records;
create policy vehicle_maintenance_records_select on public.vehicle_maintenance_records for select to authenticated using (public.rls_is_admin());

-- Services and operational history.
drop policy if exists services_select on public.services;
create policy services_select on public.services for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_service(id));
drop policy if exists service_locations_select on public.service_locations;
create policy service_locations_select on public.service_locations for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_service(service_id));
drop policy if exists service_passengers_select on public.service_passengers;
create policy service_passengers_select on public.service_passengers for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_service(service_id));
drop policy if exists service_assignments_select on public.service_assignments;
create policy service_assignments_select on public.service_assignments for select to authenticated using (public.rls_is_admin() or driver_id = public.rls_current_driver_id());
drop policy if exists service_driver_progress_select on public.service_driver_progress;
create policy service_driver_progress_select on public.service_driver_progress for select to authenticated using (public.rls_is_admin() or (driver_id = public.rls_current_driver_id() and public.rls_driver_can_access_service(service_id)));
drop policy if exists service_closures_select on public.service_closures;
create policy service_closures_select on public.service_closures for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_service(service_id));
drop policy if exists service_cancellations_select on public.service_cancellations;
create policy service_cancellations_select on public.service_cancellations for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_service(service_id));
drop policy if exists service_status_history_select on public.service_status_history;
create policy service_status_history_select on public.service_status_history for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_service(service_id));
drop policy if exists service_events_select on public.service_events;
create policy service_events_select on public.service_events for select to authenticated using (public.rls_is_admin());
drop policy if exists service_snapshots_select on public.service_snapshots;
create policy service_snapshots_select on public.service_snapshots for select to authenticated using (public.rls_is_admin());

-- Service financial tables are admin-only until 0016 can expose driver-safe views.
drop policy if exists service_financials_select_admin on public.service_financials;
create policy service_financials_select_admin on public.service_financials for select to authenticated using (public.rls_is_admin());
drop policy if exists service_price_components_select_admin on public.service_price_components;
create policy service_price_components_select_admin on public.service_price_components for select to authenticated using (public.rls_is_admin());
drop policy if exists service_payments_select_admin on public.service_payments;
create policy service_payments_select_admin on public.service_payments for select to authenticated using (public.rls_is_admin());
drop policy if exists service_payment_allocations_select_admin on public.service_payment_allocations;
create policy service_payment_allocations_select_admin on public.service_payment_allocations for select to authenticated using (public.rls_is_admin());
drop policy if exists service_financial_status_history_select_admin on public.service_financial_status_history;
create policy service_financial_status_history_select_admin on public.service_financial_status_history for select to authenticated using (public.rls_is_admin());

-- Cash and remittances.
drop policy if exists cash_accounts_select_admin on public.cash_accounts;
create policy cash_accounts_select_admin on public.cash_accounts for select to authenticated using (public.rls_is_admin());
drop policy if exists cash_movements_select_admin on public.cash_movements;
create policy cash_movements_select_admin on public.cash_movements for select to authenticated using (public.rls_is_admin());
drop policy if exists cash_counts_select_admin on public.cash_counts;
create policy cash_counts_select_admin on public.cash_counts for select to authenticated using (public.rls_is_admin());
drop policy if exists cash_count_items_select_admin on public.cash_count_items;
create policy cash_count_items_select_admin on public.cash_count_items for select to authenticated using (public.rls_is_admin());
drop policy if exists cash_discrepancies_select_admin on public.cash_discrepancies;
create policy cash_discrepancies_select_admin on public.cash_discrepancies for select to authenticated using (public.rls_is_admin());
drop policy if exists cash_remittances_select on public.cash_remittances;
create policy cash_remittances_select on public.cash_remittances for select to authenticated using (public.rls_is_admin() or driver_id = public.rls_current_driver_id());
drop policy if exists cash_remittance_items_select on public.cash_remittance_items;
create policy cash_remittance_items_select on public.cash_remittance_items for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_remittance(remittance_id));

-- Receivables are administrative financial records.
drop policy if exists receivables_select_admin on public.receivables;
create policy receivables_select_admin on public.receivables for select to authenticated using (public.rls_is_admin());
drop policy if exists receivable_status_history_select_admin on public.receivable_status_history;
create policy receivable_status_history_select_admin on public.receivable_status_history for select to authenticated using (public.rls_is_admin());
drop policy if exists receivable_collection_attempts_select_admin on public.receivable_collection_attempts;
create policy receivable_collection_attempts_select_admin on public.receivable_collection_attempts for select to authenticated using (public.rls_is_admin());
drop policy if exists receivable_notes_select_admin on public.receivable_notes;
create policy receivable_notes_select_admin on public.receivable_notes for select to authenticated using (public.rls_is_admin());
drop policy if exists receivable_allocations_select_admin on public.receivable_allocations;
create policy receivable_allocations_select_admin on public.receivable_allocations for select to authenticated using (public.rls_is_admin());
-- Expenses. Direct driver access is deferred because rows include internal notes and financial columns.
drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories for select to authenticated using (public.rls_is_admin() or (is_active = true and public.rls_current_driver_id() is not null));
drop policy if exists expenses_select_admin on public.expenses;
create policy expenses_select_admin on public.expenses for select to authenticated using (public.rls_is_admin());
drop policy if exists expense_allocations_select_admin on public.expense_allocations;
create policy expense_allocations_select_admin on public.expense_allocations for select to authenticated using (public.rls_is_admin());
drop policy if exists expense_payments_select_admin on public.expense_payments;
create policy expense_payments_select_admin on public.expense_payments for select to authenticated using (public.rls_is_admin());
drop policy if exists expense_reimbursements_select_admin on public.expense_reimbursements;
create policy expense_reimbursements_select_admin on public.expense_reimbursements for select to authenticated using (public.rls_is_admin());
drop policy if exists expense_documents_select_admin on public.expense_documents;
create policy expense_documents_select_admin on public.expense_documents for select to authenticated using (public.rls_is_admin());
drop policy if exists expense_status_history_select_admin on public.expense_status_history;
create policy expense_status_history_select_admin on public.expense_status_history for select to authenticated using (public.rls_is_admin());

-- Settlements. settlement_items are admin-only until 0016 exposes driver-safe snapshot views.
drop policy if exists settlement_rules_select on public.settlement_rules;
create policy settlement_rules_select on public.settlement_rules for select to authenticated using (
  public.rls_is_admin()
  or (
    is_active = true
    and public.rls_current_driver_id() is not null
    and driver_type = (select d.driver_type from public.drivers d where d.id = public.rls_current_driver_id())
  )
);
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements for select to authenticated using (public.rls_is_admin() or driver_id = public.rls_current_driver_id());
drop policy if exists settlement_items_select_admin on public.settlement_items;
create policy settlement_items_select_admin on public.settlement_items for select to authenticated using (public.rls_is_admin());
drop policy if exists settlement_payments_select on public.settlement_payments;
create policy settlement_payments_select on public.settlement_payments for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_settlement(settlement_id));
drop policy if exists settlement_status_history_select on public.settlement_status_history;
create policy settlement_status_history_select on public.settlement_status_history for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_settlement(settlement_id));

-- Incidents, settings, catalogs and audit.
drop policy if exists incident_categories_select on public.incident_categories;
create policy incident_categories_select on public.incident_categories for select to authenticated using (public.rls_is_admin() or (is_active = true and public.rls_current_driver_id() is not null));
drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents for select to authenticated using (public.rls_is_admin() or public.rls_driver_can_access_incident(id));
drop policy if exists incident_events_select_admin on public.incident_events;
create policy incident_events_select_admin on public.incident_events for select to authenticated using (public.rls_is_admin());
drop policy if exists incident_comments_select on public.incident_comments;
create policy incident_comments_select on public.incident_comments for select to authenticated using (public.rls_is_admin() or (is_private = false and public.rls_driver_can_access_incident(incident_id)));

drop policy if exists app_settings_select_superadmin on public.app_settings;
create policy app_settings_select_superadmin on public.app_settings for select to authenticated using (public.rls_is_superadmin());
drop policy if exists app_settings_select_admin_non_sensitive on public.app_settings;
create policy app_settings_select_admin_non_sensitive on public.app_settings for select to authenticated using (public.rls_is_administrativo() and is_sensitive = false);
drop policy if exists app_setting_history_select_superadmin on public.app_setting_history;
create policy app_setting_history_select_superadmin on public.app_setting_history for select to authenticated using (public.rls_is_superadmin());

drop policy if exists configurable_catalogs_select on public.configurable_catalogs;
create policy configurable_catalogs_select on public.configurable_catalogs for select to authenticated using (
  public.rls_is_admin()
  or (
    is_active = true
    and catalog_key in ('service_types', 'incident_reason_codes', 'cancellation_reason_codes')
    and public.rls_current_driver_id() is not null
  )
);
drop policy if exists configurable_catalog_items_select on public.configurable_catalog_items;
create policy configurable_catalog_items_select on public.configurable_catalog_items for select to authenticated using (
  public.rls_is_admin()
  or (
    is_active = true
    and public.rls_current_driver_id() is not null
    and exists (
      select 1
      from public.configurable_catalogs c
      where c.id = configurable_catalog_items.catalog_id
        and c.is_active = true
        and c.catalog_key in ('service_types', 'incident_reason_codes', 'cancellation_reason_codes')
    )
  )
);

drop policy if exists audit_logs_select_superadmin on public.audit_logs;
create policy audit_logs_select_superadmin on public.audit_logs for select to authenticated using (public.rls_is_superadmin());

-- Final validation. No data is created and no human code is consumed.
do $$
declare
  v_missing_rls text[];
  v_forced_rls text[];
  v_authenticated_writes text[];
  v_missing_policy text[];
  v_anon_helper_exec text[];
  v_invalid_periodic boolean;
begin
  with expected(table_name) as (
    values
      ('human_code_counters'),('persons'),('app_users'),('roles'),('user_roles'),('app_sessions'),
      ('companies'),('customers'),('company_contacts'),('drivers'),('user_driver_links'),('suppliers'),
      ('vehicle_external_owners'),('vehicles'),('vehicle_document_types'),('vehicle_documents'),('vehicle_status_reasons'),('vehicle_technical_incidents'),('driver_vehicle_assignments'),('vehicle_odometer_readings'),('vehicle_maintenance_records'),
      ('services'),('service_locations'),('service_passengers'),('service_assignments'),('service_driver_progress'),('service_closures'),('service_cancellations'),('service_status_history'),('service_events'),('service_snapshots'),
      ('service_financials'),('service_price_components'),('service_payments'),('service_payment_allocations'),('service_financial_status_history'),
      ('cash_accounts'),('cash_remittances'),('cash_counts'),('cash_movements'),('cash_remittance_items'),('cash_count_items'),('cash_discrepancies'),
      ('receivables'),('receivable_status_history'),('receivable_collection_attempts'),('receivable_notes'),('receivable_allocations'),
      ('expense_categories'),('expenses'),('expense_allocations'),('expense_payments'),('expense_reimbursements'),('expense_documents'),('expense_status_history'),
      ('settlement_rules'),('settlements'),('settlement_items'),('settlement_payments'),('settlement_status_history'),
      ('incident_categories'),('incidents'),('incident_events'),('incident_comments'),('app_settings'),('app_setting_history'),('configurable_catalogs'),('configurable_catalog_items'),('audit_logs')
  )
  select array_agg(e.table_name order by e.table_name) into v_missing_rls
  from expected e
  left join pg_class c on c.relname = e.table_name
  left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.oid is null or c.relrowsecurity = false;

  if v_missing_rls is not null then
    raise exception 'Missing RLS on public tables: %.', v_missing_rls;
  end if;

  with expected(table_name) as (
    values
      ('human_code_counters'),('persons'),('app_users'),('roles'),('user_roles'),('app_sessions'),
      ('companies'),('customers'),('company_contacts'),('drivers'),('user_driver_links'),('suppliers'),
      ('vehicle_external_owners'),('vehicles'),('vehicle_document_types'),('vehicle_documents'),('vehicle_status_reasons'),('vehicle_technical_incidents'),('driver_vehicle_assignments'),('vehicle_odometer_readings'),('vehicle_maintenance_records'),
      ('services'),('service_locations'),('service_passengers'),('service_assignments'),('service_driver_progress'),('service_closures'),('service_cancellations'),('service_status_history'),('service_events'),('service_snapshots'),
      ('service_financials'),('service_price_components'),('service_payments'),('service_payment_allocations'),('service_financial_status_history'),
      ('cash_accounts'),('cash_remittances'),('cash_counts'),('cash_movements'),('cash_remittance_items'),('cash_count_items'),('cash_discrepancies'),
      ('receivables'),('receivable_status_history'),('receivable_collection_attempts'),('receivable_notes'),('receivable_allocations'),
      ('expense_categories'),('expenses'),('expense_allocations'),('expense_payments'),('expense_reimbursements'),('expense_documents'),('expense_status_history'),
      ('settlement_rules'),('settlements'),('settlement_items'),('settlement_payments'),('settlement_status_history'),
      ('incident_categories'),('incidents'),('incident_events'),('incident_comments'),('app_settings'),('app_setting_history'),('configurable_catalogs'),('configurable_catalog_items'),('audit_logs')
  )
  select array_agg(c.relname order by c.relname) into v_forced_rls
  from expected e
  join pg_class c on c.relname = e.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relforcerowsecurity = true;

  if v_forced_rls is not null then
    raise exception 'FORCE RLS must not be enabled by 0014: %.', v_forced_rls;
  end if;

  with readable(table_name) as (
    values
      ('persons'),('app_users'),('roles'),('user_roles'),('app_sessions'),('companies'),('customers'),('company_contacts'),('drivers'),('user_driver_links'),('suppliers'),
      ('vehicle_external_owners'),('vehicles'),('vehicle_document_types'),('vehicle_documents'),('vehicle_status_reasons'),('vehicle_technical_incidents'),('driver_vehicle_assignments'),('vehicle_odometer_readings'),('vehicle_maintenance_records'),
      ('services'),('service_locations'),('service_passengers'),('service_assignments'),('service_driver_progress'),('service_closures'),('service_cancellations'),('service_status_history'),('service_events'),('service_snapshots'),
      ('service_financials'),('service_price_components'),('service_payments'),('service_payment_allocations'),('service_financial_status_history'),
      ('cash_accounts'),('cash_remittances'),('cash_counts'),('cash_movements'),('cash_remittance_items'),('cash_count_items'),('cash_discrepancies'),
      ('receivables'),('receivable_status_history'),('receivable_collection_attempts'),('receivable_notes'),('receivable_allocations'),
      ('expense_categories'),('expenses'),('expense_allocations'),('expense_payments'),('expense_reimbursements'),('expense_documents'),('expense_status_history'),
      ('settlement_rules'),('settlements'),('settlement_items'),('settlement_payments'),('settlement_status_history'),
      ('incident_categories'),('incidents'),('incident_events'),('incident_comments'),('app_settings'),('app_setting_history'),('configurable_catalogs'),('configurable_catalog_items'),('audit_logs')
  )
  select array_agg(table_name order by table_name) into v_authenticated_writes
  from readable
  where has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
     or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
     or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE');

  if v_authenticated_writes is not null then
    raise exception 'authenticated must not have direct write privileges on domain tables: %.', v_authenticated_writes;
  end if;

  if has_table_privilege('authenticated', 'public.human_code_counters', 'SELECT') then
    raise exception 'authenticated must not read human_code_counters.';
  end if;

  select array_agg(function_name order by function_name) into v_anon_helper_exec
  from (values
    ('public.rls_current_app_user_id()'),('public.rls_current_active_context()'),('public.rls_has_active_context(text)'),
    ('public.rls_is_superadmin()'),('public.rls_is_administrativo()'),('public.rls_is_admin()'),('public.rls_current_driver_id()'),
    ('public.rls_driver_can_access_service(uuid)'),('public.rls_driver_can_access_customer(uuid)'),('public.rls_driver_can_access_vehicle(uuid)'),
    ('public.rls_driver_can_access_incident(uuid)'),('public.rls_driver_can_access_remittance(uuid)'),('public.rls_driver_can_access_settlement(uuid)')
  ) as f(function_name)
  where has_function_privilege('anon', function_name, 'EXECUTE');

  if v_anon_helper_exec is not null then
    raise exception 'anon must not execute RLS helpers: %.', v_anon_helper_exec;
  end if;

  select array_agg(policy_name order by policy_name) into v_missing_policy
  from (values
    ('persons_select_admin'),('services_select'),('cash_movements_select_admin'),('receivables_select_admin'),
    ('expenses_select_admin'),('settlements_select'),('incident_comments_select'),('app_settings_select_admin_non_sensitive'),('audit_logs_select_superadmin')
  ) as p(policy_name)
  where not exists (select 1 from pg_policies where schemaname = 'public' and policyname = p.policy_name);

  if v_missing_policy is not null then
    raise exception 'Missing representative RLS policies: %.', v_missing_policy;
  end if;

  select exists (
    select 1
    from public.app_settings s
    where s.setting_key = 'operations.periodic_services_enabled'
      and s.is_active = true
      and coalesce((s.value_json #>> '{}')::boolean, false) = true
  ) into v_invalid_periodic;

  if coalesce(v_invalid_periodic, false) then
    raise exception 'Periodic services must remain disabled in the MVP.';
  end if;
end;
$$;
