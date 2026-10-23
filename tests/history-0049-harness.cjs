/* Local-only fixtures and assertions shared by PGlite and native PostgreSQL.
 * Every semantic scenario runs in a transaction rolled back by its runner.
 * No production UUIDs, credentials, network fallback or frozen QA dependencies.
 */
const assert=require('node:assert/strict');
const {randomUUID,randomInt}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/0049_service_status_history_central_writer.sql'),'utf8');
const ordinal=f=>Number(f.slice(0,4))+Number(f.match(/^\d{4}(\d*)_/)[1]||0)/10;
async function bootstrap(db){
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],updated_at timestamptz);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;`);
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&ordinal(f)<49).sort((a,b)=>ordinal(a)-ordinal(b)))
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8').replace(/^\uFEFF/,''));
}
function api(db){
 const rows=async(s,p=[]) => (await db.query(s,p)).rows;
 const scalar=async(s,p=[])=>Object.values((await rows(s,p))[0])[0];
 const rpc=async(name,args)=>{const result=(await rows(`select * from public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args))[0];await checkpoint();return result;};
 const claims=async(a)=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(a?{sub:a.auth,session_id:a.session}:{})]);
 async function identity(context,driver=null){
  await claims(null);
  const a={auth:randomUUID(),user:randomUUID(),session:randomUUID()};
  await db.query('insert into auth.users(id) values($1)',[a.auth]);
  const p=await scalar("insert into public.persons(first_name,last_name) values('Local0049','Harness') returning id");
  await db.query('insert into public.app_users(id,auth_user_id,person_id,default_context) values($1,$2,$3,$4)',[a.user,a.auth,p,context]);
  await db.query('insert into public.user_roles(user_id,role_key) values($1,$2)',[a.user,context]);
  await db.query("insert into public.app_sessions(auth_user_id,app_user_id,supabase_session_id,active_context,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",[a.auth,a.user,a.session,context]);
  if(driver)await db.query('insert into public.user_driver_links(user_id,driver_id) values($1,$2)',[a.user,driver]);
  return a;
 }
 async function fixtures(){
  const admin=await identity('administrativo');await claims(admin);
  const customer=await rpc('admin_create_individual_customer',[randomUUID(),'Local0049','Customer']);
  const driver=await rpc('admin_create_driver',[randomUUID(),'Local0049','Driver','internal_driver']);
  await rpc('admin_update_driver',[driver.driver_id,'Local harness activation','active']);
  const vehicle=await rpc('admin_create_vehicle',[randomUUID(),`${randomInt(1000,10000)} LHT`,'Local','0049']);
  for(const type of ['insurance','itv','circulation_permit','vtc_license'])await rpc('admin_register_vehicle_document',[randomUUID(),vehicle.vehicle_id,type,'valid',null,'2099-12-31']);
  const link=await rpc('admin_assign_driver_vehicle',[randomUUID(),driver.driver_id,vehicle.vehicle_id]);
  const conductor=await identity('conductor',driver.driver_id);
  return {admin,conductor,customer,driver,vehicle,link};
 }
 async function create(f){await claims(f.admin);const r=await rpc('create_service',[f.customer.customer_id,'transfer','2099-01-01T10:00:00Z','Origin',null,'Destination',null]);return r.service_id;}
 const history=id=>rows('select * from public.service_status_history where service_id=$1 order by changed_at,id',[id]);
 async function accepted(f,id){await claims(f.admin);const a=Object.values(await rpc('assign_service',[id,f.driver.driver_id,f.vehicle.vehicle_id]))[0];await claims(f.conductor);await rpc('accept_service_assignment',[a]);return a;}
 async function checkpoint(){await db.exec('set constraints all immediate; set constraints all deferred');}
 async function rejects(fn,code){await db.exec('savepoint expected_failure');try{await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});}finally{await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');}}
 return {rows,scalar,rpc,claims,identity,fixtures,create,history,accepted,checkpoint,rejects};
}
async function security(db){
 const a=api(db);
 return {
  tables:await a.rows("select c.oid::regclass::text as name,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v') order by name"),
  policies:await a.rows('select * from pg_policies order by schemaname,tablename,policyname'),
  functions:await a.rows("select p.oid::regprocedure::text as name,p.proacl::text,p.prosecdef,p.proconfig,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by name")
 };
}
const cases={
 'create: pending and zero initial history':async(a,f)=>{const id=await a.create(f);assert.equal(await a.scalar('select operational_status from public.services where id=$1',[id]),'pending');assert.equal((await a.history(id)).length,0);await a.checkpoint();},
 'accept: exactly one, driver and backend session':async(a,f)=>{const id=await a.create(f),assignment=await a.accepted(f,id);await a.checkpoint();const h=await a.history(id);assert.equal(h.length,1);assert.equal(h[0].from_status,'pending');assert.equal(h[0].to_status,'confirmed');assert.equal(h[0].changed_by_driver_id,f.driver.driver_id);assert.equal(h[0].changed_by_user_id,null);assert.equal(h[0].assignment_id,assignment);assert.equal(h[0].metadata.session_id,f.conductor.session);},
 'current start/complete: one per transition, stages/events retained':async(a,f)=>{const id=await a.create(f),assignment=await a.accepted(f,id);await a.rpc('start_driver_service',[id]);assert.equal((await a.history(id)).length,2);for(const s of ['waiting_passenger','passenger_on_board','finishing','finished'])await a.rpc('advance_driver_service_progress',[id,s]);await a.checkpoint();const h=await a.history(id);assert.deepEqual(h.map(r=>[r.from_status,r.to_status]),[['pending','confirmed'],['confirmed','in_progress'],['in_progress','completed']]);for(const r of h){assert.equal(r.assignment_id,assignment);assert.equal(r.changed_by_driver_id,f.driver.driver_id);assert.equal(r.changed_by_user_id,null);assert.equal(r.metadata.session_id,f.conductor.session);assert.equal(r.reason,null);}assert.equal(h[1].metadata.driver_stage,'on_way');assert.equal(h[2].metadata.driver_stage,'finished');assert.equal(await a.scalar("select count(*)::int from public.service_events where service_id=$1 and event_type in ('service_started','service_completed')",[id]),2);},
 'legacy wrappers covered; existing complete_service constraint failure remains atomic':async(a,f)=>{const id=await a.create(f);await a.accepted(f,id);for(const name of ['start_service_on_way','mark_service_arrived','mark_passenger_on_board','mark_service_finishing'])await a.rpc(name,[id]);await a.rejects(()=>a.rpc('complete_service',[id,'Local completion']),'23514');await a.checkpoint();assert.deepEqual((await a.history(id)).map(h=>h.to_status),['confirmed','in_progress']);assert.equal(await a.scalar('select operational_status from public.services where id=$1',[id]),'in_progress');},
 'cancel pending/confirmed: admin actor, cancellation/audit/assignment preserved':async(a,f)=>{for(const accepted of [false,true]){const id=await a.create(f);if(accepted)await a.accepted(f,id);await a.claims(f.admin);await a.rpc('cancel_service',[id,'local_test','Local cancellation']);await a.checkpoint();const h=await a.history(id);assert.equal(h.length,accepted?2:1);const r=h.at(-1);assert.equal(r.from_status,accepted?'confirmed':'pending');assert.equal(r.to_status,'cancelled');assert.equal(r.changed_by_user_id,f.admin.user);assert.equal(r.changed_by_driver_id,null);assert.equal(r.metadata.session_id,f.admin.session);assert.equal(r.reason,null);assert.equal(await a.scalar('select count(*)::int from public.service_cancellations where service_id=$1',[id]),1);assert.equal(await a.scalar("select count(*)::int from public.audit_logs where entity_id=$1 and action='cancellation'",[id]),1);if(accepted)assert.equal(await a.scalar('select assignment_status from public.service_assignments where service_id=$1',[id]),'cancelled');}},
 'notes, assign, reassign and same-status updates create no history':async(a,f)=>{const id=await a.create(f);await a.rpc('update_service',[id,null,'Updated notes']);await a.rpc('assign_service',[id,f.driver.driver_id,f.vehicle.vehicle_id]);await a.rpc('reassign_service',[id,f.driver.driver_id,f.vehicle.vehicle_id,'Local reassignment']);await a.rows('update public.services set operational_status=operational_status where id=$1',[id]);await a.checkpoint();assert.equal((await a.history(id)).length,0);},
 'invalid transition: rollback and no ghost':async(a,f)=>{const id=await a.create(f);await a.rpc('cancel_service',[id,'local_test']);await a.rejects(()=>a.rows("update public.services set operational_status='pending' where id=$1",[id]),'23514');assert.equal((await a.history(id)).length,1);assert.equal(await a.scalar('select operational_status from public.services where id=$1',[id]),'cancelled');},
 'post-writer failure is atomic (legacy invalid progress)':async(a,f)=>{const id=await a.create(f);await a.accepted(f,id);await a.rejects(()=>a.rpc('advance_service_progress',[id,'finished']),'23514');assert.equal((await a.history(id)).length,1);assert.equal(await a.scalar('select operational_status from public.services where id=$1',[id]),'confirmed');},
 'future privileged update, no actor/session invented, explicit rollback':async(a,f)=>{const id=await a.create(f);await a.accepted(f,id);await a.claims(null);await a.rows("update public.services set operational_status='in_progress' where id=$1",[id]);await a.checkpoint();let h=await a.history(id);assert.equal(h.length,2);assert.equal(h[1].changed_by_user_id,null);assert.equal(h[1].changed_by_driver_id,null);assert.equal(h[1].metadata.session_id,undefined);await a.rows('savepoint rollback_transition');await a.rows("update public.services set operational_status='in_progress' where id=$1",[id]);await a.rows('rollback to savepoint rollback_transition');assert.equal((await a.history(id)).length,2);},
 'append-only and private writer: no new direct authenticated DML':async(a,f)=>{const id=await a.create(f);await a.rpc('cancel_service',[id,'local_test']);for(const sql of ['update public.service_status_history set reason=reason where service_id=$1','delete from public.service_status_history where service_id=$1'])await a.rejects(()=>a.rows(sql,[id]),'23514');for(const role of ['anon','authenticated','service_role'])assert.equal(await a.scalar("select has_function_privilege($1,'elara_private.write_service_status_history()','execute')",[role]),false);assert.equal(await a.scalar("select has_table_privilege('authenticated','public.service_status_history','insert')"),false);},
 'invalid authenticated session cannot silently erase attribution':async(a,f)=>{const id=await a.create(f);await a.accepted(f,id);await a.claims({auth:f.admin.auth,session:randomUUID()});await a.rejects(()=>a.rows("update public.services set operational_status='in_progress' where id=$1",[id]),'28000');assert.equal((await a.history(id)).length,1);},
 'finance rows unchanged by start/progress/complete':async(a,f)=>{const id=await a.create(f);await a.accepted(f,id);const tables=['service_financials','service_payments','receivables','cash_movements','expenses','settlements','settlement_items','settlement_payments'];const snap=async()=>{const out={};for(const t of tables)out[t]=await a.rows(`select * from public.${t} order by id`);return out;};const before=await snap();await a.rpc('start_driver_service',[id]);for(const s of ['waiting_passenger','passenger_on_board','finishing','finished'])await a.rpc('advance_driver_service_progress',[id,s]);await a.checkpoint();assert.deepEqual(await snap(),before);}
};
module.exports={api,bootstrap,security,cases,migration,root};
