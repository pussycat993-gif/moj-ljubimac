-- partners, partner_hours, partner_clicks (TC §5.7): columns, enums, checks, uniques,
-- indexes, the featured limit (BR-41) and RLS (BR-40; no client writes, EP-69).
-- Seeded in Novi Sad: „Dr Vet“ (vet, featured, e1…01), „Šapica“ (pet_shop, e1…02),
-- „Čupko“ (grooming, e1…03), „Kod Mace“ (pet_hotel, paid_until passed, e1…04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(51);

-- Enums ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'partner_type', array['vet', 'pet_shop', 'grooming', 'pet_hotel'], 'partner type');
select enum_has_labels('public', 'partner_message_channel', array['none', 'sms', 'viber', 'whatsapp'],
  'message channel (BR-44)');
select enum_has_labels('public', 'partner_click_action', array['call', 'message', 'email', 'website'],
  'click action (FR-58)');

-- partners ------------------------------------------------------------------------------------
select columns_are('public', 'partners', array[
  'id', 'type', 'name', 'address', 'city_id', 'phone', 'email', 'website', 'instagram',
  'description', 'logo_r2_key', 'message_channel', 'message_number', 'latitude', 'longitude',
  'featured', 'paid_until', 'created_at', 'updated_at'
], 'partners has the TC §5.7 columns');
select col_not_null('public', 'partners', 'type', 'type is not null');
select col_not_null('public', 'partners', 'name', 'name is not null');
select col_not_null('public', 'partners', 'address', 'address is not null');
select col_not_null('public', 'partners', 'city_id', 'city_id is not null');
select col_not_null('public', 'partners', 'phone', 'phone is not null');
select col_not_null('public', 'partners', 'paid_until', 'paid_until is not null');
select fk_ok('public', 'partners', 'city_id', 'public', 'cities', 'id', 'city_id references cities');
select col_default_is('public', 'partners', 'message_channel', 'none', 'message_channel defaults to none');
select col_default_is('public', 'partners', 'featured', 'false', 'featured defaults to false');
select col_type_is('public', 'partners', 'latitude', 'double precision', 'latitude is double precision');
select col_type_is('public', 'partners', 'longitude', 'double precision', 'longitude is double precision');
select col_type_is('public', 'partners', 'paid_until', 'date', 'paid_until is a date');
select has_index('public', 'partners', 'partners_city_id_type_featured_paid_until_idx',
  array['city_id', 'type', 'featured', 'paid_until'], 'index (city_id, type, featured, paid_until)');

-- partner_hours -------------------------------------------------------------------------------
select columns_are('public', 'partner_hours', array[
  'id', 'partner_id', 'weekday', 'opens', 'closes', 'created_at', 'updated_at'
], 'partner_hours has the TC §5.7 columns');
select fk_ok('public', 'partner_hours', 'partner_id', 'public', 'partners', 'id', 'partner_hours.partner_id references partners');
select col_type_is('public', 'partner_hours', 'opens', 'time without time zone', 'opens is a time');
select col_not_null('public', 'partner_hours', 'closes', 'closes is not null');
select col_is_unique('public', 'partner_hours', array['partner_id', 'weekday'], 'unique (partner_id, weekday)');
select throws_ok(
  $$insert into public.partner_hours (partner_id, weekday, opens, closes)
    values ('e1000000-0000-4000-8000-000000000001', 8, '08:00', '12:00')$$,
  '23514', null, 'weekday must be 1–7'
);
select throws_ok(
  $$insert into public.partner_hours (partner_id, weekday, opens, closes)
    values ('e1000000-0000-4000-8000-000000000001', 1, '08:00', '12:00')$$,
  '23505', null, 'one row per partner and weekday'
);

-- partner_clicks ------------------------------------------------------------------------------
select columns_are('public', 'partner_clicks', array[
  'id', 'partner_id', 'action', 'clicked_at', 'user_id', 'created_at', 'updated_at'
], 'partner_clicks has the TC §5.7 columns');
select fk_ok('public', 'partner_clicks', 'partner_id', 'public', 'partners', 'id', 'partner_clicks.partner_id references partners');
select fk_ok('public', 'partner_clicks', 'user_id', 'public', 'profiles', 'id', 'partner_clicks.user_id references profiles');
select col_is_null('public', 'partner_clicks', 'user_id', 'user_id is nullable');
select col_not_null('public', 'partner_clicks', 'action', 'action is not null');
select col_default_is('public', 'partner_clicks', 'clicked_at', 'now()', 'clicked_at defaults to now()');
select has_index('public', 'partner_clicks', 'partner_clicks_partner_id_action_idx',
  array['partner_id', 'action'], 'index (partner_id, action)');

-- BR-41: at most 3 featured per (city_id, type) -----------------------------------------------
insert into public.partners (id, type, name, address, city_id, phone, featured, paid_until)
select v.id, 'vet', v.name, 'Adresa 1, Novi Sad', c.id, '+381 21 000 000', v.featured, date '2027-12-31'
from (values
  ('fc000000-0000-4000-8000-000000000001'::uuid, 'Veterinarska stanica „Zdrava šapa“', true),
  ('fc000000-0000-4000-8000-000000000002'::uuid, 'Veterinarska klinika „Liman“', true),
  ('fc000000-0000-4000-8000-000000000003'::uuid, 'Veterinarska ambulanta „Detelinara“', false)
) as v (id, name, featured)
join public.cities c on c.name_sr = 'Novi Sad';

