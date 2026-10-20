-- Organisation workflow RLS (API §4.4, §5.7 intro, EP-55 … EP-63): intakes and status
-- history for the team; requests/inquiries for the organisation (Volunteer read-only)
-- and their requester; decisions by Admins; litters and transfers read-only for clients.
-- Seeded: shelter b2…01 (Milica …04, admin, pending) with Žuća (c1…04, intake + history)
-- and Marko's (…02) adoption request; breeder b2…02 (Nikola …05, admin).
-- Setup adds Jelena (…03) as shelter volunteer and Marko as breeder volunteer;
-- Ana (…06) is unrelated.
begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

-- Setup (as postgres) -------------------------------------------------------------------------
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'volunteer'),
  ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'volunteer');

insert into public.pets (id, organisation_id, name, species, sex, shelter_status) values
  ('fa000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Bobi', 'dog', 'male', 'intake');
insert into public.pets (id, organisation_id, name, species, sex, breeding_status) values
  ('fa000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'female', 'active');
insert into public.pets (id, organisation_id, name, species, sex, offspring_status) values
  ('fa000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Mladunče 1', 'dog', 'unknown', 'available'),
  ('fa000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000002', 'Mladunče 2', 'dog', 'unknown', 'available');

insert into public.breeder_inquiries (id, pet_id, requester_id, name, phone, email) values
  ('fb000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000003',
   'a1000000-0000-4000-8000-000000000001', 'Ivana Petrović', '+381 64 111 2222', 'ivana.petrovic@mojljubimac.test'),
  ('fb000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000001', 'Ivana Petrović', '+381 64 111 2222', 'ivana.petrovic@mojljubimac.test');

insert into public.litters (organisation_id, mother_id, father_name, born_on, offspring_count) values
  ('b2000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000002', 'Spoljni pastuv', '2026-09-01', 2);

insert into public.record_transfers (pet_id, from_organisation_id, recipient_email, token_hash) values
  ('c1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001',
   'marko.jovanovic@mojljubimac.test', 'hash-owrls-1');

-- Pending shelter (Milica, admin) -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.intakes), 1, 'an admin reads their organisation''s intakes');
select is((select count(*)::int from public.pet_status_history), 2, 'an admin reads their animals'' status history');
select throws_ok(
  $$insert into public.intakes (pet_id, intake_on, arrival_type)
    values ('fa000000-0000-4000-8000-000000000001', '2026-10-10', 'surrendered')$$,
  'P0001', 'organisation_pending_approval', 'an intake on a pending organisation is refused'
);
select throws_ok(
  $$insert into public.pet_status_history (pet_id, status)
    values ('c1000000-0000-4000-8000-000000000004', 'in_care')$$,
  'P0001', 'organisation_pending_approval', 'a status entry on a pending organisation is refused'
);
select throws_ok(
  $$update public.adoption_requests set status = 'accepted'$$,
  'P0001', 'organisation_pending_approval', 'a decision on a pending organisation is refused'
);
select is((select count(*)::int from public.adoption_requests), 1, 'the organisation reads requests for its animals');
select is((select count(*)::int from public.record_transfers), 1, 'an admin reads their organisation''s transfers');
select is((select count(*)::int from public.litters), 0, 'a shelter has no litters to read');
select is((select count(*)::int from public.breeder_inquiries), 0, 'a shelter does not read breeder inquiries');
select throws_ok(
  $$insert into public.record_transfers (pet_id, from_organisation_id, recipient_email, token_hash)
    values ('c1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'a@b.test', 'h')$$,
  '42501', null, 'transfers have no client insert (EP-59 server action)'
);
select throws_ok(
  $$update public.record_transfers set status = 'expired'$$,
  '42501', null, 'transfers have no client update (EP-59/EP-60 server actions)'
);
reset role;

-- Approved shelter --------------------------------------------------------------------------
update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';

set local role authenticated;
select lives_ok(
  $$insert into public.intakes (pet_id, intake_on, arrival_type, place_found)
    values ('fa000000-0000-4000-8000-000000000001', '2026-10-10', 'surrendered', null)$$,
  'an admin of an approved shelter records an intake'
);
select is(
  (select created_by from public.intakes where pet_id = 'fa000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'the intake carries its author'
);
select throws_ok(
  $$insert into public.pet_status_history (pet_id, status, changed_by)
    values ('fa000000-0000-4000-8000-000000000001', 'intake', 'a1000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'changed_by is not client-writable'
);
select lives_ok(
  $$insert into public.pet_status_history (pet_id, status)
    values ('fa000000-0000-4000-8000-000000000001', 'intake')$$,
  'an admin records a status entry'
);
select is(
  (select changed_by from public.pet_status_history where pet_id = 'fa000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'a client status entry is authored by the caller'
);
select throws_ok(
  $$update public.intakes set note = 'x'$$,
  '42501', null, 'intakes have no client update'
);
select throws_ok(
  $$delete from public.intakes$$,
  '42501', null, 'intakes have no client delete'
);
reset role;

-- Volunteer of the shelter (Jelena) -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.intakes), 2, 'a volunteer reads the intakes');
select is((select count(*)::int from public.pet_status_history), 3, 'a volunteer reads the status history');
select lives_ok(
  $$insert into public.pet_status_history (pet_id, status)
    values ('fa000000-0000-4000-8000-000000000001', 'in_care')$$,
  'a volunteer records a status entry (BR-34)'
);
select is((select count(*)::int from public.adoption_requests), 1, 'a volunteer reads the adoption requests');
select throws_ok(
  $$update public.adoption_requests set status = 'accepted'$$,
  'P0001', 'forbidden_role', 'a volunteer may not decide a request'
);
select is((select count(*)::int from public.record_transfers), 0, 'a volunteer does not read transfers');
reset role;

-- Rejected shelter ------------------------------------------------------------------------------
update public.organisations set approval_status = 'rejected' where id = 'b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$insert into public.pet_status_history (pet_id, status)
    values ('fa000000-0000-4000-8000-000000000001', 'available')$$,
  'P0001', 'organisation_pending_approval:rejected', 'writes on a rejected organisation are refused'
);
reset role;
update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';

-- Admin decides (Milica) -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.adoption_requests set status = 'accepted', decided_by = 'a1000000-0000-4000-8000-000000000006'$$,
  'an admin decides a request'
);
select is(
  (select decided_by from public.adoption_requests),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'the decision records its author'
);
select isnt((select decided_at from public.adoption_requests), null, 'the decision records its time');
select throws_ok(
  $$update public.adoption_requests set status = 'rejected'$$,
  'P0001', 'already_decided', 'a decided request cannot be decided again'
);
select throws_ok(
  $$update public.adoption_requests set name = 'Drugo'$$,
  '42501', null, 'only the decision columns are writable'
);
select throws_ok(
  $$insert into public.adoption_requests (pet_id, requester_id, name, phone, email)
    values ('c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'M', '123456', 'm@x.test')$$,
  '42501', null, 'no direct client insert of adoption requests (EP-63 server action)'
);
reset role;

-- Requester (Marko) -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.adoption_requests), 1, 'the requester reads own request');
select is((select count(*)::int from public.intakes), 0, 'the requester does not read the shelter''s intakes');
select results_eq(
  $$with u as (update public.adoption_requests set status = 'pending' returning 1) select count(*)::int from u$$,
  array[0], 'the requester cannot change the decision'
);
select throws_ok(
  $$insert into public.breeder_inquiries (pet_id, requester_id, name, phone, email)
    values ('fa000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'M', '123456', 'm@x.test')$$,
  '42501', null, 'no direct client insert of breeder inquiries (EP-63 server action)'
);

-- Marko is also the breeder's volunteer.
select is((select count(*)::int from public.breeder_inquiries), 2, 'a breeder volunteer reads the inquiries');
select is((select count(*)::int from public.litters), 1, 'a breeder volunteer reads the litters');
select throws_ok(
  $$update public.breeder_inquiries set status = 'accepted' where id = 'fb000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a breeder volunteer may not decide an inquiry'
);
reset role;

-- Breeder admin (Nikola) ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.litters), 1, 'a breeder admin reads the litters');
select throws_ok(
  $$insert into public.litters (organisation_id, mother_id, born_on, offspring_count)
    values ('b2000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000002', '2026-10-01', 1)$$,
  '42501', null, 'litters have no client insert (EP-61 server action)'
);
select throws_ok(
  $$update public.breeder_inquiries set status = 'accepted' where id = 'fb000000-0000-4000-8000-000000000001'$$,
  'P0001', 'breeder_plan_required', 'a breeder without an active plan may not decide'
);
select throws_ok(
  $$insert into public.intakes (pet_id, intake_on, arrival_type)
    values ('fa000000-0000-4000-8000-000000000002', '2026-10-10', 'other')$$,
  'P0001', 'forbidden_role', 'an intake is shelter-only (breeder → forbidden_role)'
);
select is((select count(*)::int from public.intakes), 0, 'another organisation''s intakes are invisible');
select is((select count(*)::int from public.adoption_requests), 0, 'another organisation''s requests are invisible');
select is((select count(*)::int from public.record_transfers), 0, 'another organisation''s transfers are invisible');
reset role;

