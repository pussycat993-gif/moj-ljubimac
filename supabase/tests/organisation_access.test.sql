-- Organisation access gates (Step 24): FR-42 #1 (pending shelter: reads succeed, every organisation
-- write → organisation_pending_approval), FR-42 #2 (breeder without an active breeder plan: breeder-only
-- writes → breeder_plan_required, reads succeed; with a plan they succeed), FR-42 #3 (an organisation
-- account holds no personal pets). API §4.1 gate 4, §5.7 intro, BR-11, BR-32, BR-33, E-21.
-- Seeded: shelter b2…01 "Azil Šapica" (Milica …04, admin, pending) with Žuća (c1…04); breeder b2…02
-- (Nikola …05, admin, approved, no breeder plan). Setup adds Jelena (…03) as a shelter volunteer and a
-- breeder offspring animal with an inquiry from Ivana (…01).
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

-- Setup (as postgres) -------------------------------------------------------------------------
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'volunteer');
insert into public.organisation_invitations (id, organisation_id, email, role, token_hash) values
  ('e2400000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'pozvan@mojljubimac.test', 'volunteer', 'hash-access-shelter');
insert into public.pets (id, organisation_id, name, species, sex, offspring_status, price_minor) values
  ('e2400000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000002', 'Zlatko', 'dog', 'male', 'available', 9000000);
insert into public.pets (id, organisation_id, name, species, sex, breeding_status) values
  ('e2400000-0000-4000-8000-000000000012', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'female', 'active');
insert into public.breeder_inquiries (id, pet_id, requester_id, name, phone, email) values
  ('e2400000-0000-4000-8000-000000000021', 'e2400000-0000-4000-8000-000000000011',
   'a1000000-0000-4000-8000-000000000001', 'Ivana Petrović', '+381 64 111 2222', 'ivana.petrovic@mojljubimac.test');

-- FR-42 #1 — pending shelter, Admin (Milica) ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select is(public.get_my_organisation() #>> '{organisation,approval_status}', 'pending',
  'FR-42 #1: EP-53 reads the pending organisation');
