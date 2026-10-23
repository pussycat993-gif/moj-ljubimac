-- FR-09 / FR-20: a pet saved with a date of birth gets a yearly birthday reminder. Written through
-- the same pets columns S02 sends (EP-03 insert, EP-04 update) as an owner's session; the
-- Step 08 trigger creates, recreates and removes the reminder.
-- Seeded: Jelena (…03, Free owner with no own pet), Nikola (…05, breeder admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- EP-03 insert with birth_date (the S02 create payload).
insert into public.pets (
  owner_id, name, species, species_other, sex, breed, colour_markings, microchip_number,
  passport_number, birth_date, birth_year, neutered, vet_name, vet_phone, weight_unit, note
) values (
  'a1000000-0000-4000-8000-000000000003', 'Mica', 'cat', null,
  'female', null, null, null, null, '2024-05-20', null, 'unknown', null, null, 'kg', null
);
reset role;

select is(
  (select count(*)::int from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  1, 'FR-09: saving a pet with a date of birth creates one birthday reminder'
);
select is(
  (select recurrence::text from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  'yearly', 'the birthday reminder repeats yearly'
);
select is(
  (select user_id from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'the reminder belongs to the pet''s owner'
);
select is(
  (select (starts_at at time zone 'Europe/Belgrade')::date from public.reminders
   where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  '2024-05-20'::date, 'it starts on the date of birth'
);
select is(
  (select (starts_at at time zone 'Europe/Belgrade')::time from public.reminders
   where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  '09:00'::time, 'at the owner''s birthday delivery time (default 09:00)'
);
select is(
  (select active from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  true, 'the reminder is active'
);

-- Occurrences follow the rolling 60-day window (TC §5.5).
select ok(
  not exists (
    select 1 from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
    where r.user_id = 'a1000000-0000-4000-8000-000000000003' and r.type = 'birthday'
      and o.due_at > now() + interval '61 days'
  ),
  'birthday occurrences stay inside the rolling 60-day window'
);

-- EP-04 update of birth_date → the reminder is recreated for the new date (still one).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
update public.pets set birth_date = '2024-11-02', birth_year = null where id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003');
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  1, 'a changed date of birth keeps one birthday reminder'
);
select is(
  (select (starts_at at time zone 'Europe/Belgrade')::date from public.reminders
   where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  '2024-11-02'::date, 'the reminder follows the new date of birth'
);

-- Saving other fields leaves the reminder alone.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
update public.pets set name = 'Mica Maca', breed = 'Mešanac' where id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003');
reset role;
select is(
  (select (starts_at at time zone 'Europe/Belgrade')::date from public.reminders
   where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  '2024-11-02'::date, 'editing other fields keeps the birthday reminder'
);

-- Switching to an approximate year (S02 "Znam okvirnu godinu") clears birth_date → removed.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
update public.pets set birth_date = null, birth_year = 2024 where id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003');
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  0, 'clearing the date of birth removes the birthday reminder'
);

-- Setting a date again creates it again.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
update public.pets set birth_date = '2024-06-01', birth_year = null where id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003');
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003') and type = 'birthday'),
  1, 'setting a date of birth again recreates the reminder'
);

-- A pet with only an approximate year gets no birthday reminder.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
delete from public.pets where id = (select id from public.pets where name in ('Mica', 'Mica Maca') and owner_id = 'a1000000-0000-4000-8000-000000000003');
insert into public.pets (owner_id, name, species, sex, birth_year)
values ('a1000000-0000-4000-8000-000000000003', 'Bobi', 'dog', 'male', 2021);
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = (select id from public.pets where name = 'Bobi' and owner_id = 'a1000000-0000-4000-8000-000000000003')),
  0, 'an approximate year alone creates no birthday reminder'
);
select is(
  (select count(*)::int from public.reminders where user_id = 'a1000000-0000-4000-8000-000000000003' and type = 'birthday'),
  0, 'deleting the pet removed its birthday reminder'
);

-- Organisation animals get no automatic reminders (BR-51).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
insert into public.pets (organisation_id, name, species, sex, birth_date, breeding_status)
values ('b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'female', '2023-03-03', 'active');
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = (select id from public.pets where name = 'Bela' and organisation_id = 'b2000000-0000-4000-8000-000000000002')),
  0, 'an organisation animal with a date of birth gets no birthday reminder'
);

-- The birthday occurrence is visible as the pet's next reminder on EP-01 when it is the earliest.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
update public.pets set birth_year = null, birth_date = ((now() at time zone 'Europe/Belgrade')::date + 5 - interval '3 years')::date
where id = (select id from public.pets where name = 'Bobi' and owner_id = 'a1000000-0000-4000-8000-000000000003');
select is(
  (select next_reminder ->> 'type' from public.pet_summaries_api where id = (select id from public.pets where name = 'Bobi' and owner_id = 'a1000000-0000-4000-8000-000000000003')),
  'birthday', 'EP-01 next_reminder is the coming birthday (title null — the UI builds "Rođendan — {pet}")'
);
reset role;

select * from finish();
rollback;
