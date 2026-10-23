-- Household member permissions (Step 22, checked against the Step 06–08 / 14–21 rules): FR-28 #1 a member
-- adds weight, logs a dose, adds feeding and stool entries and a moment, and marks a reminder done on a
-- shared pet; FR-28 #2 a member cannot add or change vaccinations, treatments, vet visits, attachments or
-- reminders; FR-28 #3 (E-12) a member cannot update or delete an entry someone else created.
-- Seeded: Ivana (…01, Premium) owns Luna (c1…01, shared into b1…01, treatment c2…01); Jelena (…03) is a
-- member of b1…01.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Jelena opts in to reminders (EP-26 is for opted-in members, API §4.4).
update public.household_memberships set reminders_enabled = true
where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003';

-- Ivana's own care entries, which the member must not change.
insert into public.feeding_entries (id, pet_id, fed_at, type, created_by) values
  ('e3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', now() - interval '1 hour', 'dry',
   'a1000000-0000-4000-8000-000000000001');
insert into public.moments (id, pet_id, moment_date, text, created_by) values
  ('e3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', current_date, 'Ivanin trenutak',
   'a1000000-0000-4000-8000-000000000001');

create temporary table luna_occurrence on commit drop as
select o.id
from public.reminder_occurrences o
join public.reminders r on r.id = o.reminder_id
where r.pet_id = 'c1000000-0000-4000-8000-000000000001' and o.status = 'pending'
order by o.due_at
limit 1;
grant select on luna_occurrence to authenticated;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- FR-28 #1 ------------------------------------------------------------------------------------------
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4.3)$$,
  'FR-28 #1: a member adds a weight entry'
);
select lives_ok(
  $$select public.log_dose('c2000000-0000-4000-8000-000000000001', now(), null)$$,
  'FR-28 #1: a member marks a dose given (EP-11)'
);
select lives_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type, amount_g)
    values ('c1000000-0000-4000-8000-000000000001', now(), 'wet', 85)$$,
  'FR-28 #1: a member adds a feeding entry'
);
select lives_ok(
  $$insert into public.stool_entries (pet_id, observed_at, consistency, blood_or_mucus)
    values ('c1000000-0000-4000-8000-000000000001', now(), 'normal', false)$$,
  'FR-28 #1: a member adds a stool entry'
);
select lives_ok(
  $$select public.confirm_moment('e3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001',
      current_date, 'Lunin trenutak', '[]'::jsonb)$$,
  'FR-28 #1: a member adds a moment'
);
select ok((select count(*) from luna_occurrence) = 1, 'the shared pet has a pending reminder instance');
select is(
  public.mark_occurrence_done((select id from luna_occurrence)) ->> 'status',
  'done', 'FR-28 #1: a member marks the reminder done (EP-26)'
);
select is(
  (select count(*)::int from public.weight_entries
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000003'
     and measured_on = current_date),
  1, 'the member''s entry is stored with them as creator'
);

-- FR-28 #2 ------------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.vaccinations (pet_id, name, given_on)
    values ('c1000000-0000-4000-8000-000000000001', 'Besnilo', current_date)$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot add a vaccination'
);
select throws_ok(
  $$update public.vaccinations set note = 'x' where pet_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot change a vaccination'
);
select throws_ok(
  $$insert into public.treatments (pet_id, name, type, starts_on)
    values ('c1000000-0000-4000-8000-000000000001', 'Tablete', 'medication', current_date)$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot add a treatment'
);
select throws_ok(
  $$update public.treatments set note = 'x' where pet_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot change a treatment (only mark doses)'
);
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 'Kontrola')$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot add a vet visit'
);
select throws_ok(
  $$update public.vet_visits set reason = 'x' where pet_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot change a vet visit'
);
select throws_ok(
  $$insert into public.attachments (pet_id, file_name, r2_key, mime_type, size_bytes)
    values ('c1000000-0000-4000-8000-000000000001', 'nalaz.pdf',
            'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/x-nalaz.pdf',
            'application/pdf', 1000)$$,
  '42501', null, 'FR-28 #2: a member cannot add an attachment'
);
select throws_ok(
  $$insert into public.reminders (pet_id, type, title, starts_at, recurrence)
    values ('c1000000-0000-4000-8000-000000000001', 'manual', 'Češljanje', now() + interval '1 day', 'none')$$,
  'P0001', 'forbidden_role', 'FR-28 #2: a member cannot add a reminder for the shared pet'
);
update public.reminders set title = 'Promenjeno' where pet_id = 'c1000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select count(*)::int from public.reminders
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and title = 'Promenjeno'),
  0, 'FR-28 #2: a member''s update leaves the owner''s reminders unchanged'
);
select is(
  (select count(*)::int from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  3, 'no vaccination was added'
);

-- FR-28 #3 (E-12) -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.weight_entries set note = 'x'
    where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #3: a member cannot edit the owner''s weight entry'
);
select throws_ok(
  $$delete from public.weight_entries
    where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #3: a member cannot delete the owner''s weight entry'
);
select throws_ok(
  $$update public.feeding_entries set note = 'x' where id = 'e3000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #3: a member cannot edit the owner''s feeding entry'
);
select throws_ok(
  $$delete from public.feeding_entries where id = 'e3000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'FR-28 #3: a member cannot delete the owner''s feeding entry'
);
select throws_ok(
  $$delete from public.moments where id = 'e3000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'FR-28 #3: a member cannot delete the owner''s moment'
);
select lives_ok(
  $$update public.weight_entries set note = 'moje merenje'
    where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000003'
      and measured_on = current_date$$,
  'BR-23: a member edits their own entry'
);

-- The owner still edits everyone's entries on their pet.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$update public.weight_entries set note = 'provereno'
    where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000003'$$,
  'the owner edits a member''s entry'
);
reset role;
select is(
  (select count(*)::int from public.weight_entries
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and note = 'provereno'),
  2, 'the owner''s edit is stored'
);

select * from finish();
rollback;
