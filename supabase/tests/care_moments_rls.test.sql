-- RLS and write rules on the care log and moments (API §4.3, §4.4, EP-17 … EP-23):
-- BR-22, BR-23, BR-28; organisation roles and unrelated users have no access.
-- Seeded: Ivana (…01, Premium, owns household b1…01; Luna c1…01 shared with 3 feeding
-- entries — one by Jelena — 2 stool entries, moments c4…01 and c4…02 with a public link
-- on c4…02; Maks c1…02 not shared), Marko (…02, Free; Kiki c1…03), Jelena (…03, member of
-- b1…01), Milica (…04, admin of the shelter b2…01 with Žuća c1…04), Nikola (…05, admin of
-- the kennel b2…02), Ana (…06, Operator, no relation).
begin;
create extension if not exists pgtap with schema extensions;

select plan(62);

-- Setup (as postgres): entries on the shelter animal, a stool entry by Jelena on Luna.
insert into public.feeding_entries (pet_id, fed_at, type, created_by) values
  ('c1000000-0000-4000-8000-000000000004', now(), 'dry', 'a1000000-0000-4000-8000-000000000004');
insert into public.moments (pet_id, moment_date, created_by) values
  ('c1000000-0000-4000-8000-000000000004', current_date, 'a1000000-0000-4000-8000-000000000004');
insert into public.stool_entries (id, pet_id, observed_at, consistency, created_by) values
  ('e9000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', now(), 'normal',
   'a1000000-0000-4000-8000-000000000003');

-- Owner (Ivana): full access --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.feeding_entries), 3, 'the owner reads the feeding log of own pets');
select is((select count(*)::int from public.stool_entries), 3, 'and the stool log');
select is((select count(*)::int from public.moments), 2, 'and the moments');
select is((select count(*)::int from public.moment_public_links), 1, 'and the public links');
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000002', now(), 'wet')$$,
  'the owner adds a feeding entry'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency) values ('c1000000-0000-4000-8000-000000000002', now(), 'soft')$$,
  'the owner adds a stool entry'
);
select lives_ok(
  $$update public.feeding_entries set note = 'owner-edit'
    where created_by = 'a1000000-0000-4000-8000-000000000003'$$,
  'the owner edits a member''s feeding entry'
);
select is((select count(*)::int from public.feeding_entries where note = 'owner-edit'), 1, 'the edit applied');
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'owner-moment')$$,
  'the owner adds a moment'
);
select lives_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    values ((select id from public.moments where text = 'owner-moment'), 'moments/e9-2/1.jpg', 1)$$,
  'the owner adds a photo to the moment'
);
select lives_ok(
  $$update public.moment_public_links set active = false where moment_id = 'c4000000-0000-4000-8000-000000000002'$$,
  'the owner disables a public link'
);
select is((select active from public.moment_public_links where moment_id = 'c4000000-0000-4000-8000-000000000002'),
  false, 'the link is disabled');
select lives_ok(
  $$update public.moment_public_links set active = true where moment_id = 'c4000000-0000-4000-8000-000000000002'$$,
  'and enables it again'
);
reset role;

-- Member (Jelena) -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.feeding_entries), 3, 'a member reads the shared pet''s feeding log');
select is((select count(*)::int from public.stool_entries), 3, 'and its stool log');
select is((select count(*)::int from public.moments), 3, 'and its moments');
select is((select count(*)::int from public.moment_photos), 1, 'and their photos');
select is((select count(*)::int from public.moment_public_links), 1, 'and their public links');

-- BR-22: members add feeding/stool entries and moments.
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, note)
    values ('c1000000-0000-4000-8000-000000000001', now(), 'treat', 'member-feeding')$$,
  'a member adds a feeding entry (BR-22)'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency)
    values ('c1000000-0000-4000-8000-000000000001', now(), 'hard')$$,
  'a member adds a stool entry (BR-22)'
);
select lives_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'member-moment')$$,
  'a member adds a moment (BR-22)'
);
select lives_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    values ((select id from public.moments where text = 'member-moment'), 'moments/e9-4/1.jpg', 1)$$,
  'a member adds a photo to their own moment'
);
select lives_ok(
  $$insert into public.moment_public_links (moment_id, slug)
    values ((select id from public.moments where text = 'member-moment'), 'Rls0Slug1abcdefghijklm')$$,
  'a member enables a public link on their own moment (EP-23)'
);
select lives_ok(
  $$update public.moment_public_links set active = false where moment_id = (select id from public.moments where text = 'member-moment')$$,
  'and disables it'
);

