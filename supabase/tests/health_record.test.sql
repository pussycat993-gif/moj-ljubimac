-- weight_entries, vaccinations, treatments, dose_logs, vet_visits, attachments (TC §5.3):
-- columns, checks, indexes; created_by set on insert, a null author refused, and cleared
-- when the author is deleted while the entry remains (BR-26).
-- Seeded: Ivana (…01, owner of Luna c1…01), Jelena (…03, member of Ivana's household,
-- Luna shared), treatment c2…01 and vet visit c3…01 on Luna.
begin;
create extension if not exists pgtap with schema extensions;

select plan(51);

-- Enums ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'treatment_type', array['medication', 'deworming', 'flea_tick', 'other'],
  'treatment types');
select enum_has_labels('public', 'treatment_interval_unit', array['hours', 'days'], 'interval units');

-- Columns ---------------------------------------------------------------------------------------
select columns_are('public', 'weight_entries', array[
  'id', 'pet_id', 'measured_on', 'value', 'note', 'created_by', 'created_at', 'updated_at'
], 'weight_entries has the TC §5.3 columns');
select col_type_is('public', 'weight_entries', 'value', 'numeric(9,3)', 'value is numeric(9,3)');
select col_not_null('public', 'weight_entries', 'measured_on', 'measured_on is not null');
select has_index('public', 'weight_entries', 'weight_entries_pet_id_measured_on_idx',
  array['pet_id', 'measured_on'], 'index (pet_id, measured_on)');

select columns_are('public', 'vaccinations', array[
  'id', 'pet_id', 'name', 'given_on', 'next_due_on', 'clinic', 'batch_number', 'note',
  'created_by', 'created_at', 'updated_at'
], 'vaccinations has the TC §5.3 columns');
select col_not_null('public', 'vaccinations', 'name', 'name is not null');
select col_not_null('public', 'vaccinations', 'given_on', 'given_on is not null');
select has_index('public', 'vaccinations', 'vaccinations_pet_id_given_on_idx',
  array['pet_id', 'given_on'], 'index (pet_id, given_on)');

select columns_are('public', 'treatments', array[
  'id', 'pet_id', 'type', 'name', 'dose', 'interval_value', 'interval_unit', 'starts_on',
  'ends_on', 'note', 'created_by', 'created_at', 'updated_at'
], 'treatments has the TC §5.3 columns');
select col_not_null('public', 'treatments', 'type', 'type is not null');
select col_not_null('public', 'treatments', 'starts_on', 'starts_on is not null');

select columns_are('public', 'dose_logs', array[
  'id', 'treatment_id', 'given_at', 'occurrence_id', 'created_by', 'created_at', 'updated_at'
], 'dose_logs has the TC §5.3 columns');
select col_not_null('public', 'dose_logs', 'given_at', 'given_at is not null');
select col_is_null('public', 'dose_logs', 'occurrence_id', 'occurrence_id is nullable');
select col_is_unique('public', 'dose_logs', 'occurrence_id', 'occurrence_id is unique');
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.dose_logs'::regclass and contype = 'f'
     and confrelid = 'public.reminder_occurrences'::regclass
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.dose_logs'::regclass and attname = 'occurrence_id')]),
  1, 'occurrence_id references reminder_occurrences (Step 08)'
);

select columns_are('public', 'vet_visits', array[
  'id', 'pet_id', 'visited_on', 'clinic', 'reason', 'findings', 'recommendations', 'cost_minor',
  'follow_up_on', 'created_by', 'created_at', 'updated_at'
], 'vet_visits has the TC §5.3 columns');
select col_not_null('public', 'vet_visits', 'reason', 'reason is not null');

select columns_are('public', 'attachments', array[
  'id', 'vet_visit_id', 'pet_id', 'r2_key', 'file_name', 'mime_type', 'size_bytes', 'created_by',
  'created_at', 'updated_at'
], 'attachments has the TC §5.3 columns');
select col_not_null('public', 'attachments', 'r2_key', 'r2_key is not null');
select has_index('public', 'attachments', 'attachments_pet_id_idx', array['pet_id'], 'index (pet_id)');

-- Every parent FK cascades; every created_by is set null with its author.
select is(
  (select count(*)::int from pg_constraint c
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and a.attname in ('pet_id', 'treatment_id', 'vet_visit_id')
     and c.conrelid in ('public.weight_entries'::regclass, 'public.vaccinations'::regclass,
                        'public.treatments'::regclass, 'public.dose_logs'::regclass,
                        'public.vet_visits'::regclass, 'public.attachments'::regclass)
     and c.confdeltype = 'c'),
  7, 'entries are deleted with their pet, treatment or visit'
);
select is(
  (select count(*)::int from pg_constraint c
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and a.attname = 'created_by'
     and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'n'
     and c.conrelid in ('public.weight_entries'::regclass, 'public.vaccinations'::regclass,
                        'public.treatments'::regclass, 'public.dose_logs'::regclass,
                        'public.vet_visits'::regclass, 'public.attachments'::regclass)),
  6, 'created_by references profiles on delete set null on every entry table'
);

-- Checks ----------------------------------------------------------------------------------------
-- A real seeded occurrence (the FK to reminder_occurrences exists since Step 08), preferring
-- one of Luna's treatment reminder.
create temp table seeded_occurrence on commit drop as
select o.id from public.reminder_occurrences o
join public.reminders r on r.id = o.reminder_id
order by (r.source_id = 'c2000000-0000-4000-8000-000000000001') desc, o.due_at, o.id
limit 1;

