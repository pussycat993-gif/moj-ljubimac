-- Step 28a — user_blocks and reports (TC §5.10): structure; RLS (the blocker alone sees, adds and
-- removes their blocks — invisible to the blocked user; reporters insert and read their own reports,
-- the Operator reads and handles all); FR-70 #2 (one open report per reporter and target, allowed
-- again once the first is dismissed; note required for "other", ≤ 500); account deletion (EP-52:
-- listings, photos — keys queued — conversations and messages go, report references are nulled).
-- Seeded: Jelena (…03) blocked Nikola (…05); Marko (…02) reported Jelena's listing f3…04 (open);
-- Marko's gift f3…02 has the conversation f31…01 with Ivana (…01); Ana (…06) is the Operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

-- Structure ---------------------------------------------------------------------------------------
select columns_are('public', 'user_blocks', array['id', 'blocker_id', 'blocked_id', 'created_at'],
  'user_blocks has the TC §5.10 columns (no updated_at)');
select col_is_unique('public', 'user_blocks', array['blocker_id', 'blocked_id'], 'unique (blocker_id, blocked_id)');
select fk_ok('public', 'user_blocks', 'blocker_id', 'public', 'profiles', 'id', 'user_blocks.blocker_id → profiles');
select fk_ok('public', 'user_blocks', 'blocked_id', 'public', 'profiles', 'id', 'user_blocks.blocked_id → profiles');
select has_index('public', 'user_blocks', 'user_blocks_blocked_id_idx', array['blocked_id'], 'index (blocked_id)');

select columns_are('public', 'reports', array[
  'id', 'reporter_id', 'listing_id', 'reported_user_id', 'reason', 'note', 'status', 'handled_by',
  'handled_at', 'created_at', 'updated_at'
], 'reports has the TC §5.10 columns');
select col_type_is('public', 'reports', 'reason', 'report_reason', 'reason uses report_reason');
select col_not_null('public', 'reports', 'reason', 'reason is not null');
select col_default_is('public', 'reports', 'status', 'open', 'status defaults to open');
select fk_ok('public', 'reports', 'listing_id', 'public', 'listings', 'id', 'reports.listing_id → listings');
select fk_ok('public', 'reports', 'reported_user_id', 'public', 'profiles', 'id', 'reports.reported_user_id → profiles');
select fk_ok('public', 'reports', 'handled_by', 'public', 'profiles', 'id', 'reports.handled_by → profiles');
select has_index('public', 'reports', 'reports_open_listing_key', 'one open report per reporter and listing');
select has_index('public', 'reports', 'reports_open_user_key', 'one open report per reporter and user');
select has_index('public', 'reports', 'reports_status_created_at_idx', array['status', 'created_at'],
  'moderation queue index (status, created_at)');
select ok((select relrowsecurity from pg_class where oid = 'public.user_blocks'::regclass), 'RLS on user_blocks');
select ok((select relrowsecurity from pg_class where oid = 'public.reports'::regclass), 'RLS on reports');

-- user_blocks -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_blocks), 1, 'the blocker sees their block');
select throws_ok(
  $$insert into public.user_blocks (blocked_id) values ('a1000000-0000-4000-8000-000000000005')$$,
  '23505', null, 'a user is blocked once'
);
select throws_ok(
  $$insert into public.user_blocks (blocked_id) values ('a1000000-0000-4000-8000-000000000003')$$,
  '23514', null, 'nobody blocks themselves'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.user_blocks), 0, 'BR-59: the blocked user does not see the block');
delete from public.user_blocks;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.user_blocks), 0, 'the Operator does not see blocks either');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.user_blocks (blocked_id) values ('a1000000-0000-4000-8000-000000000001')$$,
  'a user blocks another user'
);
select lives_ok(
  $$delete from public.user_blocks where blocked_id = 'a1000000-0000-4000-8000-000000000001'$$,
  'and unblocks at any time'
);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.user_blocks), 1,
  'the unblock removed the row; the blocked user could not remove Jelena''s block'
);

