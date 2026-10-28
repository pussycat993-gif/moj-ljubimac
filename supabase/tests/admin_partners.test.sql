-- Step 28 — Operator partners: FR-57 #2 (save_partner create / update with every FR-54 field, hours
-- replaced, featured, paid_until; the saved partner is returned by partners_nearby; a 4th featured partner
-- per type and city → featured_limit_reached; a partner whose paid_until was yesterday is absent from
-- partners_nearby but listed by admin_list_partners) and FR-58 (clicks recorded through
-- record_partner_click appear per partner and action in admin_partner_click_stats for the period).
-- Partners are created here in Kragujevac, where supabase/seed.sql has none. Ana (…06) is the Operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

create temporary table kg on commit drop as select id from public.cities where name_sr = 'Kragujevac';
grant select on kg to authenticated, service_role;
create temporary table saved (name text primary key, r jsonb) on commit drop;
grant all on saved to authenticated, service_role;

-- Non-Operator (Ivana): every admin function → forbidden_role ----------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.admin_list_partners(null, null, 20, 0)$$, 'P0001', 'forbidden_role',
  'EP-69: admin_list_partners by a non-Operator → forbidden_role');
select throws_ok($$select public.admin_partner_click_stats(null, 20, 0)$$, 'P0001', 'forbidden_role',
  'EP-70: admin_partner_click_stats by a non-Operator → forbidden_role');
select throws_ok(
  $$select public.save_partner(null, jsonb_build_object('type', 'vet', 'name', 'X', 'address', 'Y',
      'city_id', (select id from kg), 'phone', '+381 34 000 000', 'paid_until', '2027-12-31'), null)$$,
  'P0001', 'forbidden_role', 'EP-69: save_partner by a non-Operator → forbidden_role');
reset role;

-- Operator (Ana) --------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;

insert into saved values ('full', public.save_partner(null, jsonb_build_object(
  'type', 'vet',
  'name', 'Veterinarska ambulanta „Šumarice“',
  'address', 'Kralja Petra I 10',
  'city_id', (select id from kg),
  'phone', '+381 34 300 100',
  'email', 'kontakt@sumarice.rs',
  'website', 'https://sumarice.rs',
  'instagram', 'sumarice.vet',
  'description', 'Pregledi i vakcinacija.',
  'message_channel', 'viber',
  'message_number', '+381 64 300 1000',
  'latitude', 44.0128,
  'longitude', 20.9114,
  'logo_r2_key', 'p/test/logo-1.png',
  'featured', true,
  'paid_until', '2027-12-31'
), '[{"weekday":1,"opens":"08:00","closes":"20:00"},{"weekday":2,"opens":"08:00","closes":"20:00"},{"weekday":7,"opens":"00:00","closes":"24:00"}]'::jsonb));

select is((select r ->> 'name' from saved where name = 'full'), 'Veterinarska ambulanta „Šumarice“', 'FR-57 #2: create returns the Partner');
select is((select r ->> 'message_channel' from saved where name = 'full'), 'viber', 'FR-57 #2: message_channel stored');
select is((select r ->> 'paid_until' from saved where name = 'full'), '2027-12-31', 'FR-57 #2: paid_until stored');
select is((select (r ->> 'featured')::boolean from saved where name = 'full'), true, 'FR-57 #2: featured stored');
select is((select jsonb_array_length(r -> 'hours') from saved where name = 'full'), 3, 'FR-57 #2: hours stored');
select is((select r #>> '{hours,2,closes}' from saved where name = 'full'), '24:00', 'FR-57 #2: closes 24:00 allowed');
reset role;

-- Ivana sees it in the directory (EP-64).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select e ->> 'instagram' from jsonb_array_elements(public.partners_nearby(null, null, (select id from kg), null, null)) e
   where e ->> 'id' = (select r ->> 'id' from saved where name = 'full')),
  'sumarice.vet', 'FR-57 #2: the created partner is returned by partners_nearby with its fields');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;

