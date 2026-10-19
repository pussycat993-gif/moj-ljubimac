-- reminder_occurrences and the generation function (TC §5.5, API §5.3 "Occurrence
-- instances"): BR-13 one row per lead time at the delivery time, doses and meals at the
-- exact time; NFR-02 08:00 Belgrade on both sides of a DST change; the rolling 60-day
-- window; regeneration replaces future pending rows only.
-- Generation is called with a fixed p_now so results do not depend on the run date.
-- Seeded: Marko (…02, Free owner of Kiki c1…03). Runs as postgres.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

-- Structure -----------------------------------------------------------------------------------
select enum_has_labels('public', 'occurrence_status', array['pending', 'sent', 'resent', 'done', 'missed'],
  'occurrence statuses');
select columns_are('public', 'reminder_occurrences', array[
  'id', 'reminder_id', 'due_at', 'notify_at', 'status', 'sent_at', 'resent_at', 'done_at', 'done_by',
  'created_at', 'updated_at'
], 'reminder_occurrences has the TC §5.5 columns');
select col_not_null('public', 'reminder_occurrences', 'due_at', 'due_at is not null');
select col_default_is('public', 'reminder_occurrences', 'status', 'pending', 'status defaults to pending');
select fk_ok('public', 'reminder_occurrences', 'reminder_id', 'public', 'reminders', 'id', 'reminder_id → reminders');
select fk_ok('public', 'reminder_occurrences', 'done_by', 'public', 'profiles', 'id', 'done_by → profiles');
select has_index('public', 'reminder_occurrences', 'reminder_occurrences_pending_notify_at_idx', array['notify_at'],
  'index on notify_at');
select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
   where indexrelid = 'public.reminder_occurrences_pending_notify_at_idx'::regclass),
  '(status = ''pending''::occurrence_status)', 'notify_at index is partial on pending (ADR-04)'
);
select has_index('public', 'reminder_occurrences', 'reminder_occurrences_sent_sent_at_idx', array['sent_at'],
  'index on sent_at');
select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
   where indexrelid = 'public.reminder_occurrences_sent_sent_at_idx'::regclass),
  '(status = ''sent''::occurrence_status)', 'sent_at index is partial on sent (BR-15)'
);
select ok((select relrowsecurity from pg_class where oid = 'public.reminder_occurrences'::regclass),
  'RLS on reminder_occurrences');

-- Setup: Marko sets vaccinations to 7 days, 1 day and on the day at 08:30 ------------------------
update public.reminder_preferences set lead_minutes = '{10080,1440,0}', delivery_time = '08:30'
where user_id = 'a1000000-0000-4000-8000-000000000002' and type = 'vaccination';

insert into public.reminders (id, user_id, pet_id, type, starts_at, recurrence) values
  ('d9000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000003', 'vaccination', '2026-12-10 08:30:00+01', 'none');
insert into public.reminders (id, user_id, pet_id, type, starts_at, recurrence, interval_value, ends_at) values
  ('d9000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000003', 'treatment_dose', '2026-11-02 08:00:00+01', 'hourly_interval', 12,
   '2026-11-03 23:59:59+01');
insert into public.reminders (id, user_id, pet_id, type, meal_times, meal_weekdays) values
  ('d9000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000003', 'meal', '{08:00,18:00}', '{1,3}');
insert into public.reminders (id, user_id, type, title, starts_at, recurrence) values
  ('d9000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'manual', 'Šetnja',
   '2026-10-20 08:00:00+02', 'daily');

delete from public.reminder_occurrences where reminder_id::text like 'd9000000-%';
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000001', '2026-11-01 00:00:00+01');
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000002', '2026-11-01 00:00:00+01');
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000003', '2026-11-01 00:00:00+01');

