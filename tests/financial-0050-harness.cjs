/* Isolated local PostgreSQL scenarios; no remote service, credentials or frozen QA execution. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const old=require('./history-0049-harness.cjs');
const migration=fs.readFileSync(path.join(old.root,'supabase/migrations/0050_cash_service_financial_close.sql'),'utf8');
async function bootstrap(db){await old.bootstrap(db);await db.exec(old.migration);await db.exec(migration);}
function api(db){const a=old.api(db);return {...a,
 async prepared({complete=true,price=true,account=true,receivable=false}={}){
  const f=await a.fixtures(),id=await a.create(f);await a.accepted(f,id);
  await a.claims(f.admin);
  const central=await a.scalar("insert into public.cash_accounts(name,account_type,created_by) values('Local0050 central','central',$1) returning id",[f.admin.user]);
  let driverAccount=null;if(account)driverAccount=Object.values(await a.rpc('provision_driver_cash_account',[f.driver.driver_id]))[0];
  if(price)await a.rpc('finalize_service_pricing',[id,100,0]);
  await a.claims(f.conductor);await a.rpc('start_driver_service',[id]);
  for(const stage of ['waiting_passenger','passenger_on_board','finishing'])await a.rpc('advance_driver_service_progress',[id,stage]);
  if(complete)await a.rpc('advance_driver_service_progress',[id,'finished']);
  if(receivable){await a.claims(f.admin);await a.rpc('create_receivable_from_service',[id]);await a.claims(f.conductor);}
  return {...f,id,central,driverAccount};
 },
 async close(f,result,amount,key=randomUUID(),reason=result==='full'?null:'customer_shortfall'){
  return Object.values(await a.rpc('close_driver_service_financial',[f.id,result,amount,key,reason]))[0];
 },
 async state(id){return a.rows('select total_amount,paid_amount,pending_amount,financial_status from public.service_financials where service_id=$1',[id]);},
 async snap(){const out={};for(const t of ['service_financials','service_payments','service_payment_allocations','receivables','receivable_allocations','cash_movements','audit_logs','service_financial_status_history','receivable_status_history','cash_remittances','cash_remittance_items','driver_cash_source_allocations'])out[t]=await a.rows(`select to_jsonb(t) r from public.${t} t order by to_jsonb(t)::text`);return out;}
};}
const cases={
 'no-charge finalized service resolves with immutable evidence and no financial artifacts':async(db)=>{
  const a=api(db),f=await a.prepared({price:false,account:false});await a.claims(f.admin);await a.rpc('finalize_service_pricing',[f.id,0,0]);await a.claims(f.conductor);
  const key=randomUUID(),history=await a.history(f.id),r=await a.close(f,'no_charge',0,key,null);
  assert.equal(r.payment_result,'no_charge');assert.equal(r.financial_close,'resolved');assert.equal(Number(r.pending_amount),0);
  assert.deepEqual(await a.close(f,'no_charge',0,key,null),r);await a.rejects(()=>a.close(f,'unpaid',0,key,'x'),'23505');
  for(const t of ['service_payments','cash_movements','receivables'])assert.equal(Number(await a.scalar(`select count(*) from public.${t} where service_id=$1`,[f.id])),0);
  assert.equal(Number(await a.scalar("select count(*) from public.audit_logs where entity_id=$1 and metadata->>'financial_contract'='0050'",[f.id])),1);
  const c=Object.values(await a.rpc('get_service_financial_close_context',[f.id]))[0];assert.equal(c.no_charge,true);assert.equal(c.financial_close,'resolved');assert.deepEqual(await a.history(f.id),history);
 },
 'receipt recovery after lost reply is read-only, actor scoped and does not authorize a second payment':async(db)=>{
  const a=api(db),f=await a.prepared();await a.claims(f.admin);const key=randomUUID(),args=[f.id,'partial',25,f.central,key,'additional'];
  const result=Object.values(await a.rpc('close_admin_service_financial',args))[0],snap=await a.snap();
  const receipt=Object.values(await a.rpc('get_financial_close_receipt',[f.id,key]))[0];assert.equal(receipt.status,'applied');assert.deepEqual(receipt.result,result);assert.deepEqual(await a.snap(),snap);
  assert.deepEqual(Object.values(await a.rpc('close_admin_service_financial',args))[0],result);
  await a.rejects(()=>a.rpc('close_admin_service_financial',[f.id,'partial',26,f.central,key,'additional']),'23505');
  const other=await a.identity('administrativo');await a.claims(other);await a.rejects(()=>a.rpc('get_financial_close_receipt',[f.id,key]),'42501');
  await a.claims(f.admin);assert.equal(Object.values(await a.rpc('get_financial_close_receipt',[f.id,randomUUID()]))[0].status,'not_found');
 },
 'cash close through remittance receive/verify transfers custody once, with replay and authorization guards':async(db)=>{
  const a=api(db),f=await a.prepared();await a.close(f,'full',100);const rem=await a.rpc('create_driver_cash_remittance',[]),id=rem.remittance_id;
  await a.rejects(()=>a.rpc('receive_cash_remittance',[id]),'42501');await a.rejects(()=>a.rpc('verify_cash_remittance',[id,100]),'42501');
  await a.claims({auth:f.admin.auth,session:randomUUID()});await a.rejects(()=>a.rpc('receive_cash_remittance',[id]),'28000');await a.claims(f.admin);
  await a.rejects(()=>a.rpc('verify_cash_remittance',[id,100]),'23514');await a.rpc('receive_cash_remittance',[id]);
  const received=await a.snap();await a.rejects(()=>a.rpc('receive_cash_remittance',[id]),'23514');assert.deepEqual(await a.snap(),received);
  await a.rpc('verify_cash_remittance',[id,100]);const verified=await a.snap();await a.rejects(()=>a.rpc('verify_cash_remittance',[id,100]),'23514');assert.deepEqual(await a.snap(),verified);
  const moves=await a.rows("select movement_type,cash_account_id,amount from public.cash_movements where remittance_id=$1",[id]);assert.equal(moves.length,2);
  assert.equal(moves.filter(m=>m.movement_type==='outflow'&&m.cash_account_id===f.driverAccount&&Number(m.amount)===100).length,1);
  assert.equal(moves.filter(m=>m.movement_type==='inflow'&&m.cash_account_id===f.central&&Number(m.amount)===100).length,1);
  assert.equal(Number(await a.scalar('select count(*) from public.service_payments where service_id=$1',[f.id])),1);
  assert.equal(Number(await a.scalar('select available_amount from elara_private.driver_cash_available where cash_account_id=$1',[f.driverAccount])),0);
  assert.equal(Number(await a.scalar("select sum(case when movement_type='inflow' then amount else -amount end) from public.cash_movements where cash_account_id=$1",[f.driverAccount])),0);
  assert.equal(Number(await a.scalar("select sum(case when movement_type='inflow' then amount else -amount end) from public.cash_movements where cash_account_id=$1",[f.central])),100);
 },
 'remittance verification rejects bad destination/currency and rolls back intermediate failures':async(db)=>{
  const a=api(db),f=await a.prepared();await a.close(f,'full',100);const {remittance_id:id}=await a.rpc('create_driver_cash_remittance',[]);await a.claims(f.admin);await a.rpc('receive_cash_remittance',[id]);
  await db.exec('savepoint remittance_fault');await db.exec("create function public.test_remittance_fault() returns trigger language plpgsql as $$begin raise exception 'Injected remittance failure' using errcode='P0001';end$$; create trigger test_remittance_fault before insert on public.cash_movements for each row execute function public.test_remittance_fault()");
  const snapshot=await a.snap();await a.rejects(()=>a.rpc('verify_cash_remittance',[id,100]),'P0001');assert.deepEqual(await a.snap(),snapshot);assert.equal(await a.scalar('select status from public.cash_remittances where id=$1',[id]),'received');
  await db.exec('rollback to remittance_fault; release remittance_fault');
  await db.exec('savepoint invalid_account');await a.rows("update public.cash_accounts set status='suspended' where id=$1",[f.central]);await a.rejects(()=>a.rpc('verify_cash_remittance',[id,100]),'23514');await db.exec('rollback to invalid_account; release invalid_account');
  await a.rejects(()=>a.rpc('verify_cash_remittance',[id,-1]),'23514');
  await a.rejects(()=>a.rows("update public.cash_accounts set currency_code='USD' where id=$1",[f.driverAccount]),'23514');
 },
 'full/partial/unpaid preserve equations, single allocation and driver custody':async(db)=>{
  const a=api(db);for(const [result,amount,pending] of [['full',100,0],['partial',40,60],['unpaid',0,100]]){
   await db.exec('savepoint scenario');const f=await a.prepared(),r=await a.close(f,result,amount);
   assert.equal(Number(r.pending_amount),pending);assert.equal(Number(r.paid_amount)+Number(r.pending_amount),100);
   const count=amount?1:0;for(const t of ['service_payments','cash_movements'])assert.equal(Number(await a.scalar(`select count(*) from public.${t} where service_id=$1`,[f.id])),count);
   assert.equal(Number(await a.scalar('select count(*) from public.service_payment_allocations a join public.service_payments p on p.id=a.payment_id where p.service_id=$1',[f.id])),count);
   if(amount)assert.equal(await a.scalar('select cash_account_id from public.cash_movements where service_id=$1',[f.id]),f.driverAccount);
   if(pending)assert.equal(Number(await a.scalar('select pending_amount from public.receivables where service_id=$1',[f.id])),pending);
   assert.equal(Number(await a.scalar('select count(*) from public.cash_movements where cash_account_id=$1',[f.central])),0);
   await db.exec('rollback to scenario; release scenario');
  }
 },
 'existing receivable partial, full and unpaid remain coherent':async(db)=>{
  const a=api(db);for(const [result,amount,pending] of [['partial',30,70],['full',100,0],['unpaid',0,100]]){
   await db.exec('savepoint existing');const f=await a.prepared({receivable:true}),id=await a.scalar('select id from public.receivables where service_id=$1',[f.id]);
   await a.close(f,result,amount);assert.equal(await a.scalar('select id from public.receivables where service_id=$1',[f.id]),id);
   assert.equal(Number(await a.scalar('select pending_amount from public.receivables where id=$1',[id])),pending);
   await db.exec('rollback to existing; release existing');
  }
 },
 'immutable receipt replays full/partial/unpaid after lost response; changed args fail':async(db)=>{
  const a=api(db);for(const [mode,amount]of [['full',100],['partial',40],['unpaid',0]]){
   await db.exec('savepoint retry');const f=await a.prepared(),key=randomUUID(),r=await a.close(f,mode,amount,key),s=await a.snap();
   assert.deepEqual(await a.close(f,mode,amount,key),r);assert.deepEqual(await a.snap(),s);
   await a.claims({auth:f.conductor.auth,session:randomUUID()});await a.rejects(()=>a.close(f,mode,amount,key),'28000');await a.claims(f.conductor);
   await a.rejects(()=>a.close(f,mode,amount+1,key),'23505');
   await a.rejects(()=>a.close(f,mode,amount,randomUUID()),'23514');
   await db.exec('rollback to retry; release retry');
  }
 },
 'administration collects additional partial/full through both entry points; no driver follow-up':async(db)=>{
  const a=api(db),f=await a.prepared();await a.close(f,'partial',20);const rec=await a.scalar('select id from public.receivables where service_id=$1',[f.id]);
  await a.rejects(()=>a.close(f,'partial',10),'23514');await a.claims(f.admin);
  const key=randomUUID();const r=Object.values(await a.rpc('register_service_payment',[f.id,30,'cash',f.central,null,null,key]))[0];assert.ok(r);
  const snapshot=await a.snap();await a.rpc('register_service_payment',[f.id,30,'cash',f.central,null,null,key]);assert.deepEqual(await a.snap(),snapshot);
  const collectKey=randomUUID();const args=[rec,f.central,null,collectKey];const first=await a.rpc('collect_receivable',args);assert.ok(first.payment_id);
  const after=await a.snap();assert.deepEqual(await a.rpc('collect_receivable',args),first);assert.deepEqual(await a.snap(),after);
  assert.equal(Number((await a.state(f.id))[0].pending_amount),0);
  assert.equal(Number(await a.scalar('select count(*) from public.service_payments where service_id=$1',[f.id])),3);
 },
 'global key cannot be reused by another authorized actor; method stays cash only':async(db)=>{
  const a=api(db),f=await a.prepared(),key=randomUUID();await a.close(f,'partial',25,key);
  await a.claims(f.admin);await a.rejects(()=>a.rpc('close_admin_service_financial',[f.id,'partial',25,f.central,key,'customer_shortfall']),'23505');
  await a.rejects(()=>a.rpc('register_service_payment',[f.id,75,'bank_transfer',f.central,null,null,randomUUID()]),'0A000');
  assert.equal(Number(await a.scalar('select count(*) from public.service_payments where service_id=$1',[f.id])),1);
 },
 'invalid result/amount/reason, draft price, custody, foreign service, expired session and anon fail':async(db)=>{
  const a=api(db),f=await a.prepared();for(const [mode,amount,reason]of [['full',0,null],['full',101,null],['partial',0,'x'],['partial',100,'x'],['partial',-1,'x'],['unpaid',1,'x'],['partial',20,null],['unpaid',0,null]])await a.rejects(()=>a.close(f,mode,amount,randomUUID(),reason),'23514');
  for(const amount of ['NaN','Infinity',1.001])await a.rejects(()=>a.close(f,'partial',amount),'23514');
  await a.claims(f.admin);await a.rejects(()=>a.rpc('close_admin_service_financial',[f.id,'full',100,f.driverAccount,randomUUID()]),'23514');
  await a.rows("update public.cash_accounts set status='suspended' where id=$1",[f.central]);await a.rejects(()=>a.rpc('close_admin_service_financial',[f.id,'full',100,f.central,randomUUID()]),'23514');
  await a.claims(f.conductor);const other=await a.identity('conductor');await a.claims(other);await a.rejects(()=>a.close(f,'full',100),'42501');
  await a.claims(f.conductor);await a.rows("update public.cash_accounts set currency_code='USD' where id=$1",[f.driverAccount]);await a.rejects(()=>a.close(f,'full',100),'23514');await a.rows("update public.cash_accounts set currency_code='EUR' where id=$1",[f.driverAccount]);
  await a.claims({auth:f.conductor.auth,session:randomUUID()});await a.rejects(()=>a.close(f,'full',100),'28000');
  await db.exec('set local role anon');await a.rejects(()=>a.close(f,'full',100),'42501');await db.exec('reset role');
 },
 'draft blocks finance without undoing operational completion; retry only finance and unchanged history':async(db)=>{
  const a=api(db),f=await a.prepared({price:false}),before=await a.history(f.id);await a.rejects(()=>a.close(f,'full',100),'23514');
  assert.equal(await a.scalar('select operational_status from public.services where id=$1',[f.id]),'completed');
  await a.claims(f.admin);await a.rpc('finalize_service_pricing',[f.id,100,0]);await a.claims(f.conductor);await a.close(f,'full',100);
  assert.deepEqual(await a.history(f.id),before);
 },
 'unpaid needs no account; explicit provisioning is idempotent and never backfills':async(db)=>{
  const a=api(db),f=await a.prepared({account:false});await a.rejects(()=>a.close(f,'partial',10),'23503');await a.close(f,'unpaid',0);
  assert.equal(Number(await a.scalar('select count(*) from public.cash_accounts where driver_id=$1',[f.driver.driver_id])),0);
  await a.claims(f.admin);const one=await a.rpc('provision_driver_cash_account',[f.driver.driver_id]);assert.deepEqual(await a.rpc('provision_driver_cash_account',[f.driver.driver_id]),one);
 },
 'API-role execution, private helpers, direct DML and RLS remain restricted':async(db)=>{
  const a=api(db),f=await a.prepared();await db.exec('set local role authenticated');await a.close(f,'partial',25);await db.exec('reset role');
  for(const table of ['service_payments','service_payment_allocations','receivables','receivable_allocations','cash_accounts','cash_movements','audit_logs']){
   assert.equal(await a.scalar('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+table]),true);
   for(const priv of ['insert','update','delete'])assert.equal(await a.scalar('select has_table_privilege($1,$2,$3)',['authenticated','public.'+table,priv]),false);
  }
  const helpers=await a.rows("select p.oid::regprocedure::text s,p.proconfig,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='elara_private' and p.proname in ('cash_service_close','cash_close_driver')");
  for(const h of helpers){assert.equal(h.owner,'postgres');assert.deepEqual(h.proconfig,['search_path=pg_catalog']);for(const role of ['anon','authenticated','service_role'])assert.equal(await a.scalar('select has_function_privilege($1,$2,$3)',[role,h.s,'execute']),false);}
  const publics=await a.rows("select p.oid::regprocedure::text s,p.proconfig,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('close_driver_service_financial','close_admin_service_financial','collect_receivable_cash','provision_driver_cash_account','get_service_financial_close_context','get_financial_close_receipt','register_service_payment','collect_receivable')");
  assert.equal(publics.length,8);for(const p of publics){assert.equal(p.owner,'postgres');assert.deepEqual(p.proconfig,['search_path=pg_catalog']);assert.equal(await a.scalar('select has_function_privilege($1,$2,$3)',['authenticated',p.s,'execute']),true);assert.equal(await a.scalar('select has_function_privilege($1,$2,$3)',['anon',p.s,'execute']),false);}
 },
 'all critical financial failures rollback payments, debt, cash, audit and histories':async(db)=>{
  const a=api(db),f=await a.prepared();for(const [table,deferred]of [['service_payment_allocations',false],['receivables',false],['cash_movements',false],['audit_logs',false],['service_payments',true]]){
   await db.exec('savepoint fault');await db.exec(`create function public.test_0050_fault() returns trigger language plpgsql as $$begin raise exception 'Injected financial fault' using errcode='P0001';end$$; ${deferred?'create constraint trigger':'create trigger'} test_0050_fault after insert on public.${table} ${deferred?'deferrable initially deferred':''} for each row execute function public.test_0050_fault()`);
   const snap=await a.snap();await a.rejects(()=>a.close(f,'partial',30),'P0001');assert.deepEqual(await a.snap(),snap);
   await db.exec('rollback to fault; release fault');
  }
 },
 'cash source is unique and cannot fund both remittance and settlement':async(db)=>{
  const a=api(db),f=await a.prepared();await a.close(f,'full',100);const payment=await a.scalar('select id from public.service_payments where service_id=$1',[f.id]);
  const sources=await a.rows('select * from elara_private.driver_cash_available where service_payment_id=$1',[payment]);assert.equal(sources.length,1);assert.equal(Number(sources[0].available_amount),100);
  await a.rpc('create_driver_cash_remittance',[]);assert.equal(Number(await a.scalar('select available_amount from elara_private.driver_cash_available where service_payment_id=$1',[payment])),0);
  await a.rejects(()=>a.rpc('create_driver_cash_remittance',[]),'23514');
  await a.claims(f.admin);
  const rule=await a.scalar("select id from public.settlement_rules where driver_type='internal_driver' and is_active and currency_code='EUR' and effective_from<=current_date and (effective_until is null or effective_until>=current_date) order by effective_from desc limit 1");assert.ok(rule);
  const settlement=await a.scalar("insert into public.settlements(driver_id,settlement_rule_id,driver_type_snapshot,frequency_snapshot,calculation_method_snapshot,period_start,period_end,driver_percentage,elara_percentage,created_by) values($1,$2,'internal_driver','monthly','driver_share',date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,35,65,$3) returning id",[f.driver.driver_id,rule,f.admin.user]);
  await a.rows('savepoint double_consume');
  await assert.rejects(a.rows("insert into public.driver_cash_source_allocations(cash_movement_id,driver_id,cash_account_id,currency_code,allocation_type,settlement_id,amount,status,created_by) values($1,$2,$3,'EUR','settlement_offset',$4,1,'reserved',$5)",[sources[0].cash_movement_id,f.driver.driver_id,f.driverAccount,settlement,f.admin.user]),e=>e.code==='23514'&&/overallocated/.test(e.message));
  await db.exec('rollback to double_consume; release double_consume');await a.checkpoint();
 }
};
module.exports={bootstrap,api,cases,migration};
