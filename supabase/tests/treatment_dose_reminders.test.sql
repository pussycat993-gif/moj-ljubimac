-- EP-10 treatments through the Data API as S27 writes them, and the linked `treatment_dose` reminder
-- (FR-06, FR-20): a frequency in hours or days creates dose reminders at that frequency until the end
-- date; the first dose is due on the start date at 08:00 Europe/Belgrade or the next full hour (BR-49);
-- doses notify at their exact time (BR-13); edits and deletes keep the reminder in sync. Also the EP-10
-- Request checks and the member rule (FR-28: view only → forbidden_role).
-- Seeded (supabase/seed.sql): Ivana (…01, Luna), Jelena (…03, member of Ivana's household, Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

-- Hours: every 12 hours for 3 days ("Trajanje 3 dana" → ends_on = starts_on + 2) --------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.treatments (pet_id, type, name, dose, interval_value, interval_unit, starts_on, ends_on, note)
    select 'c1000000-0000-4000-8000-000000000001', 'medication', 'Synulox 50 mg — Step 15', '½ tablete',
           12, 'hours', d + 2, d + 4, 'davati uz hranu' from t_today$$,
  'owner saves a treatment every 12 hours'
);
reset role;
create temp table t_hours on commit drop as
select id from public.treatments where name = 'Synulox 50 mg — Step 15';
grant select on t_hours to authenticated;

select is(
  (select created_by from public.treatments where id = (select id from t_hours)),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'created_by is the caller'
);
select is(
  (select row(user_id, type, recurrence, interval_value)::text from public.reminders where source_id = (select id from t_hours)),
  row('a1000000-0000-4000-8000-000000000001'::uuid, 'treatment_dose'::public.reminder_type,
      'hourly_interval'::public.reminder_recurrence, 12)::text,
  'FR-06: one treatment_dose reminder, every 12 hours, for the owner (FR-20)'
);
select is(
  (select starts_at from public.reminders where source_id = (select id from t_hours)),
  (select (d + 2 + time '08:00') at time zone 'Europe/Belgrade' from t_today),
  'BR-49: the first dose is on the start date at 08:00 Europe/Belgrade'
);
select is(
  (select ends_at from public.reminders where source_id = (select id from t_hours)),
  (select (d + 4 + time '23:59:59') at time zone 'Europe/Belgrade' from t_today),
  'the reminder ends at the end of ends_on'
);
select is(
  (select array_agg(o.due_at order by o.due_at) from public.reminder_occurrences o
   join public.reminders r on r.id = o.reminder_id where r.source_id = (select id from t_hours)),
  (select array_agg(((d + 2 + time '08:00') at time zone 'Europe/Belgrade') + make_interval(hours => 12 * i) order by i)
   from t_today, generate_series(0, 5) as i),
  'FR-06: six doses, 12 hours apart, from 08:00 on the start date'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = (select id from t_hours)
     and o.due_at > (select (d + 4 + time '23:59:59') at time zone 'Europe/Belgrade' from t_today)),
  0, 'FR-06: no dose after the end date'
);
select ok(
  (select bool_and(o.notify_at = o.due_at) from public.reminder_occurrences o
   join public.reminders r on r.id = o.reminder_id where r.source_id = (select id from t_hours)),
  'BR-13: doses are notified at their exact time'
);

-- Days: every 2 days for 7 days -------------------------------------------------------------------------
set local role authenticated;
select lives_ok(
  $$insert into public.treatments (pet_id, type, name, interval_value, interval_unit, starts_on, ends_on)
    select 'c1000000-0000-4000-8000-000000000001', 'flea_tick', 'Stronghold — Step 15', 2, 'days', d + 1, d + 7
    from t_today$$,
  'owner saves a treatment every 2 days'
);
reset role;
create temp table t_days on commit drop as
select id from public.treatments where name = 'Stronghold — Step 15';
grant select on t_days to authenticated;

