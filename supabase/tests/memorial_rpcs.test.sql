-- rpc:move_pet_to_memorial (EP-06) and rpc:restore_pet_from_memorial (EP-07). FR-11: moving a pet to
-- Memorial stops all its reminders (reminders.active = false, pending occurrences deleted, BR-17) and
-- frees the Free active slot (BR-03); a Free owner's third memorial → premium_required:memorials (E-02);
-- Premium has no limit. FR-12: restoring with a free slot makes the pet active and re-enables the
-- reminders still due in the future (with occurrences) when reenable_reminders; a taken slot on Free →
-- premium_required:pets (E-03). Owner only: member and organisation roles → forbidden_role; no relation
-- → not_found.
-- Seeded (supabase/seed.sql): Ivana (…01, Premium; Luna c1…01, Maks c1…02), Marko (…02, Free; Kiki
-- c1…03), Jelena (…03, member of Ivana's household, Luna shared), Milica (…04, admin of the shelter
-- that holds Žuća c1…04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

create temp table t_today as select (now() at time zone 'Europe/Belgrade')::date as d;
grant select on t_today to authenticated;

-- The error of a statement as '<message> <detail>' (field codes travel in DETAIL); null if it succeeds.
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

select has_function('public', 'move_pet_to_memorial', array['uuid', 'date', 'memorial_reason', 'text'], 'rpc:move_pet_to_memorial exists');
select has_function('public', 'restore_pet_from_memorial', array['uuid', 'boolean'], 'rpc:restore_pet_from_memorial exists');
select ok(
  not has_function_privilege('anon', 'public.move_pet_to_memorial(uuid, date, public.memorial_reason, text)', 'execute'),
  'anon cannot call move_pet_to_memorial'
);
select ok(
  has_function_privilege('authenticated', 'public.move_pet_to_memorial(uuid, date, public.memorial_reason, text)', 'execute'),
  'authenticated can call move_pet_to_memorial'
);
select ok(
  not has_function_privilege('anon', 'public.restore_pet_from_memorial(uuid, boolean)', 'execute'),
  'anon cannot call restore_pet_from_memorial'
);

-- Kiki's reminders: a vaccination due in 20 days, one overdue, a finished treatment and an ongoing one.
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by)
select 'e6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'RHD — Step 16',
       d - 10, d + 20, 'a1000000-0000-4000-8000-000000000002' from t_today;
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by)
select 'e6000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'Miksomatoza — Step 16',
       d - 400, d - 30, 'a1000000-0000-4000-8000-000000000002' from t_today;
insert into public.treatments (id, pet_id, type, name, interval_value, interval_unit, starts_on, ends_on, created_by)
select 'e6000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'medication',
       'Završena terapija — Step 16', 1, 'days', d - 20, d - 10, 'a1000000-0000-4000-8000-000000000002' from t_today;
insert into public.treatments (id, pet_id, type, name, interval_value, interval_unit, starts_on, ends_on, created_by)
select 'e6000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000003', 'medication',
       'Tekuća terapija — Step 16', 12, 'hours', d - 2, d + 5, 'a1000000-0000-4000-8000-000000000002' from t_today;

create temp table t_kiki_reminders as
select r.id, r.source_id from public.reminders r where r.pet_id = 'c1000000-0000-4000-8000-000000000003';
grant select on t_kiki_reminders to authenticated;

