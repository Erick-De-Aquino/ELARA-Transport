-- Migration 0020: allow drivers to read persons for accessible individual customers.
-- Fixes security_invoker driver views where customer rows are visible by RLS but
-- the linked individual customer person is still hidden.

drop policy if exists persons_select_accessible_customer_person on public.persons;
create policy persons_select_accessible_customer_person
on public.persons
for select
to authenticated
using (
  exists (
    select 1
    from public.customers customer
    where customer.customer_type = 'individual'
      and customer.person_id = persons.id
      and public.rls_driver_can_access_customer(customer.id)
  )
);

comment on policy persons_select_accessible_customer_person on public.persons is
  'Allows drivers to read only person rows for individual customers already visible through driver service RLS.';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persons'
      and policyname = 'persons_select_accessible_customer_person'
  ) then
    raise exception 'Missing policy public.persons.persons_select_accessible_customer_person.';
  end if;
end $$;
