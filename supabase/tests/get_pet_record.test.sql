-- rpc:get_pet_record (EP-02; API §6 PetRecord and nested schemas). FR-02 (edited values are
-- returned by EP-01 and EP-02), FR-03 (weights returned in the pet's unit after a unit change).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium, Luna + Maks), Marko (…02, Kiki),
-- Jelena (…03, member of Ivana's household, Luna shared), Nikola (…05, breeder admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

select has_function('public', 'get_pet_record', array['uuid'], 'rpc:get_pet_record(uuid) exists');
select function_returns('public', 'get_pet_record', array['uuid'], 'jsonb', 'get_pet_record returns jsonb');
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.get_pet_record(uuid)'::regprocedure),
  false,
  'get_pet_record is security invoker'
);

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select public.get_pet_record('c1000000-0000-4000-8000-000000000001')$$, '42501', null,
  'anon cannot call get_pet_record');
reset role;

-- No relation → not_found -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.get_pet_record('c1000000-0000-4000-8000-000000000001')$$, 'P0001', 'not_found',
  'another owner''s pet → not_found');
select throws_ok($$select public.get_pet_record('00000000-0000-4000-8000-000000000000')$$, 'P0001', 'not_found',
  'an unknown pet → not_found');
reset role;

-- Owner (Ivana) on Luna ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table rec on commit drop as select public.get_pet_record('c1000000-0000-4000-8000-000000000001') as r;
reset role;

select is((select r -> 'pet' ->> 'name' from rec), 'Luna', 'pet.name');
select is((select r -> 'pet' ->> 'species' from rec), 'cat', 'pet.species');
select is((select r -> 'pet' ->> 'birth_date' from rec), '2023-04-12', 'pet.birth_date');
select is((select r -> 'pet' ->> 'neutered' from rec), 'yes', 'pet.neutered');
select is((select r -> 'pet' ->> 'weight_unit' from rec), 'kg', 'pet.weight_unit');
select is((select (r -> 'pet' ->> 'has_photo')::boolean from rec), false, 'pet.has_photo');
select is((select r -> 'pet' -> 'photo_file_name' from rec), 'null'::jsonb, 'pet.photo_file_name null without a photo');
select is((select r -> 'pet' -> 'price' from rec), 'null'::jsonb, 'pet.price null without price_minor');
select ok((select not (r -> 'pet' ? 'photo_r2_key') from rec), 'the raw r2 key is never returned');
select is(
  (select count(*)::int from rec, jsonb_object_keys(r -> 'pet')),
  30,
  'pet has the 30 fields of the Pet schema'
);
select is((select r -> 'access' from rec), '{"role": "owner", "can_edit": true, "can_delete": true}'::jsonb, 'owner access');
select is((select (r ->> 'can_log')::boolean from rec), true, 'owner can_log');
select is((select r -> 'read_only_reason' from rec), 'null'::jsonb, 'read_only_reason null when can_edit');
select is((select r ->> 'owner_name' from rec), 'Ivana Petrović', 'owner_name');
select is((select r -> 'memorial' from rec), 'null'::jsonb, 'memorial null while active');
select is((select jsonb_array_length(r -> 'vaccinations') from rec), 3, 'vaccinations: all 3');
select is(
  (select array_agg(v ->> 'given_on') from rec, jsonb_array_elements(r -> 'vaccinations') v),
  array['2026-03-12', '2025-10-26', '2024-03-12'],
  'vaccinations ordered given_on desc'
);
select is(
  (select (v ->> 'days_until_due')::int from rec, jsonb_array_elements(r -> 'vaccinations') v where v ->> 'name' = 'Besnilo — Rabisin'),
  ('2026-10-26'::date - (now() at time zone 'Europe/Belgrade')::date),
  'days_until_due = next_due_on − today (Belgrade)'
);
select is(
  (select v -> 'days_until_due' from rec, jsonb_array_elements(r -> 'vaccinations') v where v ->> 'name' like 'Leukoza%'),
  'null'::jsonb,
  'days_until_due null without next_due_on'
);
select is((select jsonb_array_length(r -> 'treatments') from rec), 1, 'treatments');
select is((select (r -> 'treatments' -> 0 ->> 'dose_count')::int from rec), 2, 'treatment dose_count');
select is((select jsonb_array_length(r -> 'treatments' -> 0 -> 'recent_doses') from rec), 2, 'recent_doses (latest 4)');
select is((select r -> 'treatments' -> 0 -> 'recent_doses' -> 0 ->> 'created_by_name' from rec), 'Jelena Nikolić',
  'recent_doses ordered given_at desc with created_by_name');
