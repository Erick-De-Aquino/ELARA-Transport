/* Explicit native local PostgreSQL runner (not a default-suite test).
 * ELARA_PGLITE_ROOT must point to the isolated runtime containing pg.
 * node tests/history-0049.local.cjs --apply-local
 * The only endpoint is literal loopback:54422; credentials are read in memory
 * from the named local Docker container, never printed or persisted.
 * --apply-local invokes migration up --local ONLY after checking pending=0049.
 */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {execFileSync,spawnSync}=require('node:child_process');
const {api,security,cases,root}=require('./history-0049-harness.cjs');
const runtime=process.env.ELARA_PGLITE_ROOT;
if(!runtime)throw Error('Isolated runtime required.');
const {Client}=require(path.join(runtime,'pg'));
const container=JSON.parse(execFileSync('docker',['inspect','supabase_db_ELARA-Transport'],{encoding:'utf8'}))[0];
assert.equal(container.Name,'/supabase_db_ELARA-Transport');
const password=container.Config.Env.find(s=>s.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
const config={host:'127.0.0.1',port:54422,user:'postgres',database:'postgres',password,connectionTimeoutMillis:5000};
const connect=async()=>{const c=new Client(config);await c.connect();await c.query("set lock_timeout='5s'; set statement_timeout='15s'");c.exec=s=>c.query(s);return c;};
async function cleanupFixture(c,f,id){
 const a=api(c);
   await c.query('begin');await a.claims(f.admin);
   if(id){const status=await a.scalar('select operational_status from public.services where id=$1',[id]);if(['pending','confirmed'].includes(status))await a.rpc('cancel_service',[id,'local_cleanup']);
    else assert.ok(['completed','cancelled'].includes(status),'Do not leave an active test service');}
   await a.rpc('admin_close_driver_vehicle_assignment',[f.link.assignment_id,'0049 local cleanup']);
   await c.query("update public.user_driver_links set status='inactive',ended_at=clock_timestamp(),end_reason='0049 local cleanup' where user_id=$1 and status='active'",[f.conductor.user]);
   await a.rpc('admin_update_driver',[f.driver.driver_id,'0049 local cleanup','inactive']);
   await a.rpc('admin_inactivate_vehicle',[f.vehicle.vehicle_id,'0049 local cleanup']);
   await a.rpc('admin_set_customer_status',[f.customer.customer_id,'inactive','0049 local cleanup']);
   await a.claims(null);
   await c.query("update public.app_sessions set ended_at=clock_timestamp() where app_user_id=any($1::uuid[]) and ended_at is null",[[f.admin.user,f.conductor.user]]);
   await c.query("update public.user_roles set status='revoked',revoked_at=clock_timestamp(),ends_at=clock_timestamp() where user_id=any($1::uuid[])",[[f.admin.user,f.conductor.user]]);
   await c.query("update public.app_users set status='inactive',inactive_at=clock_timestamp() where id=any($1::uuid[])",[[f.admin.user,f.conductor.user]]);
   await a.checkpoint();await c.query('commit');
   assert.equal(await a.scalar('select administrative_status from public.drivers where id=$1',[f.driver.driver_id]),'inactive');
   assert.equal(await a.scalar('select status from public.customers where id=$1',[f.customer.customer_id]),'inactive');
   assert.ok(await a.scalar('select inactive_at from public.vehicles where id=$1',[f.vehicle.vehicle_id]));
   assert.equal(await a.scalar('select count(*)::int from public.app_sessions where app_user_id=any($1::uuid[]) and ended_at is null',[[f.admin.user,f.conductor.user]]),0);
   console.log(JSON.stringify({cleanup:'contractual',service:id,status:await a.scalar('select operational_status from public.services where id=$1',[id]),activeAssignments:await a.scalar("select count(*)::int from public.service_assignments where service_id=$1 and assignment_status in ('accepted','pending_acceptance','reassignment_required')",[id]),catalogs:'inactive',sessions:'ended',history:'retained append-only'}));
}
async function concurrency(c){
 const a=api(c),others=[];let f,id;
 try{
  await c.query('begin');f=await a.fixtures();id=await a.create(f);await a.accepted(f,id);await a.claims(f.admin);await c.query('commit');
  const left=await connect(),right=await connect();others.push(left,right);
  await api(left).claims(f.conductor);await api(right).claims(f.admin);
  const lp=(await left.query('select pg_backend_pid() as pid')).rows[0].pid,rp=(await right.query('select pg_backend_pid() as pid')).rows[0].pid;
  assert.notEqual(lp,rp);
  await left.query('begin');await left.query('select * from public.start_driver_service($1)',[id]);
  // A competing start must wait, then fail against the committed in_progress state.
  await api(right).claims(f.conductor);await right.query('begin');
  let result;
  const pending=right.query('select * from public.start_driver_service($1)',[id]).then(()=>{result={unexpected:true};},e=>{result={code:e.code,message:e.message};});
  let observation;
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){
   const r=(await c.query("select pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1",[rp])).rows[0];
   if(r?.wait_event_type==='Lock'&&r.blockers.includes(lp)){observation=r;break;}
   await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(observation,'Independent backend must be observed waiting on the service row');
  const locks=(await c.query('select pid,locktype,mode,granted from pg_locks where pid=any($1::int[]) order by pid,locktype,mode',[[lp,rp]])).rows;
  assert.ok(locks.some(l=>l.pid===rp&&!l.granted));
  assert.equal((await a.history(id)).length,1,'Uncommitted history is invisible');
  await left.query('commit');await pending;assert.equal(result.code,'23514');await right.query('rollback');
  assert.deepEqual((await a.history(id)).map(h=>h.to_status),['confirmed','in_progress']);
  // Second committed transition after the contended start proves confirmed order.
  for(const stage of ['waiting_passenger','passenger_on_board','finishing','finished'])await api(left).rpc('advance_driver_service_progress',[id,stage]);
  assert.deepEqual((await a.history(id)).map(h=>h.to_status),['confirmed','in_progress','completed']);
  console.log(JSON.stringify({test:'native concurrency',pass:true,backendPids:[lp,rp],observation,locks:locks.filter(l=>l.locktype!=='relation'),history:(await a.history(id)).map(h=>({from:h.from_status,to:h.to_status,at:h.changed_at})),competingStart:result}));
 }finally{
  for(const peer of others){await peer.query('rollback').catch(()=>{});await peer.end();}
  await c.query('rollback');
  if(f){
   await cleanupFixture(c,f,id);
  }
 }
}
(async()=>{
 const c=await connect();try{
  const a=api(c),versions=(await a.rows('select version from supabase_migrations.schema_migrations order by version')).map(r=>r.version);
  assert.ok(versions.includes('0048'));
  if(process.argv.includes('--cleanup-existing')){
   const fixtures=await a.rows(`select s.id,s.customer_id,s.created_by as admin_user,sa.driver_id,sa.vehicle_id,sa.driver_vehicle_assignment_id as link_id,l.user_id as driver_user
    from public.services s join public.customers cu on cu.id=s.customer_id join public.persons cp on cp.id=cu.person_id
    join public.service_assignments sa on sa.service_id=s.id join public.drivers d on d.id=sa.driver_id
    join public.persons dp on dp.id=d.person_id join public.user_driver_links l on l.driver_id=d.id
    where cp.first_name='Local0049' and cp.last_name='Customer' and dp.first_name='Local0049' and dp.last_name='Driver'
      and d.administrative_status='active' and s.operational_status='completed'`);
   for(const r of fixtures){const admin=(await a.rows('select u.id as "user",u.auth_user_id as auth,s.supabase_session_id as session from public.app_users u join public.app_sessions s on s.app_user_id=u.id where u.id=$1 and s.ended_at is null',[r.admin_user]))[0];assert.ok(admin);await cleanupFixture(c,{admin,conductor:{user:r.driver_user},customer:{customer_id:r.customer_id},driver:{driver_id:r.driver_id},vehicle:{vehicle_id:r.vehicle_id},link:{assignment_id:r.link_id}},r.id);}
   return;
  }
  if(process.argv.includes('--apply-local')){
   assert.equal(versions.at(-1),'0048');
   const pending=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&!versions.includes(f.split('_')[0]));
   assert.deepEqual(pending,['0049_service_status_history_central_writer.sql']);
   const before=await security(c);
   const run=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npx.cmd --no-install supabase migration up --local'],{cwd:root,encoding:'utf8',timeout:60000});
   if(run.status!==0)throw Error('Local migration CLI failed: '+run.stderr);
   console.log(run.stdout);assert.deepEqual(await security(c),before);console.log('Local before/after table grants, function ACLs, RLS and policies: identical');
  }
  assert.equal(await a.scalar('select max(version) from supabase_migrations.schema_migrations'),'0049');
  const trigger=await a.scalar("select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.services'::regclass and tgname='write_service_status_history'");assert.ok(trigger);console.log(trigger);
  let pass=0;
  for(const [name,run]of Object.entries(cases)){
   await c.query('begin');try{const f=await a.fixtures();await run(a,f);console.log('PASS native: '+name);pass++;}finally{await c.query('rollback');}
  }
  await concurrency(c);console.log(JSON.stringify({nativeSemanticPass:pass,concurrencyPass:1,fail:0}));
 }finally{await c.end();}
})().catch(e=>{console.error(JSON.stringify({failure:e.message,code:e.code}));process.exitCode=1;});
