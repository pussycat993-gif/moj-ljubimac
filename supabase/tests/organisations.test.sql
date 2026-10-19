-- organisations, organisation_memberships, organisation_invitations (TC §5.2):
-- BR-32, BR-34, BR-47 and columns/uniques/defaults.
-- Seeded: shelter b2…01 (Milica …04, admin, pending), breeder b2…02 (Nikola …05, admin, approved).
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- Columns, types, uniques, defaults -------------------------------------------------------------
select enum_has_labels('public', 'organisation_type', array['shelter', 'breeder'], 'organisation types');
select enum_has_labels('public', 'approval_status', array['pending', 'approved', 'rejected'], 'approval statuses');
select enum_has_labels('public', 'organisation_role', array['admin', 'volunteer'], 'team roles (BR-34)');

select columns_are('public', 'organisations', array[
  'id', 'type', 'name', 'slug', 'city_id', 'approval_status', 'rejection_reason', 'tax_id',
  'registration_note', 'description', 'phone', 'email', 'website', 'logo_r2_key', 'created_by',
  'created_at', 'updated_at'
], 'organisations has the TC §5.2 columns');
select col_not_null('public', 'organisations', 'type', 'type is not null');
select col_not_null('public', 'organisations', 'name', 'name is not null');
select col_is_unique('public', 'organisations', 'slug', 'slug is unique');
select col_type_is('public', 'organisations', 'approval_status', 'approval_status', 'approval_status uses the enum');
select fk_ok('public', 'organisations', 'city_id', 'public', 'cities', 'id', 'city_id references cities');
select fk_ok('public', 'organisations', 'created_by', 'public', 'profiles', 'id', 'created_by references profiles');

select columns_are('public', 'organisation_memberships', array[
  'id', 'organisation_id', 'user_id', 'role', 'created_at', 'updated_at'
], 'organisation_memberships has the TC §5.2 columns');
select col_not_null('public', 'organisation_memberships', 'role', 'role is not null');
select col_type_is('public', 'organisation_memberships', 'role', 'organisation_role', 'role uses the enum');
select col_is_unique('public', 'organisation_memberships', array['organisation_id', 'user_id'],
  'unique (organisation_id, user_id)');

select columns_are('public', 'organisation_invitations', array[
  'id', 'organisation_id', 'email', 'role', 'token_hash', 'expires_at', 'status', 'accepted_by',
  'created_at', 'updated_at'
], 'organisation_invitations has the TC §5.2 columns');
select col_not_null('public', 'organisation_invitations', 'email', 'email is not null');
select col_not_null('public', 'organisation_invitations', 'role', 'role is not null');
select col_is_unique('public', 'organisation_invitations', 'token_hash', 'token_hash is unique');
select col_type_is('public', 'organisation_invitations', 'status', 'invitation_status', 'status uses the enum');
select col_default_is('public', 'organisation_invitations', 'status', 'pending', 'status defaults to pending');

-- BR-47: team invitations are valid for 7 days by default
insert into public.organisation_invitations (organisation_id, email, role, token_hash)
values ('b2000000-0000-4000-8000-000000000002', 'tim@mojljubimac.test', 'volunteer', 'hash-org-1');
select is(
  (select expires_at from public.organisation_invitations where token_hash = 'hash-org-1'),
  now() + interval '7 days', 'expires_at defaults to now() + 7 days (BR-47)'
);
select throws_ok(
  $$insert into public.organisation_invitations (organisation_id, email, role, token_hash)
    values ('b2000000-0000-4000-8000-000000000002', 'drugi@mojljubimac.test', 'admin', 'hash-org-1')$$,
  '23505', null, 'token_hash is unique'
);

-- ON DELETE cascade from organisations
select is(
  (select array_agg(confdeltype::text order by conrelid::regclass::text)
   from pg_constraint
   where contype = 'f'
     and conrelid in ('public.organisation_memberships'::regclass, 'public.organisation_invitations'::regclass)
     and confrelid = 'public.organisations'::regclass),
  array['c', 'c'], 'team rows and invitations are deleted with their organisation'
);

-- BR-32: shelters start pending, breeders approved ----------------------------------------------
select is(
  (select approval_status::text from public.organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  'pending', 'the seeded shelter is pending'
);
select is(
  (select approval_status::text from public.organisations where id = 'b2000000-0000-4000-8000-000000000002'),
  'approved', 'the seeded breeder is approved'
);
insert into public.organisations (id, type, name, slug, approval_status)
values ('b2000000-0000-4000-8000-000000000011', 'shelter', 'Novi azil', 'novi-azil', 'approved');
select is(
  (select approval_status::text from public.organisations where id = 'b2000000-0000-4000-8000-000000000011'),
  'pending', 'a new shelter starts pending, whatever the insert says'
);
insert into public.organisations (id, type, name, slug, approval_status)
values ('b2000000-0000-4000-8000-000000000012', 'breeder', 'Nova odgajivačnica', 'nova-odgajivacnica', 'rejected');
select is(
  (select approval_status::text from public.organisations where id = 'b2000000-0000-4000-8000-000000000012'),
  'approved', 'a new breeder starts approved, whatever the insert says'
);
select lives_ok(
  $$update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000011'$$,
  'the Operator path (service side) can approve a shelter'
);
select throws_ok(
  $$insert into public.organisations (type, name, slug) values ('shelter', 'Isti slug', 'novi-azil')$$,
  '23505', null, 'a duplicate slug is rejected'
);

-- BR-34: at most 20 users per team ------------------------------------------------------------------
insert into auth.users (id, email)
select ('c7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'tim-' || n || '@mojljubimac.test'
from generate_series(1, 20) n;
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
select ('c7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'owner', 'x', now(), 'seed'
from generate_series(1, 20) n;

-- Breeder b2…02 has Nikola as admin (1 member).
select lives_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    select 'b2000000-0000-4000-8000-000000000002',
           ('c7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'volunteer'
    from generate_series(1, 18) n$$,
  '18 volunteers join (19 members)'
);
select lives_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000019', 'admin')$$,
  'the 20th member joins'
);
select is(
  (select count(*)::int from public.organisation_memberships
   where organisation_id = 'b2000000-0000-4000-8000-000000000002'),
  20, 'the team has 20 users'
);
select throws_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000020', 'volunteer')$$,
  'P0001', 'team_full', 'the 21st member raises team_full'
);
select lives_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000020', 'volunteer')$$,
  'the limit is per organisation'
);
select throws_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000020', 'admin')$$,
  '23505', null, 'the same user cannot join the same team twice'
);
select throws_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', null)$$,
  '23502', null, 'role is required'
);

delete from public.organisations where id = 'b2000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.organisation_memberships
   where organisation_id = 'b2000000-0000-4000-8000-000000000002'),
  0, 'memberships go with the organisation'
);

select * from finish();
rollback;