select is((select jsonb_array_length(r -> 'vet_visits') from rec), 1, 'vet_visits');
select is((select r -> 'vet_visits' -> 0 -> 'cost' from rec), '{"currency": "RSD", "amount_minor": 299000}'::jsonb,
  'vet visit cost as Money');
select is((select r -> 'vet_visits' -> 0 -> 'attachments' from rec), '[]'::jsonb, 'vet visit attachments []');
select is((select jsonb_array_length(r -> 'weights') from rec), 4, 'weights');
select is(
  (select array_agg(w ->> 'measured_on') from rec, jsonb_array_elements(r -> 'weights') w),
  array['2026-10-19', '2026-10-02', '2026-06-17', '2026-04-17'],
  'weights ordered measured_on desc'
);
select ok((select jsonb_array_length(r -> 'upcoming_reminders') between 1 and 3 from rec), 'upcoming_reminders: up to 3');
select is((select (r ->> 'attachment_count')::int from rec), 0, 'attachment_count');

-- Household member (Jelena) on Luna ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
create temp table member_rec on commit drop as select public.get_pet_record('c1000000-0000-4000-8000-000000000001') as r;
reset role;
select is((select r -> 'access' from member_rec), '{"role": "member", "can_edit": false, "can_delete": false}'::jsonb, 'member access: read only');
select is((select r ->> 'read_only_reason' from member_rec), 'household_member', 'member: read_only_reason household_member');
select is((select r ->> 'owner_name' from member_rec), 'Ivana Petrović', 'member: owner_name for the banner');
select is(
  (select array_agg((w -> 'access' ->> 'can_edit')::boolean order by w ->> 'measured_on') from member_rec, jsonb_array_elements(r -> 'weights') w),
  array[false, false, false, true],
  'per-entry access: the member may edit only the weight they logged'
);

update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((public.get_pet_record('c1000000-0000-4000-8000-000000000001') ->> 'read_only_reason'), 'household_read_only',
  'read-only household: read_only_reason household_read_only');
select is((public.get_pet_record('c1000000-0000-4000-8000-000000000001') ->> 'can_log')::boolean, false,
  'read-only household: can_log false');
reset role;
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';

-- FR-02: changed values are shown everywhere the pet appears (EP-01 and EP-02) -------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
update public.pets set name = 'Luna Mia', breed = 'Mešanac', vet_phone = '021 111 222'
where id = 'c1000000-0000-4000-8000-000000000001';
select is((public.get_pet_record('c1000000-0000-4000-8000-000000000001') -> 'pet' ->> 'name'), 'Luna Mia', 'FR-02: EP-02 returns the new name');
select is((public.get_pet_record('c1000000-0000-4000-8000-000000000001') -> 'pet' ->> 'vet_phone'), '021 111 222', 'FR-02: EP-02 returns the new vet phone');
select is((select breed from public.pet_summaries_api where id = 'c1000000-0000-4000-8000-000000000001'), 'Mešanac',
  'FR-02: EP-01 returns the new breed');

-- FR-03 / BR-50: the unit set to grams → weights returned in grams -------------------------------
update public.pets set weight_unit = 'g' where id = 'c1000000-0000-4000-8000-000000000001';
create temp table grams_rec on commit drop as select public.get_pet_record('c1000000-0000-4000-8000-000000000001') as r;
reset role;
select is((select r -> 'pet' ->> 'weight_unit' from grams_rec), 'g', 'FR-03: pet.weight_unit = g');
select is(
  (select array_agg((w ->> 'value')::numeric || ' ' || (w ->> 'weight_unit')) from grams_rec, jsonb_array_elements(r -> 'weights') w),
  array['4200.000 g', '4100.000 g', '4000.000 g', '3800.000 g'],
  'FR-03: every weight entry is returned in grams'
);

select * from finish();
rollback;
