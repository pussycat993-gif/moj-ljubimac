-- rpc:mark_occurrence_done (EP-26; API §5.3 "Occurrence instances", §6 ReminderOccurrence). FR-24 (in the
-- product): marking done sets every row of the instance to done with done_at / done_by and returns it
-- as done with time and user; naturally idempotent (the original done_at / done_by stay); a missed
-- instance may still be marked done; a treatment_dose instance inserts its dose log once (as EP-11);
-- an opted-in member may mark, but not while the household is read-only (BR-28 → household_read_only);
-- no relation, not opted in or unknown → not_found.
-- Seeded (supabase/seed.sql): Ivana (…01, Luna c1…01 shared into her household), Marko (…02), Jelena
-- (…03, member of Ivana's household).
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

create function pg_temp.error_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_message text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_message = message_text;
  return v_message;
end;
$$;
grant execute on function pg_temp.error_of(text) to authenticated;

select has_function('public', 'mark_occurrence_done', array['uuid'], 'rpc:mark_occurrence_done exists');
select ok(
  not has_function_privilege('anon', 'public.mark_occurrence_done(uuid)', 'execute'),
  'anon cannot call mark_occurrence_done'
);

-- A vaccination on Luna due in 10 days: two notices (7 days before and on the day) = one instance.
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by)
select 'e8000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Besnilo — Step 17',
       d - 355, d + 10, 'a1000000-0000-4000-8000-000000000001' from t_today;
-- A one-dose treatment on Luna tomorrow.
insert into public.treatments (id, pet_id, type, name, starts_on, created_by)
select 'e8000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'deworming',
       'Milbemax — Step 17', d + 1, 'a1000000-0000-4000-8000-000000000001' from t_today;
-- A second dose treatment on Luna (for the member) in 2 days.
insert into public.treatments (id, pet_id, type, name, starts_on, created_by)
select 'e8000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'medication',
       'Tobrex — Step 17', d + 2, 'a1000000-0000-4000-8000-000000000001' from t_today;

create temp table t_vacc on commit drop as
select o.id, o.notify_at, o.due_at, o.reminder_id
from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
where r.source_id = 'e8000000-0000-4000-8000-000000000001';
create temp table t_dose on commit drop as
select o.id from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
where r.source_id = 'e8000000-0000-4000-8000-000000000002';
create temp table t_dose2 on commit drop as
select o.id from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
where r.source_id = 'e8000000-0000-4000-8000-000000000003';
-- A missed instance of Ivana's own reminder (as the dispatch job would leave it).
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence)
values ('e8000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', null, 'manual',
        'Propušten — Step 17', now() + interval '50 days', 'none');
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at, status, sent_at)
values ('e8000000-0000-4000-8000-0000000000a1', 'e8000000-0000-4000-8000-000000000004',
        now() - interval '2 days', now() - interval '2 days', 'missed', now() - interval '2 days');
grant select on t_vacc, t_dose, t_dose2 to authenticated;

select is((select count(*)::int from t_vacc), 2, 'the vaccination instance has two lead-time rows');

-- Owner marks the vaccination instance done through its earlier (7-day) notice -------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_done on commit drop as
select public.mark_occurrence_done((select id from t_vacc order by notify_at limit 1)) as j;
reset role;

select is(
  (select array_agg(row(o.status, o.done_by)::text) from public.reminder_occurrences o where o.id in (select id from t_vacc)),
  array[row('done'::public.occurrence_status, 'a1000000-0000-4000-8000-000000000001'::uuid)::text,
        row('done'::public.occurrence_status, 'a1000000-0000-4000-8000-000000000001'::uuid)::text],
  'FR-24: every row of the instance is done, by the caller'
);
select ok(
  (select bool_and(done_at between now() - interval '1 minute' and now() + interval '1 minute')
   from public.reminder_occurrences where id in (select id from t_vacc)),
  'FR-24: done_at is now()'
);
select is(
  (select row(j ->> 'status', j ->> 'display_status', j ->> 'done_by', j ->> 'done_by_name', (j ->> 'can_mark_done')::boolean)::text from t_done),
  row('done', 'done', 'a1000000-0000-4000-8000-000000000001', 'Ivana Petrović', false)::text,
  'FR-24: returns the instance as done with done_by and done_by_name'
);
select ok((select j ->> 'done_at' from t_done) is not null, 'FR-24: returns done_at');
select is(
  (select j ->> 'id' from t_done), (select id::text from t_vacc order by notify_at desc limit 1),
  'the returned id is the final notice''s'
);

