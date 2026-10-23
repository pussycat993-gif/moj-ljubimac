-- Organisation team (Step 24): FR-43 #1 (members + pending invitations = 20 → team_full; roles are
-- admin / volunteer only), FR-43 #2 (a Volunteer adds and edits health and care entries on an
-- organisation animal; EP-05 delete, EP-56 actions and EP-58 decide → forbidden_role), the EP-56
-- last_admin rule, EP-56 invite (create_organisation_invitation), EP-53 team and pending invitations,
-- and the database side of EP-39 / EP-40 for og_ tokens (get_ / decide_organisation_invitation, BR-53).
-- Seeded: shelter b2…01 (Milica …04, admin) with Žuća (c1…04) and Marko's (…02) adoption request;
-- the shelter is approved in setup and Jelena (…03, owner account) joins as a volunteer.
begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- Setup (as postgres) -------------------------------------------------------------------------
update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'volunteer');

-- EP-56 invite (Milica, admin) -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

create temp table invite_one on commit drop as
select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000001', repeat('1', 64),
  ' Marko.Jovanovic@MojLjubimac.test ', 'volunteer') as j;
select is((select j #>> '{invitation,status}' from invite_one), 'pending', 'EP-56 invite → a pending OrganisationInvitation');
select is((select j #>> '{invitation,email}' from invite_one), 'marko.jovanovic@mojljubimac.test', 'the email is lower-cased');
select is((select j #>> '{invitation,role}' from invite_one), 'volunteer', 'the invited role is stored');
select is((select j ->> 'organisation_name' from invite_one), 'Azil Šapica', 'the email gets the organisation name');
select is((select j ->> 'recipient_locale' from invite_one), 'sr-Latn', '… and the address''s account locale');
select ok(
  (select abs(extract(epoch from (expires_at - (now() + interval '7 days')))) < 1
   from public.organisation_invitations where id = 'e2410000-0000-4000-8000-000000000001'),
  'BR-47: valid 7 days');

select lives_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000002', repeat('2', 64),
      'marko.jovanovic@mojljubimac.test', 'admin')$$,
  'a new invitation to the same address');
select is(
  (select status::text from public.organisation_invitations where id = 'e2410000-0000-4000-8000-000000000001'),
  'expired', 'EP-56: the earlier pending invitation to the same address is expired');
select throws_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000003', repeat('3', 64),
      'jelena.nikolic@mojljubimac.test', 'volunteer')$$,
  'P0001', 'already_member', 'EP-56: a current member''s address → already_member');
select throws_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000004', repeat('4', 64),
      'nije-mejl', 'volunteer')$$,
  'P0001', 'validation_failed', 'EP-56: a bad email → validation_failed');
select throws_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000005', repeat('5', 64),
      'novi@mojljubimac.test', 'owner')$$,
  'P0001', 'validation_failed', 'FR-43 #1: roles are admin / volunteer only');
select throws_ok(
  $$update public.organisation_memberships set role = 'owner' where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  '22P02', null, 'FR-43 #1: a membership role outside admin / volunteer is refused');

-- EP-53 for the admin: team (admin first) and pending invitations.
select is(
  (select array_agg(e ->> 'role') from jsonb_array_elements(public.get_my_organisation() -> 'team') e),
  array['admin', 'volunteer'], 'EP-53: team ordered by role (admin first)');
select is(
  (select array_agg(e ->> 'full_name') from jsonb_array_elements(public.get_my_organisation() -> 'team') e),
  array['Milica Stojanović', 'Jelena Nikolić'], 'EP-53: member names come from profiles');
select is(
  (select array_agg(e ->> 'id') from jsonb_array_elements(public.get_my_organisation() -> 'pending_invitations') e),
  array['e2410000-0000-4000-8000-000000000002'], 'EP-53: pending invitations (the expired one is not listed)');
