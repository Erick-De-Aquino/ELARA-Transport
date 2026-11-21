const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const old=require('./company-contacts-0056-harness.cjs');
const {PGlite}=require(path.join(process.env.ELARA_PGLITE_ROOT,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(process.env.ELARA_PGLITE_ROOT,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(process.env.ELARA_PGLITE_ROOT,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
let db,a;
before(async()=>{db=new PGlite({extensions:{pgcrypto,btree_gist}});await old.bootstrap(db);await db.exec(old.migration);await db.exec("alter table auth.users add column invited_at timestamptz");await db.exec("create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt()->>'role','authenticated') $$");await db.exec(fs.readFileSync('supabase/migrations/0057_admin_users.sql','utf8'));await db.exec(require('./users-rollout-0057-fixture.cjs').enableSql);a=old.api(db);const identity=a.identity;a.identity=async(...args)=>{const u=await identity(...args);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.session,u.auth]);return u;};});
after(async()=>db?.close());
const call=(name,args=[])=>a.scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const version=u=>a.scalar('select admin_version from app_users where id=$1',[u.user]);
const manage=async(u,action,changes,key=randomUUID(),v)=>{await a.checkpoint();const r=await call('admin_manage_user',[key,u.user,v??await version(u),action,changes,'Local authorized change']);await a.checkpoint();return r;};
async function scenario(fn){await db.exec('begin');try{const admin=await a.identity('superadmin');await a.claims(admin);await fn(admin);await a.checkpoint();}finally{await db.exec('rollback');}}
test('0057 metadata, optimistic conflict, immutable replay and audit',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);const key=randomUUID(),v=await version(u);const first=await manage(u,'metadata',{note:'Local note'},key,v);assert.deepEqual(await manage(u,'metadata',{note:'Local note'},key,v),first);await a.rejects(()=>manage(u,'metadata',{note:'different'},key,v),'23505');await a.rejects(()=>manage(u,'metadata',{note:'stale'},randomUUID(),v),'40001');assert.equal(await a.scalar('select internal_note from app_users where id=$1',[u.user]),'Local note');assert.equal(Number(await a.scalar("select count(*) from audit_logs where metadata->>'request_id'=$1",[key])),1);}));
test('0057 assign and revoke coordinate default and sessions',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);await manage(u,'assign',{role:'superadmin'});const role=await a.scalar("select id from user_roles where user_id=$1 and role_key='administrativo' and status='active'",[u.user]);await a.rejects(()=>manage(u,'revoke',{role_id:role}),'23514');await manage(u,'revoke',{role_id:role,default_context:'superadmin'});assert.equal(await a.scalar('select default_context from app_users where id=$1',[u.user]),'superadmin');assert.equal(Number(await a.scalar('select count(*) from app_sessions where app_user_id=$1 and ended_at is null',[u.user])),0);await a.checkpoint();}));
test('0057 functional inactivation and reactivation preserve roles and Auth',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);await manage(u,'status',{status:'inactive'});assert.equal(Number(await a.scalar('select count(*) from app_sessions where app_user_id=$1 and ended_at is null',[u.user])),0);assert.equal(await a.scalar('select status from app_users where id=$1',[u.user]),'inactive');await manage(u,'status',{status:'active'});assert.equal(await a.scalar('select status from app_users where id=$1',[u.user]),'active');assert.equal(Number(await a.scalar('select count(*) from auth.users where id=$1',[u.auth])),1);}));
test('0057 authorization, self protection, mandatory reason and no direct table writes',()=>scenario(async admin=>{await a.rejects(()=>manage(admin,'status',{status:'inactive'}),'23514');const u=await a.identity('administrativo');await a.claims(u);await a.rejects(()=>manage(admin,'assign',{role:'administrativo'}),'42501');await a.claims(admin);await a.rejects(async()=>call('admin_manage_user',[randomUUID(),u.user,await version(u),'metadata',{note:'x'},'']),'22023');assert.equal(await a.scalar("select has_table_privilege('authenticated','elara_private.user_admin_requests','select')"),false);assert.equal(await a.scalar("select has_function_privilege('authenticated','public.admin_claim_user_invitation(uuid,uuid,uuid)','execute')"),false);}));
test('0057 missing real driver link cannot grant a portal',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);await a.rejects(()=>manage(u,'assign',{role:'conductor'}),'23514');}));
test('0057 invitation stages duplicate protection and transactional completion',()=>scenario(async admin=>{const key=randomUUID(),email=randomUUID()+'@example.invalid',details={email,first_name:'New',last_name:'Local',roles:['superadmin','administrativo'],default_context:'administrativo',reason:'Local invitation',note:'Note',confirm_existing:false};const prepared=await call('admin_prepare_user_invitation',[key,details]);assert.equal(prepared.state,'prepared');assert.deepEqual(await call('admin_prepare_user_invitation',[key,details]),prepared);await a.rejects(()=>call('admin_prepare_user_invitation',[randomUUID(),details]),'23505');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);const claim=await call('admin_claim_user_invitation',[key,admin.auth,admin.session]);assert.equal(claim.send,true);assert.equal((await call('admin_claim_user_invitation',[key,admin.auth,admin.session])).send,false);const auth=randomUUID();await db.query('insert into auth.users(id,email,invited_at) values($1,$2,now())',[auth,email]);await a.claims(admin);const completed=await call('admin_complete_user_invitation',[key,auth]);assert.equal(completed.state,'applied');assert.deepEqual(await call('admin_complete_user_invitation',[key,auth]),completed);assert.equal(Number(await a.scalar('select count(*) from user_roles where user_id=$1',[completed.user_id])),2);assert.equal((await call('admin_get_user_request',[key])).state,'applied');await a.checkpoint();}));
test('0057 authenticated RPC access and cross-actor receipts fail closed',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);const key=randomUUID();await db.exec('set role authenticated');try{assert.equal((await call('admin_get_user_control',[u.user])).contract,'0057');await manage(u,'metadata',{note:'Authorized via RLS-safe RPC'},key);await a.rejects(()=>db.query('update public.app_users set internal_note=$1 where id=$2',['bad',u.user]),'42501');}finally{await db.exec('reset role');}const other=await a.identity('superadmin');await a.claims(other);await a.rejects(()=>call('admin_get_user_request',[key]),'42501');}));
test('0057 role expiration and inactive catalog prevent reactivation or default changes',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);await manage(u,'status',{status:'inactive'});await db.query("update user_roles set ends_at=now() where user_id=$1",[u.user]);await a.rejects(()=>manage(u,'status',{status:'active'}),'23514');assert.equal(await a.scalar('select status from app_users where id=$1',[u.user]),'inactive');}));
test('0057 driver suspension preserves driver/person and restores only its own closed link',()=>scenario(async admin=>{const d=await a.rpc('admin_create_driver',[randomUUID(),'Same','Person','internal_driver']);const person=await a.scalar('select person_id from drivers where id=$1',[d.driver_id]);const u=await a.identity('conductor');await a.claims(admin);await db.query('update app_users set person_id=$1 where id=$2',[person,u.user]);await db.query('insert into user_driver_links(user_id,driver_id,created_by) values($1,$2,$3)',[u.user,d.driver_id,admin.user]);await a.checkpoint();const before=await a.scalar('select to_jsonb(d) from drivers d where id=$1',[d.driver_id]);await manage(u,'status',{status:'inactive'});await manage(u,'metadata',{note:'Inactive note'});await manage(u,'status',{status:'active'});assert.deepEqual(await a.scalar('select to_jsonb(d) from drivers d where id=$1',[d.driver_id]),before);assert.equal(Number(await a.scalar("select count(*) from user_driver_links where user_id=$1 and status='active'",[u.user])),1);assert.equal(Number(await a.scalar("select count(*) from user_driver_links where user_id=$1 and status='inactive'",[u.user])),1);}));
test('0057 last Superadmin cannot revoke self or disable self',()=>scenario(async admin=>{const ownRole=await a.scalar("select id from user_roles where user_id=$1 and role_key='superadmin'",[admin.user]);await a.rejects(()=>manage(admin,'revoke',{role_id:ownRole,default_context:'administrativo'}),'23514');assert.equal(await a.scalar("select user_has_active_role($1,'superadmin')",[admin.user]),true);}));
test('0057 invitations reject driver roles, existing persons and unmatched Auth identities',()=>scenario(async admin=>{const details={email:randomUUID()+'@example.invalid',first_name:'New',last_name:'Test',roles:['conductor'],default_context:'conductor',reason:'Local'};await a.rejects(()=>call('admin_prepare_user_invitation',[randomUUID(),details]),'22023');details.roles=['administrativo'];details.default_context='administrativo';const key=randomUUID();await call('admin_prepare_user_invitation',[key,details]);await a.rejects(()=>call('admin_complete_user_invitation',[key,admin.auth]),'23514');await db.query('insert into persons(first_name,last_name,contact_email) values($1,$2,$3)',['Existing','Person',randomUUID()+'@example.invalid']);details.email=await a.scalar("select contact_email from persons where first_name='Existing'");await a.rejects(()=>call('admin_prepare_user_invitation',[randomUUID(),details]),'23514');}));
test('0057 revoked Auth session cannot administer despite remaining application session',()=>scenario(async admin=>{await db.query('delete from auth.sessions where id=$1',[admin.session]);await a.rejects(()=>call('admin_get_user_control',[null]),'28000');await a.rejects(()=>manage(admin,'metadata',{note:'forbidden'}),'28000');}));
test('0057 existing role writer increments version and stale administration fails',()=>scenario(async admin=>{const u=await a.identity('administrativo');await a.claims(admin);const v=await version(u);await a.scalar("select public.assign_user_role($1,'superadmin','Existing contract')",[u.user]);assert(Number(await version(u))>Number(v));await a.rejects(()=>manage(u,'metadata',{note:'stale'},randomUUID(),v),'40001');}));
test('0057 reconciliation refuses unrelated signup and binds existing Auth confirmation',()=>scenario(async admin=>{const email=randomUUID()+'@example.invalid',details={email,first_name:'Local',last_name:'Invite',roles:['administrativo'],default_context:'administrativo',reason:'Local test',confirm_existing:false};const key=randomUUID();await call('admin_prepare_user_invitation',[key,details]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);await call('admin_claim_user_invitation',[key,admin.auth,admin.session]);const unrelated=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[unrelated,email]);await a.claims(admin);await a.rejects(()=>call('admin_complete_user_invitation',[key,unrelated]),'23514');const otherEmail=randomUUID()+'@example.invalid',existing=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[existing,otherEmail]);const otherKey=randomUUID();await call('admin_prepare_user_invitation',[otherKey,{...details,email:otherEmail,confirm_existing:true}]);const result=await call('admin_complete_user_invitation',[otherKey,existing]);assert.equal(result.state,'applied');}));

