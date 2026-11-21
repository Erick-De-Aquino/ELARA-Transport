-- Metadata only; never calls contact RPCs.
begin read only;
set local search_path=pg_catalog;
select jsonb_build_object('read_only',current_setting('transaction_read_only'),'verification',coalesce((coalesce(((select p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prosecdef=true and encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')='21bbf8e3d346814656136bce6b532f78b39f0a055723b0c2cc87b190e15b8970' and has_function_privilege('authenticated',p.oid,'EXECUTE')=true and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p where p.oid=to_regprocedure('public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text)')) and (select p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prosecdef=true and encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')='f997886fed727fdab12697d2d2f8278fefeda499aaf4243d606ce2ba00433258' and has_function_privilege('authenticated',p.oid,'EXECUTE')=true and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p where p.oid=to_regprocedure('public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text)')) and (select p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prosecdef=true and encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')='78932465879a84c12429b0a278147a0cef19e94ae0e613fef63fe011c80a23ef' and has_function_privilege('authenticated',p.oid,'EXECUTE')=true and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p where p.oid=to_regprocedure('public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text)')) and (select p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prosecdef=true and encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')='45e286efb5e2327d9b0db8939642b970e420e0b4f61fc4e0e6e7200203eb2955' and has_function_privilege('authenticated',p.oid,'EXECUTE')=false and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p where p.oid=to_regprocedure('elara_private.company_contact_company(uuid)')) and (select p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prosecdef=false and encode(extensions.digest(replace(p.prosrc,chr(13),''),'sha256'),'hex')='9da5ad32b10b6e91cfa17314597a2af36df321194d6b79d68c792e35c08aa767' and has_function_privilege('authenticated',p.oid,'EXECUTE')=false and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p where p.oid=to_regprocedure('elara_private.company_contact_version()'))),false) and (exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.company_contacts'::regclass and a.attname='version' and a.atttypid='bigint'::regtype and a.attnotnull and pg_get_expr(d.adbin,d.adrelid)='1') and exists(select 1 from pg_constraint where conrelid='public.company_contacts'::regclass and conname='company_contacts_version_positive' and convalidated) and exists(select 1 from pg_trigger where tgrelid='public.company_contacts'::regclass and tgname='company_contacts_increment_version' and tgenabled='O' and tgfoid=to_regprocedure('elara_private.company_contact_version()'))) and jsonb_build_object(
 'history',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations),
 'functions_hash',(select md5(string_agg(p.oid::regprocedure::text||'/'||replace(pg_get_functiondef(p.oid),chr(13),'')||'/'||pg_get_userbyid(p.proowner)||'/'||coalesce(p.proacl::text,'') ,E'\n' order by p.oid::regprocedure::text collate "C")) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','elara_private') and p.proname not in ('admin_add_company_contact','admin_set_company_primary_contact','admin_update_company_contact','company_contact_company','company_contact_version') and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'metadata',jsonb_build_object(
  'columns',(select jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attrelid::regclass::text,a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid in ('public.company_contacts'::regclass,'public.persons'::regclass,'public.customers'::regclass,'public.companies'::regclass,'supabase_migrations.schema_migrations'::regclass) and not(a.attrelid='public.company_contacts'::regclass and a.attname='version') and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid),convalidated) order by conrelid::regclass::text,conname) from pg_constraint where conname<>'company_contacts_version_positive' and conrelid in ('public.company_contacts'::regclass,'public.persons'::regclass,'public.customers'::regclass,'public.companies'::regclass,'supabase_migrations.schema_migrations'::regclass)),
  'indexes',(select jsonb_agg(jsonb_build_array(indexrelid::regclass::text,pg_get_indexdef(indexrelid),indisvalid,indisready) order by indexrelid::regclass::text) from pg_index where indrelid='public.company_contacts'::regclass),
  'triggers',(select jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,tgenabled,pg_get_triggerdef(oid)) order by tgrelid::regclass::text,tgname) from pg_trigger where tgname<>'company_contacts_increment_version' and tgrelid in ('public.company_contacts'::regclass,'public.persons'::regclass,'public.customers'::regclass,'public.companies'::regclass,'supabase_migrations.schema_migrations'::regclass) and not tgisinternal),
  'tables',(select jsonb_agg(jsonb_build_array(oid::regclass::text,pg_get_userbyid(relowner),relacl::text,relrowsecurity,relforcerowsecurity) order by oid::regclass::text) from pg_class where oid in ('public.company_contacts'::regclass,'public.persons'::regclass,'public.customers'::regclass,'public.companies'::regclass,'public.audit_logs'::regclass,'supabase_migrations.schema_migrations'::regclass)),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname='public' and tablename in ('company_contacts','persons','customers','companies','audit_logs')),
  'schemas',(select jsonb_agg(jsonb_build_array(nspname,nspacl::text) order by nspname) from pg_namespace where nspname in ('public','elara_private','extensions'))
 ))='{"history":[{"name":"extensions_and_base_helpers","version":"0001"},{"name":"human_code_generation","version":"0002"},{"name":"identity_roles_sessions","version":"0003"},{"name":"identity_integrity_fixes","version":"00031"},{"name":"people_customers_drivers_suppliers","version":"0004"},{"name":"vehicles_documents_assignments","version":"0005"},{"name":"human_code_padding_adjustments","version":"00051"},{"name":"services_operations","version":"0006"},{"name":"service_financials_payments","version":"0007"},{"name":"cash_remittances_counts","version":"0008"},{"name":"receivables","version":"0009"},{"name":"expenses","version":"0010"},{"name":"settlements","version":"0011"},{"name":"incidents_settings_audit","version":"0012"},{"name":"domain_secure_functions","version":"0013"},{"name":"rls_policies","version":"0014"},{"name":"storage_buckets_policies","version":"0015"},{"name":"views_integrity_checks","version":"0016"},{"name":"app_session_bootstrap","version":"0017"},{"name":"driver_cash_finance_summary","version":"0018"},{"name":"driver_expenses_read_api","version":"0019"},{"name":"driver_customer_person_rls","version":"0020"},{"name":"driver_accept_service_rpc","version":"0021"},{"name":"driver_start_service_rpc","version":"0022"},{"name":"driver_service_overview_rpc","version":"0023"},{"name":"driver_service_progress_rpc","version":"0024"},{"name":"driver_service_incident_rpc","version":"0025"},{"name":"driver_create_expense_rpc","version":"0026"},{"name":"driver_expenses_list_operational_relation","version":"0027"},{"name":"driver_profile_update_rpcs","version":"0028"},{"name":"driver_cash_discrepancy_rpc","version":"0029"},{"name":"driver_cash_remittance_submit_rpc","version":"0030"},{"name":"end_current_app_session_rpc","version":"0031"},{"name":"admin_cash_remittance_read_rpcs","version":"0032"},{"name":"admin_receive_cash_remittance_rpc","version":"0033"},{"name":"admin_verify_cash_remittance_rpc","version":"0034"},{"name":"fix_verify_cash_remittance_encoding","version":"0035"},{"name":"admin_cash_discrepancy_management_rpcs","version":"0036"},{"name":"admin_expense_read_rpcs","version":"0037"},{"name":"admin_expense_review_rpcs","version":"0038"},{"name":"expense_submit_rpcs","version":"0039"},{"name":"admin_expense_reimbursement_rpc","version":"0040"},{"name":"harden_register_expense_payment","version":"0041"},{"name":"harden_cancel_expense_rpc","version":"0042"},{"name":"enforce_expense_cash_balance","version":"0043"},{"name":"admin_settlement_read_rpcs","version":"0044"},{"name":"driver_cash_source_consumption","version":"0045"},{"name":"harden_settlement_generation","version":"0046"},{"name":"admin_cash_movement_read_rpc","version":"0047"},{"name":"admin_catalog_management","version":"0048"},{"name":"service_status_history_central_writer","version":"0049"},{"name":"cash_service_financial_close","version":"0050"},{"name":"driver_portal_access_and_operational_central","version":"0051"},{"name":"initial_superadmin_bootstrap","version":"0052"},{"name":"0053_app_session_concurrency","version":"20261105141040"},{"name":"0054_driver_accept_confirms_service","version":"20261106145018"},{"name":"0055_admin_create_company_customer","version":"20261116005500"},{"version":"20261117005600","name":"0056_admin_company_contacts"}],"metadata":{"tables":[["public.audit_logs","postgres","{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",true,false],["public.companies","postgres","{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",true,false],["public.company_contacts","postgres","{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",true,false],["public.customers","postgres","{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",true,false],["public.persons","postgres","{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",true,false],["supabase_migrations.schema_migrations","postgres",null,false,false]],"columns":[["public.companies","id","uuid",true,"extensions.gen_random_uuid()"],["public.companies","legal_name","text",true,null],["public.companies","trade_name","text",false,null],["public.companies","tax_id","text",false,null],["public.companies","billing_email","text",false,null],["public.companies","billing_phone","text",false,null],["public.companies","billing_address","text",false,null],["public.companies","notes","text",false,null],["public.companies","status","text",true,"''active''::text"],["public.companies","created_at","timestamp with time zone",true,"now()"],["public.companies","updated_at","timestamp with time zone",true,"now()"],["public.companies","inactive_at","timestamp with time zone",false,null],["public.companies","created_by","uuid",false,null],["public.companies","updated_by","uuid",false,null],["public.companies","inactive_by","uuid",false,null],["public.company_contacts","id","uuid",true,"extensions.gen_random_uuid()"],["public.company_contacts","company_id","uuid",true,null],["public.company_contacts","person_id","uuid",true,null],["public.company_contacts","role_label","text",false,null],["public.company_contacts","is_primary","boolean",true,"false"],["public.company_contacts","status","text",true,"''active''::text"],["public.company_contacts","started_at","timestamp with time zone",false,null],["public.company_contacts","ended_at","timestamp with time zone",false,null],["public.company_contacts","notes","text",false,null],["public.company_contacts","created_at","timestamp with time zone",true,"now()"],["public.company_contacts","updated_at","timestamp with time zone",true,"now()"],["public.company_contacts","created_by","uuid",false,null],["public.company_contacts","updated_by","uuid",false,null],["public.company_contacts","inactive_by","uuid",false,null],["public.customers","id","uuid",true,"extensions.gen_random_uuid()"],["public.customers","human_code","text",true,null],["public.customers","customer_type","text",true,null],["public.customers","person_id","uuid",false,null],["public.customers","company_id","uuid",false,null],["public.customers","status","text",true,"''new''::text"],["public.customers","billing_notes","text",false,null],["public.customers","preferences","jsonb",false,null],["public.customers","internal_notes","text",false,null],["public.customers","created_at","timestamp with time zone",true,"now()"],["public.customers","updated_at","timestamp with time zone",true,"now()"],["public.customers","blocked_at","timestamp with time zone",false,null],["public.customers","blocked_by","uuid",false,null],["public.customers","blocked_reason","text",false,null],["public.customers","inactive_at","timestamp with time zone",false,null],["public.customers","created_by","uuid",false,null],["public.customers","updated_by","uuid",false,null],["public.customers","inactive_by","uuid",false,null],["public.persons","id","uuid",true,"extensions.gen_random_uuid()"],["public.persons","first_name","text",true,null],["public.persons","last_name","text",true,null],["public.persons","contact_email","text",false,null],["public.persons","phone","text",false,null],["public.persons","country_code","text",false,null],["public.persons","notes","text",false,null],["public.persons","status","text",true,"''active''::text"],["public.persons","created_at","timestamp with time zone",true,"now()"],["public.persons","updated_at","timestamp with time zone",true,"now()"],["public.persons","inactive_at","timestamp with time zone",false,null],["public.persons","created_by","uuid",false,null],["public.persons","updated_by","uuid",false,null],["public.persons","inactive_by","uuid",false,null],["supabase_migrations.schema_migrations","version","text",true,null],["supabase_migrations.schema_migrations","statements","text[]",false,null],["supabase_migrations.schema_migrations","name","text",false,null],["supabase_migrations.schema_migrations","created_by","text",false,null],["supabase_migrations.schema_migrations","idempotency_key","text",false,null],["supabase_migrations.schema_migrations","rollback","text[]",false,null]],"indexes":[["public.company_contacts_one_active_per_company_person_idx","CREATE UNIQUE INDEX company_contacts_one_active_per_company_person_idx ON public.company_contacts USING btree (company_id, person_id) WHERE (status = ''active''::text)",true,true],["public.company_contacts_one_primary_active_per_company_idx","CREATE UNIQUE INDEX company_contacts_one_primary_active_per_company_idx ON public.company_contacts USING btree (company_id) WHERE ((status = ''active''::text) AND (is_primary = true))",true,true],["public.company_contacts_pkey","CREATE UNIQUE INDEX company_contacts_pkey ON public.company_contacts USING btree (id)",true,true]],"schemas":[["elara_private","{postgres=UC/postgres}"],["extensions","{postgres=UC/postgres,anon=U/postgres,authenticated=U/postgres,service_role=U/postgres,dashboard_user=UC/postgres}"],["public","{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}"]],"policies":[{"cmd":"SELECT","qual":"public.rls_is_superadmin()","roles":["authenticated"],"tablename":"audit_logs","permissive":"PERMISSIVE","policyname":"audit_logs_select_superadmin","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"(public.rls_is_admin() OR (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.company_id = companies.id) AND public.rls_driver_can_access_customer(c.id)))))","roles":["authenticated"],"tablename":"companies","permissive":"PERMISSIVE","policyname":"companies_select","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"(public.rls_is_admin() OR (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.company_id = company_contacts.company_id) AND public.rls_driver_can_access_customer(c.id)))))","roles":["authenticated"],"tablename":"company_contacts","permissive":"PERMISSIVE","policyname":"company_contacts_select","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"(public.rls_is_admin() OR public.rls_driver_can_access_customer(id))","roles":["authenticated"],"tablename":"customers","permissive":"PERMISSIVE","policyname":"customers_select","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"(EXISTS ( SELECT 1\n   FROM public.customers customer\n  WHERE ((customer.customer_type = ''individual''::text) AND (customer.person_id = persons.id) AND public.rls_driver_can_access_customer(customer.id))))","roles":["authenticated"],"tablename":"persons","permissive":"PERMISSIVE","policyname":"persons_select_accessible_customer_person","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"public.rls_is_admin()","roles":["authenticated"],"tablename":"persons","permissive":"PERMISSIVE","policyname":"persons_select_admin","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"(id = ( SELECT app_users.person_id\n   FROM public.app_users\n  WHERE (app_users.id = public.rls_current_app_user_id())))","roles":["authenticated"],"tablename":"persons","permissive":"PERMISSIVE","policyname":"persons_select_own_driver","schemaname":"public","with_check":null}],"triggers":[["public.companies","set_companies_updated_at","O","CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"],["public.company_contacts","set_company_contacts_updated_at","O","CREATE TRIGGER set_company_contacts_updated_at BEFORE UPDATE ON public.company_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"],["public.company_contacts","validate_company_contacts_integrity","O","CREATE CONSTRAINT TRIGGER validate_company_contacts_integrity AFTER INSERT OR UPDATE ON public.company_contacts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_people_commercial_integrity()"],["public.customers","assign_customers_human_code","O","CREATE TRIGGER assign_customers_human_code BEFORE INSERT OR UPDATE OF human_code, customer_type ON public.customers FOR EACH ROW EXECUTE FUNCTION public.assign_customer_human_code()"],["public.customers","set_customers_updated_at","O","CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"],["public.customers","validate_customers_integrity","O","CREATE CONSTRAINT TRIGGER validate_customers_integrity AFTER INSERT OR UPDATE ON public.customers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_people_commercial_integrity()"],["public.persons","set_persons_updated_at","O","CREATE TRIGGER set_persons_updated_at BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"]],"constraints":[["public.companies","companies_created_by_fkey","FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.companies","companies_inactive_at_required_when_inactive","CHECK (((status <> ''inactive''::text) OR (inactive_at IS NOT NULL)))",true],["public.companies","companies_inactive_by_fkey","FOREIGN KEY (inactive_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.companies","companies_legal_name_not_empty","CHECK ((length(TRIM(BOTH FROM legal_name)) > 0))",true],["public.companies","companies_pkey","PRIMARY KEY (id)",true],["public.companies","companies_status_check","CHECK ((status = ANY (ARRAY[''active''::text, ''inactive''::text])))",true],["public.companies","companies_updated_by_fkey","FOREIGN KEY (updated_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.company_contacts","company_contacts_company_id_fkey","FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT",true],["public.company_contacts","company_contacts_created_by_fkey","FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.company_contacts","company_contacts_ended_at_required_when_inactive","CHECK (((status <> ''inactive''::text) OR (ended_at IS NOT NULL)))",true],["public.company_contacts","company_contacts_inactive_by_fkey","FOREIGN KEY (inactive_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.company_contacts","company_contacts_person_id_fkey","FOREIGN KEY (person_id) REFERENCES public.persons(id) ON DELETE RESTRICT",true],["public.company_contacts","company_contacts_pkey","PRIMARY KEY (id)",true],["public.company_contacts","company_contacts_started_before_ended","CHECK (((started_at IS NULL) OR (ended_at IS NULL) OR (started_at <= ended_at)))",true],["public.company_contacts","company_contacts_status_check","CHECK ((status = ANY (ARRAY[''active''::text, ''inactive''::text])))",true],["public.company_contacts","company_contacts_updated_by_fkey","FOREIGN KEY (updated_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.company_contacts","validate_company_contacts_integrity","TRIGGER DEFERRABLE INITIALLY DEFERRED",true],["public.customers","customers_blocked_at_required_when_blocked","CHECK (((status <> ''blocked''::text) OR (blocked_at IS NOT NULL)))",true],["public.customers","customers_blocked_by_fkey","FOREIGN KEY (blocked_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.customers","customers_company_id_fkey","FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT",true],["public.customers","customers_created_by_fkey","FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.customers","customers_exactly_one_subject","CHECK ((((customer_type = ''individual''::text) AND (person_id IS NOT NULL) AND (company_id IS NULL)) OR ((customer_type = ''company''::text) AND (company_id IS NOT NULL) AND (person_id IS NULL))))",true],["public.customers","customers_human_code_format","CHECK ((((customer_type = ''individual''::text) AND (human_code ~ ''^CL-[0-9]{4}$''::text)) OR ((customer_type = ''company''::text) AND (human_code ~ ''^EMP-[0-9]{4}$''::text))))",true],["public.customers","customers_human_code_unique","UNIQUE (human_code)",true],["public.customers","customers_inactive_at_required_when_inactive","CHECK (((status <> ''inactive''::text) OR (inactive_at IS NOT NULL)))",true],["public.customers","customers_inactive_by_fkey","FOREIGN KEY (inactive_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.customers","customers_person_id_fkey","FOREIGN KEY (person_id) REFERENCES public.persons(id) ON DELETE RESTRICT",true],["public.customers","customers_pkey","PRIMARY KEY (id)",true],["public.customers","customers_status_check","CHECK ((status = ANY (ARRAY[''new''::text, ''active''::text, ''blocked''::text, ''inactive''::text])))",true],["public.customers","customers_type_check","CHECK ((customer_type = ANY (ARRAY[''individual''::text, ''company''::text])))",true],["public.customers","customers_updated_by_fkey","FOREIGN KEY (updated_by) REFERENCES public.app_users(id) ON DELETE RESTRICT",true],["public.customers","validate_customers_integrity","TRIGGER DEFERRABLE INITIALLY DEFERRED",true],["public.persons","persons_first_name_not_empty","CHECK ((length(TRIM(BOTH FROM first_name)) > 0))",true],["public.persons","persons_inactive_at_required_when_inactive","CHECK (((status <> ''inactive''::text) OR (inactive_at IS NOT NULL)))",true],["public.persons","persons_last_name_not_empty","CHECK ((length(TRIM(BOTH FROM last_name)) > 0))",true],["public.persons","persons_pkey","PRIMARY KEY (id)",true],["public.persons","persons_status_check","CHECK ((status = ANY (ARRAY[''active''::text, ''inactive''::text])))",true],["supabase_migrations.schema_migrations","schema_migrations_idempotency_key_key","UNIQUE (idempotency_key)",true],["supabase_migrations.schema_migrations","schema_migrations_pkey","PRIMARY KEY (version)",true]]},"functions_hash":"f83ea37d3d6e6b6fa32e9ebc32622abd"}'::jsonb and (select statements=array['-- 0056: local additive administrative company-contact contracts. No personal edits.
begin;

do $prerequisites$
begin
  if to_regprocedure(''public.admin_create_company_customer(uuid,text,text,text,text,text,text,text,text,text,jsonb)'') is null
    or to_regprocedure(''elara_private.catalog_request(text,uuid,jsonb)'') is null
    or to_regprocedure(''elara_private.catalog_person(text,text,text,text,text)'') is null
    or to_regclass(''public.company_contacts_one_active_per_company_person_idx'') is null
    or to_regclass(''public.company_contacts_one_primary_active_per_company_idx'') is null
    or has_schema_privilege(''authenticated'',''public'',''create'')
    or has_schema_privilege(''anon'',''public'',''create'') then
    raise exception ''Missing or unsafe company contact prerequisites.'';
  end if;
end $prerequisites$;

-- updated_at uses transaction time and is not an optimistic concurrency token.
-- Increment on every UPDATE, including trusted writers outside these RPCs.
alter table public.company_contacts add column version bigint not null default 1
  constraint company_contacts_version_positive check (version > 0);

create function elara_private.company_contact_version()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger company_contacts_increment_version before update on public.company_contacts
for each row execute function elara_private.company_contact_version();

-- Lock order: receipt -> customer -> company -> persons (UUID order) -> contacts.
-- The company row serializes these three RPCs even across historic customer rows.
create function elara_private.company_contact_company(p_customer uuid)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_customer public.customers%rowtype; v_company public.companies%rowtype;
begin
  perform public.require_admin_user();
  if p_customer is null then raise exception ''Customer UUID is required.'' using errcode=''22023''; end if;
  select * into v_customer from public.customers where id=p_customer for update;
  if not found then raise exception ''Company customer is not available.'' using errcode=''23503''; end if;
  if v_customer.customer_type <> ''company'' or v_customer.status not in (''new'',''active'') then
    raise exception ''Company customer is incompatible.'' using errcode=''23514'';
  end if;
  select * into v_company from public.companies where id=v_customer.company_id for update;
  if not found or v_company.status <> ''active'' then
    raise exception ''Company is not available.'' using errcode=''23514'';
  end if;
  return v_company.id;
end $$;

create function public.admin_add_company_contact(
  p_request_id uuid, p_customer_id uuid, p_contact jsonb,
  p_is_primary boolean default false, p_notes text default null
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  v_actor uuid; v_company uuid; v_person uuid; v_status text; v_mode text;
  v_contact jsonb; v_args jsonb; v_result jsonb; v_key text; v_value jsonb;
  v_row public.company_contacts%rowtype;
begin
  v_actor := public.require_admin_user();
  if p_customer_id is null or p_is_primary is null or p_contact is null
    or jsonb_typeof(p_contact) <> ''object'' then
    raise exception ''Customer, contact object and primary choice are required.'' using errcode=''22023'';
  end if;
  v_mode := lower(btrim(p_contact->>''mode''));
  if v_mode is null or v_mode not in (''new'',''existing'') then
    raise exception ''Invalid contact mode.'' using errcode=''22023'';
  end if;
  for v_key,v_value in select key,value from jsonb_each(p_contact) loop
    if not (v_key = any(case when v_mode=''new''
      then array[''mode'',''first_name'',''last_name'',''phone'',''email'',''role_label'']
      else array[''mode'',''person_id'',''role_label''] end))
      or jsonb_typeof(v_value) not in (''string'',''null'') then
      raise exception ''Unknown contact field or invalid type.'' using errcode=''22023'';
    end if;
  end loop;
  if v_mode=''new'' then
    v_contact := jsonb_build_object(''mode'',''new'',
      ''first_name'',nullif(btrim(p_contact->>''first_name''),''''),
      ''last_name'',nullif(btrim(p_contact->>''last_name''),''''),
      ''phone'',nullif(btrim(p_contact->>''phone''),''''),
      ''email'',nullif(lower(btrim(p_contact->>''email'')),''''),
      ''role_label'',nullif(btrim(p_contact->>''role_label''),''''));
    if v_contact->>''first_name'' is null or v_contact->>''last_name'' is null
      or (v_contact->>''phone'' is null and v_contact->>''email'' is null) then
      raise exception ''New contact requires names and phone or email.'' using errcode=''22023'';
    end if;
    if v_contact->>''email'' is not null and (v_contact->>''email'') !~ ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'' then
      raise exception ''Invalid contact email.'' using errcode=''22023'';
    end if;
  else
    if coalesce(p_contact->>''person_id'','''') !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
      raise exception ''Valid person UUID is required.'' using errcode=''22023'';
    end if;
    v_contact := jsonb_build_object(''mode'',''existing'',''person_id'',(p_contact->>''person_id'')::uuid,
      ''role_label'',nullif(btrim(p_contact->>''role_label''),''''));
  end if;
  v_args := jsonb_build_object(''customer_id'',p_customer_id,''contact'',v_contact,
    ''is_primary'',p_is_primary,''notes'',nullif(btrim(p_notes),''''));
  v_result := elara_private.catalog_request(''admin_company_contact_added'',p_request_id,v_args);
  if v_result is not null then return v_result; end if;
  v_company := elara_private.company_contact_company(p_customer_id);
  if p_is_primary and exists(select 1 from public.company_contacts where company_id=v_company and status=''active'' and is_primary) then
    raise exception ''An active primary already exists; explicit replacement is required.'' using errcode=''23514'';
  end if;
  if v_mode=''new'' then
    v_person := elara_private.catalog_person(v_contact->>''first_name'',v_contact->>''last_name'',v_contact->>''phone'',v_contact->>''email'',null);
  else
    v_person := (v_contact->>''person_id'')::uuid;
    select status into v_status from public.persons where id=v_person for update;
    if not found then raise exception ''Contact person is not available.'' using errcode=''23503''; end if;
    if v_status <> ''active'' then raise exception ''Contact person must be active.'' using errcode=''23514''; end if;
  end if;
  if exists(select 1 from public.company_contacts where company_id=v_company and person_id=v_person and status=''active'') then
    raise exception ''An active contact link already exists.'' using errcode=''23505'';
  end if;
  insert into public.company_contacts(company_id,person_id,role_label,notes,is_primary,status,started_at,created_by,updated_by)
  values(v_company,v_person,v_contact->>''role_label'',v_args->>''notes'',p_is_primary,''active'',clock_timestamp(),v_actor,v_actor)
  returning * into v_row;
  v_result := jsonb_build_object(''customer_id'',p_customer_id,''company_id'',v_company,
    ''company_contact_id'',v_row.id,''person_id'',v_person,''status'',v_row.status,
    ''is_primary'',v_row.is_primary,''version'',v_row.version);
  perform elara_private.catalog_audit(''admin_company_contact_added'',''insert'',''company_contacts'',v_row.id,null,
    null,jsonb_build_object(''company_id'',v_company,''person_id'',v_person,''status'',v_row.status,
    ''is_primary'',v_row.is_primary,''version'',v_row.version),null,p_request_id,v_args,v_result);
  return v_result;
exception when unique_violation then
  raise exception ''Administrative duplicate conflict; review is required.'' using errcode=''23505'';
end $$;

create function public.admin_set_company_primary_contact(
  p_request_id uuid, p_customer_id uuid, p_company_contact_id uuid,
  p_expected_version bigint, p_expected_primary_contact_id uuid,
  p_expected_primary_version bigint, p_reason text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  v_actor uuid; v_company uuid; v_args jsonb; v_result jsonb;
  v_target public.company_contacts%rowtype; v_primary public.company_contacts%rowtype;
begin
  v_actor := public.require_admin_user();
  if p_customer_id is null or p_company_contact_id is null or coalesce(p_expected_version,0)<1
    or (p_expected_primary_contact_id is null) <> (p_expected_primary_version is null)
    or (p_expected_primary_version is not null and p_expected_primary_version<1)
    or nullif(btrim(p_reason),'''') is null then
    raise exception ''Target, expected versions and reason are required.'' using errcode=''22023'';
  end if;
  v_args := jsonb_build_object(''customer_id'',p_customer_id,''contact_id'',p_company_contact_id,
    ''expected_version'',p_expected_version,''expected_primary_id'',p_expected_primary_contact_id,
    ''expected_primary_version'',p_expected_primary_version,''reason'',btrim(p_reason));
  v_result := elara_private.catalog_request(''admin_company_primary_contact_set'',p_request_id,v_args);
  if v_result is not null then return v_result; end if;
  v_company := elara_private.company_contact_company(p_customer_id);
  -- Lock shared identities in UUID order before touching their links.
  perform p.id from public.persons p where p.id in
    (select person_id from public.company_contacts where company_id=v_company and status=''active''
      and (id=p_company_contact_id or is_primary)) order by p.id for update;
  perform id from public.company_contacts where company_id=v_company and status=''active''
    and (id=p_company_contact_id or is_primary) order by id for update;
  select * into v_target from public.company_contacts where id=p_company_contact_id and company_id=v_company and status=''active'';
  if not found then raise exception ''Active contact link is not available.'' using errcode=''23503''; end if;
  select * into v_primary from public.company_contacts where company_id=v_company and status=''active'' and is_primary;
  if v_target.version <> p_expected_version or v_primary.id is distinct from p_expected_primary_contact_id
    or v_primary.version is distinct from p_expected_primary_version then
    raise exception ''Contact state changed; reload before retrying.'' using errcode=''40001'';
  end if;
  if not exists(select 1 from public.persons where id=v_target.person_id and status=''active'') then
    raise exception ''Contact person must be active.'' using errcode=''23514'';
  end if;
  if v_primary.id is distinct from v_target.id then
    if v_primary.id is not null then
      update public.company_contacts set is_primary=false,updated_by=v_actor where id=v_primary.id;
      perform elara_private.catalog_audit(''admin_company_primary_contact_removed'',''update'',''company_contacts'',v_primary.id,null,
        jsonb_build_object(''is_primary'',true,''version'',v_primary.version),
        jsonb_build_object(''is_primary'',false,''version'',v_primary.version+1),btrim(p_reason));
    end if;
    update public.company_contacts set is_primary=true,updated_by=v_actor where id=v_target.id returning * into v_target;
  end if;
  v_result := jsonb_build_object(''customer_id'',p_customer_id,''company_id'',v_company,
    ''company_contact_id'',v_target.id,''person_id'',v_target.person_id,''status'',v_target.status,
    ''is_primary'',v_target.is_primary,''version'',v_target.version,''previous_primary_contact_id'',v_primary.id);
  perform elara_private.catalog_audit(''admin_company_primary_contact_set'',''update'',''company_contacts'',v_target.id,null,
    jsonb_build_object(''primary_contact_id'',v_primary.id,''version'',p_expected_version),
    jsonb_build_object(''primary_contact_id'',v_target.id,''version'',v_target.version),btrim(p_reason),p_request_id,v_args,v_result);
  return v_result;
end $$;

create function public.admin_update_company_contact(
  p_request_id uuid, p_customer_id uuid, p_company_contact_id uuid,
  p_expected_version bigint, p_patch jsonb, p_reason text
)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  v_actor uuid; v_company uuid; v_person uuid; v_args jsonb; v_result jsonb;
  v_patch jsonb := ''{}''::jsonb; v_key text; v_value jsonb;
  v_old public.company_contacts%rowtype; v_new public.company_contacts%rowtype;
begin
  v_actor := public.require_admin_user();
  if p_customer_id is null or p_company_contact_id is null or coalesce(p_expected_version,0)<1
    or p_patch is null or jsonb_typeof(p_patch)<>''object'' or p_patch=''{}''::jsonb
    or nullif(btrim(p_reason),'''') is null then
    raise exception ''Target, expected version, patch and reason are required.'' using errcode=''22023'';
  end if;
  for v_key,v_value in select key,value from jsonb_each(p_patch) loop
    if v_key not in (''role_label'',''notes'',''status'') or jsonb_typeof(v_value) not in (''string'',''null'') then
      raise exception ''Unsupported contact change.'' using errcode=''22023'';
    end if;
    if v_key=''status'' and (v_value #>> ''{}'') is distinct from ''inactive'' then
      raise exception ''Only contact deactivation is supported.'' using errcode=''22023'';
    end if;
    v_patch := v_patch || jsonb_build_object(v_key,nullif(btrim(v_value #>> ''{}''),''''));
  end loop;
  v_args := jsonb_build_object(''customer_id'',p_customer_id,''contact_id'',p_company_contact_id,
    ''expected_version'',p_expected_version,''patch'',v_patch,''reason'',btrim(p_reason));
  v_result := elara_private.catalog_request(''admin_company_contact_updated'',p_request_id,v_args);
  if v_result is not null then return v_result; end if;
  v_company := elara_private.company_contact_company(p_customer_id);
  select person_id into v_person from public.company_contacts where id=p_company_contact_id and company_id=v_company;
  if not found then raise exception ''Contact link is not available.'' using errcode=''23503''; end if;
  perform id from public.persons where id=v_person for update;
  select * into v_old from public.company_contacts where id=p_company_contact_id and company_id=v_company for update;
  if v_old.version <> p_expected_version then raise exception ''Contact state changed; reload before retrying.'' using errcode=''40001''; end if;
  if v_old.status <> ''active'' then raise exception ''Inactive links cannot be edited or reactivated.'' using errcode=''23514''; end if;
  if not (v_patch ? ''status'') and not exists(select 1 from public.persons where id=v_old.person_id and status=''active'') then
    raise exception ''Contact person must be active.'' using errcode=''23514'';
  end if;
  update public.company_contacts set
    role_label=case when v_patch ? ''role_label'' then v_patch->>''role_label'' else v_old.role_label end,
    notes=case when v_patch ? ''notes'' then v_patch->>''notes'' else v_old.notes end,
    status=case when v_patch ? ''status'' then ''inactive'' else v_old.status end,
    is_primary=case when v_patch ? ''status'' then false else v_old.is_primary end,
    ended_at=case when v_patch ? ''status'' then clock_timestamp() else v_old.ended_at end,
    inactive_by=case when v_patch ? ''status'' then v_actor else v_old.inactive_by end,
    updated_by=v_actor where id=v_old.id returning * into v_new;
  v_result := jsonb_build_object(''customer_id'',p_customer_id,''company_id'',v_company,
    ''company_contact_id'',v_new.id,''person_id'',v_new.person_id,''status'',v_new.status,
    ''is_primary'',v_new.is_primary,''version'',v_new.version,''ended_at'',v_new.ended_at);
  perform elara_private.catalog_audit(''admin_company_contact_updated'',case when v_new.status=''inactive'' then ''status_change'' else ''update'' end,
    ''company_contacts'',v_new.id,null,jsonb_build_object(''status'',v_old.status,''is_primary'',v_old.is_primary,''version'',v_old.version),
    jsonb_build_object(''status'',v_new.status,''is_primary'',v_new.is_primary,''version'',v_new.version,
      ''role_label_changed'',v_new.role_label is distinct from v_old.role_label,''notes_changed'',v_new.notes is distinct from v_old.notes),
    btrim(p_reason),p_request_id,v_args,v_result);
  return v_result;
end $$;

revoke all on function elara_private.company_contact_version(), elara_private.company_contact_company(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text),
  public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text),
  public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_add_company_contact(uuid,uuid,jsonb,boolean,text),
  public.admin_set_company_primary_contact(uuid,uuid,uuid,bigint,uuid,bigint,text),
  public.admin_update_company_contact(uuid,uuid,uuid,bigint,jsonb,text) to authenticated;

commit;
']::text[] from supabase_migrations.schema_migrations where version='20261117005600' and name='0056_admin_company_contacts')),false),'history_count',(select count(*) from supabase_migrations.schema_migrations),'version','20261117005600');
rollback;
