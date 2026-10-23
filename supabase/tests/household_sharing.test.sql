-- Household sharing (Step 22): EP-34 rpc:get_household, FR-27 (sharing / un-sharing a pet changes what
-- members can read, through RLS on household_pets), FR-29 #1 (a new member's EP-25 list for shared pets is
-- empty until they switch reminders on with EP-38), FR-30 (after remove_member and leave the user can no
-- longer read the shared pet; the entries they made remain).
-- Seeded users: Ivana (…01, Premium, owns household b1…01 with Luna shared, Maks not), Marko (…02),
-- Jelena (…03, member of b1…01), Ana (…06, unrelated).
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

select has_function('public', 'get_household', array['uuid'], 'EP-34 function exists');
select is(
  (select prosecdef from pg_proc where oid = 'public.get_household(uuid)'::regprocedure),
  true, 'EP-34 is security definer'
);
select ok(not has_function_privilege('anon', 'public.get_household(uuid)', 'execute'), 'a Visitor cannot read a household');

-- EP-34 — owner view ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_household() -> 'household' ->> 'my_role', 'owner', 'the owner gets the owner view');
select is(
  (select jsonb_agg(m ->> 'role' order by ord) from jsonb_array_elements(public.get_household() -> 'household' -> 'members') with ordinality as x(m, ord)),
  '["owner", "member"]'::jsonb, 'members: owner first, then members'
);
select is(
  (select jsonb_agg((p ->> 'name') || ':' || (p ->> 'shared') order by p ->> 'name')
   from jsonb_array_elements(public.get_household() -> 'household' -> 'pets') p),
  '["Luna:true", "Maks:false"]'::jsonb, 'owner view: all own pets with their shared flag'
);
select is(public.get_household() -> 'household' -> 'access',
  '{"role": "owner", "can_edit": true, "can_delete": false}'::jsonb, 'owner access');
select is((public.get_household() -> 'household' ->> 'member_count')::int, 2, 'member_count = owner + members');
select is((public.get_household() -> 'household' ->> 'member_limit')::int, 6, 'member_limit = 6');
select ok(public.get_household() -> 'household' ->> 'owner_premium_until' is not null, 'owner_premium_until from the subscription');
select is(public.get_household() -> 'household' -> 'my_reminders_enabled', 'null'::jsonb, 'my_reminders_enabled is null for the owner');
select throws_ok(
  $$select public.get_household('b1000000-0000-4000-8000-0000000000ff')$$,
  'P0001', 'not_found', 'a household not related to the caller → not_found'
);

-- EP-34 — member view (Jelena) -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.get_household() -> 'household' ->> 'my_role', 'member', 'a member gets the member view');
select is(
  (select jsonb_agg(p ->> 'name') from jsonb_array_elements(public.get_household() -> 'household' -> 'pets') p),
  '["Luna"]'::jsonb, 'member view: shared pets only'
);
select is(public.get_household() -> 'household' -> 'pending_invitations', '[]'::jsonb, 'member view: no pending invitations');
select is(public.get_household() -> 'household' -> 'access',
  '{"role": "member", "can_edit": false, "can_delete": false}'::jsonb, 'member access is read-only');
select is(public.get_household() -> 'my_households',
  '[{"household_id": "b1000000-0000-4000-8000-000000000001", "name": "Domaćinstvo Petrović", "owner_name": "Ivana Petrović", "my_role": "member"}]'::jsonb,
  'my_households lists the membership');

-- No household at all.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(public.get_household(), '{"household": null, "my_households": []}'::jsonb, 'no household → household = null');

-- FR-27 — sharing and un-sharing (EP-37) ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'before sharing, the member cannot read Maks');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')
    on conflict do nothing$$,
  'the owner shares Maks (EP-37 upsert ignoring duplicates)'
);
select lives_ok(
  $$insert into public.household_pets (household_id, pet_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')
    on conflict do nothing$$,
  'sharing again is a no-op'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000002'), 1,
  'FR-27: after sharing, the member reads Maks');
select is((select count(*)::int from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000002'), 1,
  'FR-27: …and its record');
select throws_ok(
  $$delete from public.household_pets where pet_id = 'c1000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'a member cannot un-share'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
delete from public.household_pets
where household_id = 'b1000000-0000-4000-8000-000000000001' and pet_id = 'c1000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'FR-27: after un-sharing, the member no longer reads Maks');
select is((select count(*)::int from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'FR-27: …nor its record');

-- FR-29 #1 — reminders for shared pets stay off until the member switches them on (EP-38) ---------------
select is(
  (public.list_reminder_occurrences('upcoming', 'c1000000-0000-4000-8000-000000000001') ->> 'total')::int,
  0, 'FR-29 #1: a new member''s EP-25 list for the shared pet is empty'
);
select lives_ok(
  $$update public.household_memberships set reminders_enabled = true
    where household_id = 'b1000000-0000-4000-8000-000000000001'
      and user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'EP-38: the member switches reminders on for their own row'
);
select ok(
  (public.list_reminder_occurrences('upcoming', 'c1000000-0000-4000-8000-000000000001') ->> 'total')::int > 0,
  'FR-29 #1: after opting in, the shared pet''s reminders are listed'
);

-- FR-30 — remove_member and leave (EP-36) -------------------------------------------------------------
-- Jelena adds a weight entry, then the owner removes her.
insert into public.weight_entries (pet_id, measured_on, value)
values ('c1000000-0000-4000-8000-000000000001', '2026-10-20', 4.3);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
delete from public.household_memberships
where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 0,
  'FR-30: a removed member can no longer read the shared pet');

reset role;
select is(
  (select count(*)::int from public.weight_entries
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000003'),
  2, 'FR-30 / BR-26: the removed member''s entries remain'
);

-- Marko joins and then leaves on his own.
insert into public.household_memberships (household_id, user_id)
values ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into public.weight_entries (pet_id, measured_on, value)
values ('c1000000-0000-4000-8000-000000000001', '2026-10-21', 4.4);
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 1,
  'a member reads the shared pet');
delete from public.household_memberships
where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 0,
  'FR-30: after leaving, the user can no longer read the shared pet');

reset role;
select is(
  (select count(*)::int from public.weight_entries
   where pet_id = 'c1000000-0000-4000-8000-000000000001' and created_by = 'a1000000-0000-4000-8000-000000000002'),
  1, 'FR-30 / BR-26: entries of a member who left remain'
);

select * from finish();
rollback;
