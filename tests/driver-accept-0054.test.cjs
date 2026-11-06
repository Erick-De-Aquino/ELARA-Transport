/* Real SQL, disposable in-memory PostgreSQL only; never connects to remote services.
 * PGlite has one backend: simultaneous requests are queued, not independent lock waits. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {bootstrap}=require('./bootstrap-0052-harness.cjs');
const {api,security}=require('./history-0049-harness.cjs');
const runtime=process.env.ELARA_PGLITE_ROOT;
if(!runtime)throw Error('Disposable PGlite runtime required; no remote fallback');
const {PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
const migration=fs.readFileSync('supabase/migrations/0054_driver_accept_confirms_service.sql','utf8');
let db,a,baseline,baselineStart,baselineAdvance,preexisting,preexistingAssignment;
before(async()=>{
  db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);
  await db.exec(fs.readFileSync('supabase/migrations/0053_app_session_concurrency.sql','utf8'));
  a=api(db);baseline=await security(db);
  baselineStart=await a.scalar("select pg_get_functiondef('public.start_driver_service(uuid)'::regprocedure)");
  baselineAdvance=await a.scalar("select pg_get_functiondef('public.advance_driver_service_progress(uuid,text)'::regprocedure)");
  // Reproduce the old portal defect in the disposable DB; migration must not backfill it.
  await db.exec('begin');try{const f=await assigned();await accept(f);
    assert.equal((await service(f.id)).operational_status,'pending');
    assert.equal((await assignment(f.assignment)).assignment_status,'accepted');
    await a.rejects(()=>a.rpc('start_driver_service',[f.id]),'23514');
    preexisting=f;preexistingAssignment=await assignment(f.assignment);await a.checkpoint();await db.exec('commit');
  }catch(error){await db.exec('rollback');throw error;}
  await db.exec(migration);
});
after(async()=>db?.close());
async function assigned(){
  const f=await a.fixtures(),id=await a.create(f);
  const assignment=Object.values(await a.rpc('assign_service',[id,f.driver.driver_id,f.vehicle.vehicle_id]))[0];
  await a.claims(f.conductor);return {...f,id,assignment};
}
const service=id=>a.rows('select operational_status,updated_by from public.services where id=$1',[id]).then(r=>r[0]);
const assignment=id=>a.rows('select assignment_status,accepted_at,accepted_by_driver_id from public.service_assignments where id=$1',[id]).then(r=>r[0]);
async function accept(f){return a.rpc('accept_driver_service',[f.id]);}
function scenario(name,run){test('0054: '+name,async()=>{await db.exec('begin');try{await run();}finally{await db.exec('rollback');}});}

test('0054: owner, ACL, SECURITY DEFINER, signatures, RLS and other function metadata preserved',async()=>{
  assert.deepEqual(await security(db),baseline);
  assert.equal(await a.scalar("select pg_get_functiondef('public.start_driver_service(uuid)'::regprocedure)"),baselineStart);
  assert.equal(await a.scalar("select pg_get_functiondef('public.advance_driver_service_progress(uuid,text)'::regprocedure)"),baselineAdvance);
  assert.doesNotMatch(migration,/create table|alter table|grant |revoke |accept_service_assignment\(/i);
});
test('0054: migration leaves preexisting accepted/pending service and assignment untouched',async()=>{
  assert.equal((await service(preexisting.id)).operational_status,'pending');
  assert.deepEqual(await assignment(preexisting.assignment),preexistingAssignment);
  assert.equal((await a.history(preexisting.id)).length,0);
});
scenario('portal acceptance confirms pending and start records both transitions',async()=>{
  const f=await assigned();await db.exec('set local role authenticated');const r=await accept(f);await db.exec('reset role');
  assert.deepEqual(Object.keys(r).sort(),['accepted_at','assignment_id','assignment_status','service_id']);
  assert.equal(r.service_id,f.id);assert.equal(r.assignment_id,f.assignment);assert.equal(r.assignment_status,'accepted');assert.ok(r.accepted_at);
  const accepted=await assignment(f.assignment);assert.equal(accepted.assignment_status,'accepted');assert.equal(accepted.accepted_by_driver_id,f.driver.driver_id);assert.ok(accepted.accepted_at);
  assert.deepEqual(await service(f.id),{operational_status:'confirmed',updated_by:f.conductor.user});
  let h=await a.history(f.id);assert.deepEqual(h.map(r=>[r.from_status,r.to_status]),[['pending','confirmed']]);
  assert.equal(h[0].changed_by_driver_id,f.driver.driver_id);assert.equal(h[0].changed_by_user_id,null);assert.equal(h[0].assignment_id,f.assignment);assert.equal(h[0].metadata.session_id,f.conductor.session);
  const started=await a.rpc('start_driver_service',[f.id]);assert.equal(started.operational_status,'in_progress');assert.equal(started.driver_stage,'on_way');
  h=await a.history(f.id);assert.deepEqual(h.map(r=>[r.from_status,r.to_status]),[['pending','confirmed'],['confirmed','in_progress']]);
});
scenario('already confirmed with pending reassignment accepts without redundant history/update',async()=>{
  const f=await assigned();await accept(f);await a.claims(f.admin);
  const next=Object.values(await a.rpc('reassign_service',[f.id,f.driver.driver_id,f.vehicle.vehicle_id,'Local reassignment']))[0];
  const before=await service(f.id),h=await a.history(f.id);await a.claims(f.conductor);await accept(f);
  assert.equal((await assignment(next)).assignment_status,'accepted');assert.deepEqual(await service(f.id),before);assert.deepEqual(await a.history(f.id),h);
});
scenario('final cancelled service refuses acceptance',async()=>{
  const f=await assigned();await a.claims(f.admin);await a.rpc('cancel_service',[f.id,'local_test']);await a.claims(f.conductor);
  const before=await assignment(f.assignment),h=await a.history(f.id);await a.rejects(()=>accept(f),'23514');
  assert.equal((await service(f.id)).operational_status,'cancelled');assert.deepEqual(await assignment(f.assignment),before);assert.deepEqual(await a.history(f.id),h);
});
scenario('different conductor and missing conductor context are denied',async()=>{
  const f=await assigned(),other=await a.fixtures();await a.claims(other.conductor);await a.rejects(()=>accept(f),'42501');
  await a.claims(f.admin);await a.rejects(()=>accept(f),'42501');await a.claims(null);await a.rejects(()=>accept(f),'42501');
  assert.equal((await service(f.id)).operational_status,'pending');assert.equal((await assignment(f.assignment)).assignment_status,'pending_acceptance');assert.equal((await a.history(f.id)).length,0);
});
scenario('retry retains existing 23514 contract with no duplicate acceptance/history',async()=>{
  const f=await assigned();await accept(f);const before=await assignment(f.assignment),h=await a.history(f.id);
  await a.rejects(()=>accept(f),'23514');assert.deepEqual(await assignment(f.assignment),before);assert.deepEqual(await a.history(f.id),h);
});
scenario('missing destination fails integrity and rolls back acceptance plus history',async()=>{
  const f=await assigned();await a.rows("delete from public.service_locations where service_id=$1 and location_type='destination'",[f.id]);
  await a.rejects(()=>accept(f),'23514');assert.equal((await service(f.id)).operational_status,'pending');
  const r=await assignment(f.assignment);assert.equal(r.assignment_status,'pending_acceptance');assert.equal(r.accepted_at,null);assert.equal(r.accepted_by_driver_id,null);assert.equal((await a.history(f.id)).length,0);
});
scenario('blocked vehicle prevents acceptance and confirmation atomically',async()=>{
  const f=await assigned();await a.rows("update public.vehicles set manual_operational_status='unavailable' where id=$1",[f.vehicle.vehicle_id]);
  await a.rejects(()=>accept(f),'23514');assert.equal((await service(f.id)).operational_status,'pending');assert.equal((await assignment(f.assignment)).assignment_status,'pending_acceptance');assert.equal((await a.history(f.id)).length,0);
});
scenario('history writer error rolls back both updates',async()=>{
  const f=await assigned();await db.exec("create function public.local_0054_history_failure() returns trigger language plpgsql as $$begin raise exception 'Local history fault' using errcode='P0001';end$$;create trigger local_0054_history_failure before insert on public.service_status_history for each row execute function public.local_0054_history_failure()");
  await a.rejects(()=>accept(f),'P0001');assert.equal((await service(f.id)).operational_status,'pending');assert.equal((await assignment(f.assignment)).assignment_status,'pending_acceptance');assert.equal((await a.history(f.id)).length,0);
});
scenario('start from pending remains forbidden and function body unchanged',async()=>{
  const f=await assigned();await a.rejects(()=>a.rpc('start_driver_service',[f.id]),'23514');assert.equal((await service(f.id)).operational_status,'pending');
});
test('0054: simultaneous queued portal requests yield one acceptance and one controlled rejection',async()=>{
  await db.exec('begin');const f=await assigned();await a.checkpoint();await db.exec('commit');
  const results=await Promise.allSettled([db.query('select * from public.accept_driver_service($1)',[f.id]),db.query('select * from public.accept_driver_service($1)',[f.id])]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'23514');
  assert.equal((await service(f.id)).operational_status,'confirmed');assert.equal((await assignment(f.assignment)).assignment_status,'accepted');
  assert.equal((await a.history(f.id)).length,1);
});
