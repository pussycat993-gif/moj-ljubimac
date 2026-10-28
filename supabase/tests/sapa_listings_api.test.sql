-- Step 28b — Šapa pomoći read API and atomic writes: rpc:list_listings (EP-73, FR-61), rpc:get_listing
-- (EP-74, FR-62 #3), rpc:list_my_listings (EP-76, FR-64 #1) and rpc:save_listing (EP-75, BR-54 … BR-57).
-- Seeded (supabase/seed.sql, Step 28a): active f3…01 need (Dragana, „Druga šansa“, Novi Sad, 2 days
-- old), f3…02 giving (Marko, Bečej, 1 day), f3…03 selling 250000 (Ivana, Novi Sad, 3 days), f3…04
-- selling po dogovoru (Jelena, Novi Sad, 5 days), f3…05 seeking (Jelena, Subotica, 6 days); f3…06
-- expired (Marko), f3…07 resolved (Ivana). Conversation f3100000…01 Ivana → Marko on f3…02. Jelena
-- (…03) blocked Nikola (…05); Ana (…06) is the Operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(71);

-- Last two characters of each item id, in order ('01' … '08').
create function pg_temp.ids(j jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(right(x ->> 'id', 2) order by o), '{}')
  from jsonb_array_elements(j) with ordinality as t (x, o)
$$;

create temp table city (name text primary key, id uuid);
insert into city select c.name_sr, c.id from public.cities c where c.name_sr in ('Novi Sad', 'Bečej', 'Subotica');
grant select on city to anon, authenticated;

-- FR-61 #1 — Visitors, newest first, total and paging ---------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(pg_temp.ids(public.list_listings() -> 'items'), array['02', '01', '03', '04', '05'],
  'FR-61 #1: a Visitor gets the 5 active listings, newest first');
select is((public.list_listings() ->> 'total')::int, 5, 'total counts every visible listing');
select is(pg_temp.ids(public.list_listings(p_limit => 2, p_offset => 1) -> 'items'), array['01', '03'],
  'limit / offset page the list');
select is((public.list_listings(p_limit => 2, p_offset => 1) ->> 'total')::int, 5, 'total ignores paging');
select is(pg_temp.ids(public.list_listings(p_offset => 5) -> 'items'), array[]::text[],
  'an offset past the end returns no items');
select is(
  public.list_listings(p_type => 'selling') -> 'items' -> 0 -> 'price',
  '{"amount_minor": 250000, "currency": "RSD"}'::jsonb, 'a priced sale carries its price'
);
select is(
  public.list_listings(p_type => 'need') -> 'items' -> 0 -> 'author',
  '{"kind": "shelter", "display_name": "Azil „Druga šansa“"}'::jsonb, 'a need is authored by its shelter'
);

-- FR-61 #2 — every filter combination ANDs ---------------------------------------------------------------
select is(pg_temp.ids(public.list_listings(p_type => 'selling') -> 'items'), array['03', '04'], 'type filter');
select is(pg_temp.ids(public.list_listings(p_category => 'equipment_toys') -> 'items'), array['02', '05'],
  'category filter');
select is(pg_temp.ids(public.list_listings(p_species => 'dog') -> 'items'), array['01', '03', '04'],
  'species filter');
select is(pg_temp.ids(public.list_listings(p_city_id => (select id from city where name = 'Novi Sad')) -> 'items'),
  array['01', '03', '04'], 'city filter');
select is(pg_temp.ids(public.list_listings(p_type => 'selling', p_category => 'furniture') -> 'items'),
  array['04'], 'type AND category');
select is(pg_temp.ids(public.list_listings(p_type => 'giving', p_city_id => (select id from city where name = 'Novi Sad')) -> 'items'),
  array[]::text[], 'type AND city (no giving listing in Novi Sad)');
select is(pg_temp.ids(public.list_listings(p_category => 'equipment_toys', p_species => 'other') -> 'items'),
  array['05'], 'category AND species');
