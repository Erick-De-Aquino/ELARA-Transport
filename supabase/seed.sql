-- ELARA Transport V4.0 local / QA seed.
-- LOCAL DEVELOPMENT / QA ONLY. Never run against production.
-- This file is intended for manual local bootstrap after migrations and Auth Admin user creation.
-- It is not a production migration.
--
-- Required Auth users, created first by scripts/seed-local-qa.mjs:
--   qa-superadmin@example.invalid
--   qa-admin@example.invalid
--   qa-driver-a@example.invalid
--   qa-driver-b@example.invalid
--
-- App users:
--   20000000-0000-4000-8000-000000000001 USR-0001 QA Superadmin
--   20000000-0000-4000-8000-000000000002 USR-0002 QA Administrativo
--   20000000-0000-4000-8000-000000000003 USR-0003 QA Driver A
--   20000000-0000-4000-8000-000000000004 USR-0004 QA Driver B
--
-- Principal operating records:
--   31000000-0000-4000-8000-000000000001 CL-0001 Customer A
--   31000000-0000-4000-8000-000000000002 EMP-0001 Customer B
--   40000000-0000-4000-8000-000000000001 DRV-0001 Driver A internal_driver
--   40000000-0000-4000-8000-000000000002 DRV-0002 Driver B external_collaborator
--   51000000-0000-4000-8000-000000000001 VEH-0001 Vehicle A
--   51000000-0000-4000-8000-000000000002 VEH-0002 Vehicle B

begin;

do $$
declare
  v_missing_emails text[];
  v_duplicate_emails text[];
begin
  with required(email) as (
    values
      ('qa-superadmin@example.invalid'),
      ('qa-admin@example.invalid'),
      ('qa-driver-a@example.invalid'),
      ('qa-driver-b@example.invalid')
  )
  select array_agg(required.email order by required.email)
    into v_missing_emails
  from required
  where not exists (
    select 1
    from auth.users auth_user
    where lower(auth_user.email) = required.email
  );

  if v_missing_emails is not null then
    raise exception 'Missing local QA Auth users: %. Run node scripts/seed-local-qa.mjs before supabase/seed.sql.', v_missing_emails
      using errcode = '23514';
  end if;

  with required(email) as (
    values
      ('qa-superadmin@example.invalid'),
      ('qa-admin@example.invalid'),
      ('qa-driver-a@example.invalid'),
      ('qa-driver-b@example.invalid')
  )
  select array_agg(email order by email)
    into v_duplicate_emails
  from (
    select required.email
    from required
    join auth.users auth_user
      on lower(auth_user.email) = required.email
    group by required.email
    having count(*) <> 1
  ) duplicates;

  if v_duplicate_emails is not null then
    raise exception 'Expected exactly one local QA Auth user for each email, but duplicates were found: %.', v_duplicate_emails
      using errcode = '23514';
  end if;
end;
$$;

insert into public.persons (
  id, first_name, last_name, contact_email, phone, country_code, notes, status, created_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'QA', 'Superadmin', 'qa-superadmin@example.invalid', '+34000000001', 'ES', 'Local QA identity.', 'active', '2026-01-01 09:00:00+00'),
  ('10000000-0000-4000-8000-000000000002', 'QA', 'Administrativo', 'qa-admin@example.invalid', '+34000000002', 'ES', 'Local QA identity.', 'active', '2026-01-01 09:00:00+00'),
  ('10000000-0000-4000-8000-000000000003', 'QA', 'Driver A', 'qa-driver-a@example.invalid', '+34000000003', 'ES', 'Local QA identity.', 'active', '2026-01-01 09:00:00+00'),
  ('10000000-0000-4000-8000-000000000004', 'QA', 'Driver B', 'qa-driver-b@example.invalid', '+34000000004', 'ES', 'Local QA identity.', 'active', '2026-01-01 09:00:00+00'),
  ('10000000-0000-4000-8000-000000000005', 'QA', 'Customer Uno', 'qa-customer-a@example.invalid', '+34000000101', 'ES', 'Local QA customer.', 'active', '2026-01-01 09:00:00+00'),
  ('10000000-0000-4000-8000-000000000006', 'QA', 'Contacto Empresa', 'qa-contact@example.invalid', '+34000000102', 'ES', 'Local QA company contact.', 'active', '2026-01-01 09:00:00+00'),
  ('10000000-0000-4000-8000-000000000007', 'QA', 'Customer RLS B', 'qa-customer-rls-b@example.invalid', '+34000000103', 'ES', 'Local QA customer exclusively for Driver B RLS access.', 'active', '2026-01-01 09:00:00+00')
on conflict (id) do nothing;

insert into public.app_users (
  id, auth_user_id, person_id, human_code, status, default_context, internal_note, created_at
)
select seed.id, auth_user.id, seed.person_id, seed.human_code, seed.status, seed.default_context, seed.internal_note, seed.created_at
from (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 'qa-superadmin@example.invalid', '10000000-0000-4000-8000-000000000001'::uuid, 'USR-0001', 'active', 'superadmin', 'Local QA superadmin.', '2026-01-01 09:05:00+00'::timestamptz),
    ('20000000-0000-4000-8000-000000000002'::uuid, 'qa-admin@example.invalid', '10000000-0000-4000-8000-000000000002'::uuid, 'USR-0002', 'active', 'administrativo', 'Local QA administrative user.', '2026-01-01 09:05:00+00'::timestamptz),
    ('20000000-0000-4000-8000-000000000003'::uuid, 'qa-driver-a@example.invalid', '10000000-0000-4000-8000-000000000003'::uuid, 'USR-0003', 'active', 'conductor', 'Local QA internal driver user.', '2026-01-01 09:05:00+00'::timestamptz),
    ('20000000-0000-4000-8000-000000000004'::uuid, 'qa-driver-b@example.invalid', '10000000-0000-4000-8000-000000000004'::uuid, 'USR-0004', 'active', 'conductor', 'Local QA external collaborator user.', '2026-01-01 09:05:00+00'::timestamptz)
) as seed(id, email, person_id, human_code, status, default_context, internal_note, created_at)
join auth.users auth_user
  on lower(auth_user.email) = seed.email
on conflict (id) do update
set auth_user_id = excluded.auth_user_id,
    person_id = excluded.person_id,
    human_code = excluded.human_code,
    status = excluded.status,
    default_context = excluded.default_context,
    internal_note = excluded.internal_note;

