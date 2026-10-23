-- Requests and inquiries (Step 25): FR-47 #1 (EP-63 submit_org_request on an available shelter animal inserts a
-- pending adoption_requests row that EP-57 list_org_requests shows the shelter), FR-47 #3 (EP-58 accept → the pet
-- is reserved + pet_status_history; reject; a second decision → already_decided), FR-49 (inquiry part: the breeder
-- accepts / rejects; accept → offspring_status = reserved), FR-49 #3 (sending the transfer → sold), BR-34 (a
-- Volunteer reads but cannot decide), E-21 and the EP-57 / EP-58 / EP-63 errors.
-- Seeded: shelter b2…01 (Milica …04, admin) with Žuća (c1…04, available) and Marko's pending request; breeder
-- b2…02 (Nikola …05). Setup approves the shelter, adds Jelena (…03) as a volunteer, gives Nikola an active
-- breeder plan and the breeder two available offspring.
begin;
create extension if not exists pgtap with schema extensions;

select plan(51);

update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'volunteer');
insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month', true);
insert into public.pets (id, organisation_id, name, species, breed, sex, birth_date, offspring_status, price_minor) values
  ('f9250000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'Zlatko', 'dog', 'Zlatni retriver',
   'male', current_date - 60, 'available', 8000000),
  ('f9250000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Mila', 'dog', 'Zlatni retriver',
   'female', current_date - 60, 'available', null);
-- A shelter animal that is not listed (in care).
insert into public.pets (id, organisation_id, name, species, sex, shelter_status) values
  ('f9250000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'Garfild', 'cat', 'male', 'in_care');

-- FR-47 #1 / EP-63 submit (Ivana, signed in) ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

create temp table submitted on commit drop as
select public.submit_org_request('c1000000-0000-4000-8000-000000000004', ' Ivana Petrović ', '+381 64 123 4567',
  'Ivana.Petrovic@MojLjubimac.test', 'Imam iskustva sa psima.') as j;
grant select on submitted to authenticated;

select is((select j ->> 'kind' from submitted), 'adoption_request', 'FR-47 #1: a shelter animal → adoption_request');
select is((select j ->> 'status' from submitted), 'pending', 'FR-47 #1: the request is pending');
select isnt((select j ->> 'created_at' from submitted), null, 'EP-63 returns created_at');

create temp table inquiry on commit drop as
select public.submit_org_request('f9250000-0000-4000-8000-000000000001', 'Ivana Petrović', '+381641234567',
  'ivana.petrovic@mojljubimac.test', null) as j;
grant select on inquiry to authenticated;
select is((select j ->> 'kind' from inquiry), 'breeder_inquiry', 'FR-49: a breeder offspring → breeder_inquiry');

select throws_ok(
  $$select public.submit_org_request('f9250000-0000-4000-8000-000000000003', 'Ivana', '+381641234567', 'i@x.rs', null)$$,
  'P0001', 'not_found', 'EP-63: an animal that is not available → not_found');
select throws_ok(
  $$select public.submit_org_request('c1000000-0000-4000-8000-000000000001', 'Ivana', '+381641234567', 'i@x.rs', null)$$,
  'P0001', 'not_found', 'EP-63: a personal pet is never listed → not_found');
select throws_ok(
  $$select public.submit_org_request('c1000000-0000-4000-8000-000000000004', ' ', '+381641234567', 'i@x.rs', null)$$,
  'P0001', 'validation_failed', 'EP-63: name is required');
select throws_ok(
  $$select public.submit_org_request('c1000000-0000-4000-8000-000000000004', 'Ivana', '123', 'i@x.rs', null)$$,
  'P0001', 'validation_failed', 'EP-63: phone 6–30 characters');
select throws_ok(
  $$select public.submit_org_request('c1000000-0000-4000-8000-000000000004', 'Ivana', '+381641234567', 'nije-mejl', null)$$,
  'P0001', 'validation_failed', 'EP-63: a valid email');
select throws_ok(
  $$select public.submit_org_request('c1000000-0000-4000-8000-000000000004', 'Ivana', '+381641234567', 'i@x.rs', repeat('a', 2001))$$,
  'P0001', 'validation_failed', 'EP-63: message ≤ 2000');
select is(
  (select count(*)::int from public.adoption_requests where requester_id = 'a1000000-0000-4000-8000-000000000001'),
  1, 'FR-47 #1: the requester sees own request (one row)');
select is(
  (select email from public.adoption_requests where requester_id = 'a1000000-0000-4000-8000-000000000001'),
  'ivana.petrovic@mojljubimac.test', 'the email is stored trimmed and lowercased');
select throws_ok(
  $$select public.list_org_requests()$$,
  'P0001', 'not_found', 'EP-57: a user without an organisation → not_found');
reset role;

-- EP-63 Visitor → no execute (the action answers 401 unauthenticated).
set local role anon;
select throws_ok(
  $$select public.submit_org_request('c1000000-0000-4000-8000-000000000004', 'X', '+381641234567', 'x@x.rs', null)$$,
  '42501', null, 'FR-47 #2: a Visitor cannot submit');
reset role;

-- E-21: a breeder without an active plan is not listed.
update public.subscriptions set current_period_end = now() - interval '1 day'
where user_id = 'a1000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.submit_org_request('f9250000-0000-4000-8000-000000000002', 'Marko', '+381641234567', 'm@x.rs', null)$$,
  'P0001', 'not_found', 'E-21: breeder without an active plan → not_found');
