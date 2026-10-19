-- RLS and write rules on reminders and reminder_occurrences (API §4.4, EP-25, EP-26,
-- EP-27): owner sees own; an opted-in member sees the shared pet's occurrences, a member
-- who has not opted in sees none (FR-29); organisation roles and the Operator see none;
-- only manual reminders are client-writable; shelter/breeder → forbidden_role.
-- Seeded: Ivana (…01, owner; Luna c1…01 shared into her household, Maks c1…02 not),
-- Marko (…02, Kiki c1…03), Jelena (…03, member of Ivana's household, reminders off),
-- Milica (…04, shelter), Nikola (…05, breeder), Ana (…06, Operator).
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Expected counts, computed as postgres.
create temp table t_expected as
select
  (select count(*) from public.reminders where user_id = 'a1000000-0000-4000-8000-000000000001')::int as ivana_reminders,
  (select count(*) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.user_id = 'a1000000-0000-4000-8000-000000000001')::int as ivana_occurrences,
  (select count(*) from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001')::int as luna_reminders,
  (select count(*) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'c1000000-0000-4000-8000-000000000001')::int as luna_occurrences;
grant select on t_expected to authenticated;

select ok((select ivana_occurrences > 0 and luna_occurrences > 0 from t_expected),
  'the seed produced occurrences for Ivana and Luna');

-- A manual reminder on Maks (not shared) and a vaccination reminder on Kiki (Marko).
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence) values
  ('db000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000002', 'manual', 'Maks — šišanje', now() + interval '5 days', 'none');
insert into public.vaccinations (id, pet_id, name, given_on, next_due_on, created_by) values
  ('db000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'RHD',
   current_date - 300, current_date + 12, 'a1000000-0000-4000-8000-000000000002');

-- Owner (Ivana) ----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.reminders), (select ivana_reminders + 1 from t_expected),
  'the owner sees exactly her own reminders (EP-25)');
select ok((select count(*) from public.reminder_occurrences) >= (select ivana_occurrences from t_expected),
  'the owner sees her occurrences');
select is(
  (select count(*)::int from public.reminder_occurrences o
   where not exists (select 1 from public.reminders r where r.id = o.reminder_id and r.user_id = 'a1000000-0000-4000-8000-000000000001')),
  0, 'and no one else''s'
);
select is((select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000003'), 0,
  'the owner does not see another owner''s reminders');

-- EP-27: only manual reminders are client-writable.
select lives_ok(
  $$update public.reminders set title = 'Maks — šišanje i kupanje' where id = 'db000000-0000-4000-8000-000000000001'$$,
  'the owner edits her manual reminder (EP-27)'
);
select throws_ok(
  $$insert into public.reminders (type, title, pet_id, starts_at) values
      ('vaccination', 'X', 'c1000000-0000-4000-8000-000000000001', now() + interval '1 day')$$,
  '42501', null, 'a client cannot create a non-manual reminder (EP-27)'
);
with u as (
  update public.reminders set starts_at = now() + interval '1 day' where type = 'vaccination' returning 1
)
select is((select count(*)::int from u), 0, 'a client cannot change a generated reminder (EP-27 not_found)');
with d as (delete from public.reminders where type <> 'manual' returning 1)
select is((select count(*)::int from d), 0, 'a client cannot delete a generated reminder');
select throws_ok(
  $$update public.reminders set type = 'vaccination' where id = 'db000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'the type is fixed'
);
select throws_ok(
  $$insert into public.reminders (user_id, type, title, starts_at)
    values ('a1000000-0000-4000-8000-000000000002', 'manual', 'X', now() + interval '1 day')$$,
  '42501', null, 'user_id cannot be set by the client (EP-27)'
);
select throws_ok(
  $$insert into public.reminders (type, title, pet_id, starts_at)
    values ('manual', 'X', 'c1000000-0000-4000-8000-000000000003', now() + interval '1 day')$$,
  '42501', null, 'a manual reminder cannot be linked to an unrelated pet'
);
select throws_ok(
  $$insert into public.reminder_occurrences (reminder_id, due_at, notify_at)
    values ('db000000-0000-4000-8000-000000000001', now(), now())$$,
  '42501', null, 'no client inserts on occurrences'
);
select throws_ok(
  $$update public.reminder_occurrences set status = 'done'$$,
  '42501', null, 'no client updates on occurrences (done marking is EP-26''s RPC)'
);
select lives_ok(
  $$delete from public.reminders where id = 'db000000-0000-4000-8000-000000000001'$$,
  'the owner deletes her manual reminder (EP-27)'
);

-- Member (Jelena), reminders off (FR-29) --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.reminders), 0, 'a member who has not opted in sees no reminders');
select is((select count(*)::int from public.reminder_occurrences), 0,
  'and no occurrences of shared pets (FR-29)');
select throws_ok(
  $$insert into public.reminders (type, title, pet_id, starts_at)
    values ('manual', 'Luna', 'c1000000-0000-4000-8000-000000000001', now() + interval '1 day')$$,
  'P0001', 'forbidden_role', 'a member cannot link a manual reminder to a pet they do not own (EP-27)'
);
select lives_ok(
  $$update public.household_memberships set reminders_enabled = true
    where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'the member switches reminders on (EP-38)'
);
select is((select count(*)::int from public.reminder_occurrences), (select luna_occurrences from t_expected),
  'an opted-in member sees the shared pet''s occurrences (EP-25)');
select is((select count(*)::int from public.reminders), (select luna_reminders from t_expected),
  'and the reminders of the shared pet only');
select is((select count(*)::int from public.reminders where pet_id is null or pet_id <> 'c1000000-0000-4000-8000-000000000001'),
  0, 'not the owner''s personal reminders or unshared pets');
select throws_ok(
  $$update public.reminder_occurrences set status = 'done'$$,
  '42501', null, 'a member cannot write occurrences directly'
);
with u as (update public.reminders set title = 'X' returning 1)
select is((select count(*)::int from u), 0, 'a member cannot edit the owner''s reminders');

-- Organisation roles and the Operator ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.reminders), 0, 'a shelter admin sees no reminders (EP-25)');
select is((select count(*)::int from public.reminder_occurrences), 0, 'and no occurrences');
select throws_ok(
  $$insert into public.reminders (type, title, starts_at) values ('manual', 'Nabavka', now() + interval '1 day')$$,
  'P0001', 'forbidden_role', 'a shelter account cannot create manual reminders (EP-27)'
);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.reminders (type, title, starts_at) values ('manual', 'Vakcinacija legla', now() + interval '1 day')$$,
  'P0001', 'forbidden_role', 'a breeder account cannot create manual reminders (EP-27)'
);
select is((select count(*)::int from public.reminder_occurrences), 0, 'a breeder sees no occurrences');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.reminders), 0, 'the Operator sees no personal reminders (EP-25)');
select is((select count(*)::int from public.reminder_occurrences), 0, 'and no occurrences');

-- Another owner (Marko) --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.reminders), 1, 'Marko sees only his own reminder');

-- Anonymous --------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select count(*) from public.reminders$$, '42501', null, 'anon has no access to reminders');

select * from finish();
rollback;
