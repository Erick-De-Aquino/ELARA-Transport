-- ELARA Transport: exceptional DB-owner-only first-superadmin bootstrap.
-- Capabilities only: no Auth creation, identity data, seed or remote execution.
begin;

create unique index audit_logs_0052_bootstrap_once
on public.audit_logs ((metadata->>'bootstrap_contract'))
where metadata->>'bootstrap_contract'='0052_initial_superadmin'
  and metadata->>'phase'='applied';

create function elara_private.bootstrap_initial_superadmin(
 p_request_id uuid, p_auth_user_id uuid, p_expected_email text,
 p_first_name text, p_last_name text, p_reason text, p_operator_reference text
) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
<<bootstrap>>
declare
 email text:=lower(btrim(p_expected_email)); first_name text:=btrim(p_first_name);
 last_name text:=btrim(p_last_name); reason text:=btrim(p_reason);
 operator_reference text:=btrim(p_operator_reference); args jsonb; fingerprint text;
 au auth.users%rowtype; receipt public.audit_logs%rowtype;
 person_id uuid; app_id uuid; role_id uuid; effective_count bigint; result jsonb;
begin
 -- A SQL administration connection is required; API roles never get EXECUTE.
 if current_user<>'postgres' or auth.uid() is not null then
  raise exception 'Database owner connection without an application identity required.' using errcode='42501';
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'READ COMMITTED required.' using errcode='0A000';
 end if;
 if p_request_id is null or p_request_id='00000000-0000-0000-0000-000000000000'::uuid
  or p_auth_user_id is null or p_auth_user_id='00000000-0000-0000-0000-000000000000'::uuid
  or email is null or length(email)>254 or email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  or nullif(first_name,'') is null or length(first_name)>150
  or nullif(last_name,'') is null or length(last_name)>150
  or nullif(reason,'') is null or length(reason)>1000
  or nullif(operator_reference,'') is null or length(operator_reference)>250 then
  raise exception 'Explicit valid identity, request, names, reason and operator reference required.' using errcode='22023';
 end if;
 args:=jsonb_build_object('auth_user_id',p_auth_user_id,'email',email,'first_name',first_name,
  'last_name',last_name,'reason',reason,'operator_reference',operator_reference);
 fingerprint:=encode(extensions.digest(args::text,'sha256'),'hex');

 -- Same advisory lock as last-superadmin guards. NOWAIT table/row locks avoid
 -- cycles with ordinary writers that acquired rows before entering those guards.
 perform pg_advisory_xact_lock(451004,3003);
 lock table public.persons,public.app_users,public.user_roles,public.roles
  in share row exclusive mode nowait;

 select * into receipt from public.audit_logs
 where metadata->>'bootstrap_contract'='0052_initial_superadmin' and metadata->>'phase'='applied';
 if found then
  if receipt.request_id=p_request_id and receipt.metadata->>'fingerprint' is distinct from fingerprint then
   raise exception 'Bootstrap request payload changed.' using errcode='23505';
  end if;
  -- No write replay, even for the same payload. Recover its result by SELECT.
  raise exception 'Bootstrap permanently consumed; recover the existing receipt read-only.' using errcode='23514';
 end if;
 if exists(select 1 from public.audit_logs a where a.request_id=p_request_id
  or a.metadata->>'request_key'=p_request_id::text) then
  raise exception 'Request UUID already used.' using errcode='23505';
 end if;
 select count(*) into effective_count from public.app_users u
 where public.user_has_active_role(u.id,'superadmin');
 if effective_count<>0 then raise exception 'An effective superadmin already exists.' using errcode='23514'; end if;
 if not exists(select 1 from public.roles r where r.key='superadmin' and r.is_active) then
  raise exception 'Superadmin role must already be enabled.' using errcode='23514';
 end if;

 select * into au from auth.users where id=p_auth_user_id for update nowait;
 if not found then raise exception 'Dedicated Auth identity not found.' using errcode='23503'; end if;
 if lower(btrim(au.email)) is distinct from email or au.email_confirmed_at is null
  or au.is_anonymous is distinct from false or au.deleted_at is not null
  or au.banned_until>now() then
  raise exception 'Dedicated Auth identity is not confirmed, eligible or email-matched.' using errcode='23514';
 end if;
 if exists(select 1 from auth.users a where a.id<>au.id and lower(btrim(a.email))=bootstrap.email)
  or exists(select 1 from public.app_users u where u.auth_user_id=au.id)
  or exists(select 1 from public.persons p where lower(btrim(p.contact_email))=bootstrap.email) then
  raise exception 'Existing application/person identity requires separate review; no adoption or reactivation.' using errcode='23514';
 end if;

 insert into public.persons(first_name,last_name,contact_email)
 values(bootstrap.first_name,bootstrap.last_name,bootstrap.email) returning id into person_id;
 insert into public.app_users(auth_user_id,person_id,status,default_context)
 values(au.id,bootstrap.person_id,'active','superadmin') returning id into app_id;
 -- No invented functional actor. The existing role trigger records its own audit.
 insert into public.user_roles(user_id,role_key,status,starts_at,ends_at,assigned_by,reason)
 values(app_id,'superadmin','active',now(),null,null,bootstrap.reason) returning id into role_id;
 result:=jsonb_build_object('state','bootstrapped','request_id',p_request_id,'auth_user_id',au.id,
  'person_id',person_id,'app_user_id',app_id,'role_id',role_id,'default_context','superadmin');

 insert into public.audit_logs(event_source,action,entity_table,entity_id,request_id,old_data,new_data,reason,metadata)
 values('system','permission_change','app_users',app_id,p_request_id,
  jsonb_build_object('effective_superadmins',0,'bootstrap_consumed',false),
  jsonb_build_object('effective_superadmins',1,'bootstrap_consumed',true,'result',result),bootstrap.reason,
  jsonb_build_object('bootstrap_contract','0052_initial_superadmin','phase','applied',
   'request_key',p_request_id,'fingerprint',fingerprint,'arguments',args,'result',result,
   'operator_reference',operator_reference,'db_session_user',session_user,'db_effective_role',current_user));
 select count(*) into effective_count from public.app_users u
 where public.user_has_active_role(u.id,'superadmin');
 if effective_count<>1 or not public.user_has_active_role(app_id,'superadmin')
  or (select count(*) from public.audit_logs a where a.metadata->>'bootstrap_contract'='0052_initial_superadmin'
    and a.metadata->>'phase'='applied')<>1 then
  raise exception 'Bootstrap postconditions failed.' using errcode='23514';
 end if;
 return result;
end $$;

alter function elara_private.bootstrap_initial_superadmin(uuid,uuid,text,text,text,text,text) owner to postgres;
revoke all on function elara_private.bootstrap_initial_superadmin(uuid,uuid,text,text,text,text,text)
 from public,anon,authenticated,service_role;
comment on function elara_private.bootstrap_initial_superadmin(uuid,uuid,text,text,text,text,text) is
 'DB owner only, one global use. Requires a dedicated existing confirmed Auth identity. Recover receipts by read-only metadata request_key lookup.';
commit;