-- BR-23 / E-12: members edit or delete only their own entries.
select lives_ok(
  $$update public.feeding_entries set amount_g = 12.5 where note = 'member-feeding'$$,
  'a member edits their own feeding entry'
);
select lives_ok(
  $$update public.stool_entries set note = 'member-edit' where id = 'e9000000-0000-4000-8000-000000000001'$$,
  'a member edits their own stool entry'
);
select throws_ok(
  $$update public.feeding_entries set note = 'X' where created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot edit the owner''s feeding entry (BR-23)'
);
select throws_ok(
  $$delete from public.feeding_entries where created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot delete the owner''s feeding entry (BR-23)'
);
select throws_ok(
  $$update public.stool_entries set consistency = 'soft' where created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot edit the owner''s stool entry (BR-23)'
);
select throws_ok(
  $$delete from public.stool_entries where created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot delete the owner''s stool entry (BR-23)'
);
select throws_ok(
  $$update public.moments set text = 'X' where id = 'c4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot edit the owner''s moment (BR-23)'
);
select throws_ok(
  $$delete from public.moments where id = 'c4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot delete the owner''s moment (EP-22)'
);
select throws_ok(
  $$insert into public.moment_photos (moment_id, r2_key, position)
    values ((select id from public.moments where text = 'owner-moment'), 'moments/e9-2/2.jpg', 2)$$,
  'P0001', 'forbidden_role', 'a member cannot add photos to the owner''s moment'
);
select throws_ok(
  $$delete from public.moment_photos where moment_id = (select id from public.moments where text = 'owner-moment')$$,
  'P0001', 'forbidden_role', 'a member cannot remove photos from the owner''s moment'
);
select throws_ok(
  $$update public.moment_public_links set active = false where moment_id = 'c4000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'a member cannot toggle the link of the owner''s moment (EP-23)'
);
select throws_ok(
  $$insert into public.moment_public_links (moment_id, slug)
    values ('c4000000-0000-4000-8000-000000000001', 'Rls0Slug2abcdefghijklm')$$,
  'P0001', 'forbidden_role', 'a member cannot enable a link on the owner''s moment (EP-23)'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000002', now(), 'dry')$$,
  '42501', null, 'a member cannot write the log of a pet that is not shared'
);
reset role;

-- Read-only household (BR-28) --------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
update public.subscriptions set status = 'expired'
where user_id = 'a1000000-0000-4000-8000-000000000001';
select ok((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  'the household is read-only once the owner''s Premium ends');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.feeding_entries), 4, 'members keep read access (BR-28)');
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000001', now(), 'dry')$$,
  'P0001', 'household_read_only', 'a member cannot add feeding to a read-only household (EP-18)'
);
select throws_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency) values ('c1000000-0000-4000-8000-000000000001', now(), 'normal')$$,
  'P0001', 'household_read_only', 'a member cannot add stool to a read-only household (EP-18)'
);
select throws_ok(
  $$update public.feeding_entries set note = 'X' where note = 'member-feeding'$$,
  'P0001', 'household_read_only', 'a member cannot edit their own entry in a read-only household'
);
select throws_ok(
  $$insert into public.moments (pet_id, moment_date) values ('c1000000-0000-4000-8000-000000000001', current_date)$$,
  'P0001', 'household_read_only', 'a member cannot add a moment to a read-only household (EP-21)'
);
select throws_ok(
  $$delete from public.moments where text = 'member-moment'$$,
  'P0001', 'household_read_only', 'a member cannot delete their own moment in a read-only household (EP-22)'
);
select throws_ok(
  $$update public.moment_public_links set active = true where moment_id = (select id from public.moments where text = 'member-moment')$$,
  'P0001', 'household_read_only', 'a member cannot toggle their link in a read-only household (EP-23)'
);
reset role;

-- The owner keeps writing their own pet's log.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000001', now(), 'dry')$$,
  'the owner still writes while the household is read-only'
);
reset role;

-- Back to Premium: the member deletes their own moment.
select set_config('request.jwt.claims', '', true);
update public.subscriptions set status = 'active'
where user_id = 'a1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from public.moments where text = 'member-moment'$$,
  'a member deletes their own moment (EP-22)'
);
select lives_ok(
  $$delete from public.feeding_entries where note = 'member-feeding'$$,
  'a member deletes their own feeding entry'
);
reset role;

-- Organisation roles: no access, even to their own organisation's animal (API §4.4 "—") -------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.feeding_entries), 0, 'an organisation Admin sees no feeding entries');
select is((select count(*)::int from public.moments), 0, 'an organisation Admin sees no moments');
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type) values ('c1000000-0000-4000-8000-000000000004', now(), 'dry')$$,
  '42501', null, 'an organisation Admin cannot log feeding for their animal'
);
select throws_ok(
  $$insert into public.moments (pet_id, moment_date) values ('c1000000-0000-4000-8000-000000000004', current_date)$$,
  '42501', null, 'an organisation Admin cannot add a moment for their animal'
);
reset role;

-- Unrelated users see nothing and change nothing (API §4.3) ----------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.feeding_entries), 0, 'an unrelated owner sees no feeding entries');
select is((select count(*)::int from public.stool_entries), 0, 'no stool entries');
select is((select count(*)::int from public.moments), 0, 'no moments');
select is((select count(*)::int from public.moment_photos), 0, 'no moment photos');
select is((select count(*)::int from public.moment_public_links), 0, 'no public links');
select throws_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency) values ('c1000000-0000-4000-8000-000000000001', now(), 'normal')$$,
  '42501', null, 'an unrelated owner cannot write another owner''s log'
);
update public.moments set text = 'hacked';
delete from public.feeding_entries;
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.moments), 0, 'an Operator sees no moments');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.moments where text = 'hacked'), 0,
  'an unrelated user''s update touched nothing');
select ok((select count(*)::int from public.feeding_entries) > 0,
  'an unrelated user''s delete touched nothing');

-- Visitors: no anon access (EP-24 goes through the service role).
set local role anon;
select throws_ok(
  $$select * from public.moment_public_links$$,
  '42501', null, 'anon cannot read public links directly'
);
reset role;

select * from finish();
rollback;
