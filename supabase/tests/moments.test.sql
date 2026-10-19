-- moments, moment_photos, moment_public_links (TC §5.4): structure; the Free moment limit
-- (BR-01, BR-02, BR-24, E-08); at most 5 photos (BR-06); text ≤ 280 characters (BR-52);
-- one public link per moment, removed with it (BR-45, data side); photo R2 keys queued
-- on delete (TC §5.9, API §10).
-- Seeded: Ivana (…01, Premium; Luna c1…01 with moments c4…01 and c4…02, the second with a
-- public link; Maks c1…02), Marko (…02, Free; Kiki c1…03), Jelena (…03, Free, member of
-- Ivana's household with Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(55);

-- Structure -----------------------------------------------------------------------------------
select columns_are('public', 'moments', array[
  'id', 'pet_id', 'moment_date', 'text', 'created_by', 'created_at', 'updated_at'
], 'moments has the TC §5.4 columns');
select col_type_is('public', 'moments', 'moment_date', 'date', 'moment_date is a date');
select col_not_null('public', 'moments', 'moment_date', 'moment_date is not null');
select col_is_null('public', 'moments', 'text', 'text is optional');
select fk_ok('public', 'moments', 'pet_id', 'public', 'pets', 'id', 'moments.pet_id → pets');
select fk_ok('public', 'moments', 'created_by', 'public', 'profiles', 'id', 'moments.created_by → profiles');
select has_index('public', 'moments', 'moments_pet_id_idx', array['pet_id'], 'index (pet_id) for the Free limit');

select columns_are('public', 'moment_photos', array[
  'id', 'moment_id', 'r2_key', 'position', 'created_at', 'updated_at'
], 'moment_photos has the TC §5.4 columns');
select col_not_null('public', 'moment_photos', 'r2_key', 'r2_key is not null');
select col_type_is('public', 'moment_photos', 'position', 'smallint', 'position is smallint');
select col_is_unique('public', 'moment_photos', array['moment_id', 'position'], 'unique (moment_id, position)');
select fk_ok('public', 'moment_photos', 'moment_id', 'public', 'moments', 'id', 'moment_photos.moment_id → moments');

select columns_are('public', 'moment_public_links', array[
  'id', 'moment_id', 'slug', 'active', 'created_at', 'updated_at'
], 'moment_public_links has the TC §5.4 columns');
select col_is_unique('public', 'moment_public_links', 'moment_id', 'one link per moment');
select col_is_unique('public', 'moment_public_links', 'slug', 'slug is unique');
select col_not_null('public', 'moment_public_links', 'slug', 'slug is not null');
select col_not_null('public', 'moment_public_links', 'active', 'active is not null');
select col_default_is('public', 'moment_public_links', 'active', 'true', 'active defaults to true');
select fk_ok('public', 'moment_public_links', 'moment_id', 'public', 'moments', 'id', 'moment_public_links.moment_id → moments');

select ok((select relrowsecurity from pg_class where oid = 'public.moments'::regclass), 'RLS is enabled on moments');
select ok((select relrowsecurity from pg_class where oid = 'public.moment_photos'::regclass), 'RLS is enabled on moment_photos');
select ok((select relrowsecurity from pg_class where oid = 'public.moment_public_links'::regclass), 'RLS is enabled on moment_public_links');
select ok(not has_table_privilege('anon', 'public.moment_public_links', 'select'),
  'no anon access to public links (EP-24 reads with the service role)');

-- BR-01: 5 moments per pet on Free ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    select 'c1000000-0000-4000-8000-000000000003', current_date - g, 'Kiki ' || g
    from generate_series(1, 5) g$$,
  'a Free owner adds 5 moments on a pet'
);
select throws_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000003', current_date, 'šesti')$$,
  'P0001', 'premium_required:moments', 'the 6th moment by a Free creator raises premium_required (moments)'
);
select is((select count(*)::int from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  5, 'the pet keeps 5 moments');
select lives_ok(
  $$delete from public.moments where text = 'Kiki 1'$$,
  'the owner deletes a moment'
);
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000003', current_date, 'opet pet')$$,
  'deleting a moment frees a slot'
);
reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$insert into public.moments (pet_id, moment_date, created_by)
    values ('c1000000-0000-4000-8000-000000000003', current_date, 'a1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'premium_required:moments', 'the limit holds for System inserts on behalf of a Free creator'
);

-- BR-02: Premium creator unlimited ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    select 'c1000000-0000-4000-8000-000000000002', current_date - g, 'Maks ' || g
    from generate_series(1, 12) g$$,
  'a Premium owner adds 12 moments on a pet (BR-02)'
);
-- Luna: 2 seeded + 3 → 5 moments.
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    select 'c1000000-0000-4000-8000-000000000001', current_date - g, 'Luna ' || g
    from generate_series(1, 3) g$$,
  'the Premium owner fills Luna to 5 moments'
);
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Luna 6')$$,
  'the Premium owner adds a 6th moment on Luna'
);
reset role;

-- BR-24: a member follows their own entitlement ----------------------------------------------------
select ok(not public.is_premium('a1000000-0000-4000-8000-000000000003'), 'Jelena (member) is on Free');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Jelena')$$,
  'P0001', 'premium_required:moments',
  'a Free member on a Premium owner''s pet with 5+ moments is limited (owner''s Premium does not extend)'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000003', 'premium_yearly', 'active', now() + interval '1 year');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Jelena Premium')$$,
  'a Premium member adds a moment past 5'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Moments for the photo, link and R2 checks (System inserts on Maks, Ivana is Premium).
