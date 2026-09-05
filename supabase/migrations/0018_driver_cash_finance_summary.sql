-- ELARA Transport V4.0
-- Migration 0018: driver cash finance summary.
--
-- Exposes a read-only, driver-scoped cash summary for Portal conductor -> Mis finanzas.
-- The caller cannot pass driver_id, app_user_id, auth_user_id or cash_account_id.

create or replace function public.get_driver_cash_finance_summary()
returns table(
  driver_id uuid,
  currency_code text,
  cash_collected_amount numeric(14, 2),
  remitted_amount numeric(14, 2),
  pending_remittance_amount numeric(14, 2),
  open_discrepancy_count integer,
  open_discrepancy_amount numeric(14, 2),
  excess_under_review_amount numeric(14, 2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_cash_account_id uuid;
  v_currency_code text;
  v_cash_collected_amount numeric(14, 2);
  v_remitted_amount numeric(14, 2);
  v_open_discrepancy_count integer;
  v_open_discrepancy_amount numeric(14, 2);
  v_excess_under_review_amount numeric(14, 2);
begin
  v_driver_id := public.rls_current_driver_id();

  if v_driver_id is null then
    raise exception 'A valid conductor active context is required to read driver cash finance summary.'
      using errcode = '42501';
  end if;

  select account.id, account.currency_code
    into v_cash_account_id, v_currency_code
  from public.cash_accounts account
  where account.driver_id = v_driver_id
    and account.account_type = 'driver'
    and account.status = 'active';

  if v_cash_account_id is null then
    raise exception 'An active driver cash account is required to read driver cash finance summary.'
      using errcode = '23503';
  end if;

  select coalesce(round(sum(movement.amount), 2), 0)
    into v_cash_collected_amount
  from public.cash_movements movement
  join public.service_payments payment
    on payment.id = movement.service_payment_id
  where movement.cash_account_id = v_cash_account_id
    and movement.actor_driver_id = v_driver_id
    and movement.movement_type = 'inflow'
    and movement.movement_category = 'service_payment'
    and payment.payment_method = 'cash'
    and payment.payment_status = 'completed'
    and not exists (
      select 1
      from public.cash_movements reversal
      where reversal.original_movement_id = movement.id
        and reversal.movement_category = 'reversal'
    );

  select coalesce(round(sum(
      case
        when remittance.status = 'verified' then coalesce(remittance.verified_amount, remittance.declared_amount)
        else remittance.declared_amount
      end
    ), 2), 0)
    into v_remitted_amount
  from public.cash_remittances remittance
  where remittance.driver_id = v_driver_id
    and remittance.source_cash_account_id = v_cash_account_id
    and remittance.currency_code = v_currency_code
    and remittance.status in ('submitted', 'received', 'verified');

  select
      count(*)::integer,
      coalesce(round(sum(discrepancy.difference_amount), 2), 0),
      coalesce(round(sum(greatest(discrepancy.difference_amount, 0)), 2), 0)
    into
      v_open_discrepancy_count,
      v_open_discrepancy_amount,
      v_excess_under_review_amount
  from public.cash_discrepancies discrepancy
  where discrepancy.cash_account_id = v_cash_account_id
    and discrepancy.currency_code = v_currency_code
    and discrepancy.status in ('open', 'under_review');

  driver_id := v_driver_id;
  currency_code := v_currency_code;
  cash_collected_amount := v_cash_collected_amount;
  remitted_amount := v_remitted_amount;
  pending_remittance_amount := greatest(round(v_cash_collected_amount - v_remitted_amount, 2), 0);
  open_discrepancy_count := v_open_discrepancy_count;
  open_discrepancy_amount := v_open_discrepancy_amount;
  excess_under_review_amount := v_excess_under_review_amount;

  return next;
end;
$$;

comment on function public.get_driver_cash_finance_summary() is
  'Returns an aggregated cash/remittance summary for the current authenticated conductor active context. Does not expose cash account IDs, cash movement rows or administrative notes.';

revoke all on function public.get_driver_cash_finance_summary() from public;
revoke all on function public.get_driver_cash_finance_summary() from anon;
revoke all on function public.get_driver_cash_finance_summary() from authenticated;
revoke all on function public.get_driver_cash_finance_summary() from service_role;

grant execute on function public.get_driver_cash_finance_summary() to authenticated;

do $$
begin
  if to_regprocedure('public.get_driver_cash_finance_summary()') is null then
    raise exception 'Missing function public.get_driver_cash_finance_summary().';
  end if;

  if exists (
    select 1
    from pg_proc function_record
    cross join aclexplode(coalesce(function_record.proacl, array[]::aclitem[])) function_acl
    where function_record.oid = 'public.get_driver_cash_finance_summary()'::regprocedure
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not be able to execute public.get_driver_cash_finance_summary().';
  end if;

  if has_function_privilege('anon', 'public.get_driver_cash_finance_summary()', 'EXECUTE') then
    raise exception 'anon must not be able to execute public.get_driver_cash_finance_summary().';
  end if;

  if not has_function_privilege('authenticated', 'public.get_driver_cash_finance_summary()', 'EXECUTE') then
    raise exception 'authenticated must be able to execute public.get_driver_cash_finance_summary().';
  end if;

  if has_function_privilege('service_role', 'public.get_driver_cash_finance_summary()', 'EXECUTE') then
    raise exception 'service_role must not execute public.get_driver_cash_finance_summary().';
  end if;
end;
$$;
