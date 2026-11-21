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

const {bootstrap}=require('../../tests/company-contacts-0056-harness.cjs');
const snapshot=require('./0056-catalog-snapshot.cjs');
const {specs}=require('./0056-prepare-atomic.cjs');
const password=crypto.randomBytes(32).toString('hex'),pgName='elara0056artifact-'+crypto.randomUUID().replaceAll('-','').slice(0,12);
const env={...process.env,PGPASSWORD:password,ELARA_LOCAL_PASSWORD:password};
const image='public.ecr.aws/supabase/postgres:17.6.1.165';let control,created=false;
const results={tests:[],cleanup:{},remoteAccess:false};
const docker=args=>cp.execFileSync('docker',args,{env,encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,fn){await fn();results.tests.push({name,result:'PASS'});console.log('PASS '+name);}
function apply(sql){return cp.spawnSync('docker',['exec','-i','--env','PGPASSWORD',pgName,'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f','-'],{env,input:sql,encoding:'utf8',timeout:30000,windowsHide:true});}
const read=f=>fs.readFileSync(path.join(root,'docs',f),'utf8');
async function main(){try{
 docker(['run','-d','--pull=never','--network','none','--name',pgName,'--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',image,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" >/tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; exec postgres -D /tmp/elara-pg -c listen_addresses=127.0.0.1']);created=true;
 for(let i=0;i<40;i++){try{control=new Client();await control.connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 control.exec=s=>control.query(s);await bootstrap(control);
 // Reproduce metadata only, never real rows. Grants are the already-audited baseline.
 const fingerprints=JSON.parse(read('0055-remote-audit-evidence.json')).function_fingerprints;
 for(const f of fingerprints){await control.query(`revoke all on function ${f.signature} from public,anon,authenticated,service_role,postgres`);for(const acl of f.acl.slice(1,-1).split(',')){const [who,grant]=acl.split('=');if(grant.startsWith('X'))await control.query(`grant execute on function ${f.signature} to ${who||'public'}`);}}
 await control.query('create role dashboard_user;grant usage on schema extensions to anon,authenticated,service_role;grant usage,create on schema extensions to dashboard_user;grant usage on schema public to postgres,anon,authenticated,service_role;grant all on public.companies,public.customers,public.persons,public.company_contacts,public.audit_logs to service_role');
 await control.query('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[])');
 const audit=JSON.parse(read('0056-remote-preflight-results.json'));
 for(const h of audit.data.snapshot.history)await control.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,array[\'local synthetic marker\'])',[h.version,h.name]);
 await control.query('set search_path=pg_catalog');
 await check('exact remote metadata baseline reproduced locally without business data',async()=>{const local=(await control.query('select '+snapshot+' value')).rows[0].value;
  if(local.functions_hash!==audit.data.snapshot.functions_hash){const actual=(await control.query("select p.oid::regprocedure::text signature,encode(extensions.digest(replace(pg_get_functiondef(p.oid),chr(13),''),'sha256'),'hex') hash,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','elara_private') and p.prokind='f'")).rows;const difference=actual.filter(f=>{const expected=fingerprints.find(e=>e.signature===f.signature);return expected&&(f.hash!==expected.definition_sha256||f.acl!==expected.acl)});fs.writeFileSync(path.join(process.env.TEMP,'elara-0056-artifact-function-diff.json'),JSON.stringify(difference,null,2));}
  assert.deepEqual(local,audit.data.snapshot);});
 const artifact=read('0056-atomic-deployment.sql'),manifest=JSON.parse(read('0056-atomic-deployment.sql.manifest.json'));
 results.artifact_sha256=crypto.createHash('sha256').update(artifact).digest('hex');assert.equal(results.artifact_sha256,manifest.artifact_sha256);
 await check('exact prepared artifact commits schema, three RPCs and sole history row together',async()=>{const r=apply(artifact);assert.equal(r.status,0,r.stderr);assert.equal((await control.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,58);});
 await check('prepared read-only postcheck validates bodies, grants, version trigger and unchanged prior metadata',async()=>{const r=apply(read('0056-atomic-deployment.sql.verify.sql'));assert.equal(r.status,0,r.stderr);const data=r.stdout.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l))[0];assert.equal(data.verification,true);assert.equal(data.read_only,'on');results.postcheck=data;});
 await check('repeat artifact rejects without reinstalling or adding history',async()=>{const r=apply(artifact);assert.notEqual(r.status,0);assert.equal((await control.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,58);});
 await check('emergency disable revokes only new RPC access and retains schema/history/0055',async()=>{const r=apply(read('0056-atomic-deployment.sql.disable.sql'));assert.equal(r.status,0,r.stderr);for(const [s,api]of specs.filter(x=>x[1]))assert.equal((await control.query("select has_function_privilege('authenticated',$1,'EXECUTE') value",[s])).rows[0].value,false);assert.equal((await control.query("select has_function_privilege('authenticated','public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE') value")).rows[0].value,true);assert.equal((await control.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,58);assert.equal((await control.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='company_contacts' and column_name='version'")).rows[0].n,1);});
}finally{if(control)await control.end().catch(()=>{});if(created){docker(['rm','-f',pgName]);results.cleanup.container='removed';}fs.writeFileSync(path.join(root,'docs/0056-deployment-local-results.json'),JSON.stringify(results,null,2)+'\n');}}
main().catch(e=>{console.error(e);process.exitCode=1;});
