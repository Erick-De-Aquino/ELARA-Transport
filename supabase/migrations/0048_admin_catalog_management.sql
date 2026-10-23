-- Minimal administrative catalog contracts. No frontend, Auth provisioning or financial writes.
-- Person lifecycle remains separate: 0004 requires an active person even for an inactive relation.
-- Physical document upload remains outside minimum operational-test path.
-- vehicle_is_assignable is unchanged; read-only expiry prevalidation is still required.
begin;

do $prerequisites$
declare v_table text; v_columns text[]; v_column text;
begin
 if has_schema_privilege('authenticated','public','create') or has_schema_privilege('anon','public','create')
  or has_schema_privilege('authenticated','extensions','create') or has_schema_privilege('anon','extensions','create') then
  raise exception 'Catalog search_path requires schemas without API CREATE privilege.';
 end if;
 for v_table,v_columns in select * from (values
  ('persons',array['id','first_name','last_name','phone','contact_email','notes','status','created_by','updated_by']),
  ('customers',array['id','human_code','customer_type','person_id','company_id','status','internal_notes','inactive_at','inactive_by','updated_by']),
  ('drivers',array['id','human_code','person_id','driver_type','administrative_status','availability_preference','license_expiration','observations','inactive_at','status_changed_by']),
  ('vehicles',array['id','human_code','plate_original','plate_normalized','plate_country','brand','model','ownership_type','external_owner_id','manual_operational_status','elara_approval_status','inactive_at','inactive_by']),
  ('vehicle_document_types',array['key','is_active','required_for_owned','required_for_external','expires_required']),
  ('vehicle_documents',array['id','vehicle_id','document_type_key','status','issued_at','expires_at','reference_number','storage_bucket','storage_path','replaced_at','replaced_by_document_id','validated_at','validated_by']),
  ('driver_vehicle_assignments',array['id','driver_id','vehicle_id','status','started_at','ended_at','end_reason','notes','ended_by']),
  ('audit_logs',array['request_id','actor_app_user_id','auth_session_id','metadata','old_data','new_data'])
 ) as required(table_name,column_names) loop
  foreach v_column in array v_columns loop
   if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_table and c.column_name=v_column) then
    raise exception 'Missing catalog prerequisite %.%',v_table,v_column;
   end if;
  end loop;
 end loop;
end $prerequisites$;

-- Receipts use the existing append-only audit infrastructure, not a second journal.
-- One receipt per actor/request across operations; child events have no request_id.
create unique index audit_logs_catalog_request_unique
on public.audit_logs(actor_app_user_id, request_id)
where request_id is not null and metadata->>'catalog_contract' = '0048';

create or replace function elara_private.catalog_request(p_operation text, p_request uuid, p_arguments jsonb)
returns jsonb language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_receipt public.audit_logs%rowtype; v_hash text;
begin
 v_actor := public.require_admin_user();
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Catalog request replay requires READ COMMITTED.' using errcode='0A000';
 end if;
 if p_request is null then raise exception 'request_id is required.' using errcode='22023'; end if;
 -- Same actor/request is serialized across operations, preventing cross-operation reuse.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('0048/request/'||v_actor::text||'/'||p_request::text,0));
 v_hash := encode(extensions.digest(p_arguments::text,'sha256'),'hex');
 select * into v_receipt from public.audit_logs
 where actor_app_user_id=v_actor and request_id=p_request and metadata->>'catalog_contract'='0048';
 if found then
  if v_receipt.metadata->>'operation' is distinct from p_operation
   or v_receipt.metadata->>'fingerprint' is distinct from v_hash then
   raise exception 'request_id already used with a different operation or arguments.' using errcode='23505';
  end if;
  return v_receipt.metadata->'result';
 end if;
 return null;
end $$;

-- Private extension of the existing audit writer: same table, sanitizers, actor/session
-- derivation and prepare_audit_log trigger, plus the dedicated immutable request_id.
-- No old helper signature is changed, and no append-only row is subsequently updated.
create or replace function elara_private.catalog_audit(
 p_operation text,p_action text,p_table text,p_id uuid,p_code text,
 p_old jsonb,p_new jsonb,p_reason text,p_request uuid default null,
 p_arguments jsonb default null,p_result jsonb default null)
returns void language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_metadata jsonb;
begin
 v_actor := public.require_admin_user();
 v_metadata := jsonb_build_object('operation',p_operation,'catalog_contract','0048');
 if p_request is not null then
  if p_arguments is null or p_result is null then raise exception 'Incomplete catalog receipt.' using errcode='23514'; end if;
  v_metadata := v_metadata || jsonb_build_object('request_id',p_request,
   'fingerprint',encode(extensions.digest(p_arguments::text,'sha256'),'hex'),'result',p_result);
 end if;
 insert into public.audit_logs(event_source,action,entity_table,entity_id,entity_human_code,
  actor_auth_user_id,actor_app_user_id,auth_session_id,active_context,request_id,
  old_data,new_data,reason,metadata)
 values('secure_function',p_action,p_table,p_id,p_code,auth.uid(),v_actor,
  public.current_auth_session_id(),public.current_active_context(),p_request,
  public.sanitize_audit_json(p_old),public.sanitize_audit_json(p_new),p_reason,public.sanitize_audit_json(v_metadata));
