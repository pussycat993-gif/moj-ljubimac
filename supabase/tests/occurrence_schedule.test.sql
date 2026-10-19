-- Nightly occurrence generation (TC §8, ADR-04): exactly one pg_cron job, at 01:00 UTC
-- (03:00 Belgrade summer time / 02:00 winter time, owner's choice 2026-10-19), calling the
-- all-reminders function; a run refreshes the 60-day window and leaves done/missed rows
-- untouched. Seeded: Marko (…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select has_extension('pg_cron', 'pg_cron is installed');
select is((select count(*)::int from cron.job), 1, 'exactly one cron job exists (only the nightly generation)');
select is(
  (select row(jobname, schedule, command)::text from cron.job),
  row('nightly-reminder-occurrences', '0 1 * * *', 'select private.generate_all_reminder_occurrences()')::text,
  'it runs once per night at 01:00 UTC and calls the all-reminders function'
);
select ok((select active from cron.job where jobname = 'nightly-reminder-occurrences'), 'the job is active');
select ok(not exists (select 1 from cron.job where command ilike '%net.%'), 'the job uses no pg_net');

-- A daily reminder, generated as of 2026-10-20 00:00 Belgrade.
insert into public.reminders (id, user_id, type, title, starts_at, recurrence) values
  ('dd000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'manual', 'Lek',
   '2026-10-20 08:00:00+02', 'daily');
delete from public.reminder_occurrences where reminder_id = 'dd000000-0000-4000-8000-000000000001';
select private.generate_all_reminder_occurrences('2026-10-20 00:00:00+02');

select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = 'dd000000-0000-4000-8000-000000000001'),
  60, 'the all-reminders run fills the 60-day window'
);

update public.reminder_occurrences set status = 'done', done_at = now()
where reminder_id = 'dd000000-0000-4000-8000-000000000001' and due_at = '2026-10-20 08:00:00+02';
update public.reminder_occurrences set status = 'missed'
where reminder_id = 'dd000000-0000-4000-8000-000000000001' and due_at = '2026-10-21 08:00:00+02';
update public.reminder_occurrences set status = 'done', done_at = now()
where reminder_id = 'dd000000-0000-4000-8000-000000000001' and due_at = '2026-10-30 08:00:00+01';

-- The next night (2026-10-21 03:00 Belgrade).
select private.generate_all_reminder_occurrences('2026-10-21 03:00:00+02');

select is(
  (select count(*)::int from public.reminder_occurrences
   where reminder_id = 'dd000000-0000-4000-8000-000000000001' and due_at = '2026-12-19 08:00:00+01'),
  1, 'the window moved forward by a day'
);
select is(
  (select array_agg(status::text order by due_at) from public.reminder_occurrences
   where reminder_id = 'dd000000-0000-4000-8000-000000000001'
     and due_at in ('2026-10-20 08:00:00+02', '2026-10-21 08:00:00+02', '2026-10-30 08:00:00+01')),
  array['done', 'missed', 'done'], 'done and missed rows are untouched'
);
select is(
  (select count(*)::int from public.reminder_occurrences
   where reminder_id = 'dd000000-0000-4000-8000-000000000001' and due_at = '2026-10-30 08:00:00+01'),
  1, 'a done instance is not re-created'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = 'dd000000-0000-4000-8000-000000000001'),
  61, 'no duplicates: 60 original rows plus the new day'
);

-- Inactive reminders get nothing.
set local session_replication_role = replica;
update public.reminders set active = false where id = 'dd000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
select private.generate_all_reminder_occurrences('2026-10-21 03:00:00+02');
select is(
  (select count(*)::int from public.reminder_occurrences
   where reminder_id = 'dd000000-0000-4000-8000-000000000001' and status = 'pending'
     and notify_at > '2026-10-21 03:00:00+02'),
  0, 'the nightly run clears future pending rows of inactive reminders'
);

select * from finish();
rollback;
