-- NFR-02 (TC §7): a reminder set for 08:00 arrives at 08:00 Belgrade time on both sides of a DST change.
-- The dispatch claims by notify_at (EP-33 step 1), so notify_at must be 08:00 Europe/Belgrade in UTC:
-- 06:00Z in summer time (CEST, UTC+2) and 07:00Z in winter time (CET, UTC+1).
-- DST changes: 2026-10-25 03:00 CEST → 02:00 CET; 2027-03-28 02:00 CET → 03:00 CEST.
-- Seeded (supabase/seed.sql): Marko (…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- A daily 08:00 manual reminder (lead 0 = the reminder's own time) and a vaccination due at the
-- 08:00 delivery time with a 7-day notice, generated deterministically from a fixed "now".
update public.reminder_preferences set lead_minutes = '{10080,0}', delivery_time = '08:00'
where user_id = 'a1000000-0000-4000-8000-000000000002' and type = 'vaccination';

insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence) values
  ('f9200000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', null, 'manual', 'Lek — Step 19',
   '2026-10-24 08:00:00 Europe/Belgrade', 'daily'),
  ('f9200000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', null, 'manual', 'Lek proleće — Step 19',
   '2027-03-27 08:00:00 Europe/Belgrade', 'daily'),
  ('f9200000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', null, 'vaccination', null,
   '2026-11-01 08:00:00 Europe/Belgrade', 'none');
delete from public.reminder_occurrences
where reminder_id in ('f9200000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000002',
                      'f9200000-0000-4000-8000-000000000003');

select private.generate_reminder_occurrences('f9200000-0000-4000-8000-000000000001', '2026-10-23 12:00:00+02');
select private.generate_reminder_occurrences('f9200000-0000-4000-8000-000000000002', '2027-03-26 12:00:00+01');
select private.generate_reminder_occurrences('f9200000-0000-4000-8000-000000000003', '2026-10-23 12:00:00+02');

-- Autumn change (2026-10-25).
select is(
  (select notify_at from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000001' and due_at::date = '2026-10-24'),
  '2026-10-24 06:00:00+00'::timestamptz, 'the day before the autumn change: 08:00 CEST = 06:00 UTC'
);
select is(
  (select notify_at from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000001' and due_at::date = '2026-10-25'),
  '2026-10-25 07:00:00+00'::timestamptz, 'the day of the autumn change: 08:00 CET = 07:00 UTC'
);
select is(
  (select notify_at from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000001' and due_at::date = '2026-10-26'),
  '2026-10-26 07:00:00+00'::timestamptz, 'the day after the autumn change: 08:00 CET = 07:00 UTC'
);
select is(
  (select count(*)::int from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000001'
     and (notify_at at time zone 'Europe/Belgrade')::time <> '08:00'),
  0, 'every daily notice of the 60-day window is at 08:00 Belgrade'
);

-- Spring change (2027-03-28).
select is(
  (select notify_at from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000002' and due_at::date = '2027-03-27'),
  '2027-03-27 07:00:00+00'::timestamptz, 'the day before the spring change: 08:00 CET = 07:00 UTC'
);
select is(
  (select notify_at from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000002' and due_at::date = '2027-03-28'),
  '2027-03-28 06:00:00+00'::timestamptz, 'the day of the spring change: 08:00 CEST = 06:00 UTC'
);
select is(
  (select notify_at from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000002' and due_at::date = '2027-03-29'),
  '2027-03-29 06:00:00+00'::timestamptz, 'the day after the spring change: 08:00 CEST = 06:00 UTC'
);

-- A lead time that crosses the change: the 7-day notice of a vaccination due 2026-11-01 (CET)
-- falls on 2026-10-25, after the 03:00 switch.
select is(
  (select array_agg(notify_at order by notify_at) from public.reminder_occurrences
   where reminder_id = 'f9200000-0000-4000-8000-000000000003'),
  array['2026-10-25 07:00:00+00', '2026-11-01 07:00:00+00']::timestamptz[],
  'the vaccination notices are at 08:00 Belgrade, 7 days before and on the day'
);
select is(
  private.reminder_notify_at('2026-10-28 08:00:00+01', 10080, '08:00'),
  '2026-10-21 06:00:00+00'::timestamptz,
  'a 7-day notice before the autumn change for a due date after it stays at 08:00 (CEST)'
);
select is(
  private.reminder_notify_at('2027-03-30 08:00:00+02', 10080, '08:00'),
  '2027-03-23 07:00:00+00'::timestamptz,
  'a 7-day notice before the spring change for a due date after it stays at 08:00 (CET)'
);

-- The claim picks the notice exactly when it is due: a notice at "08:00 Belgrade" that is now due is
-- claimed, one a minute ahead is not (claim compares notify_at with now() in UTC).
update public.reminder_occurrences set notify_at = now() + interval '1 day' where status = 'pending' and notify_at <= now();
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at) values
  ('f9200000-0000-4000-8000-0000000000a1', 'f9200000-0000-4000-8000-000000000001', now(), now()),
  ('f9200000-0000-4000-8000-0000000000a2', 'f9200000-0000-4000-8000-000000000001', now() + interval '1 minute', now() + interval '1 minute');
select is(
  jsonb_path_query_array(public.claim_due_occurrences(200), '$[*].occurrence_id'),
  '["f9200000-0000-4000-8000-0000000000a1"]'::jsonb,
  'a notice is claimed once its notify_at is reached, not before'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9200000-0000-4000-8000-0000000000a2'),
  'pending', 'the notice a minute ahead waits for the next run'
);

select * from finish();
rollback;