end $$;

create or replace function elara_private.catalog_person(
 p_first text,p_last text,p_phone text,p_email text,p_notes text)
returns uuid language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_id uuid; v_actor uuid;
begin
 v_actor:=public.require_admin_user();
 if p_first is null or p_last is null then raise exception 'First and last name are required.' using errcode='23514'; end if;
 -- All 0048 identity creators acquire contact locks in a fixed order.
 if p_email is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('0048/email/'||p_email,0)); end if;
 if p_phone is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('0048/phone/'||p_phone,0)); end if;
 if exists(select 1 from public.persons p where
  (p_email is not null and lower(trim(p.contact_email))=p_email) or
  (p_phone is not null and trim(p.phone)=p_phone and lower(trim(p.first_name))=lower(p_first) and lower(trim(p.last_name))=lower(p_last))) then
  raise exception 'An evident person duplicate requires administrative review.' using errcode='23505';
 end if;
 insert into public.persons(first_name,last_name,phone,contact_email,notes,status,created_by,updated_by)
 values(p_first,p_last,p_phone,p_email,p_notes,'active',v_actor,v_actor) returning id into v_id;
 perform elara_private.catalog_audit('admin_person_created','insert','persons',v_id,null,null,
  jsonb_build_object('id',v_id,'status','active'),null);
 return v_id;
end $$;

create or replace function public.admin_create_individual_customer(
 p_request_id uuid,p_first_name text,p_last_name text,p_phone text default null,p_email text default null,
 p_notes text default null,p_internal_notes text default null)
returns table(person_id uuid,customer_id uuid,customer_human_code text,status text)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_args jsonb; v_result jsonb; v_person uuid; v_customer public.customers%rowtype;
begin
 v_actor:=public.require_admin_user();
 v_args:=jsonb_build_object('first',nullif(trim(p_first_name),''),'last',nullif(trim(p_last_name),''),
  'phone',nullif(trim(p_phone),''),'email',nullif(lower(trim(p_email)),''),
  'notes',nullif(trim(p_notes),''),'internal_notes',nullif(trim(p_internal_notes),''));
 v_result:=elara_private.catalog_request('admin_customer_created',p_request_id,v_args);
 if v_result is null then
  v_person:=elara_private.catalog_person(v_args->>'first',v_args->>'last',v_args->>'phone',v_args->>'email',v_args->>'notes');
  insert into public.customers(customer_type,person_id,status,internal_notes,created_by,updated_by)
  values('individual',v_person,'new',v_args->>'internal_notes',v_actor,v_actor) returning * into v_customer;
  v_result:=jsonb_build_object('person_id',v_person,'customer_id',v_customer.id,'customer_human_code',v_customer.human_code,'status',v_customer.status);
  perform elara_private.catalog_audit('admin_customer_created','insert','customers',v_customer.id,v_customer.human_code,
   null,jsonb_build_object('person_id',v_person,'status',v_customer.status),null,p_request_id,v_args,v_result);
 end if;
 return query select (v_result->>'person_id')::uuid,(v_result->>'customer_id')::uuid,v_result->>'customer_human_code',v_result->>'status';
end $$;

