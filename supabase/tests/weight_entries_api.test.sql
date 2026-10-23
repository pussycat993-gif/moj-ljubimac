-- view:weight_entries_api (EP-08; API §5.1 Part A, §6 WeightEntry, Access) and the EP-08 write rules.
-- FR-28: a member adds weight entries; someone else's entry cannot be changed (forbidden_role, BR-23,
-- E-12); a read-only household blocks member writes (household_read_only, BR-28).
-- Seeded (supabase/seed.sql): Ivana (…01, Luna + Maks), Marko (…02, Kiki), Jelena (…03, member of
-- Ivana's household, Luna shared). Luna has 4 weights; the 2026-10-19 one was logged by Jelena.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

select has_view('public', 'weight_entries_api', 'view:weight_entries_api exists');
select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.weight_entries_api'::regclass),
  'weight_entries_api is security_invoker (RLS on weight_entries decides visibility)'
);
select columns_are('public', 'weight_entries_api',
  array['id', 'pet_id', 'measured_on', 'value', 'weight_unit', 'note', 'created_by', 'created_by_name', 'created_at', 'access'],
  'weight_entries_api has the WeightEntry fields'
);
select ok(not has_table_privilege('anon', 'public.weight_entries_api', 'select'), 'anon cannot read weight_entries_api');
select ok(has_table_privilege('authenticated', 'public.weight_entries_api', 'select'), 'authenticated can read weight_entries_api');

-- Owner (Ivana) ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table owner_rows on commit drop as
select * from public.weight_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001';
reset role;

select is((select count(*)::int from owner_rows), 4, 'owner sees all of Luna''s weight entries');
select is(
  (select array_agg(value::text || ' ' || weight_unit order by measured_on) from owner_rows),
  array['3.800 kg', '4.000 kg', '4.100 kg', '4.200 kg'],
  'values come with the pet''s weight_unit'
);
select is(
  (select created_by_name from owner_rows where measured_on = '2026-10-19'),
  'Jelena Nikolić',
  'created_by_name is the author''s full name'
);
select ok(
  (select bool_and((access ->> 'can_edit')::boolean and (access ->> 'can_delete')::boolean and access ->> 'role' = 'owner') from owner_rows),
  'owner may edit and delete every entry, including the member''s'
);

-- No relation (Marko) -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.weight_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'a user with no relation sees none of Luna''s entries'
);
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value) values ('c1000000-0000-4000-8000-000000000001', '2026-10-20', 4.3)$$,
  '42501', null, 'a user with no relation cannot add a weight to Luna'
);
reset role;

-- Household member (Jelena) -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
create temp table member_rows on commit drop as
select * from public.weight_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001';
reset role;
select is((select count(*)::int from member_rows), 4, 'member sees the shared pet''s weight entries');
select is(
  (select array_agg((access ->> 'can_edit')::boolean order by measured_on) from member_rows),
  array[false, false, false, true],
  'member access: only the entry they logged is editable (BR-23)'
);
select is(
  (select access from member_rows where measured_on = '2026-10-19'),
  '{"role": "member", "can_edit": true, "can_delete": true}'::jsonb,
  'member access on their own entry'
);

set local role authenticated;
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value, note)
    values ('c1000000-0000-4000-8000-000000000001', '2026-10-20', 4.3, 'Posle doručka')$$,
  'FR-28: a member can add a weight entry'
);
select is(
  (select row(created_by, weight_unit, (access ->> 'can_edit')::boolean)::text from public.weight_entries_api
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-10-20'),
  row('a1000000-0000-4000-8000-000000000003'::uuid, 'kg'::public.weight_unit, true)::text,
  'the new entry is the member''s own and editable by them (read back through the view)'
);
select lives_ok(
  $$update public.weight_entries set value = 4.35 where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-10-20'$$,
  'a member can edit their own entry'
);
select throws_ok(
  $$update public.weight_entries set value = 3.9 where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-04-17'$$,
  'P0001', 'forbidden_role', 'FR-28 / E-12: editing the owner''s entry → forbidden_role'
);
select throws_ok(
  $$delete from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-04-17'$$,
  'P0001', 'forbidden_role', 'FR-28 / E-12: deleting the owner''s entry → forbidden_role'
);
reset role;
select is(
  (select value::text from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-04-17'),
  '3.800', 'the owner''s entry is unchanged'
);

-- Read-only household (BR-28) ------------------------------------------------------------------------
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value) values ('c1000000-0000-4000-8000-000000000001', '2026-10-21', 4.4)$$,
  'P0001', 'household_read_only', 'read-only household: member insert → household_read_only'
);
select throws_ok(
  $$update public.weight_entries set value = 4.4 where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-10-20'$$,
  'P0001', 'household_read_only', 'read-only household: editing even their own entry → household_read_only'
);
select throws_ok(
  $$delete from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-10-20'$$,
  'P0001', 'household_read_only', 'read-only household: deleting their own entry → household_read_only'
);
select ok(
  (select bool_and(not (access ->> 'can_edit')::boolean and not (access ->> 'can_delete')::boolean)
   from public.weight_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  'read-only household: every entry is read-only for the member'
);
reset role;
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';

-- Owner writes, the member's entry and the EP-08 Request checks ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and measured_on = '2026-10-20'$$,
  'the owner can delete the member''s entry'
);
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value, note)
    values ('c1000000-0000-4000-8000-000000000001', '2026-10-20', 4.3, repeat('a', 501))$$,
  '23514', null, 'EP-08: note ≤ 500 chars'
);
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value) values ('c1000000-0000-4000-8000-000000000001', '2026-10-20', 0)$$,
  '23514', null, 'EP-08: value > 0'
);

-- FR-03: after a unit change the view returns grams ------------------------------------------------------
update public.pets set weight_unit = 'g' where id = 'c1000000-0000-4000-8000-000000000001';
select is(
  (select array_agg(value::text || ' ' || weight_unit order by measured_on) from public.weight_entries_api
   where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  array['3800.000 g', '4000.000 g', '4100.000 g', '4200.000 g'],
  'FR-03: entries are returned in grams once the pet''s unit is g'
);
reset role;
select is(
  (select count(*)::int from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  4, 'Luna is back to her 4 seeded entries'
);

select * from finish();
rollback;
