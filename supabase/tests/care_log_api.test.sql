-- view:feeding_entries_api / view:stool_entries_api (EP-17; API §5.1 Part A, §6 FeedingEntry,
-- StoolEntry, Access) and the EP-18 write rules.
-- FR-14 / FR-16: feeding and stool entries have no limit on Free or Premium (BR-04). FR-28: a member
-- adds entries and edits / deletes only their own (forbidden_role, BR-22, BR-23, E-12); a read-only
-- household blocks member writes (household_read_only, BR-28).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium; Luna c1…01), Marko (…02, Free; Kiki c1…03), Jelena
-- (…03, member of Ivana's household, Luna shared), Milica (…04, admin of the shelter holding Žuća
-- c1…04). Luna has 3 feeding entries (the 2026-10-18 16:00 UTC one by Jelena) and 2 stool entries.
begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

select has_view('public', 'feeding_entries_api', 'view:feeding_entries_api exists');
select has_view('public', 'stool_entries_api', 'view:stool_entries_api exists');
select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.feeding_entries_api'::regclass),
  'feeding_entries_api is security_invoker (RLS on feeding_entries decides visibility)'
);
select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.stool_entries_api'::regclass),
  'stool_entries_api is security_invoker (RLS on stool_entries decides visibility)'
);
select columns_are('public', 'feeding_entries_api',
  array['id', 'pet_id', 'fed_at', 'type', 'brand', 'amount_g', 'note', 'created_by', 'created_by_name', 'created_at', 'access'],
  'feeding_entries_api has the FeedingEntry fields'
);
select columns_are('public', 'stool_entries_api',
  array['id', 'pet_id', 'observed_at', 'consistency', 'blood_or_mucus', 'note', 'created_by', 'created_by_name', 'created_at', 'access'],
  'stool_entries_api has the StoolEntry fields'
);
select ok(not has_table_privilege('anon', 'public.feeding_entries_api', 'select'), 'anon cannot read feeding_entries_api');
select ok(not has_table_privilege('anon', 'public.stool_entries_api', 'select'), 'anon cannot read stool_entries_api');
select ok(has_table_privilege('authenticated', 'public.feeding_entries_api', 'select'), 'authenticated can read feeding_entries_api');
select ok(has_table_privilege('authenticated', 'public.stool_entries_api', 'select'), 'authenticated can read stool_entries_api');

-- FR-14 / FR-16: a Free owner (Marko) logs more than any Free limit -----------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, brand, amount_g)
    select 'c1000000-0000-4000-8000-000000000003', now() - make_interval(hours => g), 'dry', 'Versele-Laga', 25.5
    from generate_series(1, 60) g$$,
  'FR-14: a Free owner adds 60 feeding entries (no limit, BR-04)'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency)
    select 'c1000000-0000-4000-8000-000000000003', now() - make_interval(hours => g), 'normal'
    from generate_series(1, 60) g$$,
  'FR-16: a Free owner adds 60 stool entries (no limit, BR-04)'
);
select is(
  (select count(*)::int from public.feeding_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  60, 'all 60 feeding entries are listed'
);
select is(
  (select count(*)::int from public.stool_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  60, 'all 60 stool entries are listed'
);
select is(
  (select row(created_by, created_by_name, amount_g, access)::text from public.feeding_entries_api
   where pet_id = 'c1000000-0000-4000-8000-000000000003' order by fed_at desc limit 1),
  row('a1000000-0000-4000-8000-000000000002'::uuid, 'Marko Jovanović', 25.5::numeric(8, 1),
      '{"role": "owner", "can_edit": true, "can_delete": true}'::jsonb)::text,
  'the new entry is the owner''s, with created_by_name and full access (read back through the view)'
);
select is(
  (select count(*)::int from public.feeding_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'a user with no relation sees none of Luna''s feeding entries'
);
select is(
  (select count(*)::int from public.stool_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'a user with no relation sees none of Luna''s stool entries'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000001', now(), 'wet')$$,
  '42501', null, 'a user with no relation cannot add a feeding entry to Luna'
);
reset role;

-- The Premium owner (Ivana) ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table owner_feeding on commit drop as
select * from public.feeding_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001';
create temp table owner_stool on commit drop as
select * from public.stool_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001';
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type)
    select 'c1000000-0000-4000-8000-000000000001', now() - make_interval(mins => g), 'treat'
    from generate_series(1, 30) g$$,
  'FR-14: a Premium owner adds feeding entries without a limit too'
);
reset role;
select is((select count(*)::int from owner_feeding), 3, 'owner sees Luna''s feeding entries');
select is((select count(*)::int from owner_stool), 2, 'owner sees Luna''s stool entries');
select is(
  (select created_by_name from owner_feeding where fed_at = '2026-10-18 16:00:00+00'),
  'Jelena Nikolić', 'created_by_name is the author''s full name'
);
select ok(
  (select bool_and((access ->> 'can_edit')::boolean and (access ->> 'can_delete')::boolean and access ->> 'role' = 'owner')
   from (select access from owner_feeding union all select access from owner_stool) a),
  'owner may edit and delete every entry, including the member''s'
);

-- Organisation roles have no relation to the care log (EP-17) ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency) values ('c1000000-0000-4000-8000-000000000004', now(), 'normal')$$,
  '42501', null, 'an organisation admin cannot log stool for the organisation''s animal'
);
reset role;