create or replace function public.admin_set_customer_status(p_customer_id uuid,p_status text,p_reason text)
returns table(customer_id uuid,status text,inactive_at timestamptz)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_old public.customers%rowtype; v_new public.customers%rowtype; v_status text:=lower(trim(p_status));
begin
 v_actor:=public.require_admin_user();
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'This operation requires READ COMMITTED transaction isolation.' using errcode='0A000';
 end if;
 -- Existing create_service does not participate in catalog advisory locks.
 -- A short SHARE table lock fences all service writers, including old RPCs.
 -- Acquire before parent row locks; never cancel/update a service here.
 lock table public.services in share mode;
 select * into v_old from public.customers where id=p_customer_id for update;
 if not found then raise exception 'Customer not found.' using errcode='23503'; end if;
 if v_old.customer_type<>'individual' then raise exception 'Only individual customer lifecycle is supported.' using errcode='0A000'; end if;
 if v_status is null or v_status not in ('new','active','inactive') or v_old.status='blocked' then raise exception 'Unsupported customer status transition.' using errcode='23514'; end if;
 if v_old.status=v_status then return query select v_old.id,v_old.status,v_old.inactive_at; return; end if;
 if v_status='new' then raise exception 'Cannot return an existing customer to new.' using errcode='23514'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reason is required.' using errcode='23514'; end if;
 if v_status='inactive' and exists(select 1 from public.services s where s.customer_id=p_customer_id
  and s.operational_status not in ('completed','cancelled','no_show','not_performed')) then
  raise exception 'Customer has nonterminal services.' using errcode='23514';
 end if;
 if v_old.person_id is not null and not exists(select 1 from public.persons p where p.id=v_old.person_id and p.status='active') then
  raise exception 'Customer requires an active person.' using errcode='23514';
 end if;
 update public.customers c set status=v_status,inactive_at=case when v_status='inactive' then clock_timestamp() end,
  inactive_by=case when v_status='inactive' then v_actor end,updated_by=v_actor where c.id=p_customer_id returning * into v_new;
 perform elara_private.catalog_audit('admin_customer_status_changed','status_change','customers',v_new.id,v_new.human_code,
  jsonb_build_object('status',v_old.status),jsonb_build_object('status',v_new.status,'inactive_at',v_new.inactive_at),trim(p_reason));
 return query select v_new.id,v_new.status,v_new.inactive_at;
end $$;

create or replace function public.admin_create_driver(
 p_request_id uuid,p_first_name text,p_last_name text,p_driver_type text,p_phone text default null,p_email text default null,
 p_license_expiration date default null,p_observations text default null,p_administrative_status text default 'active')
returns table(person_id uuid,driver_id uuid,driver_human_code text,administrative_status text,availability_preference text)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_args jsonb; v_result jsonb; v_person uuid; v_driver public.drivers%rowtype;
begin
 v_actor:=public.require_admin_user();
 v_args:=jsonb_build_object('first',nullif(trim(p_first_name),''),'last',nullif(trim(p_last_name),''),
  'phone',nullif(trim(p_phone),''),'email',nullif(lower(trim(p_email)),''),'type',lower(trim(p_driver_type)),
  'license',p_license_expiration,'observations',nullif(trim(p_observations),''),'status',lower(trim(p_administrative_status)));
 v_result:=elara_private.catalog_request('admin_driver_created',p_request_id,v_args);
 if v_result is null then
  if v_args->>'type' is null or v_args->>'type' not in ('internal_driver','external_collaborator')
   or v_args->>'status' is distinct from 'active' then raise exception 'Invalid initial driver type/status.' using errcode='23514'; end if;
  if p_license_expiration<current_date then raise exception 'License has expired.' using errcode='23514'; end if;
  v_person:=elara_private.catalog_person(v_args->>'first',v_args->>'last',v_args->>'phone',v_args->>'email',v_args->>'observations');
  insert into public.drivers(person_id,driver_type,administrative_status,availability_preference,license_expiration,observations,created_by,updated_by,status_changed_by)
  values(v_person,v_args->>'type','active','unavailable',p_license_expiration,v_args->>'observations',v_actor,v_actor,v_actor) returning * into v_driver;
  v_result:=jsonb_build_object('person_id',v_person,'driver_id',v_driver.id,'driver_human_code',v_driver.human_code,
   'administrative_status',v_driver.administrative_status,'availability_preference',v_driver.availability_preference);
  perform elara_private.catalog_audit('admin_driver_created','insert','drivers',v_driver.id,v_driver.human_code,null,
   jsonb_build_object('person_id',v_person,'driver_type',v_driver.driver_type,'administrative_status',v_driver.administrative_status),null,p_request_id,v_args,v_result);
 end if;
 return query select (v_result->>'person_id')::uuid,(v_result->>'driver_id')::uuid,v_result->>'driver_human_code',v_result->>'administrative_status',v_result->>'availability_preference';
end $$;

create or replace function public.admin_update_driver(p_driver_id uuid,p_reason text,p_administrative_status text default null,
 p_license_expiration date default null,p_observations text default null)
