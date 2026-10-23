-- EP-09 vaccinations through the Data API as their callers write them, and the linked `vaccination`
-- reminder (FR-05, FR-20, E-01): saved with next_due_on → reminder created; next_due_on moved →
-- reminder and occurrences moved; cleared or the row deleted → reminder and occurrences removed.
-- Also the EP-09 Request checks and the member rule (FR-28: view only → forbidden_role).
-- Seeded (supabase/seed.sql): Ivana (…01, Luna), Jelena (…03, member of Ivana's household, Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

-- Owner saves a vaccination with a next dose (S04) ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.vaccinations (pet_id, name, given_on, next_due_on, clinic, batch_number)
    select 'c1000000-0000-4000-8000-000000000001', 'Besnilo — Step 14',
           d, d + 40, 'Veterinarska ambulanta „Dr Vet”', 'RB-26-1019' from t_today$$,
  'owner saves a vaccination with next_due_on'
);
reset role;
-- The id is set by the database (not a client column); the rest of the file reads it from here.
create temp table t_vax on commit drop as
select id from public.vaccinations where name = 'Besnilo — Step 14';
grant select on t_vax to authenticated;

select is(
  (select created_by from public.vaccinations where id = (select id from t_vax)),
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'created_by is the caller'
);
select is(
  (select count(*)::int from public.reminders where type = 'vaccination' and source_id = (select id from t_vax)),
  1, 'FR-05: saving it creates the vaccination reminder automatically (FR-20)'
);
select is(
  (select row(user_id, pet_id, starts_at, active)::text from public.reminders
   where type = 'vaccination' and source_id = (select id from t_vax)),
  (select row('a1000000-0000-4000-8000-000000000001'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid,
              (d + 40 + time '09:00') at time zone 'Europe/Belgrade', true)::text from t_today),
  'the reminder is the owner''s, on next_due_on at the vaccination delivery time'
);
select ok(
  (select count(*) > 0 from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = (select id from t_vax)),
  'its occurrences are generated'
);

-- Owner moves the next dose (S03 → edit route) ---------------------------------------------------------
set local role authenticated;
select lives_ok(
  $$update public.vaccinations set next_due_on = (select d + 50 from t_today)
    where id = (select id from t_vax)$$,
  'owner edits next_due_on'
);
reset role;
select is(
  (select starts_at from public.reminders where source_id = (select id from t_vax)),
  (select (d + 50 + time '09:00') at time zone 'Europe/Belgrade' from t_today),
  'FR-05 / E-01: the reminder moves to the new date'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = (select id from t_vax)
     and o.due_at <> (select (d + 50 + time '09:00') at time zone 'Europe/Belgrade' from t_today)),
  0, 'FR-05 / E-01: its occurrences follow the new date'
);
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_vax)),
  1, 'still exactly one reminder for the vaccination'
);

-- Owner clears the next dose ------------------------------------------------------------------------------
create temp table t_reminder on commit drop as
select id from public.reminders where source_id = (select id from t_vax);
set local role authenticated;
select lives_ok(
  $$update public.vaccinations set next_due_on = null where id = (select id from t_vax)$$,
  'owner clears next_due_on'
);
reset role;
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_vax)),
  0, 'FR-05 / E-01: clearing it removes the reminder'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id in (select id from t_reminder)),
  0, 'FR-05 / E-01: and its occurrences'
);

-- Owner deletes a vaccination with a next dose (S03 row menu → "Da, obriši") -------------------------------
set local role authenticated;
select lives_ok(
  $$update public.vaccinations set next_due_on = (select d + 30 from t_today)
    where id = (select id from t_vax)$$,
  'owner sets a next dose again'
);
reset role;
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_vax)),
  1, 'setting it again recreates the reminder'
);
create temp table t_reminder2 on commit drop as
select id from public.reminders where source_id = (select id from t_vax);
set local role authenticated;
select lives_ok(
  $$delete from public.vaccinations where id = (select id from t_vax)$$,
  'owner deletes the vaccination'
);
reset role;
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_vax)),
  0, 'FR-05 / E-01: deleting the vaccination removes the reminder'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id in (select id from t_reminder2)),
  0, 'FR-05 / E-01: and its occurrences'
);

-- EP-09 Request checks ---------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on, next_due_on)
    select 'c1000000-0000-4000-8000-000000000001', 'Besnilo', d, d from t_today$$,
  '23514', null, 'EP-09: next_due_on must be after given_on (before_start)'
);
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    select 'c1000000-0000-4000-8000-000000000001', repeat('a', 101), d from t_today$$,
  '23514', null, 'EP-09: name ≤ 100 chars'
);
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on, batch_number)
    select 'c1000000-0000-4000-8000-000000000001', 'Besnilo', d, repeat('a', 61) from t_today$$,
  '23514', null, 'EP-09: batch_number ≤ 60 chars'
);
reset role;

-- Member: view only (FR-28) -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    select 'c1000000-0000-4000-8000-000000000001', 'Besnilo', d from t_today$$,
  'P0001', 'forbidden_role', 'FR-28: a member cannot add a vaccination'
);
select throws_ok(
  $$update public.vaccinations set clinic = 'X' where pet_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28: a member cannot change a vaccination'
);
reset role;

select * from finish();
rollback;
