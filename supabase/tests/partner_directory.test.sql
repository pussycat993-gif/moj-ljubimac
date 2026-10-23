-- Step 27 — partner directory: EP-64 rpc:partners_nearby (FR-52 visibility and order, FR-53 coordinates
-- vs the profile city), EP-65 rpc:get_partner (404 on a hidden partner, distance, hours, today_hours)
-- and EP-66 rpc:record_partner_click (FR-55: a click row is inserted; an action without data → 422).
-- Partners are seeded here, in Kragujevac (centre 44.013179, 20.919635), where supabase/seed.sql has none.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Setup (as postgres) -------------------------------------------------------------------------
create temporary table kg as select id, latitude, longitude from public.cities where name_sr = 'Kragujevac';
grant select on kg to authenticated;

-- Ivana's profile city is Kragujevac for this test (FR-53: the fallback reference point).
update public.profiles set city_id = (select id from kg) where id = 'a1000000-0000-4000-8000-000000000001';

insert into public.partners (
  id, type, name, address, city_id, phone, email, website, message_channel, message_number,
  logo_r2_key, latitude, longitude, featured, paid_until
)
select v.id, v.type::public.partner_type, v.name, 'Adresa, Kragujevac', (select id from kg), '+381 34 000 000',
       v.email, v.website, v.channel::public.partner_message_channel, v.number, v.logo, v.lat, v.lng, v.featured, v.paid_until
from (values
  ('f2700000-0000-4000-8000-000000000001'::uuid, 'vet', 'Veterinarska ambulanta „Vet A“', 'a@vet.rs', 'https://veta.rs',
   'whatsapp', '+381 64 000 0001', 'p/f2700000-0000-4000-8000-000000000001/logo.png',
   44.0200::double precision, 20.9200::double precision, true, date '2027-12-31'),
  ('f2700000-0000-4000-8000-000000000002'::uuid, 'vet', 'Veterinarska ambulanta „Vet B“', null, null,
   'none', null, null, 44.0300, 20.9300, true, date '2027-12-31'),
  ('f2700000-0000-4000-8000-000000000003'::uuid, 'vet', 'Veterinarska ambulanta „Vet C“', null, null,
   'none', null, null, 44.0400, 20.9400, true, date '2027-12-31'),
  ('f2700000-0000-4000-8000-000000000004'::uuid, 'vet', 'Veterinarska ambulanta „Vet D“', null, null,
   'none', null, null, 44.0132, 20.9197, false, date '2027-12-31'),
  ('f2700000-0000-4000-8000-000000000005'::uuid, 'vet', 'Veterinarska ambulanta „Vet E“', null, null,
   'none', null, null, 44.0500, 20.9500, false, date '2027-12-31'),
  ('f2700000-0000-4000-8000-000000000006'::uuid, 'pet_shop', 'Pet shop „Shop A“', null, null,
   'none', null, null, 44.0600, 20.9600, true, date '2027-12-31'),
  ('f2700000-0000-4000-8000-000000000007'::uuid, 'vet', 'Veterinarska ambulanta „Istekao“', 'x@vet.rs', null,
   'sms', '+381 64 000 0007', null, 44.0131, 20.9196, false, (now() at time zone 'Europe/Belgrade')::date - 1)
) as v (id, type, name, email, website, channel, number, logo, lat, lng, featured, paid_until);

-- Vet A is open every day; Vet B only on a day that is not today.
insert into public.partner_hours (partner_id, weekday, opens, closes)
select 'f2700000-0000-4000-8000-000000000001'::uuid, d, time '08:00', time '20:00' from generate_series(1, 7) d
union all
select 'f2700000-0000-4000-8000-000000000002'::uuid,
       (extract(isodow from now() at time zone 'Europe/Belgrade')::int % 7) + 1, time '09:00', time '17:00';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- FR-52 #1 — BR-40: a passed paid_until hides the partner (EP-64) and EP-65 answers not_found ------