returns table(driver_id uuid,administrative_status text,inactive_at timestamptz)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_old public.drivers%rowtype; v_new public.drivers%rowtype; v_status text; v_license date; v_notes text;
begin
 v_actor:=public.require_admin_user();
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'This operation requires READ COMMITTED transaction isolation.' using errcode='0A000';
 end if;
 lock table public.service_assignments in share mode;
 select * into v_old from public.drivers where id=p_driver_id for update;
 if not found then raise exception 'Driver not found.' using errcode='23503'; end if;
 v_status:=coalesce(lower(trim(p_administrative_status)),v_old.administrative_status);
 v_license:=coalesce(p_license_expiration,v_old.license_expiration); v_notes:=coalesce(trim(p_observations),v_old.observations);
 if v_old.administrative_status='suspended' or v_status not in ('active','pending_documents','inactive') then raise exception 'Unsupported driver status.' using errcode='23514'; end if;
 if v_status='active' and v_license<current_date then raise exception 'License has expired.' using errcode='23514'; end if;
 if not exists(select 1 from public.persons p where p.id=v_old.person_id and p.status='active') then raise exception 'Driver requires an active person.' using errcode='23514'; end if;
 if v_status=v_old.administrative_status and v_license is not distinct from v_old.license_expiration and v_notes is not distinct from v_old.observations then
  return query select v_old.id,v_old.administrative_status,v_old.inactive_at; return;
 end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reason is required.' using errcode='23514'; end if;
 if v_status<>'active' and (
  exists(select 1 from public.driver_vehicle_assignments a where a.driver_id=p_driver_id and a.status='active') or
  exists(select 1 from public.user_driver_links a where a.driver_id=p_driver_id and a.status='active') or
  exists(select 1 from public.service_assignments a where a.driver_id=p_driver_id and a.assignment_status in ('pending_acceptance','accepted','reassignment_required') and a.ended_at is null)) then
  raise exception 'Driver has an active link or service assignment.' using errcode='23514';
 end if;
 update public.drivers d set administrative_status=v_status,license_expiration=v_license,observations=v_notes,
  inactive_at=case when v_status='inactive' then coalesce(d.inactive_at,clock_timestamp()) end,
  availability_preference=case when v_status<>'active' then 'unavailable' else d.availability_preference end,
  updated_by=v_actor,status_changed_by=case when v_status<>v_old.administrative_status then v_actor else d.status_changed_by end
 where d.id=p_driver_id returning * into v_new;
 perform elara_private.catalog_audit('admin_driver_updated',case when v_status<>v_old.administrative_status then 'status_change' else 'update' end,
  'drivers',v_new.id,v_new.human_code,jsonb_build_object('administrative_status',v_old.administrative_status,'license_expiration',v_old.license_expiration),
  jsonb_build_object('administrative_status',v_new.administrative_status,'license_expiration',v_new.license_expiration,'observations_changed',v_notes is distinct from v_old.observations),trim(p_reason));
 return query select v_new.id,v_new.administrative_status,v_new.inactive_at;
end $$;

create or replace function public.admin_create_vehicle(p_request_id uuid,p_plate text,p_brand text,p_model text,
 p_ownership_type text default 'owned',p_manual_status text default 'available',p_notes text default null)
returns table(vehicle_id uuid,human_code text,plate_normalized text,manual_operational_status text,elara_approval_status text,inactive_at timestamptz)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_args jsonb; v_result jsonb; v_vehicle public.vehicles%rowtype;
begin
 v_actor:=public.require_admin_user();
 v_args:=jsonb_build_object('plate',public.normalize_vehicle_plate(p_plate,'ES'),'brand',nullif(trim(p_brand),''),
  'model',nullif(trim(p_model),''),'ownership',lower(trim(p_ownership_type)),'manual_status',lower(trim(p_manual_status)),'notes',nullif(trim(p_notes),''));
 v_result:=elara_private.catalog_request('admin_vehicle_created',p_request_id,v_args);
 if v_result is null then
  if v_args->>'ownership' is distinct from 'owned' then raise exception 'Only owned vehicles are supported.' using errcode='0A000'; end if;
  if v_args->>'manual_status' is null or v_args->>'manual_status' not in ('available','unavailable')
   or v_args->>'brand' is null or v_args->>'model' is null then raise exception 'Invalid vehicle fields.' using errcode='23514'; end if;
  insert into public.vehicles(plate_original,plate_country,brand,model,ownership_type,external_owner_id,manual_operational_status,elara_approval_status,notes,created_by,updated_by)
  values(v_args->>'plate','ES',v_args->>'brand',v_args->>'model','owned',null,v_args->>'manual_status','not_required',v_args->>'notes',v_actor,v_actor) returning * into v_vehicle;
  v_result:=jsonb_build_object('vehicle_id',v_vehicle.id,'human_code',v_vehicle.human_code,'plate_normalized',v_vehicle.plate_normalized,
   'manual_operational_status',v_vehicle.manual_operational_status,'elara_approval_status',v_vehicle.elara_approval_status,'inactive_at',v_vehicle.inactive_at);
  perform elara_private.catalog_audit('admin_vehicle_created','insert','vehicles',v_vehicle.id,v_vehicle.human_code,null,
   jsonb_build_object('ownership_type','owned','manual_operational_status',v_vehicle.manual_operational_status),null,p_request_id,v_args,v_result);
 end if;
 return query select (v_result->>'vehicle_id')::uuid,v_result->>'human_code',v_result->>'plate_normalized',v_result->>'manual_operational_status',v_result->>'elara_approval_status',(v_result->>'inactive_at')::timestamptz;
end $$;