select is(
  (select row(recurrence, interval_value)::text from public.reminders where source_id = (select id from t_days)),
  row('daily'::public.reminder_recurrence, 2)::text,
  'FR-06: days → a daily reminder with interval 2'
);
select is(
  (select array_agg(o.due_at order by o.due_at) from public.reminder_occurrences o
   join public.reminders r on r.id = o.reminder_id where r.source_id = (select id from t_days)),
  (select array_agg((d + 1 + 2 * i + time '08:00') at time zone 'Europe/Belgrade' order by i)
   from t_today, generate_series(0, 3) as i),
  'FR-06: a dose every 2 days at 08:00 until the end date (days 1, 3, 5, 7)'
);

-- No end date: the doses keep coming inside the 60-day window ----------------------------------------------
set local role authenticated;
select lives_ok(
  $$insert into public.treatments (pet_id, type, name, interval_value, interval_unit, starts_on)
    select 'c1000000-0000-4000-8000-000000000001', 'deworming', 'Milbemax — Step 15', 30, 'days', d + 1 from t_today$$,
  'owner saves a treatment without an end date'
);
reset role;
select is(
  (select row(r.ends_at, count(o.id))::text from public.reminders r
   left join public.reminder_occurrences o on o.reminder_id = r.id
   where r.source_id = (select id from public.treatments where name = 'Milbemax — Step 15')
   group by r.ends_at),
  row(null::timestamptz, 2::bigint)::text,
  'no end date → no ends_at; doses every 30 days in the rolling 60-day window'
);

-- Edit: a shorter course moves the end; occurrences past it are removed ------------------------------------
set local role authenticated;
select lives_ok(
  $$update public.treatments set ends_on = (select d + 2 from t_today) where id = (select id from t_hours)$$,
  'owner shortens the course to one day'
);
reset role;
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = (select id from t_hours)),
  2, 'FR-06: occurrences stop at the new ends_on (08:00 and 20:00)'
);
select is(
  (select starts_at from public.reminders where source_id = (select id from t_hours)),
  (select (d + 2 + time '08:00') at time zone 'Europe/Belgrade' from t_today),
  'the first dose stays where it was'
);

-- Delete: reminder and occurrences go ------------------------------------------------------------------------
create temp table t_hours_reminder on commit drop as
select id from public.reminders where source_id = (select id from t_hours);
set local role authenticated;
select lives_ok($$delete from public.treatments where id = (select id from t_hours)$$, 'owner deletes the treatment');
reset role;
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_hours)),
  0, 'deleting the treatment removes its reminder'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id in (select id from t_hours_reminder)),
  0, 'and its occurrences'
);

-- EP-10 Request checks ---------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, starts_on, ends_on)
    select 'c1000000-0000-4000-8000-000000000001', 'medication', 'Lek', d, d - 1 from t_today$$,
  '23514', null, 'EP-10: ends_on before starts_on is rejected (before_start)'
);
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, interval_value, starts_on)
    select 'c1000000-0000-4000-8000-000000000001', 'medication', 'Lek', 12, d from t_today$$,
  '23514', null, 'EP-10: interval_value without interval_unit is rejected'
);
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, interval_value, interval_unit, starts_on)
    select 'c1000000-0000-4000-8000-000000000001', 'medication', 'Lek', 0, 'hours', d from t_today$$,
  '23514', null, 'EP-10: interval_value must be > 0 (out_of_range)'
);
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, dose, starts_on)
    select 'c1000000-0000-4000-8000-000000000001', 'medication', 'Lek', repeat('a', 61), d from t_today$$,
  '23514', null, 'EP-10: dose ≤ 60 chars'
);
reset role;

-- Member: view only (FR-28) -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.treatments (pet_id, type, name, starts_on)
    select 'c1000000-0000-4000-8000-000000000001', 'medication', 'Lek', d from t_today$$,
  'P0001', 'forbidden_role', 'FR-28: a member cannot add a treatment'
);
reset role;

select * from finish();
rollback;
