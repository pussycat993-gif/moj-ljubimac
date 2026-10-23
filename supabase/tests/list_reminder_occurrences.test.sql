-- rpc:list_reminder_occurrences (EP-25; API §5.3 "Occurrence instances", §6 ReminderOccurrence). FR-20
-- (display): instances created from a vaccination, a treatment, a vet visit and a birthday appear under
-- the right filter; inactive reminders and memorial pets never appear; a household member sees a shared
-- pet's instances only when opted in (FR-29); organisation roles see none; the `today` filter follows the
-- Europe/Belgrade day (NFR-02); paging, total and counts; validation.
-- Seeded (supabase/seed.sql): Ivana (…01, Premium; Luna c1…01 shared into her household, Maks c1…02),
-- Marko (…02; Kiki c1…03), Jelena (…03, member of Ivana's household), Milica (…04, shelter admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

create temp table t_today as
select (now() at time zone 'Europe/Belgrade')::date as d,
       ((now() at time zone 'Europe/Belgrade')::date)::timestamp at time zone 'Europe/Belgrade' as start;
grant select on t_today to authenticated;

-- The error of a statement as '<message> <detail>'; null if it succeeds.
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
grant execute on function pg_temp.error_of(text) to authenticated;

select has_function('public', 'list_reminder_occurrences', array['text', 'uuid', 'integer', 'integer'],
  'rpc:list_reminder_occurrences exists');
select ok(
  not has_function_privilege('anon', 'public.list_reminder_occurrences(text, uuid, integer, integer)', 'execute'),
  'anon cannot call list_reminder_occurrences'
);
select ok(
  has_function_privilege('authenticated', 'public.list_reminder_occurrences(text, uuid, integer, integer)', 'execute'),
  'authenticated can call list_reminder_occurrences'
);

-- Sources (FR-20): a vaccination on Luna due in 5 days, a one-dose treatment on Luna tomorrow, a vet
-- visit on Luna with a check-up in 3 days, and Maks's birthday in 10 days.
insert into public.vaccinations (pet_id, name, given_on, next_due_on, created_by)
select 'c1000000-0000-4000-8000-000000000001', 'Besnilo — Step 17', d - 360, d + 5,
       'a1000000-0000-4000-8000-000000000001' from t_today;
insert into public.treatments (pet_id, type, name, starts_on, created_by)
select 'c1000000-0000-4000-8000-000000000001', 'deworming', 'Milbemax — Step 17', d + 1,
       'a1000000-0000-4000-8000-000000000001' from t_today;
insert into public.vet_visits (pet_id, visited_on, reason, follow_up_on, created_by)
select 'c1000000-0000-4000-8000-000000000001', d - 1, 'Kontrola zuba — Step 17', d + 3,
       'a1000000-0000-4000-8000-000000000001' from t_today;
update public.pets
set birth_year = null, birth_date = (select (d + 10) - interval '3 years' from t_today)::date
where id = 'c1000000-0000-4000-8000-000000000002';

-- A "Za mene" manual reminder far ahead, used as a carrier for hand-made instances around the day
-- boundary and in the missed / done states.
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence)
values ('e7000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, 'manual',
        'Granica dana — Step 17', now() + interval '59 days', 'none');
insert into public.reminder_occurrences (reminder_id, due_at, notify_at, status, done_at, done_by)
select 'e7000000-0000-4000-8000-000000000001', v.due_at, v.due_at, v.status::public.occurrence_status, v.done_at, v.done_by
from t_today,
lateral (values
  (start + interval '1 minute', 'pending', null::timestamptz, null::uuid),            -- today 00:01 Belgrade
  (start - interval '1 minute', 'pending', null, null),                               -- yesterday 23:59
  (start + interval '1 day', 'pending', null, null),                                  -- tomorrow 00:00
  (start - interval '2 days', 'missed', null, null),                                  -- missed
  (start - interval '3 days', 'done', now() - interval '1 hour', 'a1000000-0000-4000-8000-000000000001'::uuid)
) as v (due_at, status, done_at, done_by);

