-- EP-12 vet visits through the Data API as S05 writes them, and the linked `vet_follow_up` reminder
-- (FR-07, FR-20): saved with follow_up_on → reminder created; follow_up_on moved → reminder and
-- occurrences moved; cleared or the visit deleted → reminder and occurrences removed. Deleting a
-- visit cascades its attachments and queues their R2 keys. Also the EP-12 Request checks and the
-- member rule (FR-28: view only → forbidden_role).
-- Seeded (supabase/seed.sql): Ivana (…01, Luna), Jelena (…03, member of Ivana's household, Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

-- Owner saves a visit with a check-up date (S05 "Sačuvaj pregled") -----------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.vet_visits (pet_id, visited_on, clinic, reason, findings, recommendations, cost_minor, follow_up_on)
    select 'c1000000-0000-4000-8000-000000000001', d, 'Veterinarska ambulanta „Dr Vet”, Novi Sad',
           'Kontrola očiju — Step 15', 'Konjunktivitis se povukao, oko čisto.',
           'Završiti Tobrex kapi.', 150000, d + 14 from t_today$$,
  'owner saves a visit with follow_up_on'
);
reset role;
create temp table t_visit on commit drop as
select id from public.vet_visits where reason = 'Kontrola očiju — Step 15';
grant select on t_visit to authenticated;

select is(
  (select row(created_by, cost_minor)::text from public.vet_visits where id = (select id from t_visit)),
  row('a1000000-0000-4000-8000-000000000001'::uuid, 150000)::text,
  'created_by is the caller; the cost is stored in para'
);
select is(
  (select count(*)::int from public.reminders where type = 'vet_follow_up' and source_id = (select id from t_visit)),
  1, 'FR-07: saving it creates the check-up reminder automatically (FR-20)'
);
select is(
  (select row(user_id, pet_id, starts_at, recurrence, active)::text from public.reminders
   where type = 'vet_follow_up' and source_id = (select id from t_visit)),
  (select row('a1000000-0000-4000-8000-000000000001'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid,
              (d + 14 + time '09:00') at time zone 'Europe/Belgrade', 'none'::public.reminder_recurrence, true)::text
   from t_today),
  'the reminder is the owner''s, once, on follow_up_on at the vet follow-up delivery time'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = (select id from t_visit)),
  2, 'its occurrences: one day before and on the day (BR-48)'
);

-- A visit without a check-up date gets no reminder ---------------------------------------------------------
set local role authenticated;
select lives_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    select 'c1000000-0000-4000-8000-000000000001', d - 3, 'Godišnji pregled — Step 15' from t_today$$,
  'owner saves a visit without follow_up_on'
);
reset role;
select is(
  (select count(*)::int from public.reminders r join public.vet_visits v on v.id = r.source_id
   where v.reason = 'Godišnji pregled — Step 15'),
  0, 'no check-up date → no reminder'
);

-- Owner moves the check-up --------------------------------------------------------------------------------
set local role authenticated;
select lives_ok(
  $$update public.vet_visits set follow_up_on = (select d + 30 from t_today) where id = (select id from t_visit)$$,
  'owner edits follow_up_on'
);
reset role;
select is(
  (select starts_at from public.reminders where source_id = (select id from t_visit)),
  (select (d + 30 + time '09:00') at time zone 'Europe/Belgrade' from t_today),
  'the reminder moves to the new date'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = (select id from t_visit)
     and o.due_at <> (select (d + 30 + time '09:00') at time zone 'Europe/Belgrade' from t_today)),
  0, 'its occurrences follow the new date'
);

-- Owner clears the check-up --------------------------------------------------------------------------------
create temp table t_reminder on commit drop as
select id from public.reminders where source_id = (select id from t_visit);
set local role authenticated;
select lives_ok($$update public.vet_visits set follow_up_on = null where id = (select id from t_visit)$$, 'owner clears follow_up_on');
reset role;
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_visit)),
  0, 'clearing it removes the reminder'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id in (select id from t_reminder)),
  0, 'and its occurrences'
);

-- Owner deletes a visit with a check-up and an attachment (S03 Pregledi row menu → "Da, obriši") -------------
set local role authenticated;
select lives_ok(
  $$update public.vet_visits set follow_up_on = (select d + 7 from t_today) where id = (select id from t_visit)$$,
  'owner sets a check-up again'
);
reset role;
insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes, created_by)
select id, 'c1000000-0000-4000-8000-000000000001', 'u/a1/pets/c1/visits/step15/nalaz.pdf', 'nalaz.pdf',
       'application/pdf', 860000, 'a1000000-0000-4000-8000-000000000001'
from t_visit;
create temp table t_reminder2 on commit drop as
select id from public.reminders where source_id = (select id from t_visit);
set local role authenticated;
select lives_ok($$delete from public.vet_visits where id = (select id from t_visit)$$, 'owner deletes the visit');
reset role;
select is(
  (select count(*)::int from public.reminders where source_id = (select id from t_visit)),
  0, 'deleting the visit removes the reminder'
);
select is(
  (select count(*)::int from public.reminder_occurrences where reminder_id in (select id from t_reminder2)),
  0, 'and its occurrences'
);
select is(
  (select count(*)::int from public.attachments where r2_key = 'u/a1/pets/c1/visits/step15/nalaz.pdf'),
  0, 'EP-12: deleting the visit cascades its attachments'
);
select is(
  (select count(*)::int from public.r2_deletion_queue where r2_key = 'u/a1/pets/c1/visits/step15/nalaz.pdf'),
  1, 'EP-12: and queues their R2 keys for the nightly cleanup'
);

-- EP-12 Request checks ---------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason, follow_up_on)
    select 'c1000000-0000-4000-8000-000000000001', d, 'Pregled', d from t_today$$,
  '23514', null, 'EP-12: follow_up_on must be after visited_on (before_start)'
);
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    select 'c1000000-0000-4000-8000-000000000001', d, repeat('a', 201) from t_today$$,
  '23514', null, 'EP-12: reason ≤ 200 chars'
);
reset role;

-- Member: view only (FR-28) -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    select 'c1000000-0000-4000-8000-000000000001', d, 'Pregled' from t_today$$,
  'P0001', 'forbidden_role', 'FR-28: a member cannot add a vet visit'
);
reset role;

select * from finish();
rollback;
