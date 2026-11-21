// Generates files only. Never opens a database connection or deploys SQL.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),snapshot=require('./0056-catalog-snapshot.cjs');
const VERSION='20261117005600',NAME='0056_admin_company_contacts';
const SHA='2a4dfadbeae7834e15591eef1a016c7b50524e9b58477145b525cac05497d297';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const specs=[
 ['public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text)',true],
 ['public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text)',true],
 ['public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text)',true],
 ['elara_private.company_contact_company(uuid)',false],
 ['elara_private.company_contact_version()',false]
];
function prepare(baseline){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/0056_admin_company_contacts.sql'),'utf8');
 if(sha(source)!==SHA)throw Error('0056 approved source changed.');
 const bodies=Object.fromEntries([...source.matchAll(/create function ([\w.]+)\([\s\S]*?as \$\$([\s\S]*?)\$\$;/g)].map(m=>[m[1],sha(m[2].replaceAll('\r',''))]));
 if(Object.keys(bodies).length!==5)throw Error('Unexpected source function count.');
 const start=source.indexOf('begin;')+6,end=source.lastIndexOf('commit;');
 if(start<6||end<start||source.slice(end).trim()!=='commit;')throw Error('Unexpected transaction envelope.');
 const old=baseline.snapshot;if(!old||old.history.length!==57)throw Error('Expected audited 57-entry history.');
 const names=specs.map(([s])=>s.slice(s.indexOf('.')+1,s.indexOf('(')));
 const namesSql=names.map(quote).join(',');
 const bodyChecks=specs.map(([s,api])=>`(select p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prosecdef=${api||s.includes('company_contact_company')?'true':'false'} and encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')=${quote(bodies[s.slice(0,s.indexOf('('))])} and has_function_privilege('authenticated',p.oid,'EXECUTE')=${api?'true':'false'} and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p where p.oid=to_regprocedure(${quote(s)}))`).join(' and ');
 const currentOld=snapshot
  .replace("and p.prokind='f'",`and p.proname not in (${namesSql}) and p.prokind='f'`)
  .replace('and a.attnum>0',"and not(a.attrelid='public.company_contacts'::regclass and a.attname='version') and a.attnum>0")
  .replace("from pg_constraint where conrelid", "from pg_constraint where conname<>'company_contacts_version_positive' and conrelid")
  .replace("from pg_trigger where tgrelid", "from pg_trigger where tgname<>'company_contacts_increment_version' and tgrelid");
 const expected={...old,history:[...old.history,{version:VERSION,name:NAME}].sort((a,b)=>a.version.localeCompare(b.version))};
 const structure=`exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.company_contacts'::regclass and a.attname='version' and a.atttypid='bigint'::regtype and a.attnotnull and pg_get_expr(d.adbin,d.adrelid)='1') and exists(select 1 from pg_constraint where conrelid='public.company_contacts'::regclass and conname='company_contacts_version_positive' and convalidated) and exists(select 1 from pg_trigger where tgrelid='public.company_contacts'::regclass and tgname='company_contacts_increment_version' and tgenabled='O' and tgfoid=to_regprocedure('elara_private.company_contact_version()'))`;
 const postCondition=`coalesce((${bodyChecks}),false) and (${structure}) and ${currentOld}=${quote(JSON.stringify(expected))}::jsonb and (select statements=array[${quote(source)}]::text[] from supabase_migrations.schema_migrations where version=${quote(VERSION)} and name=${quote(NAME)})`;
 const guard=`
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local idle_in_transaction_session_timeout='60s';
set local synchronous_commit=on;
select pg_advisory_xact_lock(hashtextextended('elara/individual-schema-deployment',0));
lock table supabase_migrations.schema_migrations in share row exclusive mode;
lock table public.company_contacts in access exclusive mode;
lock table public.companies,public.customers,public.persons,public.audit_logs in access share mode;
do $deploy_guard$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or current_setting('server_version_num')::int/10000<>17 then raise exception 'Unexpected deployment destination.'; end if;
 if ${snapshot} is distinct from ${quote(JSON.stringify(old))}::jsonb then raise exception 'Audited history, functions or metadata changed; stop.'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','elara_private') and p.proname in (${namesSql})) or exists(select 1 from supabase_migrations.schema_migrations where version=${quote(VERSION)} or name=${quote(NAME)} or idempotency_key=${quote('elara/'+NAME+'/'+SHA)}) then raise exception '0056 identity/object collision; stop.'; end if;
 if exists(select 1 from unnest(array['anon','authenticated']) r cross join unnest(array['public','extensions','elara_private']) n where has_schema_privilege(r,n,'CREATE')) or exists(select 1 from unnest(array['anon','authenticated']) r cross join unnest(array['company_contacts','persons','customers','companies','audit_logs']) t where has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(r,'public.'||t,'INSERT,UPDATE')) then raise exception 'Unsafe API privileges; stop.'; end if;
end $deploy_guard$;
`;
 const register=`
insert into supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key)
values(${quote(VERSION)},${quote(NAME)},array[${quote(source)}]::text[],'elara_0056_atomic_psql_v1',${quote('elara/'+NAME+'/'+SHA)});
do $deploy_postcheck$ begin if not coalesce((${postCondition}),false) then raise exception '0056 postcheck failed; rollback entire installation.'; end if; end $deploy_postcheck$;
notify pgrst, 'reload schema';
`;
 const artifact='\\set ON_ERROR_STOP on\n'+source.slice(0,start)+guard+source.slice(start,end)+register+source.slice(end);
 if(artifact.slice('\\set ON_ERROR_STOP on\n'.length).replace(guard,'').replace(register,'')!==source)throw Error('Source reconstruction failed.');
 const verification=`-- Metadata only; never calls contact RPCs.\nbegin read only;\nset local search_path=pg_catalog;\nselect jsonb_build_object('read_only',current_setting('transaction_read_only'),'verification',coalesce((${postCondition}),false),'history_count',(select count(*) from supabase_migrations.schema_migrations),'version',${quote(VERSION)});\nrollback;\n`;
 const disable=`-- Emergency opt-in only AFTER explicit authorization. Never automatically executed.\n\\set ON_ERROR_STOP on\nbegin;\nset local search_path=pg_catalog;\nset local lock_timeout='5s';\nset local statement_timeout='30s';\ndo $disable_guard$ begin if not exists(select 1 from supabase_migrations.schema_migrations where version=${quote(VERSION)} and name=${quote(NAME)} and statements=array[${quote(source)}]::text[]) then raise exception '0056 identity mismatch; stop.'; end if; end $disable_guard$;\nrevoke all on function ${specs.filter(x=>x[1]).map(x=>x[0]).join(',')} from public,anon,authenticated,service_role;\nnotify pgrst, 'reload schema';\ncommit;\n-- Retains column, trigger, records, history and all pre-0056 functions.\n`;
 return {artifact,verification,disable,manifest:{project_ref:'pfdvehcyauoncxeolcjc',version:VERSION,name:NAME,source_sha256:SHA,artifact_sha256:sha(artifact),verification_sha256:sha(verification),disable_sha256:sha(disable),history_before:57,history_after:58,source_reconstructed:true,function_body_hashes:bodies,method:'Single original BEGIN/COMMIT; locked preflight; schema/history/postcheck atomic; no business RPC call'}};
}
if(require.main===module){const audit=JSON.parse(fs.readFileSync(path.join(root,'docs/0056-remote-preflight-results.json'),'utf8'));if(!audit.pass)throw Error('Successful remote read-only preflight required.');const result=prepare(audit.data);const out=path.join(root,'docs/0056-atomic-deployment.sql');fs.writeFileSync(out,result.artifact);fs.writeFileSync(out+'.verify.sql',result.verification);fs.writeFileSync(out+'.disable.sql',result.disable);fs.writeFileSync(out+'.manifest.json',JSON.stringify(result.manifest,null,2)+'\n');console.log(JSON.stringify(result.manifest,null,2));}
module.exports={prepare,VERSION,NAME,specs};
