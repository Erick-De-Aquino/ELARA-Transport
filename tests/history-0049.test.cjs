const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {api,bootstrap,security,cases,migration,root}=require('./history-0049-harness.cjs');
const runtime=process.env.ELARA_PGLITE_ROOT;
if(!runtime)throw Error('ELARA_PGLITE_ROOT required; no remote fallback.');
const {PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db,a,baseline;
before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);baseline=await security(db);a=api(db);
 // Establish the legacy completion defect BEFORE 0049, without changing old RPCs.
 await db.exec('begin');try{const f=await a.fixtures(),id=await a.create(f);await a.accepted(f,id);
 for(const name of ['start_service_on_way','mark_service_arrived','mark_passenger_on_board','mark_service_finishing'])await a.rpc(name,[id]);
 await a.rejects(()=>a.rpc('complete_service',[id,'Baseline probe']),'23514');
 }finally{await db.exec('rollback');}
 await db.exec(migration);
});
after(async()=>{if(db)await db.close();});
test('0049: clean ordered migration load and unchanged grants/RLS',async()=>assert.deepEqual(await security(db),baseline));
test('0049: authenticated RPC invokes private trigger without direct INSERT privileges',async()=>{
 await db.exec('begin');try{const f=await a.fixtures(),id=await a.create(f);await a.claims(f.admin);
 await db.exec('set local role authenticated');await a.rpc('cancel_service',[id,'local_test']);await db.exec('reset role');
 assert.equal((await a.history(id)).length,1);assert.equal((await a.history(id))[0].changed_by_user_id,f.admin.user);
 }finally{await db.exec('rollback');}
});
test('0049: RPC replacements differ only by removed INSERTs',()=>{
 for(const file of ['0022_driver_start_service_rpc.sql','0024_driver_service_progress_rpc.sql']){
  const s=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/\r\n/g,'\n');
  const original=s.slice(s.indexOf('create or replace function'),s.indexOf('\n$$;')+4);
  const expected=original.replace(/\n[ ]+insert into public\.service_status_history \([\s\S]*?\n[ ]+\);\n/,'\n');
  assert.ok(migration.includes(expected));
 }
 assert.equal((migration.match(/insert into public\.service_status_history/g)||[]).length,1);
 assert.doesNotMatch(migration,/create\s+table|alter\s+policy|create\s+policy|sb_secret_|https?:\/\//i);
});
for(const [name,run]of Object.entries(cases))test('0049: '+name,async()=>{await db.exec('begin');try{const f=await a.fixtures();await run(a,f);}finally{await db.exec('rollback');}});