test('0057 receipt boundaries reject old attempts and allow a fresh 0051 authorization in the same transaction',()=>scenario(async()=>{
 const f=await a.fixture();await a.begin(f);const auth=await a.auth(f);const key=randomUUID();
 const revoked=await a.revoke(f,key);assert.deepEqual(await a.revoke(f,key),revoked);
 await a.rejects(()=>call('admin_link_driver_portal_access',[f.key,auth,false]),'23514');await a.rejects(()=>a.begin(f),'23514');
 const fresh={...f,key:randomUUID()};const prepared=await a.begin(fresh,true);assert.equal(prepared.request_id,fresh.key);
 const linked=await call('admin_link_driver_portal_access',[fresh.key,auth,false]);assert.equal(linked.state,'linked');assert.deepEqual(await call('admin_link_driver_portal_access',[fresh.key,auth,false]),linked);
 await a.rejects(()=>call('admin_link_driver_portal_access',[f.key,auth,false]),'23514');assert.equal(Number(await a.scalar("select count(*) from user_driver_links where driver_id=$1 and status='active'",[f.id])),1);
}));

test('0057 legacy pending attempts without a boundary fail closed only when revocation history exists',()=>scenario(async()=>{
 const f=await a.fixture();await a.begin(f);const auth=await a.auth(f);
 await db.query('delete from elara_private.user_driver_access_attempts where request_id=$1',[f.key]);
 assert.equal(await a.scalar('select elara_private.user_admin_driver_attempt_current($1,$2)',[f.key,f.id]),true);
 await a.revoke(f);assert.equal(await a.scalar('select elara_private.user_admin_driver_attempt_current($1,$2)',[f.key,f.id]),false);
 await a.rejects(()=>call('admin_link_driver_portal_access',[f.key,auth,false]),'23514');
 const fresh={...f,key:randomUUID()};assert.equal((await a.begin(fresh,true)).request_id,fresh.key);assert.equal((await call('admin_link_driver_portal_access',[fresh.key,auth,false])).state,'linked');
}));

