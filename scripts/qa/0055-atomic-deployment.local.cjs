
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),http=require('http'),cp=require('child_process');
const root=path.resolve(__dirname,'../..');

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

/* ELARA Transport — native PostgreSQL deployment tests, local containers only.
 * No published ports, no volumes, --network none, --pull=never, ephemeral password. */
const {prepare,VERSION,NAME,SIGNATURE,quote}=require('./0055-prepare-atomic.cjs');
const password=crypto.randomBytes(32).toString('hex'),pgName='elara0055deploy-'+crypto.randomUUID().replaceAll('-','').slice(0,12);
const env={...process.env,PGPASSWORD:password,ELARA_LOCAL_PASSWORD:password};
const image='public.ecr.aws/supabase/postgres:17.6.1.165';
const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/0055-remote-audit-evidence.json'),'utf8'));
const {artifact,guard,register,manifest}=prepare();
const results={manifest,image,tests:[],cleanup:{}};let control,created=false;
const docker=args=>cp.execFileSync('docker',args,{env,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const query=(s,p=[])=>(control.query(s,p));
const rows=async(s,p=[])=>(await query(s,p)).rows;
const row=async(s,p=[])=>(await rows(s,p))[0];
function psqlArgs(){return ['exec','-i','--env','PGPASSWORD',pgName,'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f','-'];}
function apply(sql=artifact){return cp.spawnSync('docker',psqlArgs(),{env,encoding:'utf8',input:sql,timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});}
async function snapshot(){return {
 history:await rows('select to_jsonb(h) value from supabase_migrations.schema_migrations h order by version'),
 functions:await rows("select p.oid::regprocedure::text signature,replace(pg_get_functiondef(p.oid),chr(13),'') definition,(select array_agg(a::text order by a::text collate \"C\") from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a) acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','elara_private') and p.prokind='f' order by 1"),
 business:await rows("select 'companies' t,to_jsonb(x) value from companies x union all select 'customers',to_jsonb(x) from customers x union all select 'persons',to_jsonb(x) from persons x union all select 'company_contacts',to_jsonb(x) from company_contacts x union all select 'audit_logs',to_jsonb(x) from audit_logs x union all select 'human_code_counters',to_jsonb(x) from human_code_counters x order by 1,2")
};}
async function state(){return row(`select exists(select 1 from supabase_migrations.schema_migrations where version=${quote(VERSION)}) history,to_regprocedure(${quote(SIGNATURE)}) is not null function`);}
async function resetInstalled(){await query(`drop function if exists ${SIGNATURE}; delete from supabase_migrations.schema_migrations where version=${quote(VERSION)}`);}
async function check(name,fn){await fn();results.tests.push({name,result:'PASS'});console.log('PASS '+name);}
async function unchangedFailure(sql=artifact){const before=await snapshot(),r=apply(sql);assert.notEqual(r.status,0,'Expected psql to stop');assert.deepEqual(await snapshot(),before);return r;}
async function main(){try{
 docker(['run','-d','--pull=never','--network','none','--name',pgName,'--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',image,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" >/tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; exec postgres -D /tmp/elara-pg -c listen_addresses=127.0.0.1']);created=true;
 for(let i=0;i<40;i++){try{control=new Client();await control.connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 control.exec=s=>query(s);
 await require(path.join(root,'tests/control-0051-harness.cjs')).bootstrap(control);
 for(const n of ['0052_initial_superadmin_bootstrap.sql','0053_app_session_concurrency.sql','0054_driver_accept_confirms_service.sql'])await query(fs.readFileSync(path.join(root,'supabase/migrations',n),'utf8'));
 // Reproduce the audited hosted function grants; no real rows are copied.
 let grants='';for(const f of evidence.function_fingerprints){
  grants+=`revoke all on function ${f.signature} from public,anon,authenticated,service_role;\n`;
  const acl=f.acl?f.acl.slice(1,-1).split(','):['=X/postgres','postgres=X/postgres'];
  for(const item of acl){const [who,rest]=item.split('=');if(rest.startsWith('X'))grants+=`grant execute on function ${f.signature} to ${who||'public'};\n`;}
 }
 await query(grants);
 await query('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[])');
 for(const h of evidence.migrations)await query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,array[\'synthetic local history marker\'])',[h.version,h.name]);
 results.postgres=(await row('select version() v')).v;
 const before=await snapshot();
 await check('exclusive 0055 installation and history row commit together; prior history/functions/data unchanged',async()=>{
  const r=apply();assert.equal(r.status,0,r.stderr);assert.deepEqual(await state(),{history:true,function:true});
  const after=await snapshot();assert.equal(after.history.length,57);assert.deepEqual(after.history.filter(x=>x.value.version!==VERSION),before.history);
  assert.deepEqual(after.functions.filter(x=>x.signature!=='admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)'),before.functions);assert.deepEqual(after.business,before.business);
  assert.equal(after.history.find(x=>x.value.version===VERSION).value.statements[0],prepare().source);
  const p=await row(`select p.prosecdef definer,p.proconfig config,p.pronargdefaults defaults,pg_get_function_result(p.oid) result,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p where p.oid=${quote(SIGNATURE)}::regprocedure`);
  assert.equal(p.definer,true);assert.deepEqual(p.config,['search_path=pg_catalog']);assert.equal(p.defaults,8);assert.equal(p.authenticated,true);assert.equal(p.anon,false);assert.equal(p.service,false);results.installed_contract=p;
 });
 await check('generated read-only postverification confirms source, history, body and permissions',async()=>{const r=apply(prepare().verification);assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout.trim());assert.equal(v.read_only,'on');assert.equal(v.history_exact,true);assert.equal(v.recorded_source_matches,true);assert.equal(v.old_functions_intact,true);assert.equal(v.rpc.body_matches,true);assert.equal(v.rpc.public_execute,false);assert.equal(v.rpc.authenticated_execute,true);assert.equal(v.rpc.anon_execute,false);assert.equal(v.rpc.service_role_execute,false);results.postverification=v;});
 await check('retry after complete installation rejects without any changes',()=>unchangedFailure());await resetInstalled();
 await check('RPC CREATE error rolls back function and history',async()=>{const r=await unchangedFailure(artifact.replace('language plpgsql volatile security definer','language missing_test_language volatile security definer'));assert.match(r.stderr,/42704/);assert.deepEqual(await state(),{history:false,function:false});});
 await check('history INSERT failure rolls back already-created RPC',async()=>{await query(`alter table supabase_migrations.schema_migrations add constraint injected_history_failure check(version<>${quote(VERSION)})`);try{const r=await unchangedFailure();assert.match(r.stderr,/23514/);assert.deepEqual(await state(),{history:false,function:false});}finally{await query('alter table supabase_migrations.schema_migrations drop constraint injected_history_failure');}});
 await check('retry after failure succeeds with one history row',async()=>{const r=apply();assert.equal(r.status,0,r.stderr);assert.deepEqual(await state(),{history:true,function:true});});await resetInstalled();
 await check('COMMIT deferred failure rolls back RPC and history',async()=>{
  await query(`create schema qa_fault;create function qa_fault.fail_commit() returns trigger language plpgsql as $$begin raise exception 'Injected deferred failure' using errcode='23514';end$$`);
  const fault='create constraint trigger fail_commit after insert on supabase_migrations.schema_migrations deferrable initially deferred for each row execute function qa_fault.fail_commit();\n';
  try{const r=await unchangedFailure(artifact.replace(register,()=>fault+register));assert.match(r.stderr,/23514/);assert.deepEqual(await state(),{history:false,function:false});}finally{await query('drop schema qa_fault cascade');}
 });
 await check('connection loss before COMMIT leaves neither object nor history',async()=>{
  const before=await snapshot();const child=cp.spawn('docker',psqlArgs(),{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
  const ready=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Disconnect probe timeout')),10000);child.stdout.on('data',x=>{output+=x;if(output.includes('READY_TO_DISCONNECT')){clearTimeout(t);resolve();}});child.on('error',reject);});
  child.stderr.resume();child.stdin.write(artifact.slice(0,artifact.lastIndexOf('commit;'))+'\n\\echo READY_TO_DISCONNECT\n');await ready;
  // EOF while an explicit transaction is open makes psql exit; PostgreSQL rolls it back.
  child.stdin.end();await new Promise(r=>child.once('exit',r));assert.deepEqual(await snapshot(),before);assert.deepEqual(await state(),{history:false,function:false});
 });
 await check('lost success acknowledgement resolved by metadata; replay never duplicates',async()=>{const result=apply();assert.equal(result.status,0,result.stderr);/* deliberately ignore success payload */assert.deepEqual(await state(),{history:true,function:true});await unchangedFailure();});await resetInstalled();
 await check('function already installed without history is detected and left untouched',async()=>{const r=apply(prepare().source);assert.equal(r.status,0,r.stderr);assert.deepEqual(await state(),{history:false,function:true});await unchangedFailure();});await resetInstalled();
 await check('history row without function is detected and left untouched',async()=>{await query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[VERSION,NAME]);assert.deepEqual(await state(),{history:true,function:false});await unchangedFailure();});await resetInstalled();
 await check('unexpected schema drift aborts before CREATE and history registration',async()=>{await query('alter table companies add column injected_drift text');try{await unchangedFailure();assert.deepEqual(await state(),{history:false,function:false});}finally{await query('alter table companies drop column injected_drift');}});
 await check('unexpected prior history name aborts without repair',async()=>{await query("update supabase_migrations.schema_migrations set name='local drift' where version='20261106145018'");try{await unchangedFailure();}finally{await query("update supabase_migrations.schema_migrations set name='0054_driver_accept_confirms_service' where version='20261106145018'");}});
 await check('unexpected direct authenticated write grant aborts before installation',async()=>{await query('grant insert on companies to authenticated');try{await unchangedFailure();assert.deepEqual(await state(),{history:false,function:false});}finally{await query('revoke insert on companies from authenticated');}});
 results.final_state=await state();assert.deepEqual(results.final_state,{history:false,function:false});assert.deepEqual(await snapshot(),before);
}finally{
 if(control)await control.end().catch(()=>{});
 if(created)try{docker(['rm','-f',pgName]);results.cleanup.container='removed';}catch{results.cleanup.container='FAILED';}
 fs.writeFileSync(path.join(root,'docs/0055-atomic-local-results.json'),JSON.stringify(results,null,2)+'\n');
}}
main().then(()=>process.exit(0),e=>{console.error(e.stack);process.exit(1);});
