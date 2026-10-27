const {test,before,after}=require('node:test'),path=require('node:path');
const {bootstrap,cases}=require('./financial-0050-harness.cjs');
const runtime=process.env.ELARA_PGLITE_ROOT;if(!runtime)throw Error('Local isolated runtime required; no remote fallback.');
const {PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db;before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);});after(async()=>{await db?.close();});
for(const [name,run]of Object.entries(cases))test('0050: '+name,async()=>{await db.exec('begin');try{await run(db);}finally{await db.exec('rollback');}});