-- reports: FR-70 #2 -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.reports (listing_id, reason) values ('f3000000-0000-4000-8000-000000000004', 'spam')$$,
  '23505', null, 'FR-70 #2: a second open report on the same listing is refused (shown as already submitted)'
);
select lives_ok(
  $$insert into public.reports (reported_user_id, reason) values ('a1000000-0000-4000-8000-000000000003', 'inappropriate')$$,
  'a user report'
);
select throws_ok(
  $$insert into public.reports (reported_user_id, reason) values ('a1000000-0000-4000-8000-000000000003', 'spam')$$,
  '23505', null, 'FR-70 #2: a second open report on the same user is refused'
);
select is(
  (select reported_user_id from public.reports where listing_id = 'f3000000-0000-4000-8000-000000000004'),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'a listing report names the listing''s author'
);
select throws_ok(
  $$insert into public.reports (reported_user_id, reason) values ('a1000000-0000-4000-8000-000000000001', 'other')$$,
  '23514', null, 'a note is required for "other"'
);
select throws_ok(
  $$insert into public.reports (reported_user_id, reason, note) values ('a1000000-0000-4000-8000-000000000001', 'other', '   ')$$,
  '23514', null, 'a blank note does not count'
);
select throws_ok(
  $$insert into public.reports (reported_user_id, reason, note)
    values ('a1000000-0000-4000-8000-000000000001', 'other', repeat('n', 501))$$,
  '23514', null, 'the note is at most 500 characters'
);
select lives_ok(
  $$insert into public.reports (reported_user_id, reason, note)
    values ('a1000000-0000-4000-8000-000000000001', 'other', repeat('n', 500))$$,
  'a 500-character note is accepted'
);
select is((select count(*)::int from public.reports), 3, 'the reporter reads their own reports');
update public.reports set status = 'dismissed';
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.reports where status = 'open'), 3,
  'a reporter cannot handle reports'
);
select throws_ok(
  $$insert into public.reports (reason, note) values ('spam', null)$$,
  'P0001', 'validation_failed', 'a report needs a reporter and a listing or a user'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.reports), 0, 'the reported user does not read reports about them');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.reports), 3, 'the Operator reads every report');
select lives_ok(
  $$update public.reports set status = 'dismissed', handled_by = 'a1000000-0000-4000-8000-000000000006', handled_at = now()
    where listing_id = 'f3000000-0000-4000-8000-000000000004'$$,
  'the Operator dismisses a report'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.reports (listing_id, reason) values ('f3000000-0000-4000-8000-000000000004', 'scam')$$,
  'FR-70 #2: after the first is dismissed the listing can be reported again'
);
reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
select throws_ok($$select count(*) from public.reports$$, '42501', null, 'Visitors have no access to reports');
reset role;

-- Account deletion (EP-52) -------------------------------------------------------------------------
-- Marko's gift gets a photo; Ivana reports Marko; Jelena reports his gift.
insert into public.listing_photos (listing_id, r2_key, position)
values ('f3000000-0000-4000-8000-000000000002', 'u/a1000000-0000-4000-8000-000000000002/listing/g.jpg', 1);
insert into public.reports (reporter_id, reported_user_id, reason) values
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'scam');
insert into public.reports (reporter_id, listing_id, reason) values
  ('a1000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000002', 'spam');

delete from auth.users where id = 'a1000000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.listings where author_id = 'a1000000-0000-4000-8000-000000000002'),
  0, 'the deleted user''s listings are removed'
);
select ok(
  exists (select 1 from public.r2_deletion_queue where r2_key = 'u/a1000000-0000-4000-8000-000000000002/listing/g.jpg'),
  'their listing photo keys are queued'
);
select is(
  (select count(*)::int from public.conversations where id = 'f3100000-0000-4000-8000-000000000001'),
  0, 'their conversations are removed'
);
select is(
  (select count(*)::int from public.messages where conversation_id = 'f3100000-0000-4000-8000-000000000001'),
  0, 'with their messages'
);
select is(
  (select count(*)::int from public.reports where reason = 'scam' and listing_id = 'f3000000-0000-4000-8000-000000000004'
     and reporter_id is null),
  2, 'reports they filed survive with reporter_id null'
);
select is(
  (select count(*)::int from public.reports
   where reporter_id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003')
     and status = 'open' and reported_user_id is null and listing_id is null),
  2, 'reports about them or their listings survive with the references nulled'
);

select * from finish();
rollback;