insert into public.subscriptions (user_id, plan, status, current_period_end) values
  ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month');
set local role authenticated;
select lives_ok(
  $$update public.breeder_inquiries set status = 'rejected' where id = 'fb000000-0000-4000-8000-000000000001'$$,
  'a breeder admin with an active plan decides an inquiry'
);
reset role;

-- Inquirer (Ivana) ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.breeder_inquiries), 2, 'the inquirer reads own inquiries');
select is((select count(*)::int from public.litters), 0, 'the inquirer does not read litters');
reset role;

-- Unrelated user (Ana) --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.intakes), 0, 'an unrelated user sees no intakes');
select is((select count(*)::int from public.pet_status_history), 0, 'an unrelated user sees no status history');
select is((select count(*)::int from public.adoption_requests) + (select count(*)::int from public.breeder_inquiries),
  0, 'an unrelated user sees no requests or inquiries');
select throws_ok(
  $$insert into public.pet_status_history (pet_id, status)
    values ('c1000000-0000-4000-8000-000000000004', 'adopted')$$,
  '42501', null, 'an unrelated user cannot add a status entry'
);
reset role;

-- Visitor -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select 1 from public.intakes$$, '42501', null, 'anon cannot read intakes');
select throws_ok($$select 1 from public.adoption_requests$$, '42501', null, 'anon cannot read adoption requests');
reset role;

select * from finish();
rollback;