reset role;
update public.subscriptions set current_period_end = now() + interval '1 month'
where user_id = 'a1000000-0000-4000-8000-000000000005';

-- FR-47 #1 / EP-57 list (Milica, shelter admin) ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select is(public.list_org_requests() ->> 'kind', 'adoption_request', 'EP-57: a shelter lists adoption requests');
select is((public.list_org_requests() ->> 'total')::int, 2, 'FR-47 #1: the shelter receives the request (2 in total)');
select is(
  public.list_org_requests() -> 'items' -> 0 ->> 'name', 'Ivana Petrović', 'EP-57: sort created_at desc (newest first)');
select is(
  public.list_org_requests() -> 'items' -> 0 #>> '{pet,name}', 'Žuća', 'AdoptionRequest.pet.name');
select is(
  public.list_org_requests() -> 'items' -> 0 -> 'transfer', 'null'::jsonb, 'AdoptionRequest.transfer is null without a transfer');
select is(
  public.list_org_requests() -> 'status_counts', '{"pending": 2, "accepted": 0, "rejected": 0}'::jsonb, 'EP-57 status_counts');
select is(
  public.list_org_requests() -> 'access', '{"role": "org_admin", "can_edit": true, "can_delete": true}'::jsonb,
  'EP-57 access: the Admin can decide');
select is(jsonb_array_length(public.list_org_requests(null, 1, 1) -> 'items'), 1, 'EP-57 offset paging');
select throws_ok($$select public.list_org_requests('new')$$, 'P0001', 'validation_failed', 'EP-57: p_status enum');
select throws_ok($$select public.list_org_requests(null, 51)$$, 'P0001', 'validation_failed', 'EP-57: p_limit max 50');
reset role;

-- BR-34: a Volunteer reads (can_edit = false) and cannot decide.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((public.list_org_requests() ->> 'total')::int, 2, 'BR-34: the Volunteer sees the requests');
select is((public.list_org_requests() #>> '{access,can_edit}')::boolean, false, 'S21 read_only: can_edit = false for a Volunteer');
select throws_ok(
  format($$select public.decide_org_request('adoption_request', %L, 'accept')$$, (select (j ->> 'id') from submitted)),
  'P0001', 'forbidden_role', 'BR-34: a Volunteer deciding → forbidden_role');
reset role;

-- FR-47 #3 / EP-58 accept --------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

create temp table accepted on commit drop as
select public.decide_org_request('adoption_request', (select (j ->> 'id')::uuid from submitted), 'accept') as j;
grant select on accepted to authenticated;

select is((select j #>> '{request,status}' from accepted), 'accepted', 'FR-47 #3: the request is accepted');
select is((select j #>> '{request,decided_by_name}' from accepted), 'Milica Stojanović', 'decided_by_name is the Admin');
select isnt((select j #>> '{request,decided_at}' from accepted), null, 'decided_at is set');
select is((select j ->> 'applicant_locale' from accepted), 'sr-Latn', 'EP-58 returns the applicant''s locale');
select is((select j #>> '{organisation,name}' from accepted), 'Azil Šapica', 'EP-58 returns the organisation''s contact details');
select is(
  (select shelter_status::text from public.pets where id = 'c1000000-0000-4000-8000-000000000004'),
  'reserved', 'FR-47 #3: the animal becomes Reserved');
select is(
  (select changed_by from public.pet_status_history
   where pet_id = 'c1000000-0000-4000-8000-000000000004' and status = 'reserved'),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'FR-45: … with a pet_status_history row by the Admin');
select is(
  (select status::text from public.adoption_requests where requester_id = 'a1000000-0000-4000-8000-000000000002'),
  'pending', 'EP-58: other pending requests for the same pet are left unchanged');
select throws_ok(
  format($$select public.decide_org_request('adoption_request', %L, 'reject')$$, (select (j ->> 'id') from submitted)),
  'P0001', 'already_decided', 'FR-47 #3: a second decision → already_decided');
select throws_ok(
  format($$select public.decide_org_request('breeder_inquiry', %L, 'accept')$$, (select (j ->> 'id') from inquiry)),
  'P0001', 'not_found', 'EP-58: another organisation''s inquiry → not_found');

-- EP-58 reject.
select is(
  public.decide_org_request('adoption_request',
    (select id from public.adoption_requests where requester_id = 'a1000000-0000-4000-8000-000000000002'), 'reject')
    #>> '{request,status}',
  'rejected', 'FR-47 #3: the shelter rejects a request');
select is(
  public.list_org_requests() -> 'status_counts', '{"pending": 0, "accepted": 1, "rejected": 1}'::jsonb,
  'EP-57: the rows moved to the accepted / rejected filters');
select is((public.list_org_requests('accepted') ->> 'total')::int, 1, 'EP-57 p_status filters');

-- FR-49 #3: sending the transfer → the shelter animal is adopted (here) and an offspring sold (below).
select lives_ok(
  $$select public.create_record_transfer('f9250000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-000000000004',
    'ivana.petrovic@mojljubimac.test', repeat('a', 64))$$,
  'EP-59: the Admin sends the record');
select is(
  public.list_org_requests('accepted') -> 'items' -> 0 #>> '{transfer,status}', 'pending',
  'AdoptionRequest.transfer is the latest transfer');
select is(
  (select shelter_status::text from public.pets where id = 'c1000000-0000-4000-8000-000000000004'),
  'adopted', 'EP-59: the shelter animal becomes Adopted');
reset role;

-- FR-49 (inquiry part) / EP-58 by the breeder -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is(public.list_org_requests() ->> 'kind', 'breeder_inquiry', 'EP-57: a breeder lists breeder inquiries');
select is(
  public.list_org_requests() -> 'items' -> 0 #>> '{pet,price}', '{"currency": "RSD", "amount_minor": 8000000}',
  'BreederInquiry.pet.price');
select is(
  public.decide_org_request('breeder_inquiry', (select (j ->> 'id')::uuid from inquiry), 'accept') #>> '{request,status}',
  'accepted', 'FR-49: the breeder accepts the inquiry');
select is(
  (select offspring_status::text from public.pets where id = 'f9250000-0000-4000-8000-000000000001'),
  'reserved', 'FR-49 #3: accept → offspring_status = reserved');
select lives_ok(
  $$select public.create_record_transfer('f9250000-0000-4000-8000-0000000000a2', 'f9250000-0000-4000-8000-000000000001',
    'ivana.petrovic@mojljubimac.test', repeat('b', 64))$$,
  'EP-59: the breeder sends the record');
select is(
  (select offspring_status::text from public.pets where id = 'f9250000-0000-4000-8000-000000000001'),
  'sold', 'FR-49 #3: sending the transfer → sold');
reset role;

-- E-21: a breeder without an active plan cannot decide.
update public.subscriptions set current_period_end = now() - interval '1 day'
where user_id = 'a1000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
reset role;
insert into public.breeder_inquiries (pet_id, requester_id, name, phone, email)
values ('f9250000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'Marko', '+381641234567', 'm@x.rs');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$select public.decide_org_request('breeder_inquiry', %L, 'reject')$$,
    (select id from public.breeder_inquiries where pet_id = 'f9250000-0000-4000-8000-000000000002')),
  'P0001', 'breeder_plan_required', 'E-21: deciding without an active breeder plan → breeder_plan_required');
reset role;

select * from finish();
rollback;
