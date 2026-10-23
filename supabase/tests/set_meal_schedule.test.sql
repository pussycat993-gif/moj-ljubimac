-- rpc:set_meal_schedule and view:meal_schedules_api (EP-19; API §6 MealSchedule).
-- FR-15: meal times (08:00 and 18:00) on chosen weekdays create one meal reminder whose occurrences
-- fall at each exact time (BR-13) on each selected day in Europe/Belgrade; saving again keeps the one
-- reminder per pet; empty times remove it with its occurrences. Owner only: member → forbidden_role;
-- no relation → not_found; memorial pet → validation_failed p_pet_id:invalid_state (BR-17).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium; Luna c1…01, Maks c1…02), Marko (…02, Free; Kiki
-- c1…03), Jelena (…03, member of Ivana's household, Luna shared, reminders not switched on), Milica
-- (…04, admin of the shelter holding Žuća c1…04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- The error of a statement as '<message> <detail>' (field codes travel in DETAIL); null if it succeeds.
create function pg_temp.error_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_message text;
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail;
  return v_message || coalesce(' ' || nullif(v_detail, ''), '');
end;
$$;

-- The due times FR-15 expects inside the 60-day occurrence window: each time on each chosen weekday,
-- on the Europe/Belgrade wall clock.
create function pg_temp.expected_due(p_times time[], p_days int[])
returns timestamptz[]
language sql
stable
as $$
  select coalesce(array_agg(ts order by ts), '{}')
  from (
    select (d::date + t) at time zone 'Europe/Belgrade' as ts
    from generate_series((now() at time zone 'Europe/Belgrade')::date - 1,
                         (now() at time zone 'Europe/Belgrade')::date + 61, interval '1 day') d
    cross join unnest(p_times) t
    where extract(isodow from d)::int = any (p_days)
  ) x
  where ts > now() and ts <= now() + interval '60 days';
$$;

select has_function('public', 'set_meal_schedule', array['uuid', 'time without time zone[]', 'smallint[]'], 'rpc:set_meal_schedule exists');
select ok(
  not has_function_privilege('anon', 'public.set_meal_schedule(uuid, time[], smallint[])', 'execute'),
  'anon cannot call set_meal_schedule'
);
select ok(
  has_function_privilege('authenticated', 'public.set_meal_schedule(uuid, time[], smallint[])', 'execute'),
  'authenticated can call set_meal_schedule'
);
select has_view('public', 'meal_schedules_api', 'view:meal_schedules_api exists');
select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.meal_schedules_api'::regclass),
  'meal_schedules_api is security_invoker (RLS on pets decides which pets are visible)'
);
select columns_are('public', 'meal_schedules_api',
  array['pet_id', 'reminder_id', 'meal_times', 'meal_weekdays', 'every_day', 'active'],
  'meal_schedules_api has the MealSchedule fields'
);
select ok(not has_table_privilege('anon', 'public.meal_schedules_api', 'select'), 'anon cannot read meal_schedules_api');

-- Owner (Ivana): 08:00 and 18:00 on Monday, Wednesday, Friday ----------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.meal_schedules_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'no schedule yet: EP-19 get returns no row'
);
create temp table first_save on commit drop as
select public.set_meal_schedule(
  'c1000000-0000-4000-8000-000000000001', array['18:00', '08:00']::time[], array[5, 1, 3]::smallint[]
) as s;
reset role;

