-- rpc:partners_nearby (EP-64): BR-40 / FR-52 visibility, featured first then distance
-- (BR-41, FR-52), coordinates vs city (BR-42, FR-53), validation, p_type and p_limit.
-- Seeded in Novi Sad (centre 45.255134, 19.845176): „Dr Vet“ (vet, featured, e1…01),
-- „Šapica“ (pet_shop, e1…02), „Čupko“ (grooming, e1…03), „Kod Mace“ (hidden, e1…04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Setup (as postgres) -------------------------------------------------------------------------
-- „Zdrava šapa“ is closer to the centre than the featured „Dr Vet“; „Stara“ expired
-- yesterday; „Bez koordinata“ has no coordinates; „Vračar“ is in Beograd.
insert into public.partners (id, type, name, address, city_id, phone, latitude, longitude, paid_until)
select v.id, v.type::public.partner_type, v.name, 'Adresa', c.id, '+381 21 000 000', v.lat, v.lng, v.paid_until
from (values
  ('fd000000-0000-4000-8000-000000000001'::uuid, 'vet', 'Veterinarska stanica „Zdrava šapa“', 'Novi Sad',
   45.2552::double precision, 19.8452::double precision, date '2027-12-31'),
  ('fd000000-0000-4000-8000-000000000002'::uuid, 'vet', 'Veterinarska ambulanta „Stara“', 'Novi Sad',
   45.2551, 19.8451, (now() at time zone 'Europe/Belgrade')::date - 1),
  ('fd000000-0000-4000-8000-000000000003'::uuid, 'pet_shop', 'Pet shop „Bez koordinata“', 'Novi Sad',
   null, null, date '2027-12-31'),
  ('fd000000-0000-4000-8000-000000000004'::uuid, 'vet', 'Veterinarska ambulanta „Vračar“', 'Beograd',
   44.8100, 20.4600, date '2027-12-31'),
  ('fd000000-0000-4000-8000-000000000005'::uuid, 'pet_hotel', 'Pet hotel „Do danas“', 'Novi Sad',
   45.2600, 19.8500, (now() at time zone 'Europe/Belgrade')::date)
) as v (id, type, name, city, lat, lng, paid_until)
join public.cities c on c.name_sr = v.city;

create temporary table ns as select id from public.cities where name_sr = 'Novi Sad';
grant select on ns to authenticated;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- City mode (no coordinates) ------------------------------------------------------------------
create temporary table r_city on commit drop as
select (e.ordinality)::int as pos, e.value as p
from jsonb_array_elements(public.partners_nearby(null, null, (select id from ns), null, null)) with ordinality as e;

select is(
  (select array_agg(p->>'name' order by pos) from r_city),
  array[
    'Veterinarska ambulanta „Dr Vet“', 'Veterinarska stanica „Zdrava šapa“', 'Pet shop „Šapica“',
    'Pet hotel „Do danas“', 'Grooming salon „Čupko“', 'Pet shop „Bez koordinata“'
  ],
  'FR-52: featured first, then the others by distance (no coordinates last)'
);
select is(
  (select count(*)::int from r_city where p->>'id' in ('e1000000-0000-4000-8000-000000000004', 'fd000000-0000-4000-8000-000000000002')),
  0, 'BR-40 / FR-52: partners whose paid_until has passed are not listed'
);
select is(
  (select count(*)::int from r_city where p->>'id' = 'fd000000-0000-4000-8000-000000000005'),
  1, 'BR-40: paid_until today (Europe/Belgrade) is still listed'
);
select is(
  (select count(*)::int from r_city where p->>'id' = 'fd000000-0000-4000-8000-000000000004'),
  0, 'only partners of the resolved city are listed'
);
select ok(
  (select bool_and((a.p->>'distance_km')::numeric <= (b.p->>'distance_km')::numeric)
   from r_city a join r_city b on b.pos = a.pos + 1
   where a.pos >= 2 and b.p->>'distance_km' is not null),
  'FR-52: after the featured, distance_km ascends'
);
select is(
  (select (p->>'distance_km')::numeric from r_city where p->>'id' = 'e1000000-0000-4000-8000-000000000003'),
  round(private.distance_km(45.255134, 19.845176, 45.2474, 19.8130)::numeric, 1),
  'BR-42 / FR-53: without coordinates, distance is from the city''s coordinates'
);
select is(
  (select p->'distance_km' from r_city where p->>'id' = 'fd000000-0000-4000-8000-000000000003'),
  'null'::jsonb, 'a partner without coordinates has distance_km null'
);
select is(
  (select p->'logo_url' from r_city where pos = 1), 'null'::jsonb, 'logo_url is null in the list'
);
select ok((select bool_and((p->>'active')::boolean) from r_city), 'every listed partner is active');
select is(
  (select p->>'initials' from r_city where pos = 1), 'DV', 'initials come from the quoted name'
);
select is(
  (select jsonb_build_object('name_sr', p->'city'->>'name_sr', 'featured', p->'featured', 'paid_until', p->>'paid_until',
     'message_channel', p->>'message_channel', 'message_number', p->>'message_number')
   from r_city where pos = 1),
  '{"name_sr": "Novi Sad", "featured": true, "paid_until": "2027-12-31", "message_channel": "whatsapp", "message_number": "+381 64 455 1000"}'::jsonb,
  'the Partner fields come from the row and its city'
);
select is(
  (select jsonb_array_length(p->'hours') from r_city where pos = 1), 6, 'hours lists every open weekday'
);
select is(
  (select p->'hours'->0 from r_city where pos = 1),
  '{"weekday": 1, "opens": "08:00", "closes": "20:00"}'::jsonb, 'hours are { weekday, opens HH:MM, closes HH:MM }'
);
select is(
  (select p->'hours' from r_city where p->>'name' = 'Pet hotel „Do danas“'),
  '[]'::jsonb, 'a partner without hours rows has an empty hours list'
);
select is(
  (select p->'today_hours' from r_city where pos = 1),
  (select case when extract(isodow from now() at time zone 'Europe/Belgrade') <= 6
          then (select p->'hours'->((extract(isodow from now() at time zone 'Europe/Belgrade'))::int - 1) from r_city where pos = 1)
          else 'null'::jsonb end),
  'today_hours is the row for today''s ISO weekday (null = closed)'
);

-- p_type and p_limit ----------------------------------------------------------------------------
select is(
  (select array_agg(e->>'name' order by o) from jsonb_array_elements(
     public.partners_nearby(null, null, (select id from ns), 'vet', null)) with ordinality as t (e, o)),
  array['Veterinarska ambulanta „Dr Vet“', 'Veterinarska stanica „Zdrava šapa“'],
  'p_type filters by partner type'
);
select is(
  (select array_agg(e->>'name' order by o) from jsonb_array_elements(
     public.partners_nearby(null, null, (select id from ns), 'vet', 1)) with ordinality as t (e, o)),
  array['Veterinarska ambulanta „Dr Vet“'],
  'p_limit caps the list (S03: p_type = vet, p_limit = 2 style)'
);
select is(
  jsonb_array_length(public.partners_nearby(null, null, (select id from ns), null, 2)), 2, 'p_limit = 2'
);
select lives_ok(
  $$select public.partners_nearby(null, null, (select id from ns), null, 50)$$, 'p_limit = 50 is allowed'
);
select is(
  public.partners_nearby(null, null, gen_random_uuid(), null, null), '[]'::jsonb,
  'an unknown city returns an empty list'
);

-- Coordinates (BR-42 / FR-53) -------------------------------------------------------------------
create temporary table r_geo on commit drop as
select (e.ordinality)::int as pos, e.value as p
from jsonb_array_elements(public.partners_nearby(45.2474, 19.8130, null, null, null)) with ordinality as e;

select is(
  (select (p->>'distance_km')::numeric from r_geo where p->>'id' = 'e1000000-0000-4000-8000-000000000003'),
  0.0, 'BR-42 / FR-53: with coordinates, distance is from the coordinates'
);
select is(
  (select p->'city'->>'name_sr' from r_geo where pos = 1), 'Novi Sad',
  'without p_city_id, the city is the cities row nearest to the coordinates'
);
select is(
  (select p->>'name' from r_geo where pos = 1), 'Veterinarska ambulanta „Dr Vet“', 'featured stays first'
);
select is(
  (select p->>'name' from r_geo where pos = 2), 'Grooming salon „Čupko“',
  'then the nearest to the coordinates'
);
select is(
  (select array_agg(e->>'name') from jsonb_array_elements(public.partners_nearby(44.8178, 20.4569, null, null, null)) e),
  array['Veterinarska ambulanta „Vračar“'], 'coordinates in Beograd resolve to Beograd'
);
select is(
  (select (e->>'distance_km')::numeric from jsonb_array_elements(
     public.partners_nearby(45.2474, 19.8130, (select id from ns), 'grooming', null)) e),
  0.0, 'with coordinates and p_city_id, the list is the city''s and distance is from the coordinates'
);

-- Validation (EP-64) ----------------------------------------------------------------------------
select throws_ok(
  $$select public.partners_nearby(null, null, null, null, null)$$,
  'P0001', 'validation_failed', 'neither coordinates nor city → validation_failed'
);
select throws_ok(
  $$select public.partners_nearby(45.25, null, (select id from ns), null, null)$$,
  'P0001', 'validation_failed', 'only p_lat → validation_failed'
);
select throws_ok(
  $$select public.partners_nearby(null, 19.84, (select id from ns), null, null)$$,
  'P0001', 'validation_failed', 'only p_lng → validation_failed'
);
select throws_ok(
  $$select public.partners_nearby(null, null, (select id from ns), null, 0)$$,
  'P0001', 'validation_failed', 'p_limit 0 → validation_failed'
);
select throws_ok(
  $$select public.partners_nearby(null, null, (select id from ns), null, 51)$$,
  'P0001', 'validation_failed', 'p_limit 51 → validation_failed'
);
select throws_ok(
  $$select public.partners_nearby(null, null, (select id from ns), 'zoo', null)$$,
  '22P02', null, 'an unknown p_type is refused'
);
reset role;

-- BR-41 in the ordering: at most 3 featured per type and city come first ----------------------
alter table public.partners disable trigger partners_check_featured_limit;
update public.partners set featured = true
where id in ('fd000000-0000-4000-8000-000000000001');
insert into public.partners (id, type, name, address, city_id, phone, latitude, longitude, featured, paid_until)
select v.id, 'vet', v.name, 'Adresa', c.id, '+381 21 1', v.lat, v.lng, true, date '2027-12-31'
from (values
  ('fd000000-0000-4000-8000-000000000011'::uuid, 'Vet C', 45.2700::double precision, 19.8500::double precision),
  ('fd000000-0000-4000-8000-000000000012'::uuid, 'Vet D', 45.3000, 19.8500)
) as v (id, name, lat, lng)
join public.cities c on c.name_sr = 'Novi Sad';
insert into public.partners (id, type, name, address, city_id, phone, latitude, longitude, paid_until)
select 'fd000000-0000-4000-8000-000000000013', 'vet', 'Vet E', 'Adresa', c.id, '+381 21 1', 45.2800, 19.8500, date '2027-12-31'
from public.cities c where c.name_sr = 'Novi Sad';
alter table public.partners enable trigger partners_check_featured_limit;

set local role authenticated;
select is(
  (select array_agg(e->>'name' order by o) from jsonb_array_elements(
     public.partners_nearby(null, null, (select id from ns), 'vet', null)) with ordinality as t (e, o)),
  array['Veterinarska stanica „Zdrava šapa“', 'Veterinarska ambulanta „Dr Vet“', 'Vet C', 'Vet E', 'Vet D'],
  'BR-41: only 3 featured of a type come first; a 4th is ordered with the rest'
);
reset role;

-- Visitor -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select public.partners_nearby(null, null, (select id from public.cities limit 1), null, null)$$,
  '42501', null, 'anon may not call partners_nearby (401)'
);
reset role;

select * from finish();
rollback;
