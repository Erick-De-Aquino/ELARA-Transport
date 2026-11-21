// Prepared only. Deploy requires explicit later authorization and a fresh read-only preflight.
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');const root=process.cwd(),ref='pfdvehcyauoncxeolcjc';const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const mode=process.argv[2],base=path.join(root,'docs/0056-atomic-deployment.sql'),manifest=JSON.parse(fs.readFileSync(base+'.manifest.json','utf8'));
if(!['deploy','post'].includes(mode))throw Error('Use post, or deploy only after explicit user authorization.');
if(mode==='deploy'&&process.argv[3]!=='--authorized-0056-'+manifest.artifact_sha256)throw Error('Explicit approved artifact authorization flag required.');
const artifact=fs.readFileSync(base),verify=fs.readFileSync(base+'.verify.sql','utf8');
if(sha(artifact)!==manifest.artifact_sha256||sha(verify)!==manifest.verification_sha256||sha(fs.readFileSync(path.join(root,'supabase/migrations/0056_admin_company_contacts.sql')))!==manifest.source_sha256)throw Error('Approved file hash mismatch.');
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

try{let output;
if(mode==='deploy'){const pre=JSON.parse(fs.readFileSync(path.join(root,'docs/0056-remote-preflight-results.json'),'utf8'));if(!pre.pass||pre.project_ref!==ref||Date.now()-Date.parse(pre.date)>300000||Date.parse(pre.date)>Date.now())throw Error('Fresh successful read-only preflight required (5 minutes).');
fs.writeFileSync(path.join(root,'docs/0056-deployment-attempted.json'),JSON.stringify({attempted:true,artifact_sha256:manifest.artifact_sha256,date:new Date().toISOString()}),{flag:'wx'});
const r=run(artifact.toString('utf8'));output={mode,project_ref:ref,artifact_sha256:manifest.artifact_sha256,exit:r.exit,tls:r.tls,commitAcknowledged:r.commitAcknowledged,failure:r.failure,sqlstates:r.sqlstates};if(r.exit!==0||!r.commitAcknowledged)process.exitCode=1;
}else{const r=run(verify);const v=r.objects.find(o=>Object.hasOwn(o,'verification'));output={mode,project_ref:ref,exit:r.exit,tls:r.tls,verification:v,pass:r.exit===0&&r.tls&&v?.verification===true&&v?.read_only==='on'&&v?.history_count===58};if(!output.pass)process.exitCode=1;}
fs.writeFileSync(path.join(root,'docs/0056-session-'+mode+'-results.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
}finally{delete env.PGPASSWORD;credential[4]='';}
