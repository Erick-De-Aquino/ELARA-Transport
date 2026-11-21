-- 0055: additive company/customer creation. No backfill, frontend or lifecycle writes.
-- Reuses the actor-scoped 0048 receipt namespace, including cross-operation collisions.
begin;

do $prerequisites$
declare v_helper text;
begin
  if has_schema_privilege('authenticated','public','create')
    or has_schema_privilege('anon','public','create')
    or has_schema_privilege('authenticated','extensions','create')
    or has_schema_privilege('anon','extensions','create') then
    raise exception 'Unsafe API schema privileges.';
  end if;
  foreach v_helper in array array[
    'public.require_admin_user()',
    'elara_private.catalog_request(text,uuid,jsonb)',
    'elara_private.catalog_person(text,text,text,text,text)',
    'elara_private.catalog_audit(text,text,text,uuid,text,jsonb,jsonb,text,uuid,jsonb,jsonb)'
  ] loop
    if to_regprocedure(v_helper) is null then
      raise exception 'Missing company catalog prerequisite: %',v_helper;
    end if;
  end loop;
  if to_regclass('public.companies_tax_id_unique_idx') is null
    or to_regclass('public.audit_logs_catalog_request_unique') is null
    or to_regclass('public.company_contacts_one_primary_active_per_company_idx') is null
    or to_regclass('public.company_contacts_one_active_per_company_person_idx') is null then
    raise exception 'Missing catalog integrity indexes.';
  end if;
end $prerequisites$;

create function public.admin_create_company_customer(
  p_request_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_trade_name text default null,
  p_billing_phone text default null,
  p_billing_email text default null,
  p_billing_address text default null,
  p_company_notes text default null,
  p_customer_internal_notes text default null,
  p_customer_billing_notes text default null,
  p_contact jsonb default null
)
returns table(
  company_id uuid, customer_id uuid, customer_human_code text,
  company_status text, customer_status text,
  contact_person_id uuid, company_contact_id uuid
)
language plpgsql volatile security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_args jsonb;
  v_result jsonb;
  v_contact jsonb;
  v_mode text;
  v_key text;
  v_value jsonb;
  v_person uuid;
  v_person_status text;
  v_contact_id uuid;
  v_company public.companies%rowtype;
  v_customer public.customers%rowtype;