-- An inactive manual reminder with an open instance today: never listed.
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence, active)
values ('e7000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', null, 'manual',
        'Neaktivan — Step 17', now() + interval '59 days', 'none', false);
insert into public.reminder_occurrences (reminder_id, due_at, notify_at)
select 'e7000000-0000-4000-8000-000000000002', start + interval '2 minutes', start + interval '2 minutes' from t_today;

-- Ivana -----------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table t_upcoming on commit drop as select public.list_reminder_occurrences('upcoming', null, 50, 0) as j;
create temp table t_today_list on commit drop as select public.list_reminder_occurrences('today', null, 1, 5) as j;
create temp table t_missed on commit drop as select public.list_reminder_occurrences('missed') as j;
create temp table t_done on commit drop as select public.list_reminder_occurrences('done') as j;
create temp table t_next on commit drop as
  select public.list_reminder_occurrences('next', 'c1000000-0000-4000-8000-000000000001', 3, 0) as j;
create temp table t_page1 on commit drop as select public.list_reminder_occurrences('upcoming', null, 1, 0) as j;
create temp table t_page2 on commit drop as select public.list_reminder_occurrences('upcoming', null, 1, 1) as j;
reset role;

create temp table t_up_items on commit drop as
select e from t_upcoming, jsonb_array_elements(j -> 'items') e;

select ok(
  exists (select 1 from t_up_items where e ->> 'type' = 'vaccination' and e ->> 'title' = 'Besnilo — Step 17'
          and e ->> 'pet_name' = 'Luna' and e ->> 'display_status' = 'soon'),
  'FR-20: the vaccination next dose is listed under upcoming, titled with the vaccine'
);
select ok(
  exists (select 1 from t_up_items where e ->> 'type' = 'treatment_dose' and e ->> 'title' = 'Milbemax — Step 17'),
  'FR-20: the treatment dose is listed under upcoming, titled with the treatment'
);
select ok(
  exists (select 1 from t_up_items where e ->> 'type' = 'vet_follow_up' and e ->> 'title' = 'Kontrola zuba — Step 17'),
  'FR-20: the vet check-up is listed under upcoming, titled with the visit reason'
);
select ok(
  exists (select 1 from t_up_items where e ->> 'type' = 'birthday' and e ->> 'pet_name' = 'Maks' and e -> 'title' = 'null'::jsonb),
  'FR-20: the birthday is listed under upcoming with a null title (the UI builds it)'
);
select is(
  (select count(*)::int from t_up_items where e ->> 'title' = 'Besnilo — Step 17'),
  1, 'one row per instance (the 7-day and same-day notices of the vaccination are one instance)'
);
select is(
  (select count(*)::int from t_up_items
   where ((e ->> 'due_at')::timestamptz at time zone 'Europe/Belgrade')::date <= (select d from t_today)),
  0, 'upcoming starts tomorrow (Europe/Belgrade)'
);
select ok(
  (select bool_and((e ->> 'due_at')::timestamptz <= now() + interval '60 days') from t_up_items),
  'upcoming stays inside the 60-day window'
);
select is(
  (select array_agg((x.e ->> 'due_at')::timestamptz order by x.ord)
   from t_upcoming, jsonb_array_elements(j -> 'items') with ordinality as x (e, ord)),
  (select array_agg((e ->> 'due_at')::timestamptz order by (e ->> 'due_at')::timestamptz) from t_up_items),
  'upcoming is sorted due_at asc'
);
select is(
  (select array(select jsonb_object_keys(e) order by 1) from t_up_items limit 1),
  array['can_mark_done', 'channels', 'display_status', 'done_at', 'done_by', 'done_by_name', 'due_at', 'id',
        'is_shared', 'pet_id', 'pet_name', 'pet_sex', 'pet_species', 'reminder_id', 'sent_at', 'status', 'title', 'type'],
  'items carry the ReminderOccurrence fields'
);
select is(
  (select e -> 'channels' from t_up_items where e ->> 'title' = 'Besnilo — Step 17'),
  '["email", "push"]'::jsonb, 'channels before sending: the default email + push'
);
select ok(
  (select e ->> 'id' from t_up_items where e ->> 'title' = 'Besnilo — Step 17') = (
    select (array_agg(o.id::text order by o.notify_at desc))[1]
    from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
    join public.vaccinations v on v.id = r.source_id
    where v.name = 'Besnilo — Step 17'),
  'the instance id is its final notice (latest notify_at)'
);

