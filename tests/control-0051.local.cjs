/* Loopback-only native backends. Never connects to a remote service.
 * Only the generated elara_0051_<uuid> database is created/dropped. */
const assert=require('assert/strict'),{randomUUID}=require('crypto'),{execFileSync}=require('child_process'),path=require('path');
const{bootstrap,api,cases}=require('./control-0051-harness.cjs');
if(!process.env.ELARA_PGLITE_ROOT)throw Error('Local runtime required');
const{Client}=require(path.join(process.env.ELARA_PGLITE_ROOT,'pg'));
const inspected=JSON.parse(execFileSync('docker',['inspect','supabase_db_ELARA-Transport'],{encoding:'utf8'}))[0];assert.equal(inspected.Name,'/supabase_db_ELARA-Transport');
const cfg={host:'127.0.0.1',port:54422,user:'postgres',password:inspected.Config.Env.find(s=>s.startsWith('POSTGRES_PASSWORD=')).slice(18),connectionTimeoutMillis:5000};
const database='elara_0051_'+randomUUID().replaceAll('-','');assert.match(database,/^elara_0051_[a-f0-9]{32}$/);
async function connect(name){const c=new Client({...cfg,database:name});await c.connect();await c.query("set statement_timeout='20s';set lock_timeout='8s'");c.exec=s=>c.query(s.replace('create role anon; create role authenticated; create role service_role bypassrls;',''));return c;}
async function concurrent(control,f,label,leftFn,rightFn,expected){
 const left=await connect(database),right=await connect(database);try{
  await api(left).claims(f.operator);await api(right).claims(f.operator);await left.query('begin');await right.query('begin');
  const lp=(await left.query('select pg_backend_pid() pid')).rows[0].pid,rp=(await right.query('select pg_backend_pid() pid')).rows[0].pid;
  const first=await leftFn(api(left));let outcome;const promise=rightFn(api(right)).then(result=>{outcome={result}},error=>{outcome={error}});
  let blocked=false;const deadline=Date.now()+5000;while(Date.now()<deadline){const r=(await control.query('select pg_blocking_pids($1) ids',[rp])).rows[0];if(r.ids.includes(lp)){blocked=true;break;}await new Promise(r=>setTimeout(r,25));}
  assert.ok(blocked,'Independent backend must actually wait');await left.query('commit');await promise;
  if(expected==='same'){assert.ifError(outcome.error);assert.deepEqual(outcome.result,first);await right.query('commit');}
  else if(expected==='ok'){assert.ifError(outcome.error);await right.query('commit');}
  else{assert.equal(outcome.error?.code,expected,outcome.error?.message);await right.query('rollback');}
  console.log(JSON.stringify({concurrency:label,result:'PASS',backendPids:[lp,rp],observedLockWait:blocked}));
 }finally{await left.query('rollback').catch(()=>{});await right.query('rollback').catch(()=>{});await left.end();await right.end();}
}
(async()=>{const control=await connect('postgres');let c;try{
 await control.query('create database '+database);c=await connect(database);await bootstrap(c);console.log('PASS native clean load 0001 -> 0051');
 for(const[label,run]of Object.entries(cases)){await c.query('begin');try{await run(c);console.log('PASS native '+label)}finally{await c.query('rollback')}}
 const a=api(c);
 async function fixture(){await c.query('begin');const f=await a.fixture();await c.query('commit');return f;}
 let f=await fixture(),second={...f,key:randomUUID()};await concurrent(c,f,'two begin attempts same driver/email',x=>x.begin(f),x=>x.begin(second),'same');
 await c.query('begin');await a.claims(f.operator);let auth=await a.auth(f);await c.query('commit');
 await concurrent(c,f,'same Auth identity linked twice / concurrent replay',x=>x.link(f,auth),x=>x.link(f,auth),'same');
 assert.equal(Number(await a.scalar('select count(*) from public.app_users where auth_user_id=$1',[auth])),1);
 assert.equal(Number(await a.scalar("select count(*) from public.user_driver_links where driver_id=$1 and status='active'",[f.id])),1);
 f=await fixture();await c.query('begin');await a.begin(f);auth=await a.auth(f);await c.query('commit');
 await concurrent(c,f,'link followed by concurrent revocation',x=>x.link(f,auth),x=>x.revoke(f),'ok');
 assert.equal(Number(await a.scalar("select count(*) from public.user_driver_links where driver_id=$1 and status='active'",[f.id])),0);
 f=await fixture();await c.query('begin');await a.begin(f);auth=await a.auth(f);await c.query('commit');
 await concurrent(c,f,'revocation blocks queued link',x=>x.revoke(f),x=>x.link(f,auth),'23514');
 f=await fixture();await c.query('begin');const central=await a.central(f);await c.query('commit');
 const key=randomUUID();await concurrent(c,f,'central concurrent replay',x=>x.initialize(f,central,key),x=>x.initialize(f,central,key),'same');
 assert.equal(Number(await a.scalar("select count(*) from public.cash_accounts where account_type='central' and status='active'")),1);
 // A second, distinct request cannot create another central after the first won.
 await c.query('begin');await a.claims(f.operator);await a.rejects(()=>a.initialize(f,central,randomUUID()),'40001');await c.query('rollback');
 // Restore only this disposable fixture in a rolled-back test transaction, then
 // run a fresh native contention pair against the same approved baseline.
 await c.query('begin');await c.query("set session_replication_role=replica; delete from public.cash_accounts where account_type='central' and status='active'; update public.cash_accounts set status='active' where id='60000000-0000-4000-8000-000000000100'; set session_replication_role=origin");await c.query('commit');
 await a.claims(f.operator);const baseline=Object.values(await a.rpc('get_admin_operational_central_context',[]))[0];
 await concurrent(c,f,'distinct central initializations',x=>x.initialize(f,baseline),x=>x.initialize(f,baseline),'40001');
 assert.equal(Number(await a.scalar("select count(*) from public.cash_accounts where account_type='central' and status='active'")),1);
 assert.equal(Number(await a.scalar('select count(*) from public.cash_movements')),0);
 console.log(JSON.stringify({nativeSemanticPass:Object.keys(cases).length,concurrencyPass:6,fail:0}));
}finally{if(c)await c.end();await control.query('drop database if exists '+database+' with (force)');await control.end();console.log('Disposable local 0051 database removed.')}})().catch(e=>{console.error(JSON.stringify({message:e.message,code:e.code}));process.exitCode=1});
