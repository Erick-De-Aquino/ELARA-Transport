-- ELARA Transport V4.0
-- Migration 0012: incidents, persistent settings, configurable catalogs and audit.
--
-- Creates the transversal governance domain only.
-- No full RLS, Storage, frontend wiring or public domain operation functions are created here.

insert into public.human_code_counters (prefix, current_value, padding, is_active)
values ('INC', 0, 6, true)
on conflict (prefix) do update
set padding = 6,
    is_active = true;

create or replace function public.text_array_has_duplicates(p_values text[])
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select coalesce((
    select count(*) <> count(distinct value)
    from unnest(coalesce(p_values, array[]::text[])) as item(value)
  ), false);
$$;

create or replace function public.text_array_values_allowed(p_values text[], p_allowed text[])
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select not exists (
    select 1
    from unnest(coalesce(p_values, array[]::text[])) as item(value)
    where item.value <> all(coalesce(p_allowed, array[]::text[]))
  );
$$;

create or replace function public.jsonb_has_sensitive_key(p_data jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_sensitive_keys constant text[] := array[
    'password',
    'password_hash',
    'access_token',
    'refresh_token',
    'token',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'session_token'
  ];
  v_item record;
begin
  if p_data is null then
    return false;
  end if;

  if jsonb_typeof(p_data) = 'object' then
    for v_item in select key, value from jsonb_each(p_data)
    loop
      if lower(v_item.key) = any(v_sensitive_keys)
        or public.jsonb_has_sensitive_key(v_item.value)
      then
        return true;
      end if;
    end loop;
    return false;
  elsif jsonb_typeof(p_data) = 'array' then
    for v_item in select value from jsonb_array_elements(p_data)
    loop
      if public.jsonb_has_sensitive_key(v_item.value) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  return false;
end;
$$;

create or replace function public.sanitize_audit_json(p_data jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_sensitive_keys constant text[] := array[
    'password',
    'password_hash',
    'access_token',
    'refresh_token',
    'token',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'session_token'
  ];
  v_result jsonb;
begin
  if p_data is null then
    return null;
  end if;

  if jsonb_typeof(p_data) = 'object' then
    select coalesce(
      jsonb_object_agg(
        entry.key,
        public.sanitize_audit_json(entry.value)
      ),
      '{}'::jsonb
    )
    into v_result
    from jsonb_each(p_data) as entry(key, value)
    where lower(entry.key) <> all(v_sensitive_keys);

    return v_result;
  elsif jsonb_typeof(p_data) = 'array' then
    select coalesce(jsonb_agg(public.sanitize_audit_json(entry.value)), '[]'::jsonb)
    into v_result
    from jsonb_array_elements(p_data) as entry(value);

    return v_result;
  end if;

  return p_data;
end;
$$;

create or replace function public.jsonb_top_level_changed_fields(p_old_data jsonb, p_new_data jsonb)
returns text[]
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_fields text[];
begin
  if p_old_data is null and p_new_data is null then
    return null;
  end if;

  if (p_old_data is not null and jsonb_typeof(p_old_data) <> 'object')
    or (p_new_data is not null and jsonb_typeof(p_new_data) <> 'object')
  then
    return null;
  end if;

  with keys as (
    select jsonb_object_keys(coalesce(p_old_data, '{}'::jsonb)) as key
    union
    select jsonb_object_keys(coalesce(p_new_data, '{}'::jsonb)) as key
  )
  select coalesce(array_agg(key order by key), array[]::text[])
  into v_fields
  from keys
  where (coalesce(p_old_data, '{}'::jsonb) -> key)
    is distinct from (coalesce(p_new_data, '{}'::jsonb) -> key);

  return v_fields;
end;
$$;

create or replace function public.jsonb_matches_value_type(p_value jsonb, p_value_type text)
returns boolean
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  if p_value is null or p_value_type is null then
    return false;
  end if;

  case p_value_type
    when 'string' then
      return jsonb_typeof(p_value) = 'string';
    when 'number' then
      return jsonb_typeof(p_value) = 'number';
    when 'boolean' then
      return jsonb_typeof(p_value) = 'boolean';
    when 'json' then
      return jsonb_typeof(p_value) in ('object', 'array');
    when 'date' then
      return jsonb_typeof(p_value) = 'string'
        and trim(both '"' from p_value::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
    when 'datetime' then
      return jsonb_typeof(p_value) = 'string'
        and trim(both '"' from p_value::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';
    else
      return false;
  end case;
end;
$$;

create table if not exists public.incident_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null,
  name_es text not null,
  description text,
  default_severity text not null default 'medium',
  applies_to text[] not null default '{}'::text[],
  requires_resolution boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint incident_categories_key_unique unique (key),
  constraint incident_categories_key_format check (key = lower(trim(key)) and key ~ '^[a-z][a-z0-9_]*$'),
  constraint incident_categories_name_es_not_empty check (length(trim(name_es)) > 0),
  constraint incident_categories_severity_check check (default_severity in ('low', 'medium', 'high', 'critical')),
  constraint incident_categories_sort_order_non_negative check (sort_order >= 0),
  constraint incident_categories_applies_to_allowed check (
    public.text_array_values_allowed(
      applies_to,
      array['service', 'driver', 'vehicle', 'customer', 'user', 'payment', 'cash', 'receivable', 'expense', 'settlement', 'system', 'other']
    )
  ),
  constraint incident_categories_applies_to_unique check (not public.text_array_has_duplicates(applies_to))
);

comment on table public.incident_categories is
  'Configurable incident categories. They do not replace critical database checks.';

create index if not exists incident_categories_active_sort_idx
  on public.incident_categories (is_active, sort_order, key);

create table if not exists public.incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  human_code text not null,
  category_id uuid not null references public.incident_categories(id) on delete restrict,
  title text not null,
  description text,
  severity text not null,
  status text not null default 'open',
  source text not null default 'administration',
  service_id uuid references public.services(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  app_user_id uuid references public.app_users(id) on delete restrict,
  service_payment_id uuid references public.service_payments(id) on delete restrict,
  cash_movement_id uuid references public.cash_movements(id) on delete restrict,
  receivable_id uuid references public.receivables(id) on delete restrict,
  expense_id uuid references public.expenses(id) on delete restrict,
  settlement_id uuid references public.settlements(id) on delete restrict,
  reported_at timestamptz not null default now(),
  reported_by_user_id uuid references public.app_users(id) on delete restrict,
  reported_by_driver_id uuid references public.drivers(id) on delete restrict,
  assigned_to_user_id uuid references public.app_users(id) on delete restrict,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.app_users(id) on delete restrict,
  resolved_at timestamptz,
  resolved_by uuid references public.app_users(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete restrict,
  resolution_summary text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint incidents_human_code_unique unique (human_code),
  constraint incidents_human_code_format check (human_code ~ '^INC-[0-9]{6}$'),
  constraint incidents_title_not_empty check (length(trim(title)) > 0),
  constraint incidents_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint incidents_status_check check (status in ('open', 'acknowledged', 'investigating', 'resolved', 'cancelled')),
  constraint incidents_source_check check (source in ('administration', 'driver_portal', 'customer', 'system', 'audit', 'other')),
  constraint incidents_one_reporter check (
    reported_by_user_id is null
    or reported_by_driver_id is null
  ),
  constraint incidents_acknowledged_fields check (status <> 'acknowledged' or (acknowledged_at is not null and acknowledged_by is not null)),
  constraint incidents_resolved_fields check (status <> 'resolved' or (resolved_at is not null and resolved_by is not null)),
  constraint incidents_cancelled_fields check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by is not null))
);

comment on table public.incidents is
  'Operational, administrative, financial and system incidents. Current status lives here.';

create index if not exists incidents_status_reported_idx
  on public.incidents (status, reported_at);
create index if not exists incidents_service_idx
  on public.incidents (service_id)
  where service_id is not null;
create index if not exists incidents_driver_idx
  on public.incidents (driver_id)
  where driver_id is not null;
create index if not exists incidents_vehicle_idx
  on public.incidents (vehicle_id)
  where vehicle_id is not null;
create index if not exists incidents_customer_idx
  on public.incidents (customer_id)
  where customer_id is not null;

create table if not exists public.incident_events (
  id uuid primary key default extensions.gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  from_status text,
  to_status text,
  actor_user_id uuid references public.app_users(id) on delete restrict,
  actor_driver_id uuid references public.drivers(id) on delete restrict,
  title text,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now(),

  constraint incident_events_type_check check (event_type in (
    'incident_created',
    'status_changed',
    'assignment_changed',
    'severity_changed',
    'relation_added',
    'relation_removed',
    'comment_added',
    'incident_resolved',
    'incident_cancelled',
    'system_event',
    'other'
  )),
  constraint incident_events_status_values check (
    (from_status is null or from_status in ('open', 'acknowledged', 'investigating', 'resolved', 'cancelled'))
    and (to_status is null or to_status in ('open', 'acknowledged', 'investigating', 'resolved', 'cancelled'))
  ),
  constraint incident_events_status_changed_fields check (
    event_type <> 'status_changed'
    or (from_status is distinct from to_status and to_status is not null)
  ),
  constraint incident_events_one_actor check (actor_user_id is null or actor_driver_id is null),
  constraint incident_events_metadata_object check (metadata is null or jsonb_typeof(metadata) = 'object')
);

comment on table public.incident_events is
  'Append-only incident event stream.';

create index if not exists incident_events_incident_occurred_idx
  on public.incident_events (incident_id, occurred_at);

create table if not exists public.incident_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  comment_type text not null default 'internal',
  content text not null,
  author_user_id uuid references public.app_users(id) on delete restrict,
  author_driver_id uuid references public.drivers(id) on delete restrict,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),

  constraint incident_comments_type_check check (comment_type in ('internal', 'driver', 'customer_contact', 'resolution', 'system', 'other')),
  constraint incident_comments_content_not_empty check (length(trim(content)) > 0),
  constraint incident_comments_one_author check (author_user_id is null or author_driver_id is null)
);

