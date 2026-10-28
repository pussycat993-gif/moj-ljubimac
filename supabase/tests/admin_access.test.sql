-- Step 28 — Operator admin access: FR-42 #1 approval side (after decide_organisation(approve) the shelter
-- member's writes succeed; before they raised organisation_pending_approval), FR-57 #1 (approve → approved;
-- reject → rejected + rejection_reason; a second decision → already_decided; non-Operators →
-- forbidden_role and the admin_pending_organisations view returns []) and EP-71 (app_settings.viber_enabled
-- is switched by the Operator only). Seeded: Ana (…06) is the Operator; Milica's shelter b2…01 "Azil Šapica"
-- is pending; Ivana (…01) is an ordinary owner.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- Setup (as postgres): a second pending shelter for the reject path.
insert into public.organisations (id, type, name, slug, city_id, created_by, tax_id, registration_note)
values ('f2800000-0000-4000-8000-000000000001', 'shelter', 'Azil „Šapa nade“', 'azil-sapa-nade-test',
        (select id from public.cities where name_sr = 'Bečej'), 'a1000000-0000-4000-8000-000000000003',
        '112233445', 'Privremeni smeštaj za napuštene pse.');

-- Non-Operator (Ivana) ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.admin_pending_organisations), 0,
  'FR-57 #1: admin_pending_organisations returns [] to a non-Operator');
select throws_ok(
  $$select public.decide_organisation('b2000000-0000-4000-8000-000000000001', 'approve', null)$$,
  'P0001', 'forbidden_role', 'FR-57 #1: decide_organisation by a non-Operator → forbidden_role');
select is((select count(*)::int from public.app_settings), 0, 'EP-71: a non-Operator cannot read app_settings');
update public.app_settings set viber_enabled = true;
reset role;
select is((select viber_enabled from public.app_settings), false, 'EP-71: a non-Operator cannot switch Viber on');

-- Visitor -----------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select count(*) from public.admin_pending_organisations$$, '42501', null,
  'FR-57 #1: Visitors have no access to admin_pending_organisations');
reset role;

-- Pending shelter (Milica) before the decision: writes are blocked ------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.organisations set description = 'Novi opis' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: before approval the profile update → organisation_pending_approval');
select throws_ok(
  $$insert into public.pets (organisation_id, name, species, sex) values ('b2000000-0000-4000-8000-000000000001', 'Bobi', 'dog', 'male')$$,
  'P0001', 'organisation_pending_approval', 'FR-42 #1: before approval a new animal → organisation_pending_approval');
select is((select count(*)::int from public.admin_pending_organisations), 0,
  'FR-57 #1: the shelter itself sees [] in admin_pending_organisations');
reset role;

-- Operator (Ana) ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;

select ok(
  exists(select 1 from public.admin_pending_organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'FR-57 #1: the Operator sees the pending shelter');
select is(
  (select contact_email from public.admin_pending_organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'milica.stojanovic@mojljubimac.test', 'EP-68: contact_email is the creator''s profiles.email');
select is(
  (select city ->> 'name_sr' from public.admin_pending_organisations where id = 'f2800000-0000-4000-8000-000000000001'),
  'Bečej', 'EP-68: city is the City object');
select ok(
  not exists(select 1 from public.admin_pending_organisations where id = 'b2000000-0000-4000-8000-000000000002'),
  'EP-68: approved organisations (the breeder) are not listed');

create temporary table approved on commit drop as
select public.decide_organisation('b2000000-0000-4000-8000-000000000001', 'approve', null) as r;

select is((select r #>> '{organisation,approval_status}' from approved), 'approved',
  'FR-57 #1: approve → approval_status = approved');
select is((select r ->> 'creator_locale' from approved), 'sr-Latn',
  'FR-57 #1: the creator''s locale is returned for the email');
select is((select r #>> '{organisation,contact_email}' from approved), 'milica.stojanovic@mojljubimac.test',
  'FR-57 #1: the creator''s email is returned for the email');
select ok(
  not exists(select 1 from public.admin_pending_organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'FR-57 #1: an approved shelter leaves the pending list');
select throws_ok(
  $$select public.decide_organisation('b2000000-0000-4000-8000-000000000001', 'reject', null)$$,
  'P0001', 'already_decided', 'FR-57 #1: a second decision → already_decided');

select throws_ok(
  $$select public.decide_organisation('f2800000-0000-4000-8000-000000000001', 'approve', 'Razlog')$$,
  'P0001', 'validation_failed', 'EP-68: a reason with approve → validation_failed');
select throws_ok(
  format($$select public.decide_organisation('f2800000-0000-4000-8000-000000000001', 'reject', %L)$$, repeat('a', 501)),
  'P0001', 'validation_failed', 'EP-68: a reason over 500 characters → validation_failed');
select throws_ok(
  $$select public.decide_organisation('f2800000-0000-4000-8000-0000000000ff', 'approve', null)$$,
  'P0001', 'not_found', 'EP-68: an unknown organisation → not_found');

select is(
  public.decide_organisation('f2800000-0000-4000-8000-000000000001', 'reject', 'Nedostaje dokaz o registraciji.')
    #>> '{organisation,rejection_reason}',
  'Nedostaje dokaz o registraciji.', 'FR-57 #1: reject → rejection_reason stored');

-- EP-71: the Operator switches Viber.
update public.app_settings set viber_enabled = true;
select is((select viber_enabled from public.app_settings), true, 'EP-71: the Operator switches Viber on');
reset role;

select is(
  (select approval_status::text || ':' || rejection_reason from public.organisations where id = 'f2800000-0000-4000-8000-000000000001'),
  'rejected:Nedostaje dokaz o registraciji.', 'FR-57 #1: the rejected shelter row');

-- Approved shelter (Milica) after the decision: writes succeed --------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.organisations set description = 'Novi opis' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'FR-42 #1: after approval the profile update succeeds');
select lives_ok(
  $$insert into public.pets (organisation_id, name, species, sex) values ('b2000000-0000-4000-8000-000000000001', 'Bobi', 'dog', 'male')$$,
  'FR-42 #1: after approval a new animal succeeds');
reset role;

-- The service role (lib/actions/admin.ts, after its own is_operator check) may decide too.
insert into public.organisations (id, type, name, slug, created_by)
values ('f2800000-0000-4000-8000-000000000002', 'shelter', 'Azil Treći', 'azil-treci-test', 'a1000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  public.decide_organisation('f2800000-0000-4000-8000-000000000002', 'approve', null) #>> '{organisation,approval_status}',
  'approved', 'EP-68: the service role decides');
reset role;

-- Seed partner sanity: decisions do not touch other organisations.
select is((select approval_status::text from public.organisations where id = 'b2000000-0000-4000-8000-000000000002'), 'approved',
  'EP-68: other organisations are unchanged');

select * from finish();
rollback;
