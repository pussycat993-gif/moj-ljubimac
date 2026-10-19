-- BR-50: changing a pet's weight unit converts all its existing weight entries (EP-04).
-- Seeded: Ivana (…01) owns Luna (c1…01, kg: 3.8, 4.0, 4.1, 4.2) and Maks (c1…02, kg: 18.4).
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update public.pets set weight_unit = 'g' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'the owner switches Luna to grams'
);
select results_eq(
  $$select value from public.weight_entries
    where pet_id = 'c1000000-0000-4000-8000-000000000001' order by measured_on, value$$,
  $$values (3800.000::numeric(9,3)), (4000.000), (4100.000), (4200.000)$$,
  'kg → g multiplies every entry by 1000'
);
select is(
  (select value from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000002'),
  18.400::numeric(9,3), 'another pet''s entries are untouched'
);

insert into public.weight_entries (pet_id, measured_on, value)
values ('c1000000-0000-4000-8000-000000000001', current_date, 4250);

select lives_ok(
  $$update public.pets set weight_unit = 'kg' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'the owner switches Luna back to kilograms'
);
select results_eq(
  $$select value from public.weight_entries
    where pet_id = 'c1000000-0000-4000-8000-000000000001' order by measured_on, value$$,
  $$values (3.800::numeric(9,3)), (4.000), (4.100), (4.200), (4.250)$$,
  'g → kg divides every entry by 1000, including entries added in grams'
);

select lives_ok(
  $$update public.pets set name = 'Luna' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'an update that keeps the unit'
);
select results_eq(
  $$select value from public.weight_entries
    where pet_id = 'c1000000-0000-4000-8000-000000000001' order by measured_on, value$$,
  $$values (3.800::numeric(9,3)), (4.000), (4.100), (4.200), (4.250)$$,
  'leaves the entries as they are'
);

select * from finish();
rollback;