comment on table public.incident_comments is
  'Append-only incident comments. Comment content is not copied into audit metadata.';

create index if not exists incident_comments_incident_created_idx
  on public.incident_comments (incident_id, created_at);

create table if not exists public.app_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  setting_key text not null,
  setting_scope text not null default 'global',
  scope_reference_id uuid,
  value_type text not null,
  value_json jsonb not null,
  description text,
  is_sensitive boolean not null default false,
  is_editable boolean not null default true,
  version integer not null default 1,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint app_settings_key_format check (setting_key = lower(trim(setting_key)) and setting_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  constraint app_settings_scope_check check (setting_scope in ('global', 'user', 'driver', 'vehicle', 'customer', 'service', 'finance', 'operations', 'system')),
  constraint app_settings_value_type_check check (value_type in ('string', 'number', 'boolean', 'json', 'date', 'datetime')),
  constraint app_settings_version_positive check (version > 0),
  constraint app_settings_effective_range check (effective_until is null or effective_until > effective_from),
  constraint app_settings_scope_reference_rule check (
    (setting_scope in ('global', 'finance', 'operations', 'system') and scope_reference_id is null)
    or (setting_scope in ('user', 'driver', 'vehicle', 'customer', 'service') and scope_reference_id is not null)
  ),
  constraint app_settings_value_matches_type check (public.jsonb_matches_value_type(value_json, value_type)),
  constraint app_settings_no_sensitive_keys check (not public.jsonb_has_sensitive_key(value_json))
);

comment on table public.app_settings is
  'Persistent ELARA application settings. Secrets, credentials and tokens must not be stored here.';

create unique index if not exists app_settings_one_active_scope_idx
  on public.app_settings (setting_key, setting_scope, coalesce(scope_reference_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active = true;

create index if not exists app_settings_scope_lookup_idx
  on public.app_settings (setting_scope, setting_key, is_active);

create table if not exists public.app_setting_history (
  id uuid primary key default extensions.gen_random_uuid(),
  app_setting_id uuid not null references public.app_settings(id) on delete restrict,
  version integer not null,
  old_value_json jsonb,
  new_value_json jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid references public.app_users(id) on delete restrict,
  change_reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),

  constraint app_setting_history_setting_version_unique unique (app_setting_id, version),
  constraint app_setting_history_version_positive check (version > 0),
  constraint app_setting_history_old_object_or_scalar check (old_value_json is null or jsonb_typeof(old_value_json) in ('object', 'array', 'string', 'number', 'boolean')),
  constraint app_setting_history_new_object_or_scalar check (jsonb_typeof(new_value_json) in ('object', 'array', 'string', 'number', 'boolean')),
  constraint app_setting_history_metadata_object check (metadata is null or jsonb_typeof(metadata) = 'object'),
  constraint app_setting_history_no_sensitive_metadata check (not public.jsonb_has_sensitive_key(coalesce(metadata, '{}'::jsonb)))
);

comment on table public.app_setting_history is
  'Append-only setting value history. Initial NULL -> value rows are recorded deliberately.';

create index if not exists app_setting_history_setting_changed_idx
  on public.app_setting_history (app_setting_id, changed_at);

create table if not exists public.configurable_catalogs (
  id uuid primary key default extensions.gen_random_uuid(),
  catalog_key text not null,
  name_es text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  allow_custom_items boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint configurable_catalogs_key_unique unique (catalog_key),
  constraint configurable_catalogs_key_format check (catalog_key = lower(trim(catalog_key)) and catalog_key ~ '^[a-z][a-z0-9_]*$'),
  constraint configurable_catalogs_name_es_not_empty check (length(trim(name_es)) > 0)
);

comment on table public.configurable_catalogs is
  'Configurable catalogs for labels and reason codes. They do not replace critical checks.';

create table if not exists public.configurable_catalog_items (
  id uuid primary key default extensions.gen_random_uuid(),
  catalog_id uuid not null references public.configurable_catalogs(id) on delete restrict,
  item_key text not null,
  label_es text not null,
  description text,
  sort_order integer not null default 0,
  metadata jsonb,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete restrict,

  constraint configurable_catalog_items_key_unique unique (catalog_id, item_key),
  constraint configurable_catalog_items_key_format check (item_key = lower(trim(item_key)) and item_key ~ '^[a-z][a-z0-9_]*$'),
  constraint configurable_catalog_items_label_es_not_empty check (length(trim(label_es)) > 0),
  constraint configurable_catalog_items_sort_order_non_negative check (sort_order >= 0),
  constraint configurable_catalog_items_metadata_object check (metadata is null or jsonb_typeof(metadata) = 'object')
);

comment on table public.configurable_catalog_items is
  'Configurable catalog items. System items are inactivated, not deleted.';

create index if not exists configurable_catalog_items_catalog_sort_idx
  on public.configurable_catalog_items (catalog_id, is_active, sort_order, item_key);

create table if not exists public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_source text not null,
  action text not null,
  entity_schema text not null default 'public',
  entity_table text not null,
  entity_id uuid,
  entity_human_code text,
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  actor_app_user_id uuid references public.app_users(id) on delete restrict,
  actor_driver_id uuid references public.drivers(id) on delete restrict,
  auth_session_id uuid,
  active_context text,
  request_id uuid,
  transaction_id bigint,
  client_ip inet,
  user_agent text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),

  constraint audit_logs_event_source_check check (event_source in ('database_trigger', 'secure_function', 'administration', 'driver_portal', 'system', 'migration', 'other')),
  constraint audit_logs_action_check check (action in ('insert', 'update', 'delete_attempt', 'status_change', 'login_context_change', 'permission_change', 'configuration_change', 'payment', 'cancellation', 'reversal', 'export', 'other')),
  constraint audit_logs_entity_schema_not_empty check (length(trim(entity_schema)) > 0),
  constraint audit_logs_entity_table_not_empty check (length(trim(entity_table)) > 0),
  constraint audit_logs_json_objects check (
    (old_data is null or jsonb_typeof(old_data) = 'object')
    and (new_data is null or jsonb_typeof(new_data) = 'object')
    and (metadata is null or jsonb_typeof(metadata) = 'object')
  ),
  constraint audit_logs_changed_fields_unique check (not public.text_array_has_duplicates(changed_fields)),
  constraint audit_logs_active_context_check check (active_context is null or active_context in ('superadmin', 'administrativo', 'conductor')),
  constraint audit_logs_no_sensitive_payload check (
    not public.jsonb_has_sensitive_key(coalesce(old_data, '{}'::jsonb))
    and not public.jsonb_has_sensitive_key(coalesce(new_data, '{}'::jsonb))
    and not public.jsonb_has_sensitive_key(coalesce(metadata, '{}'::jsonb))
  )
);