insert into public.moments (id, pet_id, moment_date, text, created_by) values
  ('e8000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', current_date, 'fotografije',
   'a1000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', current_date, 'link',
   'a1000000-0000-4000-8000-000000000001');

-- BR-06: at most 5 photos --------------------------------------------------------------------------
select lives_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    select 'e8000000-0000-4000-8000-000000000001', 'moments/e8-1/' || g || '.jpg', g
    from generate_series(1, 5) g$$,
  'a moment holds photos at positions 1–5'
);
select throws_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    values ('e8000000-0000-4000-8000-000000000001', 'moments/e8-1/6.jpg', 6)$$,
  '23514', null, 'a 6th photo position is rejected (BR-06)'
);
select throws_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    values ('e8000000-0000-4000-8000-000000000002', 'moments/e8-2/0.jpg', 0)$$,
  '23514', null, 'position 0 is rejected'
);
select throws_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    values ('e8000000-0000-4000-8000-000000000001', 'moments/e8-1/dup.jpg', 3)$$,
  '23505', null, 'two photos cannot share a position, so a 6th photo cannot fit (BR-06)'
);
select throws_ok(
  $$insert into public.moment_photos (moment_id, r2_key)
    values ('e8000000-0000-4000-8000-000000000002', 'moments/e8-2/x.jpg')$$,
  '23502', null, 'a photo needs a position'
);
select is((select count(*)::int from public.moment_photos where moment_id = 'e8000000-0000-4000-8000-000000000001'),
  5, 'the moment keeps 5 photos');

-- BR-52: text ≤ 280 characters ----------------------------------------------------------------------
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text, created_by)
    values ('c1000000-0000-4000-8000-000000000002', current_date, repeat('š', 280), 'a1000000-0000-4000-8000-000000000001')$$,
  '280 characters are accepted'
);
select throws_ok(
  $$insert into public.moments (pet_id, moment_date, text, created_by)
    values ('c1000000-0000-4000-8000-000000000002', current_date, repeat('a', 281), 'a1000000-0000-4000-8000-000000000001')$$,
  '23514', null, '281 characters are rejected (BR-52)'
);
select throws_ok(
  $$update public.moments set text = repeat('a', 281) where id = 'e8000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'an edit to 281 characters is rejected (BR-52)'
);

-- BR-45 (data side): one link per moment, unique slug, removed with the moment ----------------
insert into public.moment_public_links (moment_id, slug)
values ('e8000000-0000-4000-8000-000000000002', 'Test0Slug1abcdefghijkl');
select is((select active from public.moment_public_links where moment_id = 'e8000000-0000-4000-8000-000000000002'),
  true, 'a new link is active');
select throws_ok(
  $$insert into public.moment_public_links (moment_id, slug)
    values ('e8000000-0000-4000-8000-000000000002', 'Test0Slug2abcdefghijkl')$$,
  '23505', null, 'a moment has at most one public link'
);
select throws_ok(
  $$insert into public.moment_public_links (moment_id, slug)
    values ('e8000000-0000-4000-8000-000000000001', 'Test0Slug1abcdefghijkl')$$,
  '23505', null, 'slugs are unique'
);
select throws_ok(
  $$insert into public.moment_public_links (moment_id, slug)
    values ('e8000000-0000-4000-8000-000000000001', null)$$,
  '23502', null, 'a link needs a slug'
);
update public.moment_public_links set active = false where moment_id = 'e8000000-0000-4000-8000-000000000002';
update public.moment_public_links set active = true where moment_id = 'e8000000-0000-4000-8000-000000000002';
select is((select slug from public.moment_public_links where moment_id = 'e8000000-0000-4000-8000-000000000002'),
  'Test0Slug1abcdefghijkl', 'toggling the link keeps the slug');
delete from public.moments where id = 'e8000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.moment_public_links where slug = 'Test0Slug1abcdefghijkl'),
  0, 'deleting the moment removes its public link (BR-45)');

-- R2 queue (TC §5.9, API §10) ----------------------------------------------------------------------
delete from public.moment_photos where moment_id = 'e8000000-0000-4000-8000-000000000001' and position = 5;
select ok(exists (select 1 from public.r2_deletion_queue where r2_key = 'moments/e8-1/5.jpg'),
  'deleting a photo queues its key');
delete from public.moments where id = 'e8000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.r2_deletion_queue where r2_key like 'moments/e8-1/%'),
  5, 'deleting a moment queues every photo key (cascade)'
);

insert into public.moments (id, pet_id, moment_date, created_by) values
  ('e8000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', current_date,
   'a1000000-0000-4000-8000-000000000001');
insert into public.moment_photos (moment_id, r2_key, position) values
  ('e8000000-0000-4000-8000-000000000003', 'moments/e8-3/1.jpg', 1),
  ('e8000000-0000-4000-8000-000000000003', 'moments/e8-3/2.jpg', 2);
insert into public.moment_public_links (moment_id, slug)
values ('e8000000-0000-4000-8000-000000000003', 'Test0Slug3abcdefghijkl');
delete from public.pets where id = 'c1000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.r2_deletion_queue where r2_key like 'moments/e8-3/%'),
  2, 'deleting a pet queues the photo keys of its moments'
);
select is(
  (select count(*)::int from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000002'),
  0, 'the pet''s moments are deleted with it'
);
select is((select count(*)::int from public.moment_public_links where slug = 'Test0Slug3abcdefghijkl'),
  0, 'and their public links');

select * from finish();
rollback;
