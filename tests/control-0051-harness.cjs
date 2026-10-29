/* Disposable local databases only. Auth columns below model the Admin API boundary;
 * no network calls or real invitations. Legacy seed is historical fixture data. */
const assert=require('node:assert/strict'),fs=require('fs'),{randomUUID}=require('crypto');
const old=require('./financial-0050-harness.cjs');
const migration=fs.readFileSync(require('path').join(__dirname,'../supabase/migrations/0051_driver_portal_access_and_operational_central.sql'),'utf8');
const OLD='60000000-0000-4000-8000-000000000100',SOURCE='60000000-0000-4000-8000-000000000001';
async function bootstrap(db){await old.bootstrap(db);await db.exec('alter table auth.users add column email text; alter table auth.users add column email_confirmed_at timestamptz; create unique index local_auth_email on auth.users(lower(email)) where email is not null; create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id))');await db.exec(migration);}
function api(db){const a=old.api(db);return {...a,
 async fixture(){const operator=await a.identity('superadmin');await a.claims(operator);const d=await a.rpc('admin_create_driver',[randomUUID(),'Local0051','Driver','internal_driver']);return{operator,id:d.driver_id,email:randomUUID()+'@example.invalid',key:randomUUID()};},
 async begin(f,confirm=false){return Object.values(await a.rpc('admin_begin_driver_portal_access',[f.key,f.id,f.email,'Local0051 access',confirm]))[0];},
 async auth(f){const id=randomUUID();await a.rows('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,f.email]);return id;},
 async link(f,id,confirm=false){return Object.values(await a.rpc('admin_link_driver_portal_access',[f.key,id,confirm]))[0];},
 async context(f){return Object.values(await a.rpc('get_admin_driver_portal_access_context',[f.id]))[0];},
 async revoke(f,key=randomUUID()){return Object.values(await a.rpc('admin_revoke_driver_portal_access',[key,f.id,'Local0051 revoke']))[0];},
 async central(f){
  // Reproduce the already-existing frozen baseline, including its 0-EUR submitted
  // remittance. Triggers are restored BEFORE any operation under test.
  await db.exec("set session_replication_role=replica");try{
   await a.rows("insert into public.cash_accounts(id,name,account_type,driver_id) values($1,'Historical test driver','driver',$2)",[SOURCE,f.id]);
   await a.rows("insert into public.cash_accounts(id,name,account_type) values($1,'Historical QA central','central')",[OLD]);
   for(const [id,amount,code]of [['77000000-0000-4000-8000-000000000001',0,'REM-000001'],['98026310-1aae-4318-9a26-4921729c4005',75,'REM-000002']])
    await a.rows("insert into public.cash_remittances(id,human_code,source_cash_account_id,destination_cash_account_id,driver_id,status,declared_amount,submitted_at) values($1,$2,$3,$4,$5,'submitted',$6,now())",[id,code,SOURCE,OLD,f.id,amount]);
  }finally{await db.exec('set session_replication_role=origin');}
  return Object.values(await a.rpc('get_admin_operational_central_context',[]))[0];
 },
 async initialize(f,c,key=randomUUID(),ack=true){return Object.values(await a.rpc('admin_initialize_operational_central',[key,c.old_id,c.snapshot,'Operational local central','Local0051 reviewed transition',ack,'EUR']))[0];},
 async snapshot(){const out={};for(const t of ['app_users','user_roles','user_driver_links','app_sessions','cash_accounts','cash_remittances','cash_movements','audit_logs'])out[t]=await a.rows(`select to_jsonb(t) r from public.${t} t order by to_jsonb(t)::text`);return out;}
};}
const cases={
 'authorization, inactive driver, invalid email and request fingerprint fail closed':async db=>{
  const a=api(db),f=await a.fixture();const first=await a.begin(f);assert.deepEqual(await a.begin(f),first);await a.rejects(()=>a.begin({...f,email:'other@example.invalid'}),'23505');
  for(const ctx of ['administrativo','conductor']){const i=await a.identity(ctx);await a.claims(i);await a.rejects(()=>a.begin({...f,key:randomUUID()}),'42501');}
  await a.claims({...f.operator,session:randomUUID()});await a.rejects(()=>a.begin(f),'28000');await a.claims(f.operator);
  await db.exec('set local role anon');await a.rejects(()=>a.begin(f),'42501');await db.exec('reset role');
  await a.rejects(()=>a.begin({...f,key:randomUUID(),email:'bad'}),'22023');
  await a.rows("update public.drivers set administrative_status='inactive',inactive_at=now() where id=$1",[f.id]);await a.rejects(()=>a.begin({...f,key:randomUUID()}),'23514');await a.rejects(()=>a.begin(f),'23514');
 },
 'new Auth identity links person/app/role exactly once and context survives reload':async db=>{
  const a=api(db),f=await a.fixture();assert.equal((await a.context(f)).state,'none');await a.begin(f);assert.equal((await a.context(f)).state,'pending');const id=await a.auth(f),r=await a.link(f,id);
  assert.deepEqual(await a.link(f,id),r);assert.equal((await a.context(f)).state,'active');
  assert.equal(Number(await a.scalar('select count(*) from public.app_users where auth_user_id=$1',[id])),1);
  assert.equal(await a.scalar('select person_id from public.app_users where id=$1',[r.app_user_id]),await a.scalar('select person_id from public.drivers where id=$1',[f.id]));
  for(const t of ['user_roles','user_driver_links'])assert.equal(Number(await a.scalar(`select count(*) from public.${t} where user_id=$1`,[r.app_user_id])),1);
  await a.rejects(()=>a.link(f,randomUUID()),'23505');
 },
 'linked driver can bootstrap the real conductor app_session and read its own RLS identity':async db=>{
  const a=api(db),f=await a.fixture();await a.begin(f);const id=await a.auth(f),r=await a.link(f,id),session=randomUUID();
  await a.rows('insert into auth.sessions(id,user_id) values($1,$2)',[session,id]);
  await a.rows("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,exp:Math.floor(Date.now()/1000)+3600})]);
  const app=await a.rpc('initialize_app_session',['conductor']);assert.equal(app.app_user_id,r.app_user_id);assert.equal(app.active_context,'conductor');
  assert.equal(await a.scalar('select public.rls_current_driver_id()'),f.id);await db.exec('set local role authenticated');
  assert.equal(Number(await a.scalar('select count(*) from public.user_driver_links where driver_id=$1',[f.id])),1);await a.rejects(()=>a.context(f),'42501');await db.exec('reset role');
  await a.claims(f.operator);await a.revoke(f);assert.equal(await a.scalar('select ended_at is not null from public.app_sessions where id=$1',[app.app_session_id]),true);
 },
 'existing compatible partial identity preserves administrative role and default context':async db=>{
  const a=api(db),f=await a.fixture(),id=await a.auth(f);const p=await a.scalar('select person_id from public.drivers where id=$1',[f.id]);
  const user=await a.scalar("insert into public.app_users(auth_user_id,person_id,default_context) values($1,$2,'administrativo') returning id",[id,p]);
  await a.rows("insert into public.user_roles(user_id,role_key) values($1,'administrativo')",[user]);await a.checkpoint();
  assert.equal((await a.begin(f)).state,'requires_review');await a.rejects(()=>a.link(f,id),'23514');
  const r=await a.link(f,id,true);assert.equal(r.app_user_id,user);assert.equal(await a.scalar('select default_context from public.app_users where id=$1',[user]),'administrativo');
  const second={...f,key:randomUUID()};await a.begin(second,true);await a.link(second,id);assert.equal(Number(await a.scalar("select count(*) from public.user_roles where user_id=$1 and role_key='conductor'",[user])),1);
 },
 'another person, conflicting link, inactive user and expired role cannot be adopted':async db=>{
  const a=api(db),f=await a.fixture(),other=await a.identity('conductor'),id=other.auth;
  await a.claims(f.operator);await a.begin(f);await a.rows('update auth.users set email=$1 where id=$2',[f.email,id]);await a.rejects(()=>a.link(f,id),'23514');
  await db.exec('savepoint conflict');await a.rows('update public.app_users set person_id=(select person_id from public.drivers where id=$1) where id=$2',[f.id,other.user]);
  const d=await a.rpc('admin_create_driver',[randomUUID(),'Other','Driver','internal_driver']);await a.rows('insert into public.user_driver_links(user_id,driver_id) values($1,$2)',[other.user,d.driver_id]);await a.rejects(()=>a.link(f,id),'23514');await db.exec('rollback to conflict; release conflict');
  await a.rows("update public.app_users set person_id=(select person_id from public.drivers where id=$1),status='inactive',inactive_at=now() where id=$2",[f.id,other.user]);await a.rejects(()=>a.link(f,id),'23514');
 },
 'revocation closes conductor sessions, preserves Auth/history, and blocks stale invitation replay':async db=>{
  const a=api(db),f=await a.fixture();await a.begin(f);const id=await a.auth(f),r=await a.link(f,id);
  await a.claims(null);await a.rows("insert into public.app_sessions(auth_user_id,app_user_id,supabase_session_id,active_context,expires_at) values($1,$2,$3,'conductor',now()+interval '1 day')",[id,r.app_user_id,randomUUID()]);await a.checkpoint();await a.claims(f.operator);
  const key=randomUUID(),v=await a.revoke(f,key);assert.deepEqual(await a.revoke(f,key),v);assert.equal((await a.context(f)).state,'revoked');
  assert.equal(await a.scalar('select status from public.app_users where id=$1',[r.app_user_id]),'inactive');
  assert.equal(Number(await a.scalar('select count(*) from public.app_sessions where app_user_id=$1 and ended_at is null',[r.app_user_id])),0);
  assert.equal(Number(await a.scalar('select count(*) from auth.users where id=$1',[id])),1);assert.equal(Number(await a.scalar('select count(*) from public.user_driver_links where user_id=$1',[r.app_user_id])),1);
  await a.rejects(()=>a.link(f,id),'23514');await a.rejects(()=>a.begin({...f,key:randomUUID()},true),'23514');
 },
 'multi-role revocation keeps administrative sessions/default and can invalidate pending attempts':async db=>{
  const a=api(db),f=await a.fixture();await a.begin(f);const id=await a.auth(f),r=await a.link(f,id);await a.rpc('assign_user_role',[r.app_user_id,'administrativo','Local additional role']);
  await a.claims(null);await a.rows("insert into public.app_sessions(auth_user_id,app_user_id,supabase_session_id,active_context,expires_at) values($1,$2,$3,'administrativo',now()+interval '1 day')",[id,r.app_user_id,randomUUID()]);await a.claims(f.operator);
  await a.revoke(f);assert.equal(await a.scalar('select status from public.app_users where id=$1',[r.app_user_id]),'active');assert.equal(await a.scalar('select default_context from public.app_users where id=$1',[r.app_user_id]),'administrativo');
  assert.equal(Number(await a.scalar('select count(*) from public.app_sessions where app_user_id=$1 and ended_at is null',[r.app_user_id])),1);
  const g=await a.fixture();await a.begin(g);await a.revoke(g);const gid=await a.auth(g);await a.rejects(()=>a.link(g,gid),'23514');
 },
 'central transition preserves exact legacy remittances and zero financial artifacts':async db=>{
  const a=api(db),f=await a.fixture(),c=await a.central(f),before=await a.rows('select to_jsonb(r) r from public.cash_remittances r order by id');
  await a.rejects(()=>a.initialize(f,c,randomUUID(),false),'23514');await a.rejects(()=>a.initialize(f,{...c,old_id:randomUUID()}),'23514');
  const key=randomUUID(),r=await a.initialize(f,c,key);assert.deepEqual(await a.initialize(f,c,key),r);
  await a.rejects(()=>a.initialize(f,{...c,snapshot:{}},key),'23505');assert.equal(await a.scalar('select status from public.cash_accounts where id=$1',[OLD]),'suspended');
  assert.equal(Number(await a.scalar("select count(*) from public.cash_accounts where account_type='central' and status='active'")),1);
  assert.equal(Number(await a.scalar('select opening_balance from public.cash_accounts where id=$1',[r.new_id])),0);
  assert.deepEqual(await a.rows('select to_jsonb(r) r from public.cash_remittances r order by id'),before);assert.equal(Number(await a.scalar('select count(*) from public.cash_movements')),0);
  await db.exec('savepoint verify_suspended');await db.exec('set session_replication_role=replica');
  await a.rows("update public.cash_remittances set status='received',received_at=now(),received_by_user_id=$1 where id='98026310-1aae-4318-9a26-4921729c4005'",[f.operator.user]);await db.exec('set session_replication_role=origin');
  await a.rejects(async()=>{try{await a.rows("select * from elara_private.verify_cash_remittance_transfer('98026310-1aae-4318-9a26-4921729c4005',75)");}catch(e){assert.match(e.message,/active source and destination/i);throw e;}},'23514');
  await db.exec('rollback to verify_suspended; release verify_suspended');assert.deepEqual(await a.rows('select to_jsonb(r) r from public.cash_remittances r order by id'),before);
 },
 'central snapshot drift and unexpected references are rejected even with a fresh snapshot':async db=>{
  const a=api(db),f=await a.fixture(),c=await a.central(f);await a.rows("update public.cash_accounts set notes='changed' where id=$1",[OLD]);await a.rejects(()=>a.initialize(f,c),'40001');
  await a.rows('update public.cash_accounts set opening_balance=1 where id=$1',[OLD]);const changed=Object.values(await a.rpc('get_admin_operational_central_context',[]))[0];await a.rejects(()=>a.initialize(f,changed),'23514');
 },
 'forced failures rollback app/role/link/audit/receipt and both central writes':async db=>{
  const a=api(db),f=await a.fixture();await a.begin(f);const id=await a.auth(f);
  for(const table of ['app_users','user_roles','user_driver_links','audit_logs']){
   await db.exec('savepoint injected');await db.exec(`create function public.local_0051_fault() returns trigger language plpgsql as $$begin raise exception 'Injected 0051 failure' using errcode='P0001';end$$;create trigger local_0051_fault after insert on public.${table} for each row execute function public.local_0051_fault()`);
   const before=await a.snapshot();await a.rejects(()=>a.link(f,id),'P0001');assert.deepEqual(await a.snapshot(),before);await db.exec('rollback to injected; release injected');
  }
  const c=await a.central(f);
  for(const [table,event]of [['cash_accounts','update'],['cash_accounts','insert'],['audit_logs','insert']]){
   await db.exec('savepoint injected');await db.exec(`create function public.local_0051_fault() returns trigger language plpgsql as $$begin raise exception 'Injected 0051 failure' using errcode='P0001';end$$;create trigger local_0051_fault after ${event} on public.${table} for each row execute function public.local_0051_fault()`);
   const before=await a.snapshot();await a.rejects(()=>a.initialize(f,c),'P0001');assert.deepEqual(await a.snapshot(),before);await db.exec('rollback to injected; release injected');
  }
 },
 'expired conductor role is not reactivated and deferred audit failure rolls back the receipt':async db=>{
  const a=api(db),f=await a.fixture(),id=await a.auth(f),person=await a.scalar('select person_id from public.drivers where id=$1',[f.id]);
  const user=await a.scalar("insert into public.app_users(auth_user_id,person_id,default_context) values($1,$2,'administrativo') returning id",[id,person]);
  await a.rows("insert into public.user_roles(user_id,role_key) values($1,'administrativo')",[user]);
  await a.rows("insert into public.user_roles(user_id,role_key,starts_at,ends_at) values($1,'conductor',now()-interval '1 day',now()-interval '1 minute')",[user]);await a.checkpoint();
  await a.begin(f,true);await a.rejects(()=>a.link(f,id,true),'23514');
  const g=await a.fixture();await a.begin(g);const gid=await a.auth(g);await db.exec("create function public.local_deferred_fault() returns trigger language plpgsql as $$begin raise exception 'Deferred receipt failure' using errcode='P0001';end$$;create constraint trigger local_deferred_fault after insert on public.audit_logs deferrable initially deferred for each row execute function public.local_deferred_fault()");
  const before=await a.snapshot();await a.rejects(()=>a.link(g,gid),'P0001');assert.deepEqual(await a.snapshot(),before);
 },
 'revocation rollback is atomic across link, role, user, sessions and receipt':async db=>{
  const a=api(db),f=await a.fixture();await a.begin(f);const id=await a.auth(f),r=await a.link(f,id);await a.claims(null);
  await a.rows("insert into public.app_sessions(auth_user_id,app_user_id,supabase_session_id,active_context,expires_at) values($1,$2,$3,'conductor',now()+interval '1 day')",[id,r.app_user_id,randomUUID()]);await a.checkpoint();await a.claims(f.operator);
  for(const [table,event]of [['user_driver_links','update'],['user_roles','update'],['app_users','update'],['app_sessions','update'],['audit_logs','insert']]){
   await db.exec('savepoint revoke_fault');await db.exec(`create function public.local_revoke_fault() returns trigger language plpgsql as $$begin raise exception 'Revoke failure' using errcode='P0001';end$$;create trigger local_revoke_fault after ${event} on public.${table} for each row execute function public.local_revoke_fault()`);const before=await a.snapshot();await a.rejects(()=>a.revoke(f),'P0001');assert.deepEqual(await a.snapshot(),before);await db.exec('rollback to revoke_fault; release revoke_fault');
  }
 },
 'central snapshots include historical items/reservations and preserve them unchanged':async db=>{
  const a=api(db),f=await a.fixture(),c=await a.central(f),movement=randomUUID();await db.exec('set session_replication_role=replica');
  try{
   await a.rows("insert into public.cash_movements(id,human_code,cash_account_id,movement_type,movement_category,amount) values($1,'CASH-900051',$2,'inflow','other',75)",[movement,SOURCE]);
   await a.rows("insert into public.cash_remittance_items(remittance_id,cash_movement_id,amount) values('98026310-1aae-4318-9a26-4921729c4005',$1,75)",[movement]);
   await a.rows("insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,remittance_id,amount,status,created_by,updated_by) values($1,$2,$3,'EUR','remittance','98026310-1aae-4318-9a26-4921729c4005',75,'reserved',$4,$4)",[movement,f.id,SOURCE,f.operator.user]);
  }finally{await db.exec('set session_replication_role=origin');}
  await a.rejects(()=>a.initialize(f,c),'40001');const fresh=Object.values(await a.rpc('get_admin_operational_central_context',[]))[0];assert.equal(fresh.snapshot.remittance_items.length,1);assert.equal(fresh.snapshot.remittance_sources.length,1);
  const items=await a.rows('select to_jsonb(x) r from public.cash_remittance_items x'),sources=await a.rows('select to_jsonb(x) r from public.driver_cash_source_allocations x');await a.initialize(f,fresh);
  assert.deepEqual(await a.rows('select to_jsonb(x) r from public.cash_remittance_items x'),items);assert.deepEqual(await a.rows('select to_jsonb(x) r from public.driver_cash_source_allocations x'),sources);assert.equal(Number(await a.scalar('select count(*) from public.cash_movements')),1);
 },
 'RPC ownership, helpers, grants and existing RLS/DML restrictions are explicit':async db=>{
  const a=api(db);const funcs=await a.rows("select p.oid::regprocedure::text s,n.nspname,p.proconfig,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('control_0051_request','control_0051_receipt','central_0051_snapshot','admin_begin_driver_portal_access','admin_link_driver_portal_access','admin_revoke_driver_portal_access','admin_initialize_operational_central','get_admin_driver_portal_access_context','get_admin_operational_central_context','get_admin_control_receipt')");assert.equal(funcs.length,10);
  for(const f of funcs){assert.equal(f.owner,'postgres');assert.deepEqual(f.proconfig,['search_path=pg_catalog']);for(const role of ['anon','service_role'])assert.equal(await a.scalar('select has_function_privilege($1,$2,\'execute\')',[role,f.s]),false);assert.equal(await a.scalar('select has_function_privilege(\'authenticated\',$1,\'execute\')',[f.s]),f.nspname==='public');}
  for(const t of ['app_users','user_roles','user_driver_links','cash_accounts','audit_logs']){assert.equal(await a.scalar('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+t]),true);for(const priv of ['insert','update','delete'])assert.equal(await a.scalar('select has_table_privilege(\'authenticated\',$1,$2)',['public.'+t,priv]),false);}
 }
};
module.exports={bootstrap,api,cases,migration,OLD,SOURCE};
