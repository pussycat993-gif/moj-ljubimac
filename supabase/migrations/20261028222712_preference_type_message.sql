-- Step 28a — the reminder_preferences type `message` (TC §5.5 v1.7, FR-69).
-- Owner decision (2026-10-28): Step 08 typed reminder_preferences.type with public.reminder_type and
-- there is no separate preference_type enum, so the docs' preference_type reads reminder_type here.
-- The value is added alone: Postgres cannot use an enum value in the transaction that adds it. The
-- guards (no reminders of type message, message-row checks, default rows) are in sapa_columns.
alter type public.reminder_type add value if not exists 'message';
