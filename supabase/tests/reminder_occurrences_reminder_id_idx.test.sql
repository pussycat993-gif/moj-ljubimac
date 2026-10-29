-- Step F1 (Step 08 follow-up): the reminder_id index on reminder_occurrences and the lookups it serves.
-- Runs as postgres inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select has_index('public', 'reminder_occurrences', 'reminder_occurrences_reminder_id_idx', array['reminder_id'],
  'index on reminder_id');
select is(
  (select indpred from pg_index where indexrelid = 'public.reminder_occurrences_reminder_id_idx'::regclass),
  null, 'the reminder_id index is not partial (regeneration and the cascade read every status)'
);

-- With sequential scans off, a lookup by reminder_id (the regeneration delete and the cascade) uses the index.
set local enable_seqscan = off;
create temporary table plan_lines (line text) on commit drop;
do $$
declare r record;
begin
  for r in execute 'explain select id from public.reminder_occurrences where reminder_id = ''d9000000-0000-4000-8000-0000000000ff''' loop
    insert into plan_lines values (r."QUERY PLAN");
  end loop;
end $$;
select ok(
  exists(select 1 from plan_lines where line like '%reminder_occurrences_reminder_id_idx%'),
  'a reminder_id lookup uses reminder_occurrences_reminder_id_idx'
);

select * from finish();
rollback;
