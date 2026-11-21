
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),http=require('http'),cp=require('child_process');
const root=path.resolve(__dirname,'../..'),runtime=path.join(process.env.TEMP,'elara-0048-runtime/node_modules');

// Persistent psql sessions use binaries already present in the image. No npm install.
class Client {
 constructor(){this.tail=Promise.resolve();this.buffer='';this.serial=0;}
 async connect(){
  this.child=cp.spawn('docker',['exec','-i','--env','PGPASSWORD',pgName,'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=off','-v','VERBOSITY=verbose'],{env:{...env,PGPASSWORD:password},windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child.stdout.on('data',chunk=>{this.buffer+=chunk.toString();this.flush();});this.stderr='';this.child.stderr.on('data',c=>this.stderr+=c.toString());
  this.child.on('error',e=>this.pending?.reject(e));this.child.on('exit',()=>{if(this.pending)this.pending.reject(Error('Local psql session closed: '+this.stderr.slice(0,500)));});
  await this.query('select 1 ready');
 }
 flush(){if(!this.pending)return;const index=this.buffer.indexOf(this.pending.marker+' ');if(index<0)return;const end=this.buffer.indexOf('\n',index);if(end<0)return;
  const before=this.buffer.slice(0,index),status=this.buffer.slice(index,end).trim().split(/\s+/),pending=this.pending;this.buffer=this.buffer.slice(end+1);this.pending=null;clearTimeout(pending.timer);
  if(status[1]==='true'){const e=Error('PostgreSQL SQLSTATE '+status[2]);e.code=status[2];pending.reject(e);}else{const rows=before.split(/\r?\n/).filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));pending.resolve({rows});}
 }
 query(sql,parameters=[]){const run=this.tail.then(()=>new Promise((resolve,reject)=>{
  const quote=value=>value===null||value===undefined?'NULL':"'"+(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")+"'";
  sql=sql.replace(/\$(\d+)\b/g,(m,n)=>{if(Number(n)>parameters.length)throw Error('Missing SQL parameter');return quote(parameters[Number(n)-1]);}).trim().replace(/;\s*$/,'');
  if(/^select\b/i.test(sql))sql='select row_to_json(local_result)::text from ('+sql+') local_result';
  else if(/^insert\b/i.test(sql)&&/\breturning\b/i.test(sql))sql='with local_result as ('+sql+') select row_to_json(local_result)::text from local_result';
  const marker='ELARA_DONE_'+(++this.serial);const timer=setTimeout(()=>{this.pending=null;reject(Error('Local psql query timeout'));},30000);this.pending={marker,resolve,reject,timer};
  this.child.stdin.write(sql+';\n\\echo '+marker+' :ERROR :SQLSTATE\n');
 }));this.tail=run.catch(()=>{});return run;}
 async end(){if(this.child){this.child.stdin.end('\\q\n');await new Promise(r=>this.child.once('exit',r));}}
}

/* ELARA Transport — isolated Auth/PostgREST/PostgreSQL validation.
 * Run only with existing Docker images. No remote credentials or CLI linking.
 */
const vm=require('node:vm');
const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12),prefix='elara1c2-'+suffix;
const network=prefix+'-net',pgName=prefix+'-pg',authName=prefix+'-auth',restName=prefix+'-rest';
const password=crypto.randomBytes(24).toString('hex'),secret=crypto.randomBytes(48).toString('hex');
const env={...process.env,ELARA_LOCAL_PASSWORD:password,GOTRUE_JWT_SECRET:secret,PGRST_JWT_SECRET:secret};
const results={images:{postgres:'public.ecr.aws/supabase/postgres:17.6.1.165',auth:'public.ecr.aws/supabase/gotrue:v2.196.0',rest:'public.ecr.aws/supabase/postgrest:v16.1'},tests:[],cleanup:{}};
const containers=[];let control,proxy,createdNetwork=false;
const docker=args=>cp.execFileSync('docker',args,{env,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const row=async(sql,args=[])=>(await control.query(sql,args)).rows[0];
function token(role,claims={},key=secret){const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const data=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,exp:Math.floor(Date.now()/1000)+600,...claims});return data+'.'+crypto.createHmac('sha256',key).update(data).digest('base64url');}
async function check(name,fn){await fn();results.tests.push({name,result:'PASS'});console.log('PASS '+name);}
function runContainer(name,args){docker(['run','-d','--pull=never','--name',name,'--network',network,...args]);containers.push(name);}
function port(name,p){return Number(docker(['port',name,p+'/tcp']).split(':').pop());}
async function healthy(url){for(let i=0;i<80;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await pause(250);}throw Error('Local service did not become healthy');}
async function main(){try{
 docker(['network','create',network]);createdNetwork=true;
 runContainer(pgName,['--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',results.images.postgres,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" > /tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; printf "host all all all scram-sha-256\\n" >> /tmp/elara-pg/pg_hba.conf; exec postgres -D /tmp/elara-pg -c listen_addresses=*']);
 for(let i=0;i<40;i++){try{control=new Client();await control.connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 results.migrationSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'supabase/migrations/0055_admin_create_company_customer.sql'))).digest('hex');
 await control.query(`create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;`);
 env.GOTRUE_DB_DATABASE_URL=`postgres://postgres:${password}@${pgName}:5432/postgres?search_path=auth`;
 runContainer(authName,['-p','127.0.0.1::9999','--env','GOTRUE_DB_DATABASE_URL','--env','GOTRUE_JWT_SECRET','-e','GOTRUE_DB_DRIVER=postgres','-e','DB_NAMESPACE=auth','-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999','-e','API_EXTERNAL_URL=http://127.0.0.1:9999','-e','GOTRUE_SITE_URL=http://127.0.0.1','-e','GOTRUE_JWT_ADMIN_ROLES=service_role','-e','GOTRUE_JWT_AUD=authenticated','-e','GOTRUE_JWT_DEFAULT_GROUP=authenticated','-e','GOTRUE_MAILER_AUTOCONFIRM=true','-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true',results.images.auth]);
 const authBase='http://127.0.0.1:'+port(authName,9999);await healthy(authBase+'/health');
 // Only Storage is a minimal boundary. Auth users/sessions/identities are GoTrue's actual migrations.
 await control.query(`create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],updated_at timestamptz);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);
 const ordinal=f=>Number(f.slice(0,4))+Number(f.match(/^\d{4}(\d*)_/)[1]||0)/10;
 const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort((a,b)=>ordinal(a)-ordinal(b));
 for(const f of migrations)await control.query(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8').replace(/^\uFEFF/,''));
 results.migrations=migrations;console.log('PASS real Auth schema and all application migrations');
 await control.query(`create role authenticator login password '${password}' noinherit; grant anon,authenticated,service_role to authenticator;`);
 env.PGRST_DB_URI=`postgres://authenticator:${password}@${pgName}:5432/postgres`;
 runContainer(restName,['-p','127.0.0.1::3000','--env','PGRST_DB_URI','--env','PGRST_JWT_SECRET','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon',results.images.rest]);
 const restBase='http://127.0.0.1:'+port(restName,3000);await healthy(restBase+'/');
 // Route real SDK paths. Refuse any upstream other than these loopback services.
 proxy=http.createServer((req,res)=>{const auth=req.url.startsWith('/auth/v1/'),rest=req.url.startsWith('/rest/v1/');if(!auth&&!rest){res.writeHead(404);return res.end();}const target=new URL(req.url.replace(auth?'/auth/v1':'/rest/v1',''),auth?authBase:restBase);const headers={...req.headers};delete headers.host;const up=http.request(target,{method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});up.on('error',()=>{res.writeHead(502);res.end();});req.pipe(up);});
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+proxy.address().port;
 const ctx={console,URL,URLSearchParams,Headers,Request,Response,fetch,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,crypto:crypto.webcrypto,WebSocket:globalThis.WebSocket};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(process.env.TEMP,'elara-supabase-2.118.0.js'),'utf8'),ctx);
 const create=()=>ctx.supabase.createClient(base,token('anon'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 async function identity(context){const email=crypto.randomUUID()+'@example.invalid',pw=crypto.randomBytes(24).toString('hex');const r=await fetch(authBase+'/admin/users',{method:'POST',headers:{Authorization:'Bearer '+token('service_role'),'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,email_confirm:true,role:'authenticated'})});assert.equal(r.status,200);const u=await r.json();await control.query('begin');const person=(await row("insert into public.persons(first_name,last_name) values('Isolated','Auth') returning id")).id;const app=(await row('insert into public.app_users(auth_user_id,person_id,default_context) values($1,$2,$3) returning id',[u.id,person,context])).id;await control.query('insert into public.user_roles(user_id,role_key) values($1,$2)',[app,context]);await control.query('commit');const sdk=create();const login=await sdk.auth.signInWithPassword({email,password:pw});assert.equal(login.error,null);assert.ok(login.data.session.access_token);const initialized=await sdk.rpc('initialize_app_session',{p_requested_context:context});assert.equal(initialized.error,null,JSON.stringify(initialized.error));return {sdk,login,app};}
 let admin,ordinary;
 await check('GoTrue password login, issued JWT and real initialize_app_session',async()=>{admin=await identity('administrativo');ordinary=await identity('conductor');const claims=JSON.parse(Buffer.from(admin.login.data.session.access_token.split('.')[1],'base64url'));assert.ok((await row('select id from auth.sessions where id=$1',[claims.session_id])).id);});
 const args=(extra={})=>({p_request_id:crypto.randomUUID(),p_legal_name:'Isolated company',p_tax_id:'LOCAL-'+crypto.randomUUID(),...extra});
 const invoke=p=>admin.sdk.rpc('admin_create_company_customer',p);
 let first,request;
 await check('SDK RPC without contact, seven-field TABLE response and immutable retry',async()=>{request=args();const r=await invoke(request);assert.equal(r.error,null,JSON.stringify(r.error));assert.equal(r.data.length,1);first=r.data[0];assert.equal(Object.keys(first).length,7);assert.equal(first.company_status,'active');assert.equal(first.customer_status,'new');assert.match(first.customer_human_code,/^EMP-\d{4,}$/);assert.equal(first.contact_person_id,null);assert.deepEqual((await invoke(request)).data,r.data);const changed=await invoke({...request,p_tax_id:'CHANGED'});assert.equal(changed.error.code,'23505');});
 await check('SDK new contact, optional fields and three independent notes',async()=>{const r=await invoke(args({p_company_notes:'Company note',p_customer_internal_notes:'Internal note',p_customer_billing_notes:'Billing note',p_trade_name:'Trade',p_billing_email:'BILLING@EXAMPLE.INVALID',p_contact:{mode:'new',first_name:'Local',last_name:'Contact',email:crypto.randomUUID()+'@example.invalid'}}));assert.equal(r.error,null,JSON.stringify(r.error));const v=r.data[0];assert.ok(v.contact_person_id);const stored=await row('select c.notes,c.billing_email,u.internal_notes,u.billing_notes from public.companies c join public.customers u on u.company_id=c.id where c.id=$1',[v.company_id]);assert.deepEqual(stored,{notes:'Company note',billing_email:'billing@example.invalid',internal_notes:'Internal note',billing_notes:'Billing note'});});
 await check('SDK existing contact remains unchanged',async()=>{const p=await row('select to_jsonb(p) value from public.persons p limit 1');const r=await invoke(args({p_contact:{mode:'existing',person_id:p.value.id,role_label:'Contact'}}));assert.equal(r.error,null,JSON.stringify(r.error));assert.deepEqual(await row('select to_jsonb(p) value from public.persons p where id=$1',[p.value.id]),p);});
 await check('SDK required fields, duplicate tax and invalid contact roll back',async()=>{const count=()=>row('select (select count(*) from companies)::int companies,(select count(*) from customers)::int customers,(select count(*) from persons)::int persons,(select count(*) from company_contacts)::int contacts,(select count(*) from audit_logs)::int audit');const before=await count();for(const patch of [{p_legal_name:' '},{p_tax_id:' '},{p_contact:{mode:'new',first_name:'A'}}])assert.equal((await invoke(args(patch))).error.code,'22023');assert.equal((await invoke(args({p_tax_id:request.p_tax_id}))).error.code,'23505');assert.deepEqual(await count(),before);});
 await check('authenticated non-admin denied by RPC',async()=>{assert.equal((await ordinary.sdk.rpc('admin_create_company_customer',args())).error.code,'42501');});
 await check('absent, forged and expired JWT rejected before writes',async()=>{for(const bearer of [null,token('authenticated',{},'wrong-key'),token('authenticated',{exp:1})]){const r=await fetch(restBase+'/rpc/admin_create_company_customer',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(args())});assert.ok([401,403].includes(r.status));}assert.equal((await create().rpc('admin_create_company_customer',args())).error.code,'42501');});
 await check('direct table INSERT UPDATE DELETE denied',async()=>{for(const table of ['companies','customers','persons','company_contacts']){const insert=await admin.sdk.from(table).insert({id:crypto.randomUUID()});assert.equal(insert.error?.code,'42501');const update=await admin.sdk.from(table).update({id:crypto.randomUUID()}).eq('id',crypto.randomUUID());assert.equal(update.error?.code,'42501');const del=await admin.sdk.from(table).delete().eq('id',crypto.randomUUID());assert.equal(del.error?.code,'42501');}});
 await check('Clientes and Servicios actual identity queries read new customer under RLS',async()=>{const tables={};for(const name of ['persons','companies','customers']){const r=await admin.sdk.from(name).select('*',{count:'exact'}).range(0,999);assert.equal(r.error,null);tables[name]=r.data;}const customer=tables.customers.find(c=>c.id===first.customer_id);assert.ok(customer);assert.ok(['new','active'].includes(customer.status));const window={ElaraSupabase:{client:admin.sdk},ElaraAuth:{getCurrentUser:()=>admin.login.data.user,getActiveContext:()=> 'administrativo'}};const c={window,console,Intl,Date,Set,Map};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'src/js/operational-data.js'),'utf8'),c);await window.ElaraOperationalData.loadIdentity({tables:['persons','companies','customers']});assert.equal(window.ElaraOperationalData.customerName(customer),'Isolated company');});
 await check('actual company form with real SDK/Auth/HTTP and uncertain response replay',async()=>{
  const {parseHTML,HTMLElement,HTMLSelectElement}=require(path.join(runtime,'linkedom'));
  const {document}=parseHTML(fs.readFileSync(path.join(root,'src/index.html'),'utf8'));
  Object.defineProperty(HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===v);}});
  Object.defineProperty(HTMLElement.prototype,'elements',{configurable:true,get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(e=>[e.name,e]));}});
  const listeners=new Map();const window={crypto,location:{hash:'#clientes'},ElaraAuth:{getCurrentUser:()=>admin.login.data.user,getActiveContext:()=> 'administrativo'},ElaraConfig:{environment:'local'},ElaraSupabase:{client:admin.sdk,getPublicConfig:()=>({url:base})},addEventListener:(n,f)=>listeners.set(n,f)};
  const c={window,document,console,Intl,Date,Set,Map,FormData:class{constructor(form){this.rows=[...form.querySelectorAll('[name]')].filter(e=>!e.disabled&&(e.type!=='radio'||e.checked)).map(e=>[e.name,e.value]);}[Symbol.iterator](){return this.rows[Symbol.iterator]();}}};
  vm.createContext(c);for(const file of ['operational-data','catalog-admin'])vm.runInContext(fs.readFileSync(path.join(root,'src/js/'+file+'.js'),'utf8'),c);
  const api=window.ElaraCatalogAdmin;let reloads=0;api.attach('customers',async()=>{reloads++;return true;});document.getElementById('clientes').hidden=false;
  await api.open('customers','customerCreate');const modal=document.getElementById('new-customer-modal'),form=modal.querySelector('form');assert.ok(form,modal.textContent);
  form.querySelector('[data-customer-type=company]').onclick();assert.equal(form.querySelector('[type=submit]').disabled,true);
  const tax='FORM-'+crypto.randomUUID();for(const [k,v]of Object.entries({legalName:'HTTP form company',taxId:tax,companyNotes:'Form company',customerInternalNotes:'Form internal',customerBillingNotes:'Form billing',contactMode:'new',contactFirstName:'Form',contactLastName:'Contact',contactEmail:crypto.randomUUID()+'@example.invalid'}))form.elements[k].value=v;
  form.elements.contactMode.onchange();assert.equal(form.querySelector('[type=submit]').disabled,false);const rpc=admin.sdk.rpc.bind(admin.sdk);let lost=true,calls=[];
  admin.sdk.rpc=async(name,args)=>{calls.push(JSON.stringify(args));const r=await rpc(name,args);if(name==='admin_create_company_customer'&&lost&&!r.error){lost=false;throw Error('Injected loss after real HTTP commit');}return r;};
  try{await form.onsubmit({preventDefault(){}});assert.match(form.querySelector('[data-catalog-status]').textContent,/incierto/);await form.onsubmit({preventDefault(){}});assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);assert.equal(reloads,1,form.querySelector('[data-catalog-status]').textContent);assert.match(form.querySelector('[data-catalog-status]').textContent,/Guardado correctamente/);const stored=await row('select count(*)::int n from public.companies where tax_id=upper($1)',[tax]);assert.equal(stored.n,1);}
  finally{admin.sdk.rpc=rpc;}
 });
 results.environment={postgres:(await row('select version() v')).v,authHealth:await (await fetch(authBase+'/health')).json(),sdk:'2.118.0',routing:'loopback HTTP proxy; no mocked responses',storage:'minimal schema boundary; Storage service not exercised'};
}finally{
 if(proxy)await new Promise(r=>proxy.close(r));if(control)await control.end().catch(()=>{});
 for(const name of containers.reverse())try{docker(['rm','-f',name]);results.cleanup[name]='removed';}catch{results.cleanup[name]='FAILED';}
 if(createdNetwork)try{docker(['network','rm',network]);results.cleanup.network='removed';}catch{results.cleanup.network='FAILED';}
 fs.writeFileSync(path.join(process.env.TEMP,'elara-1c2-auth-results.json'),JSON.stringify(results,null,2));
}}
main().then(()=>process.exit(0),e=>{console.error(e.stack);process.exit(1);});
