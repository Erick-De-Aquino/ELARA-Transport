// PostgreSQL in memory only. No URL, network, production account or remote write.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {bootstrap,api}=require('./financial-0050-harness.cjs');
const {setup,fixture}=require('./cash-presentation-harness.cjs');
const runtime=process.env.ELARA_PGLITE_ROOT,{PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs')),{btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db;before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);});after(async()=>{await db?.close();});
for(const lost of [false,true])test('manual cash RPC from actual UI controller preserves decimal, audit and one ledger entry'+(lost?' after lost reply':''),async()=>{
 await db.exec('begin');try{
  const a=api(db),f=await a.fixtures();await a.claims(f.admin);
  const account=await a.scalar("insert into public.cash_accounts(name,account_type,opening_balance,created_by) values('Local cash UI','central',100,$1) returning id",[f.admin.user]);
  const tables=fixture(0);tables.cash_accounts=[{id:account,name:'Local cash UI',account_type:'central',status:'active',currency_code:'EUR',opening_balance:'100.00'}];const h=setup({tables}),calls=[];
  h.window.ElaraSupabase.client.rpc=async(name,args)=>{
    calls.push(name);
    if(name==='get_admin_cash_movements')return {data:await a.rows('select * from public.get_admin_cash_movements(p_cash_account_id=>$1,p_limit=>$2,p_offset=>$3)',[args.p_cash_account_id,args.p_limit,args.p_offset])};
    assert.equal(name,'create_cash_movement');const id=await a.scalar('select public.create_cash_movement($1,$2,$3::numeric,$4,$5::timestamptz,$6,$7::jsonb)',[args.p_cash_account_id,args.p_movement_type,args.p_amount,args.p_description,null,args.p_idempotency_key,JSON.stringify(args.p_metadata)]);
    if(lost)throw Error('Reply lost after commit within isolated transaction');return {data:id};
  };
  const attempt={scope:h.context.operationalCashScope(),key:'cash-ui:'+require('node:crypto').randomUUID()},values={account,type:'outflow',amount:'0.29',description:'Local isolated manual cash'};
  const row=await h.context.executeOperationalCashManual(attempt,values);assert.equal(String(row.amount),'0.29');await h.context.executeOperationalCashManual(attempt,values);assert.equal(calls.filter(n=>n==='create_cash_movement').length,1);
  assert.equal(Number(await a.scalar('select count(*) from public.cash_movements where cash_account_id=$1',[account])),1);
  assert.equal(await a.scalar('select public.calculate_cash_account_balance($1)::text',[account]),'99.71');assert.equal(Number(await a.scalar("select count(*) from public.audit_logs where entity_id=$1 and new_data->>'operation'='manual_cash_movement'",[row.cash_movement_id])),1);
 }finally{await db.exec('rollback');}
});
