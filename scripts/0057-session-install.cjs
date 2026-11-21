// Single approved 0057 artifact only. No arbitrary SQL, seeds or QA execution.
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

const mode=process.argv[2];
const base='docs/0057-atomic-deployment.sql';
const approved='d3246ed536478b8a204d01fd63e3aaddc03ddb8aee4fe2909927dd080aa656f7';
const artifactHash='298c4ac07dd473d13a2992364c9706ae36f05413c5652c84b6875e841d2aba34';
const manifest=JSON.parse(fs.readFileSync(base+'.manifest.json','utf8'));
const local=JSON.parse(fs.readFileSync('docs/0057-local-manifest.json','utf8'));
const artifact=fs.readFileSync(base,'utf8');
const verify=fs.readFileSync(base+'.verify.sql','utf8');
const checked=Object.entries(local.files).every(([p,h])=>sha(fs.readFileSync(p))===h);
if(!checked||local.files['supabase/migrations/0057_admin_users.sql']!==approved||manifest.source_sha256!==approved||sha(artifact)!==artifactHash||manifest.artifact_sha256!==artifactHash||sha(verify)!==manifest.verification_sha256||sha(fs.readFileSync('docs/0057-final-readonly-baseline.json'))!==manifest.baseline_sha256||manifest.version!=='20261120005700'||manifest.project_ref!==ref)throw Error('Approved integrity mismatch');
if(!['preflight','install','post'].includes(mode))throw Error('Unsupported mode');
const tables=['auth.users','auth.sessions','public.persons','public.app_users','public.roles','public.user_roles','public.app_sessions','public.drivers','public.user_driver_links','public.audit_logs'];
const snapshots=tables.map(t=>{const row=t==='auth.users'?"jsonb_build_object('id',t.id,'updated_at',t.updated_at,'email',t.email,'banned_until',t.banned_until,'deleted_at',t.deleted_at)":t==='auth.sessions'?"jsonb_build_object('id',t.id,'user_id',t.user_id,'updated_at',t.updated_at)":"(to_jsonb(t)-'admin_version')";return "'"+t+"',(select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(("+row+")::text,'' order by ("+row+")::text collate \"C\"),''))) from "+t+' t)';}).join(',');
const snapshotSql="select jsonb_build_object('snapshot',jsonb_build_object("+snapshots+"));";
const connectionSql="select jsonb_build_object('connection',true,'read_only',current_setting('transaction_read_only'),'strings',current_setting('standard_conforming_strings'),'ssl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'database',current_database(),'user',current_user,'pid',pg_backend_pid());";
const outFile='docs/0057-session-'+mode+'-results.json';
try{
 let output;
 if(mode==='preflight'){
  const guard=artifact.match(/do \$guard_0057\$[\s\S]*?\$guard_0057\$;/)?.[0];
  if(!guard)throw Error('Missing approved guard');
  const r=run('begin read only; set local search_path=pg_catalog; set local statement_timeout=\'30s\';\n'+connectionSql+'\n'+guard+'\n'+snapshotSql+'\n'+connectionSql+'\nrollback;');
  const c=r.objects.filter(o=>o.connection),snapshot=r.objects.find(o=>o.snapshot)?.snapshot;
  // pg_stat_ssl describes pooler-to-backend transport. Client TLS is enforced by
  // libpq verify-full and confirmed by conninfo; it validates CA and hostname.
  const pass=r.exit===0&&r.tls&&c.length===2&&c[0].pid===c[1].pid&&c.every(x=>x.read_only==='on'&&x.strings==='on'&&x.database==='postgres'&&x.user==='postgres')&&!!snapshot;
  output={date:new Date().toISOString(),project_ref:ref,pass,integrity:true,tls:r.tls,connection_checks:c.map(x=>({read_only:x.read_only,strings:x.strings,backend_ssl:x.ssl,database_expected:x.database==='postgres',user_expected:x.user==='postgres'})),same_backend:c.length===2&&c[0].pid===c[1].pid,method:'Session pooler 5432; sslmode=verify-full; CA chain and hostname validation required',ca_sha256:sha(fs.readFileSync(ca)),guard_passed:r.exit===0,snapshot,exit:r.exit,failure:r.failure,sqlstates:r.sqlstates};
 }else if(mode==='install'){
  if(process.argv[3]!=='--authorized-20261120005700-'+approved)throw Error('Authorization pin required');
  const pre=JSON.parse(fs.readFileSync('docs/0057-session-preflight-results.json','utf8'));
  if(!pre.pass||pre.project_ref!==ref||Date.now()-Date.parse(pre.date)>300000||Date.parse(pre.date)>Date.now())throw Error('Fresh successful preflight required');
  fs.writeFileSync('docs/0057-deployment-attempted.json',JSON.stringify({date:new Date().toISOString(),version:manifest.version,artifact_sha256:artifactHash}),{flag:'wx'});
  const r=run(artifact);
  output={date:new Date().toISOString(),project_ref:ref,version:manifest.version,artifact_sha256:artifactHash,exit:r.exit,tls:r.tls,commitAcknowledged:r.commitAcknowledged,pass:r.exit===0&&r.tls&&r.commitAcknowledged,failure:r.failure,sqlstates:r.sqlstates};
 }else{
  const r=run(verify+'\nbegin read only; set local search_path=pg_catalog;\n'+connectionSql+'\n'+snapshotSql+'\nrollback;');
  const v=r.objects.find(o=>Object.hasOwn(o,'verification'));
  const snapshot=r.objects.find(o=>o.snapshot)?.snapshot;
  const before=JSON.parse(fs.readFileSync('docs/0057-session-preflight-results.json','utf8')).snapshot;
  const unchanged=Object.fromEntries(tables.map(t=>[t,JSON.stringify(before?.[t])===JSON.stringify(snapshot?.[t])&&!!snapshot?.[t]]));
  output={date:new Date().toISOString(),project_ref:ref,verification:v,unchanged,exit:r.exit,tls:r.tls,pass:r.exit===0&&r.tls&&v?.verification===true&&v?.read_only==='on'&&Object.values(unchanged).every(Boolean),failure:r.failure,sqlstates:r.sqlstates};
 }
 fs.writeFileSync(outFile,JSON.stringify(output,null,2)+'\n');
 const {snapshot,...safe}=output;console.log(JSON.stringify(safe,null,2));if(!output.pass)process.exitCode=1;
}finally{delete env.PGPASSWORD;credential[4]='';}