create temporary table r_city on commit drop as
select (e.ordinality)::int as pos, e.value as p
from jsonb_array_elements(public.partners_nearby(
  null, null, (select city_id from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'), null, null
)) with ordinality as e;

select is(
  (select count(*)::int from r_city where p->>'id' = 'f2700000-0000-4000-8000-000000000007'), 0,
  'FR-52: partners_nearby excludes a partner whose paid_until < current_date (Europe/Belgrade)'
);
select throws_ok(
  $$select public.get_partner('f2700000-0000-4000-8000-000000000007')$$,
  'P0001', 'not_found', 'FR-52 / E-23: get_partner on a partner whose paid_until has passed → not_found (404)'
);
select throws_ok(
  $$select public.get_partner(gen_random_uuid())$$,
  'P0001', 'not_found', 'get_partner on an unknown partner → not_found (404)'
);

-- FR-52 #2 — BR-41: featured first (≤ 3 per type per city), then ascending distance_km -------------
select is(
  (select array_agg(p->>'name' order by pos) from r_city),
  array[
    'Veterinarska ambulanta „Vet A“', 'Veterinarska ambulanta „Vet B“', 'Veterinarska ambulanta „Vet C“',
    'Pet shop „Shop A“', 'Veterinarska ambulanta „Vet D“', 'Veterinarska ambulanta „Vet E“'
  ],
  'FR-52: featured partners first, then the others by distance'
);
select ok(
  (select bool_and((p->>'featured')::boolean) from r_city where pos <= 4)
  and (select bool_and(not (p->>'featured')::boolean) from r_city where pos > 4),
  'FR-52: every featured partner precedes every non-featured one'
);
select is(
  (select count(*)::int from r_city where p->>'type' = 'vet' and (p->>'featured')::boolean), 3,
  'FR-52: at most 3 featured vets in the city'
);
select ok(
  (select bool_and((a.p->>'distance_km')::numeric <= (b.p->>'distance_km')::numeric)
   from r_city a join r_city b on b.pos = a.pos + 1
   where a.pos > 4),
  'FR-52: after the featured, distance_km ascends'
);
reset role;
select throws_ok(
  $$insert into public.partners (type, name, address, city_id, phone, featured, paid_until)
    values ('vet', 'Četvrti istaknuti', 'Adresa', (select id from kg), '+381 34 1', true, date '2027-12-31')$$,
  'P0001', 'featured_limit_reached', 'BR-41: a 4th featured vet in the same city is refused'
);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- FR-53 — coordinates vs the profile city ------------------------------------------------------
select is(
  (select (p->>'distance_km')::numeric from r_city where p->>'id' = 'f2700000-0000-4000-8000-000000000004'),
  round(private.distance_km(
    (select latitude from kg), (select longitude from kg), 44.0132, 20.9197)::numeric, 1),
  'FR-53: without coordinates, distance_km is from the profile city (p_city_id = profiles.city_id)'
);

create temporary table r_geo on commit drop as
select (e.ordinality)::int as pos, e.value as p
from jsonb_array_elements(public.partners_nearby(44.0500, 20.9500, null, null, null)) with ordinality as e;

select is(
  (select (p->>'distance_km')::numeric from r_geo where p->>'id' = 'f2700000-0000-4000-8000-000000000005'), 0.0,
  'FR-53: with p_lat / p_lng, distance_km is from the coordinates'
);
select is(
  (select p->>'name' from r_geo where pos = 5), 'Veterinarska ambulanta „Vet E“',
  'FR-53: with coordinates, the non-featured order follows the distance from the coordinates'
);
select is(
  (select p->'city'->>'name_sr' from r_geo where pos = 1), 'Kragujevac',
  'FR-53: with coordinates only, the city is the cities row nearest to them'
);
select is(
  (select array_agg(e->>'type') from jsonb_array_elements(
     public.partners_nearby(null, null, (select id from kg), 'vet', 2)) e),
  array['vet', 'vet'], 'FR-56: p_type = vet, p_limit = 2 lists two vets only'
);

-- EP-65 rpc:get_partner -------------------------------------------------------------------------
select is(
  (public.get_partner('f2700000-0000-4000-8000-000000000001', 44.0200, 20.9200, null)->>'distance_km')::numeric, 0.0,
  'EP-65: with lat / lng, distance_km is from the coordinates'
);
select is(
  (public.get_partner('f2700000-0000-4000-8000-000000000001', null, null, (select id from kg))->>'distance_km')::numeric,
  round(private.distance_km((select latitude from kg), (select longitude from kg), 44.0200, 20.9200)::numeric, 1),
  'EP-65: with city_id only, distance_km is from the city centre'
);
select is(
  public.get_partner('f2700000-0000-4000-8000-000000000001')->'distance_km', 'null'::jsonb,
  'EP-65: without a reference point, distance_km is null'
);
select is(
  jsonb_array_length(public.get_partner('f2700000-0000-4000-8000-000000000001')->'hours'), 7,
  'EP-65: hours lists every partner_hours row'
);
select is(
  public.get_partner('f2700000-0000-4000-8000-000000000001')->'today_hours',
  jsonb_build_object(
    'weekday', extract(isodow from now() at time zone 'Europe/Belgrade')::int, 'opens', '08:00', 'closes', '20:00'
  ),
  'EP-65: today_hours is the row for today''s ISO weekday (Europe/Belgrade)'
);
select is(
  public.get_partner('f2700000-0000-4000-8000-000000000002')->'today_hours', 'null'::jsonb,
  'EP-65: no row for today → today_hours null (closed today)'
);
select is(
  (select jsonb_build_object(
     'initials', g->>'initials', 'city', g->'city'->>'name_sr', 'logo_url', g->'logo_url', 'logo_r2_key', g->>'logo_r2_key',
     'active', g->'active', 'email', g->>'email', 'website', g->>'website', 'message_channel', g->>'message_channel')
   from (select public.get_partner('f2700000-0000-4000-8000-000000000001') as g) x),
  '{"initials": "VA", "city": "Kragujevac", "logo_url": null, "logo_r2_key": "p/f2700000-0000-4000-8000-000000000001/logo.png",
    "active": true, "email": "a@vet.rs", "website": "https://veta.rs", "message_channel": "whatsapp"}'::jsonb,
  'EP-65: the Partner fields come from the row and its city; the key is passed on for signing'
);
select is(
  (select jsonb_build_object('email', g->'email', 'website', g->'website', 'message_number', g->'message_number')
   from (select public.get_partner('f2700000-0000-4000-8000-000000000002') as g) x),
  '{"email": null, "website": null, "message_number": null}'::jsonb,
  'EP-65 minimal: absent optional fields are null'
);
select throws_ok(
  $$select public.get_partner('f2700000-0000-4000-8000-000000000001', 44.02, null, null)$$,
  'P0001', 'validation_failed', 'EP-65: one coordinate only → validation_failed'
);

