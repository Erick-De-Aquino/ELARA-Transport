-- LOCAL ONLY. Additive user administration; no Auth HTTP, seed, or backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table public.app_users add column admin_version bigint not null default 1 check(admin_version>0);
create function elara_private.user_admin_version() returns trigger language plpgsql set search_path=pg_catalog as $$
begin new.admin_version:=old.admin_version+1; return new; end $$;
create trigger app_users_admin_version before update on public.app_users for each row execute function elara_private.user_admin_version();
-- Existing trusted role/link writers participate in optimistic concurrency too.
create function elara_private.user_admin_dependency() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'User ownership cannot change.' using errcode='23514'; end if;
 update public.app_users set admin_version=admin_version where id=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger user_roles_admin_version before insert or update or delete on public.user_roles for each row execute function elara_private.user_admin_dependency();
create trigger user_driver_links_admin_version before insert or update or delete on public.user_driver_links for each row execute function elara_private.user_admin_dependency();

create table elara_private.user_admin_requests(
 id uuid primary key, actor uuid not null references public.app_users(id), kind text not null,
 arguments jsonb not null, state text not null default 'prepared', result jsonb, auth_candidate_id uuid,
 created_at timestamptz not null default now()
);
alter table elara_private.user_admin_requests enable row level security;
revoke all on elara_private.user_admin_requests from public,anon,authenticated,service_role;
-- Deployment activation is separate from user authorization. Empty on install:
-- no application caller (including service_role) can activate an operation.
create table elara_private.user_admin_rollout(
 operation text primary key check(operation in ('metadata','status','assign','revoke','invite')),
 enabled boolean not null default false,
 edge_verified boolean not null default false,
 callback_verified boolean not null default false,
 mail_verified boolean not null default false,
 callback_url text,
 check(callback_url is null or callback_url ~ '^https://[^/?#[:space:]]+/[^?#[:space:]]*accept-user-invite[.]html$')
);
alter table elara_private.user_admin_rollout enable row level security;
revoke all on elara_private.user_admin_rollout from public,anon,authenticated,service_role;
create function elara_private.user_admin_rollout_lock() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(451004,3003);
 perform pg_advisory_xact_lock(hashtextextended('0051/control',0));
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger user_admin_rollout_lock before insert or update or delete on elara_private.user_admin_rollout
 for each row execute function elara_private.user_admin_rollout_lock();
create function elara_private.user_admin_operation_enabled(p_operation text) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select enabled
  and has_function_privilege('authenticated',to_regprocedure('public.admin_get_user_request(uuid)'),'EXECUTE')
  and case when operation='invite' then
   edge_verified and callback_verified and mail_verified and callback_url is not null
   and has_function_privilege('authenticated',to_regprocedure('public.admin_prepare_user_invitation(uuid,jsonb)'),'EXECUTE')
   and has_function_privilege('authenticated',to_regprocedure('public.admin_complete_user_invitation(uuid,uuid)'),'EXECUTE')
   and has_function_privilege('service_role',to_regprocedure('public.admin_claim_user_invitation(uuid,uuid,uuid)'),'EXECUTE')
  else has_function_privilege('authenticated',to_regprocedure('public.admin_manage_user(uuid,uuid,bigint,text,jsonb,text)'),'EXECUTE') end
  from elara_private.user_admin_rollout where operation=p_operation),false)
$$;
revoke all on function elara_private.user_admin_rollout_lock(),elara_private.user_admin_operation_enabled(text)
 from public,anon,authenticated,service_role;
create unique index user_invitation_email_reservation on elara_private.user_admin_requests(lower(arguments->>'email')) where kind='invite';
create table elara_private.user_suspended_driver_links(
 user_id uuid primary key references public.app_users(id), driver_id uuid not null references public.drivers(id),
 closed_link_id uuid not null references public.user_driver_links(id),
 revocation_ids uuid[] not null
);
alter table elara_private.user_suspended_driver_links enable row level security;
revoke all on elara_private.user_suspended_driver_links from public,anon,authenticated,service_role;

