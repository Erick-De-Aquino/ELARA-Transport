/* ELARA 0052 native PostgreSQL. Loopback only; every generated database is
 * removed in finally. Does not touch the original DB, remote services or QA. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {bootstrap,api,cases,migration}=require('./bootstrap-0052-harness.cjs');
if(!process.env.ELARA_PGLITE_ROOT)throw Error('Disposable local pg runtime required');
const {Client}=require(path.join(process.env.ELARA_PGLITE_ROOT,'pg'));
const inspected=JSON.parse(execFileSync('docker',['inspect','supabase_db_ELARA-Transport'],{encoding:'utf8'}))[0];assert.equal(inspected.Name,'/supabase_db_ELARA-Transport');
const cfg={host:'127.0.0.1',port:54422,user:'postgres',password:inspected.Config.Env.find(s=>s.startsWith('POSTGRES_PASSWORD=')).slice(18),connectionTimeoutMillis:5000};
async function connect(database){const c=new Client({...cfg,database});await c.connect();await c.query("set statement_timeout='20s';set lock_timeout='8s'");c.exec=s=>c.query(s.replace('create role anon; create role authenticated; create role service_role bypassrls;',''));return c;}
async function withDatabase(control,run){const name='elara_0052_'+randomUUID().replaceAll('-','');assert.match(name,/^elara_0052_[a-f0-9]{32}$/);let c;try{await control.query('create database '+name);c=await connect(name);await bootstrap(c);await run(c,name);}finally{if(c)await c.end();await control.query('drop database if exists '+name+' with(force)');console.log('Removed disposable '+name);}}
async function contention(control,sameAuth,sameKey){await withDatabase(control,async(c,name)=>{
 const a=api(c),first=await a.fixture(),second=sameAuth?{...first}:await a.fixture();second.key=sameKey?first.key:randomUUID();
 const left=await connect(name),right=await connect(name);try{
  await left.query('begin');await right.query('begin');const lp=(await left.query('select pg_backend_pid() as pid')).rows[0].pid,rp=(await right.query('select pg_backend_pid() as pid')).rows[0].pid;
  const result=await api(left).run(first);let outcome;const pending=api(right).run(second).then(value=>{outcome={value}},error=>{outcome={error}});
  let waited=false;const deadline=Date.now()+5000;while(Date.now()<deadline){const blockers=(await c.query('select pg_blocking_pids($1) as ids',[rp])).rows[0].ids;if(blockers.includes(lp)){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
  assert.ok(waited,'Second independent connection must contend on the real lock');await left.query('commit');await pending;assert.equal(outcome.error?.code,sameKey&&!sameAuth?'23505':'23514',outcome.error?.message);await right.query('rollback');
  assert.equal(await a.effective(),1);assert.equal(await a.receipts(),1);assert.equal(await a.scalar('select count(*)::int from public.persons'),1);assert.equal(await a.scalar('select count(*)::int from public.app_users'),1);assert.equal(await a.scalar('select count(*)::int from public.user_roles'),1);assert.deepEqual(await a.receipt(first),result);
  console.log(JSON.stringify({concurrency:{sameAuth,sameKey},backendPids:[lp,rp],observedWait:waited,effectiveSuperadmins:1,receipts:1,result:'PASS'}));
 }finally{await left.query('rollback').catch(()=>{});await right.query('rollback').catch(()=>{});await left.end();await right.end();}
});}
(async()=>{const control=await connect('postgres');try{
 await withDatabase(control,async(c,name)=>{
  console.log('PASS clean native 0001 -> 0052');
  await assert.rejects(()=>c.exec(migration),e=>e.code==='42P07');await c.query('rollback');console.log('PASS 0052 cannot apply twice');
  for(const [label,run]of Object.entries(cases)){await c.query('begin');try{await run(c);console.log('PASS native '+label);}finally{await c.query('rollback');}}
  const a=api(c),f=await a.fixture();await c.query('begin isolation level repeatable read');await assert.rejects(()=>a.run(f),e=>e.code==='0A000');await c.query('rollback');assert.equal(await a.effective(),0);console.log('PASS native isolation rejection');
  for(const busy of ['table','auth']){const other=await connect(name);try{await other.query('begin');if(busy==='table')await other.query('lock table public.app_users in row exclusive mode');else await other.query('select id from auth.users where id=$1 for update',[f.auth]);await c.query('begin');await assert.rejects(()=>a.run(f),e=>e.code==='55P03');await c.query('rollback');assert.equal(await a.effective(),0);assert.equal(await a.receipts(),0);console.log('PASS native busy '+busy+' fails NOWAIT without writes');}finally{await other.query('rollback');await other.end();}}
  await c.exec("create function public.local_0052_commit_fault() returns trigger language plpgsql as $$begin raise exception 'Local commit failure' using errcode='P0001';end$$;create constraint trigger local_0052_commit_fault after insert on public.app_users deferrable initially deferred for each row execute function public.local_0052_commit_fault()");
  const before=await a.snapshot();await c.query('begin');await a.run(f);await assert.rejects(()=>c.query('commit'),e=>e.code==='P0001');await c.query('rollback');assert.deepEqual(await a.snapshot(),before);console.log('PASS actual COMMIT failure rolls back receipt/person/app/role/audit');
  await c.exec('drop trigger local_0052_commit_fault on public.app_users; drop function public.local_0052_commit_fault()');await c.query('begin');await a.run(f);await c.query('commit');assert.equal(await a.effective(),1);console.log('PASS retry after actual COMMIT failure');
 });
 for(const sameAuth of [true,false])for(const sameKey of [true,false])await contention(control,sameAuth,sameKey);
 console.log(JSON.stringify({semanticPass:Object.keys(cases).length,concurrencyPass:4,isolationPass:1,nowaitPass:2,commitRollbackPass:1,fail:0}));
}finally{await control.end();}})().catch(e=>{console.error(JSON.stringify({message:e.message,code:e.code}));process.exitCode=1;});
