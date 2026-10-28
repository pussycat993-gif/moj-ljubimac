-- Step 28a — listings and listing_photos (TC §5.10): structure; BR-54 (need only for members of an
-- approved shelter, medicine_care only for needs → check, API §7.1 category_not_allowed); BR-55 /
-- OQ-16 (3 active non-need listings on Free; Premium, Shelter accounts and needs unlimited; resolved /
-- expired / hidden not counted; an active breeder plan does not lift the limit; extend and restore
-- re-check it; at most 5 photos); BR-56 (expires_at = published_at + 30 days, resolved ⇔ outcome);
-- BR-57 (price only on selling); FR-64 #6 (delete cascades photos, queues keys, nulls
-- conversations.listing_id and reports.listing_id); author edits of resolved / hidden listings.
-- Seeded: Ivana (…01, Premium; active selling f3…03, resolved f3…07), Marko (…02, Free; active
-- giving f3…02 with conversation f31…01, expired f3…06), Jelena (…03, Free; active f3…04 with an
-- open report, f3…05), Milica (…04, shelter account, admin of the pending shelter b2…01), Nikola
-- (…05, breeder, admin of b2…02), Dragana (…07, shelter account, admin of the approved shelter b2…03).
begin;
create extension if not exists pgtap with schema extensions;

select plan(78);

-- Structure ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'listing_type', array['need', 'giving', 'selling', 'seeking'], 'listing types');
select enum_has_labels('public', 'listing_category',
  array['food', 'equipment_toys', 'furniture', 'carriers', 'medicine_care', 'other'], 'listing categories');
select enum_has_labels('public', 'listing_species', array['dog', 'cat', 'other'], 'listing species');
select enum_has_labels('public', 'listing_status', array['active', 'resolved', 'expired', 'hidden'], 'listing statuses');
select enum_has_labels('public', 'listing_outcome', array['given', 'sold', 'donated', 'found'], 'listing outcomes');
select enum_has_labels('public', 'report_reason',
  array['spam', 'scam', 'inappropriate', 'animal_welfare', 'other'], 'report reasons');
select enum_has_labels('public', 'report_status', array['open', 'actioned', 'dismissed'], 'report statuses');

select columns_are('public', 'listings', array[
  'id', 'author_id', 'organisation_id', 'type', 'title', 'description', 'category', 'species', 'city_id',
  'price_minor', 'price_negotiable', 'status', 'resolved_outcome', 'published_at', 'expires_at',
  'expiry_notice_sent_at', 'created_at', 'updated_at'
], 'listings has the TC §5.10 columns (none of the OQ-17 proposals)');
select col_not_null('public', 'listings', 'author_id', 'author_id is not null');
select col_not_null('public', 'listings', 'expires_at', 'expires_at is not null');
select col_default_is('public', 'listings', 'status', 'active', 'status defaults to active');
select col_default_is('public', 'listings', 'price_negotiable', 'false', 'price_negotiable defaults to false');
select fk_ok('public', 'listings', 'author_id', 'public', 'profiles', 'id', 'listings.author_id → profiles');
select fk_ok('public', 'listings', 'organisation_id', 'public', 'organisations', 'id', 'listings.organisation_id → organisations');
select fk_ok('public', 'listings', 'city_id', 'public', 'cities', 'id', 'listings.city_id → cities');
select has_index('public', 'listings', 'listings_active_published_at_idx', 'partial index for the public list (EP-73)');
select has_index('public', 'listings', 'listings_active_filters_idx', 'partial index for the filtered list (EP-73)');
select has_index('public', 'listings', 'listings_author_id_status_idx', array['author_id', 'status'],
  'index (author_id, status) for the Free limit and EP-76');
select has_index('public', 'listings', 'listings_active_expires_at_idx', 'partial index for the expiry job (EP-87)');
select has_index('public', 'listings', 'listings_organisation_id_idx', 'index on organisation_id');

select columns_are('public', 'listing_photos', array[
  'id', 'listing_id', 'r2_key', 'position', 'created_at', 'updated_at'
], 'listing_photos has the TC §5.10 columns');
select col_is_unique('public', 'listing_photos', array['listing_id', 'position'], 'unique (listing_id, position)');
select fk_ok('public', 'listing_photos', 'listing_id', 'public', 'listings', 'id', 'listing_photos.listing_id → listings');

