-- 0051 capabilities only. No account transition, Auth creation, seed or backfill.
begin;

create unique index audit_logs_0051_receipt_unique
on public.audit_logs ((metadata->>'request_key'),(metadata->>'phase'))
where metadata->>'control_contract'='0051';
create index audit_logs_0051_driver_idx on public.audit_logs(entity_id,created_at desc)
where metadata->>'control_contract'='0051';

-- Low-volume control-plane operations serialize with each other. They never call
-- Auth or perform HTTP inside a transaction. Authorization precedes every replay.
create function elara_private.control_0051_request(p_key uuid,p_scope text,p_phase text,p_args jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare a uuid; r public.audit_logs%rowtype; h text;
begin
 a:=public.require_superadmin_user();
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required.' using errcode='0A000'; end if;
 if p_key is null then raise exception 'Request key required.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('0051/control',0));
 h:=encode(extensions.digest(p_args::text,'sha256'),'hex');
 select * into r from public.audit_logs where metadata->>'control_contract'='0051' and metadata->>'request_key'=p_key::text order by created_at,id limit 1;
 if found and (r.actor_app_user_id is distinct from a or r.metadata->>'scope' is distinct from p_scope) then
  raise exception 'Request key belongs to another actor/operation.' using errcode='23505'; end if;
 select * into r from public.audit_logs where metadata->>'control_contract'='0051' and metadata->>'request_key'=p_key::text and metadata->>'phase'=p_phase;
 if found then
  if r.metadata->>'fingerprint' is distinct from h then raise exception 'Request payload changed.' using errcode='23505'; end if;
  return r.metadata->'result';
 end if;
 return null;
end $$;

create function elara_private.control_0051_receipt(p_key uuid,p_scope text,p_phase text,p_args jsonb,p_entity uuid,p_result jsonb,p_reason text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare a uuid; audit_id uuid; result jsonb;
begin
 a:=public.require_superadmin_user();
 audit_id:=public.secure_audit('permission_change',case when p_scope='central' then 'cash_accounts' else 'drivers' end,
  p_entity,null,null,p_result,p_reason,jsonb_build_object('control_contract','0051','request_key',p_key,'scope',p_scope,
  'phase',p_phase,'fingerprint',encode(extensions.digest(p_args::text,'sha256'),'hex'),'arguments',p_args,'result',p_result),a,null);
 -- Audit identity can be found by request key; no mutation of append-only audit.
 result:=p_result;
 return result;
end $$;

create function public.admin_begin_driver_portal_access(p_request_id uuid,p_driver_id uuid,p_email text,p_reason text,p_confirm_existing boolean default false)
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
 if result is not null then return result; end if;
 -- A pending request for the same actor/email is canonical, even across reloads.
 select * into prior from public.audit_logs a where a.entity_id=d.id and a.metadata->>'control_contract'='0051'
  and a.metadata->>'phase'='begin'
  and not exists(select 1 from public.audit_logs l where l.metadata->>'control_contract'='0051' and l.metadata->>'phase'='link' and l.metadata->>'request_key'=a.metadata->>'request_key')
  and not exists(select 1 from public.audit_logs v where v.entity_id=d.id and v.metadata->>'control_contract'='0051' and v.metadata->>'phase'='revoke' and v.created_at>=a.created_at)
 order by a.created_at,a.id limit 1;
 if found then
  if prior.actor_app_user_id<>public.require_superadmin_user() or prior.metadata->'arguments' is distinct from args then
   raise exception 'Another pending access attempt requires review.' using errcode='23514'; end if;
  result:=prior.metadata->'result';
 else
  result:=jsonb_build_object('request_id',p_request_id,'driver_id',d.id,'email',v_email,'auth_user_id',auth_id,
   'confirm_existing',p_confirm_existing,'state',case when auth_id is not null and not p_confirm_existing then 'requires_review' else 'pending' end);
 end if;
 return elara_private.control_0051_receipt(p_request_id,'access','begin',args,d.id,result,reason);
end $$;

create function public.admin_link_driver_portal_access(p_request_id uuid,p_auth_user_id uuid,p_confirm_existing_identity boolean default false)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare args jsonb:=jsonb_build_object('auth_user_id',p_auth_user_id,'confirm_existing',p_confirm_existing_identity); result jsonb; b public.audit_logs%rowtype;
 d public.drivers%rowtype; u public.app_users%rowtype; au auth.users%rowtype; link_id uuid; role_id uuid;
begin
 result:=elara_private.control_0051_request(p_request_id,'access','link',args);
 select * into b from public.audit_logs where metadata->>'control_contract'='0051' and metadata->>'request_key'=p_request_id::text and metadata->>'phase'='begin';
 if not found then raise exception 'Begin access first.' using errcode='23503'; end if;
 if exists(select 1 from public.audit_logs a where a.entity_id=b.entity_id and a.metadata->>'control_contract'='0051' and a.metadata->>'phase'='revoke' and a.created_at>=b.created_at) then
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

create function public.admin_revoke_driver_portal_access(p_request_id uuid,p_driver_id uuid,p_reason text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare args jsonb:=jsonb_build_object('driver',p_driver_id,'reason',nullif(btrim(p_reason),'')); result jsonb;
 l public.user_driver_links%rowtype; u public.app_users%rowtype; alternative text; a uuid; t timestamptz:=clock_timestamp();
begin
 result:=elara_private.control_0051_request(p_request_id,'revoke','revoke',args);
 if result is not null then return result; end if;
 a:=public.require_superadmin_user();
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Bounded reason required.' using errcode='22023'; end if;
 perform 1 from public.drivers where id=p_driver_id for update;
 if not found then raise exception 'Driver not found.' using errcode='23503'; end if;
 select * into l from public.user_driver_links where driver_id=p_driver_id and status='active' for update;
 if found then
  select * into u from public.app_users where id=l.user_id for update;
  update public.user_driver_links set status='inactive',ended_at=t,end_reason=btrim(p_reason),ended_by=a where id=l.id;
  select r.role_key into alternative from public.user_roles r join public.roles k on k.key=r.role_key and k.is_active
   where r.user_id=u.id and r.role_key<>'conductor' and r.status='active' and r.starts_at<=now() and (r.ends_at is null or r.ends_at>now()) order by r.role_key limit 1;
  update public.user_roles set status='revoked',revoked_at=t,ends_at=t,revoked_by=a,reason=btrim(p_reason) where user_id=u.id and role_key='conductor' and status='active';
  if alternative is null then
   update public.app_users set status='inactive',inactive_at=t,inactive_by=a,updated_by=a where id=u.id;
  elsif not public.user_has_active_role(u.id,u.default_context) then
   update public.app_users set default_context=alternative,updated_by=a where id=u.id;
  end if;
  update public.app_sessions set ended_at=t,ended_reason=btrim(p_reason) where app_user_id=u.id and active_context='conductor' and ended_at is null;
 end if;
 -- Also invalidates pending, not-yet-linked invitations through this receipt.
 result:=jsonb_build_object('request_id',p_request_id,'driver_id',p_driver_id,'app_user_id',u.id,'state','revoked');
 return elara_private.control_0051_receipt(p_request_id,'revoke','revoke',args,p_driver_id,result,btrim(p_reason));
end $$;

create function public.get_admin_driver_portal_access_context(p_driver_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare l public.user_driver_links%rowtype; u public.app_users%rowtype; b public.audit_logs%rowtype; v public.audit_logs%rowtype; confirmed boolean; state text;
begin
 perform public.require_superadmin_user();
 if not exists(select 1 from public.drivers where id=p_driver_id) then raise exception 'Driver not found.' using errcode='23503'; end if;
 select * into l from public.user_driver_links where driver_id=p_driver_id and status='active';
 select * into u from public.app_users where id=l.user_id;
 select email_confirmed_at is not null into confirmed from auth.users where id=u.auth_user_id;
 select * into b from public.audit_logs where entity_id=p_driver_id and metadata->>'control_contract'='0051' and metadata->>'phase'='begin' order by created_at desc,id desc limit 1;
 select * into v from public.audit_logs where entity_id=p_driver_id and metadata->>'control_contract'='0051' and metadata->>'phase'='revoke' order by created_at desc,id desc limit 1;
 state:=case when l.id is not null and (u.status<>'active' or not public.user_has_active_role(u.id,'conductor')) then 'requires_review'
  when l.id is not null then case when confirmed then 'active' else 'pending' end
  when v.id is not null and (b.id is null or v.created_at>=b.created_at) then 'revoked'
  when b.id is not null then b.metadata->'result'->>'state' else 'none' end;
 return jsonb_build_object('driver_id',p_driver_id,'state',state,'app_user_id',u.id,'attempt',case when b.id is not null and (v.id is null or v.created_at<b.created_at) then
  jsonb_build_object('request_id',b.metadata->'result'->>'request_id','email',b.metadata->'arguments'->>'email','reason',b.reason,'confirm_existing',b.metadata->'arguments'->'confirm_existing',
   'owned',b.actor_app_user_id=public.require_superadmin_user()) end,
  'candidate_auth_user_id',(select id from auth.users where lower(email)=b.metadata->'arguments'->>'email'),
  'linked_result',(select metadata->'result' from public.audit_logs where metadata->>'control_contract'='0051' and metadata->>'phase'='link' and metadata->>'request_key'=b.metadata->'result'->>'request_id'));
end $$;

create function public.get_admin_control_receipt(p_request_id uuid,p_scope text,p_phase text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare a uuid; r public.audit_logs%rowtype;
begin
 a:=public.require_superadmin_user();
 select * into r from public.audit_logs where metadata->>'control_contract'='0051' and metadata->>'request_key'=p_request_id::text and metadata->>'phase'=p_phase;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if r.actor_app_user_id<>a or r.metadata->>'scope' is distinct from p_scope then raise exception 'Receipt belongs to another actor/operation.' using errcode='42501'; end if;
 return jsonb_build_object('status','applied','result',r.metadata->'result','audit_id',r.id);
end $$;

create function elara_private.central_0051_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('account',(select to_jsonb(a) from public.cash_accounts a where a.id=p_id),
 'movements',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cash_movements x where x.cash_account_id=p_id),
 'remittances',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cash_remittances x where x.source_cash_account_id=p_id or x.destination_cash_account_id=p_id),
 'remittance_items',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cash_remittance_items x where x.remittance_id in (select id from public.cash_remittances where source_cash_account_id=p_id or destination_cash_account_id=p_id)),
 'remittance_sources',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.driver_cash_source_allocations x where x.remittance_id in (select id from public.cash_remittances where source_cash_account_id=p_id or destination_cash_account_id=p_id)),
 'transfer_movements',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cash_movements x where x.remittance_id in (select id from public.cash_remittances where source_cash_account_id=p_id or destination_cash_account_id=p_id)),
 'counts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cash_counts x where x.cash_account_id=p_id),
 'discrepancies',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.cash_discrepancies x where x.cash_account_id=p_id),
 'expense_payments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.expense_payments x where x.cash_account_id=p_id),
 'reimbursements',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.expense_reimbursements x where x.cash_account_id=p_id),
 'settlement_payments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.settlement_payments x where x.cash_account_id=p_id),
 'sources',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.driver_cash_source_allocations x where x.cash_account_id=p_id));
