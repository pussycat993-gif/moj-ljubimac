-- Step 21 — view:moments_api (EP-20) and rpc:confirm_moment (EP-21 step 3): FR-17 (5 moments per pet
-- on Free, BR-01 / BR-24 / E-08; no limit on Premium; at most 5 photos, BR-06), FR-19 / BR-45 (deleting
-- a moment removes its public link and queues its photo keys), the EP-21 rules repeated in the
-- function, and the grants. Seeded: Ivana (…01, Premium; Luna c1…01 shared with household b1…01,
-- moments c4…01 and c4…02 with a public link on c4…02; Maks c1…02), Marko (…02, Free; Kiki c1…03),
-- Jelena (…03, member of b1…01), Milica (…04, shelter admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- Shape and grants ---------------------------------------------------------------------------------
select has_view('public', 'moments_api', 'view:moments_api exists');
select columns_are('public', 'moments_api', array[
  'id', 'pet_id', 'moment_date', 'text', 'photos', 'photo_count', 'public_link', 'created_by',
  'created_by_name', 'created_at', 'access'
], 'moments_api has exactly the Moment fields');
select is(
  (select reloptions from pg_class where oid = 'public.moments_api'::regclass),
  array['security_invoker=true'],
  'moments_api is security_invoker (RLS on moments decides visibility)'
);
select ok(not has_table_privilege('anon', 'public.moments_api', 'select'), 'anon cannot read moments_api');
select ok(has_table_privilege('authenticated', 'public.moments_api', 'select'), 'authenticated reads moments_api');
select ok(has_column_privilege('authenticated', 'public.moments', 'id', 'insert'),
  'authenticated may insert moments.id (EP-21 prepare_moment chooses the id)');
select ok(not has_column_privilege('authenticated', 'public.moments', 'id', 'update'), 'but not update it');
select function_returns('public', 'confirm_moment', array['uuid', 'uuid', 'date', 'text', 'jsonb'], 'jsonb',
  'confirm_moment(uuid, uuid, date, text, jsonb) returns jsonb');
select is(
  (select prosecdef from pg_proc where oid = 'public.confirm_moment(uuid, uuid, date, text, jsonb)'::regprocedure),
  false, 'confirm_moment is SECURITY INVOKER (RLS and triggers still apply)'
);
select ok(not has_function_privilege('anon', 'public.confirm_moment(uuid, uuid, date, text, jsonb)', 'execute'),
  'anon cannot call confirm_moment');
select ok(has_function_privilege('authenticated', 'public.confirm_moment(uuid, uuid, date, text, jsonb)', 'execute'),
  'authenticated calls confirm_moment');

-- Owner (Ivana): reads and confirms -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.moments_api where pet_id = 'c1000000-0000-4000-8000-000000000001'), 2,
  'the owner lists the pet''s moments');
select is(
  (select public_link from public.moments_api where id = 'c4000000-0000-4000-8000-000000000002') - 'url' - 'slug',
  '{"active": true}'::jsonb, 'public_link carries active'
);
select is(
  (select public_link ->> 'url' = 'https://mojljubimac.rs/t/' || (public_link ->> 'slug')
   from public.moments_api where id = 'c4000000-0000-4000-8000-000000000002'),
  true, 'and url = https://mojljubimac.rs/t/<slug>'
);
select is((select public_link from public.moments_api where id = 'c4000000-0000-4000-8000-000000000001'), null,
  'public_link is null when never enabled');
select is((select access from public.moments_api where id = 'c4000000-0000-4000-8000-000000000001'),
  '{"role": "owner", "can_edit": true, "can_delete": true}'::jsonb, 'the owner may delete any moment');