-- BR-54: need listings --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, organisation_id, title, description, category, species, city_id)
    values ('need', 'b2000000-0000-4000-8000-000000000003',
            'Potrebni lekovi protiv buva', 'Za 34 psa.', 'medicine_care', 'dog',
            (select id from public.cities where name_sr = 'Novi Sad'))$$,
  'BR-54: an Admin of an approved shelter posts a need (medicine_care allowed for needs)'
);
select is(
  (select organisation_id from public.listings where title = 'Potrebni lekovi protiv buva'),
  'b2000000-0000-4000-8000-000000000003'::uuid, 'the need is posted for the shelter'
);
select is(
  (select author_id from public.listings where title = 'Potrebni lekovi protiv buva'),
  'a1000000-0000-4000-8000-000000000007'::uuid, 'author_id defaults to the caller'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.listings (type, organisation_id, title, description, category, species, city_id)
    values ('need', 'b2000000-0000-4000-8000-000000000003', 'Hrana', 'Za azil.', 'food', 'dog',
            (select id from public.cities where name_sr = 'Novi Sad'))$$,
  'P0001', 'listing_type_not_allowed', 'BR-54: a non-member cannot post a need for a shelter'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('need', 'Hrana', 'Bez azila.', 'food', 'dog', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  'P0001', 'listing_type_not_allowed', 'BR-54: a need without a shelter is refused'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Kapi za oči', 'Višak.', 'medicine_care', 'cat',
            (select id from public.cities where name_sr = 'Novi Sad'))$$,
  '23514', null, 'BR-54: medicine_care on a non-need listing is a check violation (category_not_allowed)'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.listings (type, organisation_id, title, description, category, species, city_id)
    values ('need', 'b2000000-0000-4000-8000-000000000001', 'Hrana', 'Za azil.', 'food', 'dog',
            (select id from public.cities where name_sr = 'Bečej'))$$,
  'P0001', 'listing_type_not_allowed', 'BR-54: a member of a pending shelter cannot post a need'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.listings (type, organisation_id, title, description, category, species, city_id)
    values ('need', 'b2000000-0000-4000-8000-000000000002', 'Hrana', 'Za odgajivačnicu.', 'food', 'dog',
            (select id from public.cities where name_sr = 'Beograd'))$$,
  'P0001', 'listing_type_not_allowed', 'BR-54: a breeder cannot post a need'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-57: price only on selling ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_minor)
    values ('selling', 'Prodajem ogradu', 'Ograda za štence.',
            'furniture', 'dog', (select id from public.cities where name_sr = 'Novi Sad'), 300000)$$,
  'BR-57: selling with a price'
);
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_negotiable)
    values ('selling', 'Prodajem korpu', 'Korpa za mačke.', 'furniture', 'cat',
            (select id from public.cities where name_sr = 'Novi Sad'), true)$$,
  'BR-57: selling "po dogovoru"'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_minor, price_negotiable)
    values ('selling', 'Oba', 'Cena i dogovor.', 'furniture', 'cat',
            (select id from public.cities where name_sr = 'Novi Sad'), 100000, true)$$,
  '23514', null, 'BR-57: selling with both a price and "po dogovoru" is refused'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('selling', 'Bez cene', 'Ništa.', 'furniture', 'cat', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  '23514', null, 'BR-57: selling without a price or "po dogovoru" is refused'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_minor)
    values ('selling', 'Nula', 'Ništa.', 'furniture', 'cat', (select id from public.cities where name_sr = 'Novi Sad'), 0)$$,
  '23514', null, 'BR-57: a price must be greater than 0'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_minor)
    values ('giving', 'Poklon', 'Sa cenom.', 'other', 'cat', (select id from public.cities where name_sr = 'Novi Sad'), 100000)$$,
  '23514', null, 'BR-57: a gift carries no price'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_negotiable)
    values ('seeking', 'Tražim', 'Po dogovoru.', 'other', 'cat', (select id from public.cities where name_sr = 'Novi Sad'), true)$$,
  '23514', null, 'BR-57: a search carries no "po dogovoru"'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', repeat('a', 81), 'Opis.', 'other', 'cat', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  '23514', null, 'title is at most 80 characters'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Naslov', '', 'other', 'cat', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  '23514', null, 'description is required'
);

