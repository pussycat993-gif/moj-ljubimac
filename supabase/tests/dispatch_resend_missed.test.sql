-- EP-33 steps 6–8 (FR-24 re-send once, then missed; BR-15, E-05; RISK-14 watchdog):
--   claim_resend_occurrences — a final notice sent ≥ 30 min ago whose instance is not done → resent
--     (resent_at = now()); earlier lead-time notices are never re-sent and stay sent;
--   mark_missed_occurrences — a final notice resent ≥ 30 min ago whose instance is not done → missed;
--   dispatch_watchdog_due — claimable pending notices > 15 min overdue and no delivery in 15 min.
-- Seeded (supabase/seed.sql): Marko (…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

select ok(
  not has_function_privilege('authenticated', 'public.claim_resend_occurrences(integer)', 'execute')
  and not has_function_privilege('anon', 'public.claim_resend_occurrences(integer)', 'execute'),
  'only the service role can claim re-sends'
);
select ok(
  not has_function_privilege('authenticated', 'public.mark_missed_occurrences()', 'execute')
  and not has_function_privilege('anon', 'public.mark_missed_occurrences()', 'execute'),
  'only the service role can mark missed'
);
select ok(
  not has_function_privilege('authenticated', 'public.dispatch_watchdog_due()', 'execute')
  and not has_function_privilege('anon', 'public.dispatch_watchdog_due()', 'execute'),
  'only the service role can read the watchdog'
);

-- Only this test's rows are in play.
update public.reminder_occurrences set notify_at = now() + interval '1 day'
where status = 'pending' and notify_at <= now();
update public.reminder_occurrences set status = 'done', done_at = now() - interval '1 day'
where status in ('sent', 'resent');
delete from public.reminder_deliveries;

insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence) values
  ('f9100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', null, 'manual', 'Re-send — Step 19', now() - interval '1 day', 'none');

-- d = due times; each instance has an earlier notice (7 days before) and a final notice (lead 0).
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at, status, sent_at, resent_at, done_at) values
  -- I1: final sent 31 min ago → resent; its earlier notice (sent 7 days ago) stays sent
  ('f9100000-0000-4000-8000-0000000001a0', 'f9100000-0000-4000-8000-000000000001', now() - interval '31 minutes', now() - interval '7 days 31 minutes', 'sent', now() - interval '7 days', null, null),
  ('f9100000-0000-4000-8000-0000000001a1', 'f9100000-0000-4000-8000-000000000001', now() - interval '31 minutes', now() - interval '31 minutes', 'sent', now() - interval '31 minutes', null, null),
  -- I2: final sent 10 min ago → not yet
  ('f9100000-0000-4000-8000-0000000002a1', 'f9100000-0000-4000-8000-000000000001', now() - interval '10 minutes', now() - interval '10 minutes', 'sent', now() - interval '10 minutes', null, null),
  -- I3: final sent 31 min ago, but the instance is done
  ('f9100000-0000-4000-8000-0000000003a0', 'f9100000-0000-4000-8000-000000000001', now() - interval '32 minutes', now() - interval '7 days 32 minutes', 'done', now() - interval '7 days', null, now() - interval '1 hour'),
  ('f9100000-0000-4000-8000-0000000003a1', 'f9100000-0000-4000-8000-000000000001', now() - interval '32 minutes', now() - interval '32 minutes', 'sent', now() - interval '32 minutes', null, null),
  -- I4: final resent 31 min ago → missed
  ('f9100000-0000-4000-8000-0000000004a1', 'f9100000-0000-4000-8000-000000000001', now() - interval '61 minutes', now() - interval '61 minutes', 'resent', now() - interval '61 minutes', now() - interval '31 minutes', null),
  -- I5: final resent 10 min ago → not yet
  ('f9100000-0000-4000-8000-0000000005a1', 'f9100000-0000-4000-8000-000000000001', now() - interval '40 minutes', now() - interval '40 minutes', 'resent', now() - interval '40 minutes', now() - interval '10 minutes', null),
  -- I6: an earlier notice sent 2 days ago whose final notice is still pending → never re-sent
  ('f9100000-0000-4000-8000-0000000006a0', 'f9100000-0000-4000-8000-000000000001', now() + interval '5 days', now() - interval '2 days', 'sent', now() - interval '2 days', null, null),
  ('f9100000-0000-4000-8000-0000000006a1', 'f9100000-0000-4000-8000-000000000001', now() + interval '5 days', now() + interval '5 days', 'pending', null, null, null),
  -- I7: final resent 31 min ago, instance done → not missed
  ('f9100000-0000-4000-8000-0000000007a0', 'f9100000-0000-4000-8000-000000000001', now() - interval '62 minutes', now() - interval '7 days 62 minutes', 'done', now() - interval '7 days', null, now() - interval '1 hour'),
  ('f9100000-0000-4000-8000-0000000007a1', 'f9100000-0000-4000-8000-000000000001', now() - interval '62 minutes', now() - interval '62 minutes', 'resent', now() - interval '62 minutes', now() - interval '31 minutes', null);