select lives_ok(
  $$select public.confirm_moment('c4100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
    current_date, 'Štrand', jsonb_build_array(
      jsonb_build_object('r2_key', 'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/moments/c4100000-0000-4000-8000-000000000001/2-b-b.jpg', 'position', 2),
      jsonb_build_object('r2_key', 'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/moments/c4100000-0000-4000-8000-000000000001/1-a-a.jpg', 'position', 1)))$$,
  'confirm_moment inserts a moment with its photos'
);
select is(
  (select jsonb_build_object('text', text, 'photo_count', photo_count, 'positions', jsonb_path_query_array(photos, '$[*].position'))
   from public.moments_api where id = 'c4100000-0000-4000-8000-000000000001'),
  '{"text": "Štrand", "photo_count": 2, "positions": [1, 2]}'::jsonb,
  'with the chosen id, its text and photos ordered by position'
);
select is((select created_by from public.moments where id = 'c4100000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'created_by is the caller');

select throws_ok(
  $$select public.confirm_moment('c4100000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    current_date, null, (select jsonb_agg(jsonb_build_object('r2_key',
      'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/moments/c4100000-0000-4000-8000-000000000002/' || i || '-x.jpg',
      'position', i)) from generate_series(1, 6) i))$$,
  'P0001', 'too_many_photos', 'a moment with 6 photos → too_many_photos (BR-06, E-08)'
);
select throws_ok(
  $$select public.confirm_moment('c4100000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    current_date, null, jsonb_build_array(jsonb_build_object('r2_key',
      'u/a1000000-0000-4000-8000-000000000002/pets/c1000000-0000-4000-8000-000000000003/moments/x/1-x.jpg', 'position', 1)))$$,
  'P0001', 'validation_failed', 'a photo key outside the moment''s own prefix → validation_failed'
);
select throws_ok(
  $$select public.confirm_moment('c4100000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    current_date + 2, 'sutra', '[]'::jsonb)$$,
  'P0001', 'validation_failed', 'a moment_date in the future → validation_failed'
);
select throws_ok(
  $$select public.confirm_moment('c4100000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    current_date, '  ', '[]'::jsonb)$$,
  'P0001', 'validation_failed', 'neither text nor photos → validation_failed'
);
select throws_ok(
  $$select public.confirm_moment('c4100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
    current_date, 'opet', '[]'::jsonb)$$,
  '23505', null, 'a moment id can be confirmed only once'
);

-- FR-17: Premium has no moment limit (Maks has none yet; six in a row).
select lives_ok(
  $$select public.confirm_moment(('c4200000-0000-4000-8000-00000000000' || i)::uuid,
    'c1000000-0000-4000-8000-000000000002', current_date, 'Maks ' || i, '[]'::jsonb)
    from generate_series(1, 6) i$$,
  'a Premium creator adds a 6th moment on a pet (no limit, FR-17)'
);
select is((select count(*)::int from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000002'), 6,
  'the pet now has 6 moments');

-- FR-19 / BR-45: deleting a moment removes its link and queues its photo keys.
select lives_ok(
  $$insert into public.moment_public_links (moment_id, slug) values ('c4100000-0000-4000-8000-000000000001', 'Ab3dEf6hIj9kLm2nOp5qRs')$$,
  'the owner enables a public link on the new moment'
);
select lives_ok($$delete from public.moments where id = 'c4100000-0000-4000-8000-000000000001'$$, 'the owner deletes the moment');
reset role;

select is((select count(*)::int from public.moment_public_links where slug = 'Ab3dEf6hIj9kLm2nOp5qRs'), 0,
  'the cascade removed the public link (BR-45)');
select is(
  (select count(*)::int from public.r2_deletion_queue
   where r2_key like 'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/moments/c4100000-0000-4000-8000-000000000001/%'),
  2, 'and both photo keys are queued for the R2 cleanup'
);

-- Member (Jelena): sees the shared pet's moments, may not delete the owner's -------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select access from public.moments_api where id = 'c4000000-0000-4000-8000-000000000001'),
  '{"role": "member", "can_edit": false, "can_delete": false}'::jsonb, 'a member may not change the owner''s moment');
select lives_ok(
  $$select public.confirm_moment('c4300000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
    current_date, 'od Jelene', '[]'::jsonb)$$,
  'a member confirms a moment on a shared pet (BR-22)'
);
select is((select access ->> 'can_delete' from public.moments_api where id = 'c4300000-0000-4000-8000-000000000001'),
  'true', 'and may delete their own (BR-23)');
reset role;

-- Free creator (Marko, Kiki): 5 moments, the 6th → premium_required:moments -------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select public.confirm_moment(('c4400000-0000-4000-8000-00000000000' || i)::uuid,
    'c1000000-0000-4000-8000-000000000003', current_date, 'Kiki ' || i, '[]'::jsonb)
    from generate_series(1, 5) i$$,
  'a Free creator adds 5 moments on a pet'
);
select throws_ok(
  $$select public.confirm_moment('c4400000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000003',
    current_date, 'Kiki 6', '[]'::jsonb)$$,
  'P0001', 'premium_required:moments', 'the 6th moment for a Free creator → premium_required, limit = moments (FR-17, FR-36)'
);
select is((select count(*)::int from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000003'), 5,
  'nothing of the 6th moment was written');
select throws_ok(
  $$select public.confirm_moment('c4400000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000001',
    current_date, 'tuđe', '[]'::jsonb)$$,
  'P0001', 'not_found', 'no relation to the pet → not_found'
);
reset role;

-- Organisation roles have no moments (EP-20: rows absent) ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.moments_api where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0,
  'an unrelated user sees no moments');
reset role;

select * from finish();
rollback;