select is((public.get_my_organisation() #>> '{access,can_edit}')::boolean, false,
  'FR-42 #1: EP-53 access.can_edit = false while pending (everything read-only)');
select is((public.list_org_animals() ->> 'total')::int, 1, 'FR-42 #1: EP-54 lists the animals while pending');
select is((select count(*)::int from public.pets where organisation_id = 'b2000000-0000-4000-8000-000000000001'), 1,
  'FR-42 #1: the animal records are readable');

select throws_ok(
  $$update public.organisations set description = 'Novi opis' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-72 profile update → organisation_pending_approval');
select throws_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'volunteer')$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: adding a team member → organisation_pending_approval');
select throws_ok(
  $$update public.organisation_memberships set role = 'admin' where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-56 change role → organisation_pending_approval');
select throws_ok(
  $$delete from public.organisation_memberships where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-56 remove member → organisation_pending_approval');
select throws_ok(
  $$delete from public.organisation_invitations where id = 'e2400000-0000-4000-8000-000000000001'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-56 revoke → organisation_pending_approval');
select throws_ok(
  $$select public.create_organisation_invitation('e2400000-0000-4000-8000-000000000002',
      repeat('a', 64), 'novi@mojljubimac.test', 'volunteer')$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-56 invite → organisation_pending_approval');
select throws_ok(
  $$select public.create_intake('Bobi', 'dog', null, 'male', null, null, current_date, 'found', null, null)$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-55 createIntake → organisation_pending_approval');
select throws_ok(
  $$update public.pets set shelter_status = 'in_care' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-55 status change → organisation_pending_approval');
select throws_ok(
  $$insert into public.pets (organisation_id, name, species, sex) values ('b2000000-0000-4000-8000-000000000001', 'Novi', 'cat', 'female')$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: EP-03 create animal → organisation_pending_approval');
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000004', current_date, 6.3)$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: a health entry → organisation_pending_approval');

-- Volunteer of the pending shelter (Jelena): the same gate.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((public.list_org_animals() ->> 'total')::int, 1, 'FR-42 #1: a volunteer reads too');
select throws_ok(
  $$update public.pets set shelter_status = 'in_care' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: a volunteer''s status change → organisation_pending_approval');

reset role;

-- A rejected shelter: the same code with the rejected detail (API §5.7 intro).
update public.organisations set approval_status = 'rejected' where id = 'b2000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.organisations set phone = '021 123 456' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'organisation_pending_approval:rejected', 'a rejected organisation → organisation_pending_approval (rejected)');
reset role;

-- Approved: the same writes now pass.
update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((public.get_my_organisation() #>> '{access,can_edit}')::boolean, true, 'an approved shelter can edit');
select lives_ok(
  $$update public.organisations set description = 'Novi opis' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'an approved shelter updates its profile');
select lives_ok(
  $$update public.pets set shelter_status = 'in_care' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'an approved shelter changes a status');
select throws_ok(
  $$update public.pets set breeding_status = 'active' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'forbidden_role', 'EP-55: breeding_status is breeder-only (shelter → forbidden_role)');
reset role;

-- FR-42 #2 — breeder without a breeder plan (Nikola) ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;

select is((public.get_my_organisation() ->> 'breeder_plan_active')::boolean, false,
  'FR-42 #2: EP-53 breeder_plan_active = false');
select is((public.get_my_organisation() #>> '{access,can_edit}')::boolean, false,
  'FR-42 #2: EP-53 access.can_edit = false without a plan');
select is((public.list_org_animals() ->> 'total')::int, 2, 'FR-42 #2: reads succeed (EP-54)');
select throws_ok(
  $$update public.pets set offspring_status = 'reserved' where id = 'e2400000-0000-4000-8000-000000000011'$$,
  'P0001', 'breeder_plan_required', 'FR-42 #2: offspring status change → breeder_plan_required');
select throws_ok(
  $$update public.pets set price_minor = 10000000 where id = 'e2400000-0000-4000-8000-000000000011'$$,
  'P0001', 'breeder_plan_required', 'FR-42 #2: price change → breeder_plan_required');
select throws_ok(
  $$update public.breeder_inquiries set status = 'accepted' where id = 'e2400000-0000-4000-8000-000000000021'$$,
  'P0001', 'breeder_plan_required', 'FR-42 #2: deciding an inquiry → breeder_plan_required');
select throws_ok(
  $$select public.create_intake('Bobi', 'dog', null, 'male', null, null, current_date, 'found', null, null)$$,
  'P0001', 'forbidden_role', 'EP-55: an intake is shelter-only (breeder → forbidden_role)');
reset role;

-- With an active breeder plan (test fixture) the same writes succeed.
insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month', true);
set local role authenticated;
select is((public.get_my_organisation() ->> 'breeder_plan_active')::boolean, true,
  'FR-42 #2: with a plan, breeder_plan_active = true');
select is((public.get_my_organisation() #>> '{access,can_edit}')::boolean, true,
  'FR-42 #2: with a plan, access.can_edit = true');
select lives_ok(
  $$update public.pets set offspring_status = 'reserved', price_minor = 10000000 where id = 'e2400000-0000-4000-8000-000000000011'$$,
  'FR-42 #2: with a plan, offspring status and price change');
select lives_ok(
  $$update public.breeder_inquiries set status = 'accepted' where id = 'e2400000-0000-4000-8000-000000000021'$$,
  'FR-42 #2: with a plan, the inquiry is decided');
select lives_ok(
  $$update public.pets set breeding_status = 'retired' where id = 'e2400000-0000-4000-8000-000000000012'$$,
  'EP-55: a breeder changes breeding_status');
reset role;

-- FR-42 #3 — organisation accounts hold no personal pets (BR-33) -------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex) values ('a1000000-0000-4000-8000-000000000004', 'Moj pas', 'dog', 'male')$$,
  'P0001', 'forbidden_role', 'FR-42 #3: a shelter user cannot own a personal pet');
reset role;
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex) values ('a1000000-0000-4000-8000-000000000005', 'Moj pas', 'dog', 'male')$$,
  'P0001', 'forbidden_role', 'FR-42 #3: a breeder user cannot own a personal pet (any writer)');
select is(
  (select count(*)::int from public.pets where owner_id in ('a1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000005')),
  0, 'FR-42 #3: no personal pets for organisation accounts');

select * from finish();
rollback;