select is(
  pg_temp.ids(public.list_listings(p_category => 'equipment_toys', p_species => 'cat',
    p_city_id => (select id from city where name = 'Bečej')) -> 'items'),
  array['02'], 'category AND species AND city');
select is(
  public.list_listings(p_type => 'need', p_category => 'food', p_species => 'dog',
    p_city_id => (select id from city where name = 'Novi Sad')),
  jsonb_build_object('items', public.list_listings(p_type => 'need') -> 'items', 'total', 1),
  'all four filters together'
);
select is((public.list_listings(p_type => 'need', p_species => 'cat') ->> 'total')::int, 0,
  'a non-matching combination is empty with total 0');
select is((public.list_listings(p_type => '', p_category => '', p_species => '') ->> 'total')::int, 5,
  'empty filters are ignored');

select throws_ok($$select public.list_listings(p_type => 'adopting')$$, 'P0001', 'validation_failed',
  'unknown type → validation_failed');
select throws_ok($$select public.list_listings(p_category => 'toys')$$, 'P0001', 'validation_failed',
  'unknown category → validation_failed');
select throws_ok($$select public.list_listings(p_species => 'horse')$$, 'P0001', 'validation_failed',
  'unknown species → validation_failed');
select throws_ok($$select public.list_listings(p_city_id => '00000000-0000-4000-8000-000000000000')$$,
  'P0001', 'validation_failed', 'unknown city → validation_failed');
select throws_ok($$select public.list_listings(p_limit => 0)$$, 'P0001', 'validation_failed',
  'limit 0 → validation_failed');
select throws_ok($$select public.list_listings(p_limit => 51)$$, 'P0001', 'validation_failed',
  'limit 51 → validation_failed');
select throws_ok($$select public.list_listings(p_offset => -1)$$, 'P0001', 'validation_failed',
  'negative offset → validation_failed');
reset role;

-- FR-61 #3 — resolved, expired, hidden and suspended-author listings are absent ---------------------------
update public.listings set status = 'hidden' where id = 'f3000000-0000-4000-8000-000000000003';
update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000003';

set local role anon;
select is(pg_temp.ids(public.list_listings() -> 'items'), array['02', '01'],
  'FR-61 #3: hidden (f3…03), suspended author (Jelena), expired (f3…06) and resolved (f3…07) are absent');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.ids(public.list_listings() -> 'items'), array['02', '01'],
  'the same for a signed-in user (Marko, author of the expired f3…06)');
reset role;

update public.profiles set marketplace_suspended_at = null where id = 'a1000000-0000-4000-8000-000000000003';

-- FR-61 #4 — blocks (BR-59) ------------------------------------------------------------------------------
insert into public.listings (id, author_id, type, title, description, category, species, city_id, published_at)
values ('f3000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000005', 'giving',
  'Poklanjam štenećak ogradicu', 'Ograda za štence, 4 panela.', 'equipment_toys', 'dog',
  (select id from city where name = 'Novi Sad'), now() - interval '4 days');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.ids(public.list_listings() -> 'items'), array['02', '01', '04', '05'],
  'FR-61 #4: Jelena does not see the listing of Nikola, whom she blocked');
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000008')$$, 'P0001', 'not_found',
  'nor can she open it');
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(pg_temp.ids(public.list_listings() -> 'items'), array['02', '01', '08', '04', '05'],
  'a Visitor still sees it');
reset role;

-- FR-62 #3 — get_listing of a non-active listing ---------------------------------------------------------
set local role anon;
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000007')$$, 'P0001', 'not_found',
  'FR-62 #3: a resolved listing is not_found for a Visitor');
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000003')$$, 'P0001', 'not_found',
  'a hidden listing is not_found for a Visitor');
select throws_ok($$select public.get_listing('00000000-0000-4000-8000-000000000000')$$, 'P0001', 'not_found',
  'an unknown listing is not_found');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000007')$$, 'P0001', 'not_found',
  'someone else''s resolved listing is not_found for another user');
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000003')$$, 'P0001', 'not_found',
  'someone else''s hidden listing is not_found for another user');