-- Household member (Jelena) ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
create temp table member_feeding on commit drop as
select * from public.feeding_entries_api
where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at < '2026-10-20';
reset role;
select is((select count(*)::int from member_feeding), 3, 'member sees the shared pet''s feeding entries');
select is(
  (select array_agg((access ->> 'can_edit')::boolean order by fed_at) from member_feeding),
  array[false, true, false],
  'member access: only the entry they logged is editable (BR-23)'
);
select is(
  (select access from member_feeding where fed_at = '2026-10-18 16:00:00+00'),
  '{"role": "member", "can_edit": true, "can_delete": true}'::jsonb,
  'member access on their own entry'
);

set local role authenticated;
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, brand, amount_g, note)
    values ('c1000000-0000-4000-8000-000000000001', '2026-10-20 06:00:00+00', 'dry', 'Royal Canin Indoor', 30, 'Jutarnji obrok')$$,
  'FR-28: a member can add a feeding entry'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency, blood_or_mucus)
    values ('c1000000-0000-4000-8000-000000000001', '2026-10-20 07:00:00+00', 'hard', true)$$,
  'FR-28: a member can add a stool entry'
);
select is(
  (select row(created_by, (access ->> 'can_edit')::boolean)::text from public.stool_entries_api
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and observed_at = '2026-10-20 07:00:00+00'),
  row('a1000000-0000-4000-8000-000000000003'::uuid, true)::text,
  'the member''s new stool entry is their own and editable by them'
);
select lives_ok(
  $$update public.feeding_entries set amount_g = 35 where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-20 06:00:00+00'$$,
  'a member can edit their own feeding entry'
);
select throws_ok(
  $$update public.feeding_entries set amount_g = 40 where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-19 06:30:00+00'$$,
  'P0001', 'forbidden_role', 'FR-28 / E-12: editing the owner''s feeding entry → forbidden_role'
);
select throws_ok(
  $$delete from public.feeding_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-19 06:30:00+00'$$,
  'P0001', 'forbidden_role', 'FR-28 / E-12: deleting the owner''s feeding entry → forbidden_role'
);
select throws_ok(
  $$update public.stool_entries set consistency = 'normal' where pet_id = 'c1000000-0000-4000-8000-000000000001' and observed_at = '2026-10-19 08:40:00+00'$$,
  'P0001', 'forbidden_role', 'FR-28 / E-12: editing the owner''s stool entry → forbidden_role'
);
select throws_ok(
  $$delete from public.stool_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and observed_at = '2026-10-19 08:40:00+00'$$,
  'P0001', 'forbidden_role', 'FR-28 / E-12: deleting the owner''s stool entry → forbidden_role'
);
select lives_ok(
  $$delete from public.stool_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and observed_at = '2026-10-20 07:00:00+00'$$,
  'a member can delete their own stool entry'
);
reset role;
select is(
  (select row(amount_g, note)::text from public.feeding_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-19 06:30:00+00'),
  row(30::numeric(8, 1), 'Pojela sve')::text, 'the owner''s entry is unchanged'
);

-- Read-only household (BR-28) ------------------------------------------------------------------------------
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000001', '2026-10-20 16:00:00+00', 'wet')$$,
  'P0001', 'household_read_only', 'read-only household: member feeding insert → household_read_only'
);
select throws_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency) values ('c1000000-0000-4000-8000-000000000001', '2026-10-20 16:00:00+00', 'soft')$$,
  'P0001', 'household_read_only', 'read-only household: member stool insert → household_read_only'
);
select throws_ok(
  $$update public.feeding_entries set amount_g = 20 where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-20 06:00:00+00'$$,
  'P0001', 'household_read_only', 'read-only household: editing even their own entry → household_read_only'
);
select throws_ok(
  $$delete from public.feeding_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-20 06:00:00+00'$$,
  'P0001', 'household_read_only', 'read-only household: deleting their own entry → household_read_only'
);
select ok(
  (select bool_and(not (access ->> 'can_edit')::boolean and not (access ->> 'can_delete')::boolean)
   from (
     select access from public.feeding_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001'
     union all
     select access from public.stool_entries_api where pet_id = 'c1000000-0000-4000-8000-000000000001'
   ) a),
  'read-only household: every entry is read-only for the member'
);
reset role;
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';

-- Owner removes the member's entry; the EP-18 Request checks ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from public.feeding_entries where pet_id = 'c1000000-0000-4000-8000-000000000001' and fed_at = '2026-10-20 06:00:00+00'$$,
  'the owner can delete the member''s entry'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, brand) values ('c1000000-0000-4000-8000-000000000001', now(), 'dry', repeat('a', 101))$$,
  '23514', null, 'EP-18: brand longer than 100 characters is rejected'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, note) values ('c1000000-0000-4000-8000-000000000001', now(), 'dry', repeat('a', 501))$$,
  '23514', null, 'EP-18: feeding note longer than 500 characters is rejected'
);
select throws_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency, note) values ('c1000000-0000-4000-8000-000000000001', now(), 'soft', repeat('a', 501))$$,
  '23514', null, 'EP-18: stool note longer than 500 characters is rejected'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, amount_g) values ('c1000000-0000-4000-8000-000000000001', now(), 'dry', 0)$$,
  '23514', null, 'EP-18: amount_g must be greater than 0'
);
reset role;

select * from finish();
rollback;