begin
  -- Admin authority comes from the real user/session/context, never caller metadata.
  v_actor := public.require_admin_user();
  v_args := jsonb_build_object(
    'legal_name',nullif(btrim(p_legal_name),''),
    'tax_id',nullif(upper(btrim(p_tax_id)),''),
    'trade_name',nullif(btrim(p_trade_name),''),
    'billing_phone',nullif(btrim(p_billing_phone),''),
    'billing_email',nullif(lower(btrim(p_billing_email)),''),
    'billing_address',nullif(btrim(p_billing_address),''),
    'company_notes',nullif(btrim(p_company_notes),''),
    'customer_internal_notes',nullif(btrim(p_customer_internal_notes),''),
    'customer_billing_notes',nullif(btrim(p_customer_billing_notes),'')
  );
  if v_args->>'legal_name' is null or v_args->>'tax_id' is null then
    raise exception 'Legal name and tax identifier are required.' using errcode='22023';
  end if;
  if v_args->>'billing_email' is not null
    and (v_args->>'billing_email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid billing email.' using errcode='22023';
  end if;

  if p_contact is not null and p_contact <> 'null'::jsonb then
    if jsonb_typeof(p_contact) <> 'object' then
      raise exception 'Contact must be an object or null.' using errcode='22023';
    end if;
    v_mode := lower(btrim(p_contact->>'mode'));
    if v_mode is null or v_mode not in ('new','existing') then
      raise exception 'Invalid contact mode.' using errcode='22023';
    end if;
    for v_key,v_value in select key,value from jsonb_each(p_contact) loop
      if not (v_key = any(case when v_mode='new'
        then array['mode','first_name','last_name','phone','email','role_label']
        else array['mode','person_id','role_label'] end))
        or jsonb_typeof(v_value) not in ('string','null') then
        raise exception 'Unknown contact field or invalid field type.' using errcode='22023';
      end if;
    end loop;
    if v_mode='new' then
      v_contact := jsonb_build_object(
        'mode','new',
        'first_name',nullif(btrim(p_contact->>'first_name'),''),
        'last_name',nullif(btrim(p_contact->>'last_name'),''),
        'phone',nullif(btrim(p_contact->>'phone'),''),
        'email',nullif(lower(btrim(p_contact->>'email')),''),
        'role_label',nullif(btrim(p_contact->>'role_label'),'')
      );
      if v_contact->>'first_name' is null or v_contact->>'last_name' is null
        or (v_contact->>'phone' is null and v_contact->>'email' is null) then
        raise exception 'New contact requires first name, last name and phone or email.' using errcode='22023';
      end if;
      if v_contact->>'email' is not null
        and (v_contact->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception 'Invalid contact email.' using errcode='22023';
      end if;
    else
      if coalesce(p_contact->>'person_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Existing contact requires a valid person UUID.' using errcode='22023';
      end if;
      v_contact := jsonb_build_object('mode','existing',
        'person_id',(p_contact->>'person_id')::uuid,
        'role_label',nullif(btrim(p_contact->>'role_label'),'')
      );
    end if;
  end if;
  v_args := v_args || jsonb_build_object('contact',v_contact);
  -- This helper enforces READ COMMITTED and serializes actor/request across 0048.
  -- Lookup precedes mutable identity/tax checks: a lost committed reply is replayable.
  v_result := elara_private.catalog_request('admin_company_customer_created',p_request_id,v_args);
  if v_result is null then
    perform pg_advisory_xact_lock(hashtextextended('0055/company-tax/'||(v_args->>'tax_id'),0));
    if exists(select 1 from public.companies c
      where upper(nullif(btrim(c.tax_id),''))=v_args->>'tax_id') then
      raise exception 'Company already exists; administrative review is required.'
        using errcode='23505',detail='{"reason":"company_exists"}';
    end if;
    insert into public.companies(
      legal_name,trade_name,tax_id,billing_phone,billing_email,billing_address,notes,
      status,created_by,updated_by
    ) values(
      v_args->>'legal_name',v_args->>'trade_name',v_args->>'tax_id',
      v_args->>'billing_phone',v_args->>'billing_email',v_args->>'billing_address',
      v_args->>'company_notes','active',v_actor,v_actor
    ) returning * into v_company;
    insert into public.customers(
      customer_type,company_id,status,internal_notes,billing_notes,created_by,updated_by
    ) values(
      'company',v_company.id,'new',v_args->>'customer_internal_notes',
      v_args->>'customer_billing_notes',v_actor,v_actor
    ) returning * into v_customer;

    if v_contact is not null then
      if v_mode='new' then
        -- Same email/phone locks and duplicate rules as individual/driver creation.
        v_person := elara_private.catalog_person(v_contact->>'first_name',v_contact->>'last_name',
          v_contact->>'phone',v_contact->>'email',null);
      else
        v_person := (v_contact->>'person_id')::uuid;
        -- Admin context grants access to persons under current RLS. Lock the actual
        -- row against deletion/inactivation; never edit shared personal information.
        select p.status into v_person_status from public.persons p where p.id=v_person for update;
        if not found then
          raise exception 'Contact person is not available.' using errcode='23503';
        end if;
        if v_person_status <> 'active' then
          raise exception 'Contact person must be active.' using errcode='23514';
        end if;
      end if;
      insert into public.company_contacts(
        company_id,person_id,role_label,is_primary,status,started_at,created_by,updated_by
      ) values(v_company.id,v_person,v_contact->>'role_label',true,'active',clock_timestamp(),v_actor,v_actor)
      returning id into v_contact_id;
      perform elara_private.catalog_audit('admin_company_contact_created','insert','company_contacts',
        v_contact_id,null,null,jsonb_build_object('company_id',v_company.id,'person_id',v_person,
        'is_primary',true,'status','active'),null);
    end if;
    perform elara_private.catalog_audit('admin_company_created','insert','companies',v_company.id,
      null,null,jsonb_build_object('id',v_company.id,'status','active'),null);
    v_result := jsonb_build_object(
      'company_id',v_company.id,'customer_id',v_customer.id,
      'customer_human_code',v_customer.human_code,'company_status',v_company.status,
      'customer_status',v_customer.status,'contact_person_id',v_person,'company_contact_id',v_contact_id
    );
    perform elara_private.catalog_audit('admin_company_customer_created','insert','customers',
      v_customer.id,v_customer.human_code,null,
      jsonb_build_object('company_id',v_company.id,'status','new'),null,p_request_id,v_args,v_result);
  end if;
  return query select (v_result->>'company_id')::uuid,(v_result->>'customer_id')::uuid,
    v_result->>'customer_human_code',v_result->>'company_status',v_result->>'customer_status',
    (v_result->>'contact_person_id')::uuid,(v_result->>'company_contact_id')::uuid;
exception when unique_violation then
  -- Includes conflicts from the legacy helper and external writers hitting indexes.
  -- Do not propagate index DETAIL containing tax identifiers or personal data.
  raise exception 'Administrative duplicate conflict; explicit review is required.'
    using errcode='23505';
end $$;

revoke all on function public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)
  to authenticated;

comment on function public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)
is '0055 atomic company/individual-contact/customer creation; 0048 actor-scoped immutable receipts. No automatic adoption, lifecycle changes, Auth provisioning or financial writes.';

do $security$
declare v_oid oid := 'public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure;
begin
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=v_oid and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']
      and (r.rolsuper or r.rolbypassrls))
    or not has_function_privilege('authenticated',v_oid,'execute')
    or has_function_privilege('anon',v_oid,'execute')
    or has_function_privilege('service_role',v_oid,'execute')
    or exists(select 1 from pg_proc p cross join lateral
      aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=v_oid and a.grantee=0 and a.privilege_type='EXECUTE') then
    raise exception 'Unsafe company catalog owner, search path or grants.';
  end if;
end $security$;
commit;