-- Idempotent ---------------------------------------------------------------------------------------------------
create temp table t_before on commit drop as
select array_agg(done_at order by id) as at from public.reminder_occurrences where id in (select id from t_vacc);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_again on commit drop as select public.mark_occurrence_done((select id from t_vacc order by notify_at desc limit 1)) as j;
reset role;
select is(
  (select array_agg(done_at order by id) from public.reminder_occurrences where id in (select id from t_vacc)),
  (select at from t_before), 'idempotent: marking again keeps the original done_at'
);
select is((select j ->> 'done_at' from t_again), (select j ->> 'done_at' from t_done), 'and returns it unchanged');

-- A missed instance may still be marked done ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_late on commit drop as select public.mark_occurrence_done('e8000000-0000-4000-8000-0000000000a1') as j;
reset role;
select is((select j ->> 'display_status' from t_late), 'done', 'a missed instance can be marked done (late acknowledgement)');
select is(
  (select status::text from public.reminder_occurrences where id = 'e8000000-0000-4000-8000-0000000000a1'),
  'done', 'its row is done'
);

-- treatment_dose → one dose log -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.mark_occurrence_done((select id from t_dose limit 1))$$, 'owner marks the dose done');
select lives_ok($$select public.mark_occurrence_done((select id from t_dose limit 1))$$, 'and again');
reset role;
select is(
  (select count(*)::int from public.dose_logs where treatment_id = 'e8000000-0000-4000-8000-000000000002'),
  1, 'treatment_dose: the dose log is inserted once'
);
select is(
  (select row(occurrence_id, created_by)::text from public.dose_logs where treatment_id = 'e8000000-0000-4000-8000-000000000002'),
  (select row(id, 'a1000000-0000-4000-8000-000000000001'::uuid)::text from t_dose limit 1),
  'the dose log names the occurrence and the user'
);

-- No relation / unknown -----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.error_of($$select public.mark_occurrence_done((select id from t_dose2 limit 1))$$), 'not_found',
  'another owner → not_found');
select is(pg_temp.error_of($$select public.mark_occurrence_done(gen_random_uuid())$$), 'not_found', 'unknown id → not_found');
reset role;

-- Household member ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.error_of($$select public.mark_occurrence_done((select id from t_dose2 limit 1))$$), 'not_found',
  'a member who has not opted in cannot see the instance → not_found');
reset role;

update public.household_memberships set reminders_enabled = true where user_id = 'a1000000-0000-4000-8000-000000000003';
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(pg_temp.error_of($$select public.mark_occurrence_done((select id from t_dose2 limit 1))$$), 'household_read_only',
  'BR-28: a member of a read-only household → household_read_only');
reset role;
select is(
  (select count(*)::int from public.reminder_occurrences where id in (select id from t_dose2) and status = 'done'),
  0, 'and nothing is marked'
);

update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';
set local role authenticated;
create temp table t_member on commit drop as select public.mark_occurrence_done((select id from t_dose2 limit 1)) as j;
reset role;
select is(
  (select row(j ->> 'display_status', j ->> 'done_by_name', (j ->> 'is_shared')::boolean)::text from t_member),
  row('done', 'Jelena Nikolić', true)::text,
  'FR-24 / FR-28: an opted-in member marks a shared pet''s instance done, shown with their name'
);
select is(
  (select created_by::text from public.dose_logs where treatment_id = 'e8000000-0000-4000-8000-000000000003'),
  'a1000000-0000-4000-8000-000000000003', 'the member''s dose log names the member'
);

-- The owner of a read-only household may still mark done ---------------------------------------------------------
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence)
values ('e8000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
        'manual', 'Vlasnik — Step 17', now() + interval '3 days', 'none');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.mark_occurrence_done((select o.id from public.reminder_occurrences o where o.reminder_id = 'e8000000-0000-4000-8000-000000000005' limit 1))$$,
  'the owner marks done even while the household is read-only'
);
reset role;

select * from finish();
rollback;
