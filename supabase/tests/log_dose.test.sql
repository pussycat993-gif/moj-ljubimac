-- rpc:log_dose (EP-11; API §6 DoseLog). FR-06: marking a dose as given records a dose log with time
-- and user; owner and member may log (BR-22); idempotent on p_occurrence_id; the occurrence (all its
-- lead-time rows) becomes done; a read-only household → household_read_only (BR-28); no relation →
-- not_found; p_given_at at most 5 minutes ahead; p_occurrence_id must belong to the treatment.
-- Seeded (supabase/seed.sql): Ivana (…01, Luna + Maks), Marko (…02, no relation to Luna), Jelena (…03,
-- member of Ivana's household, Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

select has_function('public', 'log_dose', array['uuid', 'timestamp with time zone', 'uuid'], 'rpc:log_dose exists');
select ok(
  not has_function_privilege('anon', 'public.log_dose(uuid, timestamptz, uuid)', 'execute'),
  'anon cannot call log_dose'
);
select ok(
  has_function_privilege('authenticated', 'public.log_dose(uuid, timestamptz, uuid)', 'execute'),
  'authenticated can call log_dose'
);

-- A treatment on Luna: every 12 hours from tomorrow for 3 days (its occurrences are pending).
insert into public.treatments (id, pet_id, type, name, interval_value, interval_unit, starts_on, ends_on, created_by)
select 'e5000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'medication',
       'Tobrex — Step 15', 12, 'hours', d + 1, d + 3, 'a1000000-0000-4000-8000-000000000001' from t_today;
-- A second treatment, to check that an occurrence of another treatment is refused.
insert into public.treatments (id, pet_id, type, name, starts_on, created_by)
select 'e5000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'deworming',
       'Milbemax — Step 15', d + 1, 'a1000000-0000-4000-8000-000000000001' from t_today;

create temp table t_occ on commit drop as
select o.id, o.due_at, row_number() over (order by o.due_at) as n
from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
where r.source_id = 'e5000000-0000-4000-8000-000000000001';
create temp table t_other_occ on commit drop as
select o.id from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
where r.source_id = 'e5000000-0000-4000-8000-000000000002';
grant select on t_occ, t_other_occ to authenticated;
-- A second lead-time row for the first dose, as a lead time would create it (same instance).
insert into public.reminder_occurrences (reminder_id, due_at, notify_at)
select o.reminder_id, o.due_at, o.due_at - interval '1 day'
from public.reminder_occurrences o where o.id = (select id from t_occ where n = 1);

-- Owner logs the first dose from its occurrence (S03 "Doza data") ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_owner_log on commit drop as
select public.log_dose('e5000000-0000-4000-8000-000000000001', null, (select id from t_occ where n = 1)) as j;
reset role;

select is(
  (select count(*)::int from public.dose_logs where treatment_id = 'e5000000-0000-4000-8000-000000000001'),
  1, 'FR-06: marking the dose as given records a dose log'
);
select is(
  (select row(created_by, occurrence_id)::text from public.dose_logs where treatment_id = 'e5000000-0000-4000-8000-000000000001'),
  (select row('a1000000-0000-4000-8000-000000000001'::uuid, id)::text from t_occ where n = 1),
  'FR-06: the log records the user and the occurrence'
);
select ok(
  (select given_at between now() - interval '1 minute' and now() + interval '1 minute'
   from public.dose_logs where treatment_id = 'e5000000-0000-4000-8000-000000000001'),
  'FR-06: without p_given_at the time is now()'
);
select is(
  (select array(select jsonb_object_keys(j) order by 1) from t_owner_log),
  array['access', 'created_by', 'created_by_name', 'given_at', 'id', 'occurrence_id', 'treatment_id'],
  'returns the DoseLog fields'
);
select is(
  (select row(j ->> 'created_by_name', j -> 'access')::text from t_owner_log),
  row('Ivana Petrović', '{"role": "owner", "can_edit": true, "can_delete": true}'::jsonb)::text,
  'DoseLog: created_by_name and the per-entry access'
);
select is(
  (select array_agg(row(o.status, o.done_by)::text) from public.reminder_occurrences o
   where o.due_at = (select due_at from t_occ where n = 1)
     and o.reminder_id = (select reminder_id from public.reminder_occurrences where id = (select id from t_occ where n = 1))),
  array[row('done'::public.occurrence_status, 'a1000000-0000-4000-8000-000000000001'::uuid)::text,
        row('done'::public.occurrence_status, 'a1000000-0000-4000-8000-000000000001'::uuid)::text],
  'the occurrence and its other lead-time row are done, by the caller'
);
select ok(
  (select bool_and(done_at is not null) from public.reminder_occurrences o
   where o.due_at = (select due_at from t_occ where n = 1) and o.status = 'done'),
  'done_at is set'
);
select is(
  (select count(*)::int from public.reminder_occurrences o where o.id in (select id from t_occ where n > 1) and o.status = 'done'),
  0, 'the other doses stay open'
);

-- Idempotent on p_occurrence_id ------------------------------------------------------------------------------
set local role authenticated;
create temp table t_again on commit drop as
select public.log_dose('e5000000-0000-4000-8000-000000000001', now() - interval '1 hour', (select id from t_occ where n = 1)) as j;
reset role;
select is((select j ->> 'id' from t_again), (select j ->> 'id' from t_owner_log), 'the same occurrence again returns the existing log');
select is(
  (select count(*)::int from public.dose_logs where treatment_id = 'e5000000-0000-4000-8000-000000000001'),
  1, 'and nothing changes'
);

-- Validation ----------------------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000001', now() + interval '10 minutes', null)$$,
  'P0001', 'validation_failed', 'p_given_at more than 5 minutes ahead is rejected'
);
select lives_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000001', now() + interval '4 minutes', null)$$,
  'p_given_at up to 5 minutes ahead is accepted'
);
select throws_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000001', null, (select id from t_other_occ limit 1))$$,
  'P0001', 'validation_failed', 'an occurrence of another treatment is rejected (p_occurrence_id invalid)'
);
select throws_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000009', null, null)$$,
  'P0001', 'not_found', 'an unknown treatment → not_found'
);
reset role;

