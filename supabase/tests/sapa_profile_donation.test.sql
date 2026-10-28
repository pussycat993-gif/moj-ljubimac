-- Step 28b — rpc:get_donation_info (EP-78, FR-66), rpc:get_public_profile (EP-79, FR-67), the donation
-- columns written by a shelter Admin (EP-88, FR-72), Organisation.donation of rpc:get_my_organisation
-- (EP-53) and the ListingAuthor card (sapa_author_card).
-- Seeded (supabase/seed.sql): Dragana (…07) is Admin of the approved shelter „Druga šansa“
-- (b2…03, with donation info) and authored the need f3…01; Marko (…02, lives in Beograd) has active f3…02 and
-- expired f3…06; Jelena (…03) blocked Nikola (…05, Admin of the breeder b2…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- FR-66 #1 — get_donation_info ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select j - 'city' - 'organisation_id' from public.get_donation_info('f3000000-0000-4000-8000-000000000001') j),
  jsonb_build_object(
    'organisation_name', 'Azil „Druga šansa“',
    'bank_account', '160-0000012345678-90',
    'payment_url', 'https://drugasansa.rs/doniraj',
    'dropoff_address', 'Primorska 12, Novi Sad',
    'dropoff_hours', 'pon–pet 10–16h',
    'payment_purpose', 'Donacija — Potrebno 20 kg granula za odrasle pse',
    'has_any', true
  ),
  'FR-66 #1: the need returns the shelter''s four fields, name and payment purpose'
);
select is(
  (select jsonb_build_object('org', j ->> 'organisation_id', 'city', j -> 'city' ->> 'name_sr')
   from public.get_donation_info('f3000000-0000-4000-8000-000000000001') j),
  '{"org": "b2000000-0000-4000-8000-000000000003", "city": "Novi Sad"}'::jsonb,
  'with the organisation id and city'
);
select throws_ok($$select public.get_donation_info('f3000000-0000-4000-8000-000000000002')$$,
  'P0001', 'validation_failed', 'a non-need listing → validation_failed');
select throws_ok($$select public.get_donation_info('f3000000-0000-4000-8000-000000000006')$$,
  'P0001', 'not_found', 'a listing that is not active → not_found');
reset role;

-- FR-66 #2 — Visitors ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select public.get_donation_info('f3000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'FR-66 #2: a Visitor cannot call get_donation_info');
reset role;

-- FR-72 #1 — the Admin saves donation info; EP-78 returns the new values --------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
update public.organisations set donation_url = 'https://evil.example/doniraj'
where id = 'b2000000-0000-4000-8000-000000000003';
reset role;
select is((select donation_url from public.organisations where id = 'b2000000-0000-4000-8000-000000000003'),
  'https://drugasansa.rs/doniraj', 'a non-member cannot change the donation info');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.organisations
    set donation_bank_account = '205-0000000111111-22', donation_url = 'https://drugasansa.rs/pomozi',
        dropoff_address = 'Futoška 1, Novi Sad', dropoff_hours = 'sub 9–13h'
    where id = 'b2000000-0000-4000-8000-000000000003'$$,
  'FR-72 #1: the shelter Admin updates the donation columns'
);
select is(
  (select jsonb_build_object('bank', d ->> 'bank_account', 'url', d ->> 'payment_url', 'purpose', d -> 'payment_purpose')
   from (select public.get_my_organisation() -> 'organisation' -> 'donation' as d) x),
  '{"bank": "205-0000000111111-22", "url": "https://drugasansa.rs/pomozi", "purpose": null}'::jsonb,
  'get_my_organisation returns Organisation.donation for the shelter, without payment_purpose'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('bank', j ->> 'bank_account', 'url', j ->> 'payment_url',
     'address', j ->> 'dropoff_address', 'hours', j ->> 'dropoff_hours')
   from public.get_donation_info('f3000000-0000-4000-8000-000000000001') j),
  '{"bank": "205-0000000111111-22", "url": "https://drugasansa.rs/pomozi", "address": "Futoška 1, Novi Sad", "hours": "sub 9–13h"}'::jsonb,
  'get_donation_info returns the new values'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_my_organisation() -> 'organisation' -> 'donation', 'null'::jsonb,
  'a breeder organisation has no donation block');
reset role;

-- A shelter with no donation info.
update public.organisations
set donation_bank_account = null, donation_url = null, dropoff_address = null, dropoff_hours = null
where id = 'b2000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('bank', j -> 'bank_account', 'url', j -> 'payment_url', 'address', j -> 'dropoff_address',
     'hours', j -> 'dropoff_hours', 'has_any', j -> 'has_any')
   from public.get_donation_info('f3000000-0000-4000-8000-000000000001') j),
  '{"bank": null, "url": null, "address": null, "hours": null, "has_any": false}'::jsonb,
  'a shelter without donation info → has_any false and nulls'
);
select is(public.get_listing('f3000000-0000-4000-8000-000000000001') -> 'has_donation_info', 'false'::jsonb,
  'and the listing''s has_donation_info is false');
reset role;