create or replace function public.admin_inactivate_vehicle(p_vehicle_id uuid,p_reason text)
returns table(vehicle_id uuid,inactive_at timestamptz,manual_operational_status text)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_old public.vehicles%rowtype; v_new public.vehicles%rowtype;
begin
 v_actor:=public.require_admin_user();
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'This operation requires READ COMMITTED transaction isolation.' using errcode='0A000';
 end if;
 lock table public.service_assignments in share mode;
 select * into v_old from public.vehicles where id=p_vehicle_id for update;
 if not found then raise exception 'Vehicle not found.' using errcode='23503'; end if;
 if v_old.inactive_at is not null then return query select v_old.id,v_old.inactive_at,v_old.manual_operational_status; return; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reason is required.' using errcode='23514'; end if;
 if exists(select 1 from public.driver_vehicle_assignments a where a.vehicle_id=p_vehicle_id and a.status='active')
  or exists(select 1 from public.service_assignments a where a.vehicle_id=p_vehicle_id and a.assignment_status in ('pending_acceptance','accepted','reassignment_required') and a.ended_at is null)
  or exists(select 1 from public.vehicle_maintenance_records m where m.vehicle_id=p_vehicle_id and m.status='in_progress')
  or exists(select 1 from public.vehicle_technical_incidents i where i.vehicle_id=p_vehicle_id and i.status='open') then
  raise exception 'Vehicle has a live link, service, maintenance or incident.' using errcode='23514';
 end if;
 update public.vehicles v set inactive_at=clock_timestamp(),inactive_by=v_actor,manual_operational_status='unavailable',updated_by=v_actor
 where v.id=p_vehicle_id returning * into v_new;
 perform elara_private.catalog_audit('admin_vehicle_inactivated','status_change','vehicles',v_new.id,v_new.human_code,
  jsonb_build_object('manual_operational_status',v_old.manual_operational_status),jsonb_build_object('inactive_at',v_new.inactive_at,'manual_operational_status','unavailable'),trim(p_reason));
 return query select v_new.id,v_new.inactive_at,v_new.manual_operational_status;
end $$;

create or replace function public.admin_register_vehicle_document(p_request_id uuid,p_vehicle_id uuid,p_document_type text,p_status text,
 p_issued_at date default null,p_expires_at date default null,p_reference_number text default null,p_notes text default null,
 p_replaces_document_id uuid default null,p_reason text default null)
returns table(document_id uuid,vehicle_id uuid,document_type_key text,status text,replaced_document_id uuid)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_args jsonb; v_result jsonb; v_vehicle public.vehicles%rowtype; v_type public.vehicle_document_types%rowtype;
 v_old public.vehicle_documents%rowtype; v_new public.vehicle_documents%rowtype; v_superseded public.vehicle_documents%rowtype;
