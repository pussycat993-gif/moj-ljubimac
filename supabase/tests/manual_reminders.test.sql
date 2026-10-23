-- Manual reminders (EP-27; BR-18; TC §5.5 occurrences). FR-21: a monthly manual reminder's occurrences fall
-- one calendar month apart on the Europe/Belgrade wall clock (NFR-02, across the October DST change);
-- editing regenerates the future pending occurrences and keeps done / missed history; deleting removes
-- the reminder (its occurrences cascade). Generated reminders are not addressable by the client.
-- Seeded (supabase/seed.sql): Ivana (…01, Luna c1…01), Jelena (…03, member of Ivana's household).
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

-- Create (S11 "Sačuvaj podsetnik"): Ivana, for Luna, tomorrow 09:00 Belgrade, monthly ---------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_rem on commit drop as
with ins as (
  insert into public.reminders (type, title, pet_id, starts_at, recurrence)
  select 'manual', 'Šišanje — Step 17', 'c1000000-0000-4000-8000-000000000001',
         ((d + 1)::timestamp + time '09:00') at time zone 'Europe/Belgrade', 'monthly'
  from t_today
  returning id, user_id
)
select * from ins;
reset role;

select is((select user_id::text from t_rem), 'a1000000-0000-4000-8000-000000000001', 'user_id defaults to the caller');

create temp table t_occ on commit drop as
select o.id, o.due_at, row_number() over (order by o.due_at) as n
from public.reminder_occurrences o where o.reminder_id = (select id from t_rem) and o.status = 'pending';

select is((select count(*)::int from t_occ), 2, 'two monthly occurrences fall inside the 60-day window');
select is(
  (select (due_at at time zone 'Europe/Belgrade')::text from t_occ where n = 1),
  (select ((d + 1)::timestamp + time '09:00')::text from t_today),
  'the first occurrence is at the start, 09:00 Belgrade'
);
select is(
  (select (due_at at time zone 'Europe/Belgrade') from t_occ where n = 2),
  (select (due_at at time zone 'Europe/Belgrade') + interval '1 month' from t_occ where n = 1),
  'FR-21: the next occurrence is one calendar month later, still 09:00 Belgrade (NFR-02)'
);

-- History before the edit: a done and a missed instance in the past.
insert into public.reminder_occurrences (reminder_id, due_at, notify_at, status, done_at, done_by)
select id, now() - interval '30 days', now() - interval '30 days', 'done', now() - interval '30 days',
       'a1000000-0000-4000-8000-000000000001' from t_rem;
insert into public.reminder_occurrences (reminder_id, due_at, notify_at, status)
select id, now() - interval '60 days', now() - interval '60 days', 'missed' from t_rem;

-- Edit (S11 "Sačuvaj izmene"): new title and the day after tomorrow at 10:00 ---------------------------------------
set local role authenticated;
update public.reminders
set title = 'Šišanje u Čupku — Step 17',
    starts_at = (select ((d + 2)::timestamp + time '10:00') at time zone 'Europe/Belgrade' from t_today)
where id = (select id from t_rem) and type = 'manual';
reset role;

select is(
  (select count(*)::int from public.reminder_occurrences where id in (select id from t_occ)),
  0, 'FR-21: the old future pending occurrences are gone'
);
select is(
  (select array_agg((due_at at time zone 'Europe/Belgrade')::text order by due_at)
   from public.reminder_occurrences where reminder_id = (select id from t_rem) and status = 'pending'),
  (select array[((d + 2)::timestamp + time '10:00')::text, (((d + 2)::timestamp + time '10:00') + interval '1 month')::text] from t_today),
  'FR-21: the future occurrences follow the new time, a month apart'
);
select is(
  (select array_agg(status::text order by due_at) from public.reminder_occurrences
   where reminder_id = (select id from t_rem) and status in ('done', 'missed')),
  array['missed', 'done'], 'FR-21: past history (done, missed) is kept'
);
select is(
  (select title from public.reminders where id = (select id from t_rem)), 'Šišanje u Čupku — Step 17', 'the title changes'
);

-- Changing the recurrence to none leaves one future occurrence.
set local role authenticated;
update public.reminders set recurrence = 'none' where id = (select id from t_rem) and type = 'manual';
reset role;
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = (select id from t_rem) and status = 'pending'),
  1, 'repeat "none" → a single future occurrence'
);

-- Generated reminders are not addressable through the manual path ---------------------------------------------------
set local role authenticated;
create temp table t_gen_delete on commit drop as
with del as (
  delete from public.reminders where type = 'manual' and id in (
    select r.id from public.reminders r where r.type = 'birthday' and r.pet_id = 'c1000000-0000-4000-8000-000000000001')
  returning id
)
select count(*)::int as n from del;
create temp table t_gen_update on commit drop as
with upd as (
  update public.reminders set title = 'x' where type = 'birthday' and pet_id = 'c1000000-0000-4000-8000-000000000001'
  returning id
)
select count(*)::int as n from upd;
reset role;
select is((select n from t_gen_delete) + (select n from t_gen_update), 0, 'a generated (birthday) reminder cannot be edited or deleted');

-- A member cannot touch the owner's reminder -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
create temp table t_member_delete on commit drop as
with del as (delete from public.reminders where id = (select id from t_rem) and type = 'manual' returning id)
select count(*)::int as n from del;
reset role;
select is((select n from t_member_delete), 0, 'another user cannot delete the reminder');

-- Delete (S11 "Obriši podsetnik") ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_delete on commit drop as
with del as (delete from public.reminders where id = (select id from t_rem) and type = 'manual' returning id)
select count(*)::int as n from del;
reset role;
select is((select n from t_delete), 1, 'FR-21: the owner deletes the manual reminder');
select is((select count(*)::int from public.reminders where id = (select id from t_rem)), 0, 'the reminder is gone');
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id = (select id from t_rem)),
  0, 'its occurrences cascade, so nothing more is sent'
);

select * from finish();
rollback;
