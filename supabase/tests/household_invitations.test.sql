-- Household invitations (Step 22): EP-35 create_household_invitation, EP-39 get_household_invitation,
-- EP-40 decide_household_invitation. FR-26 #1 (email and link invitations by a Premium owner; another
-- signed-in user accepts and becomes a member with joined_at set and reminders_enabled = false), FR-26 #3
-- (Free owner → premium_required:household), FR-26 #4 (owner + 5 members → household_full on invite and
-- on accept), BR-47 (7 days), BR-52 (whoever holds the link), and the EP-39 / EP-40 error codes.
-- Seeded users: Ivana (…01, Premium, owns household b1…01), Marko (…02, Free), Jelena (…03, member of
-- b1…01), Milica (…04, shelter), Ana (…06, unrelated owner).
begin;
create extension if not exists pgtap with schema extensions;

select plan(50);

-- Functions and grants ---------------------------------------------------------------------------
select has_function('public', 'create_household_invitation', array['uuid', 'text', 'text', 'text'], 'EP-35 function exists');
select has_function('public', 'get_household_invitation', array['text'], 'EP-39 function exists');
select has_function('public', 'decide_household_invitation', array['text', 'text'], 'EP-40 function exists');
select is(
  (select prosecdef from pg_proc where oid = 'public.decide_household_invitation(text, text)'::regprocedure),
  true, 'EP-40 is security definer (the invitee cannot see the invitation under RLS)'
);
select ok(has_function_privilege('anon', 'public.get_household_invitation(text)', 'execute'), 'a Visitor may view an invitation (EP-39)');
select ok(not has_function_privilege('anon', 'public.decide_household_invitation(text, text)', 'execute'), 'a Visitor cannot decide (EP-40 → 401)');
select ok(not has_function_privilege('anon', 'public.create_household_invitation(uuid, text, text, text)', 'execute'), 'a Visitor cannot invite');
select ok(has_function_privilege('authenticated', 'public.create_household_invitation(uuid, text, text, text)', 'execute'), 'signed-in users call EP-35');

-- Setup (as postgres): two extra owner accounts.
insert into auth.users (id, email) values
  ('c7000000-0000-4000-8000-000000000001', 'petar@mojljubimac.test'),
  ('c7000000-0000-4000-8000-000000000002', 'sara@mojljubimac.test'),
  ('c7000000-0000-4000-8000-000000000003', 'luka@mojljubimac.test'),
  ('c7000000-0000-4000-8000-000000000004', 'mila@mojljubimac.test');
insert into public.profiles (id, account_type, full_name, email, terms_accepted_at, terms_version) values
  ('c7000000-0000-4000-8000-000000000001', 'owner', 'Petar Ilić', 'petar@mojljubimac.test', now(), 'seed'),
  ('c7000000-0000-4000-8000-000000000002', 'owner', 'Sara Ilić', 'sara@mojljubimac.test', now(), 'seed'),
  ('c7000000-0000-4000-8000-000000000003', 'owner', 'Luka Ilić', 'luka@mojljubimac.test', now(), 'seed'),
  ('c7000000-0000-4000-8000-000000000004', 'owner', 'Mila Ilić', 'mila@mojljubimac.test', now(), 'seed');

-- FR-26 #1 — the Premium owner (Ivana) invites by email and by link ---------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000001', md5('email-1') || md5('email-1b'), 'Gost@MojLjubimac.test', null)$$,
  'a Premium owner invites by email'
);
select lives_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000002', md5('link-1') || md5('link-1b'), null, null)$$,
  'a Premium owner creates a link invitation (email null)'
);
select is(
  (select jsonb_agg(jsonb_build_object('kind', i ->> 'kind', 'email', i ->> 'email') order by i ->> 'kind')
   from jsonb_array_elements(public.get_household() -> 'household' -> 'pending_invitations') i),
  '[{"kind": "email", "email": "gost@mojljubimac.test"}, {"kind": "link", "email": null}]'::jsonb,
  'both invitations are pending in EP-34 (email stored lower-case)'
);

reset role;
select ok(
  (select expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
   from public.household_invitations where id = 'e2000000-0000-4000-8000-000000000002'),
  'BR-47: the invitation is valid for 7 days'
);
select is(
  (select token_hash from public.household_invitations where id = 'e2000000-0000-4000-8000-000000000002'),
  md5('link-1') || md5('link-1b'), 'only the token hash is stored'
);

