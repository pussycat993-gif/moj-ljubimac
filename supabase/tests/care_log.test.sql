-- feeding_entries and stool_entries (TC §5.4): columns, enums, checks, index, created_by;
-- BR-04 (feeding and stool logs are unlimited on every tier).
-- Seeded: Ivana (…01, Premium, owner of Luna c1…01), Marko (…02, Free, owner of Kiki
-- c1…03), Jelena (…03, member of Ivana's household, Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Enums ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'feeding_type', array['dry', 'wet', 'treat', 'home_made', 'other'],
  'feeding types');
select enum_has_labels('public', 'stool_consistency', array['normal', 'soft', 'diarrhoea', 'hard'],
  'stool consistencies');

-- feeding_entries -------------------------------------------------------------------------------
select columns_are('public', 'feeding_entries', array[
  'id', 'pet_id', 'fed_at', 'type', 'brand', 'amount_g', 'note', 'created_by', 'created_at', 'updated_at'
], 'feeding_entries has the TC §5.4 columns');
select col_type_is('public', 'feeding_entries', 'fed_at', 'timestamp with time zone', 'fed_at is timestamptz');
select col_not_null('public', 'feeding_entries', 'fed_at', 'fed_at is not null');
select col_type_is('public', 'feeding_entries', 'type', 'feeding_type', 'type is feeding_type');
select col_not_null('public', 'feeding_entries', 'type', 'type is not null');
select col_type_is('public', 'feeding_entries', 'amount_g', 'numeric(8,1)', 'amount_g is numeric(8,1)');
select col_is_null('public', 'feeding_entries', 'amount_g', 'amount_g is optional');
select fk_ok('public', 'feeding_entries', 'pet_id', 'public', 'pets', 'id', 'pet_id → pets');
select fk_ok('public', 'feeding_entries', 'created_by', 'public', 'profiles', 'id', 'created_by → profiles');
select has_index('public', 'feeding_entries', 'feeding_entries_pet_id_fed_at_idx',
  array['pet_id', 'fed_at'], 'index (pet_id, fed_at)');
select ok((select relrowsecurity from pg_class where oid = 'public.feeding_entries'::regclass),
  'RLS is enabled on feeding_entries');

select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, amount_g, created_by)
    values ('c1000000-0000-4000-8000-000000000003', now(), 'dry', 0, 'a1000000-0000-4000-8000-000000000002')$$,
  '23514', null, 'amount_g must be > 0'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, created_by)
    values ('c1000000-0000-4000-8000-000000000003', now(), 'raw', 'a1000000-0000-4000-8000-000000000002')$$,
  '22P02', null, 'an unknown feeding type is rejected'
);

-- stool_entries ---------------------------------------------------------------------------------
select columns_are('public', 'stool_entries', array[
  'id', 'pet_id', 'observed_at', 'consistency', 'blood_or_mucus', 'note', 'created_by', 'created_at', 'updated_at'
], 'stool_entries has the TC §5.4 columns');
select col_not_null('public', 'stool_entries', 'observed_at', 'observed_at is not null');
select col_type_is('public', 'stool_entries', 'consistency', 'stool_consistency', 'consistency is stool_consistency');
select col_not_null('public', 'stool_entries', 'consistency', 'consistency is not null');
select col_not_null('public', 'stool_entries', 'blood_or_mucus', 'blood_or_mucus is not null');
select col_default_is('public', 'stool_entries', 'blood_or_mucus', 'false', 'blood_or_mucus defaults to false');
select fk_ok('public', 'stool_entries', 'pet_id', 'public', 'pets', 'id', 'pet_id → pets');
select ok((select relrowsecurity from pg_class where oid = 'public.stool_entries'::regclass),
  'RLS is enabled on stool_entries');

-- created_by --------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency)
    values ('c1000000-0000-4000-8000-000000000003', now(), 'normal')$$,
  'P0001', 'internal_error', 'a System insert without an author is refused'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
insert into public.feeding_entries (pet_id, fed_at, type, note)
values ('c1000000-0000-4000-8000-000000000001', now(), 'treat', 'created-by-check');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select created_by from public.feeding_entries where note = 'created-by-check'),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'created_by is set from the session on insert'
);

-- BR-26: the entry stays when its author is deleted.
delete from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000003';
delete from auth.users where id = 'a1000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.feeding_entries
   where note = 'created-by-check' and created_by is null),
  1, 'created_by is cleared when the author is deleted, the entry remains'
);

-- Cascade with the pet.
insert into public.pets (id, owner_id, name, species, sex)
values ('e7000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Privremeni', 'dog', 'male');
insert into public.feeding_entries (pet_id, fed_at, type, created_by)
values ('e7000000-0000-4000-8000-000000000001', now(), 'dry', 'a1000000-0000-4000-8000-000000000001');
insert into public.stool_entries (pet_id, observed_at, consistency, created_by)
values ('e7000000-0000-4000-8000-000000000001', now(), 'hard', 'a1000000-0000-4000-8000-000000000001');
delete from public.pets where id = 'e7000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.feeding_entries where pet_id = 'e7000000-0000-4000-8000-000000000001')
  + (select count(*)::int from public.stool_entries where pet_id = 'e7000000-0000-4000-8000-000000000001'),
  0, 'feeding and stool entries are deleted with their pet'
);

-- BR-04: unlimited on every tier --------------------------------------------------------------------
-- Marko is Free (Kiki).
select ok(not public.is_premium('a1000000-0000-4000-8000-000000000002'), 'Marko is on Free');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, amount_g)
    select 'c1000000-0000-4000-8000-000000000003', now() - make_interval(hours => g), 'dry', 20
    from generate_series(1, 60) g$$,
  'a Free owner adds 60 feeding entries (BR-04)'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency)
    select 'c1000000-0000-4000-8000-000000000003', now() - make_interval(hours => g), 'normal'
    from generate_series(1, 60) g$$,
  'a Free owner adds 60 stool entries (BR-04)'
);
select is((select count(*)::int from public.feeding_entries
           where pet_id = 'c1000000-0000-4000-8000-000000000003'), 60, 'all 60 feeding entries are kept');
select is((select count(*)::int from public.stool_entries
           where pet_id = 'c1000000-0000-4000-8000-000000000003'), 60, 'all 60 stool entries are kept');
reset role;

-- Premium owner, too.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type)
    select 'c1000000-0000-4000-8000-000000000001', now() - make_interval(hours => g), 'wet'
    from generate_series(1, 30) g$$,
  'a Premium owner adds 30 feeding entries (BR-04)'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency)
    select 'c1000000-0000-4000-8000-000000000001', now() - make_interval(hours => g), 'soft'
    from generate_series(1, 30) g$$,
  'a Premium owner adds 30 stool entries (BR-04)'
);
reset role;

select * from finish();
rollback;