test('0057 driver boundary helpers and storage add no client privileges',()=>scenario(async()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await a.scalar("select has_table_privilege($1,'elara_private.user_driver_access_attempts','select')",[role]),false);
  for(const signature of ['elara_private.user_admin_driver_revocations(uuid)','elara_private.user_admin_driver_attempt_current(uuid,uuid)'])
   assert.equal(await a.scalar('select has_function_privilege($1,$2,\'execute\')',[role,signature]),false);
 }
 for(const name of ['admin_begin_driver_portal_access(uuid,uuid,text,text,boolean)','admin_link_driver_portal_access(uuid,uuid,boolean)']){
  assert.equal(await a.scalar('select has_function_privilege(\'authenticated\',$1,\'execute\')',['public.'+name]),true);
  assert.equal(await a.scalar('select has_function_privilege(\'anon\',$1,\'execute\')',['public.'+name]),false);
 }
}));

// The complete 0051 contract runs again after installing 0057 in this disposable DB.
for(const [name,run] of Object.entries(require('./control-0051-harness.cjs').cases))
 test('0057 preserves 0051: '+name,async()=>{await db.exec('begin');try{await run(db);}finally{await db.exec('rollback');}});

test('0057 empty installation authorizes reads but blocks every administrative write on the server',()=>scenario(async admin=>{
 await db.exec('delete from elara_private.user_admin_rollout');const u=await a.identity('administrativo');await a.claims(admin);
 const caps=await call('admin_get_user_control',[null]);assert.equal(caps.manage,false);assert.equal(caps.authorized,true);assert.equal(caps.availability_contract,'0057.availability.v1');assert(Object.values(caps.operations).every(v=>v===false));
 const before=await a.scalar('select to_jsonb(u) from app_users u where id=$1',[u.user]);
 for(const action of ['metadata','status','assign','revoke'])await a.rejects(()=>manage(u,action,{}),'55000');
 await a.rejects(()=>call('admin_prepare_user_invitation',[randomUUID(),{email:randomUUID()+'@example.invalid',first_name:'Local',last_name:'Test',roles:['administrativo'],default_context:'administrativo',reason:'Local test'}]),'55000');
 assert.deepEqual(await a.scalar('select to_jsonb(u) from app_users u where id=$1',[u.user]),before);
 assert.equal(Number(await a.scalar('select count(*) from elara_private.user_admin_requests')),0);
}));