-- A second invitation to the same address replaces the first (EP-35 side effect).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000003', md5('email-2') || md5('email-2b'), 'gost@mojljubimac.test', null)$$,
  'a repeat email invitation is created'
);
reset role;
select is(
  (select status::text from public.household_invitations where id = 'e2000000-0000-4000-8000-000000000001'),
  'expired', 'the earlier pending invitation to the same email is expired'
);

-- already_member: the owner's own address and a current member's address.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000004', md5('x1') || md5('x1b'), 'jelena.nikolic@mojljubimac.test', null)$$,
  'P0001', 'already_member', 'inviting a current member → already_member'
);
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000004', md5('x2') || md5('x2b'), 'IVANA.petrovic@mojljubimac.test', null)$$,
  'P0001', 'already_member', 'inviting the owner''s own address → already_member'
);
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000004', md5('x3') || md5('x3b'), 'not-an-email', null)$$,
  'P0001', 'validation_failed', 'an invalid email → validation_failed'
);

-- EP-39 view as a Visitor: limited fields only.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(
  public.get_household_invitation(md5('link-1') || md5('link-1b'))
    - array['expires_at'],
  jsonb_build_object(
    'kind', 'household', 'status', 'pending', 'household_name', 'Domaćinstvo Petrović',
    'organisation_name', null, 'organisation_type', null, 'role', null,
    'inviter_name', 'Ivana Petrović', 'inviter_city', null, 'shared_pets', null,
    'member_count', null, 'member_limit', null, 'is_signed_in', false, 'already_member', null
  ),
  'FR-26 #2: a Visitor sees the household and inviter, no session fields'
);
select throws_ok(
  $$select public.get_household_invitation('unknown')$$,
  'P0001', 'not_found', 'an unknown token → not_found'
);
select throws_ok(
  $$select public.get_household_invitation(md5('email-1') || md5('email-1b'))$$,
  'P0001', 'invitation_expired', 'a replaced (expired) invitation → invitation_expired'
);

-- FR-26 #1 — a different signed-in user (Marko) accepts the link invitation -------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (public.get_household_invitation(md5('link-1') || md5('link-1b')) ->> 'already_member')::boolean,
  false, 'the signed-in invitee is not a member yet'
);
select is(
  public.get_household_invitation(md5('link-1') || md5('link-1b')) -> 'shared_pets',
  '[{"name": "Luna", "sex": "female", "species": "cat", "breed": "Britanska kratkodlaka"}]'::jsonb,
  'the signed-in invitee sees the shared pets'
);
select is(
  public.decide_household_invitation(md5('link-1') || md5('link-1b'), 'accept'),
  '{"kind": "household", "status": "accepted", "household_id": "b1000000-0000-4000-8000-000000000001", "organisation_id": null}'::jsonb,
  'EP-40 accept answers kind, status and household_id'
);
reset role;
select ok(
  (select joined_at is not null and reminders_enabled = false from public.household_memberships
   where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000002'),
  'FR-26 #1: the invitee is a member with joined_at set and reminders_enabled = false'
);
select is(
  (select status::text || ':' || accepted_by::text || ':' || (decided_at is not null)::text
   from public.household_invitations where id = 'e2000000-0000-4000-8000-000000000002'),
  'accepted:a1000000-0000-4000-8000-000000000002:true',
  'the invitation records accepted, accepted_by and decided_at'
);

-- The link is single-use: another user gets invitation_used.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.decide_household_invitation(md5('link-1') || md5('link-1b'), 'accept')$$,
  'P0001', 'invitation_used', 'a used link → invitation_used'
);
select is(
  public.get_household_invitation(md5('link-1') || md5('link-1b')) ->> 'status',
  'accepted', 'EP-39 still shows the decided state'
);
select throws_ok(
  $$select public.decide_household_invitation(md5('link-1') || md5('link-1b'), 'maybe')$$,
  'P0001', 'validation_failed', 'an unknown decision → validation_failed'
);
select throws_ok(
  $$select public.decide_household_invitation('unknown', 'accept')$$,
  'P0001', 'not_found', 'an unknown token → not_found'
);

