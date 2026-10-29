/* ELARA 0052: real SQL in disposable in-memory PostgreSQL; no remote fallback. */
const {test,before,after}=require('node:test'),path=require('node:path'),{bootstrap,cases}=require('./bootstrap-0052-harness.cjs');
if(!process.env.ELARA_PGLITE_ROOT)throw Error('Local PGlite runtime required');
const root=process.env.ELARA_PGLITE_ROOT,{PGlite}=require(path.join(root,'@electric-sql/pglite')),{pgcrypto}=require(path.join(root,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs')),{btree_gist}=require(path.join(root,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db;before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);});after(async()=>db?.close());
for(const [name,run]of Object.entries(cases))test('0052 DB: '+name,async()=>{await db.exec('begin');try{await run(db);}finally{await db.exec('rollback');}});