select is(
  (select count(*)::int from public.partners p join public.cities c on c.id = p.city_id
   where c.name_sr = 'Novi Sad' and p.type = 'vet' and p.featured),
  3, 'three featured vets in Novi Sad are allowed'
);
select throws_ok(
  $$update public.partners set featured = true where id = 'fc000000-0000-4000-8000-000000000003'$$,
  'P0001', 'featured_limit_reached', 'BR-41: a 4th featured vet in the same city is refused (update)'
);
select throws_ok(
  $$insert into public.partners (type, name, address, city_id, phone, featured, paid_until)
    select 'vet', 'Četvrta', 'Adresa', c.id, '+381 21 1', true, date '2027-12-31'
    from public.cities c where c.name_sr = 'Novi Sad'$$,
  'P0001', 'featured_limit_reached', 'BR-41: a 4th featured vet in the same city is refused (insert)'
);
select lives_ok(
  $$insert into public.partners (type, name, address, city_id, phone, featured, paid_until)
    select 'pet_shop', 'Pet shop „Kod Ćire“', 'Kisačka 33, Novi Sad', c.id, '+381 21 470 115', true, date '2027-12-31'
    from public.cities c where c.name_sr = 'Novi Sad'$$,
  'the limit is per type'
);
select lives_ok(
  $$insert into public.partners (type, name, address, city_id, phone, featured, paid_until)
    select 'vet', 'Veterinarska ambulanta „Vračar“', 'Adresa, Beograd', c.id, '+381 11 1', true, date '2027-12-31'
    from public.cities c where c.name_sr = 'Beograd'$$,
  'the limit is per city'
);
select lives_ok(
  $$update public.partners set name = 'Veterinarska stanica „Zdrava šapa“ NS'
    where id = 'fc000000-0000-4000-8000-000000000001'$$,
  'editing a featured partner at the limit is allowed'
);

-- RLS: signed-in users (Ivana) ----------------------------------------------------------------
insert into public.partners (id, type, name, address, city_id, phone, paid_until)
select v.id, 'grooming', v.name, 'Adresa, Novi Sad', c.id, '+381 21 2', v.paid_until
from (values
  ('fc000000-0000-4000-8000-000000000011'::uuid, 'Do danas', (now() at time zone 'Europe/Belgrade')::date),
  ('fc000000-0000-4000-8000-000000000012'::uuid, 'Do juče', (now() at time zone 'Europe/Belgrade')::date - 1)
) as v (id, name, paid_until)
join public.cities c on c.name_sr = 'Novi Sad';
insert into public.partner_hours (partner_id, weekday, opens, closes) values
  ('fc000000-0000-4000-8000-000000000012', 1, '09:00', '17:00');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.partners where id = 'e1000000-0000-4000-8000-000000000004'),
  0, 'BR-40: a partner whose paid_until has passed is hidden'
);
select is(
  (select count(*)::int from public.partners where id = 'fc000000-0000-4000-8000-000000000012'),
  0, 'BR-40: paid_until yesterday (Europe/Belgrade) is hidden'
);
select is(
  (select count(*)::int from public.partners where id = 'fc000000-0000-4000-8000-000000000011'),
  1, 'BR-40: paid_until today (Europe/Belgrade) is still shown'
);
select is(
  (select count(*)::int from public.partners where id = 'e1000000-0000-4000-8000-000000000001'),
  1, 'an active partner is readable'
);
select is(
  (select count(*)::int from public.partner_hours where partner_id = 'e1000000-0000-4000-8000-000000000001'),
  6, 'an active partner''s hours are readable'
);
select is(
  (select count(*)::int from public.partner_hours
   where partner_id in ('e1000000-0000-4000-8000-000000000004', 'fc000000-0000-4000-8000-000000000012')),
  0, 'a hidden partner''s hours are hidden'
);
select throws_ok(
  $$insert into public.partners (type, name, address, city_id, phone, paid_until)
    select 'vet', 'X', 'Y', c.id, '1', date '2027-01-01' from public.cities c limit 1$$,
  '42501', null, 'no client insert of partners (EP-69 service role)'
);
select throws_ok(
  $$update public.partners set featured = false$$,
  '42501', null, 'no client update of partners'
);
select throws_ok(
  $$delete from public.partners$$,
  '42501', null, 'no client delete of partners'
);
select throws_ok(
  $$insert into public.partner_hours (partner_id, weekday, opens, closes)
    values ('e1000000-0000-4000-8000-000000000001', 7, '10:00', '12:00')$$,
  '42501', null, 'no client write of partner_hours'
);
select throws_ok(
  $$select 1 from public.partner_clicks$$,
  '42501', null, 'no client read of partner_clicks'
);
select throws_ok(
  $$insert into public.partner_clicks (partner_id, action) values ('e1000000-0000-4000-8000-000000000001', 'call')$$,
  '42501', null, 'no direct client insert of partner_clicks'
);
reset role;

-- Visitor -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select 1 from public.partners$$, '42501', null, 'anon cannot read partners');
select throws_ok($$select 1 from public.partner_hours$$, '42501', null, 'anon cannot read partner hours');
reset role;

select * from finish();
rollback;