-- today (Europe/Belgrade day boundary) and limit/offset ignored
select ok(
  exists (select 1 from t_today_list, jsonb_array_elements(j -> 'items') e
          where e ->> 'title' = 'Granica dana — Step 17'
            and (e ->> 'due_at')::timestamptz = (select start + interval '1 minute' from t_today)
            and e ->> 'display_status' = 'today' and e -> 'pet_id' = 'null'::jsonb),
  'NFR-02: an instance at 00:01 Belgrade today is under today ("Za mene": pet_id null)'
);
select is(
  (select count(*)::int from t_today_list, jsonb_array_elements(j -> 'items') e
   where (e ->> 'due_at')::timestamptz in (select start - interval '1 minute' from t_today union all select start + interval '1 day' from t_today)),
  0, 'NFR-02: 23:59 yesterday and 00:00 tomorrow (Belgrade) are not today'
);
select is(
  (select jsonb_array_length(j -> 'items') from t_today_list), (select (j ->> 'total')::int from t_today_list),
  'today returns the whole list (limit and offset ignored) and total counts it'
);
select ok(
  exists (select 1 from t_upcoming, jsonb_array_elements(j -> 'items') e
          where (e ->> 'due_at')::timestamptz = (select start + interval '1 day' from t_today)),
  'NFR-02: 00:00 tomorrow is under upcoming'
);
select is(
  (select count(*)::int from t_today_list, jsonb_array_elements(j -> 'items') e where e ->> 'title' = 'Neaktivan — Step 17'),
  0, 'BR-17: an inactive reminder is never listed'
);

-- missed and done
select is(
  (select array_agg(e ->> 'display_status') from t_missed, jsonb_array_elements(j -> 'items') e
   where e ->> 'title' = 'Granica dana — Step 17'),
  array['missed'], 'missed: the final notice is missed'
);
select is(
  (select row(e ->> 'status', e ->> 'display_status', e ->> 'done_by_name', (e ->> 'can_mark_done')::boolean)::text
   from t_done, jsonb_array_elements(j -> 'items') e where e ->> 'title' = 'Granica dana — Step 17'),
  row('done', 'done', 'Ivana Petrović', false)::text,
  'done: status done, done_by_name, cannot be marked again'
);
select is(
  (select j -> 'counts' ->> 'missed' from t_missed)::int >= 1 and (select j -> 'counts' ->> 'done' from t_done)::int >= 1,
  true, 'counts cover missed and done'
);
select is(
  (select array(select jsonb_object_keys(j -> 'counts') order by 1) from t_done),
  array['done', 'missed', 'today', 'upcoming'], 'counts always cover the four S10 tabs'
);
select is(
  (select (j -> 'counts' ->> 'upcoming')::int from t_today_list), (select (j ->> 'total')::int from t_upcoming),
  'counts.upcoming equals the upcoming total'
);

-- next (S03) and paging
select ok(
  (select bool_and(e ->> 'pet_id' = 'c1000000-0000-4000-8000-000000000001') from t_next, jsonb_array_elements(j -> 'items') e)
  and (select jsonb_array_length(j -> 'items') from t_next) = 3,
  'next with pet_id and limit 3 returns three of that pet''s instances'
);
select ok(
  (select (j -> 'items' -> 0 ->> 'id') from t_page1) <> (select (j -> 'items' -> 0 ->> 'id') from t_page2)
  and (select j ->> 'total' from t_page1) = (select j ->> 'total' from t_page2)
  and (select jsonb_array_length(j -> 'items') from t_page1) = 1,
  'upcoming is paged by limit / offset with the same total'
);

