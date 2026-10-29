-- Step 30 — EP-52 step 1 succession (FR-31 #1, #2; BR-27, BR-46) in retention_delete_due_accounts.
-- Seeded (supabase/seed.sql): Ivana (…01, Premium) owns household b1…01 with Luna (shared) and Maks (not shared);
-- Jelena (…03) is its member. Shelter b2…01 "Azil Šapica" has one member, its Admin Milica (…04), and the animal
-- Žuća (c1…04). Shelter b2…03 "Azil „Druga šansa“" has its Admin Dragana (…07). Time is moved by setting
-- profiles.deletion_requested_at (deletion_due_at = requested + 30 days, Step 04 trigger).
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- A second member who joined after Jelena; Ana (…06) joined before both but owns a household of her own
-- (households.owner_id is unique), so she cannot inherit.
insert into public.households (owner_id, name) values ('a1000000-0000-4000-8000-000000000006', 'Anino domaćinstvo');
insert into public.household_memberships (household_id, user_id, joined_at) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', now() + interval '1 day'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', now() - interval '10 days');

create temporary table luna_before as
select
  (select count(*) from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001') as vaccinations,
  (select count(*) from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001') as weights,
  (select count(*) from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001') as reminders;
select ok((select vaccinations > 0 and reminders > 0 from luna_before), 'fixture: Luna has records and reminders');

update public.profiles set deletion_requested_at = now() - interval '31 days'
where id = 'a1000000-0000-4000-8000-000000000001';

-- FR-31 #2 with a Premium heir first (rolled back), then without -----------------------------------------
savepoint premium_heir;
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000003', 'premium_monthly', 'active', now() + interval '20 days');
set local role service_role;
select is((public.retention_delete_due_accounts() ->> 'households_transferred')::int, 1, 'the household is transferred');
reset role;
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'), false,
  'a heir with Premium keeps the household writable');
rollback to savepoint premium_heir;

set local role service_role;
select is(
  public.retention_delete_due_accounts(),
  '{"failed": 0, "accounts_deleted": 1, "organisations_deleted": 0, "households_transferred": 1}'::jsonb,
  'the owner past deletion_due_at is deleted and the household transferred'
);
reset role;

-- FR-31 #1 ---------------------------------------------------------------------------------------------------
select is((select owner_id from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000003'::uuid,
  'FR-31 #1: the earliest-joined member who owns no household becomes the owner');
select ok(not exists (select 1 from public.household_memberships
                      where household_id = 'b1000000-0000-4000-8000-000000000001'
                        and user_id = 'a1000000-0000-4000-8000-000000000003'),
  'FR-31 #1: the heir''s membership row is removed');
select is((select array_agg(user_id order by user_id) from public.household_memberships
           where household_id = 'b1000000-0000-4000-8000-000000000001'),
  array['a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006']::uuid[],
  'the other members stay');
select is((select owner_id from public.pets where id = 'c1000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'FR-31 #1: the shared pet moves to the heir');
select ok(exists (select 1 from public.household_pets
                  where household_id = 'b1000000-0000-4000-8000-000000000001'
                    and pet_id = 'c1000000-0000-4000-8000-000000000001'),
  'the pet stays shared in the household');
select is(
  (select row(
     (select count(*) from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001'),
     (select count(*) from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'))::text),
  (select row(vaccinations, weights)::text from luna_before),
  'FR-31 #1: the shared pet''s records are intact'
);
select is(
  (select count(*) from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001'
     and user_id = 'a1000000-0000-4000-8000-000000000003'),
  (select reminders from luna_before),
  'the shared pet''s reminders now belong to the heir'
);
select ok(not exists (select 1 from public.pets where id = 'c1000000-0000-4000-8000-000000000002'),
  'the deleted owner''s unshared pet is deleted');
select ok(not exists (select 1 from public.profiles where id = 'a1000000-0000-4000-8000-000000000001')
          and not exists (select 1 from auth.users where id = 'a1000000-0000-4000-8000-000000000001'),
  'the account is gone (auth.users and profiles)');

-- FR-31 #2 -------------------------------------------------------------------------------------------------
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'), true,
  'FR-31 #2: a heir without Premium makes the household read-only');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select name from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 'Luna',
  'FR-31 #2: members still read the shared pet');
reset role;
select set_config('request.jwt.claims', '', true);

-- A household without an eligible member is deleted --------------------------------------------------------
update public.profiles set deletion_requested_at = now() - interval '31 days'
where id = 'a1000000-0000-4000-8000-000000000006';
set local role service_role;
select is((public.retention_delete_due_accounts() ->> 'households_transferred')::int, 0,
  'an owner whose household has no members transfers nothing');
reset role;
select ok(not exists (select 1 from public.households where name = 'Anino domaćinstvo'),
  'a household without members is deleted with its owner');
select ok(not exists (select 1 from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000006'),
  'the deleted user''s memberships elsewhere are removed');

-- BR-46 — the last Admin leaves members behind -------------------------------------------------------------
insert into public.organisation_memberships (organisation_id, user_id, role, created_at) values
  ('b2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'volunteer', now() + interval '2 days'),
  ('b2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'volunteer', now() + interval '1 day');
update public.profiles set deletion_requested_at = now() - interval '31 days'
where id = 'a1000000-0000-4000-8000-000000000007';
set local role service_role;
select is((public.retention_delete_due_accounts() ->> 'accounts_deleted')::int, 1, 'the last Admin''s account is deleted');
reset role;
select is(
  (select jsonb_object_agg(user_id, role) from public.organisation_memberships
   where organisation_id = 'b2000000-0000-4000-8000-000000000003'),
  '{"a1000000-0000-4000-8000-000000000002": "volunteer", "a1000000-0000-4000-8000-000000000003": "admin"}'::jsonb,
  'BR-46: the earliest-joined remaining member becomes Admin'
);
select ok(exists (select 1 from public.organisations where id = 'b2000000-0000-4000-8000-000000000003'),
  'BR-46: the organisation stays');

-- BR-46 — no member left: the organisation follows its last member's 30-day grace -------------------------
update public.organisations set logo_r2_key = 'o/b2000000-0000-4000-8000-000000000001/logo-x.png'
where id = 'b2000000-0000-4000-8000-000000000001';
update public.pets set photo_r2_key = 'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/photo/zuca.jpg'
where id = 'c1000000-0000-4000-8000-000000000004';
update public.profiles set deletion_requested_at = now() - interval '29 days'
where id = 'a1000000-0000-4000-8000-000000000004';
set local role service_role;
select is((public.retention_delete_due_accounts() ->> 'accounts_deleted')::int, 0, 'inside the grace nothing is deleted');
reset role;
select ok(exists (select 1 from public.organisations where id = 'b2000000-0000-4000-8000-000000000001')
          and exists (select 1 from public.pets where id = 'c1000000-0000-4000-8000-000000000004'),
  'BR-46: the organisation and its animals stay during the grace');

update public.profiles set deletion_requested_at = now() - interval '31 days'
where id = 'a1000000-0000-4000-8000-000000000004';
set local role service_role;
select is(
  public.retention_delete_due_accounts(),
  '{"failed": 0, "accounts_deleted": 1, "organisations_deleted": 1, "households_transferred": 0}'::jsonb,
  'after the grace the last member is deleted with the organisation'
);
reset role;
select ok(not exists (select 1 from public.organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'BR-46: the organisation is deleted');
select ok(not exists (select 1 from public.pets where id = 'c1000000-0000-4000-8000-000000000004'),
  'BR-46: with its animals');
select is(
  (select array_agg(r2_key order by r2_key) from public.r2_deletion_queue where r2_key like 'o/b2000000-0000-4000-8000-000000000001/%'),
  array['o/b2000000-0000-4000-8000-000000000001/logo-x.png',
        'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/photo/zuca.jpg'],
  'BR-46: and its files are queued for R2'
);

select * from finish();
rollback;