-- Validation (Marko, Free) ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  pg_temp.error_of($$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000003', (select d + 1 from t_today))$$),
  'validation_failed date:out_of_range', 'a date in the future → date out_of_range'
);
select is(
  pg_temp.error_of($$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000003', (select d from t_today), null, repeat('a', 1001))$$),
  'validation_failed note:too_long', 'a note over 1000 characters → note too_long'
);
select is(
  pg_temp.error_of($$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000003', null)$$),
  'validation_failed date:required', 'no date → date required'
);

-- FR-11: Kiki moves to Memorial ---------------------------------------------------------------------------------
create temp table t_moved on commit drop as
select public.move_pet_to_memorial(
  'c1000000-0000-4000-8000-000000000003', (select d - 1 from t_today), 'lost', '  Pobegla iz dvorišta u Bečeju.  '
) as j;
select ok((select j is not null from t_moved), 'Marko moves Kiki to Memorial');
reset role;

select is(
  (select lifecycle::text from public.pets where id = 'c1000000-0000-4000-8000-000000000003'),
  'memorial', 'Kiki is a memorial'
);
select is(
  (select row(date, reason, note)::text from public.memorial_records where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  (select row(d - 1, 'lost'::public.memorial_reason, 'Pobegla iz dvorišta u Bečeju.')::text from t_today),
  'the memorial record keeps date, reason and the trimmed note'
);
select is(
  (select array[j ->> 'pet_id', j ->> 'reason', j ->> 'id'] from t_moved),
  (select array['c1000000-0000-4000-8000-000000000003', 'lost', id::text] from public.memorial_records
   where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  'the response is the MemorialRecord'
);
select is(
  (select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000003' and active),
  0, 'FR-11 / BR-17: all of Kiki''s reminders stop'
);
select is(
  (select count(*)::int from public.reminder_occurrences o join t_kiki_reminders k on k.id = o.reminder_id
   where o.status = 'pending'),
  0, 'FR-11 / BR-17: their pending occurrences are deleted'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  pg_temp.error_of($$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000003', (select d from t_today))$$),
  'validation_failed pet_id:invalid_state', 'a memorial cannot be moved again (pet_id invalid_state)'
);

-- BR-03: the Free slot is free again ----------------------------------------------------------------------------
select lives_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000002', 'Bruno', 'dog', 'male')$$,
  'FR-11: with Kiki in Memorial, Marko (Free) creates another active pet'
);

-- E-03: restore while the slot is taken -------------------------------------------------------------------------
select throws_ok(
  $$select public.restore_pet_from_memorial('c1000000-0000-4000-8000-000000000003')$$,
  'P0001', 'premium_required:pets', 'FR-12: restoring Kiki while Bruno holds the Free slot → premium_required (limit pets)'
);
select is(
  (select lifecycle::text from public.pets where id = 'c1000000-0000-4000-8000-000000000003'),
  'memorial', 'and Kiki stays a memorial'
);

-- E-02: a third memorial on Free --------------------------------------------------------------------------------
select lives_ok(
  $$select public.move_pet_to_memorial(
      (select id from public.pets where name = 'Bruno' and owner_id = 'a1000000-0000-4000-8000-000000000002'),
      (select d from t_today), 'passed_away')$$,
  'Bruno becomes Marko''s second memorial'
);
select lives_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000002', 'Mici', 'cat', 'female')$$,
  'Marko creates Mici'
);
select throws_ok(
  $$select public.move_pet_to_memorial(
      (select id from public.pets where name = 'Mici' and owner_id = 'a1000000-0000-4000-8000-000000000002'),
      (select d from t_today))$$,
  'P0001', 'premium_required:memorials', 'FR-11 / FR-36: a Free owner''s third memorial → premium_required (limit memorials)'
);
select is(
  (select lifecycle::text from public.pets where name = 'Mici' and owner_id = 'a1000000-0000-4000-8000-000000000002'),
  'active', 'and Mici stays active, without a memorial record'
);

-- FR-12: restore with a free slot -------------------------------------------------------------------------------
select lives_ok(
  $$delete from public.pets where name = 'Mici' and owner_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'Marko deletes Mici, so the active slot is free'
);
create temp table t_restored on commit drop as
select public.restore_pet_from_memorial('c1000000-0000-4000-8000-000000000003') as j;
select is((select j ->> 'lifecycle' from t_restored), 'active', 'FR-12: Kiki is restored; the response is the Pet with lifecycle active');
reset role;

select is(
  (select lifecycle::text from public.pets where id = 'c1000000-0000-4000-8000-000000000003'),
  'active', 'Kiki is active again'
);
select is(
  (select count(*)::int from public.memorial_records where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  0, 'her memorial record is deleted'
);
select ok(
  (select active from public.reminders where source_id = 'e6000000-0000-4000-8000-000000000001'),
  'FR-12: the vaccination reminder due in the future is re-enabled'
);
select ok(
  (select active from public.reminders where source_id = 'e6000000-0000-4000-8000-000000000004'),
  'FR-12: the ongoing treatment''s reminder is re-enabled'
);
select ok(
  not (select active from public.reminders where source_id = 'e6000000-0000-4000-8000-000000000002'),
  'the overdue vaccination''s reminder stays off'
);
select ok(
  not (select active from public.reminders where source_id = 'e6000000-0000-4000-8000-000000000003'),
  'the finished treatment''s reminder stays off'
);
select ok(
  (select count(*) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'e6000000-0000-4000-8000-000000000001' and o.status = 'pending') > 0,
  'FR-12: the re-enabled vaccination reminder has its occurrences again'
);
select ok(
  (select count(*) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.source_id = 'e6000000-0000-4000-8000-000000000004' and o.status = 'pending') > 0,
  'FR-12: and so does the ongoing treatment'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  pg_temp.error_of($$select public.restore_pet_from_memorial('c1000000-0000-4000-8000-000000000003')$$),
  'validation_failed pet_id:invalid_state', 'an active pet cannot be restored (pet_id invalid_state)'
);
reset role;

-- FR-11: Premium has no memorial limit (Ivana) ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000002', (select d from t_today), 'rehomed')$$,
  'Ivana (Premium) moves Maks — first memorial'
);
select lives_ok(
  $$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000001', (select d from t_today))$$,
  'Ivana moves Luna — second memorial'
);
select lives_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000001', 'Žika', 'bird', 'male')$$,
  'Ivana creates Žika'
);
select lives_ok(
  $$select public.move_pet_to_memorial(
      (select id from public.pets where name = 'Žika' and owner_id = 'a1000000-0000-4000-8000-000000000001'),
      (select d from t_today))$$,
  'FR-11: Ivana (Premium) moves a third pet to Memorial'
);
reset role;
select is(
  (select count(*)::int from public.pets where owner_id = 'a1000000-0000-4000-8000-000000000001' and lifecycle = 'memorial'),
  3, 'Ivana has three memorials'
);

-- reenable_reminders = false keeps every reminder off -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.restore_pet_from_memorial('c1000000-0000-4000-8000-000000000001', false)$$,
  'Ivana restores Luna without re-enabling reminders'
);
reset role;
select is(
  (select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001' and active),
  0, 'with reenable_reminders = false, Luna''s reminders stay off'
);

-- Roles ----------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000001', (select d from t_today))$$,
  'P0001', 'forbidden_role', 'a household member cannot move the shared pet to Memorial'
);
select throws_ok(
  $$select public.restore_pet_from_memorial('c1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'not_found', 'a pet the member has no relation to → not_found'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000001', (select d from t_today))$$,
  'P0001', 'not_found', 'another owner''s pet → not_found'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.move_pet_to_memorial('c1000000-0000-4000-8000-000000000004', (select d from t_today))$$,
  'P0001', 'forbidden_role', 'an organisation animal cannot be moved to Memorial'
);
select throws_ok(
  $$select public.restore_pet_from_memorial('c1000000-0000-4000-8000-000000000004')$$,
  'P0001', 'forbidden_role', 'nor restored'
);
reset role;

select * from finish();
rollback;
