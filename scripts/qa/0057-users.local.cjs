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

async function main(){try{
 docker(['run','-d','--pull=never','--network','none','--name',pgName,'--user','postgres','--tmpfs','/tmp:rw,mode=1777','--env','ELARA_LOCAL_PASSWORD','--entrypoint','sh',image,'-c','set -eu; printf %s "$ELARA_LOCAL_PASSWORD" >/tmp/pw; initdb -D /tmp/elara-pg -U postgres -A scram-sha-256 --pwfile=/tmp/pw --no-locale -E UTF8 >/tmp/init.log; exec postgres -D /tmp/elara-pg -c listen_addresses=127.0.0.1']);created=true;
 for(let i=0;i<40;i++){try{control=await connect();break;}catch(e){if(i===39)throw e;await pause(250);}}
 await bootstrap(control);await control.exec("create function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt()->>'role','authenticated') $$");await control.exec(migration);await control.exec(require('../../tests/users-rollout-0057-fixture.cjs').enableSql);const a=api(control);
 await control.exec('begin');const admin=await a.identity('superadmin'),other=await a.identity('superadmin'),target=await a.identity('administrativo');await a.claims(admin);for(const u of [admin,other,target])await control.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.session,u.auth]);await a.checkpoint();await control.exec('commit');
 const c1=await connect(admin),c2=await connect(other),x=api(c1),y=api(c2);
 const call=(c,name,args)=>c.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args).then(r=>r.rows[0].value);
 const ver=()=>a.scalar('select admin_version from app_users where id=$1',[target.user]);
 let v=await ver();
 await collision('concurrent edits accept one expected version', {c:c1,fn:()=>call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,v,'metadata',{note:'winner'},'Local native'])},{c:c2,fn:()=>call(c2,'admin_manage_user',[crypto.randomUUID(),target.user,v,'metadata',{note:'loser'},'Local native'])},'40001');
 const key=crypto.randomUUID();v=await ver();const args=[key,target.user,v,'metadata',{note:'same immutable request'},'Local native'];
 await check('same request across backends applies once after COMMIT',async()=>{await c1.exec('begin');const first=await call(c1,'admin_manage_user',args);const next=await blocked(c2,()=>call(c2,'admin_manage_user',args));await c1.exec('commit');const r=await next.pending;assert.equal(r.error?.code,'23505');assert.equal(await a.scalar('select internal_note from app_users where id=$1',[target.user]),'same immutable request');const replay=await call(c1,'admin_manage_user',args);assert.deepEqual(replay,first);});
 await check('real COMMIT closes target sessions and preserves Auth',async()=>{await call(c1,'admin_manage_user',[crypto.randomUUID(),target.user,await ver(),'status',{status:'inactive'},'Local native inactivation']);assert.equal(Number(await a.scalar('select count(*) from app_sessions where app_user_id=$1 and ended_at is null',[target.user])),0);assert.equal(Number(await a.scalar('select count(*) from auth.users where id=$1',[target.auth])),1);});
 await check('parallel invitation claims dispatch at most once',async()=>{const key=crypto.randomUUID(),email=crypto.randomUUID()+'@example.invalid';await call(c1,'admin_prepare_user_invitation',[key,{email,first_name:'Native',last_name:'Test',roles:['administrativo'],default_context:'administrativo',reason:'Local native',confirm_existing:false}]);const service1=await connect(),service2=await connect();for(const c of [service1,service2])await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);const results=await Promise.all([call(service1,'admin_claim_user_invitation',[key,admin.auth,admin.session]),call(service2,'admin_claim_user_invitation',[key,admin.auth,admin.session])]);assert.equal(results.filter(r=>r.send).length,1);});

 await check('operator role revoked while waiting cannot administer another user',async()=>{
  await call(c1,'admin_manage_user',[crypto.randomUUID(),other.user,await a.scalar('select admin_version from app_users where id=$1',[other.user]),'assign',{role:'administrativo'},'Local native alternative']);
  const role=await a.scalar("select id from user_roles where user_id=$1 and role_key='superadmin' and status='active'",[other.user]);
  await c1.exec('begin');await call(c1,'admin_manage_user',[crypto.randomUUID(),other.user,await a.scalar('select admin_version from app_users where id=$1',[other.user]),'revoke',{role_id:role,default_context:'administrativo'},'Local native revoke']);
  const next=await blocked(c2,()=>call(c2,'admin_manage_user',[crypto.randomUUID(),target.user,0,'metadata',{note:'forbidden late write'},'Local native']));await c1.exec('commit');const r=await next.pending;assert(['28000','42501'].includes(r.error?.code));
 });
}finally{
 for(const c of clients)try{await c.end();}catch{}
 if(created){docker(['rm','-f',pgName]);results.cleanup.container='removed';}
 const output=path.join(process.env.TEMP||require('os').tmpdir(),'elara-0057-native-results.json');fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log('Evidence '+output);
}}
main().catch(e=>{console.error('Local native failure: '+(e.code||e.message));process.exitCode=1;});
