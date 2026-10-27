/* Explicit native two-backend tests. Only literal loopback:54422 and a disposable database.
 * Never connects to service=elara_remote. Does not apply to the existing local Supabase DB.
 * Credentials stay in memory. Database creation/drop is confined to this runner's generated name.
 */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {bootstrap,api,cases}=require('./financial-0050-harness.cjs');
const {Client}=require(path.join(process.env.ELARA_PGLITE_ROOT,'pg'));
const inspected=JSON.parse(execFileSync('docker',['inspect','supabase_db_ELARA-Transport'],{encoding:'utf8'}))[0];
assert.equal(inspected.Name,'/supabase_db_ELARA-Transport');
const password=inspected.Config.Env.find(s=>s.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
const name='elara_0050_'+randomUUID().replaceAll('-','');assert.match(name,/^elara_0050_[a-f0-9]{32}$/);
const config={host:'127.0.0.1',port:54422,user:'postgres',password,connectionTimeoutMillis:5000};
async function connection(database){const c=new Client({...config,database});await c.connect();await c.query("set statement_timeout='20s'; set lock_timeout='8s'");c.exec=s=>c.query(s.replace('create role anon; create role authenticated; create role service_role bypassrls;',''));return c;}
async function concurrent(c,f,leftCall,rightCall,expectedRight,expectedPayments=1){
 const left=await connection(name),right=await connection(name),a=api(c);try{
  await api(left).claims(f.identity);await api(right).claims(f.identity);
  await left.query('begin');await right.query('begin');
  const lp=(await left.query('select pg_backend_pid() pid')).rows[0].pid,rp=(await right.query('select pg_backend_pid() pid')).rows[0].pid;
  const first=await leftCall(api(left));let second;
  const pending=rightCall(api(right)).then(r=>{second={ok:true,result:r};},e=>{second={ok:false,code:e.code};});
  let wait;const deadline=Date.now()+5000;while(Date.now()<deadline){const row=(await c.query('select wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1',[rp])).rows[0];if(row?.wait_event_type==='Lock'&&row.blockers.includes(lp)){wait=row;break;}await new Promise(r=>setTimeout(r,30));}
  assert.ok(wait,'Real independent backend must wait on the first transaction');
  await left.query('commit');await pending;
  if(expectedRight==='replay'){assert.ok(second.ok);assert.deepEqual(second.result,first);await right.query('commit');}
  else{assert.equal(second.ok,false);assert.equal(second.code,expectedRight);await right.query('rollback');}
  assert.equal(Number(await a.scalar('select count(*) from public.service_payments where service_id=$1',[f.id])),expectedPayments);
  assert.equal(Number(await a.scalar('select count(*) from public.cash_movements where service_id=$1',[f.id])),expectedPayments);
  assert.equal(Number(await a.scalar('select count(*) from public.service_payment_allocations x join public.service_payments p on p.id=x.payment_id where p.service_id=$1',[f.id])),expectedPayments);
  console.log(JSON.stringify({concurrency:'PASS',backendPids:[lp,rp],wait,expectedRight}));
 }finally{await left.query('rollback').catch(()=>{});await right.query('rollback').catch(()=>{});await left.end();await right.end();}
}
(async()=>{const control=await connection('postgres');let c;try{
 await control.query('create database '+name);c=await connection(name);await bootstrap(c);console.log('PASS native clean load 0001 -> 0050');
 let passed=0;for(const [label,run]of Object.entries(cases)){await c.query('begin');try{await run(c);passed++;console.log('PASS native '+label);}finally{await c.query('rollback');}}
 const a=api(c);await c.query('begin');let f=await a.prepared({receivable:true});await a.claims(f.admin);let rec=await a.scalar('select id from public.receivables where service_id=$1',[f.id]);await c.query('commit');
 for(const isolation of ['repeatable read','serializable']){const peer=await connection(name);try{await api(peer).claims(f.conductor);await peer.query('begin isolation level '+isolation);await assert.rejects(api(peer).close(f,'full',100),e=>e.code==='0A000');await peer.query('rollback');console.log('PASS native isolation guard '+isolation);}finally{await peer.end();}}
 await concurrent(c,{...f,identity:f.admin},x=>x.rpc('register_service_payment',[f.id,100,'cash',f.central,null,null,randomUUID()]),x=>x.rpc('collect_receivable',[rec,f.central,null,randomUUID()]),'23514');
 async function next(price=100){await c.query('begin');const id=await a.create(f);await a.accepted(f,id);await a.claims(f.admin);await a.rpc('finalize_service_pricing',[id,price,0]);await a.claims(f.conductor);await a.rpc('start_driver_service',[id]);for(const s of ['waiting_passenger','passenger_on_board','finishing','finished'])await a.rpc('advance_driver_service_progress',[id,s]);await c.query('commit');return {...f,id};}
 f=await next();const key=randomUUID();await concurrent(c,{...f,identity:f.conductor},x=>x.close(f,'partial',40,key),x=>x.close(f,'partial',40,key),'replay');
 f=await next();await concurrent(c,{...f,identity:f.conductor},x=>x.close(f,'partial',40),x=>x.close(f,'partial',40),'23514');
 const cashFixture=f;
 f=await next(0);const zeroKey=randomUUID();await concurrent(c,{...f,identity:f.conductor},x=>x.close(f,'no_charge',0,zeroKey,null),x=>x.close(f,'no_charge',0,zeroKey,null),'replay',0);
 await c.query('begin');await a.claims(f.conductor);const remittance=await a.rpc('create_driver_cash_remittance',[]);await a.claims(f.admin);await a.rpc('receive_cash_remittance',[remittance.remittance_id]);await c.query('commit');
 await concurrent(c,{...cashFixture,identity:f.admin},x=>x.rpc('verify_cash_remittance',[remittance.remittance_id,remittance.declared_amount]),x=>x.rpc('verify_cash_remittance',[remittance.remittance_id,remittance.declared_amount]),'23514');
 f=await next();const history=await a.history(f.id);await c.query("update public.cash_accounts set status='suspended' where id=$1",[f.driverAccount]);
 const finance=await connection(name);try{await api(finance).claims(f.conductor);await finance.query('begin');await assert.rejects(api(finance).close(f,'full',100),e=>e.code==='23503');await finance.query('rollback');}finally{await finance.end();}
 assert.equal(await a.scalar('select operational_status from public.services where id=$1',[f.id]),'completed');assert.deepEqual(await a.history(f.id),history);assert.equal(Number(await a.scalar('select count(*) from public.service_payments where service_id=$1',[f.id])),0);
 console.log(JSON.stringify({nativeSemanticPass:passed,concurrencyPass:5,isolationPass:2,separateOperationalCommitPass:1,fail:0}));
}finally{if(c)await c.end();await control.query('drop database if exists '+name+' with (force)');await control.end();console.log('Disposable local database removed.');}})().catch(e=>{console.error(JSON.stringify({error:e.message,code:e.code,stack:e.code?undefined:e.stack}));process.exitCode=1;});
