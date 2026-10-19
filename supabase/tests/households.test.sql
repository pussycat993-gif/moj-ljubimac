-- households, household_memberships, household_invitations (TC §5.1):
-- BR-19, BR-20, BR-24, BR-47, BR-51 and columns/uniques/defaults.
-- Seeded users: Ivana (…01, Premium, owns household b1…01), Marko (…02, Free),
-- Jelena (…03, Free, member of b1…01).
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- Columns, types, uniques, defaults -------------------------------------------------------------
select enum_has_labels('public', 'invitation_status', array['pending', 'accepted', 'declined', 'expired'],
  'invitation statuses');

select columns_are('public', 'households', array[
  'id', 'owner_id', 'name', 'read_only', 'created_at', 'updated_at'
], 'households has the TC §5.1 columns');
select col_is_unique('public', 'households', 'owner_id', 'households.owner_id is unique');
select fk_ok('public', 'households', 'owner_id', 'public', 'profiles', 'id', 'owner_id references profiles');
select col_not_null('public', 'households', 'name', 'name is not null');
select col_not_null('public', 'households', 'read_only', 'read_only is not null');

select columns_are('public', 'household_memberships', array[
  'id', 'household_id', 'user_id', 'joined_at', 'reminders_enabled', 'created_at', 'updated_at'
], 'household_memberships has the TC §5.1 columns');
select col_is_unique('public', 'household_memberships', array['household_id', 'user_id'],
  'unique (household_id, user_id)');
select fk_ok('public', 'household_memberships', 'household_id', 'public', 'households', 'id',
  'household_id references households');
select col_not_null('public', 'household_memberships', 'joined_at', 'joined_at is not null');

select columns_are('public', 'household_invitations', array[
  'id', 'household_id', 'email', 'token_hash', 'expires_at', 'accepted_by', 'status', 'decided_at',
  'created_at', 'updated_at'
], 'household_invitations has the TC §5.1 columns');
select col_is_unique('public', 'household_invitations', 'token_hash', 'token_hash is unique');
select col_is_null('public', 'household_invitations', 'email', 'email is nullable (link invitations)');
select col_type_is('public', 'household_invitations', 'status', 'invitation_status', 'status uses the enum');
select col_default_is('public', 'household_invitations', 'status', 'pending', 'status defaults to pending');
select col_is_null('public', 'household_invitations', 'accepted_by', 'accepted_by is null until accepted');

-- ON DELETE behaviour of household_memberships.household_id (TC: on delete cascade)
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.household_memberships'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.household_memberships'::regclass and attname = 'household_id')]),
  'c', 'memberships are deleted with their household'
);
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.households'::regclass and contype = 'f'),
  'n', 'households.owner_id is set null when the owner is deleted'
);

-- BR-47: invitations are valid for 7 days by default
insert into public.household_invitations (household_id, email, token_hash)
values ('b1000000-0000-4000-8000-000000000001', 'gost@mojljubimac.test', 'hash-households-1');
select is(
  (select expires_at from public.household_invitations where token_hash = 'hash-households-1'),
  now() + interval '7 days', 'expires_at defaults to now() + 7 days (BR-47)'
);
select is(
  (select status::text from public.household_invitations where token_hash = 'hash-households-1'),
  'pending', 'a new invitation is pending'
);
select throws_ok(
  $$insert into public.household_invitations (household_id, token_hash)
    values ('b1000000-0000-4000-8000-000000000001', 'hash-households-1')$$,
  '23505', null, 'token_hash is unique'
);

-- BR-24: reminders for shared pets are off until the member switches them on ------------------
select col_default_is('public', 'household_memberships', 'reminders_enabled', 'false',
  'reminders_enabled defaults to false');
select is(
  (select reminders_enabled from public.household_memberships
   where household_id = 'b1000000-0000-4000-8000-000000000001'
     and user_id = 'a1000000-0000-4000-8000-000000000003'),
  false, 'the seeded member has reminders off'
);

