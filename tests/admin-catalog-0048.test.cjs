/* Real PostgreSQL (PGlite), in-memory only. No URL, password, psql or remote connection.
 * Install @electric-sql/pglite@0.5.10 in a disposable directory, set ELARA_PGLITE_ROOT to
 * that directory's node_modules, then: node --test tests/admin-catalog-0048.test.cjs
 * PGlite is single-backend: concurrent promises test retries, not backend lock waits.
 */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const runtime=process.env.ELARA_PGLITE_ROOT;
if(!runtime) throw new Error('Set ELARA_PGLITE_ROOT to isolated PGlite node_modules; no network/database fallback exists.');
const {PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db,baselinePolicies,baselineAssignable;
const actor=randomUUID(),authUser=randomUUID(),session=randomUUID();
const rows=async(s,p=[]) => (await db.query(s,p)).rows;
const scalar=async(s,p=[]) => Object.values((await rows(s,p))[0])[0];
const rpc=async(name,args) => (await rows(`select * from public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args))[0];
const fails=async(fn,code) => assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});
const customer=(first='Customer',email=null,request=randomUUID())=>rpc('admin_create_individual_customer',[request,first,'LocalTest',null,email]);
const driver=(first='Driver',type='internal_driver',license=null)=>rpc('admin_create_driver',[randomUUID(),first,'LocalTest',type,null,null,license]);
let plate=1000;
const vehicle=()=>rpc('admin_create_vehicle',[randomUUID(),`${plate++} BCD`,'Brand','Model']);
const document=(v,type='insurance',status='valid',expiry='2099-12-31',replace=null,reason=null)=>rpc('admin_register_vehicle_document',
 [randomUUID(),v,type,status,null,expiry,null,null,replace,reason]);
async function readyVehicle(){const v=await vehicle();for(const type of ['insurance','itv','circulation_permit','vtc_license'])await document(v.vehicle_id,type);return v;}
async function claims(user=authUser,sid=session){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:sid})]);}

before(async()=>{
 db=new PGlite({extensions:{pgcrypto,btree_gist}});
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],updated_at timestamptz);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 `);
 const ordinal=f=>Number(f.slice(0,4))+Number(f.match(/^\d{4}(\d*)_/)[1]||0)/10;
 const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&ordinal(f)<48).sort((a,b)=>ordinal(a)-ordinal(b));
 // Use every authoritative migration, not mocked business tables/functions.
 for(const f of files){try{await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8').replace(/^\uFEFF/,''));}catch(e){throw new Error(`Baseline migration ${f}: ${e.code} ${e.message}`);}}
 baselinePolicies=await rows('select * from pg_policies order by schemaname,tablename,policyname');
 baselineAssignable=await scalar("select pg_get_functiondef('public.vehicle_is_assignable(uuid)'::regprocedure)");
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/0048_admin_catalog_management.sql'),'utf8'));
 await db.exec('begin');
 await db.query('insert into auth.users(id) values($1)',[authUser]);
 const person=await scalar("insert into public.persons(first_name,last_name) values('Admin','Harness') returning id");
 await db.query("insert into public.app_users(id,auth_user_id,person_id,default_context) values($1,$2,$3,'administrativo')",[actor,authUser,person]);
 await db.query("insert into public.user_roles(user_id,role_key) values($1,'administrativo')",[actor]);
 await db.query("insert into public.app_sessions(auth_user_id,app_user_id,supabase_session_id,active_context,expires_at) values($1,$2,$3,'administrativo',now()+interval '1 day')",[authUser,actor,session]);
 await db.exec('set constraints all immediate; commit');
 await claims();
});
after(async()=>{if(db)await db.close();});

test('AUTH: missing/invalid session and non-admin context',async()=>{
 await claims(null,null);await fails(()=>customer(),'28000');
 await claims(authUser,randomUUID());await fails(()=>customer(),'28000');
 await claims();
 await db.query("insert into public.user_roles(user_id,role_key) values($1,'conductor')",[actor]);
 await db.query("update public.app_sessions set active_context='conductor' where supabase_session_id=$1",[session]);
 await fails(()=>customer(),'42501');
 await db.query("update public.app_sessions set active_context='administrativo' where supabase_session_id=$1",[session]);
});
test('customer create, normalization, immutable replay and cross-operation request collision',async()=>{
 const req=randomUUID();const c=await customer('  Alice  ','ALICE@LOCAL.TEST',req);
 const count=await scalar('select count(*) from public.audit_logs');
 assert.deepEqual(await customer('Alice','alice@local.test',req),c);
 assert.equal(await scalar('select count(*) from public.audit_logs'),count);
 await fails(()=>customer('Other',null,req),'23505');
 await fails(()=>rpc('admin_create_vehicle',[req,'7000 BCD','Brand','Model']),'23505');
 const receipt=(await rows('select * from public.audit_logs where request_id=$1',[req]))[0];
 assert.equal(receipt.actor_app_user_id,actor);assert.equal(receipt.auth_session_id,session);
 assert.equal(receipt.metadata.operation,'admin_customer_created');assert.match(receipt.metadata.fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(receipt.metadata.result.customer_id,c.customer_id);
 await fails(()=>customer('Alice','alice@local.test'),'23505');
 await fails(()=>rpc('admin_create_individual_customer',[null,'Bad','Request']),'22023');
});
test('customer lifecycle preserves active person and forces deferred integrity',async()=>{
 const c=await customer('Lifecycle');
 const initialAudit=await scalar('select count(*) from public.audit_logs');
 await rpc('admin_set_customer_status',[c.customer_id,'new',null]);
 assert.equal(await scalar('select count(*) from public.audit_logs'),initialAudit);
 await db.exec('begin');
 try{
  await rpc('admin_set_customer_status',[c.customer_id,'active','Activate']);
  await rpc('admin_set_customer_status',[c.customer_id,'inactive','Close']);
  await db.exec('set constraints all immediate');
  assert.equal(await scalar('select status from public.persons where id=$1',[c.person_id]),'active');
  assert.equal(await scalar('select status from public.customers where id=$1',[c.customer_id]),'inactive');
  const n=await scalar('select count(*) from public.audit_logs');
  await rpc('admin_set_customer_status',[c.customer_id,'inactive',null]);
  assert.equal(await scalar('select count(*) from public.audit_logs'),n);
  await rpc('admin_set_customer_status',[c.customer_id,'active','Reopen']);
  await fails(()=>rpc('admin_set_customer_status',[c.customer_id,'new','Unsupported']),'23514');
 }finally{await db.exec('rollback');}
 await fails(()=>rpc('admin_set_customer_status',[c.customer_id,'blocked','Unsupported']),'23514');
});
test('customer with nonterminal service cannot be inactivated',async()=>{
 const c=await customer('LiveService');
 await rpc('create_service',[c.customer_id,'transfer','2099-01-01T10:00:00Z','Origin',null,'Destination',null]);
 await fails(()=>rpc('admin_set_customer_status',[c.customer_id,'inactive','Close']),'23514');
});
test('driver creation and lifecycle preserve active person with deferred checks',async()=>{
 const d=await driver('LifecycleDriver');assert.equal(d.availability_preference,'unavailable');
 await db.exec('begin');
 try{
  await rpc('admin_update_driver',[d.driver_id,'Close','inactive']);
  await db.exec('set constraints all immediate');
  assert.equal(await scalar('select status from public.persons where id=$1',[d.person_id]),'active');
  assert.equal(await scalar('select administrative_status from public.drivers where id=$1',[d.driver_id]),'inactive');
  const n=await scalar('select count(*) from public.audit_logs');
  await rpc('admin_update_driver',[d.driver_id,'No-op','inactive']);
  assert.equal(await scalar('select count(*) from public.audit_logs'),n);
 }finally{await db.exec('rollback');}
 await fails(()=>driver('Invalid','other'),'23514');
 await fails(()=>driver('Expired','internal_driver','2000-01-01'),'23514');
 await fails(()=>rpc('admin_update_driver',[d.driver_id,'Unsupported','suspended']),'23514');
});
test('vehicle owned only, duplicate normalized plate, inactivation and replay never reactivate',async()=>{
 const req=randomUUID();const args=[req,'8000 BCD','Brand','Model'];const v=await rpc('admin_create_vehicle',args);
 await fails(()=>rpc('admin_create_vehicle',[randomUUID(),'8000BCD','Brand','Model']),'23505');
 await fails(()=>rpc('admin_create_vehicle',[randomUUID(),'8001 BCD','Brand','Model','external']),'0A000');
 await rpc('admin_inactivate_vehicle',[v.vehicle_id,'Close']);
 const n=await scalar('select count(*) from public.audit_logs');
 await rpc('admin_inactivate_vehicle',[v.vehicle_id,null]);
 assert.equal(await scalar('select count(*) from public.audit_logs'),n);
 assert.deepEqual(await rpc('admin_create_vehicle',args),v);
 assert.notEqual(await scalar('select inactive_at from public.vehicles where id=$1',[v.vehicle_id]),null);
});
test('document requirements, replacement, atomic rollback and metadata-only validity',async()=>{
 const v=await vehicle();
 await fails(()=>document(v.vehicle_id,'unknown'),'23503');
 await fails(()=>document(v.vehicle_id,'insurance','valid',null),'23514');
 await fails(()=>document(v.vehicle_id,'insurance','valid','2000-01-01'),'23514');
 const old=await document(v.vehicle_id);
 await fails(()=>document(v.vehicle_id),'23514');
 await fails(()=>document(v.vehicle_id,'insurance','valid','2099-12-31',randomUUID(),'Replace'),'23514');
 const next=await document(v.vehicle_id,'insurance','valid','2099-12-31',old.document_id,'Renew');
 const record=(await rows('select * from public.vehicle_documents where id=$1',[old.document_id]))[0];
 assert.equal(record.status,'replaced');assert.equal(record.replaced_by_document_id,next.document_id);
 assert.equal(new Date(record.expires_at).toISOString().slice(0,10),'2099-12-31');assert.notEqual(record.replaced_at,null);
 assert.equal(await scalar('select storage_path from public.vehicle_documents where id=$1',[next.document_id]),null);
 for(const t of ['itv','circulation_permit','vtc_license'])await document(v.vehicle_id,t);
 assert.equal(await scalar('select public.vehicle_is_assignable($1)',[v.vehicle_id]),true);
});
test('links reject nonassignable/inactive/second links; close/no-op; dependent lifecycle guards',async()=>{
 const a=await driver('LinkA'),b=await driver('LinkB');const v=await readyVehicle(),other=await readyVehicle(),bad=await vehicle();
 await fails(()=>rpc('admin_assign_driver_vehicle',[randomUUID(),a.driver_id,bad.vehicle_id]),'23514');
 await rpc('admin_update_driver',[b.driver_id,'Inactive','inactive']);
 await fails(()=>rpc('admin_assign_driver_vehicle',[randomUUID(),b.driver_id,v.vehicle_id]),'23514');
 await rpc('admin_update_driver',[b.driver_id,'Active','active']);
 const req=randomUUID();const args=[req,a.driver_id,v.vehicle_id];const link=await rpc('admin_assign_driver_vehicle',args);
 assert.deepEqual(await rpc('admin_assign_driver_vehicle',args),link);
 await fails(()=>rpc('admin_assign_driver_vehicle',[randomUUID(),a.driver_id,other.vehicle_id]),'23505');
 await fails(()=>rpc('admin_assign_driver_vehicle',[randomUUID(),b.driver_id,v.vehicle_id]),'23505');
 await fails(()=>rpc('admin_update_driver',[a.driver_id,'Close','inactive']),'23514');
 await fails(()=>rpc('admin_inactivate_vehicle',[v.vehicle_id,'Close']),'23514');
 await fails(()=>document(v.vehicle_id,'insurance','valid','2099-12-31'),'23514');
 const c=await customer('LinkService');const s=await rpc('create_service',[c.customer_id,'transfer','2099-01-01T11:00:00Z','Origin',null,'Destination',null]);
 await rpc('assign_service',[s.service_id,a.driver_id,v.vehicle_id]);
 await fails(()=>rpc('admin_close_driver_vehicle_assignment',[link.assignment_id,'Close']),'23514');
 await rpc('cancel_service',[s.service_id,'operational_test','Close local fixture']);
 const closed=await rpc('admin_close_driver_vehicle_assignment',[link.assignment_id,'Close']);assert.equal(closed.status,'ended');
 const n=await scalar('select count(*) from public.audit_logs');
 assert.deepEqual(await rpc('admin_close_driver_vehicle_assignment',[link.assignment_id,'Retry']),closed);
 assert.equal(await scalar('select count(*) from public.audit_logs'),n);
 assert.deepEqual(await rpc('admin_assign_driver_vehicle',args),link);
 assert.equal(await scalar('select status from public.driver_vehicle_assignments where id=$1',[link.assignment_id]),'ended');
});
test('audit failure rolls back business rows and consumed codes',async()=>{
 const n=await scalar('select count(*) from public.persons');const code=await scalar("select current_value from public.human_code_counters where prefix='CL'");
 await db.exec(`create function public.test_0048_reject_receipt() returns trigger language plpgsql as $$ begin
 if new.metadata->>'operation'='admin_customer_created' then raise exception 'Injected audit failure' using errcode='23514'; end if; return new; end $$;
 create trigger test_0048_reject_receipt before insert on public.audit_logs for each row execute function public.test_0048_reject_receipt();`);
 try{await fails(()=>customer('AuditFailure'),'23514');}finally{await db.exec('drop trigger test_0048_reject_receipt on public.audit_logs; drop function public.test_0048_reject_receipt()');}
 assert.equal(await scalar('select count(*) from public.persons'),n);
 assert.equal(await scalar("select current_value from public.human_code_counters where prefix='CL'"),code);
});
test('queued concurrent same request produces one receipt/entity (single backend)',async()=>{
 const req=randomUUID();const out=await Promise.all([customer('Concurrent',null,req),customer('Concurrent',null,req)]);
 assert.deepEqual(out[0],out[1]);assert.equal(await scalar('select count(*) from public.audit_logs where request_id=$1',[req]),1);
});
test('driver/document retries and changed-argument requests use dedicated immutable receipts',async()=>{
 const req=randomUUID(),args=[req,'RetryDriver','LocalTest','internal_driver'];
 const d=await rpc('admin_create_driver',args);assert.deepEqual(await rpc('admin_create_driver',args),d);
 await fails(()=>rpc('admin_create_driver',[req,'Changed','LocalTest','internal_driver']),'23505');
 const v=await vehicle(),docRequest=randomUUID(),docArgs=[docRequest,v.vehicle_id,'insurance','valid',null,'2099-12-31'];
 const doc=await rpc('admin_register_vehicle_document',docArgs);assert.deepEqual(await rpc('admin_register_vehicle_document',docArgs),doc);
 await fails(()=>rpc('admin_register_vehicle_document',[docRequest,v.vehicle_id,'insurance','pending',null,'2099-12-31']),'23505');
 for(const request of [req,docRequest])assert.equal(await scalar('select count(*) from public.audit_logs where request_id=$1',[request]),1);
});
test('actual API role cannot invoke private writer, forge actor, or bypass table grants',async()=>{
 await db.exec('set role authenticated');
 try{
  const c=await customer('AuthenticatedRole');assert.ok(c.customer_id);
  await fails(()=>db.query("insert into public.persons(first_name,last_name) values('Forbidden','Direct')"),'42501');
  await fails(()=>db.query("select elara_private.catalog_person('Forbidden','Private',null,null,null)"),'42501');
 }finally{await db.exec('reset role');}
 assert.deepEqual(await rows('select * from pg_policies order by schemaname,tablename,policyname'),baselinePolicies);
 assert.equal(await scalar("select pg_get_functiondef('public.vehicle_is_assignable(uuid)'::regprocedure)"),baselineAssignable);
});
test('catalog grants/ownership/search_path and unchanged person lifecycle',async()=>{
 const functions=await rows("select p.oid,p.proname,p.prosecdef,p.proconfig,r.rolsuper from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname like 'admin_%'");
 assert.equal(functions.length,9);
 for(const f of functions){assert.equal(f.prosecdef,true);assert.equal(f.rolsuper,true);assert.ok(f.proconfig.includes('search_path=public, extensions'));
  assert.equal(await scalar("select has_function_privilege('authenticated',$1::oid,'execute')",[f.oid]),true);
  assert.equal(await scalar("select has_function_privilege('anon',$1::oid,'execute')",[f.oid]),false);}
 for(const table of ['persons','customers','drivers','vehicles','vehicle_documents','driver_vehicle_assignments']){
  for(const permission of ['insert','update','delete'])assert.equal(await scalar("select has_table_privilege('authenticated',$1,$2)",['public.'+table,permission]),false);
 }
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/0048_admin_catalog_management.sql'),'utf8');
 assert.doesNotMatch(sql,/p_inactivate_person|update\s+public\.persons|alter\s+policy|create\s+policy|execute\s+format|sb_secret_/i);
});
test('temporary relation poisoning cannot redirect business or audit writes',async()=>{
 await db.exec('create temp table persons(id uuid); create temp table customers(id uuid); create temp table audit_logs(id uuid)');
 try{
  const c=await customer('QualifiedObjects');assert.ok(c.customer_id);
  assert.equal(await scalar('select count(*) from pg_temp.persons'),0);
  assert.equal(await scalar('select count(*) from pg_temp.customers'),0);
  assert.equal(await scalar('select count(*) from pg_temp.audit_logs'),0);
 }finally{await db.exec('drop table pg_temp.persons,pg_temp.customers,pg_temp.audit_logs');}
});

test('HIGH 1: pending insurance without expiry is superseded without inventing history',async()=>{
 const v=await vehicle();const old=await document(v.vehicle_id,'insurance','pending',null);
 for(const type of ['itv','circulation_permit','vtc_license'])await document(v.vehicle_id,type);
 assert.equal(await scalar('select public.vehicle_is_assignable($1)',[v.vehicle_id]),false);
 const auditBefore=await scalar('select count(*) from public.audit_logs');
 await db.exec('begin');
 try{
  const next=await document(v.vehicle_id,'insurance','valid','2099-12-31',old.document_id,'Validate pending');
  await db.exec('set constraints all immediate');
  const previous=(await rows('select * from public.vehicle_documents where id=$1',[old.document_id]))[0];
  assert.equal(previous.status,'pending');assert.equal(previous.expires_at,null);
  assert.notEqual(previous.replaced_at,null);assert.equal(previous.replaced_by_document_id,next.document_id);
  const current=await rows("select id from public.vehicle_documents where vehicle_id=$1 and document_type_key='insurance' and replaced_at is null and status not in ('replaced','annulled')",[v.vehicle_id]);
  assert.deepEqual(current.map(r=>r.id),[next.document_id]);
  const eligible=await rows("select id from public.vehicle_documents where vehicle_id=$1 and document_type_key='insurance' and replaced_at is null and status in ('valid','expiring_soon')",[v.vehicle_id]);
  assert.deepEqual(eligible.map(r=>r.id),[next.document_id]);
  assert.equal(await scalar('select public.vehicle_is_assignable($1)',[v.vehicle_id]),true);
  assert.equal(await scalar('select count(*) from public.audit_logs'),auditBefore+2);
  const audit=(await rows("select * from public.audit_logs where entity_id=$1 and metadata->>'operation'='admin_vehicle_document_replaced'",[old.document_id]))[0];
  assert.equal(audit.actor_app_user_id,actor);assert.equal(audit.auth_session_id,session);
  assert.deepEqual(audit.old_data,{status:'pending',expires_at:null,replaced_at:null,replaced_by_document_id:null});
  assert.equal(audit.new_data.status,'pending');assert.equal(audit.new_data.expires_at,null);
  assert.equal(audit.new_data.replaced_by_document_id,next.document_id);assert.notEqual(audit.new_data.replaced_at,null);
  assert.equal(Date.parse(audit.new_data.replaced_at),new Date(previous.replaced_at).getTime());
  const receipt=(await rows("select * from public.audit_logs where entity_id=$1 and metadata->>'operation'='admin_vehicle_document_registered'",[next.document_id]))[0];
  assert.equal(receipt.metadata.result.document_id,next.document_id);assert.equal(receipt.metadata.result.replaced_document_id,old.document_id);
 }finally{await db.exec('rollback');}
});

test('HIGH 1: failed replacement audit rolls back old/new documents, pointer and both events',async()=>{
 const v=await vehicle();const old=await document(v.vehicle_id,'insurance','pending',null);
 const snapshot=(await rows('select * from public.vehicle_documents where id=$1',[old.document_id]))[0];
 const auditBefore=await scalar('select count(*) from public.audit_logs');
 const request=randomUUID();
 await db.exec(`create function public.test_0048_reject_document_receipt() returns trigger language plpgsql as $$ begin
 if new.metadata->>'operation'='admin_vehicle_document_registered' then raise exception 'Injected document audit failure' using errcode='23514'; end if; return new; end $$;
 create trigger test_0048_reject_document_receipt before insert on public.audit_logs for each row execute function public.test_0048_reject_document_receipt();`);
 try{
  await assert.rejects(()=>rpc('admin_register_vehicle_document',[request,v.vehicle_id,'insurance','valid',null,'2099-12-31',null,null,old.document_id,'Replace']),
   e=>e.code==='23514'&&e.message==='Injected document audit failure');
 }finally{await db.exec('drop trigger test_0048_reject_document_receipt on public.audit_logs; drop function public.test_0048_reject_document_receipt()');}
 assert.deepEqual((await rows('select * from public.vehicle_documents where id=$1',[old.document_id]))[0],snapshot);
 assert.equal(await scalar('select count(*) from public.vehicle_documents where vehicle_id=$1',[v.vehicle_id]),1);
 assert.equal(await scalar('select count(*) from public.audit_logs'),auditBefore);
 assert.equal(await scalar('select count(*) from public.audit_logs where request_id=$1',[request]),0);
});

async function lifecycleFixture(name){
 if(name==='admin_set_customer_status'){
  const c=await customer('IsolationCustomer');return {args:[c.customer_id,'inactive','Isolation test'],table:'customers',id:c.customer_id};
 }
 if(name==='admin_update_driver'){
  const d=await driver('IsolationDriver');return {args:[d.driver_id,'Isolation test','inactive'],table:'drivers',id:d.driver_id};
 }
 if(name==='admin_inactivate_vehicle'){
  const v=await vehicle();return {args:[v.vehicle_id,'Isolation test'],table:'vehicles',id:v.vehicle_id};
 }
 const d=await driver('IsolationLinkDriver'),v=await readyVehicle();
 const link=await rpc('admin_assign_driver_vehicle',[randomUUID(),d.driver_id,v.vehicle_id]);
 return {args:[link.assignment_id,'Isolation test'],table:'driver_vehicle_assignments',id:link.assignment_id};
}
const lifecycleNames=['admin_set_customer_status','admin_update_driver','admin_inactivate_vehicle','admin_close_driver_vehicle_assignment'];
for(const isolation of ['REPEATABLE READ','SERIALIZABLE'])for(const name of lifecycleNames){
 test(`HIGH 2: ${name} rejects ${isolation} without business/audit changes`,async()=>{
  const fixture=await lifecycleFixture(name);
  const snapshot=(await rows(`select * from public.${fixture.table} where id=$1`,[fixture.id]))[0];
  const auditBefore=await scalar('select count(*) from public.audit_logs');
  await db.exec(`begin; set transaction isolation level ${isolation}`);
  try{
   await assert.rejects(()=>rpc(name,fixture.args),e=>e.code==='0A000'&&/requires READ COMMITTED transaction isolation/.test(e.message));
  }finally{await db.exec('rollback');}
  assert.deepEqual((await rows(`select * from public.${fixture.table} where id=$1`,[fixture.id]))[0],snapshot);
  assert.equal(await scalar('select count(*) from public.audit_logs'),auditBefore);
 });
}
test('HIGH 2: all four lifecycle operations still work in explicit READ COMMITTED',async()=>{
 const fixtures=[];for(const name of lifecycleNames)fixtures.push([name,await lifecycleFixture(name)]);
 const auditBefore=await scalar('select count(*) from public.audit_logs');
 await db.exec('begin; set transaction isolation level read committed');
 try{
  assert.equal(await scalar("select current_setting('transaction_isolation')"),'read committed');
  for(const [name,fixture] of fixtures){
   const result=await rpc(name,fixture.args);
   if(name==='admin_update_driver')assert.equal(result.administrative_status,'inactive');
   else if(name==='admin_inactivate_vehicle'){assert.notEqual(result.inactive_at,null);assert.equal(result.manual_operational_status,'unavailable');}
   else assert.equal(result.status,name==='admin_close_driver_vehicle_assignment'?'ended':'inactive');
  }
  await db.exec('set constraints all immediate');
  assert.equal(await scalar('select count(*) from public.audit_logs'),auditBefore+4);
 }finally{await db.exec('rollback');}
});
test('HIGH 2: lifecycle isolation guards precede existing row/table locks and writes',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/0048_admin_catalog_management.sql'),'utf8');
 for(const name of lifecycleNames){
  const body=sql.split(`create or replace function public.${name}(`)[1].split('end $$;')[0];
  const authorization=body.indexOf('public.require_admin_user()');
  const guard=body.indexOf("current_setting('transaction_isolation')");
  assert.ok(authorization>=0&&guard>authorization);
  assert.ok(guard<body.indexOf('lock table'));
  assert.match(body.slice(guard,body.indexOf('lock table')),/read committed[\s\S]*0A000/);
 }
 assert.equal((sql.match(/lock table public\.services in share mode;/g)||[]).length,1);
 assert.equal((sql.match(/lock table public\.service_assignments in share mode;/g)||[]).length,4);
});
