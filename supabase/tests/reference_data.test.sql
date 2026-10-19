-- cities (TC §5.7, ADR-11, EP-67) and app_settings (TC §5.5, BR-14b, EP-71).
-- Seeded users: Marko (…02, not Operator), Ana (…06, Operator).
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- cities: columns -------------------------------------------------------------------
select has_table('public', 'cities', 'cities exists');
select columns_are('public', 'cities', array[
  'id', 'name_sr', 'name_en', 'latitude', 'longitude', 'created_at', 'updated_at'
], 'cities has id, name_sr, name_en, latitude, longitude');
select col_type_is('public', 'cities', 'name_sr', 'text', 'name_sr is text');
select col_type_is('public', 'cities', 'name_en', 'text', 'name_en is text');
select col_type_is('public', 'cities', 'latitude', 'double precision', 'latitude is double precision');
select col_type_is('public', 'cities', 'longitude', 'double precision', 'longitude is double precision');

-- cities seed: every municipality/city seat, both names, coordinates -------------------
select is((select count(*)::int from public.cities), 145, 'the seed holds 145 seats (117 municipalities + 28 cities)');
select is(
  (select count(*)::int from public.cities
   where coalesce(name_sr, '') = '' or coalesce(name_en, '') = ''
      or latitude not between 42.2 and 46.2 or longitude not between 18.8 and 23.1),
  0,
  'every city has both names and coordinates inside Serbia'
);
select is(
  (select count(*)::int from (select name_sr from public.cities group by name_sr having count(*) > 1) d),
  0,
  'no seat is listed twice'
);
select is(
  (select name_en from public.cities where name_sr = 'Novi Sad' and latitude between 45.2 and 45.3 and longitude between 19.8 and 19.9),
  'Novi Sad',
  'Novi Sad is seeded with coordinates'
);
select is(
  (select name_en from public.cities where name_sr = 'Beograd' and latitude between 44.7 and 44.9 and longitude between 20.4 and 20.5),
  'Belgrade',
  'Beograd is seeded with its English name and coordinates'
);
select is(
  (select name_en from public.cities where name_sr = 'Bečej' and latitude between 45.6 and 45.7 and longitude between 20.0 and 20.1),
  'Bečej',
  'Bečej is seeded with coordinates'
);
select is(
  (select count(*)::int from public.cities where name_sr in ('Zemun', 'Petrovaradin', 'Priština')),
  0,
  'no city municipalities and no Kosovo and Metohija seats'
);

-- cities RLS: everyone reads, nobody writes ------------------------------------------------
set local role anon;
select is((select count(*)::int from public.cities), 145, 'anon reads cities');
select throws_ok(
  $$insert into public.cities (name_sr, name_en, latitude, longitude) values ('X', 'X', 45, 20)$$,
  '42501', null, 'anon cannot insert cities'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.cities), 145, 'authenticated reads cities');
select throws_ok(
  $$insert into public.cities (name_sr, name_en, latitude, longitude) values ('X', 'X', 45, 20)$$,
  '42501', null, 'authenticated cannot insert cities'
);
select throws_ok($$update public.cities set name_en = 'X'$$, '42501', null, 'authenticated cannot update cities');
select throws_ok($$delete from public.cities$$, '42501', null, 'authenticated cannot delete cities');

-- app_settings: one row, viber_enabled false (BR-14b) ---------------------------------------
reset role;
select columns_are('public', 'app_settings', array['id', 'viber_enabled', 'created_at', 'updated_at'],
  'app_settings has viber_enabled');
select col_default_is('public', 'app_settings', 'viber_enabled', 'false', 'viber_enabled defaults to false');
select is((select count(*)::int from public.app_settings), 1, 'app_settings holds exactly one row');
select is((select viber_enabled from public.app_settings), false, 'Viber is off (BR-14b)');
select throws_ok(
  $$insert into public.app_settings (viber_enabled) values (false)$$,
  '23505', null, 'a second app_settings row is rejected'
);

-- app_settings RLS: Operator only (EP-71) ------------------------------------------------------
set local role authenticated; -- still Marko (not Operator)
select is((select count(*)::int from public.app_settings), 0, 'a non-Operator sees no app_settings');
update public.app_settings set viber_enabled = true;
reset role;
select is((select viber_enabled from public.app_settings), false, 'a non-Operator cannot update app_settings');
set local role authenticated;
select throws_ok(
  $$insert into public.app_settings (viber_enabled) values (true)$$,
  '42501', null, 'clients cannot insert app_settings'
);
select throws_ok($$delete from public.app_settings$$, '42501', null, 'clients cannot delete app_settings');

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.app_settings), 1, 'the Operator reads app_settings');
update public.app_settings set viber_enabled = true;
reset role;
select is((select viber_enabled from public.app_settings), true, 'the Operator updates viber_enabled');

reset role;
set local role anon;
select throws_ok($$select * from public.app_settings$$, '42501', null, 'anon cannot read app_settings');
reset role;

select * from finish();
rollback;
