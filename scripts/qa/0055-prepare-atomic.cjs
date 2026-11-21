/* ELARA Transport — generate only; never opens a database connection.
 * Preserve source 0055 bytes and insert guards/history inside its BEGIN/COMMIT. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const SOURCE_SHA='31d5747d750b084055bc2f2628052df92e68e634c132402e73aa9300e7504723';
const VERSION='20261116005500',NAME='0055_admin_create_company_customer';
const SIGNATURE='public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)';
const FUNCTIONS_SHA='9913344c4eab93266e80115e95c834ef3ce84bf3ee4a0262419d39d8c666df29';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const evidence=()=>JSON.parse(fs.readFileSync(path.join(root,'docs/0055-remote-audit-evidence.json'),'utf8'));
function prepare(){
 const source=fs.readFileSync(path.join(root,'supabase/migrations/0055_admin_create_company_customer.sql'));
 if(sha(source)!==SOURCE_SHA)throw Error('0055 source SHA mismatch. No artifact generated.');
 const sql=source.toString('utf8'),start=sql.indexOf('begin;')+6,end=sql.lastIndexOf('commit;');
 if(start<6||end<start||sql.slice(end).trim()!=='commit;')throw Error('Unexpected transaction envelope.');
 const baseline=evidence();
 // Derived from the audited definitions after verifying their raw SHA values.
 // Normalize only CR and ACL array ordering; no TEMP dependency in generation.
 const functionBytes=fs.readFileSync(path.join(root,'docs/0055-atomic-functions.json'));
 if(sha(functionBytes)!==FUNCTIONS_SHA)throw Error('Audited function baseline changed.');
 const functions=JSON.parse(functionBytes);
 const history=baseline.migrations;
 const historyExpr=`(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)`;
 const functionExpr=`(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'hash',encode(extensions.digest(replace(pg_get_functiondef(p.oid),chr(13),''),'sha256'),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',(select array_agg(a::text order by a::text collate \"C\") from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a),'config',p.proconfig,'definer',p.prosecdef) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','elara_private') and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))`;
 const orderedFunctions=[...functions].sort((a,b)=>a.signature<b.signature?-1:a.signature>b.signature?1:0);
 const auditQuery=fs.readFileSync(path.join(root,'docs/0055-remote-readonly-audit.sql'),'utf8');
 const pairs=[['columns','constraints'],['constraints','indexes'],['indexes','triggers'],['triggers','functions'],['policies','schemas']];
 const metadataCheck=pairs.map(([key,next])=>{
  const from=auditQuery.indexOf("'"+key+"',")+(key.length+3),to=auditQuery.indexOf(",\n'"+next+"',",from);
  if(from<key.length+3||to<from)throw Error('Cannot extract audited metadata query: '+key);
  return `if ${auditQuery.slice(from,to)} is distinct from ${quote(JSON.stringify(baseline[key]))}::jsonb then raise exception 'Audited ${key} changed.'; end if;`;
 }).join('\n');
 // JSON arrays ordered in JS can differ from server collation. Compare sets as
 // JSONB arrays using symmetric containment and matching lengths instead.
 const functionCheck=`v_functions := ${functionExpr}; if jsonb_array_length(v_functions)<>302 or not (v_functions @> ${quote(JSON.stringify(orderedFunctions))}::jsonb and ${quote(JSON.stringify(orderedFunctions))}::jsonb @> v_functions) then raise exception 'Audited function definitions or ACL changed.'; end if;`;
 const guard=`
-- Generated deployment guard, inside the original transaction.
set local search_path=public,extensions;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local idle_in_transaction_session_timeout='60s';
set local synchronous_commit=on;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
lock table public.companies,public.customers,public.persons,public.company_contacts,public.audit_logs,public.human_code_counters in access share mode;
do $deploy_guard$
declare v_functions jsonb;
begin
 if current_database()<>'postgres' or current_user<>'postgres' or current_setting('server_version_num')::int/10000<>17 then raise exception 'Unexpected database, role or server major.'; end if;
 if exists(select 1 from pg_trigger where tgrelid='supabase_migrations.schema_migrations'::regclass and not tgisinternal) then raise exception 'Unexpected migration history trigger.'; end if;
 if ${historyExpr} is distinct from ${quote(JSON.stringify(history))}::jsonb then raise exception 'Migration history changed; stop.'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_create_company_customer') then raise exception 'Company RPC already exists; inspect, do not replay.'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where name=${quote(NAME)} or version=${quote(VERSION)} or idempotency_key=${quote('elara/'+NAME+'/'+SOURCE_SHA)}) then raise exception 'Migration identity collision.'; end if;
 if exists(select 1 from unnest(array['anon','authenticated']) r cross join unnest(array['companies','customers','persons','company_contacts','audit_logs','human_code_counters']) t where has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(r,'public.'||t,'INSERT,UPDATE')) then raise exception 'Unexpected direct API write privileges.'; end if;
 ${functionCheck}
 ${metadataCheck}
end $deploy_guard$;
-- End generated deployment guard.
`;
 const register=`
-- The RPC checks above and the history write share the original COMMIT.
insert into supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key)
values(${quote(VERSION)},${quote(NAME)},array[${quote(sql)}]::text[],'elara_0055_atomic_psql_v1',${quote('elara/'+NAME+'/'+SOURCE_SHA)});
do $deploy_postcheck$
begin
 if to_regprocedure(${quote(SIGNATURE)}) is null or (select count(*) from supabase_migrations.schema_migrations where version=${quote(VERSION)} and name=${quote(NAME)})<>1 or (select count(*) from supabase_migrations.schema_migrations)<>57 then raise exception 'Atomic installation postcheck failed.'; end if;
end $deploy_postcheck$;
-- End generated history registration.
`;
 const artifact='\\set ON_ERROR_STOP on\n'+sql.slice(0,start)+guard+sql.slice(start,end)+register+sql.slice(end);
 const bodyStart=sql.indexOf('as $$')+5,bodyEnd=sql.indexOf('$$;',bodyStart);
 const bodyHash=sha(sql.slice(bodyStart,bodyEnd).replaceAll('\r',''));
 const newHistory=[...history,{version:VERSION,name:NAME}];
 const oldFunctionExpr=functionExpr.replace("and p.prokind='f'", "and p.proname<>'admin_create_company_customer' and p.prokind='f'");
 const verification=`-- Post-deployment metadata only. Do not invoke the business RPC.\nbegin read only;\nselect jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'history_exact',${historyExpr}=${quote(JSON.stringify(newHistory))}::jsonb,
 'recorded_source_matches',(select encode(extensions.digest(array_to_string(statements,''),'sha256'),'hex')=${quote(SOURCE_SHA)} from supabase_migrations.schema_migrations where version=${quote(VERSION)} and name=${quote(NAME)}),
 'old_functions_intact',${oldFunctionExpr} @> ${quote(JSON.stringify(orderedFunctions))}::jsonb and ${quote(JSON.stringify(orderedFunctions))}::jsonb @> ${oldFunctionExpr},
 'rpc',(select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'search_path',p.proconfig,'defaults',p.pronargdefaults,'result',pg_get_function_result(p.oid),'body_matches',encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')=${quote(bodyHash)},'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),'anon_execute',has_function_privilege('anon',p.oid,'execute'),'service_role_execute',has_function_privilege('service_role',p.oid,'execute'),'public_execute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) from pg_proc p where p.oid=to_regprocedure(${quote(SIGNATURE)}))
 ) verification;\nrollback;\n`;
 // Prove that removing only generated insertions reconstructs the exact source.
 if(artifact.slice('\\set ON_ERROR_STOP on\n'.length).replace(guard,'').replace(register,'')!==sql)throw Error('Source reconstruction failed.');
 return {artifact,verification,guard,register,source:sql,manifest:{version:VERSION,name:NAME,project_ref:'pfdvehcyauoncxeolcjc',source_sha256:SOURCE_SHA,artifact_sha256:sha(artifact),verification_sha256:sha(verification),function_body_sha256:bodyHash,function_baseline_sha256:FUNCTIONS_SHA,history_before:56,history_after:57,source_reconstructed:true,method:'psql single original BEGIN/COMMIT; transactional history INSERT before COMMIT'}};
}
if(require.main===module){
 const out=path.resolve(process.argv[2]||path.join(root,'docs/0055-atomic-deployment.sql'));
 const result=prepare();fs.writeFileSync(out,result.artifact);fs.writeFileSync(out+'.manifest.json',JSON.stringify(result.manifest,null,2)+'\n');fs.writeFileSync(out+'.verify.sql',result.verification);console.log(JSON.stringify(result.manifest,null,2));
}
module.exports={prepare,VERSION,NAME,SIGNATURE,sha,quote};