comment on table public.audit_logs is
  'Global append-only functional audit. auth_session_id is stored without FK because auth.sessions stability is not guaranteed.';

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_schema, entity_table, entity_id, occurred_at);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_app_user_id, occurred_at)
  where actor_app_user_id is not null;

create or replace function public.app_user_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.app_users app_user
      where app_user.id = p_user_id
        and app_user.status = 'active'
    );
$$;

create or replace function public.driver_is_active(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_driver_id is not null
    and exists (
      select 1
      from public.drivers driver
      where driver.id = p_driver_id
        and driver.administrative_status = 'active'
    );
$$;

create or replace function public.incident_category_accepts_relations(
  p_category_id uuid,
  p_service_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_app_user_id uuid,
  p_service_payment_id uuid,
  p_cash_movement_id uuid,
  p_receivable_id uuid,
  p_expense_id uuid,
  p_settlement_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category public.incident_categories%rowtype;
  v_has_reference boolean;
  v_has_matching_reference boolean;
begin
  select * into v_category
  from public.incident_categories category
  where category.id = p_category_id;

  if not found then
    return false;
  end if;

  if v_category.key = 'other' then
    return true;
  end if;

  v_has_reference :=
    p_service_id is not null
    or p_driver_id is not null
    or p_vehicle_id is not null
    or p_customer_id is not null
    or p_app_user_id is not null
    or p_service_payment_id is not null
    or p_cash_movement_id is not null
    or p_receivable_id is not null
    or p_expense_id is not null
    or p_settlement_id is not null;

  if not v_has_reference then
    return cardinality(v_category.applies_to) = 0
      or 'system' = any(v_category.applies_to);
  end if;

  if p_service_id is not null and 'service' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_driver_id is not null and 'driver' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_vehicle_id is not null and 'vehicle' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_customer_id is not null and 'customer' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_app_user_id is not null and 'user' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_service_payment_id is not null and 'payment' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_cash_movement_id is not null and 'cash' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_receivable_id is not null and 'receivable' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_expense_id is not null and 'expense' <> all(v_category.applies_to) then
    return false;
  end if;
  if p_settlement_id is not null and 'settlement' <> all(v_category.applies_to) then
    return false;
  end if;

  v_has_matching_reference :=
    (p_service_id is not null and 'service' = any(v_category.applies_to))
    or (p_driver_id is not null and 'driver' = any(v_category.applies_to))
    or (p_vehicle_id is not null and 'vehicle' = any(v_category.applies_to))
    or (p_customer_id is not null and 'customer' = any(v_category.applies_to))
    or (p_app_user_id is not null and 'user' = any(v_category.applies_to))
    or (p_service_payment_id is not null and 'payment' = any(v_category.applies_to))
    or (p_cash_movement_id is not null and 'cash' = any(v_category.applies_to))
    or (p_receivable_id is not null and 'receivable' = any(v_category.applies_to))
    or (p_expense_id is not null and 'expense' = any(v_category.applies_to))
    or (p_settlement_id is not null and 'settlement' = any(v_category.applies_to));

  return v_has_matching_reference;
end;
$$;

create or replace function public.assign_incident_human_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.human_code is null or length(trim(new.human_code)) = 0 then
      new.human_code := public.next_human_code('INC');
    else
      new.human_code := upper(trim(new.human_code));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.human_code is distinct from old.human_code then
      raise exception 'Incident human_code cannot be changed after creation.'
        using errcode = '23514';
    end if;
  end if;

  if new.human_code !~ '^INC-[0-9]{6}$' then
    raise exception 'Invalid incident human_code "%".', new.human_code
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prepare_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.incident_categories%rowtype;
  v_resolution_required boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Incidents cannot be physically deleted.'
      using errcode = '23514';
  end if;

  new.title := trim(new.title);
  new.severity := lower(trim(coalesce(new.severity, '')));
  new.status := lower(trim(coalesce(new.status, 'open')));
  new.source := lower(trim(coalesce(new.source, 'administration')));

  select * into v_category
  from public.incident_categories category
  where category.id = new.category_id;

  if not found then
    raise exception 'Incident category does not exist.'
      using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    if not v_category.is_active then
      raise exception 'Inactive incident categories cannot be assigned to new incidents.'
        using errcode = '23514';
    end if;
    if new.status <> 'open' then
      raise exception 'Incidents must be created in open status.'
        using errcode = '23514';
    end if;
    if new.severity = '' then
      new.severity := v_category.default_severity;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status in ('resolved', 'cancelled') then
      raise exception 'Final incidents cannot be updated after resolution or cancellation.'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'open' and new.status in ('acknowledged', 'investigating', 'resolved', 'cancelled'))
      or (old.status = 'acknowledged' and new.status in ('investigating', 'resolved', 'cancelled'))
      or (old.status = 'investigating' and new.status in ('resolved', 'cancelled'))
    ) then
      raise exception 'Invalid incident status transition from % to %.', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if new.assigned_to_user_id is not null and not public.app_user_is_active(new.assigned_to_user_id) then
    raise exception 'Incident assigned_to_user_id must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.reported_by_user_id is not null and not public.app_user_is_active(new.reported_by_user_id) then
    raise exception 'Incident reported_by_user_id must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.acknowledged_by is not null and not public.app_user_is_active(new.acknowledged_by) then
    raise exception 'Incident acknowledged_by must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.resolved_by is not null and not public.app_user_is_active(new.resolved_by) then
    raise exception 'Incident resolved_by must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.cancelled_by is not null and not public.app_user_is_active(new.cancelled_by) then
    raise exception 'Incident cancelled_by must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.reported_by_driver_id is not null and not public.driver_is_active(new.reported_by_driver_id) then
    raise exception 'Incident reported_by_driver_id must reference an active driver.'
      using errcode = '23514';
  end if;

  if not public.incident_category_accepts_relations(
    new.category_id,
    new.service_id,
    new.driver_id,
    new.vehicle_id,
    new.customer_id,
    new.app_user_id,
    new.service_payment_id,
    new.cash_movement_id,
    new.receivable_id,
    new.expense_id,
    new.settlement_id
  ) then
    raise exception 'Incident references are not compatible with the selected category.'
      using errcode = '23514';
  end if;

  v_resolution_required := v_category.requires_resolution;
  if new.status = 'resolved'
    and v_resolution_required
    and length(trim(coalesce(new.resolution_summary, ''))) = 0
  then
    raise exception 'Resolved incidents require a resolution summary for this category.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.record_incident_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user uuid;
  v_actor_driver uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.incident_events (
      incident_id,
      event_type,
      to_status,
      actor_user_id,
      actor_driver_id,
      title,
      metadata
    ) values (
      new.id,
      'incident_created',
      new.status,
      coalesce(new.reported_by_user_id, new.created_by),
      new.reported_by_driver_id,
      'Incident created',
      jsonb_build_object('human_code', new.human_code, 'severity', new.severity)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    v_actor_user := coalesce(new.updated_by, new.acknowledged_by, new.resolved_by, new.cancelled_by);
    v_actor_driver := null;

    if new.status is distinct from old.status then
      insert into public.incident_events (
        incident_id,
        event_type,
        from_status,
        to_status,
        actor_user_id,
        title,
        metadata
      ) values (
        new.id,
        case
          when new.status = 'resolved' then 'incident_resolved'
          when new.status = 'cancelled' then 'incident_cancelled'
          else 'status_changed'
        end,
        old.status,
        new.status,
        v_actor_user,
        'Incident status changed',
        jsonb_build_object('human_code', new.human_code)
      );
    end if;

    if new.severity is distinct from old.severity then
      insert into public.incident_events (
        incident_id,
        event_type,
        actor_user_id,
        title,
        metadata
      ) values (
        new.id,
        'severity_changed',
        v_actor_user,
        'Incident severity changed',
        jsonb_build_object('from', old.severity, 'to', new.severity)
      );
    end if;

    if new.assigned_to_user_id is distinct from old.assigned_to_user_id then
      insert into public.incident_events (
        incident_id,
        event_type,
        actor_user_id,
        title,
        metadata
      ) values (
        new.id,
        'assignment_changed',
        v_actor_user,
        'Incident assignment changed',
        jsonb_build_object('from_user_id', old.assigned_to_user_id, 'to_user_id', new.assigned_to_user_id)
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_incident_event_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Incident events are append-only.'
    using errcode = '23514';
end;
$$;

create or replace function public.prepare_incident_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.incidents%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Incident comments are append-only.'
      using errcode = '23514';
  elsif tg_op = 'UPDATE' then
    raise exception 'Incident comments are append-only.'
      using errcode = '23514';
  end if;

  new.content := trim(new.content);

  select * into v_incident
  from public.incidents incident
  where incident.id = new.incident_id;

  if not found then
    raise exception 'Incident comment references a missing incident.'
      using errcode = '23503';
  end if;

  if v_incident.status = 'cancelled' and new.comment_type not in ('resolution', 'system') then
    raise exception 'Normal comments cannot be added to cancelled incidents.'
      using errcode = '23514';
  end if;

  if new.author_user_id is not null and not public.app_user_is_active(new.author_user_id) then
    raise exception 'Incident comment author_user_id must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.author_driver_id is not null and not public.driver_is_active(new.author_driver_id) then
    raise exception 'Incident comment author_driver_id must reference an active driver.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.record_incident_comment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.incident_events (
    incident_id,
    event_type,
    actor_user_id,
    actor_driver_id,
    title,
    metadata
  ) values (
    new.incident_id,
    'comment_added',
    new.author_user_id,
    new.author_driver_id,
    'Incident comment added',
    jsonb_build_object('comment_id', new.id, 'comment_type', new.comment_type, 'is_private', new.is_private)
  );

  return new;
end;
$$;

create or replace function public.prevent_incident_category_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.incidents incident where incident.category_id = old.id) then
    raise exception 'Incident categories used by incidents cannot be physically deleted.'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