-- Update: only the fields sent change; hours replaced; old logo queued.
insert into saved values ('updated', public.save_partner((select (r ->> 'id')::uuid from saved where name = 'full'),
  jsonb_build_object('name', 'Veterinarska klinika „Šumarice“', 'logo_r2_key', 'p/test/logo-2.png'),
  '[{"weekday":3,"opens":"09:00","closes":"17:00"}]'::jsonb));
select is((select r ->> 'name' from saved where name = 'updated'), 'Veterinarska klinika „Šumarice“', 'FR-57 #2: update changes the sent field');
select is((select r ->> 'phone' from saved where name = 'updated'), '+381 34 300 100', 'FR-57 #2: fields not sent are unchanged');
select is((select r -> 'hours' from saved where name = 'updated'), '[{"weekday":3,"opens":"09:00","closes":"17:00"}]'::jsonb,
  'FR-57 #2: hours are replaced');

insert into saved values ('nohours', public.save_partner((select (r ->> 'id')::uuid from saved where name = 'full'),
  jsonb_build_object('description', null), null));
select is((select jsonb_array_length(r -> 'hours') from saved where name = 'nohours'), 1, 'FR-57 #2: hours untouched when not sent');
select is((select r ->> 'description' from saved where name = 'nohours'), null, 'FR-57 #2: a field sent as null is cleared');
reset role;

select ok(exists(select 1 from public.r2_deletion_queue where r2_key = 'p/test/logo-1.png'),
  'EP-69: the replaced logo key is queued for deletion');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$select public.save_partner('f2800000-0000-4000-8000-0000000000ff', '{"name":"X"}'::jsonb, null)$$,
  'P0001', 'not_found', 'EP-69: updating an unknown partner → not_found');

-- BR-41: two more featured vets reach 3; a 4th → featured_limit_reached.
insert into saved
select 'f' || n, public.save_partner(null, jsonb_build_object(
  'type', 'vet', 'name', 'Vet K' || n, 'address', 'Adresa ' || n, 'city_id', (select id from kg),
  'phone', '+381 34 300 10' || n, 'latitude', 44.01, 'longitude', 20.91, 'featured', true, 'paid_until', '2027-12-31'), null)
from generate_series(2, 3) n;
select throws_ok(
  $$select public.save_partner(null, jsonb_build_object('type', 'vet', 'name', 'Vet K4', 'address', 'Adresa 4',
      'city_id', (select id from kg), 'phone', '+381 34 300 104', 'featured', true, 'paid_until', '2027-12-31'), null)$$,
  'P0001', 'featured_limit_reached', 'FR-57 #2: a 4th featured vet in the city → featured_limit_reached');

insert into saved values ('plain', public.save_partner(null, jsonb_build_object(
  'type', 'vet', 'name', 'Vet K5', 'address', 'Adresa 5', 'city_id', (select id from kg),
  'phone', '+381 34 300 105', 'paid_until', '2027-12-31'), null));
select throws_ok(
  format($$select public.save_partner(%L, '{"featured": true}'::jsonb, null)$$, (select r ->> 'id' from saved where name = 'plain')),
  'P0001', 'featured_limit_reached', 'FR-57 #2: featuring a 4th vet by update → featured_limit_reached');

-- E-23: paid_until yesterday.
insert into saved values ('expired', public.save_partner(null, jsonb_build_object(
  'type', 'grooming', 'name', 'Grooming „Istekao“', 'address', 'Adresa 6', 'city_id', (select id from kg),
  'phone', '+381 34 300 106', 'paid_until', ((now() at time zone 'Europe/Belgrade')::date - 1)::text), null));

create temporary table listed on commit drop as select public.admin_list_partners((select id from kg), null, 50, 0) as r;
select is((select (r ->> 'total')::int from listed), 5, 'EP-69: admin_list_partners counts every partner of the city');
select ok(
  exists(select 1 from listed, jsonb_array_elements(r -> 'items') e
         where e ->> 'id' = (select r ->> 'id' from saved where name = 'expired') and (e ->> 'active')::boolean = false),
  'FR-57 #2: the expired partner is listed by admin_list_partners (active = false)');