-- Immutable receipt identities, not transaction timestamps, define the revocation
-- boundary. All readers/writers already hold the shared 0051/control xact lock.
create table elara_private.user_driver_access_attempts(
 request_id uuid primary key, driver_id uuid not null references public.drivers(id),
 revocation_ids uuid[] not null
);
alter table elara_private.user_driver_access_attempts enable row level security;
revoke all on elara_private.user_driver_access_attempts from public,anon,authenticated,service_role;
create function elara_private.user_admin_driver_revocations(p_driver_id uuid) returns uuid[]
language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(array_agg(id order by id),'{}'::uuid[]) from public.audit_logs
 where entity_table='drivers' and entity_id=p_driver_id
 and metadata->>'control_contract'='0051' and metadata->>'phase'='revoke'
$$;
create function elara_private.user_admin_driver_attempt_current(p_request_id uuid,p_driver_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 -- Pre-0057 attempts with no revocation history remain compatible. If there is
 -- history but no captured boundary, require a fresh authorization, never guess.
 select coalesce((select revocation_ids=elara_private.user_admin_driver_revocations(p_driver_id)
  from elara_private.user_driver_access_attempts where request_id=p_request_id and driver_id=p_driver_id),
  cardinality(elara_private.user_admin_driver_revocations(p_driver_id))=0)
$$;
revoke all on function elara_private.user_admin_driver_revocations(uuid),
 elara_private.user_admin_driver_attempt_current(uuid,uuid) from public,anon,authenticated,service_role;

-- Preserve 0051 signatures, ACLs and eligibility; replace only revocation ordering.
create or replace function public.admin_begin_driver_portal_access(p_request_id uuid,p_driver_id uuid,p_email text,p_reason text,p_confirm_existing boolean default false)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare args jsonb; result jsonb; d public.drivers%rowtype; u public.app_users%rowtype;
 v_email text:=lower(btrim(p_email)); reason text:=nullif(btrim(p_reason),''); auth_id uuid; prior public.audit_logs%rowtype;
begin
 args:=jsonb_build_object('driver',p_driver_id,'email',v_email,'reason',reason,'confirm_existing',p_confirm_existing);
 result:=elara_private.control_0051_request(p_request_id,'access','begin',args);
 if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or reason is null or length(reason)>1000 or p_confirm_existing is null then raise exception 'Valid email, reason and confirmation required.' using errcode='22023'; end if;
 select * into d from public.drivers where id=p_driver_id for update;
 if not found or d.administrative_status<>'active' or d.inactive_at is not null then raise exception 'Active driver required.' using errcode='23514'; end if;
 perform 1 from public.persons where id=d.person_id and status='active' for update;
 if not found then raise exception 'Active driver person required.' using errcode='23514'; end if;
 select au.id into auth_id from auth.users au where lower(au.email)=v_email;
 select * into u from public.app_users where person_id=d.person_id or auth_user_id=auth_id order by id limit 1 for update;
 if found and (u.person_id<>d.person_id or u.status<>'active' or u.auth_user_id is distinct from auth_id) then
  raise exception 'Existing application identity is incompatible or inactive.' using errcode='23514'; end if;
 if exists(select 1 from public.user_driver_links l where l.driver_id=d.id and l.status='active' and l.user_id is distinct from u.id) then
  raise exception 'Driver already has another active identity.' using errcode='23514'; end if;
 if exists(select 1 from public.user_driver_links l where l.user_id=u.id and l.status='active' and l.driver_id<>d.id) then
  raise exception 'User already linked to another driver.' using errcode='23514'; end if;
 if exists(select 1 from public.user_driver_links l where l.driver_id=d.id and l.status='inactive')
  or exists(select 1 from public.user_roles r where r.user_id=u.id and r.role_key='conductor' and r.status='revoked') then
  raise exception 'Revoked access requires separate review; no automatic reactivation.' using errcode='23514'; end if;
 -- Replay is not permission to send an invitation after the target became
 -- inactive/incompatible. Recheck current eligibility before returning context.
 if result is not null then
  if not elara_private.user_admin_driver_attempt_current(p_request_id,p_driver_id) then raise exception 'Attempt predates revocation; start a fresh authorization.' using errcode='23514'; end if;
  return result;
 end if;
 -- A pending request for the same actor/email is canonical, even across reloads.
 select * into prior from public.audit_logs a where a.entity_id=d.id and a.metadata->>'control_contract'='0051'
  and a.metadata->>'phase'='begin'
  and not exists(select 1 from public.audit_logs l where l.metadata->>'control_contract'='0051' and l.metadata->>'phase'='link' and l.metadata->>'request_key'=a.metadata->>'request_key')
  and elara_private.user_admin_driver_attempt_current((a.metadata->>'request_key')::uuid,d.id)
 order by a.created_at,a.id limit 1;
 if found then
  if prior.actor_app_user_id<>public.require_superadmin_user() or prior.metadata->'arguments' is distinct from args then
   raise exception 'Another pending access attempt requires review.' using errcode='23514'; end if;
  result:=prior.metadata->'result';
 else
  result:=jsonb_build_object('request_id',p_request_id,'driver_id',d.id,'email',v_email,'auth_user_id',auth_id,
   'confirm_existing',p_confirm_existing,'state',case when auth_id is not null and not p_confirm_existing then 'requires_review' else 'pending' end);
 end if;
 insert into elara_private.user_driver_access_attempts(request_id,driver_id,revocation_ids)
  values(p_request_id,d.id,elara_private.user_admin_driver_revocations(d.id));
 return elara_private.control_0051_receipt(p_request_id,'access','begin',args,d.id,result,reason);
end $$;

create or replace function public.admin_link_driver_portal_access(p_request_id uuid,p_auth_user_id uuid,p_confirm_existing_identity boolean default false)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare args jsonb:=jsonb_build_object('auth_user_id',p_auth_user_id,'confirm_existing',p_confirm_existing_identity); result jsonb; b public.audit_logs%rowtype;
 d public.drivers%rowtype; u public.app_users%rowtype; au auth.users%rowtype; link_id uuid; role_id uuid;
begin
 result:=elara_private.control_0051_request(p_request_id,'access','link',args);
 select * into b from public.audit_logs where metadata->>'control_contract'='0051' and metadata->>'request_key'=p_request_id::text and metadata->>'phase'='begin';
 if not found then raise exception 'Begin access first.' using errcode='23503'; end if;
 if not elara_private.user_admin_driver_attempt_current(p_request_id,b.entity_id) then
  raise exception 'Attempt predates revocation; review required.' using errcode='23514'; end if;
 if result is not null then return result; end if;
 if (b.metadata->'result'->>'request_id')::uuid<>p_request_id then raise exception 'Use canonical request id.' using errcode='22023'; end if;
 select * into d from public.drivers where id=b.entity_id for update;
 if d.administrative_status<>'active' or d.inactive_at is not null then raise exception 'Active driver required.' using errcode='23514'; end if;
 perform 1 from public.persons where id=d.person_id and status='active' for update;
 if not found then raise exception 'Active person required.' using errcode='23514'; end if;
 select * into au from auth.users where id=p_auth_user_id for update;
 if not found or lower(au.email) is distinct from b.metadata->'arguments'->>'email' then raise exception 'Auth identity does not match approved email.' using errcode='23514'; end if;
 if to_jsonb(au)->>'deleted_at' is not null or coalesce((to_jsonb(au)->>'is_anonymous')::boolean,false)
  or coalesce((to_jsonb(au)->>'banned_until')::timestamptz,'-infinity'::timestamptz)>now() then
  raise exception 'Unavailable Auth identity.' using errcode='23514'; end if;
 if b.metadata->'result'->>'auth_user_id' is not null and not ((b.metadata->'arguments'->>'confirm_existing')::boolean or coalesce(p_confirm_existing_identity,false)) then
  raise exception 'Existing Auth identity needs explicit confirmation.' using errcode='23514'; end if;
 select * into u from public.app_users where auth_user_id=au.id for update;
 if found then
  if u.person_id<>d.person_id or u.status<>'active' then raise exception 'Incompatible or inactive app user.' using errcode='23514'; end if;
 else
  if exists(select 1 from public.app_users where person_id=d.person_id) then raise exception 'Person has another application identity.' using errcode='23514'; end if;
  insert into public.app_users(auth_user_id,person_id,default_context,created_by,updated_by)
   values(au.id,d.person_id,'conductor',public.require_superadmin_user(),public.require_superadmin_user()) returning * into u;
 end if;
 if exists(select 1 from public.user_driver_links where status='active' and ((driver_id=d.id and user_id<>u.id) or (user_id=u.id and driver_id<>d.id))) then
  raise exception 'Conflicting driver identity link.' using errcode='23514'; end if;
 if exists(select 1 from public.user_driver_links where driver_id=d.id and status='inactive') then raise exception 'Revoked driver link requires review.' using errcode='23514'; end if;
 select id into role_id from public.user_roles where user_id=u.id and role_key='conductor' and status='active' and starts_at<=now() and (ends_at is null or ends_at>now()) for update;
 if role_id is null then
  if exists(select 1 from public.user_roles where user_id=u.id and role_key='conductor') then raise exception 'Inactive/expired role requires review.' using errcode='23514'; end if;
  role_id:=public.assign_user_role(u.id,'conductor','0051 explicit driver portal access');
 end if;
 select id into link_id from public.user_driver_links where user_id=u.id and driver_id=d.id and status='active' for update;
 if link_id is null then insert into public.user_driver_links(user_id,driver_id,created_by) values(u.id,d.id,public.require_superadmin_user()) returning id into link_id; end if;
 if not public.user_has_active_role(u.id,u.default_context) then update public.app_users set default_context='conductor',updated_by=public.require_superadmin_user() where id=u.id; end if;
 result:=jsonb_build_object('request_id',p_request_id,'driver_id',d.id,'app_user_id',u.id,'auth_user_id',au.id,'link_id',link_id,'role_id',role_id,'state','linked');
 return elara_private.control_0051_receipt(p_request_id,'access','link',args,d.id,result,b.reason);
end $$;

create function elara_private.user_admin_actor() returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare a uuid;
begin
 a:=public.require_superadmin_user();
 if not exists(select 1 from auth.sessions s where s.id=public.current_auth_session_id() and s.user_id=auth.uid()) then
  raise exception 'Live Auth session required.' using errcode='28000'; end if;
 return a;
end $$;
create function elara_private.user_admin_lock() returns uuid language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform elara_private.user_admin_actor();
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required.' using errcode='0A000'; end if;
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(451004,3003);
 perform pg_advisory_xact_lock(hashtextextended('0051/control',0));
 return elara_private.user_admin_actor();
end $$;
create function elara_private.user_admin_receipt(p_id uuid,p_kind text,p_args jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a uuid; r elara_private.user_admin_requests%rowtype;
begin
 a:=elara_private.user_admin_lock();
 if not elara_private.user_admin_operation_enabled(case when p_kind='invite' then 'invite' else p_args->>'action' end) then
  raise exception 'Operation is not activated for this deployment.' using errcode='55000'; end if;
 if p_id is null then raise exception 'Request UUID required.' using errcode='22023'; end if;
 select * into r from elara_private.user_admin_requests where id=p_id for update;
 if found then
  if r.actor<>a or r.kind<>p_kind or r.arguments is distinct from p_args then raise exception 'Request belongs to another actor or payload.' using errcode='23505'; end if;
  return r.result;
 end if;
 insert into elara_private.user_admin_requests(id,actor,kind,arguments) values(p_id,a,p_kind,p_args);
 return null;
end $$;

create function public.admin_get_user_control(p_user_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare u public.app_users%rowtype;
begin
 perform elara_private.user_admin_actor();
 if p_user_id is null then return jsonb_build_object('contract','0057','manage',false,'authorized',true,'invitation_backend_required',true,
  'availability_contract','0057.availability.v1',
  'operations',(select jsonb_object_agg(op,elara_private.user_admin_operation_enabled(op)) from unnest(array['metadata','status','assign','revoke','invite']) op),
  'callback_url',(select callback_url from elara_private.user_admin_rollout where operation='invite')); end if;
 select * into u from public.app_users where id=p_user_id;
 if not found then raise exception 'User not found.' using errcode='23503'; end if;
 return jsonb_build_object('contract','0057','user_id',u.id,'version',u.admin_version,'status',u.status,'default_context',u.default_context,'note',u.internal_note);
end $$;
create function public.admin_get_user_request(p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare a uuid; r elara_private.user_admin_requests%rowtype;
begin
 a:=elara_private.user_admin_actor();select * into r from elara_private.user_admin_requests where id=p_request_id;
 if not found then return jsonb_build_object('state','not_found'); end if;
 if r.actor<>a then raise exception 'Request belongs to another operator.' using errcode='42501'; end if;
 return jsonb_build_object('state',r.state,'kind',r.kind,'result',r.result);
end $$;

create function public.admin_manage_user(p_request_id uuid,p_user_id uuid,p_expected_version bigint,p_action text,p_changes jsonb,p_reason text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare a uuid; u public.app_users%rowtype; r public.user_roles%rowtype; l public.user_driver_links%rowtype;
 args jsonb; v_result jsonb; alternative text; role_key text; suspension elara_private.user_suspended_driver_links%rowtype; t timestamptz:=now();
begin
 args:=jsonb_build_object('user',p_user_id,'version',p_expected_version,'action',p_action,'changes',p_changes,'reason',p_reason);
 v_result:=elara_private.user_admin_receipt(p_request_id,'manage',args);
 if v_result is not null then return v_result; end if;
 a:=elara_private.user_admin_actor();
 if p_expected_version is null or p_expected_version<1 or nullif(btrim(p_reason),'') is null or length(p_reason)>1000
  or p_action is null or p_action not in ('status','metadata','assign','revoke') or p_changes is null or jsonb_typeof(p_changes)<>'object' then
  raise exception 'Invalid action, reason or payload.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(p_changes) x where x.key<>all(case p_action when 'status' then array['status'] when 'metadata' then array['note','default_context'] when 'assign' then array['role'] else array['role_id','default_context'] end)
  or jsonb_typeof(x.value) not in ('string','null')) then raise exception 'Unknown or invalid fields.' using errcode='22023'; end if;
 -- Actor and target lock in UUID order; authorization repeated after waiting.
 perform 1 from public.app_users where id in (a,p_user_id) order by id for update;
 perform elara_private.user_admin_actor();
 select * into u from public.app_users where id=p_user_id;
 if not found then raise exception 'User not found.' using errcode='23503'; end if;
 if u.admin_version<>p_expected_version then raise exception 'User changed; refresh before editing.' using errcode='40001'; end if;
 if p_action='metadata' then
  if p_changes ? 'note' and length(coalesce(p_changes->>'note',''))>2000 then raise exception 'Note too long.' using errcode='22023'; end if;
  alternative:=case when p_changes ? 'default_context' then p_changes->>'default_context' else u.default_context end;
  if alternative is null or not exists(select 1 from public.user_roles ur join public.roles k on k.key=ur.role_key and k.is_active where ur.user_id=u.id and ur.role_key=alternative and ur.status='active' and ur.starts_at<=now() and (ur.ends_at is null or ur.ends_at>now())) then raise exception 'Default context needs a current role.' using errcode='23514'; end if;
  update public.app_users set internal_note=case when p_changes ? 'note' then nullif(btrim(p_changes->>'note'),'') else internal_note end,default_context=alternative,updated_by=a where id=u.id;
 elsif p_action='assign' then
  role_key:=p_changes->>'role';
  if role_key is null or role_key not in ('superadmin','administrativo','conductor') then raise exception 'Unsupported role.' using errcode='22023'; end if;
  if role_key='conductor' and not exists(select 1 from public.user_driver_links k join public.drivers d on d.id=k.driver_id where k.user_id=u.id and k.status='active' and d.person_id=u.person_id and d.administrative_status='active') then
   raise exception 'Use authorized driver portal linking workflow first.' using errcode='23514'; end if;
  perform public.assign_user_role(u.id,role_key,p_reason);
 elsif p_action='revoke' then
  select * into r from public.user_roles where id=(p_changes->>'role_id')::uuid and user_id=u.id for update;
  if not found then raise exception 'Assigned role not found.' using errcode='23503'; end if;
  if r.role_key='conductor' and exists(select 1 from public.user_driver_links where user_id=u.id and status='active') then
   raise exception 'Revoke linked driver access using contract 0051.' using errcode='23514'; end if;
  if u.id=a and r.role_key='superadmin' then raise exception 'Another Superadmin must revoke this role.' using errcode='23514'; end if;
  alternative:=nullif(p_changes->>'default_context','');
  if u.default_context=r.role_key and r.status<>'revoked' then
   if alternative is null or alternative=r.role_key or not public.user_has_active_role(u.id,alternative) then raise exception 'Choose another current default context.' using errcode='23514'; end if;
   update public.app_users set default_context=alternative,updated_by=a where id=u.id;
  end if;
  update public.app_sessions set ended_at=t,ended_reason=p_reason where app_user_id=u.id and active_context=r.role_key and ended_at is null;
  perform public.revoke_user_role(r.id,p_reason);
 else
  if coalesce(p_changes->>'status','') not in ('active','inactive') or u.status=p_changes->>'status' then raise exception 'Invalid status transition.' using errcode='23514'; end if;
  if p_changes->>'status'='inactive' then
   if u.id=a then raise exception 'Another Superadmin must inactivate this account.' using errcode='23514'; end if;
   select * into l from public.user_driver_links where user_id=u.id and status='active' for update;
   if found then
    insert into elara_private.user_suspended_driver_links(user_id,driver_id,closed_link_id,revocation_ids)
     values(u.id,l.driver_id,l.id,elara_private.user_admin_driver_revocations(l.driver_id));
    update public.user_driver_links set status='inactive',ended_at=t,end_reason=p_reason,ended_by=a where id=l.id;
   end if;
   update public.app_sessions set ended_at=t,ended_reason=p_reason where app_user_id=u.id and ended_at is null;
   update public.app_users set status='inactive',inactive_at=t,inactive_by=a,updated_by=a where id=u.id;
  else
   -- Restore within this transaction before using the active-user role helper.
   -- Every later validation failure rolls this change back.
   update public.app_users set status='active',inactive_at=null,inactive_by=null,updated_by=a where id=u.id;
   if not public.user_has_active_role(u.id,u.default_context) then raise exception 'A current default role is required.' using errcode='23514'; end if;
   perform 1 from public.persons where id=u.person_id and status='active' for update;
   if not found then raise exception 'Active person required.' using errcode='23514'; end if;
   select * into suspension from elara_private.user_suspended_driver_links where user_id=u.id for update;
   if found then
    -- New history row: never reopen a link revoked through 0051 or overwrite history.
    perform 1 from public.drivers where id=suspension.driver_id and person_id=u.person_id and administrative_status='active' and inactive_at is null for update;
    if not found or not public.user_has_active_role(u.id,'conductor') or exists(select 1 from public.user_driver_links where status='active' and (user_id=u.id or driver_id=suspension.driver_id))
     or suspension.revocation_ids<>elara_private.user_admin_driver_revocations(suspension.driver_id) then
     raise exception 'Suspended driver access requires review.' using errcode='23514'; end if;
    insert into public.user_driver_links(user_id,driver_id,created_by) values(u.id,suspension.driver_id,a);
    delete from elara_private.user_suspended_driver_links where user_id=u.id;
   elsif u.default_context='conductor' and not exists(select 1 from public.user_driver_links where user_id=u.id and status='active') then
    raise exception 'Driver portal link required; use 0051.' using errcode='23514';
   end if;
  end if;
 end if;
 select * into u from public.app_users where id=u.id;
 v_result:=jsonb_build_object('user_id',u.id,'version',u.admin_version,'status',u.status,'action',p_action);
 perform public.write_audit_log('administration','permission_change','app_users',u.id,u.human_code,null,v_result,p_reason,jsonb_build_object('control_contract','0057','request_id',p_request_id,'action',p_action),a,null);
 update elara_private.user_admin_requests set state='applied',result=v_result where id=p_request_id;
 return v_result;
end $$;

create function public.admin_prepare_user_invitation(p_request_id uuid,p_details jsonb) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare a uuid; v_result jsonb; v_email text; auth_id uuid; item jsonb; count_roles integer;
begin
 a:=elara_private.user_admin_lock();
 if p_details is null or jsonb_typeof(p_details)<>'object' or exists(select 1 from jsonb_each(p_details) x where x.key<>all(array['email','first_name','last_name','roles','default_context','note','reason','confirm_existing']) or jsonb_typeof(x.value)<>all(case x.key when 'roles' then array['array'] when 'confirm_existing' then array['boolean'] else array['string','null'] end)) then raise exception 'Invalid invitation fields.' using errcode='22023'; end if;
 v_email:=p_details->>'email';
 if v_email is null or v_email<>lower(btrim(v_email)) or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or nullif(btrim(p_details->>'first_name'),'') is null or length(p_details->>'first_name')>100
  or nullif(btrim(p_details->>'last_name'),'') is null or length(p_details->>'last_name')>150
  or nullif(btrim(p_details->>'reason'),'') is null or length(p_details->>'reason')>1000 or length(coalesce(p_details->>'note',''))>2000
  or jsonb_typeof(p_details->'roles') is distinct from 'array' or jsonb_array_length(p_details->'roles') not between 1 and 2
  or coalesce(p_details->>'default_context','') not in ('superadmin','administrativo') then raise exception 'Invalid invitation.' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_details->'roles') loop
  if jsonb_typeof(item)<>'string' or (item#>>'{}') not in ('superadmin','administrativo') or not exists(select 1 from public.roles where key=item#>>'{}' and is_active) then raise exception 'Unsupported invitation role; conductor uses 0051.' using errcode='23514'; end if;
 end loop;
 select count(distinct value) into count_roles from jsonb_array_elements(p_details->'roles');
 if count_roles<>jsonb_array_length(p_details->'roles') or not (p_details->'roles' ? (p_details->>'default_context')) then raise exception 'Invalid default or duplicate roles.' using errcode='22023'; end if;
 v_result:=elara_private.user_admin_receipt(p_request_id,'invite',p_details);
 if v_result is not null then return v_result || jsonb_build_object('session_id',public.current_auth_session_id()); end if;
 select id into auth_id from auth.users where lower(auth.users.email)=v_email;
 if exists(select 1 from public.app_users where auth_user_id=auth_id) then raise exception 'Account already has an application user.' using errcode='23505'; end if;
 if exists(select 1 from public.persons where lower(contact_email)=v_email) then raise exception 'Existing contact identity requires separate review.' using errcode='23514'; end if;
 if auth_id is not null and coalesce((p_details->>'confirm_existing')::boolean,false) is not true then raise exception 'Existing Auth identity needs explicit confirmation.' using errcode='23514'; end if;
 v_result:=jsonb_build_object('state','prepared','request_id',p_request_id);
 update elara_private.user_admin_requests set result=v_result,auth_candidate_id=auth_id where id=p_request_id;
 perform public.write_audit_log('administration','other','app_users',null,null,null,null,p_details->>'reason',jsonb_build_object('control_contract','0057','request_id',p_request_id,'phase','prepare'),a,null);
 return v_result || jsonb_build_object('session_id',public.current_auth_session_id());
end $$;

-- Only the Edge service can claim an external dispatch. User JWT authorizes prepare/finish.
create function public.admin_claim_user_invitation(p_request_id uuid,p_actor_auth_id uuid,p_actor_session_id uuid) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r elara_private.user_admin_requests%rowtype; auth_id uuid;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(451004,3003);perform pg_advisory_xact_lock(hashtextextended('0051/control',0));
 select * into r from elara_private.user_admin_requests where id=p_request_id and kind='invite' for update;
 if not found or not exists(select 1 from public.app_users u where u.id=r.actor and u.auth_user_id=p_actor_auth_id and u.status='active' and public.user_has_active_role(u.id,'superadmin') and exists(select 1 from public.app_sessions s join auth.sessions live on live.id=s.supabase_session_id and live.user_id=u.auth_user_id where s.app_user_id=u.id and s.supabase_session_id=p_actor_session_id and s.active_context='superadmin' and s.ended_at is null and s.expires_at>now())) then raise exception 'Invitation actor unavailable.' using errcode='42501'; end if;
 if not elara_private.user_admin_operation_enabled('invite') then raise exception 'Invitations are not activated.' using errcode='55000'; end if;
 select id into auth_id from auth.users where lower(email)=r.arguments->>'email';
 if r.state='applied' then return jsonb_build_object('state','applied','result',r.result,'send',false); end if;
 if r.auth_candidate_id is not null and auth_id is distinct from r.auth_candidate_id then raise exception 'Approved Auth identity changed.' using errcode='23514'; end if;
 if r.state='prepared' and auth_id is not null and r.auth_candidate_id is null then raise exception 'New Auth identity requires review.' using errcode='23514'; end if;
 if auth_id is not null then return jsonb_build_object('state','reconcile','send',false,'auth_user_id',auth_id); end if;
 if r.state<>'prepared' then return jsonb_build_object('state','pending','send',false); end if;
 update elara_private.user_admin_requests set state='dispatching' where id=r.id;
 return jsonb_build_object('state','dispatching','send',true,'email',r.arguments->>'email');
end $$;

create function public.admin_complete_user_invitation(p_request_id uuid,p_auth_user_id uuid) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare a uuid; r elara_private.user_admin_requests%rowtype; au auth.users%rowtype; person uuid; app uuid; key text; v_result jsonb;
begin
 a:=elara_private.user_admin_lock();select * into r from elara_private.user_admin_requests where id=p_request_id and kind='invite' for update;
 if not found or r.actor<>a then raise exception 'Invitation not owned.' using errcode='42501'; end if;
 if not elara_private.user_admin_operation_enabled('invite') then raise exception 'Invitations are not activated.' using errcode='55000'; end if;
 if r.state='applied' then return r.result; end if;
 select * into au from auth.users where id=p_auth_user_id and lower(email)=r.arguments->>'email' for update;
 if not found or to_jsonb(au)->>'deleted_at' is not null or coalesce((to_jsonb(au)->>'is_anonymous')::boolean,false) or coalesce((to_jsonb(au)->>'banned_until')::timestamptz,'-infinity'::timestamptz)>now() then raise exception 'Auth identity unavailable or different.' using errcode='23514'; end if;
 if r.state='prepared' and coalesce((r.arguments->>'confirm_existing')::boolean,false) is not true then raise exception 'External dispatch or existing identity confirmation required.' using errcode='23514'; end if;
 if r.auth_candidate_id is not null then
  if au.id<>r.auth_candidate_id then raise exception 'Approved Auth identity changed.' using errcode='23514'; end if;
 elsif r.state<>'dispatching' or coalesce((to_jsonb(au)->>'invited_at')::timestamptz,'-infinity'::timestamptz)<r.created_at then
  raise exception 'Auth identity is not a confirmed invitation from this attempt.' using errcode='23514';
 end if;
 if exists(select 1 from public.app_users where auth_user_id=au.id) or exists(select 1 from public.persons where lower(contact_email)=r.arguments->>'email') then raise exception 'Identity now conflicts; review.' using errcode='23505'; end if;
 insert into public.persons(first_name,last_name,contact_email,created_by,updated_by) values(btrim(r.arguments->>'first_name'),btrim(r.arguments->>'last_name'),r.arguments->>'email',a,a) returning id into person;
 insert into public.app_users(auth_user_id,person_id,default_context,internal_note,created_by,updated_by) values(au.id,person,r.arguments->>'default_context',nullif(btrim(r.arguments->>'note'),''),a,a) returning id into app;
 for key in select value from jsonb_array_elements_text(r.arguments->'roles') loop perform public.assign_user_role(app,key,r.arguments->>'reason'); end loop;
 v_result:=jsonb_build_object('state','applied','user_id',app,'request_id',p_request_id);
 perform public.write_audit_log('administration','permission_change','app_users',app,null,null,v_result,r.arguments->>'reason',jsonb_build_object('control_contract','0057','request_id',p_request_id,'phase','complete'),a,null);
 update elara_private.user_admin_requests set state='applied',result=v_result where id=r.id;
 return v_result;
end $$;

do $acl$ declare r record; begin
 for r in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='elara_private' and p.proname in ('user_admin_version','user_admin_dependency','user_admin_actor','user_admin_lock','user_admin_receipt')) or (n.nspname='public' and p.proname in ('admin_get_user_control','admin_get_user_request','admin_manage_user','admin_prepare_user_invitation','admin_claim_user_invitation','admin_complete_user_invitation')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  if r.nspname='public' then execute format('grant execute on function %s to %I',r.signature,case when r.proname='admin_claim_user_invitation' then 'service_role' else 'authenticated' end);end if;
 end loop;
end $acl$;
commit;
