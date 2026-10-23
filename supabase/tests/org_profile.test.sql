-- Organisation public profile (Step 24): FR-60 #1 (an Admin's EP-72 update of description, phone, email,
-- website and logo persists and EP-53 returns the new values), FR-60 #2 (a Volunteer's update →
-- forbidden_role), the EP-72 field checks, the logo key rule (an EP-13 key of this organisation) and the
-- queue for a replaced logo.
-- Seeded: shelter b2…01 (Milica …04, admin), approved in setup; Jelena (…03) joins as a volunteer;
-- Ivana (…01) has no organisation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'volunteer');

-- FR-60 #1 — Admin ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update public.organisations
    set description = 'Mali azil u Bečeju.', phone = '021 123 456', email = 'kontakt@azilsapica.rs',
        website = 'https://azilsapica.rs', logo_r2_key = 'o/b2000000-0000-4000-8000-000000000001/logo-aaaa.png'
    where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'FR-60 #1: an admin saves description, phone, email, website and logo');
select is(public.get_my_organisation() #>> '{organisation,description}', 'Mali azil u Bečeju.', 'FR-60 #1: EP-53 returns the description');
select is(public.get_my_organisation() #>> '{organisation,phone}', '021 123 456', 'FR-60 #1: … the phone');
select is(public.get_my_organisation() #>> '{organisation,email}', 'kontakt@azilsapica.rs', 'FR-60 #1: … the email');
select is(public.get_my_organisation() #>> '{organisation,website}', 'https://azilsapica.rs', 'FR-60 #1: … the website');
select is(public.get_my_organisation() #>> '{organisation,logo_r2_key}', 'o/b2000000-0000-4000-8000-000000000001/logo-aaaa.png',
  'FR-60 #1: … and the logo key (the action presigns it as logo_url)');
select is(public.get_my_organisation() #>> '{organisation,public_path}', '/o/azil-sapica', 'EP-53: public_path');

select lives_ok(
  $$update public.organisations set logo_r2_key = 'o/b2000000-0000-4000-8000-000000000001/logo-bbbb.png'
    where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'the logo is replaced');
select lives_ok(
  $$update public.organisations set website = null, phone = null where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'optional fields are cleared with null');

-- EP-72 field checks.
select throws_ok(
  $$update public.organisations set description = repeat('a', 1001) where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'validation_failed', 'EP-72: description over 1000 characters → validation_failed');
select throws_ok(
  $$update public.organisations set website = 'http://azilsapica.rs' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'validation_failed', 'EP-72: a website must be an https:// URL');
select throws_ok(
  $$update public.organisations set email = 'nije mejl' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'validation_failed', 'EP-72: a bad email → validation_failed');
select throws_ok(
  $$update public.organisations set phone = repeat('1', 31) where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'validation_failed', 'EP-72: a phone over 30 characters → validation_failed');
select throws_ok(
  $$update public.organisations set logo_r2_key = 'o/b2000000-0000-4000-8000-000000000002/logo-x.png'
    where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'validation_failed', 'EP-72: a logo key of another organisation → validation_failed');
reset role;

select is(
  (select count(*)::int from public.r2_deletion_queue where r2_key = 'o/b2000000-0000-4000-8000-000000000001/logo-aaaa.png'),
  1, 'EP-13: the replaced logo is queued for deletion');
select is(
  (select description || ' · ' || coalesce(website, '-') from public.organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'Mali azil u Bečeju. · -', 'FR-60 #1: the saved values persist');

-- FR-60 #2 — Volunteer (Jelena) ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.organisations set description = 'Volonter' where id = 'b2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-60 #2: a volunteer''s update → forbidden_role');
select is(public.get_my_organisation() #>> '{organisation,description}', 'Mali azil u Bečeju.',
  'FR-60 #2: the volunteer reads the profile (view-only)');
reset role;

-- No relation (Ivana): the row is invisible and nothing changes (not_found on the wire).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
update public.organisations set description = 'Tuđe' where id = 'b2000000-0000-4000-8000-000000000001';
select throws_ok($$select public.get_my_organisation()$$, 'P0001', 'not_found', 'EP-53: no organisation → not_found');
reset role;
select is((select description from public.organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'Mali azil u Bečeju.', 'a user without a relation updates nothing');

select * from finish();
rollback;
