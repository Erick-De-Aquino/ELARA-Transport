-- ELARA Transport V4.0
-- Migration 0044: read-only administrative settlement list and detail RPCs.
-- No changes to financial calculations, workflow, tables, RLS or business data.
-- Current display names/codes and rule metadata are live lookups; financial
-- amounts, percentages and item snapshot_data are returned as stored.

create or replace function public.get_admin_settlements(
  p_status text default null,
  p_payment_status text default null,
  p_driver_id uuid default null,
  p_driver_type text default null,
  p_period_from date default null,
  p_period_to date default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  settlement_id uuid,
  human_code text,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  driver_type_snapshot text,
  frequency_snapshot text,
  calculation_method_snapshot text,
  period_start date,
  period_end date,
  currency_code text,
  status text,
  payment_status text,
  gross_eligible_amount numeric(14, 2),
  expense_deduction_amount numeric(14, 2),
  adjustment_amount numeric(14, 2),
  calculation_base_amount numeric(14, 2),
  driver_percentage numeric(7, 4),
  elara_percentage numeric(7, 4),
  driver_amount numeric(14, 2),
  elara_amount numeric(14, 2),
  paid_amount numeric(14, 2),
  pending_amount numeric(14, 2),
  generated_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_item_count bigint,
  service_item_count bigint,
  expense_deduction_count bigint,
  adjustment_item_count bigint,
  other_item_count bigint,
  payment_count bigint,
  completed_payment_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_status text;
  v_payment_status text;
  v_driver_type text;
  v_search text;
  v_limit integer;
  v_offset integer;
begin
  perform public.require_admin_user();
  v_status := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_payment_status := nullif(lower(trim(coalesce(p_payment_status, ''))), '');
  v_driver_type := nullif(lower(trim(coalesce(p_driver_type, ''))), '');
  v_search := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_offset := coalesce(p_offset, 0);

  if v_status is not null and v_status not in ('draft', 'generated', 'submitted', 'approved', 'rejected', 'cancelled') then
    raise exception 'Invalid settlement status filter.' using errcode = '23514';
  end if;
  if v_payment_status is not null and v_payment_status not in ('unpaid', 'partial', 'paid', 'cancelled') then
    raise exception 'Invalid settlement payment status filter.' using errcode = '23514';
  end if;
  if v_driver_type is not null and v_driver_type not in ('internal_driver', 'external_collaborator') then
    raise exception 'Invalid settlement driver type filter.' using errcode = '23514';
  end if;
  if v_offset < 0 then
    raise exception 'Settlement offset cannot be negative.' using errcode = '23514';
  end if;
  if p_period_from is not null and p_period_to is not null and p_period_from > p_period_to then
    raise exception 'Settlement period filter start cannot be after end.' using errcode = '23514';
  end if;

  -- Inclusive overlap with the requested period. Search is a literal substring;
  -- '%' and '_' are not wildcards. Window count is computed before pagination.
  return query
    with filtered as (
      select
      s.id as settlement_id,
      s.human_code as human_code,
      s.driver_id as driver_id,
      d.human_code as driver_human_code,
      nullif(trim(concat_ws(' ', dp.first_name, dp.last_name)), '') as driver_name,
      s.driver_type_snapshot as driver_type_snapshot,
      s.frequency_snapshot as frequency_snapshot,
      s.calculation_method_snapshot as calculation_method_snapshot,
      s.period_start as period_start,
      s.period_end as period_end,
      s.currency_code as currency_code,
      s.status as status,
      s.payment_status as payment_status,
      s.gross_eligible_amount as gross_eligible_amount,
      s.expense_deduction_amount as expense_deduction_amount,
      s.adjustment_amount as adjustment_amount,
      s.calculation_base_amount as calculation_base_amount,
      s.driver_percentage as driver_percentage,
      s.elara_percentage as elara_percentage,
      s.driver_amount as driver_amount,
      s.elara_amount as elara_amount,
      s.paid_amount as paid_amount,
      s.pending_amount as pending_amount,
      s.generated_at as generated_at,
      s.submitted_at as submitted_at,
      s.approved_at as approved_at,
      s.rejected_at as rejected_at,
      s.cancelled_at as cancelled_at,
      s.created_at as created_at,
      s.updated_at as updated_at,
      item_summary.total_item_count as total_item_count,
      item_summary.service_item_count as service_item_count,
      item_summary.expense_deduction_count as expense_deduction_count,
      item_summary.adjustment_item_count as adjustment_item_count,
      item_summary.other_item_count as other_item_count,
      payment_summary.payment_count as payment_count,
      payment_summary.completed_payment_count as completed_payment_count
    from public.settlements s
    join public.drivers d on d.id = s.driver_id
    join public.persons dp on dp.id = d.person_id
    cross join lateral (
      select count(*) as total_item_count,
        count(*) filter (where i.item_type = 'service_income') as service_item_count,
        count(*) filter (where i.item_type = 'expense_deduction') as expense_deduction_count,
        count(*) filter (where i.item_type in ('positive_adjustment', 'negative_adjustment')) as adjustment_item_count,
        count(*) filter (where i.item_type = 'other') as other_item_count
      from public.settlement_items i where i.settlement_id = s.id
    ) item_summary
    cross join lateral (
      select count(*) as payment_count,
        count(*) filter (where p.payment_status = 'completed') as completed_payment_count
      from public.settlement_payments p where p.settlement_id = s.id
    ) payment_summary
      where (v_status is null or s.status = v_status)
        and (v_payment_status is null or s.payment_status = v_payment_status)
        and (p_driver_id is null or s.driver_id = p_driver_id)
        and (v_driver_type is null or s.driver_type_snapshot = v_driver_type)
        and (p_period_from is null or s.period_end >= p_period_from)
        and (p_period_to is null or s.period_start <= p_period_to)
        and (v_search is null
          or strpos(lower(s.human_code), v_search) > 0
          or strpos(lower(d.human_code), v_search) > 0
          or strpos(lower(concat_ws(' ', dp.first_name, dp.last_name)), v_search) > 0)
    )
    select f.*, count(*) over () as total_count
    from filtered f
    order by f.period_end desc, f.created_at desc, f.human_code desc, f.settlement_id desc
    limit v_limit offset v_offset;
end;
$$;

comment on function public.get_admin_settlements(text, text, uuid, text, date, date, text, integer, integer) is
  'Read-only admin/superadmin settlement listing. Inclusive period overlap, literal case-insensitive substring search, limit 1..200, total_count before pagination (no count row on an empty page).';

create or replace function public.get_admin_settlement_detail(p_settlement_id uuid)
returns table(
  settlement_id uuid,
  human_code text,
  driver_id uuid,
  driver_human_code text,
  driver_name text,
  driver_type_snapshot text,
  frequency_snapshot text,
  calculation_method_snapshot text,
  period_start date,
  period_end date,
  currency_code text,
  status text,
  payment_status text,
  gross_eligible_amount numeric(14, 2),
  expense_deduction_amount numeric(14, 2),
  adjustment_amount numeric(14, 2),
  calculation_base_amount numeric(14, 2),
  driver_percentage numeric(7, 4),
  elara_percentage numeric(7, 4),
  driver_amount numeric(14, 2),
  elara_amount numeric(14, 2),
  paid_amount numeric(14, 2),
  pending_amount numeric(14, 2),
  generated_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  settlement_rule_id uuid,
  approved_by uuid,
  approved_by_human_code text,
  approved_by_name text,
  rejected_by uuid,
  rejected_by_human_code text,
  rejected_by_name text,
  cancelled_by uuid,
  cancelled_by_human_code text,
  cancelled_by_name text,
  created_by uuid,
  created_by_human_code text,
  created_by_name text,
  updated_by uuid,
  updated_by_human_code text,
  updated_by_name text,
  rejection_reason text,
  cancellation_reason text,
  notes text,
  internal_notes text,
  total_item_count bigint,
  service_item_count bigint,
  expense_deduction_count bigint,
  adjustment_item_count bigint,
  other_item_count bigint,
  payment_count bigint,
  completed_payment_count bigint,
  rule jsonb,
  items jsonb,
  payments jsonb,
  history jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  perform public.require_admin_user();
  if p_settlement_id is null then
    raise exception 'Settlement id is required.' using errcode = '23502';
  end if;

  return query
    select
      s.id as settlement_id,
      s.human_code as human_code,
      s.driver_id as driver_id,
      d.human_code as driver_human_code,
      nullif(trim(concat_ws(' ', dp.first_name, dp.last_name)), '') as driver_name,
      s.driver_type_snapshot as driver_type_snapshot,
      s.frequency_snapshot as frequency_snapshot,
      s.calculation_method_snapshot as calculation_method_snapshot,
      s.period_start as period_start,
      s.period_end as period_end,
      s.currency_code as currency_code,
      s.status as status,
      s.payment_status as payment_status,
      s.gross_eligible_amount as gross_eligible_amount,
      s.expense_deduction_amount as expense_deduction_amount,
      s.adjustment_amount as adjustment_amount,
      s.calculation_base_amount as calculation_base_amount,
      s.driver_percentage as driver_percentage,
      s.elara_percentage as elara_percentage,
      s.driver_amount as driver_amount,
      s.elara_amount as elara_amount,
      s.paid_amount as paid_amount,
      s.pending_amount as pending_amount,
      s.generated_at as generated_at,
      s.submitted_at as submitted_at,
      s.approved_at as approved_at,
      s.rejected_at as rejected_at,
      s.cancelled_at as cancelled_at,
      s.created_at as created_at,
      s.updated_at as updated_at,
      s.settlement_rule_id as settlement_rule_id,
      s.approved_by as approved_by,
      approved_by_user.human_code as approved_by_human_code,
      nullif(trim(concat_ws(' ', approved_by_person.first_name, approved_by_person.last_name)), '') as approved_by_name,
      s.rejected_by as rejected_by,
      rejected_by_user.human_code as rejected_by_human_code,
      nullif(trim(concat_ws(' ', rejected_by_person.first_name, rejected_by_person.last_name)), '') as rejected_by_name,
      s.cancelled_by as cancelled_by,
      cancelled_by_user.human_code as cancelled_by_human_code,
      nullif(trim(concat_ws(' ', cancelled_by_person.first_name, cancelled_by_person.last_name)), '') as cancelled_by_name,
      s.created_by as created_by,
      created_by_user.human_code as created_by_human_code,
      nullif(trim(concat_ws(' ', created_by_person.first_name, created_by_person.last_name)), '') as created_by_name,
      s.updated_by as updated_by,
      updated_by_user.human_code as updated_by_human_code,
      nullif(trim(concat_ws(' ', updated_by_person.first_name, updated_by_person.last_name)), '') as updated_by_name,
      s.rejection_reason as rejection_reason,
      s.cancellation_reason as cancellation_reason,
      s.notes as notes,
      s.internal_notes as internal_notes,
      item_summary.total_item_count as total_item_count,
      item_summary.service_item_count as service_item_count,
      item_summary.expense_deduction_count as expense_deduction_count,
      item_summary.adjustment_item_count as adjustment_item_count,
      item_summary.other_item_count as other_item_count,
      payment_summary.payment_count as payment_count,
      payment_summary.completed_payment_count as completed_payment_count,
      to_jsonb(rule_row) as rule,
      coalesce(item_data.items, '[]'::jsonb) as items,
      coalesce(payment_data.payments, '[]'::jsonb) as payments,
      coalesce(history_data.history, '[]'::jsonb) as history
    from public.settlements s
    join public.drivers d on d.id = s.driver_id
    join public.persons dp on dp.id = d.person_id
    left join public.settlement_rules rule_row on rule_row.id = s.settlement_rule_id
    left join public.app_users approved_by_user on approved_by_user.id = s.approved_by
    left join public.persons approved_by_person on approved_by_person.id = approved_by_user.person_id
    left join public.app_users rejected_by_user on rejected_by_user.id = s.rejected_by
    left join public.persons rejected_by_person on rejected_by_person.id = rejected_by_user.person_id
    left join public.app_users cancelled_by_user on cancelled_by_user.id = s.cancelled_by
    left join public.persons cancelled_by_person on cancelled_by_person.id = cancelled_by_user.person_id
    left join public.app_users created_by_user on created_by_user.id = s.created_by
    left join public.persons created_by_person on created_by_person.id = created_by_user.person_id
    left join public.app_users updated_by_user on updated_by_user.id = s.updated_by
    left join public.persons updated_by_person on updated_by_person.id = updated_by_user.person_id
    cross join lateral (
      select count(*) as total_item_count,
        count(*) filter (where i.item_type = 'service_income') as service_item_count,
        count(*) filter (where i.item_type = 'expense_deduction') as expense_deduction_count,
        count(*) filter (where i.item_type in ('positive_adjustment', 'negative_adjustment')) as adjustment_item_count,
        count(*) filter (where i.item_type = 'other') as other_item_count
      from public.settlement_items i where i.settlement_id = s.id
    ) item_summary
    cross join lateral (
      select count(*) as payment_count,
        count(*) filter (where p.payment_status = 'completed') as completed_payment_count
      from public.settlement_payments p where p.settlement_id = s.id
    ) payment_summary
    left join lateral (
      select jsonb_agg(
        to_jsonb(i) || jsonb_build_object(
          'service_human_code', service_row.human_code,
          'expense_human_code', expense_row.human_code,
          'created_by_actor', case when item_user.id is null then null else jsonb_build_object('id', item_user.id, 'human_code', item_user.human_code, 'name', nullif(trim(concat_ws(' ', item_person.first_name, item_person.last_name)), '')) end
        ) order by i.created_at asc, i.id asc
      ) as items
      from public.settlement_items i
      left join public.services service_row on service_row.id = i.service_id
      left join public.expenses expense_row on expense_row.id = i.expense_id
      left join public.app_users item_user on item_user.id = i.created_by
      left join public.persons item_person on item_person.id = item_user.person_id
      where i.settlement_id = s.id
    ) item_data on true
    left join lateral (
      select jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'cash_account_name', account_row.name,
          'cash_account_type', account_row.account_type,
          'created_by_actor', case when payment_user.id is null then null else jsonb_build_object('id', payment_user.id, 'human_code', payment_user.human_code, 'name', nullif(trim(concat_ws(' ', payment_person.first_name, payment_person.last_name)), '')) end,
          'updated_by_actor', case when payment_update_user.id is null then null else jsonb_build_object('id', payment_update_user.id, 'human_code', payment_update_user.human_code, 'name', nullif(trim(concat_ws(' ', payment_update_person.first_name, payment_update_person.last_name)), '')) end,
          'cancelled_by_actor', case when payment_cancel_user.id is null then null else jsonb_build_object('id', payment_cancel_user.id, 'human_code', payment_cancel_user.human_code, 'name', nullif(trim(concat_ws(' ', payment_cancel_person.first_name, payment_cancel_person.last_name)), '')) end
        ) order by p.paid_at asc nulls last, p.created_at asc, p.id asc
      ) as payments
      from public.settlement_payments p
      left join public.cash_accounts account_row on account_row.id = p.cash_account_id
      left join public.app_users payment_user on payment_user.id = p.created_by
      left join public.persons payment_person on payment_person.id = payment_user.person_id
      left join public.app_users payment_update_user on payment_update_user.id = p.updated_by
      left join public.persons payment_update_person on payment_update_person.id = payment_update_user.person_id
      left join public.app_users payment_cancel_user on payment_cancel_user.id = p.cancelled_by
      left join public.persons payment_cancel_person on payment_cancel_person.id = payment_cancel_user.person_id
      where p.settlement_id = s.id
    ) payment_data on true
    left join lateral (
      select jsonb_agg(
        to_jsonb(h) || jsonb_build_object('changed_by_actor', case when history_user.id is null then null else jsonb_build_object('id', history_user.id, 'human_code', history_user.human_code, 'name', nullif(trim(concat_ws(' ', history_person.first_name, history_person.last_name)), '')) end)
        order by h.changed_at asc, h.id asc
      ) as history
      from public.settlement_status_history h
      left join public.app_users history_user on history_user.id = h.changed_by_user_id
      left join public.persons history_person on history_person.id = history_user.person_id
      where h.settlement_id = s.id
    ) history_data on true
    where s.id = p_settlement_id;

  if not found then
    raise exception 'Settlement was not found.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.get_admin_settlement_detail(uuid) is
  'Read-only admin/superadmin settlement header, current actor/rule labels and ordered items/payments/history arrays. Returns stored financial snapshots without recalculation. JSON retains actual database column names, including *_snapshot, payment_status and changed_by_user_id.';

revoke all on function public.get_admin_settlements(text, text, uuid, text, date, date, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_settlements(text, text, uuid, text, date, date, text, integer, integer) to authenticated;

revoke all on function public.get_admin_settlement_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_settlement_detail(uuid) to authenticated;

do $$
declare
  v_function regprocedure;
begin
  foreach v_function in array array[
    'public.get_admin_settlements(text,text,uuid,text,date,date,text,integer,integer)'::regprocedure,
    'public.get_admin_settlement_detail(uuid)'::regprocedure
  ] loop
    if exists (
      select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where p.oid = v_function and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception '% must not be executable by PUBLIC.', v_function;
    end if;
    if has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('service_role', v_function, 'EXECUTE')
      or not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'Unexpected execute privileges for %.', v_function;
    end if;
  end loop;
end;
$$;
