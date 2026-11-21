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

const {bootstrap,api,cases,migration}=require('../../tests/company-contacts-0056-harness.cjs');
const password=crypto.randomBytes(32).toString('hex'),pgName='elara0056-'+crypto.randomUUID().replaceAll('-','').slice(0,12);
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
async function main(){try{
 docker(['run','-d','--pull=never','--network','none','--name',pgName,'--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',image,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" >/tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; exec postgres -D /tmp/elara-pg -c listen_addresses=127.0.0.1']);created=true;
 for(let i=0;i<40;i++){try{control=await connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 await bootstrap(control);await control.exec(migration);const a=api(control);
 results.postgres=(await control.query('select version() v')).rows[0].v;
 for(const [name,fn]of Object.entries(cases))await check('Native '+name,async()=>{await control.exec('begin');try{const admin=await a.identity('administrativo');await a.claims(admin);await a.checkpoint();await fn(a,admin,control);}finally{await control.exec('rollback');}});
 await control.exec('begin');const admin=await a.identity('administrativo'),other=await a.identity('superadmin');await a.claims(admin);await a.checkpoint();await control.exec('commit');
 const c1=await connect(admin),c2=await connect(other),x=api(c1),y=api(c2);
 await check('independent native backends authenticated as two real administrative contexts',async()=>{const ids=await Promise.all([c1.query('select pg_backend_pid() id'),c2.query('select pg_backend_pid() id')]);assert.notEqual(ids[0].rows[0].id,ids[1].rows[0].id);results.independentBackends=ids.map(r=>r.rows[0].id);});
 {
  const c=await a.company(),t1=await a.add(c),t2=await a.add(c);
  await collision('simultaneous first primary: second administrator observes stale expected primary', {c:c1,fn:()=>x.primary(c,t1)},{c:c2,fn:()=>y.primary(c,t2)},'40001');
  assert.equal(Number(await a.scalar('select count(*) from company_contacts where company_id=$1 and status=\'active\' and is_primary',[c.company_id])),1);
 }
 {
  const c=await a.company(),old=await a.add(c,undefined,true),t1=await a.add(c),t2=await a.add(c);
  await collision('simultaneous replacement of same primary: exactly one wins', {c:c1,fn:()=>x.primary(c,t1,old)},{c:c2,fn:()=>y.primary(c,t2,old)},'40001');
  assert.equal((await a.link(old)).is_primary,false);assert.equal((await a.link(t1)).is_primary,true);assert.equal((await a.link(t2)).is_primary,false);
 }
 {
  const c=await a.company(),p=await a.person(),contact={mode:'existing',person_id:p};
  await collision('concurrent existing-person link prevents active duplicate', {c:c1,fn:()=>x.add(c,contact)},{c:c2,fn:()=>y.add(c,contact)},'23505');
  assert.equal(Number(await a.scalar('select count(*) from company_contacts where company_id=$1 and person_id=$2',[c.company_id,p])),1);
 }
 {
  const ca=await a.company(),cb=await a.company(),contact=a.fresh();
  await collision('new-person email locks prevent duplicate identity across different companies', {c:c1,fn:()=>x.add(ca,contact)},{c:c2,fn:()=>y.add(cb,contact)},'23505');
  assert.equal(Number(await a.scalar('select count(*) from persons where contact_email=$1',[contact.email])),1);
 }
 {
  const c=await a.company(),t=await a.add(c);
  await collision('concurrent same-version updates reject lost update', {c:c1,fn:()=>x.update(c,t,{role_label:'First'})},{c:c2,fn:()=>y.update(c,t,{notes:'Second'})},'40001');
  assert.equal((await a.link(t)).role_label,'First');assert.equal((await a.link(t)).notes,null);
 }
 {
  const c=await a.company(),old=await a.add(c,undefined,true),t=await a.add(c);
  await collision('deactivation versus replacement detects changed principal and preserves no-primary state', {c:c1,fn:()=>x.update(c,old,{status:'inactive'})},{c:c2,fn:()=>y.primary(c,t,old)},'40001');
  assert.equal((await a.link(old)).status,'inactive');assert.equal((await a.link(t)).is_primary,false);
 }
 await check('same actor/request concurrent replay waits and returns identical single receipt',async()=>{
  const c=await a.company(),contact=a.fresh(),key=crypto.randomUUID(),replay=await connect(admin),z=api(replay);
  await c1.exec('begin');const first=await x.add(c,contact,false,key);const {pending}=await blocked(replay,()=>z.add(c,contact,false,key));await c1.exec('commit');const r=await pending;assert.ifError(r.error);assert.deepEqual(r.value,first);
  assert.equal(Number(await a.scalar('select count(*) from audit_logs where actor_app_user_id=$1 and request_id=$2',[admin.user,key])),1);
 });
 await check('waiting same-request retry succeeds after first transaction rollback, without ghosts',async()=>{
  const c=await a.company(),contact=a.fresh(),key=crypto.randomUUID(),replay=await connect(admin),z=api(replay);
  await c1.exec('begin');const rolledBack=await x.add(c,contact,false,key);const {pending}=await blocked(replay,()=>z.add(c,contact,false,key));await c1.exec('rollback');const r=await pending;assert.ifError(r.error);assert.notEqual(r.value.company_contact_id,rolledBack.company_contact_id);
  assert.equal(Number(await a.scalar('select count(*) from company_contacts where company_id=$1',[c.company_id])),1);
 });
 await check('commit-time injected deferred failure rolls back person/link/audit/receipt then permits clean retry',async()=>{
  const c=await a.company(),contact=a.fresh(),key=crypto.randomUUID();
  await control.exec("create function public.local_0056_commit_fault() returns trigger language plpgsql as $$begin raise exception 'Injected deferred commit failure' using errcode='P0001';end$$;create constraint trigger local_0056_commit_fault after insert on public.company_contacts deferrable initially deferred for each row execute function public.local_0056_commit_fault()");
  const before=await a.snapshot();await c1.exec('begin');await x.add(c,contact,false,key);await assert.rejects(()=>c1.exec('commit'),e=>e.code==='P0001');assert.deepEqual(await a.snapshot(),before);
  await control.exec('drop trigger local_0056_commit_fault on public.company_contacts;drop function public.local_0056_commit_fault()');assert.ok(await x.add(c,contact,false,key));
 });
 await check('existing deferred integrity fails at real COMMIT with complete RPC rollback',async()=>{
  const c=await a.company(),p=await a.person(),contact={mode:'existing',person_id:p},key=crypto.randomUUID(),before=await a.snapshot();
  await control.exec('begin');await a.add(c,contact,false,key);await a.rows("update persons set status='inactive',inactive_at=now() where id=$1",[p]);await assert.rejects(()=>control.exec('commit'),e=>e.code==='23514');assert.deepEqual(await a.snapshot(),before);
 });
}finally{
 for(const c of clients)try{await c.end();}catch{}
 if(created){docker(['rm','-f',pgName]);results.cleanup.container='removed';}
 const output=path.join(process.env.TEMP||require('os').tmpdir(),'elara-0056-native-results.json');fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log('Evidence '+output);
}}
main().catch(e=>{console.error(e);process.exitCode=1;});