-- Step 6: re-send ---------------------------------------------------------------------------------------
create temp table t_resend as select public.claim_resend_occurrences(200) as j;

select is(
  (select jsonb_path_query_array(j, '$[*].occurrence_id') from t_resend),
  '["f9100000-0000-4000-8000-0000000001a1"]'::jsonb,
  'only the final notice sent 30+ minutes ago of an instance not done is re-sent'
);
select is(
  (select row(status, resent_at)::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000001a1'),
  row('resent'::public.occurrence_status, now())::text,
  're-sent → status resent, resent_at = now()'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000001a0'),
  'sent', 'the earlier lead-time notice of the same instance stays sent'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000002a1'),
  'sent', 'a final notice sent less than 30 minutes ago waits'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000003a1'),
  'sent', 'an instance already done is not re-sent'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000006a0'),
  'sent', 'an earlier notice is never re-sent, even long after it was sent'
);
select is(
  (select jsonb_array_length(e -> 'recipients') from t_resend, jsonb_array_elements(j) e),
  1, 'the re-send carries its recipients like a first send'
);
select is(public.claim_resend_occurrences(200), '[]'::jsonb, 'a notice is re-sent only once');

-- Step 7: missed ----------------------------------------------------------------------------------------
select is(public.mark_missed_occurrences(), 1, 'one notice is marked missed');
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000004a1'),
  'missed', 'a final notice re-sent 30+ minutes ago and not done → missed'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000005a1'),
  'resent', 'a notice re-sent less than 30 minutes ago waits'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000001a1'),
  'resent', 'the notice just re-sent is not missed yet'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9100000-0000-4000-8000-0000000007a1'),
  'resent', 'an instance already done is never marked missed'
);
select is(public.mark_missed_occurrences(), 0, 'marking missed is idempotent');

-- Missed shows in the product (FR-24 "shown as missed"): EP-25's missed tab.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select ok(
  (select public.list_reminder_occurrences('missed') -> 'items') @> '[{"id": "f9100000-0000-4000-8000-0000000004a1", "display_status": "missed"}]'::jsonb,
  'the missed instance is listed as missed'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Step 8: watchdog (RISK-14) ----------------------------------------------------------------------------
select is(public.dispatch_watchdog_due(), false, 'nothing overdue → no alert');

insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at) values
  ('f9100000-0000-4000-8000-0000000008a1', 'f9100000-0000-4000-8000-000000000001', now() + interval '1 hour', now() - interval '10 minutes');
select is(public.dispatch_watchdog_due(), false, 'pending 10 minutes overdue is still within the window');

insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at) values
  ('f9100000-0000-4000-8000-0000000009a1', 'f9100000-0000-4000-8000-000000000001', now() + interval '2 hours', now() - interval '16 minutes');
select is(public.dispatch_watchdog_due(), true, 'pending > 15 minutes overdue and no delivery in 15 minutes → alert');

insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status, delivered_at) values
  ('f9100000-0000-4000-8000-0000000001a1', 'a1000000-0000-4000-8000-000000000002', 'email', 'delivered', now());
select is(public.dispatch_watchdog_due(), false, 'a delivery recorded in the last 15 minutes → no alert');

select * from finish();
rollback;