-- BR-20: an owner owns at most one household ---------------------------------------------------
select throws_ok(
  $$insert into public.households (owner_id, name)
    values ('a1000000-0000-4000-8000-000000000001', 'Drugo domaćinstvo')$$,
  '23505', null, 'a second household for the same owner is rejected'
);

-- BR-19: read_only follows the owner's Premium ---------------------------------------------------
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  false, 'a Premium owner''s household is not read-only'
);
insert into public.households (id, owner_id, name, read_only)
values ('b1000000-0000-4000-8000-000000000099', 'a1000000-0000-4000-8000-000000000002',
        'Domaćinstvo Jovanović', false);
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000099'),
  true, 'a Free owner''s household is read-only, whatever the insert says'
);
insert into public.households (id, owner_id, name)
values ('b1000000-0000-4000-8000-000000000098', null, 'Bez vlasnika');
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000098'),
  true, 'a household without an owner is read-only'
);
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'trialing', now() + interval '7 days');
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000099'),
  false, 'the household clears read_only when its owner gets Premium'
);
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000002', 'breeder_monthly', 'active', now() + interval '1 month');
select is(
  (select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'),
  false, 'another owner''s subscription does not touch this household'
);

-- BR-20: a user may belong to several households ---------------------------------------------------
select lives_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000099', 'a1000000-0000-4000-8000-000000000003')$$,
  'a member of one household joins a second household'
);
select is(
  (select count(*)::int from public.household_memberships where user_id = 'a1000000-0000-4000-8000-000000000003'),
  2, 'the user now has two memberships'
);
select throws_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000099', 'a1000000-0000-4000-8000-000000000003')$$,
  '23505', null, 'the same user cannot join the same household twice'
);

-- BR-20 + BR-51: owner + 5 members accepted, the next membership raises household_full ----------
insert into auth.users (id, email)
select ('c5000000-0000-4000-8000-00000000000' || n)::uuid, 'clan-' || n || '@mojljubimac.test'
from generate_series(1, 5) n;
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
select ('c5000000-0000-4000-8000-00000000000' || n)::uuid, 'owner', 'x', now(), 'seed'
from generate_series(1, 5) n;

-- Household b1…01: owner Ivana + Jelena = 2 people.
select lives_ok(
  $$insert into public.household_memberships (household_id, user_id)
    select 'b1000000-0000-4000-8000-000000000001', ('c5000000-0000-4000-8000-00000000000' || n)::uuid
    from generate_series(1, 3) n$$,
  'three more members join (owner + 4 members = 5)'
);
select lives_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000004')$$,
  'the fifth member joins: owner + 5 members = 6'
);
select is(
  1 + (select count(*)::int from public.household_memberships
       where household_id = 'b1000000-0000-4000-8000-000000000001'),
  6, 'the household now has 6 people including the owner'
);
select throws_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000005')$$,
  'P0001', 'household_full', 'a sixth member (seventh person) raises household_full'
);
select throws_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'household_full', 'any further membership raises household_full'
);
delete from public.household_memberships
where household_id = 'b1000000-0000-4000-8000-000000000001'
  and user_id = 'c5000000-0000-4000-8000-000000000004';
select lives_ok(
  $$insert into public.household_memberships (household_id, user_id)
    values ('b1000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000005')$$,
  'after a member leaves, a new member fits again'
);

-- ON DELETE: deleting a household removes its memberships and invitations ---------------------------
delete from public.households where id = 'b1000000-0000-4000-8000-000000000099';
select is(
  (select count(*)::int from public.household_memberships
   where household_id = 'b1000000-0000-4000-8000-000000000099'),
  0, 'memberships go with the household'
);
select is(
  (select count(*)::int from public.household_memberships
   where user_id = 'a1000000-0000-4000-8000-000000000003'),
  1, 'the member keeps their other membership'
);

select * from finish();
rollback;
