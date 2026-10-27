-- 0050: local implementation of atomic cash closing, partial collections and immutable receipts.
-- No historical DML, no backfill, no operational completion changes, no non-cash methods.
begin;
drop index public.service_payments_one_completed_per_financial_idx;
create or replace function public.validate_service_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial public.service_financials%rowtype;
  v_service_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Service payments cannot be deleted; use cancellation or reversal instead.'
      using errcode = '23514';
  end if;

  select *
  into v_financial
  from public.service_financials financial
  where financial.id = new.service_financial_id
  for update;

  if not found then
    raise exception 'Service payment references a missing service financial row.'
      using errcode = '23503';
  end if;

  if v_financial.service_id <> new.service_id then
    raise exception 'Service payment service_id must match the service financial row.'
      using errcode = '23514';
  end if;

  select service.operational_status
  into v_service_status
  from public.services service
  where service.id = new.service_id;

  if v_service_status is null then
    raise exception 'Service payment references a missing service.'
      using errcode = '23503';
  end if;

  if new.currency_code <> v_financial.currency_code then
    raise exception 'Service payment currency must match the service financial currency.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.payment_status = 'completed' and (new.service_id,new.service_financial_id,new.amount,new.currency_code,new.payment_method,new.paid_at,new.idempotency_key) is distinct from (old.service_id,old.service_financial_id,old.amount,old.currency_code,old.payment_method,old.paid_at,old.idempotency_key) then
      raise exception 'Completed payment economics are immutable.' using errcode='23514';
    end if;
    if old.payment_status = 'completed' and new.payment_status in ('pending', 'failed') then
      raise exception 'Completed payments cannot return to pending or failed.'
        using errcode = '23514';
    end if;

    if old.payment_status in ('cancelled', 'reversed') and new.payment_status <> old.payment_status then
      raise exception 'Cancelled or reversed payments cannot be reactivated.'
        using errcode = '23514';
    end if;
  end if;

  if new.payment_status = 'completed' then
    if v_service_status in ('cancelled', 'no_show', 'not_performed') then
      raise exception 'Cannot register a payment for a cancelled, no-show or not-performed service.'
        using errcode = '23514';
    end if;

    if v_financial.pricing_status <> 'finalized' then
      raise exception 'Service pricing must be finalized before registering payment.'
        using errcode = '23514';
    end if;

    if v_financial.pending_amount <= 0 then
      raise exception 'Service has no pending amount to pay.'
        using errcode = '23514';
    end if;

    if new.amount > v_financial.pending_amount then
      raise exception 'Payment cannot exceed the current pending amount.'
        using errcode = '23514';
    end if;

  end if;

  return new;
end;
$$;
create or replace function public.prepare_receivable_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable public.receivables%rowtype;
  v_payment public.service_payments%rowtype;
  v_service_allocation public.service_payment_allocations%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Receivable allocations are append-only.'
      using errcode = '23514';
  end if;

  new.allocated_amount := round(new.allocated_amount, 2);

  select *
  into v_receivable
  from public.receivables receivable
  where receivable.id = new.receivable_id
  for update;

  if not found then
    raise exception 'Receivable allocation references a missing receivable.'
      using errcode = '23503';
  end if;

  if v_receivable.status in ('paid', 'cancelled', 'written_off') then
    raise exception 'Cannot allocate a payment to a final receivable.'
      using errcode = '23514';
  end if;


  select *
  into v_payment
  from public.service_payments payment
  where payment.id = new.payment_id;

  if not found then
    raise exception 'Receivable allocation references a missing service payment.'
      using errcode = '23503';
  end if;

  if v_payment.payment_status <> 'completed' then
    raise exception 'Receivable allocation requires a completed service payment.'
      using errcode = '23514';
  end if;

  if v_payment.service_financial_id <> v_receivable.service_financial_id
    or v_payment.service_id <> v_receivable.service_id
  then
    raise exception 'Receivable allocation payment must match the receivable service and financial row.'
      using errcode = '23514';
  end if;

  if v_payment.currency_code <> v_receivable.currency_code then
    raise exception 'Receivable allocation payment currency must match the receivable currency.'
      using errcode = '23514';
  end if;

  if new.allocated_amount <> v_payment.amount then
    raise exception 'Receivable allocation amount must match the completed service payment amount.'
      using errcode = '23514';
  end if;

  if new.allocated_amount > v_receivable.pending_amount then
    raise exception 'Collection cannot exceed receivable pending amount.'
      using errcode = '23514';
  end if;

  -- Current CxC allocations always settle the full pending amount, so the actor is mandatory.
  if new.created_by is null or not exists (
    select 1
    from public.app_users app_user
    where app_user.id = new.created_by
      and app_user.status = 'active'
  ) then
    raise exception 'La allocation que liquida la cuenta por cobrar requiere un actor activo en created_by'
      using errcode = '23514';
  end if;

  if new.service_payment_allocation_id is not null then
    select *
    into v_service_allocation
    from public.service_payment_allocations allocation
    where allocation.id = new.service_payment_allocation_id;

    if not found then
      raise exception 'Receivable allocation references a missing service payment allocation.'
        using errcode = '23503';
    end if;

    if v_service_allocation.payment_id <> v_payment.id
      or v_service_allocation.service_financial_id <> v_payment.service_financial_id
      or v_service_allocation.allocated_amount <> v_payment.amount
    then
      raise exception 'Receivable allocation must match the referenced service payment allocation.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create unique index audit_logs_cash_close_request_unique