-- BR-56: expiry and outcome ---------------------------------------------------------------------
select is(
  (select expires_at - published_at from public.listings where title = 'Prodajem ogradu'),
  interval '30 days', 'BR-56: expires_at = published_at + 30 days on insert'
);
select throws_ok(
  $$update public.listings set status = 'resolved' where title = 'Prodajem ogradu'$$,
  '23514', null, 'BR-56: a resolved listing needs an outcome'
);
select throws_ok(
  $$update public.listings set resolved_outcome = 'sold' where title = 'Prodajem ogradu'$$,
  '23514', null, 'BR-56: an active listing has no outcome'
);
select lives_ok(
  $$update public.listings set status = 'resolved', resolved_outcome = 'sold'
    where title = 'Prodajem ogradu'$$,
  'the author resolves an active listing with an outcome'
);
select throws_ok(
  $$update public.listings set title = 'Nov naslov' where title = 'Prodajem ogradu'$$,
  'P0001', 'listing_not_active', 'a resolved listing cannot be edited (EP-75)'
);
select throws_ok(
  $$update public.listings set status = 'active', resolved_outcome = null
    where title = 'Prodajem ogradu'$$,
  'P0001', 'listing_not_active', 'a resolved listing cannot be reopened by its author'
);
select throws_ok(
  $$update public.listings set status = 'hidden' where id = 'f3000000-0000-4000-8000-000000000003'$$,
  'P0001', 'listing_not_active', 'only the Operator hides a listing'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-55 / FR-63 #6, #7 / OQ-16: the Free limit ------------------------------------------------------
-- Marko (Free) has 1 active listing.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id) values
      ('giving', 'Poklon 2', 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Beograd')),
      ('seeking', 'Tražim 3', 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Beograd'))$$,
  'a Free user publishes up to 3 active listings'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Četvrti', 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Beograd'))$$,
  'P0001', 'premium_required:listings', 'FR-63 #6: the 4th active listing of a Free user → premium_required (listings)'
);
select throws_ok(
  $$update public.listings set status = 'active', expires_at = now() + interval '30 days'
    where id = 'f3000000-0000-4000-8000-000000000006'$$,
  'P0001', 'premium_required:listings', 'BR-56: extending an expired listing counts toward the limit'
);
reset role;
select set_config('request.jwt.claims', '', true);

update public.listings set status = 'resolved', resolved_outcome = 'given' where title = 'Poklon 2';
update public.listings set status = 'hidden' where title = 'Tražim 3';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Posle rešenog', 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Beograd'))$$,
  'resolved and hidden listings do not count'
);
select lives_ok(
  $$update public.listings set status = 'active', expires_at = now() + interval '30 days', expiry_notice_sent_at = null
    where id = 'f3000000-0000-4000-8000-000000000006'$$,
  'extending an expired listing works under the limit (expired listings do not count)'
);
select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000002' and status = 'active'),
  3, 'Marko has 3 active listings'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Restore after hide re-checks the limit for every writer (EP-86 falls back to expired).
select throws_ok(
  $$update public.listings set status = 'active' where title = 'Tražim 3'$$,
  'P0001', 'premium_required:listings', 'restoring a hidden listing re-checks the limit'
);

