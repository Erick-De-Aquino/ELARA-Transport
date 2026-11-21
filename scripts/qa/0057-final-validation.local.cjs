'use strict';
// Isolated PostgreSQL only. Existing image, no ports, network, volumes or installs.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),cp=require('child_process');
const root=path.resolve(__dirname,'../..');
class Client {
 constructor(){this.tail=Promise.resolve();this.buffer='';this.serial=0;}
 async connect(){
  this.child=cp.spawn('docker',['exec','-i','--env','PGPASSWORD',pgName,'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=off','-v','VERBOSITY=verbose'],{env:{...env,PGPASSWORD:password},windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child.stdout.on('data',chunk=>{this.buffer+=chunk.toString();this.flush();});this.stderr='';this.child.stderr.on('data',c=>this.stderr+=c.toString());
  this.child.on('error',e=>this.pending?.reject(e));this.child.on('exit',()=>{if(this.pending)this.pending.reject(Error('Local psql session closed: '+this.stderr.slice(0,500)));});
  this.appName='elara0056-'+crypto.randomUUID();
  await this.query("select set_config('application_name',$1,false)",[this.appName]);
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


const {bootstrap,api}=require('../../tests/company-contacts-0056-harness.cjs');
const migration=fs.readFileSync('supabase/migrations/0057_admin_users.sql','utf8');
const password=crypto.randomBytes(32).toString('hex'),pgName='elara0057-'+crypto.randomUUID().replaceAll('-','').slice(0,12);
const env={...process.env,PGPASSWORD:password,ELARA_LOCAL_PASSWORD:password};
const image='public.ecr.aws/supabase/postgres:17.6.1.165';
const results={image,tests:[],cleanup:{},remoteAccess:false};let control,created=false;const clients=[];
const docker=args=>cp.execFileSync('docker',args,{env,encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(actor){const c=new Client();await c.connect();c.exec=async s=>{
 // Preserve the original deferred-trigger SQLSTATE: psql's final :SQLSTATE
 // would otherwise report 25P02 from the second statement after the first fails.
 if(/^set constraints all immediate; set constraints all deferred$/i.test(s)){await c.query('set constraints all immediate');return c.query('set constraints all deferred');}
 return c.query(s);
};clients.push(c);if(actor){await api(c).claims(actor);await c.exec('set role authenticated');}return c;}
async function check(name,fn){await fn();results.tests.push({name,result:'PASS'});console.log('PASS '+name);}
async function waiting(c){for(let i=0;i<150;i++){const row=(await control.query("select wait_event_type from pg_stat_activity where application_name=$1",[c.appName])).rows[0];if(row?.wait_event_type==='Lock')return;await pause(20);}throw Error('Contender did not enter an observed PostgreSQL lock wait');}
async function blocked(c,fn){const pending=fn().then(value=>({value}),error=>({error}));await waiting(c);return {pending};}
async function collision(name,winner,contender,code){
 await check(name,async()=>{await winner.c.exec('begin');const first=await winner.fn();let pending;
  try{({pending}=await blocked(contender.c,contender.fn));await winner.c.exec('commit');const r=await pending;assert.equal(r.error?.code,code);assert.equal(r.value,undefined);return first;}
  finally{await winner.c.exec('rollback');}
 });
}

// Validate only the prepared artifact in a disposable native database. No deploy mode.
async function main(){try{
 const b=JSON.parse(fs.readFileSync('docs/0057-final-readonly-baseline.json','utf8')).baseline;
 const approved=JSON.parse(fs.readFileSync('docs/0057-local-manifest.json','utf8'));
 const prepared=JSON.parse(fs.readFileSync('docs/0057-atomic-deployment.sql.manifest.json','utf8'));
 const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
 for(const [file,hash]of Object.entries(approved.files))assert.equal(sha(fs.readFileSync(file)),hash);
 const artifact=fs.readFileSync('docs/0057-atomic-deployment.sql','utf8'),verify=fs.readFileSync('docs/0057-atomic-deployment.sql.verify.sql','utf8');
 assert.equal(sha(artifact),prepared.artifact_sha256);assert.equal(sha(verify),prepared.verification_sha256);
 assert.equal(sha(migration),prepared.source_sha256);
 docker(['run','-d','--pull=never','--network','none','--name',pgName,'--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',image,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" >/tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; exec postgres -D /tmp/elara-pg -c listen_addresses=127.0.0.1']);created=true;
 for(let i=0;i<40;i++){try{control=await connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 await bootstrap(control);await control.exec(require('../../tests/company-contacts-0056-harness.cjs').migration);
 await control.exec("create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt()->>'role','authenticated') $$");const a=api(control);
 await control.exec('begin');const admin=await a.identity('superadmin'),other=await a.identity('superadmin'),target=await a.identity('administrativo');await a.claims(admin);
 for(const u of [admin,other,target])await control.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.session,u.auth]);
 const driver=await a.scalar("select driver_id from public.admin_create_driver($1,'Existing','Local Driver','internal_driver')",[crypto.randomUUID()]);
 await control.query('update app_users set person_id=(select person_id from drivers where id=$1) where id=$2',[driver,target.user]);
 await a.scalar("select public.assign_user_role($1,'conductor','Existing isolated link')",[target.user]);
 await control.query('insert into user_driver_links(user_id,driver_id,created_by) values($1,$2,$3)',[target.user,driver,admin.user]);
 await a.checkpoint();await control.exec('commit');
 // Use the exact existing remote function definitions as local baseline metadata.
 for(const f of b.functions)await control.exec(f.definition);
 await control.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[],created_by text,idempotency_key text unique,rollback text)');
 await control.query('insert into supabase_migrations.schema_migrations(version,name) select version,name from jsonb_to_recordset($1::jsonb) as h(version text,name text)',[b.history]);
 const snapshot=async()=>{const out={};for(const table of ['auth.users','auth.sessions','public.persons','public.app_users','public.roles','public.user_roles','public.app_sessions','public.drivers','public.user_driver_links','public.audit_logs'])out[table]=await a.scalar("select md5(coalesce(string_agg((to_jsonb(t)-'admin_version')::text,'' order by (to_jsonb(t)-'admin_version')::text collate \"C\"),'')) from "+table+' t');return out;};
 const before=await snapshot();
 await check('injected late failure rolls back schema, history and preserves existing identities',async()=>{
  const errorsBefore=control.stderr.length;
  await control.exec(artifact.replace('do $post_0057$ begin',"do $post_0057$ begin raise exception 'Isolated rollback test';"));
  assert(control.stderr.slice(errorsBefore).includes('Isolated rollback test'));
  assert.equal(await a.scalar("select to_regclass('elara_private.user_admin_rollout')"),null);
  assert.equal(Number(await a.scalar('select count(*) from supabase_migrations.schema_migrations')),58);assert.deepEqual(await snapshot(),before);
 });
 await check('exact individual artifact commits once and records only 0057',async()=>{
  await control.exec(artifact);assert.equal(Number(await a.scalar('select count(*) from supabase_migrations.schema_migrations')),59);
  assert.equal(Number(await a.scalar('select count(*) from supabase_migrations.schema_migrations where version=$1',[prepared.version])),1);
  assert.equal(Number(await a.scalar('select count(*) from elara_private.user_admin_rollout')),0);
 });
 await check('installation preserves every existing account, role, session, link and audit row',async()=>assert.deepEqual(await snapshot(),before));
 const c1=await connect(admin),c2=await connect(other);
 const call=(c,name,args)=>c.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args).then(r=>r.rows[0].value);
 await check('inert state persists after commit across two fresh authenticated backends',async()=>{
  for(const c of [c1,c2]){const caps=await call(c,'admin_get_user_control',[null]);assert.equal(caps.authorized,true);assert.equal(caps.manage,false);assert(Object.values(caps.operations).every(v=>v===false));}
 });
 await check('direct administrative and invitation writes fail closed on the server',async()=>{
  for(const action of ['metadata','status','assign','revoke']){
   const r=await call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,1,action,{},'Isolated disabled operation']).then(value=>({value}),error=>({error}));assert.equal(r.error?.code,'55000');
  }
  const r=await call(c1,'admin_prepare_user_invitation',[crypto.randomUUID(),{email:'isolated@example.invalid',first_name:'Local',last_name:'Test',roles:['administrativo'],default_context:'administrativo',reason:'Isolated invitation'}]).then(value=>({value}),error=>({error}));assert.equal(r.error?.code,'55000');
  assert.equal(Number(await a.scalar('select count(*) from elara_private.user_admin_requests')),0);assert.deepEqual(await snapshot(),before);
 });
 const verification=async()=>{const r=await control.exec(verify);assert(r.rows.some(r=>r.verification===true&&r.read_only==='on'));};
 await check('read-only verifier validates all function bodies, permissions, empty controls and history',verification);
 await check('a repeated artifact is rejected without changing installed metadata or identities',async()=>{
  await control.exec(artifact);assert.equal(Number(await a.scalar('select count(*) from supabase_migrations.schema_migrations')),59);assert.deepEqual(await snapshot(),before);await verification();
 });
}finally{
 for(const c of clients)try{await c.end();}catch{}
 if(created){docker(['rm','-f',pgName]);results.cleanup.container='removed';}
 fs.writeFileSync('docs/0057-final-local-results.json',JSON.stringify(results,null,2)+'\n');console.log('Evidence docs/0057-final-local-results.json');
}}
main().catch(e=>{console.error('Isolated final validation failed: '+(e.code||e.message));process.exitCode=1;});
