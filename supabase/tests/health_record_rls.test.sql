-- RLS and write rules on pets and the health record (API §4.3, §4.4, EP-01 … EP-15,
-- EP-37, §5.7 intro): BR-21, BR-22, BR-23, BR-25, BR-28, BR-34.
-- Seeded: Ivana (…01, Premium, owns household b1…01; Luna c1…01 shared, Maks c1…02 not),
-- Marko (…02, Free; Kiki c1…03), Jelena (…03, member of b1…01), Milica (…04, admin of
-- the pending shelter b2…01 with Žuća c1…04), Nikola (…05, admin of the approved kennel
-- b2…02), Ana (…06, Operator, no relation).
begin;
create extension if not exists pgtap with schema extensions;

select plan(78);

-- Setup (as postgres): a kennel Volunteer, a kennel animal, an entry by Ivana to edit.
insert into auth.users (id, email) values ('c7000000-0000-4000-8000-000000000001', 'vesna@mojljubimac.test');
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
values ('c7000000-0000-4000-8000-000000000001', 'breeder', 'vesna@mojljubimac.test', now(), 'seed');
insert into public.organisation_memberships (organisation_id, user_id, role)
values ('b2000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'volunteer');
insert into public.pets (id, organisation_id, name, species, sex, breeding_status)
values ('c7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002',
        'Bela', 'dog', 'female', 'active');
insert into public.weight_entries (id, pet_id, measured_on, value, created_by)
values ('c7000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001',
        '2026-10-10', 4.1, 'a1000000-0000-4000-8000-000000000001');

-- Member (Jelena) ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select results_eq($$select name from public.pets$$, $$values ('Luna')$$,
  'a member sees exactly the pets shared with their household');
select is((select count(*)::int from public.weight_entries), 5, 'a member reads the shared pet''s weights');
select is((select count(*)::int from public.vaccinations), 3, 'and its vaccinations');
select is((select count(*)::int from public.treatments), 1, 'and its treatments');
select is((select count(*)::int from public.dose_logs), 2, 'and its dose logs');
select is((select count(*)::int from public.vet_visits), 1, 'and its vet visits');
select is((select count(*)::int from public.household_pets), 1, 'and the sharing row');

-- BR-22: members add weight and mark doses.
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value, note)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4.3, 'member-entry')$$,
  'a member adds a weight entry (BR-22)'
);
select lives_ok(
  $$insert into public.dose_logs (treatment_id, given_at)
    values ('c2000000-0000-4000-8000-000000000001', '2026-10-19 10:00:00+00')$$,
  'a member logs a dose (BR-22)'
);

-- BR-23 / E-12: members edit and delete only their own entries.
select lives_ok(
  $$update public.weight_entries set value = 4.35 where note = 'member-entry'$$,
  'a member edits their own weight entry'
);
select throws_ok(
  $$update public.weight_entries set value = 9 where id = 'c7000000-0000-4000-8000-000000000003'$$,
  'P0001', 'forbidden_role', 'a member cannot edit the owner''s weight entry (BR-23)'
);
select throws_ok(
  $$delete from public.weight_entries where id = 'c7000000-0000-4000-8000-000000000003'$$,
  'P0001', 'forbidden_role', 'a member cannot delete the owner''s weight entry (BR-23)'
);
select throws_ok(
  $$update public.dose_logs set given_at = now()
    where created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot edit the owner''s dose log (BR-23)'
);
select lives_ok(
  $$update public.dose_logs set given_at = now() - interval '1 hour'
    where given_at = '2026-10-19 10:00:00+00'$$,
  'a member edits their own dose log'
);
select lives_ok(
  $$delete from public.dose_logs where given_at = '2026-10-19 10:00:00+00'$$,
  'a member deletes their own dose log'
);