create or replace function public.prepare_app_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'App settings cannot be physically deleted; set is_active = false instead.'
      using errcode = '23514';
  end if;

  new.setting_key := lower(trim(new.setting_key));
  new.setting_scope := lower(trim(new.setting_scope));
  new.value_type := lower(trim(new.value_type));
  new.value_json := public.sanitize_audit_json(new.value_json);

  if public.jsonb_has_sensitive_key(new.value_json) then
    raise exception 'App settings cannot store secret-like keys.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    if new.version <> 1 then
      raise exception 'New app settings must start at version 1.'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.value_json is distinct from old.value_json then
      new.version := old.version + 1;
    elsif new.version is distinct from old.version then
      raise exception 'App setting version is managed by the database.'
        using errcode = '23514';
    end if;
  end if;

  if new.updated_by is not null and not public.app_user_is_active(new.updated_by) then
    raise exception 'App setting updated_by must reference an active app user.'
      using errcode = '23514';
  end if;

  if new.created_by is not null and not public.app_user_is_active(new.created_by) then
    raise exception 'App setting created_by must reference an active app user.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_app_setting_history_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'App setting history is append-only.'
    using errcode = '23514';
end;
$$;

create or replace function public.prepare_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system or exists (select 1 from public.configurable_catalog_items item where item.catalog_id = old.id) then
      raise exception 'System catalogs or catalogs with items cannot be physically deleted.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  new.catalog_key := lower(trim(new.catalog_key));
  new.name_es := trim(new.name_es);
  return new;
end;
$$;

create or replace function public.prepare_catalog_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'System catalog items cannot be physically deleted; set is_active = false instead.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  new.item_key := lower(trim(new.item_key));
  new.label_es := trim(new.label_es);
  return new;
end;
$$;