begin
 v_actor:=public.require_admin_user();
 v_args:=jsonb_build_object('vehicle',p_vehicle_id,'type',lower(trim(p_document_type)),'status',lower(trim(p_status)),
  'issued',p_issued_at,'expires',p_expires_at,'reference',nullif(trim(p_reference_number),''),'notes',nullif(trim(p_notes),''),
  'replaces',p_replaces_document_id,'reason',nullif(trim(p_reason),''));
 v_result:=elara_private.catalog_request('admin_vehicle_document_registered',p_request_id,v_args);
 if v_result is null then
  lock table public.service_assignments in share mode;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id for update;
  if not found then raise exception 'Vehicle not found.' using errcode='23503'; end if;
  if v_vehicle.inactive_at is not null then raise exception 'Vehicle is inactive.' using errcode='23514'; end if;
  select * into v_type from public.vehicle_document_types t where t.key=v_args->>'type' for share;
  if not found then raise exception 'Document type not found.' using errcode='23503'; end if;
  if not v_type.is_active or not(case when v_vehicle.ownership_type='owned' then v_type.required_for_owned else v_type.required_for_external end)
   or v_args->>'status' is null or v_args->>'status' not in ('pending','valid','expiring_soon') then
   raise exception 'Invalid document type applicability/status.' using errcode='23514';
  end if;
  if p_issued_at is not null and p_expires_at is not null and p_issued_at>p_expires_at then raise exception 'Inverted document dates.' using errcode='23514'; end if;
  if v_args->>'status' in ('valid','expiring_soon') and ((v_type.expires_required and p_expires_at is null) or p_expires_at<current_date) then
   raise exception 'Valid document requires a nonexpired expiry where applicable.' using errcode='23514';
  end if;
  if exists(select 1 from public.driver_vehicle_assignments a where a.vehicle_id=p_vehicle_id and a.status='active')
   or exists(select 1 from public.service_assignments a where a.vehicle_id=p_vehicle_id and a.assignment_status in ('pending_acceptance','accepted','reassignment_required') and a.ended_at is null) then
   raise exception 'Close live links and services before changing documents.' using errcode='23514';
  end if;
  select * into v_old from public.vehicle_documents d where d.vehicle_id=p_vehicle_id and d.document_type_key=v_type.key
   and d.replaced_at is null and d.status not in ('replaced','annulled') for update;
  if (v_old.id is null and p_replaces_document_id is not null) or
   (v_old.id is not null and (p_replaces_document_id is distinct from v_old.id or v_args->>'reason' is null)) then
   raise exception 'Explicit current document and reason required for replacement.' using errcode='23514';
  end if;
  if v_old.id is not null then
   -- 0005 currentness requires replaced_at IS NULL. Preserve a pending document's
   -- genuinely unknown expiry/status; marking it replaced would require an invented expiry.
   update public.vehicle_documents d set
    status=case when v_old.status='pending' and v_old.expires_at is null then v_old.status else 'replaced' end,
    replaced_at=clock_timestamp(),updated_by=v_actor where d.id=v_old.id;
  end if;
  insert into public.vehicle_documents(vehicle_id,document_type_key,status,issued_at,expires_at,reference_number,notes,validated_at,validated_by,created_by,updated_by)
  values(p_vehicle_id,v_type.key,v_args->>'status',p_issued_at,p_expires_at,v_args->>'reference',v_args->>'notes',
   case when v_args->>'status'<>'pending' then clock_timestamp() end,case when v_args->>'status'<>'pending' then v_actor end,v_actor,v_actor) returning * into v_new;
  if v_old.id is not null then
   update public.vehicle_documents d set replaced_by_document_id=v_new.id where d.id=v_old.id returning * into v_superseded;
   perform elara_private.catalog_audit('admin_vehicle_document_replaced','status_change','vehicle_documents',v_old.id,null,
    jsonb_build_object('status',v_old.status,'expires_at',v_old.expires_at,'replaced_at',v_old.replaced_at,'replaced_by_document_id',v_old.replaced_by_document_id),
    jsonb_build_object('status',v_superseded.status,'expires_at',v_superseded.expires_at,'replaced_at',v_superseded.replaced_at,'replaced_by_document_id',v_superseded.replaced_by_document_id),v_args->>'reason');
  end if;
  v_result:=jsonb_build_object('document_id',v_new.id,'vehicle_id',p_vehicle_id,'document_type_key',v_type.key,'status',v_new.status,'replaced_document_id',v_old.id);
  perform elara_private.catalog_audit('admin_vehicle_document_registered','insert','vehicle_documents',v_new.id,null,null,
   jsonb_build_object('vehicle_id',p_vehicle_id,'document_type_key',v_type.key,'status',v_new.status,'expires_at',v_new.expires_at),v_args->>'reason',p_request_id,v_args,v_result);
 end if;
 return query select (v_result->>'document_id')::uuid,(v_result->>'vehicle_id')::uuid,v_result->>'document_type_key',v_result->>'status',(v_result->>'replaced_document_id')::uuid;
end $$;

create or replace function public.admin_assign_driver_vehicle(p_request_id uuid,p_driver_id uuid,p_vehicle_id uuid,
 p_started_at timestamptz default null,p_notes text default null)
returns table(assignment_id uuid,driver_id uuid,vehicle_id uuid,status text,started_at timestamptz)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_args jsonb; v_result jsonb; v_driver public.drivers%rowtype; v_vehicle public.vehicles%rowtype;
 v_link public.driver_vehicle_assignments%rowtype; v_now timestamptz;
begin
 v_actor:=public.require_admin_user();
 v_args:=jsonb_build_object('driver',p_driver_id,'vehicle',p_vehicle_id,'started',extract(epoch from p_started_at),'notes',nullif(trim(p_notes),''));
 v_result:=elara_private.catalog_request('admin_driver_vehicle_assigned',p_request_id,v_args);
 if v_result is null then
  select * into v_driver from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'Driver not found.' using errcode='23503'; end if;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id for update;
  if not found then raise exception 'Vehicle not found.' using errcode='23503'; end if;
  if v_driver.administrative_status<>'active' or v_driver.inactive_at is not null or not exists(select 1 from public.persons p where p.id=v_driver.person_id and p.status='active') then
   raise exception 'An active driver/person is required.' using errcode='23514'; end if;
  if not public.vehicle_is_assignable(p_vehicle_id) then raise exception 'Vehicle is not assignable.' using errcode='23514'; end if;
  if exists(select 1 from public.driver_vehicle_assignments a where a.status='active' and (a.driver_id=p_driver_id or a.vehicle_id=p_vehicle_id)) then
   raise exception 'Driver or vehicle already has an active link.' using errcode='23505'; end if;
  v_now:=clock_timestamp();
  if p_started_at is not null and (p_started_at>v_now or p_started_at<transaction_timestamp()) then
   raise exception 'Historical/future link creation is unsupported.' using errcode='23514'; end if;
  insert into public.driver_vehicle_assignments(driver_id,vehicle_id,status,started_at,notes,created_by)
  values(p_driver_id,p_vehicle_id,'active',coalesce(p_started_at,v_now),v_args->>'notes',v_actor) returning * into v_link;
  v_result:=jsonb_build_object('assignment_id',v_link.id,'driver_id',p_driver_id,'vehicle_id',p_vehicle_id,'status','active','started_at',v_link.started_at);
  perform elara_private.catalog_audit('admin_driver_vehicle_assigned','insert','driver_vehicle_assignments',v_link.id,null,null,
   jsonb_build_object('driver_id',p_driver_id,'vehicle_id',p_vehicle_id,'status','active'),null,p_request_id,v_args,v_result);
 end if;
 return query select (v_result->>'assignment_id')::uuid,(v_result->>'driver_id')::uuid,(v_result->>'vehicle_id')::uuid,v_result->>'status',(v_result->>'started_at')::timestamptz;
