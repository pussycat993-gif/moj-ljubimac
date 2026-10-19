-- Reminders created from records (FR-20, BR-12), updated and removed with them (FR-05,
-- E-01), BR-49 first treatment dose, BR-17 memorial deactivation, BR-51 no automatic
-- reminders for organisation animals.
-- Seeded: Ivana (…01, Premium owner), Milica (…04, shelter admin; Žuća c1…04 is a shelter
-- animal). Runs as postgres (System); entries name their author.
begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

-- A fresh pet for Ivana, and "today" on the Belgrade calendar.
insert into public.pets (id, owner_id, name, species, sex)
values ('d8000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Rex', 'dog', 'male');

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;

-- Vaccinations (FR-05, FR-20, E-01) ------------------------------------------------------------
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by)
select 'd8000000-0000-4000-8000-000000000011', 'd8000000-0000-4000-8000-000000000001', 'Besnilo',
       d - 300, d + 20, 'a1000000-0000-4000-8000-000000000001' from t_today;
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by)
select 'd8000000-0000-4000-8000-000000000012', 'd8000000-0000-4000-8000-000000000001', 'Leptospiroza',
       d - 300, null, 'a1000000-0000-4000-8000-000000000001' from t_today;

select is(
  (select count(*)::int from public.reminders
   where type = 'vaccination' and source_id = 'd8000000-0000-4000-8000-000000000011'),
  1, 'a vaccination with a next-dose date creates a vaccination reminder (FR-20, BR-12)'
);
select is(
  (select row(user_id, pet_id, starts_at, recurrence, active)::text from public.reminders
   where source_id = 'd8000000-0000-4000-8000-000000000011'),
  (select row('a1000000-0000-4000-8000-000000000001'::uuid, 'd8000000-0000-4000-8000-000000000001'::uuid,
              (d + 20 + time '09:00') at time zone 'Europe/Belgrade', 'none'::public.reminder_recurrence, true)::text
   from t_today),
  'owned by the pet''s owner, due on next_due_on at the 09:00 delivery time (EP-09)'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'd8000000-0000-4000-8000-000000000011'),
  2, 'its occurrences exist: 7 days before and on the day (BR-48)'
);
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000012'),
  0, 'a vaccination without a next-dose date creates no reminder'
);

update public.vaccinations set next_due_on = (select d + 30 from t_today)
where id = 'd8000000-0000-4000-8000-000000000011';
select is(
  (select starts_at from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000011'),
  (select (d + 30 + time '09:00') at time zone 'Europe/Belgrade' from t_today),
  'editing the next-dose date moves the reminder (FR-05)'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'd8000000-0000-4000-8000-000000000011'
     and o.due_at <> (select (d + 30 + time '09:00') at time zone 'Europe/Belgrade' from t_today)),
  0, 'and its pending occurrences follow the new date (FR-05)'
);
select is(
  (select count(*)::int from public.reminders where type = 'vaccination' and pet_id = 'd8000000-0000-4000-8000-000000000001'),
  1, 'still exactly one reminder for the vaccination'
);

update public.vaccinations set next_due_on = (select d + 10 from t_today)
where id = 'd8000000-0000-4000-8000-000000000012';
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000012'),
  1, 'setting a next-dose date later creates the reminder'
);

update public.vaccinations set next_due_on = null where id = 'd8000000-0000-4000-8000-000000000011';
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000011'),
  0, 'clearing the next-dose date removes the reminder (FR-05, E-01)'
);

create temp table t_removed as
select id from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000012';
delete from public.vaccinations where id = 'd8000000-0000-4000-8000-000000000012';
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000012'),
  0, 'deleting the vaccination removes the reminder (FR-05, E-01)'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id in (select id from t_removed)),
  0, 'and its occurrences'
);

-- Treatments (FR-06, FR-20, BR-49) ----------------------------------------------------------
insert into public.treatments (
  id, pet_id, type, name, interval_value, interval_unit, starts_on, ends_on, created_by
)
select 'd8000000-0000-4000-8000-000000000021', 'd8000000-0000-4000-8000-000000000001', 'medication',
       'Antibiotik', 8, 'hours', d + 5, d + 6, 'a1000000-0000-4000-8000-000000000001' from t_today;

