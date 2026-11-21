// READ ONLY ONLY: no deployment mode and no arbitrary SQL argument.
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');const root=process.cwd(),ref='pfdvehcyauoncxeolcjc';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const u=new URL(fs.readFileSync(path.join(root,'supabase/.temp/pooler-url'),'utf8').trim());
const username=decodeURIComponent(u.username);
if((u.port||'5432')!=='5432'||username!=='postgres.'+ref||!u.hostname.endsWith('.pooler.supabase.com'))throw Error('Session pooler target mismatch');
function fields(line){const a=[];let v='',escaped=false;for(const c of line){if(escaped){v+=c;escaped=false;}else if(c==='\\')escaped=true;else if(c===':'){a.push(v);v='';}else v+=c;}a.push(v);return a;}
const target=[u.hostname,'5432','postgres',username];
const entries=fs.readFileSync(path.join(process.env.APPDATA,'postgresql/pgpass.conf'),'utf8').split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith('#')).map(fields);
const credential=entries.find(a=>a.length===5&&target.every((v,i)=>a[i]==='*'||a[i]===v));
if(!credential||!credential[4])throw Error('Matching Session credential unavailable');
const ca=path.join(process.env.USERPROFILE,'Downloads/prod-ca-2021.crt');const cert=new crypto.X509Certificate(fs.readFileSync(ca));
if(!cert.ca||Date.now()<Date.parse(cert.validFrom)||Date.now()>Date.parse(cert.validTo))throw Error('Approved CA not valid');
const env={...process.env,PGPASSWORD:credential[4]};
const args=['run','--rm','-i','--pull=never','--mount','type=bind,source='+ca+',target=/tmp/project-ca.crt,readonly','--env','PGPASSWORD','--env','PGSSLMODE=verify-full','--env','PGSSLROOTCERT=/tmp/project-ca.crt','--env','PGCONNECT_TIMEOUT=15','--entrypoint','psql','public.ecr.aws/supabase/postgres:17.6.1.165','-X','-A','-t','-h',u.hostname,'-p','5432','-U',username,'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f','-'];
function run(sql){const r=cp.spawnSync('docker',args,{env,encoding:'utf8',windowsHide:true,input:'\\conninfo\n'+sql,timeout:120000,maxBuffer:8*1024*1024});const objects=[];for(const line of (r.stdout||'').split(/\r?\n/))if(line.startsWith('{'))try{objects.push(JSON.parse(line));}catch{}
 return {exit:r.status,tls:/SSL connection|TLSv1\./i.test(r.stdout||''),commitAcknowledged:/(?:^|\n)COMMIT(?:\r?\n|$)/.test(r.stdout||''),processError:r.error?.code||null,sqlstates:[...new Set([...(r.stderr||'').matchAll(/\b[0-9A-Z]{5}\b/g)].map(x=>x[0]))].filter(x=>/^[0-9]/.test(x)),failure:r.status===0?null:/certificate|SSL/i.test(r.stderr||'')?'TLS_OR_CERTIFICATE_ERROR':/authentication|password/i.test(r.stderr||'')?'AUTHENTICATION_ERROR':'PSQL_ERROR',objects};}

try { const r=run(fs.readFileSync(path.join(root,'docs/0056-remote-preflight.sql'),'utf8'));const data=r.objects.find(x=>x.phase==='preflight');const probes=r.objects.filter(x=>x.phase);const checks={connection:r.exit===0&&r.tls,session:probes.length===3&&new Set(probes.map(x=>x.pid)).size===1,read_only:data?.read_only==='on',target:data?.database==='postgres'&&data?.user==='postgres'&&data?.server_major===17,installed_0055:data?.installed_0055===true,source_0055:data?.source_0055_matches===true,absent_0056:data?.new_objects_absent===true,dependencies:data?.dependencies?.every(d=>d.exists&&d.owner==='postgres')===true,indexes:data?.indexes_compatible===true,triggers:data?.deferred_trigger_compatible===true,privileges:data?.privileges_compatible===true,no_unsafe_create:data?.unsafe_schema_create===false,no_direct_writes:data?.direct_api_writes===false,no_conflicts:data?.conflicting_locks===0&&data?.migration_activity===0};
const output={date:new Date().toISOString(),project_ref:ref,method:'Session pooler 5432; psql 17; sslmode=verify-full; certificate chain and hostname',ca_sha256:sha(fs.readFileSync(ca)),checks,pass:Object.values(checks).every(Boolean),data,errors:{exit:r.exit,failure:r.failure,sqlstates:r.sqlstates,processError:r.processError}};
fs.writeFileSync(path.join(root,'docs/0056-remote-preflight-results.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({checks,pass:output.pass,historyCount:data?.snapshot?.history?.length,method:output.method},null,2));if(!output.pass)process.exitCode=1;
}finally{delete env.PGPASSWORD;credential[4]='';}
