-- Step F1 (Step 08 follow-up, owner-approved 2026-10-29): index the reminder_occurrences → reminders foreign key.
-- Regeneration (generate_reminder_occurrences(p_reminder_id) deletes and re-inserts one reminder's future pending
-- rows) and the `on delete cascade` from reminders both look rows up by reminder_id. Additive only: no data change.
create index if not exists reminder_occurrences_reminder_id_idx
  on public.reminder_occurrences (reminder_id);
