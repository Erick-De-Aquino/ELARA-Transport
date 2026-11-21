/* PGlite semantic coverage only; independent-session tests have a native runner. */
const {test,before,after}=require('node:test'),assert=require('assert/strict'),path=require('path');
const {bootstrap,api,cases,migration}=require('./company-contacts-0056-harness.cjs');
const runtime=process.env.ELARA_PGLITE_ROOT;if(!runtime)throw Error('ELARA_PGLITE_ROOT must point to the existing disposable local runtime.');
const {PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db,a,baseline;
async function oldContracts(){return {functions:(await db.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','elara_private') and p.prokind='f' order by 1")).rows,policies:(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows};}
before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});a=api(db);await bootstrap(db);baseline=await oldContracts();await db.exec(migration);});
after(async()=>db?.close());
for(const [name,fn]of Object.entries(cases))test('0056 '+name,async()=>{await db.exec('begin');try{const admin=await a.identity('administrativo');await a.claims(admin);await a.checkpoint();await fn(a,admin,db);}finally{await db.exec('rollback');}});
test('0056 preserves every previous function, ACL and RLS policy',async()=>{const current=await oldContracts();assert.deepEqual(current.policies,baseline.policies);assert.deepEqual(current.functions.filter(f=>baseline.functions.some(b=>b.signature===f.signature)),baseline.functions);});