on public.audit_logs((metadata->>'request_key'))
where metadata->>'financial_contract'='0050';
create unique index audit_logs_cash_initial_close_unique
on public.audit_logs(entity_id)
where metadata->>'financial_contract'='0050' and metadata->>'initial_close'='true';

-- The finishing driver is derived from the authoritative closure/assignment, never a caller UUID.
create function elara_private.cash_close_driver(p_service uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_driver uuid;
begin
 v_driver:=public.rls_current_driver_id();
 if v_driver is null or not exists(
  select 1 from public.service_closures c join public.service_assignments a on a.id=c.assignment_id
  where c.service_id=p_service and c.closure_type='completed' and c.closed_by_driver_id=v_driver
   and a.service_id=p_service and a.driver_id=v_driver and a.assignment_status='ended'
   and a.accepted_at is not null and a.accepted_by_driver_id=v_driver and a.ended_at is not null
 ) then raise exception 'Only the finishing conductor may close these financials.' using errcode='42501'; end if;
 return v_driver;
end $$;

-- All entry points acquire: request lock -> account row -> service row -> financial row -> receivable.
-- READ COMMITTED is required for waiting writers to observe the committed receipt/balance.
create function elara_private.cash_service_close(
 p_service uuid,p_result text,p_amount numeric,p_key text,p_reason text,p_notes text,
 p_account uuid,p_driver_mode boolean,p_paid_at timestamptz default null,p_reference text default null,p_receivable uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 v_actor uuid; v_driver uuid; v_account public.cash_accounts%rowtype;
 v_service public.services%rowtype; v_fin public.service_financials%rowtype;
 v_rec public.receivables%rowtype; v_receipt public.audit_logs%rowtype;
 v_args jsonb; v_hash text; v_response jsonb; v_payment uuid; v_allocation uuid; v_rec_allocation uuid; v_cash uuid;
 v_amount numeric; v_initial boolean; v_result text:=lower(trim(p_result)); v_key text:=nullif(trim(p_key),'');
 v_reason text:=nullif(trim(p_reason),''); v_now timestamptz:=clock_timestamp();
begin
 v_actor:=public.rls_current_app_user_id();
 if v_actor is null then raise exception 'A valid app session is required.' using errcode='28000'; end if;
 if p_driver_mode then v_driver:=elara_private.cash_close_driver(p_service);
 else perform public.require_admin_user(); end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Cash close requires READ COMMITTED.' using errcode='0A000'; end if;
 if v_key is null or length(v_key)>160 then raise exception 'A bounded request key is required.' using errcode='22023'; end if;
 if length(v_reason)>160 or length(p_notes)>2000 then raise exception 'Reason or notes exceed contract limits.' using errcode='22023'; end if;
 if v_result is null or v_result not in ('full','partial','unpaid','no_charge') then raise exception 'Invalid payment result.' using errcode='22023'; end if;
 v_args:=jsonb_build_object('service',p_service,'result',v_result,'amount',p_amount,'reason',v_reason,
  'notes',nullif(trim(p_notes),''),'account',p_account,'driver_mode',p_driver_mode,'paid_at',p_paid_at,'reference',p_reference,'receivable',p_receivable);
 v_hash:=encode(extensions.digest(v_args::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('0050/request/'||v_key,0));
 select * into v_receipt from public.audit_logs where metadata->>'financial_contract'='0050' and metadata->>'request_key'=v_key;
 if found then
  if v_receipt.actor_app_user_id is distinct from v_actor or v_receipt.metadata->>'fingerprint' is distinct from v_hash then
   raise exception 'Request key reused with different arguments.' using errcode='23505'; end if;
  return v_receipt.metadata->'result';
 end if;
 if v_result='no_charge' then
  if p_account is not null then raise exception 'No-charge close has no custody account.' using errcode='23514'; end if;
 elsif v_driver is not null then
  select * into v_account from public.cash_accounts where driver_id=v_driver and account_type='driver' and status='active' for no key update;
 else
  select * into v_account from public.cash_accounts where id=p_account for no key update;
 end if;
 -- unpaid needs no cash account; a supplied/derived account must nevertheless be valid.
 if v_result not in ('unpaid','no_charge') and v_account.id is null then raise exception 'An active cash custody account is required.' using errcode='23503'; end if;
 if v_account.id is not null and (v_account.status<>'active' or
   (not p_driver_mode and v_account.account_type not in ('central','administrative')) or
   (p_driver_mode and (v_account.account_type<>'driver' or v_account.driver_id is distinct from v_driver))) then
  raise exception 'Cash custody account is not authorized.' using errcode='23514'; end if;
 select * into v_service from public.services where id=p_service for update;
 if not found or v_service.deleted_at is not null then raise exception 'Service not found.' using errcode='23503'; end if;
 if v_service.operational_status<>'completed' then raise exception 'Complete the operational service first.' using errcode='23514'; end if;
 select * into v_fin from public.service_financials where service_id=p_service for update;
 if not found or v_fin.pricing_status<>'finalized' then raise exception 'Finalized pricing is required; contact administration.' using errcode='23514'; end if;
 if v_account.id is not null and v_account.currency_code<>v_fin.currency_code then raise exception 'Cash currency mismatch.' using errcode='23514'; end if;
 v_initial:=not exists(select 1 from public.audit_logs where entity_id=p_service and metadata->>'financial_contract'='0050' and metadata->>'initial_close'='true');
 if p_driver_mode and not v_initial then raise exception 'Initial financial close already resolved; only administration may collect the balance.' using errcode='23514'; end if;
 if v_result='no_charge' then
  if not v_initial then raise exception 'No-charge close already resolved.' using errcode='23514'; end if;
  if v_fin.total_amount<>0 or v_fin.paid_amount<>0 or v_fin.pending_amount<>0 or p_amount is distinct from 0::numeric
   or exists(select 1 from public.receivables where service_id=p_service)
   or exists(select 1 from public.service_payments where service_id=p_service) then
   raise exception 'No-charge resolution requires finalized zero pricing without payments or debt.' using errcode='23514'; end if;
 elsif v_fin.pending_amount<=0 then raise exception 'Service has no pending amount.' using errcode='23514'; end if;
 v_amount:=case when p_amount is null and v_result='full' and not p_driver_mode then v_fin.pending_amount else p_amount end;
 if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<>round(v_amount,2) or v_amount<0
  or (v_result='full' and (v_amount<=0 or v_amount<>v_fin.pending_amount))
  or (v_result='partial' and (v_amount<=0 or v_amount>=v_fin.pending_amount))
  or (v_result='unpaid' and v_amount<>0) then raise exception 'Invalid received amount for payment result.' using errcode='23514'; end if;
 if v_result in ('partial','unpaid') and v_reason is null then raise exception 'A reason is required.' using errcode='23514'; end if;
 select * into v_rec from public.receivables where service_id=p_service and status in ('open','overdue','partial') for update;
 if p_receivable is not null and v_rec.id is distinct from p_receivable then raise exception 'Receivable is no longer collectible.' using errcode='23514'; end if;
 if v_rec.id is null and v_result not in ('full','no_charge') then
  -- Open before the partial payment so original_amount preserves the initial debt.
  insert into public.receivables(service_id,service_financial_id,customer_id,status,currency_code,original_amount,pending_amount,created_by,updated_by)
  values(p_service,v_fin.id,v_service.customer_id,'open',v_fin.currency_code,v_fin.pending_amount,v_fin.pending_amount,v_actor,v_actor)
  returning * into v_rec;
 end if;
 if v_rec.id is not null and v_rec.pending_amount<>v_fin.pending_amount then raise exception 'Receivable and service balance disagree.' using errcode='23514'; end if;
 if v_amount>0 then
  update public.service_financials set updated_by=v_actor where id=v_fin.id;
  insert into public.service_payments(service_id,service_financial_id,payment_method,payment_status,amount,currency_code,paid_at,external_reference,idempotency_key,notes,created_by,updated_by)
  values(p_service,v_fin.id,'cash','completed',v_amount,v_fin.currency_code,coalesce(p_paid_at,v_now),p_reference,
   '0050:'||v_actor::text||':'||v_key,nullif(trim(p_notes),''),v_actor,v_actor) returning id into v_payment;
  -- The existing trigger is the ONLY allocation writer.
  select id into strict v_allocation from public.service_payment_allocations
   where payment_id=v_payment and service_financial_id=v_fin.id and allocated_amount=v_amount;
  if v_rec.id is not null then
   insert into public.receivable_allocations(receivable_id,payment_id,service_payment_allocation_id,allocated_amount,created_by)
   values(v_rec.id,v_payment,v_allocation,v_amount,v_actor) returning id into v_rec_allocation;
  end if;
  insert into public.cash_movements(cash_account_id,movement_type,movement_category,amount,currency_code,occurred_at,
   service_id,service_payment_id,source_type,source_id,idempotency_key,description,created_by,actor_driver_id)
  values(v_account.id,'inflow','service_payment',v_amount,v_fin.currency_code,coalesce(p_paid_at,v_now),p_service,v_payment,
   'service_payment',v_payment,'0050:cash:'||v_payment::text,'Cash service collection',v_actor,v_driver) returning id into v_cash;
 end if;
 select * into v_fin from public.service_financials where id=v_fin.id;
 v_response:=jsonb_build_object('service_id',p_service,'payment_result',v_result,'amount_received',v_amount,
  'total_amount',v_fin.total_amount,'paid_amount',v_fin.paid_amount,'pending_amount',v_fin.pending_amount,
  'currency_code',v_fin.currency_code,'payment_id',v_payment,'allocation_id',v_allocation,
  'receivable_id',v_rec.id,'receivable_allocation_id',v_rec_allocation,'cash_movement_id',v_cash,
  'cash_account_id',case when v_amount>0 then v_account.id end,'financial_close','resolved');
 perform public.secure_audit('payment','services',p_service,v_service.human_code,null,v_response,v_reason,
  jsonb_build_object('financial_contract','0050','request_key',v_key,'fingerprint',v_hash,
   'initial_close',v_initial,'result',v_response),v_actor,v_driver);
 return v_response;
end $$;

create function public.close_driver_service_financial(p_service_id uuid,p_payment_result text,p_amount_received numeric,
 p_request_key text,p_reason_code text default null,p_notes text default null)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$
 select elara_private.cash_service_close(p_service_id,p_payment_result,p_amount_received,p_request_key,p_reason_code,p_notes,null,true);
$$;
create function public.close_admin_service_financial(p_service_id uuid,p_payment_result text,p_amount_received numeric,
 p_cash_account_id uuid,p_request_key text,p_reason_code text default null,p_notes text default null)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$
 select elara_private.cash_service_close(p_service_id,p_payment_result,p_amount_received,p_request_key,p_reason_code,p_notes,p_cash_account_id,false);
$$;

-- Compatibility RPCs retain their argument/return signatures. Keys are now mandatory.
-- A NULL paid_at default keeps omitted timestamps stable in the request fingerprint.
create or replace function public.register_service_payment(p_service_id uuid,p_amount numeric,p_payment_method text default 'cash',
 p_cash_account_id uuid default null,p_paid_at timestamptz default null,p_external_reference text default null,
 p_idempotency_key text default null,p_notes text default null)
returns table(payment_id uuid,cash_movement_id uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r jsonb; v_pending numeric; v_result text;
begin
 perform public.require_admin_user();
 if lower(trim(coalesce(p_payment_method,'cash'))) <> 'cash' then raise exception 'Only cash is supported.' using errcode='0A000'; end if;
 -- Compatibility entry always uses an explicit amount. Infer result from the ORIGINAL receipt on replay.
 select a.metadata->'result'->>'payment_result' into v_result from public.audit_logs a
 where a.actor_app_user_id=public.rls_current_app_user_id() and a.metadata->>'financial_contract'='0050' and a.metadata->>'request_key'=trim(p_idempotency_key);
 if v_result is null then
  select pending_amount into v_pending from public.service_financials where service_id=p_service_id;
  v_result:=case when p_amount=v_pending then 'full' else 'partial' end;
 end if;
 r:=elara_private.cash_service_close(p_service_id,v_result,p_amount,p_idempotency_key,
  case when v_result='partial' then 'administrative_collection' end,p_notes,p_cash_account_id,false,p_paid_at,p_external_reference);
 return query select (r->>'payment_id')::uuid,(r->>'cash_movement_id')::uuid;
end $$;

create function public.collect_receivable_cash(p_receivable_id uuid,p_payment_result text,p_amount_received numeric,
 p_cash_account_id uuid,p_request_key text,p_reason_code text default null,p_notes text default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_service uuid;
begin
 perform public.require_admin_user();
 select service_id into v_service from public.receivables where id=p_receivable_id;
 if not found then raise exception 'Receivable not found.' using errcode='23503'; end if;
 return elara_private.cash_service_close(v_service,p_payment_result,p_amount_received,p_request_key,p_reason_code,p_notes,p_cash_account_id,false,null,null,p_receivable_id);
end $$;
create or replace function public.collect_receivable(p_receivable_id uuid,p_cash_account_id uuid,p_paid_at timestamptz default null,
 p_idempotency_key text default null,p_notes text default null)
returns table(payment_id uuid,receivable_allocation_id uuid,cash_movement_id uuid)
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r jsonb; v_service uuid;
begin
 perform public.require_admin_user();
 select service_id into v_service from public.receivables where id=p_receivable_id;
 if not found then raise exception 'Receivable not found.' using errcode='23503'; end if;
 r:=elara_private.cash_service_close(v_service,'full',null,p_idempotency_key,null,p_notes,p_cash_account_id,false,p_paid_at,null,p_receivable_id);
 return query select (r->>'payment_id')::uuid,(r->>'receivable_allocation_id')::uuid,(r->>'cash_movement_id')::uuid;
end $$;

-- Explicit provisioning only. No rows are created by migration, login or read RPCs.
create function public.provision_driver_cash_account(p_driver_id uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_id uuid;
begin
 v_actor:=public.require_admin_user();
 perform pg_advisory_xact_lock(hashtextextended('0050/driver-account/'||p_driver_id::text,0));
 perform 1 from public.drivers where id=p_driver_id and administrative_status='active' and inactive_at is null for update;
 if not found then raise exception 'Active driver required.' using errcode='23514'; end if;
 select id into v_id from public.cash_accounts where driver_id=p_driver_id and account_type='driver' and status='active';
 if v_id is not null then return v_id; end if;
 if exists(select 1 from public.cash_accounts where driver_id=p_driver_id) then raise exception 'Existing inactive account requires separate administrative review.' using errcode='23514'; end if;
 insert into public.cash_accounts(name,account_type,driver_id,currency_code,created_by,updated_by)
 values('Driver cash custody','driver',p_driver_id,'EUR',v_actor,v_actor) returning id into v_id;
 perform public.secure_audit('insert','cash_accounts',v_id,null,null,jsonb_build_object('driver_id',p_driver_id),'Explicit driver account provision.',jsonb_build_object('operation','driver_cash_account_provision'),v_actor,null);
 return v_id;
end $$;

create function public.get_service_financial_close_context(p_service_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_driver uuid; v_service public.services%rowtype; v_fin public.service_financials%rowtype; v_close jsonb;
begin
 v_actor:=public.rls_current_app_user_id();
 if v_actor is null then raise exception 'Valid app session required.' using errcode='28000'; end if;
 select * into v_service from public.services where id=p_service_id and deleted_at is null;
 if not found then raise exception 'Service not found.' using errcode='23503'; end if;
 if not public.rls_is_admin() then
  v_driver:=public.rls_current_driver_id();
  if v_service.operational_status='completed' then perform elara_private.cash_close_driver(p_service_id);
  elsif v_driver is null or not exists(select 1 from public.service_assignments a where a.service_id=p_service_id
   and a.driver_id=v_driver and a.assignment_status='accepted' and a.ended_at is null and a.accepted_by_driver_id=v_driver) then
   raise exception 'Service is not owned by current conductor.' using errcode='42501'; end if;
 end if;
 select * into v_fin from public.service_financials where service_id=p_service_id;
 select metadata->'result' into v_close from public.audit_logs where entity_id=p_service_id and metadata->>'financial_contract'='0050' and metadata->>'initial_close'='true';
 return jsonb_build_object('service_id',p_service_id,'operational_status',v_service.operational_status,'pricing_status',v_fin.pricing_status,
  'total_amount',v_fin.total_amount,'paid_amount',v_fin.paid_amount,'pending_amount',v_fin.pending_amount,'currency_code',v_fin.currency_code,
  'financial_close',case when v_close is null then 'pending' else 'resolved' end,
  'no_charge',v_fin.pricing_status='finalized' and v_fin.total_amount=0,
  'last_receipt',(select jsonb_build_object('request_key',metadata->>'request_key','result',metadata->'result')
    from public.audit_logs where entity_id=p_service_id and actor_app_user_id=v_actor and metadata->>'financial_contract'='0050'
    order by created_at desc,id desc limit 1),
  'cash_account_ready',exists(select 1 from public.cash_accounts where driver_id=v_driver and account_type='driver' and status='active' and currency_code=v_fin.currency_code),
  'payments',(select coalesce(jsonb_agg(jsonb_build_object('payment_id',p.id,'amount',p.amount,'status',p.payment_status)),'[]') from public.service_payments p where p.service_id=p_service_id),
  'receivable',(select jsonb_build_object('id',r.id,'pending_amount',r.pending_amount,'status',r.status) from public.receivables r where r.service_id=p_service_id and r.status in ('open','overdue','partial') limit 1));
end $$;

-- Read-only recovery: absence is not permission to mint a different key; replay the saved attempt.
create function public.get_financial_close_receipt(p_service_id uuid,p_request_key text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_receipt public.audit_logs%rowtype;
begin
 v_actor:=public.rls_current_app_user_id();
 if v_actor is null then raise exception 'Valid app session required.' using errcode='28000'; end if;
 perform public.get_service_financial_close_context(p_service_id);
 select * into v_receipt from public.audit_logs where metadata->>'financial_contract'='0050'
  and metadata->>'request_key'=nullif(trim(p_request_key),'');
 if not found then return jsonb_build_object('status','not_found'); end if;
 if v_receipt.entity_id is distinct from p_service_id or v_receipt.actor_app_user_id is distinct from v_actor then
  raise exception 'Receipt does not belong to this actor/service.' using errcode='42501'; end if;
 return jsonb_build_object('status','applied','request_key',p_request_key,'result',v_receipt.metadata->'result');
end $$;

-- Explicit security independent of project default grants (including the 2026-10 change).
do $security$
declare v_proc record;
begin
 for v_proc in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='elara_private' and p.proname in ('cash_close_driver','cash_service_close')) or
  (n.nspname='public' and p.proname in ('close_driver_service_financial','close_admin_service_financial','collect_receivable_cash','provision_driver_cash_account','get_service_financial_close_context','get_financial_close_receipt')) loop
  execute format('alter function %s owner to postgres',v_proc.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',v_proc.signature);
 end loop;
end $security$;
grant execute on function public.close_driver_service_financial(uuid,text,numeric,text,text,text),
 public.close_admin_service_financial(uuid,text,numeric,uuid,text,text,text),
 public.collect_receivable_cash(uuid,text,numeric,uuid,text,text,text),
 public.provision_driver_cash_account(uuid),public.get_service_financial_close_context(uuid),public.get_financial_close_receipt(uuid,text) to authenticated;
-- Replaced validators/compatibility RPCs preserve their prior owners and ACLs.
commit;