select is((public.get_my_organisation() #>> '{organisation,member_count}')::int, 2, 'EP-53: member_count');
select is((public.get_my_organisation() #>> '{organisation,member_limit}')::int, 20, 'EP-53: member_limit 20');
select is(public.get_my_organisation() #>> '{access,role}', 'org_admin', 'EP-53: access.role org_admin');
select is((public.get_my_organisation() #>> '{access,can_delete}')::boolean, true, 'EP-53: an admin can delete');

-- The EP-56 last_admin rule.
select throws_ok(
  $$update public.organisation_memberships set role = 'volunteer' where user_id = 'a1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'validation_failed:last_admin', 'EP-56: demoting the last admin → validation_failed (last_admin)');
select throws_ok(
  $$delete from public.organisation_memberships where user_id = 'a1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'validation_failed:last_admin', 'EP-56: removing the last admin → validation_failed (last_admin)');
select lives_ok(
  $$update public.organisation_memberships set role = 'admin' where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'EP-56: an admin promotes a volunteer');
select lives_ok(
  $$update public.organisation_memberships set role = 'volunteer' where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'EP-56: with another admin left, a demotion passes');
select lives_ok(
  $$delete from public.organisation_invitations where id = 'e2410000-0000-4000-8000-000000000002' and status = 'pending'$$,
  'EP-56: revoke = delete of a pending invitation');
reset role;

-- FR-43 #1: members + pending invitations = 20 → team_full ---------------------------------------
-- 2 members + 18 pending invitations = 20.
insert into public.organisation_invitations (organisation_id, email, role, token_hash)
select 'b2000000-0000-4000-8000-000000000001', 'pozvan' || n || '@mojljubimac.test', 'volunteer', 'hash-team-' || n
from generate_series(1, 17) n;
set local role authenticated;
select lives_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000006', repeat('6', 64),
      'osamnaesti@mojljubimac.test', 'volunteer')$$,
  'FR-43 #1: the 18th pending invitation (20 with the members)');
select throws_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000007', repeat('7', 64),
      'visak@mojljubimac.test', 'volunteer')$$,
  'P0001', 'team_full', 'FR-43 #1: members + pending invitations = 20 → team_full');
select throws_ok(
  $$insert into public.organisation_invitations (organisation_id, email, role, token_hash)
    values ('b2000000-0000-4000-8000-000000000001', 'direktno@mojljubimac.test', 'volunteer', 'hash-team-direct')$$,
  'P0001', 'team_full', 'FR-43 #1: the trigger guards a direct insert too');
reset role;
delete from public.organisation_invitations where token_hash like 'hash-team-%'
  or id = 'e2410000-0000-4000-8000-000000000006';

-- FR-43 #2: Volunteer (Jelena) ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    values ('c1000000-0000-4000-8000-000000000004', 'Besnilo', current_date)$$,
  'FR-43 #2: a volunteer adds a vaccination');
select lives_ok(
  $$update public.vaccinations set clinic = 'Dr Vet' where name = 'Besnilo'$$,
  'FR-43 #2: … and edits it');
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value, note)
    values ('c1000000-0000-4000-8000-000000000004', current_date, 6.4, 'volonter')$$,
  'FR-43 #2: a volunteer adds a weight entry');
select lives_ok(
  $$update public.weight_entries set value = 6.5 where note = 'volonter'$$,
  'FR-43 #2: … and edits it');
select lives_ok(
  $$insert into public.treatments (pet_id, type, name, starts_on)
    values ('c1000000-0000-4000-8000-000000000004', 'deworming', 'Milbemax', current_date)$$,
  'FR-43 #2: a volunteer adds a care entry (treatment)');
select lives_ok(
  $$update public.treatments set dose = '1 tableta' where name = 'Milbemax'$$,
  'FR-43 #2: … and edits it');
select lives_ok(
  $$update public.pets set shelter_status = 'reserved' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'FR-43 #2: a volunteer changes an animal''s status (EP-55)');
select lives_ok(
  $$select public.create_intake('Bobi', 'dog', null, 'male', null, null, current_date, 'found', null, null)$$,
  'FR-43 #2: a volunteer records an intake (EP-55)');

select throws_ok(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'forbidden_role', 'FR-43 #2: EP-05 delete by a volunteer → forbidden_role');
select throws_ok(
  $$select public.create_organisation_invitation('e2410000-0000-4000-8000-000000000008', repeat('8', 64),
      'v@mojljubimac.test', 'volunteer')$$,
  'P0001', 'forbidden_role', 'FR-43 #2: EP-56 invite by a volunteer → forbidden_role');
select throws_ok(
  $$update public.organisation_memberships set role = 'admin' where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'forbidden_role', 'FR-43 #2: EP-56 change role by a volunteer → forbidden_role');
select throws_ok(
  $$delete from public.organisation_memberships where user_id = 'a1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'forbidden_role', 'FR-43 #2: EP-56 remove member by a volunteer → forbidden_role');
select throws_ok(
  $$update public.adoption_requests set status = 'accepted'
    where pet_id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'forbidden_role', 'FR-43 #2: EP-58 decide by a volunteer → forbidden_role (RLS / trigger level)');
select is(jsonb_array_length(public.get_my_organisation() -> 'pending_invitations'), 0,
  'EP-53: a volunteer gets no pending invitations');
select is(public.get_my_organisation() #>> '{access,role}', 'volunteer', 'EP-53: access.role volunteer');
select is((public.get_my_organisation() #>> '{access,can_delete}')::boolean, false, 'EP-53: a volunteer cannot delete');
reset role;

-- EP-39 / EP-40 og_ (database side) ----------------------------------------------------------------
insert into public.organisation_invitations (id, organisation_id, email, role, token_hash) values
  ('e2410000-0000-4000-8000-000000000021', 'b2000000-0000-4000-8000-000000000001', 'marko.jovanovic@mojljubimac.test', 'admin', 'hash-og-accept'),
  ('e2410000-0000-4000-8000-000000000022', 'b2000000-0000-4000-8000-000000000001', 'ana.markovic@mojljubimac.test', 'volunteer', 'hash-og-decline');
insert into public.organisation_invitations (organisation_id, email, role, token_hash, expires_at) values
  ('b2000000-0000-4000-8000-000000000001', 'stari@mojljubimac.test', 'volunteer', 'hash-og-expired', now() - interval '1 hour');

-- A Visitor sees the limited view.
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  public.get_organisation_invitation('hash-og-accept') - 'expires_at',
  jsonb_build_object(
    'kind', 'organisation', 'status', 'pending', 'household_name', null, 'organisation_name', 'Azil Šapica',
    'organisation_type', 'shelter', 'role', 'admin', 'inviter_name', 'Milica Stojanović', 'inviter_city', null,
    'shared_pets', null, 'member_count', null, 'member_limit', null, 'is_signed_in', false, 'already_member', null),
  'EP-39: a Visitor gets InvitationView kind = organisation with the limited fields');
select throws_ok($$select public.decide_organisation_invitation('hash-og-accept', 'accept')$$,
  '42501', null, 'EP-40: a Visitor cannot decide');
reset role;

-- Marko (owner account) accepts.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_organisation_invitation('hash-og-accept') ->> 'member_count', '2', 'EP-39: (session) member_count');
select is(public.get_organisation_invitation('hash-og-accept') #>> '{inviter_city,name_sr}', 'Bečej', 'EP-39: (session) inviter_city');
select is(
  public.decide_organisation_invitation('hash-og-accept', 'accept'),
  '{"kind": "organisation", "status": "accepted", "household_id": null, "organisation_id": "b2000000-0000-4000-8000-000000000001"}'::jsonb,
  'EP-40: accept');
reset role;
select is(
  (select role::text from public.organisation_memberships
   where organisation_id = 'b2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000002'),
  'admin', 'EP-40: the membership has the invited role');
select is(
  (select status::text || ':' || accepted_by::text from public.organisation_invitations where token_hash = 'hash-og-accept'),
  'accepted:a1000000-0000-4000-8000-000000000002', 'EP-40: status accepted, accepted_by set');
select is((select account_type::text from public.profiles where id = 'a1000000-0000-4000-8000-000000000002'),
  'owner', 'BR-53: the invitee keeps their own account type');
set local role authenticated;
select throws_ok($$select public.decide_organisation_invitation('hash-og-accept', 'decline')$$,
  'P0001', 'invitation_used', 'EP-40: a decided invitation → invitation_used');
select throws_ok($$select public.decide_organisation_invitation('hash-og-expired', 'accept')$$,
  'P0001', 'invitation_expired', 'EP-40: an expired invitation → invitation_expired');
select throws_ok($$select public.get_organisation_invitation('hash-og-nepoznat')$$,
  'P0001', 'not_found', 'EP-39: an unknown token → not_found');
select throws_ok($$select public.decide_organisation_invitation('hash-og-decline', 'accept')$$,
  'P0001', 'already_member', 'EP-40: a member accepting another invitation → already_member');
reset role;

-- Ana declines.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is(public.decide_organisation_invitation('hash-og-decline', 'decline') ->> 'status', 'declined', 'EP-40: decline');
reset role;

select * from finish();
rollback;