-- Memorial pets never appear (BR-17)
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000002', (select d from t_today), 'passed_away', null)$$,
  'Maks moves to Memorial'
);
create temp table t_after_memorial on commit drop as select public.list_reminder_occurrences('upcoming', null, 50, 0) as j;
reset role;
select is(
  (select count(*)::int from t_after_memorial, jsonb_array_elements(j -> 'items') e where e ->> 'pet_name' = 'Maks'),
  0, 'BR-17: a memorial pet''s instances never appear'
);
-- Even if a row of a memorial pet's reminder still existed (written by the System), it stays hidden.
update public.reminders set active = true where pet_id = 'c1000000-0000-4000-8000-000000000002' and type = 'birthday';
select is(
  (select active from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000002' and type = 'birthday'),
  false, 'BR-17: the memorial trigger keeps the reminder inactive'
);

-- Validation and pet scope
set local role authenticated;
select is(
  pg_temp.error_of($$select public.list_reminder_occurrences('later')$$),
  'validation_failed filter:invalid', 'an unknown filter → validation_failed (filter)'
);
select is(
  pg_temp.error_of($$select public.list_reminder_occurrences('upcoming', null, 51, 0)$$),
  'validation_failed limit:out_of_range', 'limit > 50 → validation_failed (limit)'
);
select is(
  pg_temp.error_of($$select public.list_reminder_occurrences('upcoming', 'c1000000-0000-4000-8000-000000000003', 20, 0)$$),
  'not_found', 'pet_id of a pet the caller cannot see → not_found'
);
reset role;

-- Household member (FR-29) -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
create temp table t_member_off on commit drop as select public.list_reminder_occurrences('upcoming', null, 50, 0) as j;
reset role;
select is((select (j ->> 'total')::int from t_member_off), 0, 'FR-29: a member who has not opted in sees none');

update public.household_memberships set reminders_enabled = true
where user_id = 'a1000000-0000-4000-8000-000000000003';
set local role authenticated;
create temp table t_member_on on commit drop as select public.list_reminder_occurrences('upcoming', null, 50, 0) as j;
create temp table t_member_today on commit drop as select public.list_reminder_occurrences('today') as j;
reset role;
select ok(
  (select count(*) from t_member_on, jsonb_array_elements(j -> 'items') e) > 0
  and (select bool_and(e ->> 'pet_name' = 'Luna' and (e ->> 'is_shared')::boolean)
       from t_member_on, jsonb_array_elements(j -> 'items') e),
  'FR-29: an opted-in member sees the shared pet''s instances, marked is_shared'
);
select is(
  (select count(*)::int from t_member_today, jsonb_array_elements(j -> 'items') e where e -> 'pet_id' = 'null'::jsonb),
  0, 'a member never sees the owner''s "Za mene" reminders'
);
select ok(
  (select bool_and((e ->> 'can_mark_done')::boolean) from t_member_on, jsonb_array_elements(j -> 'items') e),
  'can_mark_done for a member of a household that is not read-only'
);
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
set local role authenticated;
create temp table t_member_ro on commit drop as select public.list_reminder_occurrences('upcoming', null, 50, 0) as j;
reset role;
select ok(
  not (select bool_or((e ->> 'can_mark_done')::boolean) from t_member_ro, jsonb_array_elements(j -> 'items') e),
  'BR-28: can_mark_done is false for a member while the household is read-only'
);
select is(
  (select e -> 'channels' from t_member_on, jsonb_array_elements(j -> 'items') e limit 1) <@ '["email", "push"]'::jsonb,
  true, 'a member''s channels are email / push only'
);

-- Organisation roles ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
create temp table t_org on commit drop as
  select public.list_reminder_occurrences('upcoming') as u, public.list_reminder_occurrences('today') as t;
reset role;
select is(
  (select row(u -> 'items', t -> 'items', u ->> 'total')::text from t_org),
  row('[]'::jsonb, '[]'::jsonb, '0')::text,
  'organisation roles get [] (no personal reminders)'
);

-- Another owner sees only their own --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
create temp table t_marko on commit drop as select public.list_reminder_occurrences('upcoming', null, 50, 0) as j;
reset role;
select is(
  (select count(*)::int from t_marko, jsonb_array_elements(j -> 'items') e where e ->> 'pet_name' in ('Luna', 'Maks')),
  0, 'another owner never sees Ivana''s instances'
);

select * from finish();
rollback;
