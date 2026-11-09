-- Step FX, D-01 (Step 32): the seed must leave Luna with reminder occurrences inside the 60-day
-- generation window on any reset day. Before the fix, the seed's fixed dates (Besnilo due
-- 2026-10-26, Tobrex 2026-10-15 … 2026-10-25, follow-up 2026-10-30) were in the past, so a reset
-- after 2026-10-31 produced Luna's reminders with no occurrences and six pgTAP files failed.
-- The checks allow for a long-lived local database (a few days after the reset).
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  (select next_due_on >= (now() at time zone 'Europe/Belgrade')::date
     from public.vaccinations where name = 'Besnilo — Rabisin'),
  'seed: Besnilo is due today or later'
);
select ok(
  (select next_due_on > given_on from public.vaccinations where name = 'Besnilo — Rabisin'),
  'seed: Besnilo next_due_on is after given_on'
);
select ok(
  (select starts_on <= (now() at time zone 'Europe/Belgrade')::date
     from public.treatments where id = 'c2000000-0000-4000-8000-000000000001'),
  'seed: the Tobrex treatment has started'
);
select ok(
  (select follow_up_on > visited_on and visited_on <= (now() at time zone 'Europe/Belgrade')::date
     from public.vet_visits where id = 'c3000000-0000-4000-8000-000000000001'),
  'seed: the vet visit is in the past and its follow-up after it'
);
select ok(
  (select count(*) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
    where r.pet_id = 'c1000000-0000-4000-8000-000000000001'
      and r.type = 'vaccination' and o.status = 'pending' and o.due_at > now()) >= 1,
  'seed: Luna has a pending vaccination occurrence in the future'
);
select ok(
  (select count(distinct r.type) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
    where r.pet_id = 'c1000000-0000-4000-8000-000000000001' and o.due_at > now()) >= 2,
  'seed: Luna has future occurrences of more than one reminder type'
);

select * from finish();
rollback;
