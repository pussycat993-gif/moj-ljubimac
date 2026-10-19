-- Household RLS (API §4.4, EP-34 … EP-40): BR-25, BR-28, EP-36, EP-38.
-- Seeded users: Ivana (…01, Premium, owns household b1…01), Marko (…02),
-- Jelena (…03, member of b1…01), Ana (…06, unrelated).
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Setup (as postgres): Marko and Petar join Ivana's household; one pending invitation.
insert into auth.users (id, email) values ('c6000000-0000-4000-8000-000000000001', 'petar@mojljubimac.test');
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
values ('c6000000-0000-4000-8000-000000000001', 'owner', 'x', now(), 'seed');
insert into public.household_memberships (household_id, user_id) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001');
insert into public.household_invitations (id, household_id, email, token_hash) values
  ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'gost@mojljubimac.test', 'hash-rls-1');

-- Member (Jelena) ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.households), 1, 'a member reads the household they belong to');
select is((select count(*)::int from public.household_memberships), 3,
  'a member reads the memberships of their household');
select is((select count(*)::int from public.household_invitations), 0, 'a member sees no invitations');
select lives_ok(
  $$update public.household_memberships set reminders_enabled = true
    where household_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'a member switches their own reminders on (EP-38)'
);
select is(
  (select reminders_enabled from public.household_memberships
   where user_id = 'a1000000-0000-4000-8000-000000000003'),
  true, 'the opt-in is stored'
);
select throws_ok(
  $$update public.household_memberships set joined_at = now() - interval '1 year'
    where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'a member cannot update any other column of their membership'
);
update public.household_memberships set reminders_enabled = true
where user_id = 'a1000000-0000-4000-8000-000000000002';
select throws_ok(
  $$insert into public.household_invitations (household_id, email, token_hash)
    values ('b1000000-0000-4000-8000-000000000001', 'x@mojljubimac.test', 'hash-rls-member')$$,
  'P0001', 'forbidden_role', 'a member cannot invite (BR-25)'
);
select throws_ok(
  $$delete from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'a member cannot remove another member (BR-25)'
);
update public.households set name = 'Preimenovano';
select throws_ok(
  $$update public.households set read_only = false$$,
  '42501', null, 'read_only is not client-writable'
);
select throws_ok(
  $$insert into public.households (owner_id, name) values ('a1000000-0000-4000-8000-000000000003', 'Moje')$$,
  '42501', null, 'households have no client insert'
);
select throws_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'memberships have no client insert'
);

reset role;
select is(
  (select reminders_enabled from public.household_memberships
   where user_id = 'a1000000-0000-4000-8000-000000000002'),
  false, 'a member cannot switch another member''s reminders'
);
select is(
  (select name from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  'Domaćinstvo Petrović', 'a member cannot rename the household'
);

-- Owner (Ivana) -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.households), 1, 'the owner reads their household');
select is((select count(*)::int from public.household_memberships), 3, 'the owner reads all memberships');
select is((select count(*)::int from public.household_invitations), 1, 'the owner reads the invitations');
select lives_ok(
  $$insert into public.household_invitations (household_id, email, token_hash)
    values ('b1000000-0000-4000-8000-000000000001', 'novi@mojljubimac.test', 'hash-rls-owner')$$,
  'the owner creates an invitation (BR-25)'
);
select lives_ok(
  $$insert into public.household_invitations (household_id, token_hash)
    values ('b1000000-0000-4000-8000-000000000001', 'hash-rls-link')$$,
  'the owner creates a link invitation'
);
select lives_ok(
  $$update public.household_invitations set status = 'expired', expires_at = now()
    where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'the owner revokes an invitation (EP-36)'
);
select throws_ok(
  $$update public.household_invitations set accepted_by = 'a1000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'accepted_by is not writable by the owner'
);
select throws_ok(
  $$delete from public.household_invitations$$,
  '42501', null, 'invitations have no client delete'
);
select lives_ok(
  $$update public.households set name = 'Kuća Petrović' where id = 'b1000000-0000-4000-8000-000000000001'$$,
  'the owner renames their household'
);
update public.household_memberships set reminders_enabled = true
where user_id = 'a1000000-0000-4000-8000-000000000002';
select lives_ok(
  $$delete from public.household_memberships where user_id = 'c6000000-0000-4000-8000-000000000001'$$,
  'the owner removes a member (BR-25, EP-36)'
);

reset role;
select is(
  (select reminders_enabled from public.household_memberships
   where user_id = 'a1000000-0000-4000-8000-000000000002'),
  false, 'the owner cannot switch a member''s reminders (EP-38: owner → not_found)'
);
select is(
  (select count(*)::int from public.household_memberships where user_id = 'c6000000-0000-4000-8000-000000000001'),
  0, 'the removed member''s row is gone'
);

-- Unrelated user (Ana) sees nothing -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.households), 0, 'an unrelated user sees no household');
select is((select count(*)::int from public.household_memberships), 0, 'an unrelated user sees no memberships');
select is((select count(*)::int from public.household_invitations), 0, 'an unrelated user sees no invitations');
select throws_ok(
  $$insert into public.household_invitations (household_id, token_hash)
    values ('b1000000-0000-4000-8000-000000000001', 'hash-rls-stranger')$$,
  '42501', null, 'an unrelated user cannot invite'
);
delete from public.household_memberships;
reset role;
select is(
  (select count(*)::int from public.household_memberships
   where household_id = 'b1000000-0000-4000-8000-000000000001'),
  2, 'an unrelated user cannot delete memberships'
);

set local role anon;
select throws_ok($$select * from public.households$$, '42501', null, 'anon cannot read households');
reset role;

-- BR-28: the owner's Premium expires → read_only; members keep read access ---------------------------
update public.subscriptions set status = 'expired'
where user_id = 'a1000000-0000-4000-8000-000000000001';
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'expiring the owner''s subscription sets read_only'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'a member still reads the read-only household'
);
select is((select count(*)::int from public.household_memberships), 2,
  'a member still reads the memberships');
select lives_ok(
  $$update public.household_memberships set reminders_enabled = false
    where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'opt-in stays allowed while read-only (EP-38)'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$delete from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'P0001', 'household_read_only', 'remove_member while read-only raises household_read_only (EP-36)'
);
select lives_ok(
  $$update public.household_invitations set status = 'expired' where token_hash = 'hash-rls-owner'$$,
  'revoking an invitation stays allowed while read-only (EP-36)'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$delete from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'a member leaves while read-only (EP-36)'
);
reset role;
select is(
  (select count(*)::int from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000002'),
  0, 'the member has left'
);

-- Premium again → read_only cleared; cancelled past the period end → read_only again
select set_config('request.jwt.claims', '', true);
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000001', 'premium_yearly', 'active', now() + interval '1 year');
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  false, 'a new active subscription clears read_only'
);
update public.subscriptions set status = 'cancelled', current_period_end = now() - interval '1 minute'
where user_id = 'a1000000-0000-4000-8000-000000000001' and status = 'active';
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'a cancelled subscription past its period end sets read_only'
);

select * from finish();
rollback;