-- BR-22: everything else is view-only.
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    values ('c1000000-0000-4000-8000-000000000001', 'Besnilo', current_date)$$,
  'P0001', 'forbidden_role', 'a member cannot add a vaccination'
);
select throws_ok(
  $$update public.vaccinations set clinic = 'X'$$,
  'P0001', 'forbidden_role', 'a member cannot edit a vaccination'
);
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, starts_on)
    values ('c1000000-0000-4000-8000-000000000001', 'other', 'X', current_date)$$,
  'P0001', 'forbidden_role', 'a member cannot add a treatment'
);
select throws_ok(
  $$delete from public.treatments$$,
  'P0001', 'forbidden_role', 'a member cannot delete a treatment'
);
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Pregled')$$,
  'P0001', 'forbidden_role', 'a member cannot add a vet visit'
);
select throws_ok(
  $$update public.vet_visits set findings = 'X'$$,
  'P0001', 'forbidden_role', 'a member cannot edit a vet visit'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes)
    values ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'k', 'image/png', 10)$$,
  'P0001', 'forbidden_role', 'a member cannot upload an attachment (EP-13)'
);
select throws_ok(
  $$update public.pets set name = 'Lunica' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot edit the pet (EP-04)'
);
select throws_ok(
  $$insert into public.memorial_records (pet_id, date) values ('c1000000-0000-4000-8000-000000000001', current_date)$$,
  'P0001', 'forbidden_role', 'a member cannot move the pet to memorial (EP-06)'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000001', 'Novi', 'dog', 'male')$$,
  'P0001', 'forbidden_role', 'a member cannot create a pet for the owner (EP-03)'
);

-- BR-25: only the owner deletes a pet.
select throws_ok(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot delete the pet (BR-25)'
);

-- BR-21: only the owner chooses which pets are shared.
select throws_ok(
  $$delete from public.household_pets where pet_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a member cannot unshare a pet (BR-21, EP-37)'
);
select throws_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'forbidden_role', 'a member cannot share a pet (BR-21, EP-37)'
);
reset role;

-- Owner (Ivana) ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select results_eq($$select name from public.pets order by name$$, $$values ('Luna'), ('Maks')$$,
  'the owner sees exactly their own pets');
select lives_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')$$,
  'the owner shares Maks (BR-21)'
);
select lives_ok(
  $$delete from public.household_pets where pet_id = 'c1000000-0000-4000-8000-000000000002'$$,
  'the owner unshares Maks (BR-21)'
);
select throws_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'the owner cannot share another owner''s pet'
);
select lives_ok(
  $$update public.weight_entries set note = 'Provereno' where note = 'member-entry'$$,
  'the owner edits a member''s weight entry'
);
select lives_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    values ('c1000000-0000-4000-8000-000000000001', 'Besnilo', current_date)$$,
  'the owner adds a vaccination'
);
select lives_ok(
  $$insert into public.memorial_records (pet_id, date) values ('c1000000-0000-4000-8000-000000000002', current_date)$$,
  'the owner writes a memorial record'
);
reset role;

-- Member writes on a read-only household (BR-28) ---------------------------------------------------
update public.subscriptions set status = 'expired'
where user_id = 'a1000000-0000-4000-8000-000000000001';
select ok((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  'the household is read-only once the owner''s Premium ends');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets), 1, 'members keep read access (BR-28)');
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4.4)$$,
  'P0001', 'household_read_only', 'a member cannot add weight to a read-only household'
);
select throws_ok(
  $$update public.weight_entries set value = 4.4 where note = 'Provereno'$$,
  'P0001', 'household_read_only', 'a member cannot edit their own entry in a read-only household'
);
select throws_ok(
  $$delete from public.weight_entries where note = 'Provereno'$$,
  'P0001', 'household_read_only', 'a member cannot delete their own entry in a read-only household'
);
select throws_ok(
  $$insert into public.dose_logs (treatment_id, given_at)
    values ('c2000000-0000-4000-8000-000000000001', now())$$,
  'P0001', 'household_read_only', 'a member cannot log a dose in a read-only household'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'household_read_only', 'the owner cannot share pets while the household is read-only (EP-37)'
);
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4.4)$$,
  'the owner still writes their own pet''s record'
);
-- BR-25: the owner deletes the pet; the member loses it.
select lives_ok(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'the owner deletes the pet (BR-25)'
);
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets), 0, 'the member no longer sees the deleted pet');
reset role;

-- No relation (Marko, Ana) --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select name from public.pets$$, $$values ('Kiki')$$,
  'an unrelated owner sees only their own pet');
select is((select count(*)::int from public.weight_entries
           where pet_id <> 'c1000000-0000-4000-8000-000000000003'), 0, 'no other pet''s weights');
