// File generation only. No database connection, credential access or deployment.
'use strict';
const fs=require('fs'),crypto=require('crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const manifest=JSON.parse(fs.readFileSync('docs/0057-local-manifest.json','utf8'));
for(const [file,hash]of Object.entries(manifest.files))if(sha(fs.readFileSync(file))!==hash)throw Error('Validated source mismatch: '+file);
const source=fs.readFileSync('supabase/migrations/0057_admin_users.sql','utf8');
const b=JSON.parse(fs.readFileSync('docs/0057-final-readonly-baseline.json','utf8')).baseline;
const version='20261120005700',name='0057_admin_users';
if(b.history.length!==58||!b.history.some(h=>h.version==='20261117005600')||b.history.some(h=>h.version===version||h.name.includes('0057')))throw Error('Unexpected baseline history');
const history=`(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version collate "C") from supabase_migrations.schema_migrations)`;
const matchFunction=f=>`coalesce((select pg_get_userbyid(proowner)=${q(f.owner)} and md5(prosrc)=${q(f.body_md5)} from pg_proc where oid=to_regprocedure(${q(f.signature.includes('.')?f.signature:'public.'+f.signature)})),false)`;
const functionChecks=[];
for(const m of source.matchAll(/create(?: or replace)? function ([\w.]+)\(([^)]*)\)([\s\S]*?)as \$\$([\s\S]*?)\$\$;/g)){
 const signature=m[1]+'('+m[2].split(',').filter(x=>x.trim()).map(x=>x.trim().split(/\s+/)[1]).join(',')+')';
 const api=m[1].startsWith('public.'),claim=m[1]==='public.admin_claim_user_invitation';
 const md5=crypto.createHash('md5').update(m[4].replaceAll('\r','')).digest('hex');
 functionChecks.push(`coalesce((select proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog'] and prosecdef=${m[3].includes('security definer')} and md5(replace(prosrc,chr(13),''))=${q(md5)} and has_function_privilege('authenticated',oid,'EXECUTE')=${api&&!claim} and has_function_privilege('service_role',oid,'EXECUTE')=${claim} and not has_function_privilege('anon',oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc where oid=to_regprocedure(${q(signature)})),false)`);
}
if(functionChecks.length!==17)throw Error('Unexpected function count');
const oldFunctions=b.functions.filter(f=>!f.signature.startsWith('admin_begin_driver_portal_access(')&&!f.signature.startsWith('admin_link_driver_portal_access('));
const tables=['user_admin_requests','user_admin_rollout','user_driver_access_attempts','user_suspended_driver_links'];
const privateChecks=tables.map(t=>`(select count(*)=0 from elara_private.${t}) and exists(select 1 from pg_class where oid='elara_private.${t}'::regclass and relrowsecurity) and not exists(select 1 from unnest(array['anon','authenticated','service_role']) r where has_table_privilege(r,'elara_private.${t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))`).join(' and ');
const expected=[...b.history,{version,name}].sort((a,c)=>a.version<c.version?-1:1);
const historyCheck=`${history}=${q(JSON.stringify(expected))}::jsonb and (select statements=array[${q(source)}]::text[] from supabase_migrations.schema_migrations where version=${q(version)} and name=${q(name)})`;
const post=`(${functionChecks.join(' and ')}) and (${oldFunctions.map(matchFunction).join(' and ')}) and (${privateChecks}) and (${historyCheck}) and exists(select 1 from pg_attribute where attrelid='public.app_users'::regclass and attname='admin_version' and atttypid='bigint'::regtype and attnotnull)`;
const guard=`
-- Individual transaction; stop on baseline drift, conflicts or incompatible target.
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local idle_in_transaction_session_timeout='60s';
set local synchronous_commit=on;
select pg_advisory_xact_lock(hashtextextended('elara/individual-schema-deployment',0));
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $guard_0057$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or current_setting('server_version_num')::int/10000<>17 then raise exception 'Wrong deployment target'; end if;
 if ${history} is distinct from ${q(JSON.stringify(b.history))}::jsonb then raise exception 'Migration history changed'; end if;
 if not (${b.functions.map(matchFunction).join(' and ')}) then raise exception 'Dependency function changed'; end if;
 if exists(select 1 from pg_attribute where attrelid='public.app_users'::regclass and attname='admin_version' and not attisdropped)
 or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='elara_private' and c.relname in (${tables.map(q).join(',')},'user_invitation_email_reservation'))
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='elara_private' and p.proname like 'user_admin_%') or (n.nspname='public' and p.proname in ('admin_get_user_control','admin_get_user_request','admin_manage_user','admin_prepare_user_invitation','admin_claim_user_invitation','admin_complete_user_invitation')))
 or exists(select 1 from pg_trigger where tgname in ('app_users_admin_version','user_roles_admin_version','user_driver_links_admin_version','user_admin_rollout_lock')) then raise exception '0057 object conflict'; end if;
 if exists(select 1 from unnest(array['anon','authenticated']) r cross join unnest(array['public','elara_private','extensions']) n where has_schema_privilege(r,n,'CREATE')) then raise exception 'Unsafe schema privileges'; end if;
end $guard_0057$;
`;
const register=`
insert into supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key)
 values(${q(version)},${q(name)},array[${q(source)}]::text[],'elara_0057_atomic_psql_v1',${q('elara/'+name+'/'+sha(source))});
do $post_0057$ begin if not coalesce((${post}),false) then raise exception '0057 postcheck failed; rollback'; end if; end $post_0057$;
notify pgrst, 'reload schema';
`;
const start=source.indexOf('begin;')+6,end=source.lastIndexOf('commit;');
if(start<6||source.slice(end).trim()!=='commit;')throw Error('Unexpected source transaction');
const artifact=source.slice(0,start)+guard+source.slice(start,end)+register+source.slice(end);
if(artifact.replace(guard,'').replace(register,'')!==source)throw Error('Source reconstruction failed');
const verify=`-- Metadata/configuration only. Never invokes business RPCs.\nbegin read only;\nset local search_path=pg_catalog;\nselect jsonb_build_object('verification',coalesce((${post}),false),'version',${q(version)},'read_only',current_setting('transaction_read_only'));\nrollback;\n`;
const base='docs/0057-atomic-deployment.sql';
fs.writeFileSync(base,artifact);fs.writeFileSync(base+'.verify.sql',verify);
fs.writeFileSync(base+'.manifest.json',JSON.stringify({project_ref:'pfdvehcyauoncxeolcjc',version,name,source_sha256:sha(source),artifact_sha256:sha(artifact),verification_sha256:sha(verify),baseline_sha256:sha(fs.readFileSync('docs/0057-final-readonly-baseline.json')),remoteApplied:false},null,2)+'\n');
console.log('Prepared 0057 artifact and read-only verifier; validated source manifest unchanged.');