create or replace function public.prepare_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_sensitive_keys constant text[] := array[
    'password',
    'password_hash',
    'access_token',
    'refresh_token',
    'token',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'session_token'
  ];
begin
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    raise exception 'Audit logs are append-only.'
      using errcode = '23514';
  end if;

  new.event_source := lower(trim(new.event_source));
  new.action := lower(trim(new.action));
  new.entity_schema := lower(trim(coalesce(new.entity_schema, 'public')));
  new.entity_table := lower(trim(new.entity_table));
  new.old_data := public.sanitize_audit_json(new.old_data);
  new.new_data := public.sanitize_audit_json(new.new_data);
  new.metadata := public.sanitize_audit_json(new.metadata);
  new.transaction_id := coalesce(new.transaction_id, txid_current());

  if new.changed_fields is null then
    new.changed_fields := public.jsonb_top_level_changed_fields(new.old_data, new.new_data);
  end if;

  if new.changed_fields is not null then
    select coalesce(array_agg(distinct field order by field), array[]::text[])
    into new.changed_fields
    from unnest(new.changed_fields) as changed(field)
    where lower(changed.field) <> all(v_sensitive_keys);
  end if;

  v_auth_user_id := new.actor_auth_user_id;
  if v_auth_user_id is not null and new.actor_app_user_id is not null then
    if not exists (
      select 1
      from public.app_users app_user
      where app_user.id = new.actor_app_user_id
        and app_user.auth_user_id = v_auth_user_id
    ) then
      raise exception 'Audit actor_app_user_id does not match actor_auth_user_id.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.write_audit_log(
  p_event_source text,
  p_action text,
  p_entity_table text,
  p_entity_id uuid default null,
  p_entity_human_code text default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_reason text default null,
  p_metadata jsonb default null,
  p_actor_app_user_id uuid default null,
  p_actor_driver_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_auth_user_id uuid;
  v_session_id uuid;
  v_actor_app_user_id uuid;
  v_active_context text;