select is(
  (select row(user_id, starts_at, recurrence, interval_value, ends_at)::text from public.reminders
   where type = 'treatment_dose' and source_id = 'd8000000-0000-4000-8000-000000000021'),
  (select row('a1000000-0000-4000-8000-000000000001'::uuid,
              (d + 5 + time '08:00') at time zone 'Europe/Belgrade', 'hourly_interval'::public.reminder_recurrence,
              8, (d + 6 + time '23:59:59') at time zone 'Europe/Belgrade')::text from t_today),
  'a treatment with a frequency creates a dose reminder: start date 08:00, every 8 hours, until the end date (FR-06, BR-49)'
);
select is(
  (select min(o.due_at) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'd8000000-0000-4000-8000-000000000021'),
  (select (d + 5 + time '08:00') at time zone 'Europe/Belgrade' from t_today),
  'the first dose occurrence is at 08:00 on the start date (BR-49)'
);
select ok(
  (select max(o.due_at) <= (select (d + 6 + time '23:59:59') at time zone 'Europe/Belgrade' from t_today)
   from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'd8000000-0000-4000-8000-000000000021'),
  'no dose after the end date (FR-06)'
);
select ok(
  (select bool_and(o.notify_at = o.due_at) and count(*) >= 4
   from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'd8000000-0000-4000-8000-000000000021'),
  'doses are notified at their exact time, every 8 hours (BR-13)'
);

update public.treatments set interval_value = 2, interval_unit = 'days'
where id = 'd8000000-0000-4000-8000-000000000021';
select is(
  (select row(recurrence, interval_value, starts_at)::text from public.reminders
   where source_id = 'd8000000-0000-4000-8000-000000000021'),
  (select row('daily'::public.reminder_recurrence, 2,
              (d + 5 + time '08:00') at time zone 'Europe/Belgrade')::text from t_today),
  'changing the frequency to days updates the reminder and keeps the first dose'
);

insert into public.treatments (id, pet_id, type, name, starts_on, created_by)
select 'd8000000-0000-4000-8000-000000000022', 'd8000000-0000-4000-8000-000000000001', 'deworming',
       'Milbemax', d + 3, 'a1000000-0000-4000-8000-000000000001' from t_today;
select is(
  (select row(recurrence, interval_value)::text from public.reminders
   where source_id = 'd8000000-0000-4000-8000-000000000022'),
  row('none'::public.reminder_recurrence, null::integer)::text,
  'a treatment without a frequency gets a single dose reminder (EP-10)'
);

-- BR-49: start today → 08:00 if still ahead, else the next full hour.
insert into public.treatments (id, pet_id, type, name, interval_value, interval_unit, starts_on, created_by)
select 'd8000000-0000-4000-8000-000000000023', 'd8000000-0000-4000-8000-000000000001', 'medication',
       'Kapi', 12, 'hours', d, 'a1000000-0000-4000-8000-000000000001' from t_today;
select is(
  (select starts_at from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000023'),
  (select case
     when ((d + time '08:00') at time zone 'Europe/Belgrade') > now() then (d + time '08:00') at time zone 'Europe/Belgrade'
     else date_trunc('hour', now()) + interval '1 hour'
   end from t_today),
  'a treatment starting today: first dose at 08:00 or the next full hour (BR-49)'
);
select is(
  private.treatment_first_dose_at('2026-11-10', '2026-11-01 10:00:00+01'),
  '2026-11-10 08:00:00+01'::timestamptz, 'BR-49: start date in the future → 08:00 Belgrade'
);
select is(
  private.treatment_first_dose_at('2026-11-10', '2026-11-10 06:30:00+01'),
  '2026-11-10 08:00:00+01'::timestamptz, 'BR-49: start today before 08:00 → 08:00 Belgrade'
);
select is(
  private.treatment_first_dose_at('2026-11-10', '2026-11-10 10:20:00+01'),
  '2026-11-10 11:00:00+01'::timestamptz, 'BR-49: start today after 08:00 → the next full hour'
);
select is(
  private.treatment_first_dose_at('2026-07-10', '2026-07-10 08:00:00+02'),
  '2026-07-10 09:00:00+02'::timestamptz, 'BR-49: exactly 08:00 has passed → 09:00 (summer time)'
);

delete from public.treatments where id = 'd8000000-0000-4000-8000-000000000022';
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000022'),
  0, 'deleting the treatment removes its reminder'
);