-- BR-13 / FR-22: one row per lead time at the delivery time ------------------------------------
select results_eq(
  $$select due_at, notify_at from public.reminder_occurrences
    where reminder_id = 'd9000000-0000-4000-8000-000000000001' order by notify_at$$,
  $$values
    ('2026-12-10 08:30:00+01'::timestamptz, '2026-12-03 08:30:00+01'::timestamptz),
    ('2026-12-10 08:30:00+01'::timestamptz, '2026-12-09 08:30:00+01'::timestamptz),
    ('2026-12-10 08:30:00+01'::timestamptz, '2026-12-10 08:30:00+01'::timestamptz)$$,
  'one occurrence per lead time (7 days, 1 day, on the day), each at 08:30 (BR-13, FR-22)'
);
select is(
  (select count(distinct due_at)::int from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000001'),
  1, 'all lead-time rows share one instance (reminder_id, due_at)'
);
select ok(
  (select bool_and(status = 'pending') from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000001'),
  'generated rows are pending'
);

-- Doses and meals: exact time, lead 0 only, whatever the preferences say ----------------------
select results_eq(
  $$select due_at, notify_at from public.reminder_occurrences
    where reminder_id = 'd9000000-0000-4000-8000-000000000002' order by due_at$$,
  $$values
    ('2026-11-02 08:00:00+01'::timestamptz, '2026-11-02 08:00:00+01'::timestamptz),
    ('2026-11-02 20:00:00+01'::timestamptz, '2026-11-02 20:00:00+01'::timestamptz),
    ('2026-11-03 08:00:00+01'::timestamptz, '2026-11-03 08:00:00+01'::timestamptz),
    ('2026-11-03 20:00:00+01'::timestamptz, '2026-11-03 20:00:00+01'::timestamptz)$$,
  'doses every 12 hours at their exact time until the end (BR-13)'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000003'),
  36, 'meals: 2 times × every Monday and Wednesday in the 60-day window (FR-15)'
);
select ok(
  (select bool_and(notify_at = due_at
                   and (due_at at time zone 'Europe/Belgrade')::time in ('08:00', '18:00')
                   and extract(isodow from due_at at time zone 'Europe/Belgrade') in (1, 3))
   from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000003'),
  'meals are notified at the exact meal time on the chosen weekdays (BR-13)'
);

-- NFR-02: 08:00 Belgrade on both sides of a DST change ----------------------------------------
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000004', '2026-10-20 00:00:00+02');
select is(
  (select due_at from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000004'
     and (due_at at time zone 'Europe/Belgrade')::date = '2026-10-24'),
  '2026-10-24 06:00:00+00'::timestamptz, 'Saturday before the autumn change: 08:00 CEST = 06:00 UTC (NFR-02)'
);
select is(
  (select due_at from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000004'
     and (due_at at time zone 'Europe/Belgrade')::date = '2026-10-26'),
  '2026-10-26 07:00:00+00'::timestamptz, 'Monday after the autumn change: 08:00 CET = 07:00 UTC (NFR-02)'
);
select ok(
  (select bool_and((due_at at time zone 'Europe/Belgrade')::time = '08:00')
   from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000004'),
  'every occurrence is at 08:00 Belgrade time (NFR-02)'
);

-- The rolling 60-day window -------------------------------------------------------------------
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000004'),
  60, 'a daily reminder has exactly 60 instances in the window (TC §5.5)'
);
select is(
  (select max(due_at) from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000004'),
  '2026-12-18 08:00:00+01'::timestamptz, 'the last instance is within now + 60 days'
);

-- Spring change, generated later in the window's life.
delete from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000004';
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000004', '2027-03-26 00:00:00+01');
select is(
  (select array_agg(due_at order by due_at) from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000004'
     and (due_at at time zone 'Europe/Belgrade')::date between '2027-03-27' and '2027-03-29'),
  array['2027-03-27 07:00:00+00', '2027-03-28 06:00:00+00', '2027-03-29 06:00:00+00']::timestamptz[],
  '08:00 Belgrade across the spring change: 07:00 UTC, then 06:00 UTC (NFR-02)'
);

-- Regeneration replaces future pending rows only ---------------------------------------------
delete from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000004';
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000004', '2026-10-20 00:00:00+02');

create temp table t_kept as
select id, status from (
  select o.id,
         case row_number() over (order by o.due_at)
           when 1 then 'sent'::public.occurrence_status
           when 2 then 'done'::public.occurrence_status
           when 3 then 'missed'::public.occurrence_status
           when 10 then 'done'::public.occurrence_status
         end as status
  from public.reminder_occurrences o
  where o.reminder_id = 'd9000000-0000-4000-8000-000000000004'
) x where status is not null;
update public.reminder_occurrences o set status = k.status from t_kept k where k.id = o.id;

-- The reminder moves to 09:00 (written without its trigger, then regenerated with p_now).
set local session_replication_role = replica;
update public.reminders set starts_at = '2026-10-20 09:00:00+02'
where id = 'd9000000-0000-4000-8000-000000000004';
set local session_replication_role = origin;
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000004', '2026-10-20 00:00:00+02');

select is(
  (select count(*)::int from public.reminder_occurrences o join t_kept k on k.id = o.id and k.status = o.status),
  4, 'sent, done and missed rows are kept unchanged'
);
select is(
  (select count(*)::int from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000004' and status = 'pending'
     and (due_at at time zone 'Europe/Belgrade')::time = '08:00'),
  0, 'future pending rows at the old time are gone'
);
select is(
  (select count(*)::int from public.reminder_occurrences
   where reminder_id = 'd9000000-0000-4000-8000-000000000004' and status = 'pending'
     and (due_at at time zone 'Europe/Belgrade')::time = '09:00'),
  60, 'and regenerated at the new time'
);

-- Same schedule again: nothing duplicated, a done instance gets no new rows.
set local session_replication_role = replica;
update public.reminders set starts_at = '2026-10-20 08:00:00+02'
where id = 'd9000000-0000-4000-8000-000000000004';
set local session_replication_role = origin;
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000004', '2026-10-20 00:00:00+02');
select private.generate_reminder_occurrences('d9000000-0000-4000-8000-000000000004', '2026-10-20 00:00:00+02');
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000004'),
  60, 'regenerating twice creates no duplicates; done/sent/missed instances are not re-created'
);
select is(
  (select count(*)::int from public.reminder_occurrences o
   where o.reminder_id = 'd9000000-0000-4000-8000-000000000004'
     and o.due_at = (select o2.due_at from public.reminder_occurrences o2 join t_kept k on k.id = o2.id
                     where k.status = 'done' order by o2.due_at desc limit 1)),
  1, 'a done instance keeps its single row'
);

-- Preference changes regenerate (EP-28) -------------------------------------------------------
update public.reminder_preferences set lead_minutes = '{0}'
where user_id = 'a1000000-0000-4000-8000-000000000002' and type = 'vaccination';
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = 'd9000000-0000-4000-8000-000000000001'
     and status = 'pending' and notify_at > now() and notify_at <> due_at),
  0, 'after a lead-time change no future pending notice keeps the old lead times (EP-28)'
);

select * from finish();
rollback;
