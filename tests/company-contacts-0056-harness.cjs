/* Local PostgreSQL fixtures only; shared by PGlite and independent native sessions. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const old=require('./control-0051-harness.cjs');
const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/0056_admin_company_contacts.sql'),'utf8');
async function bootstrap(db){
 await old.bootstrap(db);
 for(const file of ['0052_initial_superadmin_bootstrap.sql','0053_app_session_concurrency.sql','0054_driver_accept_confirms_service.sql','0055_admin_create_company_customer.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
}
function api(db){
 const a=old.api(db);
 const call=(name,args)=>a.scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 const company=()=>a.rpc('admin_create_company_customer',[randomUUID(),'Local0056','LOCAL-'+randomUUID()]);
 const fresh=(extra={})=>({mode:'new',first_name:'Local0056',last_name:'Contact',email:randomUUID()+'@example.invalid',...extra});
 const add=(c,contact=fresh(),primary=false,key=randomUUID(),notes=null)=>call('admin_add_company_contact',[key,c.customer_id,contact,primary,notes]);
 const primary=(c,t,prev=null,key=randomUUID(),reason='Local primary change')=>call('admin_set_company_primary_contact',[key,c.customer_id,t.company_contact_id,t.version,prev?.company_contact_id??null,prev?.version??null,reason]);
 const update=(c,t,patch,key=randomUUID(),reason='Local link change')=>call('admin_update_company_contact',[key,c.customer_id,t.company_contact_id,t.version,patch,reason]);
 const person=(status='active')=>a.scalar("insert into public.persons(first_name,last_name,status,inactive_at) values('Shared','Local0056',$1,case when $1='inactive' then now() end) returning id",[status]);
 const link=t=>a.scalar('select to_jsonb(c) from public.company_contacts c where id=$1',[t.company_contact_id]);
 const snapshot=async()=>{const result={};for(const table of ['persons','companies','customers','company_contacts','audit_logs','services','human_code_counters'])result[table]=await a.rows(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`);return result;};
 return {...a,call,company,fresh,add,primary,update,person,link,snapshot};
}
const signatures=['public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text)','public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text)','public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text)'];
const cases={
 'new secondary contact, required fields, normalized email, cargo and link notes':async(a)=>{
  const c=await a.company(),r=await a.add(c,a.fresh({first_name:' New ',last_name:' Person ',email:' NEW@EXAMPLE.INVALID ',role_label:' Office '}),false,randomUUID(),' Link notes ');
  assert.equal(r.is_primary,false);assert.equal(r.version,1);assert.equal(r.status,'active');const l=await a.link(r);assert.equal(l.notes,'Link notes');assert.equal(l.role_label,'Office');assert.ok(l.started_at);assert.equal(l.ended_at,null);
  assert.equal(await a.scalar('select contact_email from persons where id=$1',[r.person_id]),'new@example.invalid');await a.checkpoint();
  for(const extra of [{first_name:''},{last_name:null},{email:null,phone:null},{email:'bad'},{unknown:'x'},{phone:5}])await a.rejects(()=>a.add(c,a.fresh(extra)),'22023');
  for(const contact of [null,[],{},'"bad"',{mode:'existing',person_id:'bad'}])await a.rejects(()=>a.add(c,contact),'22023');
  for(const contact of [a.fresh({email:null,phone:'123'}),a.fresh({phone:null})])assert.ok((await a.add(c,contact)).person_id);
 },
 'existing active shared person is linked without personal or commercial edits':async a=>{
  const p=await a.person(),c=await a.company(),other=await a.company();await a.add(other,{mode:'existing',person_id:p});
  const before=await a.rows('select to_jsonb(p) value from persons p where id=$1',[p]);
  const r=await a.add(c,{mode:' EXISTING ',person_id:p.toUpperCase(),role_label:' Manager '});assert.equal(r.person_id,p);
  await a.update(c,r,{role_label:'New role',notes:'Only link'});assert.deepEqual(await a.rows('select to_jsonb(p) value from persons p where id=$1',[p]),before);
  assert.equal(Number(await a.scalar('select count(*) from company_contacts where person_id=$1 and status=\'active\'',[p])),2);
 },
 'first primary, explicit atomic replacement and no automatic substitution':async a=>{
  const c=await a.company(),one=await a.add(c,undefined,true),two=await a.add(c);
  await a.rejects(()=>a.add(c,undefined,true),'23514');
  const result=await a.primary(c,two,one);assert.equal(result.is_primary,true);assert.equal(result.version,2);assert.equal(result.previous_primary_contact_id,one.company_contact_id);
  assert.equal((await a.link(one)).is_primary,false);assert.equal((await a.link(one)).version,2);
  assert.equal(Number(await a.scalar('select count(*) from company_contacts where company_id=$1 and is_primary and status=\'active\'',[c.company_id])),1);await a.checkpoint();
 },
 'designation without prior primary and idempotent already-primary operation':async a=>{
  const c=await a.company(),t=await a.add(c),r=await a.primary(c,t);assert.equal(r.version,2);
  const again=await a.primary(c,r,r);assert.equal(again.version,2);assert.equal((await a.link(r)).is_primary,true);
 },
 'deactivation preserves history, dates and shared person; company may have no primary':async a=>{
  const c=await a.company(),p=await a.person(),r=await a.add(c,{mode:'existing',person_id:p},true),before=await a.link(r),person=await a.scalar('select to_jsonb(p) from persons p where id=$1',[p]);
  const inactive=await a.update(c,r,{status:'inactive'}),after=await a.link(r);assert.equal(inactive.is_primary,false);assert.equal(inactive.status,'inactive');assert.ok(after.ended_at);assert.equal(after.started_at,before.started_at);assert.equal(after.created_by,before.created_by);assert.ok(after.inactive_by);
  assert.deepEqual(await a.scalar('select to_jsonb(p) from persons p where id=$1',[p]),person);
  const secondary=await a.add(c,{mode:'existing',person_id:p});assert.notEqual(secondary.company_contact_id,r.company_contact_id);await a.update(c,secondary,{status:'inactive'});
  assert.equal(Number(await a.scalar('select count(*) from company_contacts where company_id=$1 and is_primary and status=\'active\'',[c.company_id])),0);
  await a.rejects(()=>a.update(c,inactive,{notes:'No'}),'23514');await a.checkpoint();
 },
 'missing/inactive persons, missing/individual/blocked/inactive customers and inactive companies':async a=>{
  const c=await a.company();for(const [id,code]of [[randomUUID(),'23503'],[await a.person('inactive'),'23514']])await a.rejects(()=>a.add(c,{mode:'existing',person_id:id}),code);
  await a.rejects(()=>a.add({customer_id:randomUUID()}),'23503');await a.rejects(()=>a.add({customer_id:null}),'22023');
  const ind=await a.rpc('admin_create_individual_customer',[randomUUID(),'Individual','Local']);await a.rejects(()=>a.add(ind),'23514');
  for(const status of ['inactive','blocked']){const d=await a.company();await a.rows('update customers set status=$1,inactive_at=now(),blocked_at=now() where id=$2',[status,d.customer_id]);await a.rejects(()=>a.add(d),'23514');}
  await a.rows("update companies set status='inactive',inactive_at=now() where id=$1",[c.company_id]);await a.rejects(()=>a.add(c),'23514');
 },
 'active duplicate links and existing person duplicate rules fail without leaked PII':async a=>{
  const c=await a.company(),contact=a.fresh(),one=await a.add(c,contact),before=await a.snapshot();
  await a.rejects(()=>a.add(c,{mode:'existing',person_id:one.person_id}),'23505');await a.rejects(()=>a.add(c,contact),'23505');assert.deepEqual(await a.snapshot(),before);
  const phone=a.fresh({email:null,phone:'555-LOCAL'});await a.add(c,phone);await a.rejects(()=>a.add(c,phone),'23505');
  await a.rows("update persons set status='inactive',inactive_at=now() where id=$1",[one.person_id]);await a.rejects(()=>a.add(c,contact),'23505');
 },
 'patch whitelist, clearing fields, reason, positive versions and relation validation':async a=>{
  const c=await a.company(),t=await a.add(c,a.fresh({role_label:'Role'}),false,randomUUID(),'Notes');
  for(const patch of [{first_name:'No'},{phone:'No'},{is_primary:true},{status:'active'},{status:null},{notes:4},{},null,[]])await a.rejects(()=>a.update(c,t,patch),'22023');
  await a.rejects(()=>a.update(c,t,{notes:'N'},randomUUID(),' '),'22023');await a.rejects(()=>a.update(c,{...t,version:0},{notes:'N'}),'22023');
  await a.rejects(()=>a.primary(c,t,null,randomUUID(),null),'22023');
  const other=await a.company();await a.rejects(()=>a.update(other,t,{notes:'No'}),'23503');await a.rejects(()=>a.primary(other,t),'23503');
  const changed=await a.update(c,t,{role_label:null,notes:' '});const l=await a.link(changed);assert.equal(l.notes,null);assert.equal(l.role_label,null);assert.equal(l.version,2);
 },
 'stale target and stale expected primary versions fail; no optimistic timestamp reliance':async a=>{
  const c=await a.company(),one=await a.add(c,undefined,true),two=await a.add(c);const edited=await a.update(c,one,{notes:'Updated'});
  await a.rejects(()=>a.primary(c,two,one),'40001');await a.rejects(()=>a.update(c,one,{status:'inactive'}),'40001');
  await a.rows('update company_contacts set notes=notes,version=999 where id=$1',[one.company_contact_id]);assert.equal((await a.link(one)).version,edited.version+1);
  await a.rejects(()=>a.primary(c,two,edited),'40001');await a.rejects(()=>a.primary(c,two),'40001');
 },
 'all three receipts replay exact results after mutable state changes and reject payload/key collisions':async a=>{
  const c=await a.company(),contact=a.fresh(),key=randomUUID(),one=await a.add(c,contact,false,key);const before=await a.snapshot();assert.deepEqual(await a.add(c,contact,false,key),one);assert.deepEqual(await a.snapshot(),before);
  await a.rejects(()=>a.add(c,{...contact,role_label:'Different'},false,key),'23505');await a.rejects(()=>a.add(c,contact,false,null),'22023');
  const setKey=randomUUID(),primary=await a.primary(c,one,null,setKey),updateKey=randomUUID(),inactive=await a.update(c,primary,{status:'inactive'},updateKey);
  assert.deepEqual(await a.primary(c,one,null,setKey),primary);assert.deepEqual(await a.update(c,primary,{status:'inactive'},updateKey),inactive);assert.deepEqual(await a.add(c,contact,false,key),one);
  await a.rejects(()=>a.update(c,primary,{notes:'Other'},updateKey),'23505');await a.rejects(()=>a.primary(c,one,null,updateKey),'23505');
  await a.rows("update customers set status='inactive',inactive_at=now() where id=$1",[c.customer_id]);assert.deepEqual(await a.add(c,contact,false,key),one);
 },
 'actor-scoped receipts and existing 0048/0055 namespace survive':async(a,admin)=>{
  const c=await a.company(),key=randomUUID(),p=await a.person(),one=await a.add(c,{mode:'existing',person_id:p},false,key);
  await a.rejects(()=>a.rpc('admin_create_individual_customer',[key,'No','Collision']),'23505');await a.rejects(()=>a.rpc('admin_create_company_customer',[key,'No','LOCAL-'+randomUUID()]),'23505');
  const other=await a.identity('superadmin');await a.claims(other);const c2=await a.company();assert.ok(await a.add(c2,{mode:'existing',person_id:p},false,key));await a.claims(admin);assert.deepEqual(await a.add(c,{mode:'existing',person_id:p},false,key),one);
 },
 'authorization, expired/absent/session-context checks and browser direct-write denial':async(a,admin,db)=>{
  const c=await a.company(),t=await a.add(c),invoke=[()=>a.add(c),()=>a.primary(c,t),()=>a.update(c,t,{notes:'No'})];
  for(const actor of [null,{...admin,session:randomUUID()},await a.identity('conductor')]){await a.claims(actor);for(const fn of invoke)await a.rejects(fn,actor?.user&&actor.session!==admin.session&&actor.auth===admin.auth?'28000':actor===null?'28000':'42501');}
  await a.claims(admin);await a.rows("update app_sessions set created_at=now()-interval '1 day',expires_at=now()-interval '1 second' where supabase_session_id=$1",[admin.session]);for(const fn of invoke)await a.rejects(fn,'28000');await a.rows("update app_sessions set expires_at=now()+interval '1 day' where supabase_session_id=$1",[admin.session]);
  await db.exec('set local role authenticated');for(const sql of ["insert into public.company_contacts(company_id,person_id) values(null,null)","update public.company_contacts set notes='No'","delete from public.company_contacts","update public.persons set phone='No'"] )await a.rejects(()=>a.rows(sql),'42501');await db.exec('reset role');
  for(const role of ['anon','service_role']){await db.exec('set local role '+role);for(const fn of invoke)await a.rejects(fn,'42501');await db.exec('reset role');}
 },
 'security definer ownership, pinned paths, limited grants and unchanged RLS':async a=>{
  for(const sig of signatures){const f=(await a.rows('select p.prosecdef,p.proconfig,r.rolsuper or r.rolbypassrls owner_safe from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=$1::regprocedure',[sig]))[0];assert.equal(f.prosecdef,true);assert.deepEqual(f.proconfig,['search_path=pg_catalog']);assert.equal(f.owner_safe,true);
   for(const role of ['authenticated','anon','service_role'])assert.equal(await a.scalar("select has_function_privilege($1,$2,'execute')",[role,sig]),role==='authenticated');
   assert.equal(Number(await a.scalar("select count(*) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'",[sig])),0);
  }
  for(const sig of ['elara_private.company_contact_company(uuid)','elara_private.company_contact_version()'])for(const role of ['anon','authenticated','service_role'])assert.equal(await a.scalar("select has_function_privilege($1,$2,'execute')",[role,sig]),false);
  assert.equal(await a.scalar("select relrowsecurity from pg_class where oid='public.company_contacts'::regclass"),true);
 },
 'operational audit includes actor/session/reason/versions and one immutable receipt per operation':async(a,admin)=>{
  const c=await a.company(),one=await a.add(c,undefined,true),two=await a.add(c),r=await a.primary(c,two,one),end=await a.update(c,r,{status:'inactive'});
  const logs=await a.rows("select * from audit_logs where entity_table='company_contacts' order by created_at,id");
  assert.equal(logs.filter(l=>l.request_id).length,4);assert.equal(logs.filter(l=>l.metadata.operation==='admin_company_primary_contact_removed').length,1);
  for(const l of logs){assert.equal(l.actor_app_user_id,admin.user);assert.equal(l.auth_session_id,admin.session);assert.equal(l.event_source,'secure_function');assert.ok(l.new_data.version);if(l.action!=='insert')assert.ok(l.reason);}
  assert.equal(end.status,'inactive');
 },
 'injected link/receipt failures roll back person, previous primary, counter and all audit rows':async(a,admin,db)=>{
  const c=await a.company(),one=await a.add(c,undefined,true),two=await a.add(c);
  for(const [table,event,fn]of [['company_contacts','insert',()=>a.add(c)],['audit_logs','insert',()=>a.add(c)],['company_contacts','update',()=>a.primary(c,two,one)],['audit_logs','insert',()=>a.primary(c,two,one)],['audit_logs','insert',()=>a.update(c,one,{status:'inactive'})]]){
   await db.exec('savepoint fault');await db.exec(`create function public.local_0056_fault() returns trigger language plpgsql as $$begin raise exception 'Injected local fault' using errcode='P0001';end$$;create trigger local_0056_fault after ${event} on public.${table} for each row execute function public.local_0056_fault()`);
   const before=await a.snapshot();await a.rejects(fn,'P0001');assert.deepEqual(await a.snapshot(),before);await db.exec('rollback to fault; release fault');
  }
 },
 'deferred integrity at commit boundary and inactive person cannot become primary':async(a,admin,db)=>{
  const c=await a.company(),t=await a.add(c);await a.rows("update persons set status='inactive',inactive_at=now() where id=$1",[t.person_id]);await a.rejects(()=>a.primary(c,t),'23514');
  await a.rejects(async()=>{await a.rows('update company_contacts set role_label=\'Bad\' where id=$1',[t.company_contact_id]);await a.checkpoint();},'23514');
  const r=await a.update(c,t,{status:'inactive'});assert.equal(r.status,'inactive');
  // The pending INSERT event retains its original NEW tuple; restore the identity
  // for this transaction's earlier active INSERT before forcing its deferred check.
  await a.rows("update persons set status='active',inactive_at=null where id=$1",[t.person_id]);await a.checkpoint();
 },
 '0048 individual, 0055 company and Services/history remain usable without lifecycle changes':async a=>{
  const individual=await a.rpc('admin_create_individual_customer',[randomUUID(),'Regression','Local']);assert.ok(individual.customer_id);
  const c=await a.company(),customer=await a.scalar('select to_jsonb(c) from customers c where id=$1',[c.customer_id]),company=await a.scalar('select to_jsonb(c) from companies c where id=$1',[c.company_id]);
  const t=await a.add(c);await a.primary(c,t);const service=await a.rpc('create_service',[c.customer_id,'transfer','2099-01-01T10:00:00Z','Origin',null,'Destination',null]);assert.ok(service.service_id);
  assert.deepEqual(await a.scalar('select to_jsonb(c) from customers c where id=$1',[c.customer_id]),customer);assert.deepEqual(await a.scalar('select to_jsonb(c) from companies c where id=$1',[c.company_id]),company);await a.checkpoint();
 },
 'temporary relation poisoning cannot redirect qualified writes':async(a,admin,db)=>{
  await db.exec('create temporary table company_contacts(id uuid); create temporary table persons(id uuid); create temporary table companies(id uuid); create temporary table customers(id uuid)');const c=await a.company(),r=await a.add(c);await a.primary(c,r);await a.update(c,{...r,version:2},{notes:'Safe'});
  for(const t of ['company_contacts','persons','companies','customers'])assert.equal(Number(await a.scalar(`select count(*) from pg_temp.${t}`)),0);
 }
};
module.exports={bootstrap,api,cases,migration,signatures};