-- FR-55 / EP-66 rpc:record_partner_click --------------------------------------------------------
select lives_ok(
  $$select public.record_partner_click('f2700000-0000-4000-8000-000000000001', 'message')$$,
  'FR-55: "Poruka" on a partner with message_channel and message_number is recorded'
);
select throws_ok(
  $$select public.record_partner_click('f2700000-0000-4000-8000-000000000002', 'message')$$,
  'P0001', 'validation_failed', 'FR-55: "Poruka" without a messaging channel → validation_failed (422)'
);
select throws_ok(
  $$select public.record_partner_click('f2700000-0000-4000-8000-000000000002', 'email')$$,
  'P0001', 'validation_failed', 'FR-55: "Mejl" without an email → validation_failed (422)'
);
select throws_ok(
  $$select public.record_partner_click('f2700000-0000-4000-8000-000000000002', 'website')$$,
  'P0001', 'validation_failed', 'FR-55: "Sajt" without a website → validation_failed (422)'
);
select throws_ok(
  $$select public.record_partner_click('f2700000-0000-4000-8000-000000000007', 'call')$$,
  'P0001', 'not_found', 'EP-66: a hidden partner → not_found (404)'
);
reset role;

select is(
  (select count(*)::int from public.partner_clicks
   where partner_id = 'f2700000-0000-4000-8000-000000000001' and action = 'message'
     and user_id = 'a1000000-0000-4000-8000-000000000001'),
  1, 'FR-55: the click row is inserted with the partner, the action and the user'
);
select is(
  (select count(*)::int from public.partner_clicks where partner_id = 'f2700000-0000-4000-8000-000000000002'), 0,
  'a refused click inserts nothing'
);

-- Visitors cannot read partners (EP-65 Authorization) -------------------------------------------
set local role anon;
select throws_ok(
  $$select public.get_partner('f2700000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a Visitor cannot call get_partner'
);
reset role;

select * from finish();
rollback;