-- BR-52: whoever holds the email invitation's link may accept or decline it. Ana declines.
select is(
  public.decide_household_invitation(md5('email-2') || md5('email-2b'), 'decline') ->> 'status',
  'declined', 'EP-40 decline'
);
reset role;
select is(
  (select status::text from public.household_invitations where id = 'e2000000-0000-4000-8000-000000000003'),
  'declined', 'the invitation is declined'
);
select is(
  (select count(*)::int from public.household_memberships
   where user_id = 'a1000000-0000-4000-8000-000000000006'),
  0, 'declining adds no membership'
);

-- already_member on accept: Jelena (a member) opens a new link.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000005', md5('link-2') || md5('link-2b'), null, null)$$,
  'a second link invitation'
);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_household_invitation(md5('link-2') || md5('link-2b'), 'accept')$$,
  'P0001', 'already_member', 'a current member accepting → already_member'
);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_household_invitation(md5('link-2') || md5('link-2b'), 'accept')$$,
  'P0001', 'already_member', 'the owner accepting their own link → already_member'
);

-- invitation_expired after 7 days.
reset role;
update public.household_invitations set expires_at = now() - interval '1 minute'
where id = 'e2000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims', '{"sub":"c7000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.decide_household_invitation(md5('link-2') || md5('link-2b'), 'accept')$$,
  'P0001', 'invitation_expired', 'an invitation past expires_at → invitation_expired'
);

-- FR-26 #4 — owner + 5 members → household_full on invite and on accept ----------------------------
-- Now: Ivana + Jelena + Marko. A pending link first, then two more members join directly.
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000006', md5('link-3') || md5('link-3b'), null, null)$$,
  'a link invitation while there is room (pending invitations do not reserve a slot)'
);
reset role;
insert into public.household_memberships (household_id, user_id) values
  ('b1000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000003');
select is(
  (select 1 + count(*)::int from public.household_memberships where household_id = 'b1000000-0000-4000-8000-000000000001'),
  6, 'the household now has the owner and 5 members'
);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000007', md5('link-4') || md5('link-4b'), null, null)$$,
  'P0001', 'household_full', 'E-11: inviting a 7th person → household_full'
);
select set_config('request.jwt.claims', '{"sub":"c7000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_household_invitation(md5('link-3') || md5('link-3b'), 'accept')$$,
  'P0001', 'household_full', 'BR-20: accepting into a full household → household_full'
);
reset role;
select is(
  (select status::text from public.household_invitations where id = 'e2000000-0000-4000-8000-000000000006'),
  'pending', 'the refused accept leaves the invitation pending'
);

-- FR-26 #3 — a Free owner (Marko owns no household) ------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c7000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000008', md5('free') || md5('freeb'), null, 'Kuća Ilić')$$,
  'P0001', 'premium_required:household', 'E-10: a Free owner → premium_required:household'
);
reset role;
select is((select count(*)::int from public.households where owner_id = 'c7000000-0000-4000-8000-000000000004'),
  0, 'nothing is created for a Free owner');

-- Organisation accounts may not invite.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000009', md5('org') || md5('orgb'), null, 'Azil')$$,
  'P0001', 'forbidden_role', 'a shelter account → forbidden_role'
);

-- First invitation of a Premium owner without a household creates it (EP-35 side effect).
reset role;
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('c7000000-0000-4000-8000-000000000004', 'premium_monthly', 'active', now() + interval '1 month');
select set_config('request.jwt.claims', '{"sub":"c7000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000010', md5('new') || md5('newb'), null, '   ')$$,
  'P0001', 'validation_failed', 'no household yet and no name → validation_failed (household_name:required)'
);
select throws_ok(
  $$select public.create_household_invitation(
      'e2000000-0000-4000-8000-000000000010', md5('new') || md5('newb'), null, repeat('x', 61))$$,
  'P0001', 'validation_failed', 'a 61-character name → validation_failed (household_name:too_long)'
);
select is(
  public.create_household_invitation(
    'e2000000-0000-4000-8000-000000000010', md5('new') || md5('newb'), null, '  Kuća Ilić  ') ->> 'household_name',
  'Kuća Ilić', 'the first invitation creates the household with the trimmed name'
);
reset role;
select is(
  (select read_only from public.households where owner_id = 'c7000000-0000-4000-8000-000000000004'),
  false, 'the new household is not read-only'
);

-- household_read_only: no one joins while the owner has no Premium.
update public.subscriptions set status = 'expired'
where user_id = 'c7000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.decide_household_invitation(md5('new') || md5('newb'), 'accept')$$,
  'P0001', 'household_read_only', 'accepting into a read-only household → household_read_only'
);

select * from finish();
rollback;