select is(public.get_listing('f3000000-0000-4000-8000-000000000006') ->> 'status', 'expired',
  'the author opens their own expired listing');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('status', j ->> 'status', 'outcome', j ->> 'resolved_outcome', 'title', j ->> 'title',
     'days_left', j -> 'days_left', 'resolved', j -> 'resolved_at' <> 'null'::jsonb)
   from public.get_listing('f3000000-0000-4000-8000-000000000007') j),
  '{"status": "resolved", "outcome": "given", "title": "Poklanjam činije za hranu", "days_left": null, "resolved": true}'::jsonb,
  'the author gets the full resolved listing'
);
select is(public.get_listing('f3000000-0000-4000-8000-000000000003') ->> 'status', 'hidden',
  'the author gets their hidden listing');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_listing('f3000000-0000-4000-8000-000000000003') ->> 'status', 'hidden',
  'the Operator gets a hidden listing');
select is(public.get_listing('f3000000-0000-4000-8000-000000000007') ->> 'status', 'resolved',
  'the Operator gets a resolved listing');
reset role;

-- get_listing viewer fields and has_donation_info --------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  public.get_listing('f3000000-0000-4000-8000-000000000002') -> 'viewer',
  '{"signed_in": false, "is_author": false, "my_conversation_id": null, "can_message": false, "conversation_count": null}'::jsonb,
  'a Visitor: signed_in false, no conversation, no conversation_count'
);
select is(public.get_listing('f3000000-0000-4000-8000-000000000001') -> 'has_donation_info', 'true'::jsonb,
  'has_donation_info is true for the need of a shelter with donation info');
select is(public.get_listing('f3000000-0000-4000-8000-000000000002') -> 'has_donation_info', 'false'::jsonb,
  'has_donation_info is false for a non-need');
select is(public.get_listing('f3000000-0000-4000-8000-000000000002') -> 'author' ->> 'display_name',
  'Marko Jovanović', 'the author card shows the full name when no display name is set');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.get_listing('f3000000-0000-4000-8000-000000000002') -> 'viewer',
  '{"signed_in": true, "is_author": false, "my_conversation_id": "f3100000-0000-4000-8000-000000000001", "can_message": true, "conversation_count": null}'::jsonb,
  'Ivana: my_conversation_id is her conversation on f3…02; conversation_count only for the author'
);
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.get_listing('f3000000-0000-4000-8000-000000000002') -> 'viewer',
  '{"signed_in": true, "is_author": true, "my_conversation_id": null, "can_message": false, "conversation_count": 1}'::jsonb,
  'Marko (author): is_author and conversation_count 1'
);
reset role;

-- EP-75 — save_listing --------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table new_listing as
select public.save_listing(null, 'giving', 'Poklanjam ogrlicu', 'Crvena ogrlica za male pse.', 'equipment_toys',
  'dog', (select id from city where name = 'Novi Sad'), null, false) as id;
reset role;

select is(
  (select jsonb_build_object('status', l.status, 'author', l.author_id, 'org', l.organisation_id,
     'exp', l.expires_at = l.published_at + interval '30 days')
   from public.listings l where l.id = (select id from new_listing)),
  '{"status": "active", "author": "a1000000-0000-4000-8000-000000000001", "org": null, "exp": true}'::jsonb,
  'save_listing creates an active listing of the caller expiring published_at + 30 days'
);

-- Back-date it (2 days old, still expiring after f3…03) and give it three photos.
update public.listings
set published_at = now() - interval '2 days', expires_at = now() + interval '28 days'
where id = (select id from new_listing);
insert into public.listing_photos (id, listing_id, r2_key, position)
select x.id, (select id from new_listing), x.key, x.pos
from (values
  ('f3200000-0000-4000-8000-000000000001'::uuid, 'u/a1000000-0000-4000-8000-000000000001/listing/k1.jpg', 1::smallint),
  ('f3200000-0000-4000-8000-000000000002'::uuid, 'u/a1000000-0000-4000-8000-000000000001/listing/k2.jpg', 2::smallint),
  ('f3200000-0000-4000-8000-000000000003'::uuid, 'u/a1000000-0000-4000-8000-000000000001/listing/k3.jpg', 3::smallint)
) as x (id, key, pos);

