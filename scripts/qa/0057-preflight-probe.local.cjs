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
// Negative control: restore the original two 0051 bodies only inside the fixture.
const baseline0051=process.env.ELARA_0057_TEST_OLD_0051==='1';
const results={image,baseline0051,tests:[],cleanup:{},remoteAccess:false};let control,created=false;const clients=[];
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

async function main(){try{
 docker(['run','-d','--pull=never','--network','none','--name',pgName,'--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',image,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" >/tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; exec postgres -D /tmp/elara-pg -c listen_addresses=127.0.0.1']);created=true;
 for(let i=0;i<40;i++){try{control=await connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 await bootstrap(control);await control.exec("create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt()->>'role','authenticated') $$");await control.exec(migration);await control.exec(require('../../tests/users-rollout-0057-fixture.cjs').enableSql);const a=api(control);
 if(baseline0051){const old=fs.readFileSync('supabase/migrations/0051_driver_portal_access_and_operational_central.sql','utf8');await control.exec(old.slice(old.indexOf('create function public.admin_begin_driver_portal_access('),old.indexOf('create function public.admin_revoke_driver_portal_access(')).replaceAll('create function public.','create or replace function public.'));}
 await control.exec('begin');const admin=await a.identity('superadmin'),other=await a.identity('superadmin'),target=await a.identity('administrativo');await a.claims(admin);for(const u of [admin,other,target])await control.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.session,u.auth]);await a.checkpoint();await control.exec('commit');
 const c1=await connect(admin),c2=await connect(other),x=api(c1),y=api(c2);
 const call=(c,name,args)=>c.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args).then(r=>r.rows[0].value);
 const ver=()=>a.scalar('select admin_version from app_users where id=$1',[target.user]);
 let v=await ver();

 await check('empty rollout blocks direct RPC writes while authorized reads remain available',async()=>{
  await control.exec('begin');try{
   await control.exec('delete from elara_private.user_admin_rollout');const caps=await call(control,'admin_get_user_control',[null]);
   assert.equal(caps.authorized,true);assert.equal(caps.manage,false);assert(Object.values(caps.operations).every(x=>x===false));
   for(const action of ['metadata','status','assign','revoke'])await a.rejects(()=>call(control,'admin_manage_user',[crypto.randomUUID(),target.user,v,action,{},'Local disabled operation']),'55000');
   assert.equal(await ver(),v);assert.equal(Number(await a.scalar('select count(*) from elara_private.user_admin_requests')),0);
  }finally{await control.exec('rollback');}
 });

 await control.exec('begin');await a.claims(admin);
 const driver=await a.scalar("select driver_id from public.admin_create_driver($1,'Local','Driver','internal_driver')",[crypto.randomUUID()]);
 const person=await a.scalar('select person_id from drivers where id=$1',[driver]);
 await control.query('update app_users set person_id=$1 where id=$2',[person,target.user]);
 await a.scalar("select public.assign_user_role($1,'conductor','Isolated compatibility setup')",[target.user]);
 await control.query('insert into user_driver_links(user_id,driver_id,created_by) values($1,$2,$3)',[target.user,driver,admin.user]);
 await a.checkpoint();await control.exec('commit');
 // Start the revocation transaction first, but execute it after suspension committed.
 await c2.exec('begin');await c2.query('select now() transaction_started');await pause(50);
 await call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,await ver(),'status',{status:'inactive'},'Local suspension']);
 await call(c2,'admin_revoke_driver_portal_access',[crypto.randomUUID(),driver,'Explicit later driver revocation']);await c2.exec('commit');
 const earlierAudit=await a.scalar("select exists(select 1 from audit_logs a join elara_private.user_suspended_driver_links s on s.driver_id=a.entity_id join user_driver_links l on l.id=s.closed_link_id where s.user_id=$1 and a.metadata->>'phase'='revoke' and a.metadata->>'control_contract'='0051' and a.occurred_at<l.ended_at)",[target.user]);
 let reactivated=false,rejection=null;
 try{await call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,await ver(),'status',{status:'active'},'Local reactivation after revocation']);reactivated=true;}catch(e){rejection=e.code;}
 const activeLinks=Number(await a.scalar("select count(*) from user_driver_links where user_id=$1 and status='active'",[target.user]));
 results.compatibilityProbe={revocationAfterSuspensionCommit:true,auditTransactionTimestampEarlier:earlierAudit,reactivated,activeLinks,rejection};
 console.log(JSON.stringify(results.compatibilityProbe));
 await check('reordered transaction timestamps cannot restore explicitly revoked suspension',async()=>{
  assert.equal(earlierAudit,true);assert.equal(reactivated,false);assert.equal(activeLinks,0);assert.equal(rejection,'23514');
  assert.equal(await a.scalar('select status from app_users where id=$1',[target.user]),'inactive');
  assert.equal(Number(await a.scalar('select count(*) from app_sessions where app_user_id=$1 and ended_at is null',[target.user])),0);
 });
 const rejected=async(fn,code='23514')=>{const r=await fn().then(value=>({value}),error=>({error}));if(r.value){results.unexpectedReplayState=r.value.state;console.log('Unexpected replay state: '+r.value.state);}assert.equal(r.error?.code,code);};
 const links=d=>a.scalar("select count(*)::int from user_driver_links where driver_id=$1 and status='active'",[d]);
 const pending=async()=>{
  const d=await a.scalar("select driver_id from public.admin_create_driver($1,'Native','Access','internal_driver')",[crypto.randomUUID()]);
  const f={driver:d,email:crypto.randomUUID()+'@example.invalid',key:crypto.randomUUID(),auth:crypto.randomUUID()};
  await call(c1,'admin_begin_driver_portal_access',[f.key,d,f.email,'Local invitation',false]);
  await control.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[f.auth,f.email]);return f;
 };
 const link=(f,c=c1)=>call(c,'admin_link_driver_portal_access',[f.key,f.auth,false]);
 const revoke=(f,c=c1,key=crypto.randomUUID())=>call(c,'admin_revoke_driver_portal_access',[key,f.driver,'Explicit local revocation']);
 await check('initial invitation links once, revocation closes sessions and stale replay cannot restore',async()=>{
  const f=await pending(),r=await link(f);assert.deepEqual(await link(f),r);assert.equal(await links(f.driver),1);
  const session=crypto.randomUUID();await control.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,f.auth]);
  await control.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:f.auth,session_id:session,exp:Math.floor(Date.now()/1000)+3600})]);
  await a.rpc('initialize_app_session',['conductor']);await a.claims(admin);
  const key=crypto.randomUUID(),v=await revoke(f,c1,key);assert.deepEqual(await revoke(f,c1,key),v);
  await rejected(()=>link(f));assert.equal(await links(f.driver),0);
  assert.equal(Number(await a.scalar('select count(*) from app_sessions where app_user_id=$1 and ended_at is null',[r.app_user_id])),0);
  assert.equal(Number(await a.scalar('select count(*) from auth.users where id=$1',[f.auth])),1);
 });
 await check('late reconciliation is invalidated even when revocation transaction began first',async()=>{
  await c2.exec('begin');await c2.query('select now()');await pause(30);
  const f=await pending();await revoke(f,c2);await c2.exec('commit');
  await rejected(()=>link(f));await rejected(()=>call(c1,'admin_begin_driver_portal_access',[f.key,f.driver,f.email,'Local invitation',false]));assert.equal(await links(f.driver),0);
  // A fresh authorization is permitted by 0051 when no closed link/revoked role exists.
  const fresh={...f,key:crypto.randomUUID()};const started=await call(c1,'admin_begin_driver_portal_access',[fresh.key,f.driver,f.email,'New explicit authorization',true]);
  assert.equal(started.request_id,fresh.key);assert.equal(started.state,'pending');
  const linked=await call(c1,'admin_link_driver_portal_access',[fresh.key,f.auth,true]);assert.equal(linked.state,'linked');assert.equal(await links(f.driver),1);
  assert.deepEqual(await call(c1,'admin_link_driver_portal_access',[fresh.key,f.auth,true]),linked);
  await rejected(()=>link(f));assert.equal(await links(f.driver),1);
  const version=()=>a.scalar('select admin_version from app_users where id=$1',[linked.app_user_id]);
  await call(c1,'admin_manage_user',[crypto.randomUUID(),linked.app_user_id,await version(),'status',{status:'inactive'},'Local suspension of fresh authorization']);
  await call(c1,'admin_manage_user',[crypto.randomUUID(),linked.app_user_id,await version(),'status',{status:'active'},'Restore fresh unrevoked authorization']);
  assert.equal(await links(f.driver),1);
 });
 await check('concurrent revocation wins before late link after shared-lock wait',async()=>{
  const f=await pending();await c2.exec('begin');await revoke(f,c2);
  const next=await blocked(c1,()=>link(f));await c2.exec('commit');const r=await next.pending;
  assert.equal(r.error?.code,'23514');assert.equal(await links(f.driver),0);
 });
 await check('concurrent initial link commits first and subsequent revocation leaves no access',async()=>{
  const f=await pending();await c1.exec('begin');const r=await link(f);
  const next=await blocked(c2,()=>revoke(f,c2));await c1.exec('commit');const v=await next.pending;
  assert.equal(v.error,undefined);assert.equal(await links(f.driver),0);
  assert.equal(await a.scalar('select status from app_users where id=$1',[r.app_user_id]),'inactive');await rejected(()=>link(f));
 });
 await check('0057 activation waiting on explicit revocation cannot restore the suspended link',async()=>{
  await c2.exec('begin');await call(c2,'admin_revoke_driver_portal_access',[crypto.randomUUID(),driver,'Repeated explicit revocation']);
  const version=await ver();
  const next=await blocked(c1,()=>call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,version,'status',{status:'active'},'Late activation']));
  await c2.exec('commit');const r=await next.pending;assert.equal(r.error?.code,'23514');assert.equal(await links(driver),0);
  await rejected(async()=>call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,await ver(),'status',{status:'active'},'Refreshed activation']));
 });
 await check('0057 activation commits first, later revocation wins and duplicate activation is read-only',async()=>{
  const f=await pending(),linked=await link(f),version=()=>a.scalar('select admin_version from app_users where id=$1',[linked.app_user_id]);
  await call(c1,'admin_manage_user',[crypto.randomUUID(),linked.app_user_id,await version(),'status',{status:'inactive'},'Local suspension']);
  const args=[crypto.randomUUID(),linked.app_user_id,await version(),'status',{status:'active'},'Local activation'];
  await c1.exec('begin');const activated=await call(c1,'admin_manage_user',args);
  const next=await blocked(c2,()=>revoke(f,c2));await c1.exec('commit');const r=await next.pending;assert.equal(r.error,undefined);
  assert.equal(await links(f.driver),0);assert.deepEqual(await call(c1,'admin_manage_user',args),activated);
  assert.equal(await links(f.driver),0);assert.equal(await a.scalar('select status from app_users where id=$1',[linked.app_user_id]),'inactive');
 });
 await check('rolled-back revocation does not invalidate a legitimate pending link',async()=>{
  const f=await pending();await c2.exec('begin');await revoke(f,c2);
  const next=await blocked(c1,()=>link(f));await c2.exec('rollback');const r=await next.pending;
  assert.equal(r.error,undefined);assert.equal(r.value.state,'linked');assert.equal(await links(f.driver),1);
 });
}finally{
 for(const c of clients)try{await c.end();}catch{}
 if(created){docker(['rm','-f',pgName]);results.cleanup.container='removed';}
 const output=path.join(process.env.TEMP||require('os').tmpdir(),baseline0051?'elara-0057-old-0051-results.json':'elara-0057-preflight-probe-results.json');fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log('Evidence '+output);
}}
main().catch(e=>{console.error('Local native failure: '+(e.code||e.message));process.exitCode=1;});