select is(
  (select s - 'reminder_id' from first_save),
  '{"pet_id": "c1000000-0000-4000-8000-000000000001", "meal_times": ["08:00", "18:00"], "meal_weekdays": [1, 3, 5], "every_day": false, "active": true}'::jsonb,
  'set returns the MealSchedule with times and weekdays ascending'
);
select is(
  (select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001' and type = 'meal'),
  1, 'FR-15: one meal reminder exists for the pet'
);
select is(
  (select row(r.id, r.user_id, r.active, r.meal_times, r.meal_weekdays)::text
   from public.reminders r where r.pet_id = 'c1000000-0000-4000-8000-000000000001' and r.type = 'meal'),
  row((select (s ->> 'reminder_id')::uuid from first_save), 'a1000000-0000-4000-8000-000000000001'::uuid, true,
      array['08:00', '18:00']::time[], array[1, 3, 5]::smallint[])::text,
  'the meal reminder belongs to the owner, is active and stores the schedule'
);
select is(
  (select array_agg(o.due_at order by o.due_at) from public.reminder_occurrences o
   where o.reminder_id = (select (s ->> 'reminder_id')::uuid from first_save)),
  pg_temp.expected_due(array['08:00', '18:00']::time[], array[1, 3, 5]),
  'FR-15: an occurrence at 08:00 and at 18:00 Belgrade time on every selected weekday in the window'
);
select ok(
  (select count(*) > 0 and bool_and(o.notify_at = o.due_at and o.status = 'pending')
   from public.reminder_occurrences o
   where o.reminder_id = (select (s ->> 'reminder_id')::uuid from first_save)),
  'BR-13: meals are notified at the exact time (notify_at = due_at)'
);
select ok(
  (select bool_and(extract(isodow from o.due_at at time zone 'Europe/Belgrade') in (1, 3, 5)
                   and to_char(o.due_at at time zone 'Europe/Belgrade', 'HH24:MI') in ('08:00', '18:00'))
   from public.reminder_occurrences o
   where o.reminder_id = (select (s ->> 'reminder_id')::uuid from first_save)),
  'no occurrence on an unselected day or at another time'
);

-- Saving again: every day at 07:30 — still one reminder, occurrences regenerated ---------------------
set local role authenticated;
create temp table second_save on commit drop as
select public.set_meal_schedule(
  'c1000000-0000-4000-8000-000000000001', array['07:30']::time[], array[1, 2, 3, 4, 5, 6, 7]::smallint[]
) as s;
create temp table owner_view on commit drop as
select * from public.meal_schedules_api where pet_id = 'c1000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select s ->> 'reminder_id' from second_save), (select s ->> 'reminder_id' from first_save),
  'the same meal reminder is updated (one per pet)'
);
select is((select (s ->> 'every_day')::boolean from second_save), true, 'all seven weekdays → every_day');
select is(
  (select array_agg(o.due_at order by o.due_at) from public.reminder_occurrences o
   where o.reminder_id = (select (s ->> 'reminder_id')::uuid from second_save)),
  pg_temp.expected_due(array['07:30']::time[], array[1, 2, 3, 4, 5, 6, 7]),
  'the future occurrences follow the new schedule (old times and days are gone)'
);
select is(
  (select row(reminder_id, meal_times, meal_weekdays, every_day, active)::text from owner_view),
  row((select (s ->> 'reminder_id')::uuid from first_save), array['07:30'], array[1, 2, 3, 4, 5, 6, 7], true, true)::text,
  'EP-19 get: the owner reads the schedule through meal_schedules_api'
);

-- Household member (Jelena): sees the schedule, cannot change it --------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select meal_times from public.meal_schedules_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  array['07:30'], 'EP-19 get: a member sees the shared pet''s schedule (read only), reminders switched on or not'
);
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', array['09:00']::time[], array[1]::smallint[])$$),
  'forbidden_role', 'EP-19 set: a member → forbidden_role'
);
reset role;

-- No relation: another owner and an organisation admin --------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.meal_schedules_api where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'a user with no relation sees no schedule'
);
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', array['09:00']::time[], array[1]::smallint[])$$),
  'not_found', 'a user with no relation → not_found'
);
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000004', array['09:00']::time[], array[1]::smallint[])$$),
  'not_found', 'an organisation animal has no meal schedule → not_found'
);
reset role;

-- Request rules ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', null, array[1]::smallint[])$$),
  'validation_failed p_meal_times:required', 'times are required'
);
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001',
    array['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00']::time[], array[1]::smallint[])$$),
  'validation_failed p_meal_times:out_of_range', 'at most 6 times'
);
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', array['08:00', '08:00']::time[], array[1]::smallint[])$$),
  'validation_failed p_meal_times:invalid', 'times must be distinct'
);
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', array['08:00']::time[], array[]::smallint[])$$),
  'validation_failed p_meal_weekdays:required', 'weekdays are required with times'
);
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', array['08:00']::time[], array[1, 8]::smallint[])$$),
  'validation_failed p_meal_weekdays:invalid', 'weekdays are 1…7'
);

-- Empty times remove the schedule and its occurrences ------------------------------------------------------
create temp table removed on commit drop as
select public.set_meal_schedule('c1000000-0000-4000-8000-000000000001', array[]::time[], null) as s;
reset role;
select is(
  (select s from removed),
  '{"pet_id": "c1000000-0000-4000-8000-000000000001", "reminder_id": null, "meal_times": [], "meal_weekdays": [], "every_day": false, "active": false}'::jsonb,
  'empty times → MealSchedule with reminder_id null and empty arrays'
);
select is(
  (select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001' and type = 'meal'),
  0, 'the meal reminder is deleted'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = (select (s ->> 'reminder_id')::uuid from first_save)),
  0, 'its occurrences are deleted with it'
);

-- Memorial pet (BR-17) ----------------------------------------------------------------------------------
update public.pets set lifecycle = 'memorial' where id = 'c1000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(
  pg_temp.error_of($$select public.set_meal_schedule('c1000000-0000-4000-8000-000000000002', array['08:00']::time[], array[1]::smallint[])$$),
  'validation_failed p_pet_id:invalid_state', 'a memorial pet → validation_failed p_pet_id:invalid_state'
);
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000002' and type = 'meal'),
  0, 'no meal reminder is created for the memorial pet'
);

select * from finish();
rollback;