-- Member logs a dose (BR-22) ----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
create temp table t_member_log on commit drop as
select public.log_dose('e5000000-0000-4000-8000-000000000001', now() - interval '2 minutes', (select id from t_occ where n = 2)) as j;
reset role;
select is(
  (select row(created_by, occurrence_id)::text from public.dose_logs where id = (select (j ->> 'id')::uuid from t_member_log)),
  (select row('a1000000-0000-4000-8000-000000000003'::uuid, id)::text from t_occ where n = 2),
  'FR-06 / FR-28: a member logs a dose; the log records the member'
);
select ok(
  (select abs(extract(epoch from given_at - (now() - interval '2 minutes'))) < 1
   from public.dose_logs where id = (select (j ->> 'id')::uuid from t_member_log)),
  'FR-06: the given time is stored'
);
select is(
  (select row(j ->> 'created_by_name', j -> 'access')::text from t_member_log),
  row('Jelena Nikolić', '{"role": "member", "can_edit": true, "can_delete": true}'::jsonb)::text,
  'the member''s own log is editable by them (BR-23)'
);
select is(
  (select row(status, done_by)::text from public.reminder_occurrences where id = (select id from t_occ where n = 2)),
  row('done'::public.occurrence_status, 'a1000000-0000-4000-8000-000000000003'::uuid)::text,
  'the member''s occurrence is done, by the member'
);

-- Read-only household (BR-28) -----------------------------------------------------------------------------------------
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000001', null, (select id from t_occ where n = 3))$$,
  'P0001', 'household_read_only', 'BR-28: a member of a read-only household cannot log a dose'
);
reset role;
select is(
  (select status::text from public.reminder_occurrences where id = (select id from t_occ where n = 3)),
  'pending', 'and the occurrence stays open'
);
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';

-- No relation (Marko) ---------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000001', null, null)$$,
  'P0001', 'not_found', 'a user with no relation to the pet → not_found'
);
select throws_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000001', null, (select id from t_occ where n = 4))$$,
  'P0001', 'not_found', 'and cannot complete its occurrence'
);
reset role;
select is(
  (select status::text from public.reminder_occurrences where id = (select id from t_occ where n = 4)),
  'pending', 'the occurrence is untouched'
);

-- Owner on a dose without a reminder occurrence (S03 "Doza data" with no open dose) ------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.log_dose('e5000000-0000-4000-8000-000000000002', null, null)$$,
  'a dose can be logged without an occurrence'
);
reset role;

select * from finish();
rollback;