insert into public.user_roles (id, user_id, role_key, status, starts_at, assigned_by, created_at)
values
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'superadmin', 'active', '2026-01-01 09:10:00+00', null, '2026-01-01 09:10:00+00'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'administrativo', 'active', '2026-01-01 09:10:00+00', '20000000-0000-4000-8000-000000000001', '2026-01-01 09:10:00+00'),
  ('21000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'conductor', 'active', '2026-01-01 09:10:00+00', '20000000-0000-4000-8000-000000000001', '2026-01-01 09:10:00+00'),
  ('21000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'conductor', 'active', '2026-01-01 09:10:00+00', '20000000-0000-4000-8000-000000000001', '2026-01-01 09:10:00+00')
on conflict (id) do nothing;

insert into public.companies (
  id, legal_name, trade_name, tax_id, billing_email, billing_phone, billing_address, notes, status, created_at, created_by
)
values
  ('30000000-0000-4000-8000-000000000001', 'QA Empresa Cliente S.L.', 'QA Empresa Cliente', 'QA-EMP-0001', 'qa-company@example.invalid', '+34000000201', 'Calle QA 1, Madrid', 'Local QA company customer.', 'active', '2026-01-01 09:20:00+00', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000002', 'QA Owner Externo S.L.', 'QA Owner Externo', 'QA-OWN-0001', 'qa-owner@example.invalid', '+34000000202', 'Calle QA 2, Madrid', 'Local QA external vehicle owner.', 'active', '2026-01-01 09:20:00+00', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003', 'QA Taller Proveedor S.L.', 'QA Taller', 'QA-SUP-0001', 'qa-supplier@example.invalid', '+34000000203', 'Calle QA 3, Madrid', 'Local QA supplier.', 'active', '2026-01-01 09:20:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.customers (
  id, human_code, customer_type, person_id, company_id, status, billing_notes, preferences, internal_notes, created_at, created_by
)
values
  ('31000000-0000-4000-8000-000000000001', 'CL-0001', 'individual', '10000000-0000-4000-8000-000000000005', null, 'active', 'QA billing only.', '{"locale":"es-ES"}'::jsonb, 'Individual QA customer.', '2026-01-01 09:25:00+00', '20000000-0000-4000-8000-000000000002'),
  ('31000000-0000-4000-8000-000000000002', 'EMP-0001', 'company', null, '30000000-0000-4000-8000-000000000001', 'active', 'QA company billing.', '{"requires_po":true}'::jsonb, 'Company QA customer.', '2026-01-01 09:25:00+00', '20000000-0000-4000-8000-000000000002'),
  ('31000000-0000-4000-8000-000000000003', 'CL-0002', 'individual', '10000000-0000-4000-8000-000000000007', null, 'active', 'QA RLS billing only.', '{"locale":"es-ES","rls_isolated":true}'::jsonb, 'Individual QA customer visible only through SRV-000005.', '2026-01-04 08:55:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.company_contacts (
  id, company_id, person_id, role_label, is_primary, status, started_at, notes, created_at, created_by
)
values
  ('32000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'Contacto QA', true, 'active', '2026-01-01 09:25:00+00', 'Primary local QA company contact.', '2026-01-01 09:25:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.drivers (
  id, person_id, human_code, driver_type, administrative_status, availability_preference, base_city, license_expiration, observations, settlement_config, created_at, created_by, status_changed_by
)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'DRV-0001', 'internal_driver', 'active', 'available', 'Madrid', '2028-12-31', 'QA Driver A internal.', '{"qa":"internal_driver_35_65"}'::jsonb, '2026-01-01 09:30:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'DRV-0002', 'external_collaborator', 'active', 'available', 'Madrid', '2028-12-31', 'QA Driver B external collaborator.', '{"qa":"external_collaborator_90_10"}'::jsonb, '2026-01-01 09:30:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.user_driver_links (id, user_id, driver_id, status, started_at, created_at, created_by)
values
  ('41000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'active', '2026-01-01 09:35:00+00', '2026-01-01 09:35:00+00', '20000000-0000-4000-8000-000000000002'),
  ('41000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', 'active', '2026-01-01 09:35:00+00', '2026-01-01 09:35:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.vehicle_external_owners (
  id, person_id, company_id, display_name, tax_id, contact_email, contact_phone, notes, status, created_at, created_by
)
values
  ('50000000-0000-4000-8000-000000000001', null, '30000000-0000-4000-8000-000000000002', 'QA Owner Externo', 'QA-OWN-0001', 'qa-owner@example.invalid', '+34000000202', 'External owner for local QA vehicle.', 'active', '2026-01-01 09:40:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.vehicles (
  id, human_code, plate_original, plate_normalized, plate_country, brand, model, color, year, seats, ownership_type, external_owner_id, manual_operational_status, elara_approval_status, notes, created_at, created_by
)
values
  ('51000000-0000-4000-8000-000000000001', 'VEH-0001', '1234 BCD', '1234-BCD', 'ES', 'Mercedes-Benz', 'Clase V', 'Negro', 2024, 7, 'owned', null, 'available', 'not_required', 'QA owned vehicle.', '2026-01-01 09:45:00+00', '20000000-0000-4000-8000-000000000002'),
  ('51000000-0000-4000-8000-000000000002', 'VEH-0002', '5678 FGH', '5678-FGH', 'ES', 'Tesla', 'Model Y', 'Blanco', 2025, 4, 'external', '50000000-0000-4000-8000-000000000001', 'available', 'approved', 'QA external approved vehicle.', '2026-01-01 09:45:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.vehicle_documents (
  id, vehicle_id, document_type_key, status, issued_at, expires_at, reference_number, storage_bucket, storage_path, file_name, mime_type, file_size, checksum, notes, validated_at, validated_by, created_at, created_by
)
values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'insurance', 'valid', '2026-01-01', '2030-01-01', 'QA-VEH-A-INS', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 'itv', 'valid', '2026-01-01', '2030-01-01', 'QA-VEH-A-ITV', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', 'circulation_permit', 'valid', '2026-01-01', null, 'QA-VEH-A-CIRC', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', 'vtc_license', 'valid', '2026-01-01', '2030-01-01', 'QA-VEH-A-VTC', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000002', 'insurance', 'valid', '2026-01-01', '2030-01-01', 'QA-VEH-B-INS', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000002', 'itv', 'valid', '2026-01-01', '2030-01-01', 'QA-VEH-B-ITV', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000002', 'circulation_permit', 'valid', '2026-01-01', null, 'QA-VEH-B-CIRC', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000002', 'vtc_license', 'valid', '2026-01-01', '2030-01-01', 'QA-VEH-B-VTC', null, null, null, null, null, null, 'Metadata-only QA document.', '2026-01-01 10:00:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-01 09:50:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.driver_vehicle_assignments (
  id, driver_id, vehicle_id, status, started_at, notes, created_at, created_by
)
values
  ('53000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'active', '2026-01-01 10:05:00+00', 'QA Driver A active vehicle assignment.', '2026-01-01 10:05:00+00', '20000000-0000-4000-8000-000000000002'),
  ('53000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', 'active', '2026-01-01 10:05:00+00', 'QA Driver B active vehicle assignment.', '2026-01-01 10:05:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.cash_accounts (
  id, name, account_type, currency_code, driver_id, responsible_user_id, status, opening_balance, opened_at, notes, created_at, created_by
)
values
  ('54000000-0000-4000-8000-000000000001', 'QA Caja Central', 'central', 'EUR', null, '20000000-0000-4000-8000-000000000002', 'active', 0, '2026-01-01 10:10:00+00', 'Local QA central cash account.', '2026-01-01 10:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('54000000-0000-4000-8000-000000000002', 'QA Caja Driver A', 'driver', 'EUR', '40000000-0000-4000-8000-000000000001', null, 'active', 0, '2026-01-01 10:10:00+00', 'Local QA Driver A cash account.', '2026-01-01 10:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('54000000-0000-4000-8000-000000000003', 'QA Caja Driver B', 'driver', 'EUR', '40000000-0000-4000-8000-000000000002', null, 'active', 0, '2026-01-01 10:10:00+00', 'Local QA Driver B cash account.', '2026-01-01 10:10:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.services (
  id, human_code, customer_id, service_type, operational_status, scheduled_start_at, notes, internal_notes, requested_by_user_id, created_at, created_by, cancelled_at, cancelled_by
)
values
  ('60000000-0000-4000-8000-000000000001', 'SRV-000001', '31000000-0000-4000-8000-000000000001', 'point_to_point', 'pending', '2026-02-02 08:00:00+00', 'QA pending acceptance Driver A.', 'Scenario A.', '20000000-0000-4000-8000-000000000002', '2026-01-02 09:00:00+00', '20000000-0000-4000-8000-000000000002', null, null),
  ('60000000-0000-4000-8000-000000000002', 'SRV-000002', '31000000-0000-4000-8000-000000000002', 'airport', 'confirmed', '2026-02-03 08:00:00+00', 'QA accepted Driver A.', 'Scenario B.', '20000000-0000-4000-8000-000000000002', '2026-01-02 09:05:00+00', '20000000-0000-4000-8000-000000000002', null, null),
  ('60000000-0000-4000-8000-000000000003', 'SRV-000003', '31000000-0000-4000-8000-000000000001', 'point_to_point', 'completed', '2026-01-10 08:00:00+00', 'QA completed Driver A with open CxC.', 'Scenario G.', '20000000-0000-4000-8000-000000000002', '2026-01-03 09:00:00+00', '20000000-0000-4000-8000-000000000002', null, null),
  ('60000000-0000-4000-8000-000000000004', 'SRV-000004', '31000000-0000-4000-8000-000000000002', 'airport', 'completed', '2026-01-11 08:00:00+00', 'QA completed Driver B paid.', 'Scenario H.', '20000000-0000-4000-8000-000000000002', '2026-01-03 09:05:00+00', '20000000-0000-4000-8000-000000000002', null, null),
  ('60000000-0000-4000-8000-000000000005', 'SRV-000005', '31000000-0000-4000-8000-000000000003', 'airport', 'confirmed', '2026-02-05 08:00:00+00', 'QA RLS Driver A rejected and Driver B accepted.', 'Scenario E with isolated Customer C.', '20000000-0000-4000-8000-000000000002', '2026-01-04 09:00:00+00', '20000000-0000-4000-8000-000000000002', null, null),
  ('60000000-0000-4000-8000-000000000006', 'SRV-000006', '31000000-0000-4000-8000-000000000002', 'point_to_point', 'cancelled', '2026-01-12 08:00:00+00', 'QA cancelled service.', 'Scenario F.', '20000000-0000-4000-8000-000000000002', '2026-01-04 09:05:00+00', '20000000-0000-4000-8000-000000000002', '2026-01-11 16:00:00+00', '20000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000007', 'SRV-000007', '31000000-0000-4000-8000-000000000001', 'long_distance', 'completed', '2026-01-15 08:00:00+00', 'QA completed Driver A paid/remitted.', 'Scenario C.', '20000000-0000-4000-8000-000000000002', '2026-01-05 09:00:00+00', '20000000-0000-4000-8000-000000000002', null, null),
  ('60000000-0000-4000-8000-000000000008', 'SRV-000008', '31000000-0000-4000-8000-000000000002', 'point_to_point', 'completed', '2026-01-16 08:00:00+00', 'QA completed Driver B paid through CxC allocation.', 'Scenario D.', '20000000-0000-4000-8000-000000000002', '2026-01-05 09:05:00+00', '20000000-0000-4000-8000-000000000002', null, null)
on conflict (id) do nothing;

insert into public.service_locations (
  id, service_id, location_type, label, address, city, postal_code, latitude, longitude, sort_order, scheduled_at, notes, created_at, created_by
)
values
  ('64000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'origin', 'QA Origen 1', 'Calle QA Origen 1', 'Madrid', '28001', 40.416775, -3.703790, 0, '2026-02-02 08:00:00+00', null, '2026-01-02 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'destination', 'QA Destino 1', 'Calle QA Destino 1', 'Madrid', '28002', 40.421000, -3.690000, 1, '2026-02-02 08:30:00+00', null, '2026-01-02 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', 'origin', 'QA Origen 2', 'Calle QA Origen 2', 'Madrid', '28003', 40.430000, -3.700000, 0, '2026-02-03 08:00:00+00', null, '2026-01-02 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000002', 'destination', 'QA Destino 2', 'Aeropuerto Adolfo Suarez Madrid-Barajas', 'Madrid', '28042', 40.498300, -3.567600, 1, '2026-02-03 08:35:00+00', null, '2026-01-02 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000003', 'origin', 'QA Origen 3', 'Calle QA Origen 3', 'Madrid', '28004', 40.410000, -3.710000, 0, '2026-01-10 08:00:00+00', null, '2026-01-03 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000003', 'destination', 'QA Destino 3', 'Calle QA Destino 3', 'Madrid', '28005', 40.405000, -3.720000, 1, '2026-01-10 08:35:00+00', null, '2026-01-03 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000004', 'origin', 'QA Origen 4', 'Calle QA Origen 4', 'Madrid', '28006', 40.440000, -3.680000, 0, '2026-01-11 08:00:00+00', null, '2026-01-03 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000004', 'destination', 'QA Destino 4', 'Aeropuerto Adolfo Suarez Madrid-Barajas', 'Madrid', '28042', 40.498300, -3.567600, 1, '2026-01-11 08:40:00+00', null, '2026-01-03 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000005', 'origin', 'QA Origen RLS', 'Calle QA RLS A', 'Madrid', '28007', 40.450000, -3.670000, 0, '2026-02-05 08:00:00+00', null, '2026-01-04 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000005', 'destination', 'QA Destino RLS', 'Calle QA RLS B', 'Madrid', '28008', 40.455000, -3.660000, 1, '2026-02-05 08:35:00+00', null, '2026-01-04 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000006', 'origin', 'QA Origen Cancelado', 'Calle QA Cancelado A', 'Madrid', '28009', 40.460000, -3.650000, 0, '2026-01-12 08:00:00+00', null, '2026-01-04 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000006', 'destination', 'QA Destino Cancelado', 'Calle QA Cancelado B', 'Madrid', '28010', 40.465000, -3.640000, 1, '2026-01-12 08:35:00+00', null, '2026-01-04 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000013', '60000000-0000-4000-8000-000000000007', 'origin', 'QA Origen 7', 'Calle QA Origen 7', 'Madrid', '28011', 40.470000, -3.630000, 0, '2026-01-15 08:00:00+00', null, '2026-01-05 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000014', '60000000-0000-4000-8000-000000000007', 'destination', 'QA Destino 7', 'Toledo QA', 'Toledo', '45001', 39.862800, -4.027300, 1, '2026-01-15 09:20:00+00', null, '2026-01-05 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000015', '60000000-0000-4000-8000-000000000008', 'origin', 'QA Origen 8', 'Calle QA Origen 8', 'Madrid', '28012', 40.480000, -3.620000, 0, '2026-01-16 08:00:00+00', null, '2026-01-05 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('64000000-0000-4000-8000-000000000016', '60000000-0000-4000-8000-000000000008', 'destination', 'QA Destino 8', 'Calle QA Destino 8', 'Madrid', '28013', 40.485000, -3.610000, 1, '2026-01-16 08:30:00+00', null, '2026-01-05 09:15:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.service_passengers (
  id, service_id, person_id, display_name, phone, email, notes, is_primary, created_at, created_by
)
values
  ('65000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', null, 'QA Passenger 1', '+34000000301', 'qa-passenger-1@example.invalid', null, true, '2026-01-02 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', null, 'QA Passenger 2', '+34000000302', 'qa-passenger-2@example.invalid', null, true, '2026-01-02 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', null, 'QA Passenger 3', '+34000000303', 'qa-passenger-3@example.invalid', null, true, '2026-01-03 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', null, 'QA Passenger 4', '+34000000304', 'qa-passenger-4@example.invalid', null, true, '2026-01-03 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', null, 'QA Passenger RLS', '+34000000305', 'qa-passenger-rls@example.invalid', null, true, '2026-01-04 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000006', null, 'QA Passenger Cancelado', '+34000000306', 'qa-passenger-6@example.invalid', null, true, '2026-01-04 09:15:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000007', null, 'QA Passenger 7', '+34000000307', 'qa-passenger-7@example.invalid', null, true, '2026-01-05 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('65000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000008', null, 'QA Passenger 8', '+34000000308', 'qa-passenger-8@example.invalid', null, true, '2026-01-05 09:15:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.service_assignments (
  id, service_id, driver_id, vehicle_id, driver_vehicle_assignment_id, assignment_status, assigned_at, accepted_at, accepted_by_driver_id, rejected_at, rejected_by_driver_id, rejection_reason, ended_at, reassignment_reason, internal_priority_exception, priority_exception_reason, created_at, created_by, ended_by
)
values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'pending_acceptance', '2026-01-02 09:20:00+00', null, null, null, null, null, null, null, false, null, '2026-01-02 09:20:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'accepted', '2026-01-02 09:25:00+00', '2026-01-02 09:30:00+00', '40000000-0000-4000-8000-000000000001', null, null, null, null, null, false, null, '2026-01-02 09:25:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('61000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'ended', '2026-01-03 09:20:00+00', '2026-01-03 09:30:00+00', '40000000-0000-4000-8000-000000000001', null, null, null, '2026-01-10 09:00:00+00', 'Service completed.', false, null, '2026-01-03 09:20:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('61000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'ended', '2026-01-03 09:25:00+00', '2026-01-03 09:35:00+00', '40000000-0000-4000-8000-000000000002', null, null, null, '2026-01-11 09:00:00+00', 'Service completed.', true, 'External collaborator accepted for QA coverage.', '2026-01-03 09:25:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('61000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'rejected', '2026-01-04 09:20:00+00', null, null, '2026-01-04 09:30:00+00', '40000000-0000-4000-8000-000000000001', 'Driver A rejects this RLS QA service.', null, null, false, null, '2026-01-04 09:20:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('61000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'accepted', '2026-01-04 09:35:00+00', '2026-01-04 09:40:00+00', '40000000-0000-4000-8000-000000000002', null, null, null, null, 'Accepted after Driver A rejected.', true, 'QA RLS handoff after internal driver rejection.', '2026-01-04 09:35:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('61000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'cancelled', '2026-01-04 09:40:00+00', null, null, null, null, null, '2026-01-11 16:00:00+00', 'Customer cancelled.', false, null, '2026-01-04 09:40:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('61000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'ended', '2026-01-05 09:20:00+00', '2026-01-05 09:30:00+00', '40000000-0000-4000-8000-000000000001', null, null, null, '2026-01-15 09:45:00+00', 'Service completed.', false, null, '2026-01-05 09:20:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('61000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'ended', '2026-01-05 09:25:00+00', '2026-01-05 09:35:00+00', '40000000-0000-4000-8000-000000000002', null, null, null, '2026-01-16 08:45:00+00', 'Service completed.', true, 'External collaborator accepted for QA coverage.', '2026-01-05 09:25:00+00', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.service_closures (
  id, service_id, assignment_id, closure_type, closed_at, closed_by_user_id, closed_by_driver_id, reason_code, reason_details, rating, driver_notes, incident_flag, created_at, created_by
)
values
  ('62000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', 'completed', '2026-01-10 09:00:00+00', '20000000-0000-4000-8000-000000000002', null, 'completed_ok', 'QA completed with pending receivable.', 5, 'QA closure.', false, '2026-01-10 09:00:00+00', '20000000-0000-4000-8000-000000000002'),
  ('62000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000004', 'completed', '2026-01-11 09:00:00+00', '20000000-0000-4000-8000-000000000002', null, 'completed_ok', 'QA completed and paid.', 5, 'QA closure.', false, '2026-01-11 09:00:00+00', '20000000-0000-4000-8000-000000000002'),
  ('62000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000007', '61000000-0000-4000-8000-000000000008', 'completed', '2026-01-15 09:45:00+00', '20000000-0000-4000-8000-000000000002', null, 'completed_ok', 'QA completed and remitted.', 5, 'QA closure.', false, '2026-01-15 09:45:00+00', '20000000-0000-4000-8000-000000000002'),
  ('62000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000008', '61000000-0000-4000-8000-000000000009', 'completed', '2026-01-16 08:45:00+00', '20000000-0000-4000-8000-000000000002', null, 'completed_ok', 'QA completed and collected through receivable allocation.', 5, 'QA closure.', false, '2026-01-16 08:45:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.service_cancellations (
  id, service_id, cancelled_at, reason_code, reason_details, source, cancelled_by_user_id, cancelled_by_driver_id, created_at, created_by
)
values
  ('63000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000006', '2026-01-11 16:00:00+00', 'customer_request', 'QA cancellation requested by customer.', 'administration', '20000000-0000-4000-8000-000000000002', null, '2026-01-11 16:00:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.service_financials (
  id, service_id, currency_code, tax_rate, pricing_status, notes, internal_notes, created_at, created_by, finalized_by
)
values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'EUR', 0, 'draft', null, 'QA draft financial.', '2026-01-02 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'EUR', 0, 'draft', null, 'QA draft financial.', '2026-01-02 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'EUR', 0, 'draft', null, 'QA receivable open service.', '2026-01-03 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', 'EUR', 0, 'draft', null, 'QA paid service.', '2026-01-03 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'EUR', 0, 'draft', null, 'QA RLS service.', '2026-01-04 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000006', 'EUR', 0, 'cancelled', 'Cancelled QA service; no payment.', 'QA cancelled financial.', '2026-01-04 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000007', 'EUR', 0, 'draft', null, 'QA paid/remitted service.', '2026-01-05 09:45:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('70000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000008', 'EUR', 0, 'draft', null, 'QA receivable paid service.', '2026-01-05 09:45:00+00', '20000000-0000-4000-8000-000000000002', null)
on conflict (id) do nothing;

insert into public.service_price_components (
  id, service_financial_id, component_type, label, quantity, unit_amount, line_amount, tax_rate, sort_order, is_active, metadata, created_at, created_by
)
values
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'base_fare', 'QA accepted service fare', 1, 80, 80, 0, 10, true, '{}'::jsonb, '2026-01-02 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'base_fare', 'QA receivable open fare', 1, 120, 120, 0, 10, true, '{}'::jsonb, '2026-01-03 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004', 'base_fare', 'QA Driver B paid fare', 1, 200, 200, 0, 10, true, '{}'::jsonb, '2026-01-03 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000005', 'base_fare', 'QA RLS service fare', 1, 75, 75, 0, 10, true, '{}'::jsonb, '2026-01-04 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', 'base_fare', 'QA Driver A remitted fare', 1, 150, 150, 0, 10, true, '{}'::jsonb, '2026-01-05 09:50:00+00', '20000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000008', '70000000-0000-4000-8000-000000000008', 'base_fare', 'QA Driver B CxC paid fare', 1, 90, 90, 0, 10, true, '{}'::jsonb, '2026-01-05 09:50:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

update public.service_financials
set pricing_status = 'finalized',
    finalized_at = coalesce(finalized_at, '2026-01-06 10:00:00+00'::timestamptz),
    finalized_by = coalesce(finalized_by, '20000000-0000-4000-8000-000000000002'::uuid)
where id in (
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000007',
  '70000000-0000-4000-8000-000000000008'
)
and pricing_status = 'draft';

insert into public.receivables (
  id, human_code, service_id, service_financial_id, customer_id, status, currency_code, original_amount, collected_amount, pending_amount, due_at, opened_at, notes, internal_notes, created_at, created_by
)
values
  ('73000000-0000-4000-8000-000000000001', 'REC-000001', '60000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'open', 'EUR', 120, 0, 120, null, '2026-01-10 10:00:00+00', 'QA open receivable.', 'Expected open CxC.', '2026-01-10 10:00:00+00', '20000000-0000-4000-8000-000000000002'),
  ('73000000-0000-4000-8000-000000000002', 'REC-000002', '60000000-0000-4000-8000-000000000008', '70000000-0000-4000-8000-000000000008', '31000000-0000-4000-8000-000000000002', 'open', 'EUR', 90, 0, 90, '2026-02-16 23:00:00+00', '2026-01-16 09:00:00+00', 'QA receivable paid by allocation.', 'Starts open; allocation closes it.', '2026-01-16 09:00:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.service_payments (
  id, human_code, service_id, service_financial_id, payment_method, payment_status, amount, currency_code, paid_at, registered_at, external_reference, idempotency_key, notes, created_at, created_by
)
values
  ('72000000-0000-4000-8000-000000000001', 'PAY-000001', '60000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004', 'cash', 'completed', 200, 'EUR', '2026-01-11 09:10:00+00', '2026-01-11 09:10:00+00', 'QA-PAY-001', 'qa-service-payment-001', 'QA full cash payment.', '2026-01-11 09:10:00+00', '20000000-0000-4000-8000-000000000002'),
  ('72000000-0000-4000-8000-000000000002', 'PAY-000002', '60000000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', 'cash', 'completed', 150, 'EUR', '2026-01-15 10:00:00+00', '2026-01-15 10:00:00+00', 'QA-PAY-002', 'qa-service-payment-002', 'QA Driver A collected cash.', '2026-01-15 10:00:00+00', '20000000-0000-4000-8000-000000000002'),
  ('72000000-0000-4000-8000-000000000003', 'PAY-000003', '60000000-0000-4000-8000-000000000008', '70000000-0000-4000-8000-000000000008', 'cash', 'completed', 90, 'EUR', '2026-01-16 09:15:00+00', '2026-01-16 09:15:00+00', 'QA-PAY-003', 'qa-service-payment-003', 'QA CxC collection payment.', '2026-01-16 09:15:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.receivable_allocations (
  id, receivable_id, payment_id, service_payment_allocation_id, human_code, allocated_amount, allocated_at, created_at, created_by
)
select
  '74000000-0000-4000-8000-000000000001'::uuid,
  '73000000-0000-4000-8000-000000000002'::uuid,
  '72000000-0000-4000-8000-000000000003'::uuid,
  allocation.id,
  'RCP-000001',
  90,
  '2026-01-16 09:20:00+00'::timestamptz,
  '2026-01-16 09:20:00+00'::timestamptz,
  '20000000-0000-4000-8000-000000000002'::uuid
from public.service_payment_allocations allocation
where allocation.payment_id = '72000000-0000-4000-8000-000000000003'
on conflict (id) do nothing;

insert into public.cash_movements (
  id, human_code, cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, remittance_id, cash_count_id, original_movement_id, source_type, source_id, idempotency_key, description, metadata, created_at, created_by, actor_driver_id
)
values
  ('a2000000-0000-4000-8000-000000000001', 'CASH-000001', '54000000-0000-4000-8000-000000000001', 'inflow', 'service_payment', 200, 'EUR', '2026-01-11 09:15:00+00', '60000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000001', null, null, null, 'service_payment', '72000000-0000-4000-8000-000000000001', 'qa-cash-service-payment-001', 'Cash collected into central account.', '{}'::jsonb, '2026-01-11 09:15:00+00', '20000000-0000-4000-8000-000000000002', null),
  ('a2000000-0000-4000-8000-000000000002', 'CASH-000002', '54000000-0000-4000-8000-000000000002', 'inflow', 'service_payment', 150, 'EUR', '2026-01-15 10:05:00+00', '60000000-0000-4000-8000-000000000007', '72000000-0000-4000-8000-000000000002', null, null, null, 'service_payment', '72000000-0000-4000-8000-000000000002', 'qa-cash-service-payment-002', 'Driver A cash collection.', '{}'::jsonb, '2026-01-15 10:05:00+00', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000005', 'CASH-000005', '54000000-0000-4000-8000-000000000001', 'inflow', 'service_payment', 90, 'EUR', '2026-01-16 09:25:00+00', '60000000-0000-4000-8000-000000000008', '72000000-0000-4000-8000-000000000003', null, null, null, 'service_payment', '72000000-0000-4000-8000-000000000003', 'qa-cash-service-payment-003', 'CxC collection into central account.', '{}'::jsonb, '2026-01-16 09:25:00+00', '20000000-0000-4000-8000-000000000002', null)
on conflict (id) do nothing;

insert into public.cash_remittances (
  id, human_code, source_cash_account_id, destination_cash_account_id, driver_id, status, declared_amount, verified_amount, currency_code, notes, created_at, created_by
)
values
  ('a0000000-0000-4000-8000-000000000001', 'REM-000001', '54000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'draft', 150, null, 'EUR', 'QA Driver A remittance from collected service cash.', '2026-01-15 10:10:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.cash_remittance_items (
  id, remittance_id, cash_movement_id, service_payment_id, service_id, amount, description, created_at, created_by
)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000007', 150, 'Driver A collected service payment.', '2026-01-15 10:12:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

update public.cash_remittances
set status = 'prepared',
    prepared_at = '2026-01-15 10:15:00+00',
    prepared_by_user_id = '20000000-0000-4000-8000-000000000002',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id = 'a0000000-0000-4000-8000-000000000001'
  and status = 'draft';

update public.cash_remittances
set status = 'submitted',
    submitted_at = '2026-01-15 10:20:00+00',
    submitted_by_driver_id = '40000000-0000-4000-8000-000000000001',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id = 'a0000000-0000-4000-8000-000000000001'
  and status = 'prepared';

update public.cash_remittances
set status = 'received',
    received_at = '2026-01-15 10:30:00+00',
    received_by_user_id = '20000000-0000-4000-8000-000000000002',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id = 'a0000000-0000-4000-8000-000000000001'
  and status = 'submitted';

update public.cash_remittances
set status = 'verified',
    verified_at = '2026-01-15 10:35:00+00',
    verified_by_user_id = '20000000-0000-4000-8000-000000000002',
    verified_amount = 150,
    updated_by = '20000000-0000-4000-8000-000000000002'
where id = 'a0000000-0000-4000-8000-000000000001'
  and status = 'received';

insert into public.cash_movements (
  id, human_code, cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, remittance_id, cash_count_id, original_movement_id, source_type, source_id, idempotency_key, description, metadata, created_at, created_by, actor_driver_id
)
values
  ('a2000000-0000-4000-8000-000000000003', 'CASH-000003', '54000000-0000-4000-8000-000000000002', 'outflow', 'remittance_sent', 150, 'EUR', '2026-01-15 10:40:00+00', null, null, 'a0000000-0000-4000-8000-000000000001', null, null, 'cash_remittance', 'a0000000-0000-4000-8000-000000000001', 'qa-cash-remittance-sent-001', 'Driver A remitted cash to central account.', '{}'::jsonb, '2026-01-15 10:40:00+00', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000004', 'CASH-000004', '54000000-0000-4000-8000-000000000001', 'inflow', 'remittance_received', 150, 'EUR', '2026-01-15 10:40:00+00', null, null, 'a0000000-0000-4000-8000-000000000001', null, null, 'cash_remittance', 'a0000000-0000-4000-8000-000000000001', 'qa-cash-remittance-received-001', 'Central account received Driver A remittance.', '{}'::jsonb, '2026-01-15 10:40:00+00', '20000000-0000-4000-8000-000000000002', null)
on conflict (id) do nothing;

insert into public.suppliers (
  id, human_code, supplier_type, person_id, company_id, display_name, tax_id, email, phone, address, status, created_at, notes, created_by
)
values
  ('33000000-0000-4000-8000-000000000001', 'SUP-0001', 'company', null, '30000000-0000-4000-8000-000000000003', 'QA Taller', 'QA-SUP-0001', 'qa-supplier@example.invalid', '+34000000203', 'Calle QA 3, Madrid', 'active', '2026-01-06 09:00:00+00', 'Local QA supplier for expenses.', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.expenses (
  id, human_code, category_id, supplier_id, service_id, vehicle_id, driver_id, expense_date, description, currency_code, subtotal_amount, tax_rate, tax_amount, total_amount, paid_amount, pending_amount, status, payment_status, payment_responsibility, reimbursable, reimbursement_status, approved_at, approved_by, notes, internal_notes, created_at, created_by
)
select
  '80000000-0000-4000-8000-000000000001'::uuid, 'EXP-000001', category.id, '33000000-0000-4000-8000-000000000001'::uuid, null::uuid, '51000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, '2026-01-14'::date, 'QA mantenimiento Vehicle A pendiente de pago', 'EUR', 60, 0, 0, 60, 0, 60, 'draft', 'unpaid', 'elara', false, 'not_applicable', null::timestamptz, null::uuid, 'QA expense unpaid.', 'Will be approved and remain unpaid.', '2026-01-14 11:00:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.expense_categories category
where category.key = 'maintenance'
union all
select
  '80000000-0000-4000-8000-000000000002'::uuid, 'EXP-000002', category.id, '33000000-0000-4000-8000-000000000001'::uuid, '60000000-0000-4000-8000-000000000004'::uuid, null::uuid, null::uuid, '2026-01-11'::date, 'QA parking servicio pagado', 'EUR', 20, 0, 0, 20, 0, 20, 'draft', 'unpaid', 'elara', false, 'not_applicable', null::timestamptz, null::uuid, 'QA paid expense.', 'Will be approved and paid.', '2026-01-11 11:00:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.expense_categories category
where category.key = 'parking'
on conflict (id) do nothing;

insert into public.expenses (
  id, human_code, category_id, supplier_id, service_id, vehicle_id, driver_id, expense_date, description, currency_code, subtotal_amount, tax_rate, tax_amount, total_amount, paid_amount, pending_amount, status, payment_status, payment_responsibility, advanced_by_driver_id, reimbursable, reimbursement_status, approved_at, approved_by, notes, internal_notes, created_at, created_by
)
select
  '80000000-0000-4000-8000-000000000003'::uuid, 'EXP-000003', category.id, null::uuid, null::uuid, null::uuid, null::uuid, '2026-01-18'::date, 'QA Driver A adelanto pendiente de reembolso', 'EUR', 60, 0, 0, 60, 0, 60, 'draft', 'unpaid', 'driver_advance', '40000000-0000-4000-8000-000000000001'::uuid, true, 'pending', null::timestamptz, null::uuid, 'QA driver expense advance pending reimbursement.', 'QA internal note for admin only.', '2026-01-18 09:00:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.expense_categories category
where category.key = 'driver_allowance'
union all
select
  '80000000-0000-4000-8000-000000000004'::uuid, 'EXP-000004', category.id, null::uuid, null::uuid, null::uuid, null::uuid, '2026-01-18'::date, 'QA Driver B adelanto reembolsado', 'EUR', 80, 0, 0, 80, 0, 80, 'draft', 'unpaid', 'driver_advance', '40000000-0000-4000-8000-000000000002'::uuid, true, 'pending', null::timestamptz, null::uuid, 'QA driver expense advance reimbursed.', 'QA internal note for admin only.', '2026-01-18 09:10:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.expense_categories category
where category.key = 'fuel'
on conflict (id) do nothing;

insert into public.expense_allocations (
  id, expense_id, allocation_type, service_id, vehicle_id, driver_id, allocated_amount, percentage, description, created_at, created_by
)
values
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'vehicle', null, '51000000-0000-4000-8000-000000000001', null, 60, 100, 'Vehicle A QA maintenance allocation.', '2026-01-14 11:05:00+00', '20000000-0000-4000-8000-000000000002'),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'service', '60000000-0000-4000-8000-000000000004', null, null, 20, 100, 'Service QA parking allocation.', '2026-01-11 11:05:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
update public.expenses
set status = 'submitted',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id in (
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000004'
  )
  and status = 'draft';

update public.expenses
set status = 'approved',
    approved_at = case
      when id = '80000000-0000-4000-8000-000000000001' then '2026-01-14 12:00:00+00'::timestamptz
      when id = '80000000-0000-4000-8000-000000000002' then '2026-01-11 12:00:00+00'::timestamptz
      when id = '80000000-0000-4000-8000-000000000003' then '2026-01-18 09:30:00+00'::timestamptz
      else '2026-01-18 09:40:00+00'::timestamptz
    end,
    approved_by = '20000000-0000-4000-8000-000000000002',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id in (
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000004'
  )
  and status = 'submitted';


insert into public.expense_reimbursements (
  id, human_code, expense_id, reimbursed_user_id, reimbursed_driver_id, payment_method, status, amount, currency_code, cash_account_id, reimbursed_at, external_reference, notes, created_at, created_by
)
values
  ('83000000-0000-4000-8000-000000000001', 'EXPRMB-000001', '80000000-0000-4000-8000-000000000004', null, '40000000-0000-4000-8000-000000000002', 'bank_transfer', 'completed', 80, 'EUR', null, '2026-01-18 10:00:00+00', 'QA-EXP-RMB-001', 'QA Driver B expense reimbursement completed.', '2026-01-18 10:00:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.expense_payments (
  id, human_code, expense_id, payment_method, payment_status, amount, currency_code, cash_account_id, paid_at, registered_at, external_reference, notes, created_at, created_by
)
values
  ('82000000-0000-4000-8000-000000000001', 'EXPPAY-000001', '80000000-0000-4000-8000-000000000002', 'cash', 'completed', 20, 'EUR', '54000000-0000-4000-8000-000000000001', '2026-01-11 12:10:00+00', '2026-01-11 12:10:00+00', 'QA-EXP-PAY-001', 'QA paid expense payment.', '2026-01-11 12:10:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.cash_movements (
  id, human_code, cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, remittance_id, cash_count_id, original_movement_id, source_type, source_id, idempotency_key, description, metadata, created_at, created_by, actor_driver_id
)
values
  ('a2000000-0000-4000-8000-000000000006', 'CASH-000006', '54000000-0000-4000-8000-000000000001', 'outflow', 'other', 20, 'EUR', '2026-01-11 12:15:00+00', null, null, null, null, null, 'expense_payment', '82000000-0000-4000-8000-000000000001', 'qa-cash-expense-payment-001', 'Cash paid for QA parking expense.', '{"expense_id":"80000000-0000-4000-8000-000000000002"}'::jsonb, '2026-01-11 12:15:00+00', '20000000-0000-4000-8000-000000000002', null)
on conflict (id) do nothing;

insert into public.settlements (
  id, human_code, driver_id, settlement_rule_id, driver_type_snapshot, frequency_snapshot, calculation_method_snapshot, period_start, period_end, currency_code, gross_eligible_amount, expense_deduction_amount, adjustment_amount, calculation_base_amount, driver_percentage, elara_percentage, driver_amount, elara_amount, paid_amount, pending_amount, status, payment_status, generated_at, submitted_at, approved_at, approved_by, notes, internal_notes, created_at, created_by
)
select
  '90000000-0000-4000-8000-000000000001'::uuid, 'SET-000001', '40000000-0000-4000-8000-000000000001'::uuid, rule.id, rule.driver_type, rule.frequency, rule.calculation_method, '2026-01-01'::date, '2026-01-31'::date, rule.currency_code, 0, 0, 0, 0, rule.driver_percentage, rule.elara_percentage, 0, 0, 0, 0, 'draft', 'unpaid', null::timestamptz, null::timestamptz, null::timestamptz, null::uuid, 'QA Driver A internal monthly settlement.', 'Expected unpaid generated settlement.', '2026-01-31 10:00:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.settlement_rules rule
where rule.driver_type = 'internal_driver' and rule.frequency = 'monthly' and rule.effective_from = date '2026-01-01'
union all
select
  '90000000-0000-4000-8000-000000000002'::uuid, 'SET-000002', '40000000-0000-4000-8000-000000000002'::uuid, rule.id, rule.driver_type, rule.frequency, rule.calculation_method, '2026-01-10'::date, '2026-01-16'::date, rule.currency_code, 0, 0, 0, 0, rule.driver_percentage, rule.elara_percentage, 0, 0, 0, 0, 'draft', 'unpaid', null::timestamptz, null::timestamptz, null::timestamptz, null::uuid, 'QA Driver B external weekly settlement.', 'Expected approved and paid settlement.', '2026-01-17 13:00:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.settlement_rules rule
where rule.driver_type = 'external_collaborator' and rule.frequency = 'weekly' and rule.effective_from = date '2026-01-01'
on conflict (id) do nothing;

insert into public.settlement_items (
  id, settlement_id, item_type, service_id, service_assignment_id, service_financial_id, expense_id, source_reference, description, occurred_on, gross_amount, deduction_amount, adjustment_amount, eligible_amount, driver_percentage_snapshot, elara_percentage_snapshot, driver_amount_snapshot, elara_amount_snapshot, snapshot_data, created_at, created_by
)
values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'service_income', '60000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'SRV-000003', 'Driver A service income QA open CxC', '2026-01-10', 120, 0, 0, 120, 35, 65, 42, 78, '{"service_human_code":"SRV-000003"}'::jsonb, '2026-01-31 10:05:00+00', '20000000-0000-4000-8000-000000000002'),
  ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'service_income', '60000000-0000-4000-8000-000000000007', '61000000-0000-4000-8000-000000000008', '70000000-0000-4000-8000-000000000007', null, 'SRV-000007', 'Driver A service income QA paid/remitted', '2026-01-15', 150, 0, 0, 150, 35, 65, 52.50, 97.50, '{"service_human_code":"SRV-000007"}'::jsonb, '2026-01-31 10:05:00+00', '20000000-0000-4000-8000-000000000002'),
  ('91000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'service_income', '60000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004', null, 'SRV-000004', 'Driver B service income QA paid', '2026-01-11', 200, 0, 0, 200, 90, 10, 180, 20, '{"service_human_code":"SRV-000004"}'::jsonb, '2026-01-11 13:05:00+00', '20000000-0000-4000-8000-000000000002'),
  ('91000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', 'service_income', '60000000-0000-4000-8000-000000000008', '61000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-000000000008', null, 'SRV-000008', 'Driver B service income QA CxC paid', '2026-01-16', 90, 0, 0, 90, 90, 10, 81, 9, '{"service_human_code":"SRV-000008"}'::jsonb, '2026-01-17 13:05:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

update public.settlements
set status = 'generated',
    generated_at = case
      when id = '90000000-0000-4000-8000-000000000001' then '2026-01-31 10:15:00+00'::timestamptz
      else '2026-01-17 13:15:00+00'::timestamptz
    end,
    updated_by = '20000000-0000-4000-8000-000000000002'
where id in ('90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002')
  and status = 'draft';

update public.settlements
set status = 'submitted',
    submitted_at = '2026-01-17 13:20:00+00',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id = '90000000-0000-4000-8000-000000000002'
  and status = 'generated';

update public.settlements
set status = 'approved',
    approved_at = '2026-01-17 13:25:00+00',
    approved_by = '20000000-0000-4000-8000-000000000002',
    updated_by = '20000000-0000-4000-8000-000000000002'
where id = '90000000-0000-4000-8000-000000000002'
  and status = 'submitted';

insert into public.settlement_payments (
  id, human_code, settlement_id, payment_method, payment_status, amount, currency_code, cash_account_id, paid_at, registered_at, external_reference, notes, created_at, created_by
)
values
  ('92000000-0000-4000-8000-000000000001', 'SETPAY-000001', '90000000-0000-4000-8000-000000000002', 'cash', 'completed', 261, 'EUR', '54000000-0000-4000-8000-000000000001', '2026-01-17 13:30:00+00', '2026-01-17 13:30:00+00', 'QA-SET-PAY-001', 'QA Driver B settlement paid in cash.', '2026-01-17 13:30:00+00', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.cash_movements (
  id, human_code, cash_account_id, movement_type, movement_category, amount, currency_code, occurred_at, service_id, service_payment_id, remittance_id, cash_count_id, original_movement_id, source_type, source_id, idempotency_key, description, metadata, created_at, created_by, actor_driver_id
)
values
  ('a2000000-0000-4000-8000-000000000007', 'CASH-000007', '54000000-0000-4000-8000-000000000001', 'outflow', 'other', 261, 'EUR', '2026-01-17 13:35:00+00', null, null, null, null, null, 'settlement_payment', '92000000-0000-4000-8000-000000000001', 'qa-cash-settlement-payment-001', 'Cash paid for QA Driver B settlement.', '{"settlement_id":"90000000-0000-4000-8000-000000000002"}'::jsonb, '2026-01-17 13:35:00+00', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.incidents (
  id, human_code, category_id, title, description, severity, status, source, service_id, driver_id, vehicle_id, customer_id, app_user_id, service_payment_id, cash_movement_id, receivable_id, expense_id, settlement_id, reported_at, reported_by_user_id, reported_by_driver_id, assigned_to_user_id, acknowledged_at, acknowledged_by, resolved_at, resolved_by, cancelled_at, cancelled_by, resolution_summary, internal_notes, created_at, created_by
)
select
  'b0000000-0000-4000-8000-000000000001'::uuid, 'INC-000001', category.id, 'QA demora Driver A', 'Incidencia local vinculada a Driver A y su servicio completado.', 'medium', 'open', 'driver_portal', '60000000-0000-4000-8000-000000000007'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '2026-01-15 10:20:00+00'::timestamptz, null::uuid, '40000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, null::timestamptz, null::uuid, null::timestamptz, null::uuid, null::timestamptz, null::uuid, null::text, 'QA Driver A incident.', '2026-01-15 10:20:00+00'::timestamptz, null::uuid
from public.incident_categories category
where category.key = 'service_delay'
union all
select
  'b0000000-0000-4000-8000-000000000002'::uuid, 'INC-000002', category.id, 'QA comentario cliente Driver B', 'Incidencia local vinculada a Driver B y cliente empresa.', 'medium', 'open', 'customer', '60000000-0000-4000-8000-000000000004'::uuid, '40000000-0000-4000-8000-000000000002'::uuid, null::uuid, '31000000-0000-4000-8000-000000000002'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '2026-01-11 09:30:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid, null::uuid, '20000000-0000-4000-8000-000000000002'::uuid, null::timestamptz, null::uuid, null::timestamptz, null::uuid, null::timestamptz, null::uuid, null::text, 'QA Driver B incident.', '2026-01-11 09:30:00+00'::timestamptz, '20000000-0000-4000-8000-000000000002'::uuid
from public.incident_categories category
where category.key = 'customer_complaint'
on conflict (id) do nothing;

insert into public.incident_comments (
  id, incident_id, comment_type, content, author_user_id, author_driver_id, is_private, created_at
)
values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'driver', 'Comentario publico QA de Driver A.', null, '40000000-0000-4000-8000-000000000001', false, '2026-01-15 10:25:00+00'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'internal', 'Nota privada administrativa QA.', '20000000-0000-4000-8000-000000000002', null, true, '2026-01-15 10:30:00+00'),
  ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'customer_contact', 'Cliente empresa contactado en QA.', '20000000-0000-4000-8000-000000000002', null, false, '2026-01-11 09:45:00+00')
on conflict (id) do nothing;

update public.human_code_counters as hcc
set current_value = greatest(hcc.current_value, seed.current_value),
    padding = seed.padding,
    is_active = true,
    updated_at = now()
from (
  values
    ('USR', 4, 4),
    ('CL', 2, 4),
    ('EMP', 1, 4),
    ('DRV', 2, 4),
    ('VEH', 2, 4),
    ('SUP', 1, 4),
    ('SRV', 8, 6),
    ('PAY', 3, 6),
    ('CASH', 7, 6),
    ('REM', 1, 6),
    ('REC', 2, 6),
    ('RCP', 1, 6),
    ('EXP', 4, 6),
    ('EXPPAY', 1, 6),
    ('EXPRMB', 1, 6),
    ('SET', 2, 6),
    ('SETPAY', 1, 6),
    ('INC', 2, 6)
) as seed(prefix, current_value, padding)
where hcc.prefix = seed.prefix;

commit;