-- Premium, Shelter account, needs: no limit (FR-63 #7).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    select 'giving', 'Premium ' || g, 'Opis.', 'other', 'cat', (select id from public.cities where name_sr = 'Novi Sad')
    from generate_series(1, 4) g$$,
  'FR-63 #7: a Premium user has no limit'
);
select cmp_ok(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000001' and status = 'active'),
  '>', 3, 'the Premium user has more than 3 active listings'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    select 'giving', 'Azil poklanja ' || g, 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Novi Sad')
    from generate_series(1, 4) g$$,
  'FR-63 #7: a Shelter account has no limit'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Jelena (Free, 2 active) volunteers at the approved shelter: needs neither count nor stop.
insert into public.organisation_memberships (organisation_id, user_id, role)
values ('b2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'volunteer');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('seeking', 'Treći', 'Opis.', 'other', 'other', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  'Jelena reaches 3 active listings'
);
select lives_ok(
  $$insert into public.listings (type, organisation_id, title, description, category, species, city_id)
    select 'need', 'b2000000-0000-4000-8000-000000000003', 'Potreba ' || g, 'Opis.', 'food', 'cat',
           (select id from public.cities where name_sr = 'Novi Sad')
    from generate_series(1, 2) g$$,
  'FR-63 #7: a Volunteer of an approved shelter posts needs past the Free limit'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Četvrti', 'Opis.', 'other', 'other', (select id from public.cities where name_sr = 'Novi Sad'))$$,
  'P0001', 'premium_required:listings', 'need listings do not count, but the Free limit still holds for her own listings'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- OQ-16 (PRD default): an active breeder plan does not lift the limit.
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_minor)
    select 'selling', 'Odgajivač ' || g, 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Beograd'),
           100000 * g
    from generate_series(1, 3) g$$,
  'a breeder publishes 3 listings'
);
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id, price_negotiable)
    values ('selling', 'Četvrti', 'Opis.', 'other', 'dog', (select id from public.cities where name_sr = 'Beograd'), true)$$,
  'P0001', 'premium_required:listings', 'OQ-16: an active breeder plan does not lift the 3-listing limit'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-55 / FR-63 #5: at most 5 photos ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    select 'f3000000-0000-4000-8000-000000000003', 'u/a1000000-0000-4000-8000-000000000001/listing/' || g || '.jpg', g
    from generate_series(1, 5) g$$,
  'a listing holds 5 photos'
);
select throws_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ('f3000000-0000-4000-8000-000000000003', 'u/x/listing/6.jpg', 6)$$,
  'P0001', 'validation_failed', 'FR-63 #5: a 6th photo is refused (listing_photos_max)'
);
select throws_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ((select id from public.listings where title = 'Potrebni lekovi protiv buva'), 'u/x/listing/6.jpg', 6)$$,
  '42501', null, 'photos are added only by the listing''s author'
);
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ('f3000000-0000-4000-8000-000000000002', 'u/x/listing/6.jpg', 6)$$,
  '23514', null, 'position is 1–5 (BR-55)'
);
select throws_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ('f3000000-0000-4000-8000-000000000002', 'u/x/listing/0.jpg', 0)$$,
  '23514', null, 'position 0 is refused'
);
select lives_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ('f3000000-0000-4000-8000-000000000002', 'u/a1000000-0000-4000-8000-000000000002/listing/a.jpg', 1)$$,
  'a photo on Marko''s gift'
);
select throws_ok(
  $$insert into public.listing_photos (listing_id, r2_key, position)
    values ('f3000000-0000-4000-8000-000000000002', 'u/a1000000-0000-4000-8000-000000000002/listing/b.jpg', 1)$$,
  '23505', null, 'one photo per position'
);
insert into public.listing_photos (listing_id, r2_key, position)
values ('f3000000-0000-4000-8000-000000000002', 'u/a1000000-0000-4000-8000-000000000002/listing/b.jpg', 2);

-- FR-64 #6: deleting a listing --------------------------------------------------------------------
-- Ivana removes one photo; Marko deletes his gift (photos, a conversation) and Jelena her bed (a report).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
delete from public.listing_photos where listing_id = 'f3000000-0000-4000-8000-000000000003' and position = 5;
reset role;
select set_config('request.jwt.claims', '', true);
select ok(
  exists (select 1 from public.r2_deletion_queue where r2_key = 'u/a1000000-0000-4000-8000-000000000001/listing/5.jpg'),
  'a removed photo''s key is queued (TC §5.9)'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from public.listings where id = 'f3000000-0000-4000-8000-000000000002'$$,
  'FR-64 #6: the author deletes the listing'
);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.listings where id = 'f3000000-0000-4000-8000-000000000002'),
  0, 'the listing is removed'
);
select is(
  (select count(*)::int from public.listing_photos where listing_id = 'f3000000-0000-4000-8000-000000000002'),
  0, 'its photos are removed'
);
select is(
  (select count(*)::int from public.r2_deletion_queue
   where r2_key in ('u/a1000000-0000-4000-8000-000000000002/listing/a.jpg',
                    'u/a1000000-0000-4000-8000-000000000002/listing/b.jpg')),
  2, 'its photo keys are queued'
);
select is(
  (select listing_id from public.conversations where id = 'f3100000-0000-4000-8000-000000000001'),
  null, 'the conversation survives with listing_id null ("oglas obrisan")'
);
select is(
  (select count(*)::int from public.messages where conversation_id = 'f3100000-0000-4000-8000-000000000001'),
  2, 'its messages remain'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from public.listings where id = 'f3000000-0000-4000-8000-000000000004'$$,
  'the author deletes a reported listing'
);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select row(listing_id, reported_user_id, status)::text from public.reports
   where reporter_id = 'a1000000-0000-4000-8000-000000000002'),
  row(null::uuid, 'a1000000-0000-4000-8000-000000000003'::uuid, 'open'::public.report_status)::text,
  'the report survives with listing_id null and still names the author'
);

select * from finish();
rollback;