-- Vet visits (FR-07, FR-20) -------------------------------------------------------------------
insert into public.vet_visits (id, pet_id, visited_on, reason, follow_up_on, created_by)
select 'd8000000-0000-4000-8000-000000000031', 'd8000000-0000-4000-8000-000000000001', d - 1,
       'Šepanje', d + 14, 'a1000000-0000-4000-8000-000000000001' from t_today;
select is(
  (select row(type, starts_at, recurrence)::text from public.reminders
   where source_id = 'd8000000-0000-4000-8000-000000000031'),
  (select row('vet_follow_up'::public.reminder_type, (d + 14 + time '09:00') at time zone 'Europe/Belgrade',
              'none'::public.reminder_recurrence)::text from t_today),
  'a vet visit with a check-up date creates a follow-up reminder (FR-07, BR-12)'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'd8000000-0000-4000-8000-000000000031'),
  2, 'one day before and on the day (BR-48)'
);
update public.vet_visits set follow_up_on = (select d + 21 from t_today)
where id = 'd8000000-0000-4000-8000-000000000031';
select is(
  (select starts_at from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000031'),
  (select (d + 21 + time '09:00') at time zone 'Europe/Belgrade' from t_today),
  'changing the check-up date moves the reminder'
);
update public.vet_visits set follow_up_on = null where id = 'd8000000-0000-4000-8000-000000000031';
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000031'),
  0, 'clearing the check-up date removes the reminder'
);
update public.vet_visits set follow_up_on = (select d + 7 from t_today)
where id = 'd8000000-0000-4000-8000-000000000031';
delete from public.vet_visits where id = 'd8000000-0000-4000-8000-000000000031';
select is(
  (select count(*)::int from public.reminders where source_id = 'd8000000-0000-4000-8000-000000000031'),
  0, 'deleting the visit removes the reminder'
);

-- Birthdays (FR-09, FR-20) -------------------------------------------------------------------
update public.pets set birth_date = '2024-05-03' where id = 'd8000000-0000-4000-8000-000000000001';
select is(
  (select row(user_id, starts_at, recurrence)::text from public.reminders
   where type = 'birthday' and pet_id = 'd8000000-0000-4000-8000-000000000001'),
  row('a1000000-0000-4000-8000-000000000001'::uuid,
      timestamptz '2024-05-03 09:00:00+02', 'yearly'::public.reminder_recurrence)::text,
  'a date of birth creates a yearly birthday reminder (FR-09, BR-12)'
);
update public.pets set birth_date = '2024-06-01' where id = 'd8000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int || ' ' || min(starts_at)::text from public.reminders
   where type = 'birthday' and pet_id = 'd8000000-0000-4000-8000-000000000001'),
  '1 ' || timestamptz '2024-06-01 09:00:00+02'::text,
  'changing the date of birth moves the single birthday reminder'
);
update public.pets set birth_date = null where id = 'd8000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.reminders where type = 'birthday' and pet_id = 'd8000000-0000-4000-8000-000000000001'),
  0, 'clearing the date of birth removes it'
);
insert into public.pets (id, owner_id, name, species, sex, birth_date)
values ('d8000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Bubi', 'cat', 'female', '2025-01-15');
select is(
  (select count(*)::int from public.reminders where type = 'birthday' and pet_id = 'd8000000-0000-4000-8000-000000000002'),
  1, 'a new pet with a date of birth gets a birthday reminder'
);

