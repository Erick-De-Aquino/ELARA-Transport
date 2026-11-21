/* Local in-memory PostgreSQL only. No URLs, credentials or network fallback.
 * PGlite has one backend: these tests do NOT claim independent-session lock coverage.
 * ELARA_PGLITE_ROOT points to the same disposable runtime as the existing suites. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const runtime=process.env.ELARA_PGLITE_ROOT;
if(!runtime)throw Error('ELARA_PGLITE_ROOT must identify the disposable local runtime.');
const {PGlite}=require(path.join(runtime,'@electric-sql/pglite'));
const {pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const {btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
const {bootstrap,api}=require('./control-0051-harness.cjs');
const migration='0055_admin_create_company_customer.sql';
const signature='public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)';
let db,a,baseline;
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => Object.values((await query(sql,args))[0])[0];
const raw=async(name,args) => (await query(`select * from public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args))[0];
const company=(options={})=>raw('admin_create_company_customer',[
  options.request??randomUUID(),options.legal===undefined?'Local company':options.legal,
  options.tax===undefined?'LOCAL-'+randomUUID():options.tax,
  options.trade??null,options.phone??null,options.email??null,options.address??null,
  options.notes??null,options.internal??null,options.billing??null,options.contact??null
]);
const newContact=(extra={})=>({mode:'new',first_name:'Local',last_name:'Contact',email:randomUUID()+'@example.invalid',...extra});
const person=async(status='active')=>scalar(`insert into public.persons(first_name,last_name,status,inactive_at)
  values('Existing','Shared',$1,case when $1='inactive' then now() end) returning id`,[status]);
const snapshot=async()=>{
  const out={};
  for(const table of ['companies','customers','persons','company_contacts','audit_logs','human_code_counters'])
    out[table]=await query(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`);
  return out;
};
const policies=()=>query('select * from pg_policies order by schemaname,tablename,policyname');
const definitions=()=>query(`select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,
  p.proacl::text acl,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','elara_private') and p.prokind='f' order by 1`);
function scenario(name,fn){test('0055 '+name,async()=>{
  await db.exec('begin');
  try{const admin=await a.identity('administrativo');await a.claims(admin);await a.checkpoint();await fn(admin);}
  finally{await db.exec('rollback');}
});}
before(async()=>{
  db=new PGlite({extensions:{pgcrypto,btree_gist}});a=api(db);
  await bootstrap(db);
  for(const name of ['0052_initial_superadmin_bootstrap.sql','0053_app_session_concurrency.sql','0054_driver_accept_confirms_service.sql'])
    await db.exec(fs.readFileSync(path.join('supabase/migrations',name),'utf8'));
  baseline={policies:await policies(),definitions:await definitions()};
  await db.exec(fs.readFileSync(path.join('supabase/migrations',migration),'utf8'));
});
after(async()=>db?.close());

scenario('without contact creates exactly company/customer and returns server UUID/code/states',async admin=>{
  const counts=await snapshot(),r=await company();
  assert.match(r.company_id,/^[0-9a-f-]{36}$/);assert.match(r.customer_id,/^[0-9a-f-]{36}$/);
  assert.notEqual(r.company_id,r.customer_id);assert.match(r.customer_human_code,/^EMP-\d{4}$/);
  assert.equal(r.company_status,'active');assert.equal(r.customer_status,'new');
  assert.equal(r.contact_person_id,null);assert.equal(r.company_contact_id,null);
  const c=(await query('select * from public.customers where id=$1',[r.customer_id]))[0];
  assert.equal(c.company_id,r.company_id);assert.equal(c.person_id,null);assert.equal(c.customer_type,'company');assert.equal(c.created_by,admin.user);
  assert.deepEqual((await snapshot()).persons,counts.persons);assert.deepEqual((await snapshot()).company_contacts,counts.company_contacts);
  await a.checkpoint();
});
scenario('normalization and all optional fields persist in separate columns',async()=>{
  const request=randomUUID(),options={request,legal:'  Legal Name  ',tax:'  local-123  ',trade:' Trade ',phone:' +34 123 ',
    email:' BILLING@EXAMPLE.INVALID ',address:' Address ',notes:' Company notes ',internal:' Internal notes ',billing:' Billing notes '};
  const r=await company(options),c=(await query('select * from public.companies where id=$1',[r.company_id]))[0],customer=(await query('select * from public.customers where id=$1',[r.customer_id]))[0];
  for(const [key,value]of Object.entries({legal_name:'Legal Name',tax_id:'LOCAL-123',trade_name:'Trade',billing_phone:'+34 123',billing_email:'billing@example.invalid',billing_address:'Address',notes:'Company notes'}))assert.equal(c[key],value);
  assert.equal(customer.internal_notes,'Internal notes');assert.equal(customer.billing_notes,'Billing notes');assert.equal(customer.preferences,null);
  const before=await snapshot();assert.deepEqual(await company({...options,legal:'Legal Name',tax:'LOCAL-123',email:'billing@example.invalid'}),r);assert.deepEqual(await snapshot(),before);
});
scenario('blank optionals and JSON null contact normalize to absent',async()=>{
  const request=randomUUID(),tax='EMPTY-'+randomUUID(),r=await company({request,tax,trade:' ',phone:' ',email:' ',address:' ',notes:' ',internal:' ',billing:' ',contact:'null'});
  const c=(await query('select * from public.companies where id=$1',[r.company_id]))[0];
  for(const key of ['trade_name','billing_phone','billing_email','billing_address','notes'])assert.equal(c[key],null);
  assert.deepEqual(await company({request,tax}),r);
});
scenario('new contact is active/primary with server timing and a distinct active person',async()=>{
  const contact=newContact({first_name:' Ana ',last_name:' Ruiz ',phone:' 123 ',email:' ANA@EXAMPLE.INVALID ',role_label:' Office '}),r=await company({contact});
  const p=(await query('select * from public.persons where id=$1',[r.contact_person_id]))[0],link=(await query('select * from public.company_contacts where id=$1',[r.company_contact_id]))[0];
  assert.equal(p.first_name,'Ana');assert.equal(p.last_name,'Ruiz');assert.equal(p.phone,'123');assert.equal(p.contact_email,'ana@example.invalid');assert.equal(p.status,'active');
  assert.equal(link.company_id,r.company_id);assert.equal(link.person_id,p.id);assert.equal(link.is_primary,true);assert.equal(link.status,'active');assert.equal(link.role_label,'Office');assert.ok(link.started_at);await a.checkpoint();
});
scenario('new contact permits phone only or email only',async()=>{
  for(const contact of [newContact({email:null,phone:'123'}),newContact()])assert.ok((await company({contact})).contact_person_id);
});
scenario('existing contact remains byte-for-byte unchanged including shared relationships',async()=>{
  const id=await person(),first=await company({contact:{mode:'existing',person_id:id}}),before=await query('select to_jsonb(p) r from public.persons p where id=$1',[id]);
  const second=await company({contact:{mode:' EXISTING ',person_id:id.toUpperCase(),role_label:' Contact '}});
  assert.equal(second.contact_person_id,id);assert.notEqual(first.company_id,second.company_id);
  assert.deepEqual(await query('select to_jsonb(p) r from public.persons p where id=$1',[id]),before);await a.checkpoint();
});
scenario('required fields and email validation reject without writes',async()=>{
  const before=await snapshot();
  for(const options of [{legal:null},{legal:' '},{tax:null},{tax:' '},{email:'invalid'},{email:'a@b c.invalid'}])await a.rejects(()=>company(options),'22023');
  assert.deepEqual(await snapshot(),before);
});
scenario('strict contact JSON schema rejects unknown fields, wrong types and mixed modes',async()=>{
  const id=await person(),before=await snapshot();
  for(const contact of [[],true,42,'"text"',{}, {mode:'invalid'}, {mode:'new',first_name:4}, {mode:'new',...newContact(),extra:'x'},
    {mode:'existing',person_id:id,email:'x@example.invalid'}, {mode:'existing',person_id:4}, {mode:'existing',person_id:'not-uuid'},
    {mode:'new',...newContact(),person_id:id}, {mode:'new',...newContact(),role_label:[]}, {mode:[],person_id:id}])
    await a.rejects(()=>company({contact:JSON.stringify(contact)}),'22023');
  assert.deepEqual(await snapshot(),before);
});
scenario('incomplete contacts are rejected rather than silently discarded',async()=>{
  const before=await snapshot();
  for(const contact of [{mode:'new'},newContact({first_name:' '}),newContact({last_name:null}),newContact({phone:' ',email:' '}),newContact({email:'invalid'}),{mode:'existing'}])
    await a.rejects(()=>company({contact}),'22023');
  assert.deepEqual(await snapshot(),before);
});
scenario('missing or inactive existing person rolls back company and customer',async()=>{
  const inactive=await person('inactive'),before=await snapshot();
  await a.rejects(()=>company({contact:{mode:'existing',person_id:randomUUID()}}),'23503');
  await a.rejects(()=>company({contact:{mode:'existing',person_id:inactive}}),'23514');assert.deepEqual(await snapshot(),before);
});
scenario('tax duplicates include active/inactive companies and companies without a customer',async()=>{
  for(const status of ['active','inactive']){
    const tax='EXISTING-'+randomUUID();await query("insert into public.companies(legal_name,tax_id,status,inactive_at) values('Existing',$1,$2,case when $2='inactive' then now() end)",[tax,status]);
    const before=await snapshot();await a.rejects(()=>company({tax:' '+tax.toLowerCase()+' '}),'23505');assert.deepEqual(await snapshot(),before);
  }
});
scenario('new contact duplicates use the same 0048 identity rules; no automatic adoption',async()=>{
  const email='duplicate@example.invalid';await raw('admin_create_individual_customer',[randomUUID(),'Local','Contact','123',email]);
  const before=await snapshot();
  for(const contact of [newContact({email:email.toUpperCase()}),newContact({email:null,phone:'123'})])await a.rejects(()=>company({contact}),'23505');
  assert.deepEqual(await snapshot(),before);
});
scenario('exact replay is read-only, normalized, and survives mutable identity state changes',async()=>{
  const id=await person(),options={request:randomUUID(),tax:'REPLAY-'+randomUUID(),contact:{mode:'existing',person_id:id}},r=await company(options);
  await query("update public.persons set status='inactive',inactive_at=now() where id=$1",[id]);
  // Test receipt semantics without committing this intentionally incompatible state.
  const before=await snapshot();assert.deepEqual(await company(options),r);assert.deepEqual(await snapshot(),before);
});
scenario('lost reply replay creates only one company/customer/person/link/receipt',async()=>{
  const options={request:randomUUID(),tax:'LOST-'+randomUUID(),contact:newContact()},r=await company(options),before=await snapshot();
  for(let i=0;i<3;i++)assert.deepEqual(await company(options),r);
  assert.deepEqual(await snapshot(),before);assert.equal(Number(await scalar('select count(*) from public.audit_logs where request_id=$1',[options.request])),1);
});
scenario('request collisions reject different arguments, contacts and 0048 operations',async()=>{
  const options={request:randomUUID(),tax:'COLLISION-'+randomUUID()};await company(options);const before=await snapshot();
  for(const modified of [{legal:'Changed'},{tax:'OTHER'},{contact:newContact()}])await a.rejects(()=>company({...options,...modified}),'23505');
  await a.rejects(()=>raw('admin_create_individual_customer',[options.request,'Other','Person']),'23505');assert.deepEqual(await snapshot(),before);
  const key=randomUUID();await raw('admin_create_individual_customer',[key,'Existing','Individual']);await a.rejects(()=>company({request:key}),'23505');
});
scenario('same tax different request fails; replay remains available',async()=>{
  const options={request:randomUUID(),tax:'RACE-'+randomUUID()},r=await company(options),before=await snapshot();
  await a.rejects(()=>company({...options,request:randomUUID()}),'23505');assert.deepEqual(await company(options),r);assert.deepEqual(await snapshot(),before);
});
scenario('null request is rejected before writes',async()=>{
  await a.rejects(()=>raw('admin_create_company_customer',[null,'Company','TAX']),'22023');
});
for(const isolation of ['repeatable read','serializable'])scenario('unsupported isolation '+isolation+' is rejected before writes',async()=>{
  await db.exec('commit; begin isolation level '+isolation);
  const before=await snapshot();await a.rejects(()=>company(),'0A000');assert.deepEqual(await snapshot(),before);
});
for(const role of ['administrativo','superadmin'])scenario('real authenticated API role permits '+role,async admin=>{
  const operator=role==='administrativo'?admin:await a.identity(role);await a.claims(operator);await a.checkpoint();
  await db.exec('set local role authenticated');const r=await company();assert.ok(r.customer_id);await db.exec('reset role');await a.checkpoint();
});
scenario('missing/ended/foreign sessions and conductor are denied without artifacts',async admin=>{
  const conductor=await a.identity('conductor');await a.checkpoint();const before=await snapshot();
  await a.claims(null);await a.rejects(()=>company(),'28000');
  await a.claims({...admin,session:randomUUID()});await a.rejects(()=>company(),'28000');
  await a.claims(conductor);await a.rejects(()=>company(),'42501');
  await query('update public.app_sessions set ended_at=now() where supabase_session_id=$1',[admin.session]);await a.claims(admin);await a.rejects(()=>company(),'28000');
  assert.deepEqual(await snapshot(),before);
});
scenario('request is actor scoped, not transferable to another admin',async first=>{
  const options={request:randomUUID(),tax:'ACTOR-'+randomUUID()},r=await company(options),second=await a.identity('superadmin');await a.claims(second);await a.checkpoint();
  await a.rejects(()=>company(options),'23505');const other=await company({...options,tax:'SECOND-'+randomUUID()});assert.notEqual(other.customer_id,r.customer_id);
  await a.claims(first);assert.deepEqual(await company(options),r);
});
scenario('audit contains IDs/states and actor/session receipt, not contact or fiscal payloads',async admin=>{
  const request=randomUUID(),r=await company({request,tax:'PRIVATE-TAX',notes:'PRIVATE-NOTES',contact:newContact({email:'private-contact@example.invalid'})});
  const logs=await query('select * from public.audit_logs where transaction_id=txid_current()');
  const receipt=logs.find(x=>x.request_id===request);assert.equal(receipt.actor_app_user_id,admin.user);assert.equal(receipt.auth_session_id,admin.session);
  assert.equal(receipt.metadata.operation,'admin_company_customer_created');assert.equal(receipt.metadata.catalog_contract,'0048');assert.match(receipt.metadata.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(receipt.metadata.result,r);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE-TAX|PRIVATE-NOTES|private-contact@example.invalid/);
});
for(const point of ['customer','person','link','audit'])scenario('injected '+point+' failure rolls back ALL business rows, receipt and code counter',async()=>{
  const [table,timing,condition]=({customer:['customers','before','true'],person:['persons','before','true'],link:['company_contacts','after','true'],audit:['audit_logs','before',"new.metadata->>'operation'='admin_company_customer_created'"]})[point];
  await db.exec(`create function public.local_0055_failure() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'Injected local failure' using errcode='23514'; end if; return new; end $$;
    create trigger local_0055_failure ${timing} insert on public.${table} for each row execute function public.local_0055_failure()`);
  const before=await snapshot();await a.rejects(()=>company({contact:newContact()}),'23514');assert.deepEqual(await snapshot(),before);
});
scenario('deferred constraint failure at real COMMIT removes company/customer/person/link/receipt',async()=>{
  // A separate committed fixture transaction makes this an actual COMMIT check.
  await db.exec('commit; begin');const before=await snapshot(),r=await company({contact:newContact()});
  await query("update public.companies set status='inactive',inactive_at=now() where id=$1",[r.company_id]);
  await assert.rejects(()=>db.exec('commit'),e=>e.code==='23514');await db.exec('rollback; begin');assert.deepEqual(await snapshot(),before);
});
scenario('active link and principal uniqueness plus foreign keys remain enforced',async()=>{
  const r=await company({contact:newContact()}),other=await person();
  await a.rejects(()=>query("insert into public.company_contacts(company_id,person_id,status) values($1,$2,'active')",[r.company_id,r.contact_person_id]),'23505');
  await a.rejects(()=>query("insert into public.company_contacts(company_id,person_id,status,is_primary) values($1,$2,'active',true)",[r.company_id,other]),'23505');
  await a.rejects(()=>query("insert into public.company_contacts(company_id,person_id) values($1,$2)",[r.company_id,randomUUID()]),'23503');await a.checkpoint();
});
scenario('new company customer is usable by existing Services and financial-context contracts',async()=>{
  const r=await company(),service=await raw('create_service',[r.customer_id,'transfer','2099-01-01T10:00:00Z','Origin',null,'Destination',null]);
  assert.equal(await scalar('select customer_id from public.services where id=$1',[service.service_id]),r.customer_id);
  assert.equal(await scalar('select operational_status from public.services where id=$1',[service.service_id]),'pending');
  const context=await scalar('select public.get_service_financial_close_context($1)',[service.service_id]);assert.ok(context);
  await a.checkpoint();
});
scenario('safe function grants; direct table writes and helper execution remain denied',async()=>{
  assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',['authenticated',signature]),true);
  for(const role of ['anon','service_role'])assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[role,signature]),false);
  await db.exec('set local role authenticated');
  for(const sql of ["insert into public.companies(legal_name) values('Forbidden')","update public.persons set phone='Forbidden'","delete from public.company_contacts","select elara_private.catalog_person('A','B',null,null,null)"])
    await a.rejects(()=>query(sql),'42501');
  await db.exec('reset role');
  for(const role of ['anon','service_role']){
    await db.exec('set local role '+role);await a.rejects(()=>company(),'42501');await db.exec('reset role');
  }
});
scenario('temporary relation poisoning cannot redirect qualified writes',async()=>{
  await db.exec('create temporary table companies(id uuid,legal_name text); create temporary table persons(id uuid); create temporary table company_contacts(id uuid); create temporary table customers(id uuid)');
  const r=await company({contact:newContact()});assert.ok(r.customer_id);for(const t of ['companies','persons','company_contacts','customers'])assert.equal(Number(await scalar(`select count(*) from pg_temp.${t}`)),0);
});
test('0055 leaves every previous function/ACL and RLS policy unchanged',async()=>{
  assert.deepEqual(await policies(),baseline.policies);
  assert.deepEqual((await definitions()).filter(x=>!x.name.startsWith('admin_create_company_customer(')),baseline.definitions);
});