$$;

create function public.get_admin_operational_central_context()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare id uuid; s jsonb;
begin
 perform public.require_superadmin_user();
 select a.id into id from public.cash_accounts a where account_type='central' and status='active';
 s:=elara_private.central_0051_snapshot(id);
 return jsonb_build_object('old_id',id,'snapshot',s,'eligible',id='60000000-0000-4000-8000-000000000100'::uuid);
end $$;

create function public.admin_initialize_operational_central(p_request_id uuid,p_expected_old_id uuid,p_expected_snapshot jsonb,p_new_name text,p_reason text,p_acknowledge_frozen_qa boolean,p_currency_code text default 'EUR')
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare args jsonb; result jsonb; s jsonb; a uuid; new_id uuid; r jsonb;
begin
 args:=jsonb_build_object('old',p_expected_old_id,'snapshot',p_expected_snapshot,'name',nullif(btrim(p_new_name),''),'reason',nullif(btrim(p_reason),''),'acknowledge',p_acknowledge_frozen_qa,'currency',p_currency_code);
 result:=elara_private.control_0051_request(p_request_id,'central','central',args);
 if result is not null then return result; end if;
 a:=public.require_superadmin_user();
 if p_expected_old_id is distinct from '60000000-0000-4000-8000-000000000100'::uuid or p_currency_code is distinct from 'EUR'
  or p_acknowledge_frozen_qa is distinct from true or nullif(btrim(p_new_name),'') is null or length(p_new_name)>150
  or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Explicit reviewed QA central transition required.' using errcode='23514'; end if;
 -- NOWAIT throughout: reject busy control state instead of forming lock cycles
 -- with existing financial/remittance transactions. These locks last one RPC.
 perform 1 from public.cash_accounts where id=p_expected_old_id for update nowait;
 lock table public.cash_accounts,public.cash_movements,public.cash_remittances,public.cash_remittance_items,public.cash_counts,public.cash_discrepancies,
  public.expense_payments,public.expense_reimbursements,public.settlement_payments,public.driver_cash_source_allocations in share row exclusive mode nowait;
 s:=elara_private.central_0051_snapshot(p_expected_old_id);
 if s is distinct from p_expected_snapshot then raise exception 'Central snapshot drift; review again.' using errcode='40001'; end if;
 if s->'account'->>'status' is distinct from 'active' or s->'account'->>'account_type' is distinct from 'central'
  or s->'account'->>'currency_code' is distinct from 'EUR' or (s->'account'->>'opening_balance')::numeric is distinct from 0::numeric then
  raise exception 'Unexpected central identity or opening.' using errcode='23514'; end if;
 if exists(select 1 from jsonb_each(s) x where jsonb_array_length(case when x.key in ('account','remittances','remittance_items','remittance_sources') then '[]'::jsonb else x.value end)<>0)
  or jsonb_array_length(s->'remittances')<>2 then raise exception 'Unexpected central activity/references.' using errcode='23514'; end if;
 for r in select value from jsonb_array_elements(s->'remittances') loop
  if r->>'status' is distinct from 'submitted' or r->>'destination_cash_account_id' is distinct from p_expected_old_id::text
   or r->>'source_cash_account_id' is distinct from '60000000-0000-4000-8000-000000000001'
   or r->>'currency_code' is distinct from 'EUR' or r->>'verified_amount' is not null
   or not ((r->>'id'='77000000-0000-4000-8000-000000000001' and (r->>'declared_amount')::numeric=0)
    or (r->>'id'='98026310-1aae-4318-9a26-4921729c4005' and (r->>'declared_amount')::numeric=75)) then
   raise exception 'Pending remittances differ from approved frozen QA baseline.' using errcode='23514'; end if;
 end loop;
 -- Reviewed children stay attached to the 75-EUR legacy remittance. They are
 -- snapshotted/locked too; a fresh snapshot cannot bless a new transfer or debt.
 if exists(select 1 from jsonb_array_elements(s->'remittance_items') x where x->>'remittance_id' is distinct from '98026310-1aae-4318-9a26-4921729c4005')
  or coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(s->'remittance_items') x),0)>75
  or exists(select 1 from jsonb_array_elements(s->'remittance_sources') x where x->>'remittance_id' is distinct from '98026310-1aae-4318-9a26-4921729c4005'
   or x->>'cash_account_id' is distinct from '60000000-0000-4000-8000-000000000001' or x->>'allocation_type' is distinct from 'remittance'
   or x->>'status' is distinct from 'reserved' or x->>'currency_code' is distinct from 'EUR')
  or coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(s->'remittance_sources') x),0)>75 then
  raise exception 'Unexpected historical remittance children.' using errcode='23514'; end if;
 update public.cash_accounts set status='suspended',updated_by=a where id=p_expected_old_id;
 insert into public.cash_accounts(name,account_type,currency_code,opening_balance,created_by,updated_by,notes)
  values(btrim(p_new_name),'central','EUR',0,a,a,'Operational central initialized through explicit 0051 control action.') returning id into new_id;
 result:=jsonb_build_object('request_id',p_request_id,'old_id',p_expected_old_id,'old_status','suspended','new_id',new_id,'new_status','active','opening_balance',0,'currency_code','EUR','state','initialized');
 return elara_private.control_0051_receipt(p_request_id,'central','central',args,p_expected_old_id,result,btrim(p_reason));
end $$;

do $security$
declare f record;
begin
 for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='elara_private' and p.proname in ('control_0051_request','control_0051_receipt','central_0051_snapshot'))
  or (n.nspname='public' and p.proname in ('admin_begin_driver_portal_access','admin_link_driver_portal_access','admin_revoke_driver_portal_access',
   'get_admin_driver_portal_access_context','get_admin_operational_central_context','admin_initialize_operational_central','get_admin_control_receipt')) loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $security$;
commit;