end $$;

create or replace function public.admin_close_driver_vehicle_assignment(p_assignment_id uuid,p_reason text,p_ended_at timestamptz default null)
returns table(assignment_id uuid,status text,started_at timestamptz,ended_at timestamptz)
language plpgsql volatile security definer set search_path=public,extensions as $$
declare v_actor uuid; v_old public.driver_vehicle_assignments%rowtype; v_new public.driver_vehicle_assignments%rowtype; v_end timestamptz;
begin
 v_actor:=public.require_admin_user();
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'This operation requires READ COMMITTED transaction isolation.' using errcode='0A000';
 end if;
 lock table public.service_assignments in share mode;
 -- Discover immutable parents, then lock in the same driver/vehicle/link order as creation.
 select * into v_old from public.driver_vehicle_assignments where id=p_assignment_id;
 if not found then raise exception 'Driver-vehicle link not found.' using errcode='23503'; end if;
 perform 1 from public.drivers where id=v_old.driver_id for update;
 perform 1 from public.vehicles where id=v_old.vehicle_id for update;
 select * into v_old from public.driver_vehicle_assignments where id=p_assignment_id for update;
 if v_old.status<>'active' then return query select v_old.id,v_old.status,v_old.started_at,v_old.ended_at; return; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reason is required.' using errcode='23514'; end if;
 if exists(select 1 from public.service_assignments a where a.driver_vehicle_assignment_id=p_assignment_id
  and a.assignment_status in ('pending_acceptance','accepted','reassignment_required') and a.ended_at is null) then
  raise exception 'Link has a live service assignment.' using errcode='23514'; end if;
 v_end:=coalesce(p_ended_at,clock_timestamp());
 if v_end<v_old.started_at or v_end>clock_timestamp() then raise exception 'Invalid link end time.' using errcode='23514'; end if;
 update public.driver_vehicle_assignments a set status='ended',ended_at=v_end,end_reason=trim(p_reason),ended_by=v_actor
 where a.id=p_assignment_id returning * into v_new;
 perform elara_private.catalog_audit('admin_driver_vehicle_closed','status_change','driver_vehicle_assignments',v_new.id,null,
  jsonb_build_object('status',v_old.status),jsonb_build_object('status','ended','ended_at',v_end),trim(p_reason));
 return query select v_new.id,v_new.status,v_new.started_at,v_new.ended_at;
end $$;