set local role authenticated;
select lives_ok(
  $$select public.save_listing((select id from new_listing), 'giving', 'Poklanjam crvenu ogrlicu',
      'Crvena ogrlica za male pse, nova.', 'equipment_toys', 'dog',
      (select id from city where name = 'Novi Sad'), null, false, null,
      array['f3200000-0000-4000-8000-000000000003', 'f3200000-0000-4000-8000-000000000001']::uuid[])$$,
  'the author edits the listing and reorders photos (dropping one)'
);
reset role;

select is(
  (select jsonb_build_object('title', l.title,
     'published', l.published_at = now() - interval '2 days', 'expires', l.expires_at = now() + interval '28 days')
   from public.listings l where l.id = (select id from new_listing)),
  '{"title": "Poklanjam crvenu ogrlicu", "published": true, "expires": true}'::jsonb,
  'the edit changes the fields but not published_at / expires_at (BR-56)'
);
select is(
  (select array_agg(p.id::text || '@' || p.position order by p.position)
   from public.listing_photos p where p.listing_id = (select id from new_listing)),
  array['f3200000-0000-4000-8000-000000000003@1', 'f3200000-0000-4000-8000-000000000001@2'],
  'photo_ids sets the order 1…n'
);
select ok(
  exists (select 1 from public.r2_deletion_queue where r2_key = 'u/a1000000-0000-4000-8000-000000000001/listing/k2.jpg'),
  'the omitted photo is deleted and its key queued'
);
select is(
  (select count(*)::int from public.r2_deletion_queue
   where r2_key in ('u/a1000000-0000-4000-8000-000000000001/listing/k1.jpg',
                    'u/a1000000-0000-4000-8000-000000000001/listing/k3.jpg')),
  0, 'kept photo keys are not queued'
);

-- BR-55 / BR-54 errors (Marko: Free owner, one active listing f3…02).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.save_listing(null, 'giving', 'Poklanjam činiju', 'Opis.', 'equipment_toys', 'cat',
      (select id from city where name = 'Bečej'), null, false)$$,
  'Marko publishes his 2nd active listing'
);
select lives_ok(
  $$select public.save_listing(null, 'selling', 'Prodajem kavez', 'Opis.', 'carriers', 'other',
      (select id from city where name = 'Bečej'), 150000, false)$$,
  'and his 3rd'
);
select throws_ok(
  $$select public.save_listing(null, 'seeking', 'Tražim povodnik', 'Opis.', 'equipment_toys', 'dog',
      (select id from city where name = 'Bečej'), null, false)$$,
  'P0001', 'premium_required:listings', 'the 4th active non-need listing of a Free owner → premium_required:listings'
);
select throws_ok(
  $$select public.save_listing(null, 'need', 'Potrebna hrana', 'Opis.', 'food', 'dog',
      (select id from city where name = 'Novi Sad'), null, false, 'b2000000-0000-4000-8000-000000000003')$$,
  'P0001', 'listing_type_not_allowed', 'a need by a non-shelter user → listing_type_not_allowed'
);
reset role;

-- Visitors have no execute grant on the signed-in functions (42501).
select ok(
  not has_function_privilege('anon', 'public.my_listing_moderation(uuid)', 'execute'),
  'a Visitor cannot execute my_listing_moderation'
);
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select public.save_listing(null, 'giving', 'Anonimno', 'Opis.', 'other', 'cat',
      (select id from city where name = 'Bečej'), null, false)$$,
  '42501', null, 'a Visitor cannot execute save_listing'
);
select throws_ok($$select public.list_my_listings('active')$$, '42501', null,
  'a Visitor cannot execute list_my_listings');
select is((select count(*)::int from public.listings where title = 'Anonimno'), 0, 'nothing was written');
reset role;