begin
  v_auth_user_id := auth.uid();
  v_session_id := public.current_auth_session_id();
  v_actor_app_user_id := coalesce(p_actor_app_user_id, public.current_app_user_id());

  if v_auth_user_id is not null and v_actor_app_user_id is not null then
    if not exists (
      select 1
      from public.app_users app_user
      where app_user.id = v_actor_app_user_id
        and app_user.auth_user_id = v_auth_user_id
        and app_user.status = 'active'
    ) then
      raise exception 'Provided audit actor contradicts the authenticated session.'
        using errcode = '23514';
    end if;
  end if;

  if v_auth_user_id is not null and v_session_id is not null then
    select session.active_context
    into v_active_context
    from public.app_sessions session
    where session.auth_user_id = v_auth_user_id
      and session.supabase_session_id = v_session_id
      and session.ended_at is null
      and session.expires_at > now()
    limit 1;
  end if;

  insert into public.audit_logs (
    event_source,
    action,
    entity_table,
    entity_id,
    entity_human_code,
    actor_auth_user_id,
    actor_app_user_id,
    actor_driver_id,
    auth_session_id,
    active_context,
    transaction_id,
    old_data,
    new_data,
    changed_fields,
    reason,
    metadata
  ) values (
    lower(trim(p_event_source)),
    lower(trim(p_action)),
    lower(trim(p_entity_table)),
    p_entity_id,
    p_entity_human_code,
    v_auth_user_id,
    v_actor_app_user_id,
    p_actor_driver_id,
    v_session_id,
    v_active_context,
    txid_current(),
    public.sanitize_audit_json(p_old_data),
    public.sanitize_audit_json(p_new_data),
    public.jsonb_top_level_changed_fields(public.sanitize_audit_json(p_old_data), public.sanitize_audit_json(p_new_data)),
    p_reason,
    public.sanitize_audit_json(p_metadata)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_app_setting_history_and_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.app_setting_history (
      app_setting_id,
      version,
      old_value_json,
      new_value_json,
      changed_by_user_id,
      metadata
    ) values (
      new.id,
      new.version,
      null,
      new.value_json,
      coalesce(new.updated_by, new.created_by),
      jsonb_build_object('initial', true)
    )
    on conflict (app_setting_id, version) do nothing;

    perform public.write_audit_log(
      'database_trigger',
      'configuration_change',
      'app_settings',
      new.id,
      new.setting_key,
      null,
      to_jsonb(new),
      'Initial app setting value recorded.',
      jsonb_build_object('setting_scope', new.setting_scope),
      coalesce(new.updated_by, new.created_by),
      null
    );
  elsif tg_op = 'UPDATE' then
    if new.value_json is distinct from old.value_json then
      insert into public.app_setting_history (
        app_setting_id,
        version,
        old_value_json,
        new_value_json,
        changed_by_user_id,
        metadata
      ) values (
        new.id,
        new.version,
        old.value_json,
        new.value_json,
        new.updated_by,
        jsonb_build_object('setting_scope', new.setting_scope)
      );

      perform public.write_audit_log(
        'database_trigger',
        'configuration_change',
        'app_settings',
        new.id,
        new.setting_key,
        to_jsonb(old),
        to_jsonb(new),
        null,
        jsonb_build_object('setting_scope', new.setting_scope),
        new.updated_by,
        null
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.audit_user_roles_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'database_trigger',
      'permission_change',
      'user_roles',
      new.id,
      null,
      null,
      to_jsonb(new),
      new.reason,
      jsonb_build_object('role_key', new.role_key, 'operation', 'insert'),
      new.assigned_by,
      null
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if new.role_key is distinct from old.role_key
      or new.status is distinct from old.status
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.revoked_at is distinct from old.revoked_at
      or new.revoked_by is distinct from old.revoked_by
    then
      perform public.write_audit_log(
        'database_trigger',
        'permission_change',
        'user_roles',
        new.id,
        null,
        to_jsonb(old),
        to_jsonb(new),
        new.reason,
        jsonb_build_object('role_key', new.role_key, 'operation', 'update'),
        coalesce(new.revoked_by, new.assigned_by),
        null
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log(
      'database_trigger',
      'permission_change',
      'user_roles',
      old.id,
      null,
      to_jsonb(old),
      null,
      old.reason,
      jsonb_build_object('role_key', old.role_key, 'operation', 'delete_attempt_or_delete'),
      old.revoked_by,
      null
    );
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.audit_app_session_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'database_trigger',
      'login_context_change',
      'app_sessions',
      new.id,
      null,
      null,
      jsonb_build_object('active_context', new.active_context, 'auth_user_id', new.auth_user_id, 'app_user_id', new.app_user_id),
      'Initial session active context recorded.',
      jsonb_build_object('operation', 'insert'),
      new.app_user_id,
      null
    );
  elsif tg_op = 'UPDATE' and new.active_context is distinct from old.active_context then
    perform public.write_audit_log(
      'database_trigger',
      'login_context_change',
      'app_sessions',
      new.id,
      null,
      jsonb_build_object('active_context', old.active_context),
      jsonb_build_object('active_context', new.active_context),
      'Session active context changed.',
      jsonb_build_object('operation', 'update'),
      new.app_user_id,
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists set_incident_categories_updated_at on public.incident_categories;
create trigger set_incident_categories_updated_at
before update on public.incident_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_incidents_updated_at on public.incidents;
create trigger set_incidents_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_configurable_catalogs_updated_at on public.configurable_catalogs;
create trigger set_configurable_catalogs_updated_at
before update on public.configurable_catalogs
for each row execute function public.set_updated_at();

drop trigger if exists set_configurable_catalog_items_updated_at on public.configurable_catalog_items;
create trigger set_configurable_catalog_items_updated_at
before update on public.configurable_catalog_items
for each row execute function public.set_updated_at();

drop trigger if exists prevent_incident_category_delete_trigger on public.incident_categories;
create trigger prevent_incident_category_delete_trigger
before delete on public.incident_categories
for each row execute function public.prevent_incident_category_delete();

drop trigger if exists assign_incident_human_code_trigger on public.incidents;
create trigger assign_incident_human_code_trigger
before insert or update of human_code on public.incidents
for each row execute function public.assign_incident_human_code();

drop trigger if exists prepare_incident_trigger on public.incidents;
create trigger prepare_incident_trigger
before insert or update or delete on public.incidents
for each row execute function public.prepare_incident();

drop trigger if exists record_incident_events_trigger on public.incidents;
create trigger record_incident_events_trigger
after insert or update on public.incidents
for each row execute function public.record_incident_events();

drop trigger if exists prevent_incident_event_changes_trigger on public.incident_events;
create trigger prevent_incident_event_changes_trigger
before update or delete on public.incident_events
for each row execute function public.prevent_incident_event_changes();

drop trigger if exists prepare_incident_comment_trigger on public.incident_comments;
create trigger prepare_incident_comment_trigger
before insert or update or delete on public.incident_comments
for each row execute function public.prepare_incident_comment();

drop trigger if exists record_incident_comment_event_trigger on public.incident_comments;
create trigger record_incident_comment_event_trigger
after insert on public.incident_comments
for each row execute function public.record_incident_comment_event();

drop trigger if exists prepare_app_setting_trigger on public.app_settings;
create trigger prepare_app_setting_trigger
before insert or update or delete on public.app_settings
for each row execute function public.prepare_app_setting();

drop trigger if exists record_app_setting_history_and_audit_trigger on public.app_settings;
create trigger record_app_setting_history_and_audit_trigger
after insert or update on public.app_settings
for each row execute function public.record_app_setting_history_and_audit();

drop trigger if exists prevent_app_setting_history_changes_trigger on public.app_setting_history;
create trigger prevent_app_setting_history_changes_trigger
before update or delete on public.app_setting_history
for each row execute function public.prevent_app_setting_history_changes();

drop trigger if exists prepare_catalog_trigger on public.configurable_catalogs;
create trigger prepare_catalog_trigger
before insert or update or delete on public.configurable_catalogs
for each row execute function public.prepare_catalog();

drop trigger if exists prepare_catalog_item_trigger on public.configurable_catalog_items;
create trigger prepare_catalog_item_trigger
before insert or update or delete on public.configurable_catalog_items
for each row execute function public.prepare_catalog_item();

drop trigger if exists prepare_audit_log_trigger on public.audit_logs;
create trigger prepare_audit_log_trigger
before insert or update or delete on public.audit_logs
for each row execute function public.prepare_audit_log();

drop trigger if exists audit_user_roles_change_trigger on public.user_roles;
create trigger audit_user_roles_change_trigger
after insert or update or delete on public.user_roles
for each row execute function public.audit_user_roles_change();

drop trigger if exists audit_app_session_context_change_trigger on public.app_sessions;
create trigger audit_app_session_context_change_trigger
after insert or update of active_context on public.app_sessions
for each row execute function public.audit_app_session_context_change();

insert into public.incident_categories (
  key,
  name_es,
  default_severity,
  applies_to,
  requires_resolution,
  sort_order
)
select seed.key, seed.name_es, seed.default_severity, seed.applies_to, seed.requires_resolution, seed.sort_order
from (
  values
    ('service_delay', 'Retraso del servicio', 'medium', array['service', 'driver', 'vehicle', 'customer']::text[], true, 10),
    ('passenger_no_show', 'Pasajero no presentado', 'medium', array['service', 'customer']::text[], true, 20),
    ('driver_no_show', 'Conductor no presentado', 'medium', array['service', 'driver']::text[], true, 30),
    ('vehicle_breakdown', 'Avería del vehículo', 'high', array['service', 'vehicle', 'driver']::text[], true, 40),
    ('documentation_issue', 'Incidencia documental', 'medium', array['vehicle', 'driver', 'system']::text[], true, 50),
    ('payment_issue', 'Incidencia de pago', 'medium', array['payment', 'receivable', 'expense', 'settlement', 'customer']::text[], true, 60),
    ('cash_difference', 'Diferencia de Caja', 'high', array['cash', 'user']::text[], true, 70),
    ('customer_complaint', 'Reclamación del cliente', 'medium', array['customer', 'service', 'driver', 'vehicle']::text[], true, 80),
    ('safety_issue', 'Incidencia de seguridad', 'critical', array['service', 'driver', 'vehicle', 'customer']::text[], true, 90),
    ('system_error', 'Error del sistema', 'high', array['system', 'user']::text[], true, 100),
    ('other', 'Otra incidencia', 'medium', array['other']::text[], true, 110)
) as seed(key, name_es, default_severity, applies_to, requires_resolution, sort_order)
where not exists (
  select 1 from public.incident_categories category where category.key = seed.key
);

-- Initial app_settings inserts can generate configuration_change audit rows.
-- This is expected migration metadata, not accidental business data, and must not recurse.
insert into public.app_settings (
  setting_key,
  setting_scope,
  value_type,
  value_json,
  description,
  is_sensitive,
  is_editable
)
select seed.setting_key, seed.setting_scope, seed.value_type, seed.value_json, seed.description, false, true
from (
  values
    ('finance.default_currency', 'finance', 'string', to_jsonb('EUR'::text), 'Default currency for financial operations.'),
    ('finance.default_tax_rate', 'finance', 'number', to_jsonb(0::numeric), 'Default tax rate percentage.'),
    ('operations.internal_driver_priority_enabled', 'operations', 'boolean', to_jsonb(true), 'Whether internal driver priority is enabled.'),
    ('operations.default_service_conflict_minutes', 'operations', 'number', to_jsonb(120::integer), 'Default service conflict window in minutes.'),
    ('operations.vehicle_document_expiring_days', 'operations', 'number', to_jsonb(30::integer), 'Days before a vehicle document is considered expiring.'),
    ('operations.periodic_services_enabled', 'operations', 'boolean', to_jsonb(false), 'Whether periodic service workflow is enabled.'),
    ('system.audit_retention_mode', 'system', 'string', to_jsonb('indefinite'::text), 'Audit log retention mode.'),
    ('system.environment_label', 'system', 'string', to_jsonb('development'::text), 'Environment label for local and development deployments.')
) as seed(setting_key, setting_scope, value_type, value_json, description)
where not exists (
  select 1
  from public.app_settings setting
  where setting.setting_key = seed.setting_key
    and setting.setting_scope = seed.setting_scope
    and setting.scope_reference_id is null
);

insert into public.configurable_catalogs (
  catalog_key,
  name_es,
  description,
  is_system,
  allow_custom_items
)
select seed.catalog_key, seed.name_es, seed.description, true, seed.allow_custom_items
from (
  values
    ('service_types', 'Tipos de servicio', 'Operational service type labels.', true),
    ('incident_reason_codes', 'Motivos de incidencia', 'Reusable incident reason codes.', true),
    ('cancellation_reason_codes', 'Motivos de cancelación', 'Reusable cancellation reason codes.', true),
    ('payment_reference_types', 'Tipos de referencia de pago', 'Payment reference labels.', true),
    ('expense_reason_codes', 'Motivos de gasto', 'Expense reason labels.', true),
    ('settlement_adjustment_reasons', 'Motivos de ajuste de liquidacion', 'Settlement adjustment reason labels.', true)
) as seed(catalog_key, name_es, description, allow_custom_items)
where not exists (
  select 1 from public.configurable_catalogs catalog where catalog.catalog_key = seed.catalog_key
);

insert into public.configurable_catalog_items (
  catalog_id,
  item_key,
  label_es,
  description,
  sort_order,
  is_system
)
select catalog.id, seed.item_key, seed.label_es, seed.description, seed.sort_order, true
from public.configurable_catalogs catalog
join (
  values
    ('service_types', 'point_to_point', 'Punto a punto', 'Standard point to point service.', 10),
    ('service_types', 'airport', 'Aeropuerto', 'Airport transfer service.', 20),
    ('service_types', 'long_distance', 'Larga distancia', 'Long distance service.', 30),
    ('service_types', 'periodic', 'Periódico', 'Catalog label only; periodic service workflow is not enabled here.', 40),
    ('cancellation_reason_codes', 'customer_request', 'Solicitud del cliente', 'Cancellation requested by customer.', 10),
    ('cancellation_reason_codes', 'driver_unavailable', 'Conductor no disponible', 'Assigned driver unavailable.', 20),
    ('cancellation_reason_codes', 'vehicle_unavailable', 'Vehículo no disponible', 'Assigned vehicle unavailable.', 30),
    ('cancellation_reason_codes', 'operational_issue', 'Incidencia operativa', 'Operational issue.', 40),
    ('cancellation_reason_codes', 'weather', 'Condiciones meteorológicas', 'Weather conditions.', 50),
    ('cancellation_reason_codes', 'other', 'Otro', 'Other cancellation reason.', 60)
) as seed(catalog_key, item_key, label_es, description, sort_order)
  on catalog.catalog_key = seed.catalog_key
where not exists (
  select 1
  from public.configurable_catalog_items item
  where item.catalog_id = catalog.id
    and item.item_key = seed.item_key
);

revoke all on table public.incident_categories from public, anon, authenticated;
revoke all on table public.incidents from public, anon, authenticated;
revoke all on table public.incident_events from public, anon, authenticated;
revoke all on table public.incident_comments from public, anon, authenticated;
revoke all on table public.app_settings from public, anon, authenticated;
revoke all on table public.app_setting_history from public, anon, authenticated;
revoke all on table public.configurable_catalogs from public, anon, authenticated;
revoke all on table public.configurable_catalog_items from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;

grant select, insert, update, delete on table public.incident_categories to service_role;
grant select, insert, update, delete on table public.incidents to service_role;
grant select, insert on table public.incident_events to service_role;
grant select, insert on table public.incident_comments to service_role;
grant select, insert, update, delete on table public.app_settings to service_role;
grant select, insert on table public.app_setting_history to service_role;
grant select, insert, update, delete on table public.configurable_catalogs to service_role;
grant select, insert, update, delete on table public.configurable_catalog_items to service_role;
grant select, insert on table public.audit_logs to service_role;

revoke all on function public.text_array_has_duplicates(text[]) from public, anon, authenticated;
revoke all on function public.text_array_values_allowed(text[], text[]) from public, anon, authenticated;
revoke all on function public.jsonb_has_sensitive_key(jsonb) from public, anon, authenticated;
revoke all on function public.sanitize_audit_json(jsonb) from public, anon, authenticated;
revoke all on function public.jsonb_top_level_changed_fields(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.jsonb_matches_value_type(jsonb, text) from public, anon, authenticated;
revoke all on function public.app_user_is_active(uuid) from public, anon, authenticated;
revoke all on function public.driver_is_active(uuid) from public, anon, authenticated;
revoke all on function public.incident_category_accepts_relations(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_incident_human_code() from public, anon, authenticated;
revoke all on function public.prepare_incident() from public, anon, authenticated;
revoke all on function public.record_incident_events() from public, anon, authenticated;
revoke all on function public.prevent_incident_event_changes() from public, anon, authenticated;
revoke all on function public.prepare_incident_comment() from public, anon, authenticated;
revoke all on function public.record_incident_comment_event() from public, anon, authenticated;
revoke all on function public.prevent_incident_category_delete() from public, anon, authenticated;
revoke all on function public.prepare_app_setting() from public, anon, authenticated;
revoke all on function public.prevent_app_setting_history_changes() from public, anon, authenticated;
revoke all on function public.prepare_catalog() from public, anon, authenticated;
revoke all on function public.prepare_catalog_item() from public, anon, authenticated;
revoke all on function public.prepare_audit_log() from public, anon, authenticated;
revoke all on function public.write_audit_log(text, text, text, uuid, text, jsonb, jsonb, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_app_setting_history_and_audit() from public, anon, authenticated;
revoke all on function public.audit_user_roles_change() from public, anon, authenticated;
revoke all on function public.audit_app_session_context_change() from public, anon, authenticated;

grant execute on function public.text_array_has_duplicates(text[]) to service_role;
grant execute on function public.text_array_values_allowed(text[], text[]) to service_role;
grant execute on function public.jsonb_has_sensitive_key(jsonb) to service_role;
grant execute on function public.sanitize_audit_json(jsonb) to service_role;
grant execute on function public.jsonb_top_level_changed_fields(jsonb, jsonb) to service_role;
grant execute on function public.jsonb_matches_value_type(jsonb, text) to service_role;
grant execute on function public.app_user_is_active(uuid) to service_role;
grant execute on function public.driver_is_active(uuid) to service_role;
grant execute on function public.incident_category_accepts_relations(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.assign_incident_human_code() to service_role;
grant execute on function public.prepare_incident() to service_role;
grant execute on function public.record_incident_events() to service_role;
grant execute on function public.prevent_incident_event_changes() to service_role;
grant execute on function public.prepare_incident_comment() to service_role;
grant execute on function public.record_incident_comment_event() to service_role;
grant execute on function public.prevent_incident_category_delete() to service_role;
grant execute on function public.prepare_app_setting() to service_role;
grant execute on function public.prevent_app_setting_history_changes() to service_role;
grant execute on function public.prepare_catalog() to service_role;
grant execute on function public.prepare_catalog_item() to service_role;
grant execute on function public.prepare_audit_log() to service_role;
grant execute on function public.write_audit_log(text, text, text, uuid, text, jsonb, jsonb, text, jsonb, uuid, uuid) to service_role;
grant execute on function public.record_app_setting_history_and_audit() to service_role;
grant execute on function public.audit_user_roles_change() to service_role;
grant execute on function public.audit_app_session_context_change() to service_role;

do $$
declare
  v_missing text;
begin
  select string_agg(table_name, ', ' order by table_name)
  into v_missing
  from (
    values
      ('incident_categories'),
      ('incidents'),
      ('incident_events'),
      ('incident_comments'),
      ('app_settings'),
      ('app_setting_history'),
      ('configurable_catalogs'),
      ('configurable_catalog_items'),
      ('audit_logs')
  ) as expected(table_name)
  where to_regclass('public.' || expected.table_name) is null;

  if v_missing is not null then
    raise exception 'Missing 0012 tables: %.', v_missing;
  end if;

  if not exists (
    select 1
    from public.human_code_counters counter
    where counter.prefix = 'INC'
      and counter.is_active = true
      and counter.padding = 6
  ) then
    raise exception 'Missing active INC human code counter with padding 6.';
  end if;

  if exists (select 1 from public.incidents where human_code !~ '^INC-[0-9]{6}$') then
    raise exception 'Invalid INC human_code format detected.';
  end if;

  if (
    select count(*)
    from public.incident_categories category
    where category.key in (
      'service_delay',
      'passenger_no_show',
      'driver_no_show',
      'vehicle_breakdown',
      'documentation_issue',
      'payment_issue',
      'cash_difference',
      'customer_complaint',
      'safety_issue',
      'system_error',
      'other'
    )
  ) <> 11 then
    raise exception 'Missing initial incident categories.';
  end if;

  if exists (
    select 1
    from public.incident_categories category
    where public.text_array_has_duplicates(category.applies_to)
      or not public.text_array_values_allowed(
        category.applies_to,
        array['service', 'driver', 'vehicle', 'customer', 'user', 'payment', 'cash', 'receivable', 'expense', 'settlement', 'system', 'other']
      )
  ) then
    raise exception 'Invalid incident category applies_to values detected.';
  end if;

  if (
    select count(*)
    from public.app_settings setting
    where setting.setting_key in (
      'finance.default_currency',
      'finance.default_tax_rate',
      'operations.internal_driver_priority_enabled',
      'operations.default_service_conflict_minutes',
      'operations.vehicle_document_expiring_days',
      'operations.periodic_services_enabled',
      'system.audit_retention_mode',
      'system.environment_label'
    )
  ) <> 8 then
    raise exception 'Missing initial app settings.';
  end if;

  if exists (
    select 1
    from public.app_settings setting
    where not public.jsonb_matches_value_type(setting.value_json, setting.value_type)
      or public.jsonb_has_sensitive_key(setting.value_json)
  ) then
    raise exception 'Invalid app setting value payload detected.';
  end if;

  if exists (
    select 1
    from public.app_settings setting
    where setting.is_active = true
    group by setting.setting_key, setting.setting_scope, coalesce(setting.scope_reference_id, '00000000-0000-0000-0000-000000000000'::uuid)
    having count(*) > 1
  ) then
    raise exception 'Duplicate active app setting scope detected.';
  end if;

  if exists (
    select 1
    from public.app_settings setting
    where not exists (
      select 1
      from public.app_setting_history history
      where history.app_setting_id = setting.id
        and history.version = 1
    )
  ) then
    raise exception 'Missing initial app setting history rows.';
  end if;

  if (
    select count(*)
    from public.configurable_catalogs catalog
    where catalog.catalog_key in (
      'service_types',
      'incident_reason_codes',
      'cancellation_reason_codes',
      'payment_reference_types',
      'expense_reason_codes',
      'settlement_adjustment_reasons'
    )
  ) <> 6 then
    raise exception 'Missing initial configurable catalogs.';
  end if;

  if (
    select count(*)
    from public.configurable_catalog_items item
    join public.configurable_catalogs catalog on catalog.id = item.catalog_id
    where (catalog.catalog_key = 'service_types' and item.item_key in ('point_to_point', 'airport', 'long_distance', 'periodic'))
       or (catalog.catalog_key = 'cancellation_reason_codes' and item.item_key in ('customer_request', 'driver_unavailable', 'vehicle_unavailable', 'operational_issue', 'weather', 'other'))
  ) <> 10 then
    raise exception 'Missing initial configurable catalog items.';
  end if;

  if to_regprocedure('public.sanitize_audit_json(jsonb)') is null then
    raise exception 'Missing sanitize_audit_json(jsonb).';
  end if;

  if to_regprocedure('public.write_audit_log(text, text, text, uuid, text, jsonb, jsonb, text, jsonb, uuid, uuid)') is null then
    raise exception 'Missing write_audit_log(...).';
  end if;

  if public.sanitize_audit_json('{"password":"x","nested":{"api_key":"y"},"safe":"z"}'::jsonb) ? 'password' then
    raise exception 'sanitize_audit_json did not redact a top-level sensitive key.';
  end if;

  if public.sanitize_audit_json('{"nested":{"api_key":"y"}}'::jsonb) #> '{nested,api_key}' is not null then
    raise exception 'sanitize_audit_json did not redact a nested sensitive key.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'record_app_setting_history_and_audit_trigger') then
    raise exception 'Missing app_settings history/audit trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'audit_user_roles_change_trigger') then
    raise exception 'Missing user_roles audit trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'audit_app_session_context_change_trigger') then
    raise exception 'Missing app_sessions active_context audit trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'prevent_incident_event_changes_trigger') then
    raise exception 'Missing incident_events append-only trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'prepare_incident_comment_trigger') then
    raise exception 'Missing incident_comments append-only trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'prevent_app_setting_history_changes_trigger') then
    raise exception 'Missing app_setting_history append-only trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'prepare_audit_log_trigger') then
    raise exception 'Missing audit_logs append-only trigger.';
  end if;

  if has_function_privilege('anon', 'public.next_human_code(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.next_human_code(text)', 'EXECUTE')
  then
    raise exception 'anon/authenticated must not execute public.next_human_code(text).';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'text_array_has_duplicates',
        'text_array_values_allowed',
        'jsonb_has_sensitive_key',
        'sanitize_audit_json',
        'jsonb_top_level_changed_fields',
        'jsonb_matches_value_type',
        'app_user_is_active',
        'driver_is_active',
        'incident_category_accepts_relations',
        'assign_incident_human_code',
        'prepare_incident',
        'record_incident_events',
        'prevent_incident_event_changes',
        'prepare_incident_comment',
        'record_incident_comment_event',
        'prevent_incident_category_delete',
        'prepare_app_setting',
        'prevent_app_setting_history_changes',
        'prepare_catalog',
        'prepare_catalog_item',
        'prepare_audit_log',
        'write_audit_log',
        'record_app_setting_history_and_audit',
        'audit_user_roles_change',
        'audit_app_session_context_change'
      )
      and (
        has_function_privilege('anon', procedure.oid, 'EXECUTE')
        or has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      )
  ) then
    raise exception '0012 functions must not be executable by anon/authenticated.';
  end if;
end;
$$;
