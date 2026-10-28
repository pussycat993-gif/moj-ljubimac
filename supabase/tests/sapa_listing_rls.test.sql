-- Step 28a — listings / listing_photos RLS (TC §5.10, API §5.9 "Public visibility"): Visitors and
-- signed-in users read listings and photos only when status = active and the author is not
-- suspended; authors read all of their own rows; the Operator reads all; writes by the author only;
-- hidden / restore only by the Operator. BR-60: a suspended author cannot publish or edit (as author)
-- — marketplace_suspended — but can still delete; their listings disappear for everyone else.
-- Seeded: Ivana (…01, Premium; active f3…03, resolved f3…07), Marko (…02; active f3…02, expired
-- f3…06), Jelena (…03; active f3…04, f3…05), Dragana (…07; active need f3…01), Ana (…06, Operator).
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

select ok((select relrowsecurity from pg_class where oid = 'public.listings'::regclass), 'RLS is enabled on listings');
select ok((select relrowsecurity from pg_class where oid = 'public.listing_photos'::regclass), 'RLS is enabled on listing_photos');
select ok(not has_table_privilege('anon', 'public.listings', 'insert'), 'Visitors cannot write listings');
select ok(not has_column_privilege('authenticated', 'public.listings', 'author_id', 'insert'),
  'author_id is not client-writable (defaults to the caller)');
select ok(not has_column_privilege('authenticated', 'public.listings', 'published_at', 'update'),
  'published_at never changes (BR-56)');

-- One photo on an active and one on an expired listing.
insert into public.listing_photos (listing_id, r2_key, position) values
  ('f3000000-0000-4000-8000-000000000003', 'u/a1000000-0000-4000-8000-000000000001/listing/t.jpg', 1),
  ('f3000000-0000-4000-8000-000000000006', 'u/a1000000-0000-4000-8000-000000000002/listing/p.jpg', 1);

-- Visitor ---------------------------------------------------------------------------------------------
set local role anon;
select is(
  (select array_agg(id::text order by id) from public.listings),
  array['f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
        'f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000004',
        'f3000000-0000-4000-8000-000000000005'],
  'FR-61: a Visitor reads the active listings only'
);
select is(
  (select array_agg(listing_id::text) from public.listing_photos),
  array['f3000000-0000-4000-8000-000000000003'], 'a Visitor reads photos of active listings only'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Anonimno', 'Opis.', 'other', 'cat', (select id from public.cities limit 1))$$,
  '42501', null, 'a Visitor cannot publish'
);
reset role;

-- Signed-in users -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.listings), 6,
  'Marko reads the 5 active listings and his own expired one'
);
select is(
  (select count(*)::int from public.listing_photos), 2, 'and the photos of those listings'
);
select is(
  (select count(*)::int from public.listings where id = 'f3000000-0000-4000-8000-000000000007'), 0,
  'someone else''s resolved listing is not visible'
);
update public.listings set title = 'Preuzeto' where id = 'f3000000-0000-4000-8000-000000000003';
delete from public.listings where id = 'f3000000-0000-4000-8000-000000000003';
select throws_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ('f3000000-0000-4000-8000-000000000003', 'u/x/listing/2.jpg', 2)$$,
  '42501', null, 'photos are added only by the author'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select title from public.listings where id = 'f3000000-0000-4000-8000-000000000003'),
  'Prodajem transporter za psa', 'another user can neither update nor delete the listing'
);
select is(
  (select count(*)::int from public.listings where id = 'f3000000-0000-4000-8000-000000000007'), 1,
  'the author reads their resolved listing'
);
select lives_ok(
  $$update public.listings set title = 'Prodajem transporter za psa do 15 kg', price_minor = 200000
    where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'the author edits their active listing'
);
select throws_ok(
  $$update public.listings set status = 'hidden' where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'P0001', 'listing_not_active', 'the author cannot hide a listing'
);
reset role;

-- Operator: reads all, hides and restores --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.listings), 7, 'the Operator reads every listing');
select is((select count(*)::int from public.listing_photos), 2, 'the Operator reads every photo');
select lives_ok(
  $$update public.listings set status = 'hidden' where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'the Operator hides a listing'
);
reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
select is(
  (select count(*)::int from public.listings where id = 'f3000000-0000-4000-8000-000000000003'), 0,
  'a hidden listing leaves the public list'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select status::text from public.listings where id = 'f3000000-0000-4000-8000-000000000003'), 'hidden',
  'the author still reads their hidden listing'
);
select throws_ok(
  $$update public.listings set status = 'active' where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'P0001', 'listing_not_active', 'the author cannot restore a hidden listing'
);
select throws_ok(
  $$update public.listings set title = 'Opet' where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'P0001', 'listing_not_active', 'the author cannot edit a hidden listing'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.listings set status = 'active' where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'the Operator restores a hidden listing'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-60: suspension ----------------------------------------------------------------------------------
update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000003';

set local role anon;
select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000003'), 0,
  'BR-60: a suspended author''s active listings are hidden from Visitors'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000003'), 0,
  'BR-60: and from other signed-in users'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000003'), 2,
  'the Operator still reads them'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000003'), 2,
  'the suspended author still reads their own listings'
);
select is(
  (select status::text from public.listings where id = 'f3000000-0000-4000-8000-000000000004'), 'active',
  'their listings keep their status'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Novi', 'Opis.', 'other', 'cat', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  'P0001', 'marketplace_suspended', 'BR-60: a suspended user cannot publish'
);
select throws_ok(
  $$update public.listings set title = 'Izmena' where id = 'f3000000-0000-4000-8000-000000000005'$$,
  'P0001', 'marketplace_suspended', 'BR-60: a suspended user cannot edit'
);
select throws_ok(
  $$update public.listings set status = 'resolved', resolved_outcome = 'found'
    where id = 'f3000000-0000-4000-8000-000000000005'$$,
  'P0001', 'marketplace_suspended', 'BR-60: a suspended user cannot resolve or extend'
);
select lives_ok(
  $$delete from public.listings where id = 'f3000000-0000-4000-8000-000000000005'$$,
  'a suspended user can still delete their listing (EP-77)'
);
select is(
  (select count(*)::int from public.listings where id = 'f3000000-0000-4000-8000-000000000005'), 0,
  'the listing is gone'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- System writes (expiry job, service role) are not stopped by the suspension.
select lives_ok(
  $$update public.listings set status = 'expired' where id = 'f3000000-0000-4000-8000-000000000004'$$,
  'the expiry job still expires a suspended author''s listing'
);

-- Lifting the suspension shows the listings again by their own status.
update public.profiles set marketplace_suspended_at = null where id = 'a1000000-0000-4000-8000-000000000003';
update public.listings set status = 'active' where id = 'f3000000-0000-4000-8000-000000000004';
set local role anon;
select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000003'), 1,
  'after the suspension is lifted the active listing is public again'
);
reset role;

select * from finish();
rollback;
