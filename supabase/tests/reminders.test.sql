-- reminders and reminder_preferences (TC §5.5): enums, columns, indexes, the one-meal-
-- schedule-per-pet rule; BR-18 manual reminders (with and without a pet, recurrence
-- values, hourly_interval refused); dose_logs.occurrence_id FK (TC §5.3).
-- Seeded: Ivana (…01, owner of Luna c1…01 and Maks c1…02), Marko (…02, owner of Kiki c1…03).
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Enums ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'reminder_type',
  array['vaccination', 'treatment_dose', 'vet_follow_up', 'meal', 'birthday', 'manual', 'message'],
  'reminder types, plus message for reminder_preferences only (Step 28a owner decision)');
select enum_has_labels('public', 'reminder_recurrence',
  array['none', 'hourly_interval', 'daily', 'weekly', 'monthly', 'yearly'], 'recurrences');
select enum_has_labels('public', 'delivery_channel', array['email', 'push', 'whatsapp', 'viber'],
  'delivery channels');

-- reminders -----------------------------------------------------------------------------------
select columns_are('public', 'reminders', array[
  'id', 'user_id', 'pet_id', 'type', 'source_id', 'title', 'starts_at', 'recurrence', 'interval_value',
  'meal_times', 'meal_weekdays', 'ends_at', 'active', 'created_at', 'updated_at'
], 'reminders has the TC §5.5 columns');
select col_not_null('public', 'reminders', 'user_id', 'user_id is not null');
select col_is_null('public', 'reminders', 'pet_id', 'pet_id is nullable (BR-18)');
select col_type_is('public', 'reminders', 'type', 'reminder_type', 'type is reminder_type');
select col_not_null('public', 'reminders', 'type', 'type is not null');
select col_type_is('public', 'reminders', 'starts_at', 'timestamp with time zone', 'starts_at is timestamptz');
select col_type_is('public', 'reminders', 'recurrence', 'reminder_recurrence', 'recurrence is reminder_recurrence');
select col_type_is('public', 'reminders', 'meal_times', 'time without time zone[]', 'meal_times is time[]');
select col_type_is('public', 'reminders', 'meal_weekdays', 'smallint[]', 'meal_weekdays is smallint[]');
select col_type_is('public', 'reminders', 'ends_at', 'timestamp with time zone', 'ends_at is timestamptz');
select col_not_null('public', 'reminders', 'active', 'active is not null');
select col_default_is('public', 'reminders', 'active', 'true', 'active defaults to true');
select fk_ok('public', 'reminders', 'user_id', 'public', 'profiles', 'id', 'user_id → profiles');
select fk_ok('public', 'reminders', 'pet_id', 'public', 'pets', 'id', 'pet_id → pets');
select has_index('public', 'reminders', 'reminders_source_id_idx', array['source_id'], 'index (source_id) (E-01)');
select index_is_unique('public', 'reminders', 'reminders_one_meal_per_pet', 'meal index is unique');
select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
   where indexrelid = 'public.reminders_one_meal_per_pet'::regclass),
  '(type = ''meal''::reminder_type)', 'the unique index is partial on type = meal'
);
select ok((select relrowsecurity from pg_class where oid = 'public.reminders'::regclass), 'RLS on reminders');

-- One meal schedule per pet (EP-19).
select lives_ok(
  $$insert into public.reminders (user_id, pet_id, type, meal_times, meal_weekdays)
    values ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'meal',
            '{08:00,18:00}', '{1,2,3,4,5,6,7}')$$,
  'a pet gets a meal schedule'
);
select throws_ok(
  $$insert into public.reminders (user_id, pet_id, type, meal_times, meal_weekdays)
    values ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'meal',
            '{12:00}', '{1}')$$,
  '23505', null, 'a second meal schedule for the same pet is refused'
);
select throws_ok(
  $$insert into public.reminders (user_id, pet_id, type, meal_times, meal_weekdays)
    values ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'meal',
            '{08:00}', '{8}')$$,
  '23514', null, 'meal weekdays are 1–7'
);

-- reminder_preferences ------------------------------------------------------------------------
select columns_are('public', 'reminder_preferences', array[
  'id', 'user_id', 'type', 'lead_minutes', 'delivery_time', 'channels', 'created_at', 'updated_at'
], 'reminder_preferences has the TC §5.5 columns');
select col_type_is('public', 'reminder_preferences', 'lead_minutes', 'integer[]', 'lead_minutes is integer[]');
select col_type_is('public', 'reminder_preferences', 'delivery_time', 'time without time zone', 'delivery_time is time');
select col_type_is('public', 'reminder_preferences', 'channels', 'delivery_channel[]', 'channels is delivery_channel[]');
select col_is_unique('public', 'reminder_preferences', array['user_id', 'type'], 'unique (user_id, type)');
select fk_ok('public', 'reminder_preferences', 'user_id', 'public', 'profiles', 'id', 'user_id → profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.reminder_preferences'::regclass),
  'RLS on reminder_preferences');

-- dose_logs.occurrence_id FK (TC §5.3) ----------------------------------------------------------
select fk_ok('public', 'dose_logs', 'occurrence_id', 'public', 'reminder_occurrences', 'id',
  'dose_logs.occurrence_id → reminder_occurrences');

-- BR-18: manual reminders, as Ivana -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.reminders (type, title, pet_id, starts_at, recurrence)
    values ('manual', 'Šišanje', 'c1000000-0000-4000-8000-000000000002', now() + interval '3 days', 'none')$$,
  'a manual reminder linked to a pet (BR-18)'
);
select lives_ok(
  $$insert into public.reminders (type, title, starts_at, recurrence)
    values ('manual', 'Kupiti pesak', now() + interval '2 days', 'none')$$,
  'a manual reminder only for the user (BR-18)'
);
select lives_ok(
  $$insert into public.reminders (type, title, starts_at, recurrence) values
      ('manual', 'Dnevno', now() + interval '1 day', 'daily'),
      ('manual', 'Nedeljno', now() + interval '1 day', 'weekly'),
      ('manual', 'Mesečno', now() + interval '1 day', 'monthly'),
      ('manual', 'Godišnje', now() + interval '1 day', 'yearly')$$,
  'manual recurrences daily / weekly / monthly / yearly (BR-18)'
);
select throws_ok(
  $$insert into public.reminders (type, title, starts_at, recurrence)
    values ('manual', 'Na sat', now() + interval '1 day', 'hourly_interval')$$,
  '23514', null, 'hourly_interval is refused for manual reminders (BR-18, EP-27)'
);
select is(
  (select count(*)::int from public.reminders where type = 'manual' and title = 'Kupiti pesak' and pet_id is null),
  1, 'the user-only reminder has no pet'
);
select is(
  (select user_id from public.reminders where title = 'Šišanje'),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'user_id defaults to the caller (EP-27)'
);
select is(
  (select count(*)::int from public.reminder_occurrences o
   join public.reminders r on r.id = o.reminder_id where r.title = 'Kupiti pesak'),
  1, 'a manual reminder gets its occurrence on insert (EP-27)'
);
select throws_ok(
  $$update public.reminders set recurrence = 'hourly_interval' where title = 'Dnevno'$$,
  '23514', null, 'a manual reminder cannot be changed to hourly_interval'
);
select is(
  (select count(*)::int from public.reminders r where r.title = 'Godišnje' and r.recurrence = 'yearly'),
  1, 'the yearly reminder is stored'
);

select * from finish();
rollback;
