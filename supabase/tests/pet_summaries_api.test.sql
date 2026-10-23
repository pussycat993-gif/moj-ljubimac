-- view:pet_summaries_api (EP-01; API §6 PetSummary, Access) and the EP-03 / EP-04 check
-- constraints of the pet_summaries_api migration. FR-01 (a saved pet appears active; a second
-- active pet on Free is blocked with premium_required:pets), FR-36 (1 active pet on Free).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium, Luna + Maks, household with Jelena),
-- Marko (…02, Free, Kiki), Jelena (…03, Free, no own pet, member of Ivana's household),
-- Milica (…04, shelter admin, Žuća), Nikola (…05, breeder admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

select has_view('public', 'pet_summaries_api', 'view:pet_summaries_api exists');
select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.pet_summaries_api'::regclass),
  'pet_summaries_api is security_invoker (RLS on pets still decides visibility)'
);
select columns_are('public', 'pet_summaries_api', array[
  'id', 'name', 'species', 'species_other', 'breed', 'sex', 'birth_date', 'birth_year', 'has_photo',
  'lifecycle', 'organisation_id', 'owner_name', 'vet_name', 'attachment_count', 'moment_count',
  'next_reminder', 'memorial', 'access', 'can_log'
], 'pet_summaries_api has exactly the PetSummary fields');

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select * from public.pet_summaries_api$$, '42501', null, 'anon cannot read pet_summaries_api');
reset role;

-- Owner (Ivana, Premium) -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select name from public.pet_summaries_api order by lifecycle, name$$,
  $$values ('Luna'), ('Maks')$$,
  'an owner sees own pets only, ordered lifecycle asc, name asc'
);
select is(
  (select access from public.pet_summaries_api where name = 'Luna'),
  '{"role": "owner", "can_edit": true, "can_delete": true}'::jsonb,
  'owner: Access role owner, can_edit and can_delete'
);
select is((select can_log from public.pet_summaries_api where name = 'Luna'), true, 'owner: can_log');
select is((select owner_name from public.pet_summaries_api where name = 'Luna'), 'Ivana Petrović', 'owner_name = profiles.full_name of the owner');
select is((select has_photo from public.pet_summaries_api where name = 'Luna'), false, 'has_photo false without photo_r2_key');
select is((select moment_count from public.pet_summaries_api where name = 'Luna'), 2, 'moment_count counts the pet''s moments');
select is((select attachment_count from public.pet_summaries_api where name = 'Luna'), 0, 'attachment_count counts the pet''s attachments');
select is((select vet_name from public.pet_summaries_api where name = 'Maks'), null, 'vet_name null (vet suggestion, BR-43)');
select is((select memorial from public.pet_summaries_api where name = 'Luna'), null, 'memorial null while active');
select isnt((select next_reminder from public.pet_summaries_api where name = 'Luna'), null, 'Luna has a next reminder');
select ok(
  (select (next_reminder ->> 'due_at')::timestamptz >= now() from public.pet_summaries_api where name = 'Luna'),
  'next_reminder is due now or later'
);
select ok(
  (select next_reminder ->> 'display_status' in ('today', 'soon')
     and next_reminder ->> 'status' in ('pending', 'sent', 'resent')
     and next_reminder ->> 'pet_name' = 'Luna'
     and jsonb_typeof(next_reminder -> 'channels') = 'array'
     and (next_reminder ->> 'is_shared')::boolean = false
   from public.pet_summaries_api where name = 'Luna'),
  'next_reminder is a ReminderOccurrence of the caller (open, not shared)'
);
select is(
  (select (next_reminder ->> 'due_at')::timestamptz from public.pet_summaries_api where name = 'Luna'),
  (select min(o.due_at) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'c1000000-0000-4000-8000-000000000001' and r.active and o.status in ('pending', 'sent', 'resent')
     and o.due_at >= now()),
  'next_reminder is the earliest open occurrence'
);
reset role;

-- Household member (Jelena) -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select name from public.pet_summaries_api$$, $$values ('Luna')$$, 'a member sees the shared pet');
select is(
  (select access from public.pet_summaries_api where name = 'Luna'),
  '{"role": "member", "can_edit": false, "can_delete": false}'::jsonb,
  'member: Access role member, read only'
);
select is((select can_log from public.pet_summaries_api where name = 'Luna'), true, 'member: can_log while the household is not read-only');
select is((select owner_name from public.pet_summaries_api where name = 'Luna'), 'Ivana Petrović', 'member: owner_name of the sharing owner');
select is((select next_reminder from public.pet_summaries_api where name = 'Luna'), null,
  'member without reminder opt-in sees no reminder (EP-25 rules)');