select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value, created_by)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 0, 'a1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'weight value must be > 0'
);
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, interval_value, interval_unit, starts_on, created_by)
    values ('c1000000-0000-4000-8000-000000000001', 'medication', 'X', 0, 'days', current_date,
            'a1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'interval_value must be > 0'
);
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason, cost_minor, created_by)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Pregled', -1,
            'a1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'cost_minor must be ≥ 0'
);
select lives_ok(
  $$insert into public.dose_logs (treatment_id, given_at, occurrence_id, created_by)
    values ('c2000000-0000-4000-8000-000000000001', now(), (select id from seeded_occurrence),
            'a1000000-0000-4000-8000-000000000001')$$,
  'a dose log with an occurrence id'
);
select throws_ok(
  $$insert into public.dose_logs (treatment_id, given_at, occurrence_id, created_by)
    values ('c2000000-0000-4000-8000-000000000001', now(), (select id from seeded_occurrence),
            'a1000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'one dose log per occurrence'
);
select lives_ok(
  $$insert into public.dose_logs (treatment_id, given_at, created_by) values
      ('c2000000-0000-4000-8000-000000000001', now(), 'a1000000-0000-4000-8000-000000000001'),
      ('c2000000-0000-4000-8000-000000000001', now(), 'a1000000-0000-4000-8000-000000000001')$$,
  'any number of dose logs without an occurrence'
);

-- attachments.pet_id is the visit's pet whatever the writer sends.
insert into public.pets (id, owner_id, name, species, sex)
values ('e3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Bela', 'dog', 'female');
insert into public.attachments (id, vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
values ('e3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000001', 'u/x/pets/y/visits/z/a.pdf', 'application/pdf', 1000,
        'a1000000-0000-4000-8000-000000000001');
select is(
  (select pet_id from public.attachments where id = 'e3000000-0000-4000-8000-000000000002'),
  'c1000000-0000-4000-8000-000000000001'::uuid, 'attachments.pet_id is denormalised from the visit'
);

-- created_by ------------------------------------------------------------------------------------
-- System insert without an author is refused on every entry table.
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4)$$,
  'P0001', 'internal_error', 'weight_entries: a null author is refused'
);
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    values ('c1000000-0000-4000-8000-000000000001', 'Besnilo', current_date)$$,
  'P0001', 'internal_error', 'vaccinations: a null author is refused'
);
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, starts_on)
    values ('c1000000-0000-4000-8000-000000000001', 'other', 'X', current_date)$$,
  'P0001', 'internal_error', 'treatments: a null author is refused'
);
select throws_ok(
  $$insert into public.dose_logs (treatment_id, given_at)
    values ('c2000000-0000-4000-8000-000000000001', now())$$,
  'P0001', 'internal_error', 'dose_logs: a null author is refused'
);
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Pregled')$$,
  'P0001', 'internal_error', 'vet_visits: a null author is refused'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes)
    values ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
            'k', 'image/png', 10)$$,
  'P0001', 'internal_error', 'attachments: a null author is refused'
);

-- A session's insert is authored by the caller, whatever created_by it sends.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
insert into public.weight_entries (pet_id, measured_on, value, note)
values ('c1000000-0000-4000-8000-000000000001', current_date, 4.3, 'member-entry');
insert into public.dose_logs (treatment_id, given_at)
values ('c2000000-0000-4000-8000-000000000001', '2026-10-19 10:00:00+00');
reset role;
select is(
  (select created_by from public.weight_entries where note = 'member-entry'),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'created_by is the member who added the weight'
);
select is(
  (select created_by from public.dose_logs where given_at = '2026-10-19 10:00:00+00'),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'created_by is the member who logged the dose'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on, created_by)
    values ('c1000000-0000-4000-8000-000000000001', 'Besnilo', current_date,
            'a1000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'a client cannot name another author'
);
select throws_ok(
  $$update public.vaccinations set created_by = 'a1000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'created_by is not client-updatable'
);
select throws_ok(
  $$update public.weight_entries set pet_id = 'e3000000-0000-4000-8000-000000000001'
    where note = 'member-entry'$$,
  '42501', null, 'pet_id is not client-updatable'
);
select throws_ok(
  $$update public.attachments set r2_key = 'other' where id = 'e3000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'attachments are never updated by a client'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-26: the member leaves; their entries remain ---------------------------------------------
delete from public.household_memberships
where user_id = 'a1000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.weight_entries
   where created_by = 'a1000000-0000-4000-8000-000000000003'),
  2, 'a member''s weight entries remain after they leave (seeded + new)'
);
select is(
  (select count(*)::int from public.dose_logs
   where created_by = 'a1000000-0000-4000-8000-000000000003'),
  2, 'a member''s dose logs remain after they leave (seeded + new)'
);

-- The author's account is deleted: entries remain with created_by = null.
delete from auth.users where id = 'a1000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'),
  0, 'the author''s profile is gone'
);
select is(
  (select count(*)::int from public.weight_entries
   where note = 'member-entry' and created_by is null),
  1, 'the weight entry stays with created_by = null'
);
select is(
  (select count(*)::int from public.dose_logs
   where given_at = '2026-10-19 10:00:00+00' and created_by is null),
  1, 'the dose log stays with created_by = null'
);
select is(
  (select count(*)::int from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  5, 'Luna keeps all her weight entries'
);

-- RLS is on ------------------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class
   where oid in ('public.weight_entries'::regclass, 'public.vaccinations'::regclass,
                 'public.treatments'::regclass, 'public.dose_logs'::regclass,
                 'public.vet_visits'::regclass, 'public.attachments'::regclass)
     and relrowsecurity),
  6, 'RLS on every entry table'
);

select * from finish();
rollback;