select is(
  (select (e ->> 'featured_count')::int from listed, jsonb_array_elements(r -> 'items') e
   where e ->> 'id' = (select r ->> 'id' from saved where name = 'plain')),
  3, 'EP-69: featured_count = featured vets in the same city');
select is(
  (select e ->> 'name' from listed, jsonb_array_elements(r -> 'items') with ordinality as t(e, n) order by n limit 1),
  'Grooming „Istekao“', 'EP-69: items sorted by name');
select ok(not (select ((r -> 'items') -> 0) ? 'logo_r2_key' from listed), 'EP-69: the list does not expose logo keys');
select is(
  (select jsonb_array_length(public.admin_list_partners((select id from kg), 'grooming', 20, 0) -> 'items')), 1,
  'EP-69: the type filter applies');
select throws_ok($$select public.admin_list_partners(null, null, 51, 0)$$, 'P0001', 'validation_failed',
  'EP-69: limit over 50 → validation_failed');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok(
  not exists(select 1 from jsonb_array_elements(public.partners_nearby(null, null, (select id from kg), null, null)) e
             where e ->> 'id' = (select r ->> 'id' from saved where name = 'expired')),
  'FR-57 #2: the expired partner is absent from partners_nearby');

-- FR-58: Ivana's clicks.
select public.record_partner_click((select (r ->> 'id')::uuid from saved where name = 'full'), 'call');
select public.record_partner_click((select (r ->> 'id')::uuid from saved where name = 'full'), 'call');
select public.record_partner_click((select (r ->> 'id')::uuid from saved where name = 'full'), 'website');
select public.record_partner_click((select (r ->> 'id')::uuid from saved where name = 'f2'), 'call');
reset role;

-- An older click two months back (as postgres).
insert into public.partner_clicks (partner_id, action, clicked_at)
values ((select (r ->> 'id')::uuid from saved where name = 'f3'), 'email', now() - interval '2 months');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
create temporary table stats on commit drop as select public.admin_partner_click_stats(null, 50, 0) as r;
select is((select r ->> 'period' from stats), to_char(now() at time zone 'Europe/Belgrade', 'YYYY-MM'),
  'EP-70: the default period is the current Europe/Belgrade month');
select is(
  (select jsonb_build_object('call', e -> 'call', 'message', e -> 'message', 'email', e -> 'email', 'website', e -> 'website', 'total', e -> 'total')
   from stats, jsonb_array_elements(r -> 'items') e where e ->> 'partner_id' = (select r ->> 'id' from saved where name = 'full')),
  '{"call":2,"message":0,"email":0,"website":1,"total":3}'::jsonb,
  'FR-58: clicks counted per partner and action in the period');
select ok(
  (select (r -> 'items' -> 0 ->> 'partner_id') = (select r ->> 'id' from saved where name = 'full') from stats),
  'EP-70: sorted by total desc');
select ok(
  not exists(select 1 from stats, jsonb_array_elements(r -> 'items') e where e ->> 'partner_id' = (select r ->> 'id' from saved where name = 'f3')),
  'EP-70: partners without clicks in the period are omitted');
select is(
  (select (e ->> 'email')::int from jsonb_array_elements(public.admin_partner_click_stats(
     to_char((now() - interval '2 months') at time zone 'Europe/Belgrade', 'YYYY-MM'), 20, 0) -> 'items') e
   where e ->> 'partner_id' = (select r ->> 'id' from saved where name = 'f3')),
  1, 'FR-58: a past period shows its own clicks');
select ok(
  (select (r -> 'available_periods') @> jsonb_build_array(to_char(now() at time zone 'Europe/Belgrade', 'YYYY-MM'),
     to_char((now() - interval '2 months') at time zone 'Europe/Belgrade', 'YYYY-MM')) from stats),
  'EP-70: available_periods lists the months with clicks');
select throws_ok($$select public.admin_partner_click_stats('2026-13', 20, 0)$$, 'P0001', 'validation_failed',
  'EP-70: a bad period → validation_failed');
reset role;

select * from finish();
rollback;