-- FR-64 #1 — list_my_listings --------------------------------------------------------------------------------
-- An actioned report hid f3…03 (status set above).
insert into public.reports (reporter_id, listing_id, reason, note, status, handled_by, handled_at) values (
  'a1000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000003', 'scam',
  'Lažna ponuda.', 'actioned', 'a1000000-0000-4000-8000-000000000006', now() - interval '1 hour'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table my_active as select public.list_my_listings('active') as r;
create temp table my_resolved as select public.list_my_listings('resolved') as r;
create temp table my_expired as select public.list_my_listings('expired') as r;
create temp table me_ivana as select public.get_me() as me;
reset role;

select is(
  (select array_agg(x ->> 'id' order by o) from my_active, jsonb_array_elements(r -> 'items') with ordinality t (x, o)),
  array['f3000000-0000-4000-8000-000000000003', (select id::text from new_listing)],
  'FR-64 #1: the active group holds active and hidden listings, soonest expiry first'
);
select is(
  (select jsonb_build_object('total', r -> 'total', 'counts', r -> 'counts') from my_active),
  '{"total": 2, "counts": {"active": 2, "expired": 0, "resolved": 1}}'::jsonb,
  'total and per-group counts'
);
select is(
  (select array_agg((x ->> 'expires_at')::timestamptz order by o)
   from my_active, jsonb_array_elements(r -> 'items') with ordinality t (x, o)),
  (select array_agg(l.expires_at order by l.expires_at)
   from public.listings l where l.id in ('f3000000-0000-4000-8000-000000000003', (select id from new_listing))),
  'items carry expires_at'
);
select is(
  (select jsonb_build_object('status', x -> 'status', 'hidden_at', (x ->> 'hidden_at')::timestamptz = now() - interval '1 hour',
     'hidden_reason', x -> 'hidden_reason')
   from my_active, jsonb_array_elements(r -> 'items') x where x ->> 'id' = 'f3000000-0000-4000-8000-000000000003'),
  '{"status": "hidden", "hidden_at": true, "hidden_reason": "scam"}'::jsonb,
  'a hidden row carries hidden_at / hidden_reason from the actioned report'
);
select is(
  (select jsonb_build_object('hidden_at', x -> 'hidden_at', 'hidden_reason', x -> 'hidden_reason', 'photo_count', x -> 'photo_count',
     'cover', x ->> 'cover_photo_id')
   from my_active, jsonb_array_elements(r -> 'items') x where x ->> 'id' = (select id::text from new_listing)),
  '{"hidden_at": null, "hidden_reason": null, "photo_count": 2, "cover": "f3200000-0000-4000-8000-000000000003"}'::jsonb,
  'an active row has no moderation fields; photo_count and cover_photo_id follow the photo order'
);
select is((select r -> 'usage' from my_active), (select me -> 'marketplace' from me_ivana),
  'usage is the caller''s MarketplaceStatus');
select is(
  (select jsonb_build_object('active_listings', r -> 'usage' -> 'active_listings', 'limit', r -> 'usage' -> 'active_listing_limit')
   from my_active),
  '{"active_listings": 1, "limit": null}'::jsonb,
  'usage counts active non-need listings (the hidden one excluded); Premium has no limit'
);
select is(
  (select array_agg(x ->> 'id') from my_resolved, jsonb_array_elements(r -> 'items') x),
  array['f3000000-0000-4000-8000-000000000007'], 'the resolved group'
);
select is((select r -> 'items' from my_expired), '[]'::jsonb, 'Ivana has no expired listings');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('ids', pg_temp.ids(r -> 'items'), 'counts', r -> 'counts',
     'limit', r -> 'usage' -> 'active_listing_limit', 'can_extend', r -> 'items' -> 0 -> 'can_extend')
   from public.list_my_listings('expired') r),
  jsonb_build_object('ids', array['06'], 'counts', '{"active": 3, "expired": 1, "resolved": 0}'::jsonb,
    'limit', 3, 'can_extend', false),
  'Marko: the expired group, counts, limit 3 — and no extend while at the limit'
);
select throws_ok($$select public.list_my_listings('archived')$$, 'P0001', 'validation_failed',
  'an unknown group → validation_failed');
reset role;

select * from finish();
rollback;
