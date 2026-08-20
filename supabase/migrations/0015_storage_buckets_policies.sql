-- Migration 0015: private Storage buckets and Storage RLS policies.
--
-- Business Storage remains private. Metadata lives in domain tables; Storage
-- policies authorize object access by bucket and validated entity path.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'vehicle-documents',
    'vehicle-documents',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'expense-documents',
    'expense-documents',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

alter table storage.objects enable row level security;

create or replace function public.storage_path_has_exact_segments(
  p_name text,
  p_prefix text,
  p_segment_count integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_part text;
begin
  if p_name is null
    or p_prefix is null
    or p_segment_count is null
    or p_segment_count < 1
  then
    return false;
  end if;

  if p_name <> btrim(p_name)
    or p_name = ''
    or p_name like '/%'
    or p_name like '%/'
    or position('//' in p_name) > 0
  then
    return false;
  end if;

  v_parts := string_to_array(p_name, '/');

  if array_length(v_parts, 1) is distinct from p_segment_count then
    return false;
  end if;

  if v_parts[1] is distinct from p_prefix then
    return false;
  end if;

  foreach v_part in array v_parts loop
    if v_part is null or btrim(v_part) = '' or v_part in ('.', '..') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.storage_path_has_exact_segments(text, text, integer) is
  'Validates fixed Storage path shape without authorizing access.';

create or replace function public.storage_path_segment_is_uuid(p_value text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;

comment on function public.storage_path_segment_is_uuid(text) is
  'Checks UUID path segments without casting malformed values.';

create or replace function public.storage_vehicle_document_path_is_valid(
  p_bucket_id text,
  p_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_vehicle_id uuid;
  v_document_id uuid;
begin
  if coalesce(public.rls_is_admin(), false) = false then
    return false;
  end if;

  if p_bucket_id <> 'vehicle-documents'
    or not public.storage_path_has_exact_segments(p_name, 'vehicles', 4)
  then
    return false;
  end if;

  v_parts := string_to_array(p_name, '/');

  if not public.storage_path_segment_is_uuid(v_parts[2])
    or not public.storage_path_segment_is_uuid(v_parts[3])
  then
    return false;
  end if;

  v_vehicle_id := v_parts[2]::uuid;
  v_document_id := v_parts[3]::uuid;

  return exists (
    select 1
    from public.vehicle_documents document
    join public.vehicles vehicle on vehicle.id = document.vehicle_id
    where document.id = v_document_id
      and document.vehicle_id = v_vehicle_id
      and (document.storage_bucket is null or document.storage_bucket = p_bucket_id)
      and (document.storage_path is null or document.storage_path = p_name)
  );
end;
$$;

comment on function public.storage_vehicle_document_path_is_valid(text, text) is
  'Authorizes vehicle document object paths shaped as vehicles/<vehicle_id>/<document_id>/<filename>.';

create or replace function public.storage_expense_document_path_is_valid(
  p_bucket_id text,
  p_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_expense_id uuid;
  v_document_id uuid;
begin
  if coalesce(public.rls_is_admin(), false) = false then
    return false;
  end if;

  if p_bucket_id <> 'expense-documents'
    or not public.storage_path_has_exact_segments(p_name, 'expenses', 4)
  then
    return false;
  end if;

  v_parts := string_to_array(p_name, '/');

  if not public.storage_path_segment_is_uuid(v_parts[2])
    or not public.storage_path_segment_is_uuid(v_parts[3])
  then
    return false;
  end if;

  v_expense_id := v_parts[2]::uuid;
  v_document_id := v_parts[3]::uuid;

  return exists (
    select 1
    from public.expense_documents document
    join public.expenses expense on expense.id = document.expense_id
    where document.id = v_document_id
      and document.expense_id = v_expense_id
      and (document.storage_bucket is null or document.storage_bucket = p_bucket_id)
      and (document.storage_path is null or document.storage_path = p_name)
  );
end;
$$;

comment on function public.storage_expense_document_path_is_valid(text, text) is
  'Authorizes expense document object paths shaped as expenses/<expense_id>/<document_id>/<filename>.';

revoke all on function public.storage_path_has_exact_segments(text, text, integer) from public, anon, authenticated;
revoke all on function public.storage_path_segment_is_uuid(text) from public, anon, authenticated;
revoke all on function public.storage_vehicle_document_path_is_valid(text, text) from public, anon, authenticated;
revoke all on function public.storage_expense_document_path_is_valid(text, text) from public, anon, authenticated;

grant execute on function public.storage_path_has_exact_segments(text, text, integer) to service_role;
grant execute on function public.storage_path_segment_is_uuid(text) to service_role;
grant execute on function public.storage_vehicle_document_path_is_valid(text, text) to authenticated, service_role;
grant execute on function public.storage_expense_document_path_is_valid(text, text) to authenticated, service_role;

drop policy if exists storage_vehicle_documents_select_admin on storage.objects;
create policy storage_vehicle_documents_select_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vehicle-documents'
  and public.rls_is_admin()
  and public.storage_vehicle_document_path_is_valid(bucket_id, name)
);

drop policy if exists storage_vehicle_documents_insert_admin on storage.objects;
create policy storage_vehicle_documents_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-documents'
  and public.rls_is_admin()
  and public.storage_vehicle_document_path_is_valid(bucket_id, name)
);

drop policy if exists storage_vehicle_documents_update_admin on storage.objects;

drop policy if exists storage_vehicle_documents_delete_admin on storage.objects;
create policy storage_vehicle_documents_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-documents'
  and public.rls_is_admin()
  and public.storage_vehicle_document_path_is_valid(bucket_id, name)
);

drop policy if exists storage_expense_documents_select_admin on storage.objects;
create policy storage_expense_documents_select_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-documents'
  and public.rls_is_admin()
  and public.storage_expense_document_path_is_valid(bucket_id, name)
);