test('0057 operation activation is independent and never grants a user permission',()=>scenario(async admin=>{
 await db.exec("delete from elara_private.user_admin_rollout where operation<>'metadata'");const u=await a.identity('administrativo');await a.claims(admin);
 assert.equal((await call('admin_get_user_control',[null])).operations.metadata,true);
 await manage(u,'metadata',{note:'Explicitly activated'});await a.rejects(()=>manage(u,'status',{status:'inactive'}),'55000');
 await a.claims(u);await a.rejects(()=>call('admin_get_user_control',[null]),'42501');await a.rejects(()=>manage(admin,'metadata',{note:'Denied'}),'42501');
 await a.claims(admin);await db.exec('set role authenticated');try{await a.rejects(()=>db.exec("update elara_private.user_admin_rollout set enabled=true"),'42501');}finally{await db.exec('reset role');}
}));

test('0057 invitations need every deployment dependency and revocation blocks claim and completion',()=>scenario(async admin=>{
 const email=randomUUID()+'@example.invalid',key=randomUUID(),details={email,first_name:'Local',last_name:'User',roles:['administrativo'],default_context:'administrativo',reason:'Local invitation',confirm_existing:false};
 for(const field of ['edge_verified','callback_verified','mail_verified']){
  await db.exec('update elara_private.user_admin_rollout set '+field+"=false where operation='invite'");
  assert.equal((await call('admin_get_user_control',[null])).operations.invite,false);await a.rejects(()=>call('admin_prepare_user_invitation',[key,details]),'55000');
  await db.exec('update elara_private.user_admin_rollout set '+field+"=true where operation='invite'");
 }
 await call('admin_prepare_user_invitation',[key,details]);await db.exec("update elara_private.user_admin_rollout set enabled=false where operation='invite'");
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);await a.rejects(()=>call('admin_claim_user_invitation',[key,admin.auth,admin.session]),'55000');
 await a.claims(admin);await a.rejects(()=>call('admin_complete_user_invitation',[key,randomUUID()]),'55000');
 assert.equal((await call('admin_get_user_request',[key])).state,'prepared');
}));