-- BR-17: memorial ------------------------------------------------------------------------------
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by)
select 'd8000000-0000-4000-8000-000000000013', 'd8000000-0000-4000-8000-000000000001', 'Parvo',
       d - 300, d + 15, 'a1000000-0000-4000-8000-000000000001' from t_today;
select ok(
  (select count(*) > 0 from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'd8000000-0000-4000-8000-000000000001' and o.status = 'pending'),
  'before memorial the pet has pending occurrences'
);
-- One sent row stays as history.
update public.reminder_occurrences o set status = 'sent', sent_at = now()
from public.reminders r
where o.reminder_id = r.id and r.source_id = 'd8000000-0000-4000-8000-000000000021'
  and o.due_at = (select min(o2.due_at) from public.reminder_occurrences o2 where o2.reminder_id = r.id);

update public.pets set lifecycle = 'memorial' where id = 'd8000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.reminders where pet_id = 'd8000000-0000-4000-8000-000000000001' and active),
  0, 'moving a pet to memorial deactivates all its reminders (BR-17)'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'd8000000-0000-4000-8000-000000000001' and o.status = 'pending'),
  0, 'and removes their pending occurrences (BR-17)'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'd8000000-0000-4000-8000-000000000001' and o.status = 'sent'),
  1, 'sent history stays'
);
select lives_ok(
  $$select private.generate_all_reminder_occurrences()$$, 'the nightly refresh runs'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'd8000000-0000-4000-8000-000000000001' and o.status = 'pending'),
  0, 'inactive reminders produce no pending occurrences (BR-17)'
);
insert into public.vaccinations (pet_id, name, given_on, next_due_on, created_by)
select 'd8000000-0000-4000-8000-000000000001', 'Kašalj', d - 10, d + 9,
       'a1000000-0000-4000-8000-000000000001' from t_today;
select is(
  (select row(count(*), bool_or(active))::text from public.reminders
   where pet_id = 'd8000000-0000-4000-8000-000000000001' and type = 'vaccination'),
  row(2::bigint, false)::text,
  'a record added to a memorial pet gets an inactive reminder (BR-17)'
);
update public.reminders set active = true where pet_id = 'd8000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.reminders where pet_id = 'd8000000-0000-4000-8000-000000000001' and active),
  0, 'a reminder on a memorial pet cannot be switched on (BR-17)'
);

-- BR-51: organisation animals get no automatic reminders --------------------------------------
insert into public.vaccinations (pet_id, name, given_on, next_due_on, created_by)
select 'c1000000-0000-4000-8000-000000000004', 'Besnilo', d - 1, d + 30,
       'a1000000-0000-4000-8000-000000000004' from t_today;
insert into public.treatments (pet_id, type, name, interval_value, interval_unit, starts_on, created_by)
select 'c1000000-0000-4000-8000-000000000004', 'deworming', 'Drontal', 1, 'days', d + 1,
       'a1000000-0000-4000-8000-000000000004' from t_today;
insert into public.vet_visits (pet_id, visited_on, reason, follow_up_on, created_by)
select 'c1000000-0000-4000-8000-000000000004', d - 1, 'Prijem', d + 7,
       'a1000000-0000-4000-8000-000000000004' from t_today;
update public.pets set birth_date = '2026-04-01' where id = 'c1000000-0000-4000-8000-000000000004';
insert into public.pets (organisation_id, name, species, sex, birth_date, shelter_status)
values ('b2000000-0000-4000-8000-000000000001', 'Mrki', 'dog', 'male', '2025-03-01', 'intake');

select is(
  (select count(*)::int from public.reminders r join public.pets p on p.id = r.pet_id
   where p.organisation_id is not null),
  0, 'organisation animals get no vaccination, treatment, follow-up or birthday reminders (BR-51)'
);
select is(
  (select count(*)::int from public.reminders where user_id = 'a1000000-0000-4000-8000-000000000004'),
  0, 'the shelter admin has no reminders (BR-51)'
);
select is(
  (select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000004'),
  0, 'none on the seeded shelter animal'
);

select * from finish();
rollback;