revoke all on function elara_private.catalog_request(text,uuid,jsonb),elara_private.catalog_audit(text,text,text,uuid,text,jsonb,jsonb,text,uuid,jsonb,jsonb),elara_private.catalog_person(text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.admin_create_individual_customer(uuid,text,text,text,text,text,text),
 public.admin_set_customer_status(uuid,text,text),public.admin_create_driver(uuid,text,text,text,text,text,date,text,text),
 public.admin_update_driver(uuid,text,text,date,text),public.admin_create_vehicle(uuid,text,text,text,text,text,text),
 public.admin_inactivate_vehicle(uuid,text),public.admin_register_vehicle_document(uuid,uuid,text,text,date,date,text,text,uuid,text),
 public.admin_assign_driver_vehicle(uuid,uuid,uuid,timestamptz,text),public.admin_close_driver_vehicle_assignment(uuid,text,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.admin_create_individual_customer(uuid,text,text,text,text,text,text),
 public.admin_set_customer_status(uuid,text,text),public.admin_create_driver(uuid,text,text,text,text,text,date,text,text),
 public.admin_update_driver(uuid,text,text,date,text),public.admin_create_vehicle(uuid,text,text,text,text,text,text),
 public.admin_inactivate_vehicle(uuid,text),public.admin_register_vehicle_document(uuid,uuid,text,text,date,date,text,text,uuid,text),
 public.admin_assign_driver_vehicle(uuid,uuid,uuid,timestamptz,text),public.admin_close_driver_vehicle_assignment(uuid,text,timestamptz)
 to authenticated;

comment on function public.admin_set_customer_status(uuid,text,text) is 'Minimal customer lifecycle. Person lifecycle is separate because 0004 requires an active person.';
comment on function public.admin_create_individual_customer(uuid,text,text,text,text,text,text) is 'Atomic individual person/customer creation with immutable actor-scoped request receipt.';
comment on function public.admin_create_driver(uuid,text,text,text,text,text,date,text,text) is 'Creates active person/driver only; no Auth, app user or portal link.';
comment on function public.admin_update_driver(uuid,text,text,date,text) is 'Minimal administrative driver lifecycle; never changes person status or Auth links.';
comment on function public.admin_create_vehicle(uuid,text,text,text,text,text,text) is 'Owned ES vehicle only; code and plate normalization use existing triggers.';
comment on function public.admin_inactivate_vehicle(uuid,text) is 'Inactivates vehicle after checking links, assignments, maintenance and incidents.';
comment on function public.admin_register_vehicle_document(uuid,uuid,text,text,date,date,text,text,uuid,text) is 'Metadata-only registration/replacement. Physical upload outside minimum path; existing assignability expiry debt unchanged.';
comment on function public.admin_assign_driver_vehicle(uuid,uuid,uuid,timestamptz,text) is 'Creates one active driver/vehicle link with parent row locks and unique constraints.';
comment on function public.admin_close_driver_vehicle_assignment(uuid,text,timestamptz) is 'Idempotent close with service-write fence; never closes a dependent service.';
comment on index public.audit_logs_catalog_request_unique is '0048 immutable idempotency receipts: request_id dedicated column, actor-scoped across operations.';

do $assert$
declare v_name text; v_oid oid; v_helper text;
begin
 foreach v_helper in array array['public.require_admin_user()','public.current_auth_session_id()',
  'public.current_active_context()','public.vehicle_is_assignable(uuid)','public.sanitize_audit_json(jsonb)',
  'public.write_audit_log(text,text,text,uuid,text,jsonb,jsonb,text,jsonb,uuid,uuid)'] loop
  if to_regprocedure(v_helper) is null then raise exception 'Missing helper %',v_helper; end if;
 end loop;
 foreach v_name in array array[
  'admin_create_individual_customer(uuid,text,text,text,text,text,text)','admin_set_customer_status(uuid,text,text)',
  'admin_create_driver(uuid,text,text,text,text,text,date,text,text)','admin_update_driver(uuid,text,text,date,text)',
  'admin_create_vehicle(uuid,text,text,text,text,text,text)','admin_inactivate_vehicle(uuid,text)',
  'admin_register_vehicle_document(uuid,uuid,text,text,date,date,text,text,uuid,text)',
  'admin_assign_driver_vehicle(uuid,uuid,uuid,timestamptz,text)','admin_close_driver_vehicle_assignment(uuid,text,timestamptz)'] loop
  v_oid:=to_regprocedure('public.'||v_name);
  if v_oid is null or not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid=v_oid and p.prosecdef and p.proconfig @> array['search_path=public, extensions'] and (r.rolsuper or r.rolbypassrls)) then
   raise exception 'Missing/unsafe catalog RPC %',v_name;
  end if;
  if not has_function_privilege('authenticated',v_oid,'execute') or has_function_privilege('anon',v_oid,'execute')
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=v_oid and a.grantee=0 and a.privilege_type='EXECUTE') then
   raise exception 'Unsafe catalog RPC grants %',v_name;
  end if;
 end loop;
 foreach v_helper in array array['elara_private.catalog_request(text,uuid,jsonb)',
  'elara_private.catalog_person(text,text,text,text,text)',
  'elara_private.catalog_audit(text,text,text,uuid,text,jsonb,jsonb,text,uuid,jsonb,jsonb)'] loop
  v_oid:=to_regprocedure(v_helper);
  if v_oid is null or has_function_privilege('authenticated',v_oid,'execute') or has_function_privilege('anon',v_oid,'execute') then
   raise exception 'Private helper is exposed: %',v_helper;
  end if;
 end loop;
 if not exists(select 1 from pg_attribute where attrelid='public.audit_logs'::regclass and attname='request_id' and atttypid='uuid'::regtype and not attisdropped)
  or not exists(select 1 from pg_trigger where tgrelid='public.audit_logs'::regclass and tgname='prepare_audit_log_trigger' and tgenabled<>'D') then
  raise exception 'Required request column/append-only audit trigger missing.';
 end if;
end $assert$;
commit;