select is((select count(*)::int from public.memorial_records), 0, 'no other pet''s memorials');
select is((select count(*)::int from public.household_pets), 0, 'no other household''s sharing rows');
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000002', current_date, 20)$$,
  '42501', null, 'an unrelated user cannot write another owner''s pet'
);
select is_empty(
  $$update public.pets set name = 'X' where id = 'c1000000-0000-4000-8000-000000000002' returning id$$,
  'an unrelated user''s update touches nothing'
);
select is_empty(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000002' returning id$$,
  'an unrelated user''s delete touches nothing'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets), 0, 'the Operator sees no pets through the Data API');
select is((select count(*)::int from public.vet_visits), 0, 'nor any record');
reset role;

-- Organisation Volunteer (Vesna, approved kennel) ------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c7000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select name from public.pets$$, $$values ('Bela')$$,
  'a Volunteer sees their organisation''s animals only');
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c7000000-0000-4000-8000-000000000002', current_date, 29.5)$$,
  'a Volunteer adds weight'
);
select lives_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    values ('c7000000-0000-4000-8000-000000000002', 'Besnilo — Volonter', current_date)$$,
  'a Volunteer adds a vaccination'
);
select lives_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    values ('c7000000-0000-4000-8000-000000000002', current_date, 'Pregled — Volonter')$$,
  'a Volunteer adds a vet visit'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes)
    select v.id, v.pet_id, 'o/k/1.pdf', 'application/pdf', 1000
    from public.vet_visits v where v.reason = 'Pregled — Volonter'$$,
  'a Volunteer uploads an attachment'
);
select lives_ok(
  $$update public.pets set public_description = 'Mirna i dobra' where id = 'c7000000-0000-4000-8000-000000000002'$$,
  'a Volunteer edits an animal'
);
select lives_ok(
  $$delete from public.vaccinations where name = 'Besnilo — Volonter'$$,
  'a Volunteer deletes an entry'
);
select lives_ok(
  $$insert into public.pets (organisation_id, name, species, sex)
    values ('b2000000-0000-4000-8000-000000000002', 'Zlatko', 'dog', 'male')$$,
  'a Volunteer creates an animal'
);
select throws_ok(
  $$update public.pets set lifecycle = 'memorial' where id = 'c7000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'organisation animals have no memorial (EP-06)'
);
select throws_ok(
  $$delete from public.pets where id = 'c7000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'a Volunteer cannot delete an animal (BR-34)'
);
select throws_ok(
  $$insert into public.pets (organisation_id, name, species, sex)
    values ('b2000000-0000-4000-8000-000000000001', 'Tuđi', 'dog', 'male')$$,
  '42501', null, 'a Volunteer cannot create an animal for another organisation'
);
reset role;

-- Organisation Admin (Nikola, approved kennel) ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets), 2, 'an Admin sees their organisation''s animals');
select is((select count(*)::int from public.attachments), 1, 'and their records');
select lives_ok(
  $$delete from public.pets where name = 'Zlatko'$$,
  'an Admin deletes an animal (BR-34)'
);
reset role;

-- Pending shelter (Milica) — reads allowed, writes refused --------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select name from public.pets$$, $$values ('Žuća')$$,
  'a pending organisation reads its animals');
select is((select count(*)::int from public.weight_entries), 1, 'and their records');
select throws_ok(
  $$insert into public.pets (organisation_id, name, species, sex)
    values ('b2000000-0000-4000-8000-000000000001', 'Mila', 'cat', 'female')$$,
  'P0001', 'organisation_pending_approval', 'a pending organisation cannot create an animal'
);
select throws_ok(
  $$update public.pets set name = 'Žućko' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'organisation_pending_approval', 'nor edit one'
);
select throws_ok(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'organisation_pending_approval', 'nor delete one'
);
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000004', current_date, 6.3)$$,
  'P0001', 'organisation_pending_approval', 'nor add an entry'
);
select throws_ok(
  $$delete from public.weight_entries$$,
  'P0001', 'organisation_pending_approval', 'nor delete an entry'
);
select is((select count(*)::int from public.pets where organisation_id = 'b2000000-0000-4000-8000-000000000002'),
  0, 'another organisation''s animals are invisible');
reset role;

update public.organisations set approval_status = 'rejected'
where id = 'b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000004', current_date, 6.3)$$,
  'P0001', 'organisation_pending_approval:rejected', 'a rejected organisation''s writes carry the rejected detail'
);
reset role;

update public.organisations set approval_status = 'approved'
where id = 'b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000004', current_date, 6.3)$$,
  'once approved, the shelter writes'
);
reset role;

select * from finish();
rollback;