-- FR-01: a Free user with no active pet saves a profile → the pet appears active.
insert into public.pets (owner_id, name, species, sex, weight_unit)
values ('a1000000-0000-4000-8000-000000000003', 'Mica', 'cat', 'female', 'kg');
select is((select lifecycle::text from public.pet_summaries_api where name = 'Mica'), 'active', 'FR-01: the new pet appears with lifecycle = active');
select is((select access ->> 'role' from public.pet_summaries_api where name = 'Mica'), 'owner', 'the new pet is the caller''s own');

-- FR-01 / FR-36 / E-26: a second active pet on Free is blocked.
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex) values ('a1000000-0000-4000-8000-000000000003', 'Druga', 'dog', 'male')$$,
  'P0001', 'premium_required:pets',
  'FR-01: a Free owner''s second active pet raises premium_required:pets'
);
select is((select count(*)::int from public.pet_summaries_api where access ->> 'role' = 'owner'), 1, 'still one own active pet');
reset role;

-- Member opt-in to reminders → the shared pet's reminder is visible and marked shared.
update public.household_memberships set reminders_enabled = true
where user_id = 'a1000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select (next_reminder ->> 'is_shared')::boolean from public.pet_summaries_api where name = 'Luna'), true,
  'an opted-in member sees the shared pet''s next reminder with is_shared = true');
select is((select next_reminder -> 'channels' from public.pet_summaries_api where name = 'Luna') <@ '["email", "push"]'::jsonb, true,
  'a member''s channels are email / push only');
reset role;

-- Read-only household (BR-28) → can_log false for the member.
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select can_log from public.pet_summaries_api where name = 'Luna'), false, 'read-only household: member can_log = false');
select is((select (next_reminder ->> 'can_mark_done')::boolean from public.pet_summaries_api where name = 'Luna'), false,
  'read-only household: the member cannot mark the shared reminder done');
reset role;
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';

-- Members see shared pets that are active only (EP-01).
update public.pets set lifecycle = 'memorial' where id = 'c1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pet_summaries_api where name = 'Luna'), 0, 'a member does not see a memorial shared pet');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select lifecycle::text from public.pet_summaries_api where name = 'Luna'), 'memorial', 'the owner still sees the memorial pet');
reset role;

-- Free owner (Marko) ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select name from public.pet_summaries_api$$, $$values ('Kiki')$$, 'Marko sees Kiki only');
reset role;

-- Organisation roles: breeding stock with breeding_status = active only ------------------
insert into public.pets (id, organisation_id, name, species, sex, breeding_status) values
  ('c1300000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'female', 'active'),
  ('c1300000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Stara', 'dog', 'female', 'retired'),
  ('c1300000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Štene', 'dog', 'male', null);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select name from public.pet_summaries_api$$, $$values ('Bela')$$,
  'an organisation member sees active breeding stock only');
select is(
  (select access from public.pet_summaries_api where name = 'Bela'),
  '{"role": "org_admin", "can_edit": true, "can_delete": true}'::jsonb,
  'OrgAdmin: Access role org_admin'
);
select is((select owner_name from public.pet_summaries_api where name = 'Bela'), null, 'organisation animals have no owner_name');
select is((select next_reminder from public.pet_summaries_api where name = 'Bela'), null, 'organisation animals get no reminders');
reset role;

-- EP-03 / EP-04 Request rules as check constraints -----------------------------------------
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex) values ('a1000000-0000-4000-8000-000000000001', repeat('x', 61), 'dog', 'male')$$,
  '23514', null, 'name longer than 60 chars is refused'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex) values ('a1000000-0000-4000-8000-000000000001', '', 'dog', 'male')$$,
  '23514', null, 'an empty name is refused'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex, birth_date, birth_year) values ('a1000000-0000-4000-8000-000000000001', 'Rex', 'dog', 'male', '2020-01-01', 2020)$$,
  '23514', null, 'birth_date and birth_year are mutually exclusive'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex, birth_year) values ('a1000000-0000-4000-8000-000000000001', 'Rex', 'dog', 'male', 1989)$$,
  '23514', null, 'birth_year before 1990 is refused'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex, vet_phone) values ('a1000000-0000-4000-8000-000000000001', 'Rex', 'dog', 'male', repeat('1', 31))$$,
  '23514', null, 'vet_phone longer than 30 chars is refused'
);
select lives_ok(
  $$insert into public.pets (owner_id, name, species, sex, birth_year, note) values ('a1000000-0000-4000-8000-000000000001', 'Rex', 'dog', 'male', 2021, repeat('n', 2000))$$,
  'a pet within every limit is accepted'
);

select * from finish();
rollback;
