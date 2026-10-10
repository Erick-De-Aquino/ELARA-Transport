-- Read-only administrative cash movement contract. No table, RLS or financial changes.
create or replace function public.get_admin_cash_movements(
 p_cash_account_id uuid default null,
 p_movement_type text default null,
 p_source_type text default null,
 p_date_from timestamptz default null,
 p_date_to timestamptz default null,
 p_search text default null,
 p_limit integer default 100,
 p_offset integer default 0
)
returns table(
 cash_movement_id uuid,
 human_code text,
 cash_account_id uuid,
 cash_account_name text,
 cash_account_type text,
 movement_type text,
 movement_category text,
 amount numeric(14,2),
 currency_code text,
 occurred_at timestamptz,
 created_at timestamptz,
 description text,
 source_type text,
 source_id uuid,
 remittance_id uuid,
 remittance_human_code text,
 original_movement_id uuid,
 original_movement_human_code text,
 created_by uuid,
 created_by_human_code text,
 actor_driver_id uuid,
 actor_name text,
 metadata jsonb,
 total_count bigint
)
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare
 v_type text:=nullif(trim(p_movement_type),'');
 v_source text:=nullif(trim(p_source_type),'');
 v_search text:=nullif(trim(p_search),'');
 v_limit integer:=coalesce(p_limit,100);
 v_offset integer:=coalesce(p_offset,0);
begin
 perform public.require_admin_user();
 if v_limit<1 or v_limit>200 or v_offset<0 then
  raise exception 'Cash movement limit must be 1..200 and offset nonnegative.' using errcode='23514';
 end if;
 if v_type is not null and v_type not in ('inflow','outflow') then
  raise exception 'Invalid cash movement type filter.' using errcode='23514';
 end if;
 if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then
  raise exception 'Invalid cash movement date range.' using errcode='23514';
 end if;
 return query
 select m.id,m.human_code,c.id,c.name,c.account_type,m.movement_type,m.movement_category,
  m.amount,m.currency_code,m.occurred_at,m.created_at,m.description,m.source_type,m.source_id,
  m.remittance_id,r.human_code,m.original_movement_id,o.human_code,m.created_by,u.human_code,m.actor_driver_id,
  coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),u.human_code,
   nullif(trim(concat_ws(' ',dp.first_name,dp.last_name)),''),d.human_code),
  m.metadata,count(*) over()
 from public.cash_movements m
 join public.cash_accounts c on c.id=m.cash_account_id
 left join public.app_users u on u.id=m.created_by
 left join public.persons p on p.id=u.person_id
 left join public.drivers d on d.id=m.actor_driver_id
 left join public.persons dp on dp.id=d.person_id
 left join public.cash_remittances r on r.id=coalesce(m.remittance_id,case when m.source_type='cash_remittance' then m.source_id end)
 left join public.cash_movements o on o.id=m.original_movement_id
 where (p_cash_account_id is null or m.cash_account_id=p_cash_account_id)
  and (v_type is null or m.movement_type=v_type)
  and (v_source is null or m.source_type=v_source)
  and (p_date_from is null or m.occurred_at>=p_date_from)
  and (p_date_to is null or m.occurred_at<=p_date_to)
  and (v_search is null or concat_ws(' ',m.human_code,m.description,c.name,m.source_type,m.source_id::text,
   r.human_code,o.human_code,p.first_name,p.last_name,u.human_code,d.human_code) ilike '%'||v_search||'%')
 order by m.occurred_at desc,m.created_at desc,m.human_code desc,m.id desc
 limit v_limit offset v_offset;
end;
$$;

comment on function public.get_admin_cash_movements(uuid,text,text,timestamptz,timestamptz,text,integer,integer)
 is 'Admin-only read of immutable cash movements, including originals and reversals. No audit or mutations.';
revoke all on function public.get_admin_cash_movements(uuid,text,text,timestamptz,timestamptz,text,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.get_admin_cash_movements(uuid,text,text,timestamptz,timestamptz,text,integer,integer) to authenticated;
