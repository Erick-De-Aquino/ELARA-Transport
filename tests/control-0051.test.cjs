const{test,before,after}=require('node:test'),path=require('path'),{bootstrap,cases}=require('./control-0051-harness.cjs');
if(!process.env.ELARA_PGLITE_ROOT)throw Error('ELARA_PGLITE_ROOT required; no remote fallback');
const root=process.env.ELARA_PGLITE_ROOT,{PGlite}=require(path.join(root,'@electric-sql/pglite')),{pgcrypto}=require(path.join(root,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs')),{btree_gist}=require(path.join(root,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db;before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db)});after(async()=>db?.close());
for(const[name,run]of Object.entries(cases))test('0051 DB: '+name,async()=>{await db.exec('begin');try{await run(db)}finally{await db.exec('rollback')}});