drop policy if exists storage_expense_documents_insert_admin on storage.objects;
create policy storage_expense_documents_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-documents'
  and public.rls_is_admin()
  and public.storage_expense_document_path_is_valid(bucket_id, name)
);

drop policy if exists storage_expense_documents_update_admin on storage.objects;

drop policy if exists storage_expense_documents_delete_admin on storage.objects;
create policy storage_expense_documents_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-documents'
  and public.rls_is_admin()
  and public.storage_expense_document_path_is_valid(bucket_id, name)
);

do $$
declare
  v_missing_bucket text[];
  v_public_bucket text[];
  v_wrong_limit text[];
  v_wrong_mime text[];
  v_missing_policy text[];
  v_anon_policy text[];
  v_public_helper_exec text[];
  v_anon_helper_exec text[];
  v_authenticated_unexpected_exec text[];
  v_authenticated_missing_exec text[];
begin
  if to_regclass('storage.buckets') is null then
    raise exception 'Missing storage.buckets table.';
  end if;

  if to_regclass('storage.objects') is null then
    raise exception 'Missing storage.objects table.';
  end if;

  select array_agg(bucket_id order by bucket_id) into v_missing_bucket
  from (values ('vehicle-documents'), ('expense-documents')) as expected(bucket_id)
  where not exists (
    select 1 from storage.buckets b where b.id = expected.bucket_id and b.name = expected.bucket_id
  );

  if v_missing_bucket is not null then
    raise exception 'Missing private Storage buckets: %.', v_missing_bucket;
  end if;

  select array_agg(id order by id) into v_public_bucket
  from storage.buckets
  where id in ('vehicle-documents', 'expense-documents')
    and public = true;

  if v_public_bucket is not null then
    raise exception 'Business Storage buckets must be private: %.', v_public_bucket;
  end if;

  select array_agg(id order by id) into v_wrong_limit
  from storage.buckets
  where id in ('vehicle-documents', 'expense-documents')
    and file_size_limit is distinct from 10485760;

  if v_wrong_limit is not null then
    raise exception 'Unexpected Storage bucket file size limits: %.', v_wrong_limit;
  end if;

  select array_agg(id order by id) into v_wrong_mime
  from storage.buckets
  where id in ('vehicle-documents', 'expense-documents')
    and allowed_mime_types is distinct from array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[];

  if v_wrong_mime is not null then
    raise exception 'Unexpected Storage bucket MIME allow-list: %.', v_wrong_mime;
  end if;

  select array_agg(policy_name order by policy_name) into v_missing_policy
  from (values
    ('storage_vehicle_documents_select_admin'),
    ('storage_vehicle_documents_insert_admin'),
    ('storage_vehicle_documents_delete_admin'),
    ('storage_expense_documents_select_admin'),
    ('storage_expense_documents_insert_admin'),
    ('storage_expense_documents_delete_admin')
  ) as expected(policy_name)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = expected.policy_name
  );

  if v_missing_policy is not null then
    raise exception 'Missing Storage policies: %.', v_missing_policy;
  end if;

  select array_agg(policyname order by policyname) into v_anon_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'storage_vehicle_documents_select_admin',
      'storage_vehicle_documents_insert_admin',
      'storage_vehicle_documents_delete_admin',
      'storage_expense_documents_select_admin',
      'storage_expense_documents_insert_admin',
      'storage_expense_documents_delete_admin'
    )
    and 'anon' = any(roles);

  if v_anon_policy is not null then
    raise exception 'anon must not have Storage policies: %.', v_anon_policy;
  end if;

  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname in ('storage_vehicle_documents_update_admin', 'storage_expense_documents_update_admin')
  ) then
    raise exception 'Storage UPDATE policies must not exist for business document buckets.';
  end if;

  select array_agg(function_name order by function_name) into v_public_helper_exec
  from (values
    ('public.storage_path_has_exact_segments(text,text,integer)'),
    ('public.storage_path_segment_is_uuid(text)'),
    ('public.storage_vehicle_document_path_is_valid(text,text)'),
    ('public.storage_expense_document_path_is_valid(text,text)')
  ) as f(function_name)
  join pg_proc proc on proc.oid = to_regprocedure(f.function_name)
  cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
  where acl.grantee = 0
    and acl.privilege_type = 'EXECUTE';

  if v_public_helper_exec is not null then
    raise exception 'public must not execute Storage helpers: %.', v_public_helper_exec;
  end if;

  select array_agg(function_name order by function_name) into v_authenticated_unexpected_exec
  from (values
    ('public.storage_path_has_exact_segments(text,text,integer)'),
    ('public.storage_path_segment_is_uuid(text)')
  ) as f(function_name)
  where has_function_privilege('authenticated', function_name, 'EXECUTE');

  if v_authenticated_unexpected_exec is not null then
    raise exception 'authenticated must not execute structural Storage helpers: %.', v_authenticated_unexpected_exec;
  end if;

  select array_agg(function_name order by function_name) into v_anon_helper_exec
  from (values
    ('public.storage_path_has_exact_segments(text,text,integer)'),
    ('public.storage_path_segment_is_uuid(text)'),
    ('public.storage_vehicle_document_path_is_valid(text,text)'),
    ('public.storage_expense_document_path_is_valid(text,text)')
  ) as f(function_name)
  where has_function_privilege('anon', function_name, 'EXECUTE');

  if v_anon_helper_exec is not null then
    raise exception 'anon must not execute Storage helpers: %.', v_anon_helper_exec;
  end if;

  select array_agg(function_name order by function_name) into v_authenticated_missing_exec
  from (values
    ('public.storage_vehicle_document_path_is_valid(text,text)'),
    ('public.storage_expense_document_path_is_valid(text,text)')
  ) as f(function_name)
  where not has_function_privilege('authenticated', function_name, 'EXECUTE');

  if v_authenticated_missing_exec is not null then
    raise exception 'authenticated must execute Storage helpers used by policies: %.', v_authenticated_missing_exec;
  end if;

  if public.storage_vehicle_document_path_is_valid('vehicle-documents', 'vehicles/not-a-uuid/not-a-uuid/file.pdf') then
    raise exception 'Malformed vehicle Storage path must return false.';
  end if;

  if public.storage_expense_document_path_is_valid('expense-documents', 'expenses/not-a-uuid/not-a-uuid/file.pdf') then
    raise exception 'Malformed expense Storage path must return false.';
  end if;
end;
$$;
