/* Existing 0050 read contract: disposable PostgreSQL only; no remote fallback. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {bootstrap,api}=require('./financial-0050-harness.cjs');
const root=process.env.ELARA_PGLITE_ROOT;if(!root)throw Error('Disposable runtime required');
const {PGlite}=require(path.join(root,'@electric-sql/pglite')),{pgcrypto}=require(path.join(root,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs')),{btree_gist}=require(path.join(root,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db,a;before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);a=api(db);});after(async()=>db?.close());
test('0050 price read authorizes own accepted service, exposes no administrative costs and cannot edit price',async()=>{
 await db.exec('begin');try{
  const f=await a.prepared({complete:false,price:false});await a.claims(f.admin);await a.rpc('finalize_service_pricing',[f.id,20,0]);await a.claims(f.conductor);
  const before=await a.snap();await db.exec('set local role authenticated');
  const c=Object.values(await a.rpc('get_service_financial_close_context',[f.id]))[0];
  assert.equal(c.service_id,f.id);assert.equal(c.pricing_status,'finalized');assert.equal(Number(c.total_amount),20);assert.equal(c.currency_code,'EUR');
  assert.equal(Number(c.paid_amount),0);assert.equal(Number(c.pending_amount),20);
  assert.doesNotMatch(Object.keys(c).join(','),/margin|cost|settlement|internal|tax|discount|surcharge/);
  await a.rejects(()=>a.rpc('finalize_service_pricing',[f.id,99,0]),'42501');
  await a.rejects(()=>a.rows('update public.service_financials set total_amount=99 where service_id=$1',[f.id]),'42501');
  await db.exec('reset role');assert.deepEqual(await a.snap(),before);
  const other=await a.fixtures();await a.claims(other.conductor);await a.rejects(()=>a.rpc('get_service_financial_close_context',[f.id]),'42501');
 }finally{await db.exec('rollback');}
});
