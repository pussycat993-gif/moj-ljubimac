-- Household read-only state (Step 22): FR-32 / BR-28 / E-13 — when the owner's Premium expires,
-- households.read_only becomes true, members keep reading the shared pets, and their writes return
-- household_read_only; EP-34 reports read_only with access.can_edit = false; EP-37 and EP-36
-- remove_member are refused, while EP-36 leave, EP-36 revoke and EP-38 stay allowed. Renewing Premium
-- lifts it.
-- Seeded: Ivana (…01, Premium) owns household b1…01 with Luna (c1…01) shared; Jelena (…03) is a member.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into public.weight_entries (id, pet_id, measured_on, value, created_by) values
  ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '2026-10-01', 4.0,
   'a1000000-0000-4000-8000-000000000003');
insert into public.household_invitations (id, household_id, email, token_hash) values
  ('e4000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'gost@mojljubimac.test',
   md5('ro') || md5('rob'));
insert into public.household_memberships (household_id, user_id) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');

select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  false, 'with Premium the household is writable');

-- The owner's Premium expires.
update public.subscriptions set status = 'expired', current_period_end = now() - interval '1 day'
where user_id = 'a1000000-0000-4000-8000-000000000001';
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'FR-32: the owner''s expired Premium makes the household read-only');

-- Member (Jelena) -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 1,
  'FR-32: the member still reads the shared pet');
select ok((select count(*) from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001') > 0,
  'FR-32: …and its record');
select is(public.get_household() -> 'household' ->> 'read_only', 'true', 'EP-34 reports read_only to the member');
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4.5)$$,
  'P0001', 'household_read_only', 'FR-32: a member''s new weight entry → household_read_only'
);
select throws_ok(
  $$update public.weight_entries set note = 'x' where id = 'e4000000-0000-4000-8000-000000000001'$$,
  'P0001', 'household_read_only', 'FR-32: a member''s edit of their own entry → household_read_only'
);
select throws_ok(
  $$insert into public.feeding_entries (pet_id, fed_at, type)
    values ('c1000000-0000-4000-8000-000000000001', now(), 'dry')$$,
  'P0001', 'household_read_only', 'FR-32: a member''s feeding entry → household_read_only'
);
select throws_ok(
  $$select public.log_dose('c2000000-0000-4000-8000-000000000001', now(), null)$$,
  'P0001', 'household_read_only', 'FR-32: a member''s dose log → household_read_only'
);
select lives_ok(
  $$update public.household_memberships set reminders_enabled = true
    where household_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'EP-38 opt-in stays allowed while read-only'
);

-- Owner (Ivana) ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.get_household() -> 'household' -> 'access',
  '{"role": "owner", "can_edit": false, "can_delete": false}'::jsonb,
  'EP-34: the owner of a read-only household gets can_edit = false (S13 R state)');
select ok(public.get_household() -> 'household' ->> 'owner_premium_until' is not null,
  'EP-34: owner_premium_until for the banner');
select throws_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'household_read_only', 'EP-37 share → household_read_only'
);
select throws_ok(
  $$delete from public.household_pets
    where household_id = 'b1000000-0000-4000-8000-000000000001' and pet_id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'household_read_only', 'EP-37 un-share → household_read_only'
);
select throws_ok(
  $$delete from public.household_memberships
    where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'household_read_only', 'EP-36 remove_member → household_read_only'
);
select lives_ok(
  $$update public.household_invitations set status = 'expired', expires_at = now()
    where id = 'e4000000-0000-4000-8000-000000000002'$$,
  'EP-36 revoke stays allowed while read-only'
);
select throws_ok(
  $$select public.create_household_invitation('e4000000-0000-4000-8000-000000000003', md5('ro2') || md5('ro2b'), null, null)$$,
  'P0001', 'premium_required:household', 'EP-35 without Premium → premium_required:household'
);

-- Marko leaves while read-only.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$delete from public.household_memberships
    where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'EP-36 leave stays allowed while read-only'
);

-- Renewing Premium lifts it.
reset role;
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000001', 'premium_yearly', 'active', now() + interval '1 year');
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  false, 'renewed Premium makes the household writable again');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value)
    values ('c1000000-0000-4000-8000-000000000001', current_date, 4.5)$$,
  'after renewal the member logs weight again'
);

select * from finish();
rollback;
