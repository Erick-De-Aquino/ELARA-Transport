/* ELARA 0052: disposable local Auth model and real SQL assertions only.
 * No seed, frozen QA, network, real credentials or disabled triggers/RLS. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const old=require('./control-0051-harness.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/0052_initial_superadmin_bootstrap.sql'),'utf8');
async function bootstrap(db){await old.bootstrap(db);await db.exec('alter table auth.users add column is_anonymous boolean default false; alter table auth.users add column deleted_at timestamptz; alter table auth.users add column banned_until timestamptz');await db.exec(migration);}
function api(db){const a=old.api(db);return {...a,
 async fixture(){await a.claims(null);const f={key:randomUUID(),auth:randomUUID(),email:randomUUID()+'@example.invalid',first:'Local0052',last:'Dedicated',reason:'Local bootstrap verification',operator:'Local fixture operator'};await a.rows('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[f.auth,f.email]);return f;},
 async run(f){return await a.scalar('select elara_private.bootstrap_initial_superadmin($1,$2,$3,$4,$5,$6,$7)',[f.key,f.auth,f.email,f.first,f.last,f.reason,f.operator]);},
 async receipt(f){return a.scalar("select metadata->'result' from public.audit_logs where metadata->>'bootstrap_contract'='0052_initial_superadmin' and request_id=$1",[f.key]);},
 async effective(){return Number(await a.scalar("select count(*) from public.app_users u where public.user_has_active_role(u.id,'superadmin')"));},
 async receipts(){return Number(await a.scalar("select count(*) from public.audit_logs where metadata->>'bootstrap_contract'='0052_initial_superadmin' and metadata->>'phase'='applied'"));},
 async snapshot(){const out={};for(const t of ['auth.users','public.persons','public.app_users','public.user_roles','public.app_sessions','public.user_driver_links','public.audit_logs'])out[t]=await a.rows(`select to_jsonb(t) as row from ${t} t order by to_jsonb(t)::text`);return out;}
};}
const cases={
 'valid bootstrap creates one dedicated person, app user, unbounded role and permanent receipt':async db=>{
  const a=api(db),f=await a.fixture();assert.equal(await a.effective(),0);const r=await a.run(f);await a.checkpoint();assert.equal(await a.effective(),1);assert.equal(await a.receipts(),1);assert.equal(r.auth_user_id,f.auth);
  assert.deepEqual(await a.rows('select first_name,last_name,contact_email,status from public.persons where id=$1',[r.person_id]),[{first_name:f.first,last_name:f.last,contact_email:f.email,status:'active'}]);
  assert.deepEqual(await a.rows('select auth_user_id,person_id,status,default_context from public.app_users where id=$1',[r.app_user_id]),[{auth_user_id:f.auth,person_id:r.person_id,status:'active',default_context:'superadmin'}]);
  const role=(await a.rows('select * from public.user_roles where id=$1',[r.role_id]))[0];assert.equal(role.role_key,'superadmin');assert.equal(role.status,'active');assert.equal(role.ends_at,null);assert.equal(role.assigned_by,null);assert.equal(await a.scalar('select count(*)::int from public.user_driver_links'),0);assert.equal(await a.scalar('select count(*)::int from auth.users'),1);
 },
 'same request recovers immutable receipt read-only and write replay is rejected':async db=>{
  const a=api(db),f=await a.fixture(),r=await a.run(f),before=await a.snapshot();assert.deepEqual(await a.receipt(f),r);await a.rejects(()=>a.run(f),'23514');assert.deepEqual(await a.snapshot(),before);
 },
 'same key incompatible payload and another key permanently fail':async db=>{
  const a=api(db),f=await a.fixture();await a.run(f);for(const field of ['auth','email','first','last','reason','operator'])await a.rejects(()=>a.run({...f,[field]:field==='auth'?randomUUID():'different@example.invalid'}),'23505');await a.rejects(()=>a.run({...f,key:randomUUID()}),'23514');assert.equal(await a.effective(),1);assert.equal(await a.receipts(),1);
 },
 'consumption remains permanent even if effective count becomes zero later':async db=>{
  const a=api(db),f=await a.fixture();await a.run(f);await a.rows("update public.roles set is_active=false where key='superadmin'");assert.equal(await a.effective(),0);await a.rejects(()=>a.run({...f,key:randomUUID()}),'23514');assert.equal(await a.receipts(),1);
 },
 'existing superadmin without a receipt blocks a new bootstrap':async db=>{
  const a=api(db);await a.identity('superadmin');const f=await a.fixture();await a.rejects(()=>a.run(f),'23514');assert.equal(await a.receipts(),0);
 },
 'receipt is globally unique and append-only':async db=>{
  const a=api(db),f=await a.fixture();await a.run(f);await a.rejects(()=>a.rows("insert into public.audit_logs(event_source,action,entity_table,metadata) values('system','permission_change','app_users',jsonb_build_object('bootstrap_contract','0052_initial_superadmin','phase','applied'))"),'23505');
  await a.rejects(()=>a.rows("delete from public.audit_logs where metadata->>'bootstrap_contract'='0052_initial_superadmin'"),'23514');await a.rejects(()=>a.rows("update public.audit_logs set reason='changed' where metadata->>'bootstrap_contract'='0052_initial_superadmin'"),'23514');
 },
 'audit records external technical actor and retains automatic role audit':async db=>{
  const a=api(db),f=await a.fixture(),r=await a.run(f);const receipt=(await a.rows("select * from public.audit_logs where request_id=$1",[f.key]))[0];assert.equal(receipt.actor_app_user_id,null);assert.equal(receipt.actor_auth_user_id,null);assert.equal(receipt.active_context,null);assert.equal(receipt.reason,f.reason);assert.equal(receipt.metadata.operator_reference,f.operator);assert.equal(receipt.metadata.db_effective_role,'postgres');assert.ok(receipt.metadata.db_session_user);assert.deepEqual(receipt.old_data,{effective_superadmins:0,bootstrap_consumed:false});assert.equal(receipt.new_data.effective_superadmins,1);assert.deepEqual(receipt.metadata.result,r);
  assert.equal(await a.scalar("select count(*)::int from public.audit_logs where event_source='database_trigger' and entity_table='user_roles' and entity_id=$1",[r.role_id]),1);assert.doesNotMatch(JSON.stringify(receipt),/password|access_token|refresh_token|service_role|invitation_link/);
 },
 'normal administrative identity and all existing data stay unchanged':async db=>{
  const a=api(db),admin=await a.identity('administrativo');await a.checkpoint();const user=await a.rows('select to_jsonb(u) as row from public.app_users u where id=$1',[admin.user]),roles=await a.rows('select to_jsonb(r) as row from public.user_roles r where user_id=$1',[admin.user]);const f=await a.fixture();await a.run(f);await a.checkpoint();assert.deepEqual(await a.rows('select to_jsonb(u) as row from public.app_users u where id=$1',[admin.user]),user);assert.deepEqual(await a.rows('select to_jsonb(r) as row from public.user_roles r where user_id=$1',[admin.user]),roles);
 },
 'already linked Auth is rejected without promoting administrative user':async db=>{
  const a=api(db),admin=await a.identity('administrativo'),f={...await a.fixture(),email:randomUUID()+'@example.invalid'};await a.rows('update auth.users set email=$1,email_confirmed_at=now() where id=$2',[f.email,admin.auth]);await a.rejects(()=>a.run({...f,auth:admin.auth}),'23514');assert.equal(await a.effective(),0);
 },
 'existing active or inactive person email cannot be adopted or reactivated':async db=>{
  const a=api(db),f=await a.fixture();await a.rows("insert into public.persons(first_name,last_name,contact_email,status,inactive_at) values('Existing','Person',$1,'inactive',now())",[f.email]);await a.rejects(()=>a.run(f),'23514');assert.equal(await a.effective(),0);
 },
 'email normalization is exact and mismatches fail':async db=>{
  const a=api(db),f=await a.fixture();await a.rejects(()=>a.run({...f,email:'different@example.invalid'}),'23514');await a.run({...f,email:'  '+f.email.toUpperCase()+'  '});assert.equal(await a.effective(),1);
 },
 'missing Auth and disabled role catalog fail closed':async db=>{
  const a=api(db),f=await a.fixture();await a.rejects(()=>a.run({...f,auth:randomUUID()}),'23503');await a.rows("update public.roles set is_active=false where key='superadmin'");await a.rejects(()=>a.run(f),'23514');
 },
 'input UUIDs, email, names, reason and operator reference are mandatory':async db=>{
  const a=api(db),f=await a.fixture();for(const [field,value]of [['key',null],['key','00000000-0000-0000-0000-000000000000'],['auth',null],['email','bad'],['first',' '],['last',null],['reason',''],['operator','']])await a.rejects(()=>a.run({...f,[field]:value}),'22023');assert.equal(await a.effective(),0);
 },
 'isolation and application JWT identity are rejected before writes':async db=>{
  const a=api(db),f=await a.fixture();await a.rows("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:randomUUID()})]);await a.rejects(()=>a.run(f),'42501');await a.claims(null);assert.equal(await a.effective(),0);
 },
 'last superadmin role revocation and deletion remain protected':async db=>{
  const a=api(db),f=await a.fixture(),r=await a.run(f);await a.checkpoint();await a.rejects(()=>a.rows("update public.user_roles set status='revoked',revoked_at=now(),ends_at=now() where id=$1",[r.role_id]),'23514');await a.rejects(()=>a.rows('delete from public.user_roles where id=$1',[r.role_id]),'23514');assert.equal(await a.effective(),1);
 },
 'last superadmin application inactivation remains protected':async db=>{
  const a=api(db),r=await a.run(await a.fixture());await a.rejects(()=>a.rows("update public.app_users set status='inactive',inactive_at=now() where id=$1",[r.app_user_id]),'23514');assert.equal(await a.effective(),1);
 },
 'catalog owner, invoker, path and API revocations are exact; no new tables or policies':async db=>{
  const a=api(db),r=(await a.rows("select p.prosecdef,p.proconfig,r.rolname owner from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='elara_private.bootstrap_initial_superadmin(uuid,uuid,text,text,text,text,text)'::regprocedure"))[0];assert.equal(r.owner,'postgres');assert.equal(r.prosecdef,false);assert.deepEqual(r.proconfig,['search_path=pg_catalog']);for(const role of ['anon','authenticated','service_role'])assert.equal(await a.scalar("select has_function_privilege($1,'elara_private.bootstrap_initial_superadmin(uuid,uuid,text,text,text,text,text)','execute')",[role]),false);assert.equal(await a.scalar("select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"),71);assert.equal(await a.scalar("select count(*)::int from pg_policies where schemaname='public'"),77);
 }
};
for(const [label,sql]of Object.entries({unconfirmed:'email_confirmed_at=null',anonymous:'is_anonymous=true',banned:"banned_until=now()+interval '1 day'",deleted:'deleted_at=now()'}))cases['Auth '+label+' fails without partial writes']=async db=>{const a=api(db),f=await a.fixture();await a.rows('update auth.users set '+sql+' where id=$1',[f.auth]);const before=await a.snapshot();await a.rejects(()=>a.run(f),'23514');assert.deepEqual(await a.snapshot(),before);};
for(const role of ['anon','authenticated','service_role'])cases[role+' actual invocation is denied']=async db=>{const a=api(db),f=await a.fixture();await db.exec('set local role '+role);await a.rejects(()=>a.run(f),'42501');await db.exec('reset role');assert.equal(await a.effective(),0);};
for(const stage of ['persons','app_users','user_roles','audit','receipt','deferred','postcondition'])cases['atomic rollback on '+stage+' failure permits a clean retry']=async db=>{
 const a=api(db),f=await a.fixture();await db.exec('savepoint fault_setup');
 let sql;
 if(stage==='deferred')sql="create function public.local_0052_fault() returns trigger language plpgsql as $$begin raise exception 'Local deferred fault' using errcode='P0001';end$$;create constraint trigger local_0052_fault after insert on public.app_users deferrable initially deferred for each row execute function public.local_0052_fault()";
 else if(stage==='postcondition')sql="create function public.local_0052_fault() returns trigger language plpgsql as $$begin new.is_active:=false;return new;end$$;create trigger local_0052_fault before update on public.roles for each row execute function public.local_0052_fault();create function public.local_0052_change() returns trigger language plpgsql as $$begin update public.roles set is_active=false where key='superadmin';return new;end$$;create trigger local_0052_change after insert on public.user_roles for each row execute function public.local_0052_change()";
 else {const table=['audit','receipt'].includes(stage)?'audit_logs':stage;const when=stage==='receipt'?" when (new.metadata->>'bootstrap_contract'='0052_initial_superadmin')":'';sql=`create function public.local_0052_fault() returns trigger language plpgsql as $$begin raise exception 'Local fault' using errcode='P0001';end$$;create trigger local_0052_fault after insert on public.${table} for each row${when} execute function public.local_0052_fault()`;}
 await db.exec(sql);const before=await a.snapshot();await a.rejects(async()=>{await a.run(f);await a.checkpoint();},stage==='postcondition'?'23514':'P0001');assert.deepEqual(await a.snapshot(),before);await db.exec('rollback to fault_setup; release fault_setup');assert.equal(await a.effective(),0);assert.equal(await a.receipts(),0);await a.run(f);await a.checkpoint();assert.equal(await a.effective(),1);
};
module.exports={bootstrap,api,cases,migration};