-- sapa_author_card — a need shows the shelter, never email or phone --------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select jsonb_build_object('kind', c ->> 'kind', 'name', c ->> 'display_name', 'org', c ->> 'organisation_id',
     'slug', c ->> 'organisation_slug', 'count', c -> 'active_listing_count')
   from public.sapa_author_card('a1000000-0000-4000-8000-000000000007', 'b2000000-0000-4000-8000-000000000003') c),
  '{"kind": "shelter", "name": "Azil „Druga šansa“", "org": "b2000000-0000-4000-8000-000000000003", "slug": "azil-druga-sansa", "count": 1}'::jsonb,
  'the author card of a need shows the shelter name and slug'
);
select ok(
  not (public.sapa_author_card('a1000000-0000-4000-8000-000000000007', 'b2000000-0000-4000-8000-000000000003')::text
       ~ '"(email|phone)"|@|\+381'),
  'the shelter author card carries no email or phone'
);
select ok(
  not (public.sapa_author_card('a1000000-0000-4000-8000-000000000002', null)::text ~ '"(email|phone)"|@'),
  'a user author card carries no email or phone'
);
reset role;

-- FR-67 #1 — get_public_profile ---------------------------------------------------------------------------
update public.profiles set display_name = 'Marko iz Bečeja' where id = 'a1000000-0000-4000-8000-000000000002';
-- Nikola gets an active listing (Jelena blocked him).
insert into public.listings (id, author_id, type, title, description, category, species, city_id)
select 'f3000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000005', 'giving',
  'Poklanjam ogradicu za štence', 'Ograda za štence, 4 panela.', 'equipment_toys', 'dog', c.id
from public.cities c where c.name_sr = 'Beograd';
create temp table marko_created as select created_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000002';
grant select on marko_created to anon;

set local role anon;
select is(
  (select jsonb_build_object('name', j ->> 'display_name', 'city', j -> 'city' ->> 'name_sr',
     'member_since', (j ->> 'member_since')::timestamptz
                      = (select created_at from marko_created),
     'ids', (select array_agg(x ->> 'id') from jsonb_array_elements(j -> 'listings') x),
     'total', j -> 'listings_total', 'count', j -> 'active_listing_count', 'viewer', j -> 'viewer')
   from public.get_public_profile('a1000000-0000-4000-8000-000000000002') j),
  jsonb_build_object('name', 'Marko iz Bečeja', 'city', 'Beograd', 'member_since', true,
    'ids', array['f3000000-0000-4000-8000-000000000002'], 'total', 1, 'count', 1,
    'viewer', '{"signed_in": false, "is_me": false, "i_blocked": false}'::jsonb),
  'FR-67 #1: a Visitor gets the display name, city, member-since and active listings (not the expired one)'
);
select is(public.get_public_profile('a1000000-0000-4000-8000-000000000003') ->> 'display_name', 'Jelena Nikolić',
  'the full name when no display name is set');
select is(
  (select jsonb_build_object('listings', j -> 'listings', 'total', j -> 'listings_total')
   from public.get_public_profile('a1000000-0000-4000-8000-000000000007') j),
  '{"listings": [], "total": 0}'::jsonb,
  'shelter needs are not the user''s own listings'
);
select ok(
  not (public.get_public_profile('a1000000-0000-4000-8000-000000000002')::text ~ '"(email|phone)"|@'),
  'no email or phone anywhere in the profile'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('name', j ->> 'display_name',
     'ids', (select array_agg(x ->> 'id') from jsonb_array_elements(j -> 'listings') x), 'viewer', j -> 'viewer')
   from public.get_public_profile('a1000000-0000-4000-8000-000000000002') j),
  jsonb_build_object('name', 'Marko iz Bečeja', 'ids', array['f3000000-0000-4000-8000-000000000002'],
    'viewer', '{"signed_in": true, "is_me": false, "i_blocked": false}'::jsonb),
  'a signed-in caller gets the same profile'
);
select ok(
  not (public.get_public_profile('a1000000-0000-4000-8000-000000000001')::text ~ '"(email|phone)"|@'),
  'no email or phone on one''s own profile either'
);
select is(public.get_public_profile('a1000000-0000-4000-8000-000000000001') -> 'viewer' -> 'is_me', 'true'::jsonb,
  'viewer.is_me on one''s own profile');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('blocked', j -> 'viewer' -> 'i_blocked', 'listings', j -> 'listings', 'total', j -> 'listings_total')
   from public.get_public_profile('a1000000-0000-4000-8000-000000000005') j),
  '{"blocked": true, "listings": [], "total": 0}'::jsonb,
  'Jelena viewing Nikola (blocked): i_blocked, no listings, listings_total 0'
);
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
select is(jsonb_array_length(public.get_public_profile('a1000000-0000-4000-8000-000000000005') -> 'listings'), 1,
  'a Visitor sees Nikola''s listing');
select throws_ok($$select public.get_public_profile('00000000-0000-4000-8000-000000000000')$$,
  'P0001', 'not_found', 'an unknown user → not_found');
reset role;

update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000002';
update public.profiles set deletion_requested_at = now() where id = 'a1000000-0000-4000-8000-000000000003';
set local role anon;
select throws_ok($$select public.get_public_profile('a1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'not_found', 'a suspended user → not_found');
select throws_ok($$select public.get_public_profile('a1000000-0000-4000-8000-000000000003')$$,
  'P0001', 'not_found', 'a user with a pending deletion → not_found');
reset role;

select * from finish();
rollback;
