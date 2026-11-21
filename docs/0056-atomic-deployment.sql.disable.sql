-- Emergency opt-in only AFTER explicit authorization. Never automatically executed.
\set ON_ERROR_STOP on
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $disable_guard$ begin if not exists(select 1 from supabase_migrations.schema_migrations where version='20261117005600' and name='0056_admin_company_contacts' and statements=array['-- 0056: local additive administrative company-contact contracts. No personal edits.
begin;

do $prerequisites$
begin
  if to_regprocedure(''public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)'') is null
    or to_regprocedure(''elara_private.catalog_request(text,uuid,jsonb)'') is null
    or to_regprocedure(''elara_private.catalog_person(text,text,text,text,text)'') is null
    or to_regclass(''public.company_contacts_one_active_per_company_person_idx'') is null
    or to_regclass(''public.company_contacts_one_primary_active_per_company_idx'') is null
    or has_schema_privilege(''authenticated'',''public'',''create'')
    or has_schema_privilege(''anon'',''public'',''create'') then
    raise exception ''Missing or unsafe company contact prerequisites.'';
  end if;
end $prerequisites$;

-- updated_at uses transaction time and is not an optimistic concurrency token.
-- Increment on every UPDATE, including trusted writers outside these RPCs.
alter table public.company_contacts add column version bigint not null default 1
  constraint company_contacts_version_positive check (version > 0);

create function elara_private.company_contact_version()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger company_contacts_increment_version before update on public.company_contacts
for each row execute function elara_private.company_contact_version();

-- Lock order: receipt -> customer -> company -> persons (UUID order) -> contacts.
-- The company row serializes these three RPCs even across historic customer rows.
create function elara_private.company_contact_company(p_customer uuid)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_customer public.customers%rowtype; v_company public.companies%rowtype;
begin
  perform public.require_admin_user();
  if p_customer is null then raise exception ''Customer UUID is required.'' using errcode=''22023''; end if;
  select * into v_customer from public.customers where id=p_customer for update;
  if not found then raise exception ''Company customer is not available.'' using errcode=''23503''; end if;
  if v_customer.customer_type <> ''company'' or v_customer.status not in (''new'',''active'') then
    raise exception ''Company customer is incompatible.'' using errcode=''23514'';
  end if;
  select * into v_company from public.companies where id=v_customer.company_id for update;
  if not found or v_company.status <> ''active'' then
    raise exception ''Company is not available.'' using errcode=''23514'';
  end if;
  return v_company.id;
end $$;

create function public.admin_add_company_contact(
  p_request_id uuid, p_customer_id uuid, p_contact jsonb,
  p_is_primary boolean default false, p_notes text default null
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  v_actor uuid; v_company uuid; v_person uuid; v_status text; v_mode text;
  v_contact jsonb; v_args jsonb; v_result jsonb; v_key text; v_value jsonb;
  v_row public.company_contacts%rowtype;
begin
  v_actor := public.require_admin_user();
  if p_customer_id is null or p_is_primary is null or p_contact is null
    or jsonb_typeof(p_contact) <> ''object'' then
    raise exception ''Customer, contact object and primary choice are required.'' using errcode=''22023'';
  end if;
  v_mode := lower(btrim(p_contact->>''mode''));
  if v_mode is null or v_mode not in (''new'',''existing'') then
    raise exception ''Invalid contact mode.'' using errcode=''22023'';
  end if;
  for v_key,v_value in select key,value from jsonb_each(p_contact) loop
    if not (v_key = any(case when v_mode=''new''
      then array[''mode'',''first_name'',''last_name'',''phone'',''email'',''role_label'']
      else array[''mode'',''person_id'',''role_label''] end))
      or jsonb_typeof(v_value) not in (''string'',''null'') then
      raise exception ''Unknown contact field or invalid type.'' using errcode=''22023'';
    end if;
  end loop;
  if v_mode=''new'' then
    v_contact := jsonb_build_object(''mode'',''new'',
      ''first_name'',nullif(btrim(p_contact->>''first_name''),''''),
      ''last_name'',nullif(btrim(p_contact->>''last_name''),''''),
      ''phone'',nullif(btrim(p_contact->>''phone''),''''),
      ''email'',nullif(lower(btrim(p_contact->>''email'')),''''),
      ''role_label'',nullif(btrim(p_contact->>''role_label''),''''));
    if v_contact->>''first_name'' is null or v_contact->>''last_name'' is null
      or (v_contact->>''phone'' is null and v_contact->>''email'' is null) then
      raise exception ''New contact requires names and phone or email.'' using errcode=''22023'';
    end if;
    if v_contact->>''email'' is not null and (v_contact->>''email'') !~ ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'' then
      raise exception ''Invalid contact email.'' using errcode=''22023'';
    end if;
  else
    if coalesce(p_contact->>''person_id'','''') !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
      raise exception ''Valid person UUID is required.'' using errcode=''22023'';
    end if;
    v_contact := jsonb_build_object(''mode'',''existing'',''person_id'',(p_contact->>''person_id'')::uuid,
      ''role_label'',nullif(btrim(p_contact->>''role_label''),''''));
  end if;
  v_args := jsonb_build_object(''customer_id'',p_customer_id,''contact'',v_contact,
    ''is_primary'',p_is_primary,''notes'',nullif(btrim(p_notes),''''));
  v_result := elara_private.catalog_request(''admin_company_contact_added'',p_request_id,v_args);
  if v_result is not null then return v_result; end if;
  v_company := elara_private.company_contact_company(p_customer_id);
  if p_is_primary and exists(select 1 from public.company_contacts where company_id=v_company and status=''active'' and is_primary) then
    raise exception ''An active primary already exists; explicit replacement is required.'' using errcode=''23514'';
  end if;
  if v_mode=''new'' then
    v_person := elara_private.catalog_person(v_contact->>''first_name'',v_contact->>''last_name'',v_contact->>''phone'',v_contact->>''email'',null);
  else
    v_person := (v_contact->>''person_id'')::uuid;
    select status into v_status from public.persons where id=v_person for update;
    if not found then raise exception ''Contact person is not available.'' using errcode=''23503''; end if;
    if v_status <> ''active'' then raise exception ''Contact person must be active.'' using errcode=''23514''; end if;
  end if;
  if exists(select 1 from public.company_contacts where company_id=v_company and person_id=v_person and status=''active'') then
    raise exception ''An active contact link already exists.'' using errcode=''23505'';
  end if;
  insert into public.company_contacts(company_id,person_id,role_label,notes,is_primary,status,started_at,created_by,updated_by)
  values(v_company,v_person,v_contact->>''role_label'',v_args->>''notes'',p_is_primary,''active'',clock_timestamp(),v_actor,v_actor)
  returning * into v_row;
  v_result := jsonb_build_object(''customer_id'',p_customer_id,''company_id'',v_company,
    ''company_contact_id'',v_row.id,''person_id'',v_person,''status'',v_row.status,
    ''is_primary'',v_row.is_primary,''version'',v_row.version);
  perform elara_private.catalog_audit(''admin_company_contact_added'',''insert'',''company_contacts'',v_row.id,null,
    null,jsonb_build_object(''company_id'',v_company,''person_id'',v_person,''status'',v_row.status,
    ''is_primary'',v_row.is_primary,''version'',v_row.version),null,p_request_id,v_args,v_result);
  return v_result;
exception when unique_violation then
  raise exception ''Administrative duplicate conflict; review is required.'' using errcode=''23505'';
end $$;

create function public.admin_set_company_primary_contact(
  p_request_id uuid, p_customer_id uuid, p_company_contact_id uuid,
  p_expected_version bigint, p_expected_primary_contact_id uuid,
  p_expected_primary_version bigint, p_reason text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  v_actor uuid; v_company uuid; v_args jsonb; v_result jsonb;
  v_target public.company_contacts%rowtype; v_primary public.company_contacts%rowtype;
begin
  v_actor := public.require_admin_user();
  if p_customer_id is null or p_company_contact_id is null or coalesce(p_expected_version,0)<1
    or (p_expected_primary_contact_id is null) <> (p_expected_primary_version is null)
    or (p_expected_primary_version is not null and p_expected_primary_version<1)
    or nullif(btrim(p_reason),'''') is null then
    raise exception ''Target, expected versions and reason are required.'' using errcode=''22023'';
  end if;
  v_args := jsonb_build_object(''customer_id'',p_customer_id,''contact_id'',p_company_contact_id,
    ''expected_version'',p_expected_version,''expected_primary_id'',p_expected_primary_contact_id,
    ''expected_primary_version'',p_expected_primary_version,''reason'',btrim(p_reason));
  v_result := elara_private.catalog_request(''admin_company_primary_contact_set'',p_request_id,v_args);
  if v_result is not null then return v_result; end if;
  v_company := elara_private.company_contact_company(p_customer_id);
  -- Lock shared identities in UUID order before touching their links.
  perform p.id from public.persons p where p.id in
    (select person_id from public.company_contacts where company_id=v_company and status=''active''
      and (id=p_company_contact_id or is_primary)) order by p.id for update;
  perform id from public.company_contacts where company_id=v_company and status=''active''
    and (id=p_company_contact_id or is_primary) order by id for update;
  select * into v_target from public.company_contacts where id=p_company_contact_id and company_id=v_company and status=''active'';
  if not found then raise exception ''Active contact link is not available.'' using errcode=''23503''; end if;
  select * into v_primary from public.company_contacts where company_id=v_company and status=''active'' and is_primary;
  if v_target.version <> p_expected_version or v_primary.id is distinct from p_expected_primary_contact_id
    or v_primary.version is distinct from p_expected_primary_version then
    raise exception ''Contact state changed; reload before retrying.'' using errcode=''40001'';
  end if;
  if not exists(select 1 from public.persons where id=v_target.person_id and status=''active'') then
    raise exception ''Contact person must be active.'' using errcode=''23514'';
  end if;
  if v_primary.id is distinct from v_target.id then
    if v_primary.id is not null then
      update public.company_contacts set is_primary=false,updated_by=v_actor where id=v_primary.id;
      perform elara_private.catalog_audit(''admin_company_primary_contact_removed'',''update'',''company_contacts'',v_primary.id,null,
        jsonb_build_object(''is_primary'',true,''version'',v_primary.version),
        jsonb_build_object(''is_primary'',false,''version'',v_primary.version+1),btrim(p_reason));
    end if;
    update public.company_contacts set is_primary=true,updated_by=v_actor where id=v_target.id returning * into v_target;
  end if;
  v_result := jsonb_build_object(''customer_id'',p_customer_id,''company_id'',v_company,
    ''company_contact_id'',v_target.id,''person_id'',v_target.person_id,''status'',v_target.status,
    ''is_primary'',v_target.is_primary,''version'',v_target.version,''previous_primary_contact_id'',v_primary.id);
  perform elara_private.catalog_audit(''admin_company_primary_contact_set'',''update'',''company_contacts'',v_target.id,null,
    jsonb_build_object(''primary_contact_id'',v_primary.id,''version'',p_expected_version),
    jsonb_build_object(''primary_contact_id'',v_target.id,''version'',v_target.version),btrim(p_reason),p_request_id,v_args,v_result);
  return v_result;
end $$;

create function public.admin_update_company_contact(
  p_request_id uuid, p_customer_id uuid, p_company_contact_id uuid,
  p_expected_version bigint, p_patch jsonb, p_reason text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  v_actor uuid; v_company uuid; v_person uuid; v_args jsonb; v_result jsonb;
  v_patch jsonb := ''{}''::jsonb; v_key text; v_value jsonb;
  v_old public.company_contacts%rowtype; v_new public.company_contacts%rowtype;
begin
  v_actor := public.require_admin_user();
  if p_customer_id is null or p_company_contact_id is null or coalesce(p_expected_version,0)<1
    or p_patch is null or jsonb_typeof(p_patch)<>''object'' or p_patch=''{}''::jsonb
    or nullif(btrim(p_reason),'''') is null then
    raise exception ''Target, expected version, patch and reason are required.'' using errcode=''22023'';
  end if;
  for v_key,v_value in select key,value from jsonb_each(p_patch) loop
    if v_key not in (''role_label'',''notes'',''status'') or jsonb_typeof(v_value) not in (''string'',''null'') then
      raise exception ''Unsupported contact change.'' using errcode=''22023'';
    end if;
    if v_key=''status'' and (v_value #>> ''{}'') is distinct from ''inactive'' then
      raise exception ''Only contact deactivation is supported.'' using errcode=''22023'';
    end if;
    v_patch := v_patch || jsonb_build_object(v_key,nullif(btrim(v_value #>> ''{}''),''''));
  end loop;
  v_args := jsonb_build_object(''customer_id'',p_customer_id,''contact_id'',p_company_contact_id,
    ''expected_version'',p_expected_version,''patch'',v_patch,''reason'',btrim(p_reason));
  v_result := elara_private.catalog_request(''admin_company_contact_updated'',p_request_id,v_args);
  if v_result is not null then return v_result; end if;
  v_company := elara_private.company_contact_company(p_customer_id);
  select person_id into v_person from public.company_contacts where id=p_company_contact_id and company_id=v_company;
  if not found then raise exception ''Contact link is not available.'' using errcode=''23503''; end if;
  perform id from public.persons where id=v_person for update;
  select * into v_old from public.company_contacts where id=p_company_contact_id and company_id=v_company for update;
  if v_old.version <> p_expected_version then raise exception ''Contact state changed; reload before retrying.'' using errcode=''40001''; end if;
  if v_old.status <> ''active'' then raise exception ''Inactive links cannot be edited or reactivated.'' using errcode=''23514''; end if;
  if not (v_patch ? ''status'') and not exists(select 1 from public.persons where id=v_old.person_id and status=''active'') then
    raise exception ''Contact person must be active.'' using errcode=''23514'';
  end if;
  update public.company_contacts set
    role_label=case when v_patch ? ''role_label'' then v_patch->>''role_label'' else v_old.role_label end,
    notes=case when v_patch ? ''notes'' then v_patch->>''notes'' else v_old.notes end,
    status=case when v_patch ? ''status'' then ''inactive'' else v_old.status end,
    is_primary=case when v_patch ? ''status'' then false else v_old.is_primary end,
    ended_at=case when v_patch ? ''status'' then clock_timestamp() else v_old.ended_at end,
    inactive_by=case when v_patch ? ''status'' then v_actor else v_old.inactive_by end,
    updated_by=v_actor where id=v_old.id returning * into v_new;
  v_result := jsonb_build_object(''customer_id'',p_customer_id,''company_id'',v_company,
    ''company_contact_id'',v_new.id,''person_id'',v_new.person_id,''status'',v_new.status,
    ''is_primary'',v_new.is_primary,''version'',v_new.version,''ended_at'',v_new.ended_at);
  perform elara_private.catalog_audit(''admin_company_contact_updated'',case when v_new.status=''inactive'' then ''status_change'' else ''update'' end,
    ''company_contacts'',v_new.id,null,jsonb_build_object(''status'',v_old.status,''is_primary'',v_old.is_primary,''version'',v_old.version),
    jsonb_build_object(''status'',v_new.status,''is_primary'',v_new.is_primary,''version'',v_new.version,
      ''role_label_changed'',v_new.role_label is distinct from v_old.role_label,''notes_changed'',v_new.notes is distinct from v_old.notes),
    btrim(p_reason),p_request_id,v_args,v_result);
  return v_result;
end $$;

revoke all on function elara_private.company_contact_version(), elara_private.company_contact_company(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text),
  public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text),
  public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text),
  public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text),
  public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text) to authenticated;

commit;
']::text[]) then raise exception '0056 identity mismatch; stop.'; end if; end $disable_guard$;
revoke all on function public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text),public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text),public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
-- Retains column, trigger, records, history and all pre-0056 functions.
