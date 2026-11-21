const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
const {bootstrap,api}=require('./control-0051-harness.cjs');
const root=process.env.ELARA_PGLITE_ROOT;if(!root)throw Error('Disposable local PostgreSQL runtime required');
const {PGlite}=require(path.join(root,'@electric-sql/pglite')),{pgcrypto}=require(path.join(root,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs')),{btree_gist}=require(path.join(root,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db;before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await bootstrap(db);await db.exec(fs.readFileSync('supabase/migrations/0053_app_session_concurrency.sql','utf8'));});after(async()=>db?.close());
test('0053 SQL same-session concurrent requests reuse one row; real ownership conflict fails',async()=>{await db.exec('begin');const a=api(db),f=await a.fixture();await a.begin(f);const auth=await a.auth(f),linked=await a.link(f,auth),sid=randomUUID();await a.rows('insert into auth.sessions(id,user_id) values($1,$2)',[sid,auth]);await a.rows("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:auth,session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);
 const [one,two]=await Promise.all([a.rpc('initialize_app_session',['conductor']),a.rpc('initialize_app_session',['conductor'])]);assert.deepEqual(one,two);assert.equal(one.app_user_id,linked.app_user_id);assert.deepEqual(await a.rpc('initialize_app_session',[]),one);assert.equal(Number(await a.scalar('select count(*) from public.app_sessions where supabase_session_id=$1',[sid])),1);
 await a.rows('update public.app_sessions set auth_user_id=$1,app_user_id=$3 where supabase_session_id=$2',[f.operator.auth,sid,f.operator.user]);await assert.rejects(()=>a.rpc('initialize_app_session',[]),e=>e.code==='23505');await db.exec('rollback');
});

test('0053 SQL roles, existing context, expiration and ended-session protections survive',async()=>{await db.exec('begin');try{const a=api(db);for(const role of ['administrativo','superadmin','conductor']){const f=await a.identity(role);await a.rows('insert into auth.sessions(id,user_id) values($1,$2)',[f.session,f.auth]);const claims={sub:f.auth,session_id:f.session,exp:Math.floor(Date.now()/1000)+3600};await a.rows("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);const one=await a.rpc('initialize_app_session',[]);assert.equal(one.active_context,role);assert.deepEqual(await a.rpc('initialize_app_session',[role]),one);await a.rows("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...claims,exp:1})]);await a.rejects(()=>a.rpc('initialize_app_session',[]),'28000');await a.rows("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);await a.rows('update public.app_sessions set ended_at=now() where supabase_session_id=$1',[f.session]);await a.rejects(()=>a.rpc('initialize_app_session',[]),'28000');}}finally{await db.exec('rollback');}});

test('multirole SQL: existing own-role RLS reads and context RPC work in driver and both admin contexts without granting roles',async()=>{
 await db.exec('begin');try{const a=api(db),f=await a.fixture();await a.begin(f);const auth=await a.auth(f),linked=await a.link(f,auth),sid=randomUUID();
 await a.rows("insert into public.user_roles(user_id,role_key,starts_at) values($1,'administrativo',now()-interval '1 day'),($1,'superadmin',now()-interval '1 day')",[linked.app_user_id]);
 await a.rows('insert into auth.sessions(id,user_id) values($1,$2)',[sid,auth]);await a.rows("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:auth,session_id:sid,exp:Math.floor(Date.now()/1000)+3600})]);
 const count=await a.scalar('select count(*) from public.user_roles');await db.exec('set local role authenticated');
 for(const context of ['conductor','superadmin','administrativo','conductor']){
  const changed=await a.rpc('initialize_app_session',[context]);assert.equal(changed.active_context,context);
  const own=await a.rows("select user_id,role_key,status,starts_at,ends_at,revoked_at from public.user_roles where user_id=$1 and status='active'",[linked.app_user_id]);assert.deepEqual(own.map(r=>r.role_key).sort(),['administrativo','conductor','superadmin']);
  const catalog=await a.rows('select key,is_active from public.roles where is_active=true');assert.ok(catalog.some(r=>r.key==='conductor'));assert.equal(await a.scalar('select public.rls_current_active_context()'),context);
  assert.equal(await a.scalar('select public.rls_is_admin()'),context!=='conductor');
 }
 assert.equal(Number(await a.scalar('select count(*) from public.user_roles where user_id<>$1',[linked.app_user_id])),0);
 await db.exec('reset role');assert.equal(await a.scalar('select count(*) from public.user_roles'),count);
 }finally{await db.exec('rollback');}
});