test('0057 rollout storage and helpers remain inaccessible to all application roles',()=>scenario(async()=>{
 for(const role of ['anon','authenticated','service_role']){
  for(const privilege of ['select','insert','update','delete'])assert.equal(await a.scalar("select has_table_privilege($1,'elara_private.user_admin_rollout',$2)",[role,privilege]),false);
  for(const signature of ['elara_private.user_admin_rollout_lock()','elara_private.user_admin_operation_enabled(text)'])assert.equal(await a.scalar('select has_function_privilege($1,$2,\'execute\')',[role,signature]),false);
 }
}));

test('0057 readiness checks the actual RPC execution dependencies without writing',()=>scenario(async()=>{
 assert.equal((await call('admin_get_user_control',[null])).operations.metadata,true);
 await db.exec('revoke execute on function public.admin_manage_user(uuid,uuid,bigint,text,jsonb,text) from authenticated');
 const control=await call('admin_get_user_control',[null]);for(const action of ['metadata','status','assign','revoke'])assert.equal(control.operations[action],false);
 assert.equal(control.operations.invite,true);
 await db.exec('revoke execute on function public.admin_claim_user_invitation(uuid,uuid,uuid) from service_role');
 assert.equal((await call('admin_get_user_control',[null])).operations.invite,false);
}));

test('0057 withdrawing an operation preserves read-only receipts but prevents mutable replays',()=>scenario(async admin=>{
 const u=await a.identity('administrativo');await a.claims(admin);const key=randomUUID(),v=await version(u);await manage(u,'metadata',{note:'Confirmed before withdrawal'},key,v);
 await db.exec("update elara_private.user_admin_rollout set enabled=false where operation='metadata'");
 assert.equal((await call('admin_get_user_request',[key])).state,'applied');await a.rejects(()=>manage(u,'metadata',{note:'Confirmed before withdrawal'},key,v),'55000');
 assert.equal(Number(await a.scalar("select count(*) from audit_logs where metadata->>'request_id'=$1",[key])),1);
}));
