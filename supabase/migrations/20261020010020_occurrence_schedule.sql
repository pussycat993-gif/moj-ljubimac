-- Step 08 — nightly occurrence generation (TC §8: "nightly: occurrence generation —
-- scheduled in the reminders build step"; ADR-04 names pg_cron). The job runs SQL inside
-- the database: no pg_net, no Vault secret.
--
-- Run time: the owner chose 03:00 Europe/Belgrade (2026-10-19). pg_cron runs in UTC, so
-- the job is scheduled at 01:00 UTC = 03:00 Belgrade in summer time (CEST, UTC+2) and
-- 02:00 Belgrade in winter time (CET, UTC+1). The owner accepts the one-hour seasonal
-- shift.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'nightly-reminder-occurrences',
  '0 1 * * *',
  $$select private.generate_all_reminder_occurrences()$$
);
