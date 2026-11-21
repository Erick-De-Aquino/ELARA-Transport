
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
const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12),prefix='elara0056http-'+suffix;
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
 results.migrationSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'supabase/migrations/0056_admin_company_contacts.sql'))).digest('hex');
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

 const companyArgs=()=>({p_request_id:crypto.randomUUID(),p_legal_name:'Local HTTP0056',p_tax_id:'LOCAL-'+crypto.randomUUID()});
 let company,shared,newArgs,added,linked,selected;const existing=await row('select to_jsonb(p) value from public.persons p join public.app_users u on u.person_id=p.id where u.id=$1',[admin.app]);
 const rpc=async(name,args)=>{const r=await admin.sdk.rpc(name,args);assert.equal(r.status,200);assert.equal(r.error,null,JSON.stringify(r.error));assert.equal(typeof r.data,'object');assert.ok(r.data.company_contact_id);return r.data;};
 await check('HTTP 200: new contact and existing active shared person; exact JSON result',async()=>{
  const c=await admin.sdk.rpc('admin_create_company_customer',companyArgs());assert.equal(c.error,null);company=c.data[0];
  newArgs={p_request_id:crypto.randomUUID(),p_customer_id:company.customer_id,p_contact:{mode:'new',first_name:'Local',last_name:'HTTP0056',email:crypto.randomUUID()+'@example.invalid'},p_is_primary:true,p_notes:'Local link'};
  added=await rpc('admin_add_company_contact',newArgs);assert.equal(added.version,1);assert.equal(added.is_primary,true);assert.deepEqual(Object.keys(added).sort(),['customer_id','company_id','company_contact_id','person_id','status','is_primary','version'].sort());
  linked=await rpc('admin_add_company_contact',{p_request_id:crypto.randomUUID(),p_customer_id:company.customer_id,p_contact:{mode:'existing',person_id:existing.value.id,role_label:'Shared'},p_is_primary:false});
  const second=await admin.sdk.rpc('admin_create_company_customer',companyArgs());assert.equal(second.error,null);shared=await rpc('admin_add_company_contact',{p_request_id:crypto.randomUUID(),p_customer_id:second.data[0].customer_id,p_contact:{mode:'existing',person_id:existing.value.id}});
 });
 const primaryArgs=()=>({p_request_id:crypto.randomUUID(),p_customer_id:company.customer_id,p_company_contact_id:linked.company_contact_id,p_expected_version:linked.version,p_expected_primary_contact_id:added.company_contact_id,p_expected_primary_version:added.version,p_reason:'Local replacement'});
 const updateArgs=(t)=>({p_request_id:crypto.randomUUID(),p_customer_id:company.customer_id,p_company_contact_id:t.company_contact_id,p_expected_version:t.version,p_patch:{status:'inactive'},p_reason:'Local deactivation'});
 await check('HTTP 403: non-admin denied on all three RPC; absent/forged JWT denied',async()=>{
  for(const [name,args]of [['admin_add_company_contact',newArgs],['admin_set_company_primary_contact',primaryArgs()],['admin_update_company_contact',updateArgs(added)]]){const r=await ordinary.sdk.rpc(name,args);assert.equal(r.status,403);assert.equal(r.error.code,'42501');}
  for(const bearer of [null,token('authenticated',{},'invalid-key')]){const r=await fetch(restBase+'/rpc/admin_add_company_contact',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(newArgs)});assert.ok([401,403].includes(r.status));}
 });
 await check('HTTP 200: atomic replacement, idempotent primary receipt and stale HTTP 500/40001',async()=>{
  const args=primaryArgs();selected=await rpc('admin_set_company_primary_contact',args);assert.equal(selected.is_primary,true);assert.equal(selected.version,2);assert.equal((await row('select is_primary,version from company_contacts where id=$1',[added.company_contact_id])).is_primary,false);
  assert.deepEqual(await rpc('admin_set_company_primary_contact',args),selected);const stale=await admin.sdk.rpc('admin_set_company_primary_contact',{...args,p_request_id:crypto.randomUUID()});assert.equal(stale.status,500);assert.equal(stale.error.code,'40001');
 });
 await check('HTTP 200: secondary/primary deactivation, dates and immutable update replay',async()=>{
  const args=updateArgs(selected);const inactive=await rpc('admin_update_company_contact',args);assert.equal(inactive.status,'inactive');assert.equal(inactive.is_primary,false);assert.ok(inactive.ended_at);assert.deepEqual(await rpc('admin_update_company_contact',args),inactive);
  const secondary=await rpc('admin_update_company_contact',updateArgs({...added,version:2}));assert.equal(secondary.status,'inactive');assert.equal((await row("select count(*)::int n from company_contacts where company_id=$1 and status='active' and is_primary",[company.company_id])).n,0);
 });
 await check('HTTP 200/409: add receipt replay after deactivation and changed payload rejected',async()=>{
  assert.deepEqual(await rpc('admin_add_company_contact',newArgs),added);const changed=await admin.sdk.rpc('admin_add_company_contact',{...newArgs,p_notes:'Changed'});assert.equal(changed.status,409);assert.equal(changed.error.code,'23505');
  assert.equal((await row('select count(*)::int n from persons where contact_email=$1',[newArgs.p_contact.email])).n,1);
 });
 await check('shared identity byte-for-byte unchanged; other active company link retained',async()=>{
  assert.deepEqual(await row('select to_jsonb(p) value from public.persons p where p.id=$1',[existing.value.id]),existing);assert.equal((await row('select status from company_contacts where id=$1',[shared.company_contact_id])).status,'active');
  const denial=await admin.sdk.from('company_contacts').update({notes:'Forbidden'}).eq('id',shared.company_contact_id);assert.equal(denial.error.code,'42501');
 });
 results.environment={postgres:(await row('select version() v')).v,authHealth:await (await fetch(authBase+'/health')).json(),sdk:'2.118.0',routing:'loopback HTTP proxy; no mocked responses',storage:'minimal schema boundary; Storage service not exercised'};
}finally{
 if(proxy)await new Promise(r=>proxy.close(r));if(control)await control.end().catch(()=>{});
 for(const name of containers.reverse())try{docker(['rm','-f',name]);results.cleanup[name]='removed';}catch{results.cleanup[name]='FAILED';}
 if(createdNetwork)try{docker(['network','rm',network]);results.cleanup.network='removed';}catch{results.cleanup.network='FAILED';}
 fs.writeFileSync(path.join(process.env.TEMP,'elara-0056-http-results.json'),JSON.stringify(results,null,2));
}}
main().then(()=>process.exit(0),e=>{console.error(e.stack);process.exit(1);});
