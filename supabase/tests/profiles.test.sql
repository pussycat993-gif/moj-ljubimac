-- profiles: BR-30, BR-31 (data side), email sync, RLS and column grants.
-- Seeded users (supabase/seed.sql): Ivana (…01, Premium owner), Marko (…02, Free owner),
-- Jelena (…03, owner).
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- BR-30: one account type, owner / shelter / breeder, never null ------------------
select has_table('public', 'profiles', 'profiles exists');
select col_type_is('public', 'profiles', 'account_type', 'account_type', 'account_type uses the account_type enum');
select col_not_null('public', 'profiles', 'account_type', 'account_type is not null (BR-30)');
select enum_has_labels('public', 'account_type', array['owner', 'shelter', 'breeder'], 'account_type is owner / shelter / breeder');
select throws_ok(
  $$insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
    values ('a1000000-0000-4000-8000-000000000001', null, 'x@mojljubimac.test', now(), 'seed')$$,
  '23502', null, 'a profile without account_type is rejected'
);

-- Columns of TC §5.1 ---------------------------------------------------------------
select columns_are('public', 'profiles', array[
  'id', 'account_type', 'full_name', 'locale', 'city_id', 'email', 'is_operator', 'trial_used',
  'deletion_requested_at', 'deletion_due_at', 'terms_accepted_at', 'terms_version',
  'created_at', 'updated_at'
], 'profiles has exactly the TC §5.1 columns');
select col_default_is('public', 'profiles', 'locale', 'sr-Latn', 'locale defaults to sr-Latn');
select col_default_is('public', 'profiles', 'is_operator', 'false', 'is_operator defaults to false');
select fk_ok('public', 'profiles', 'city_id', 'public', 'cities', 'id', 'city_id references cities');
select has_index('public', 'profiles', 'profiles_deletion_due_at_idx', 'deletion_due_at is indexed');

-- BR-31: deletion_due_at = deletion_requested_at + 30 days, cleared with the request -
update public.profiles set deletion_requested_at = '2026-10-01 10:00:00+00'
where id = 'a1000000-0000-4000-8000-000000000003';
select is(
  (select deletion_due_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'),
  '2026-10-31 10:00:00+00'::timestamptz,
  'deletion_due_at is deletion_requested_at + 30 days'
);
update public.profiles set deletion_requested_at = null
where id = 'a1000000-0000-4000-8000-000000000003';
select is(
  (select deletion_due_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'),
  null,
  'deletion_due_at clears when the request is cleared'
);

-- Email sync: profiles.email follows auth.users.email ---------------------------------
update auth.users set email = 'marko.novi@mojljubimac.test'
where id = 'a1000000-0000-4000-8000-000000000002';
select is(
  (select email from public.profiles where id = 'a1000000-0000-4000-8000-000000000002'),
  'marko.novi@mojljubimac.test',
  'profiles.email follows an auth email change'
);

-- A new auth user without a profile, for the registration insert.
insert into auth.users (id, email) values ('b4000000-0000-4000-8000-000000000001', 'nova@mojljubimac.test');

-- RLS and column grants ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.profiles (id, account_type, locale, email, terms_accepted_at, terms_version)
    values ('b4000000-0000-4000-8000-000000000001', 'owner', 'en', 'spoofed@mojljubimac.test', now(), 'v1')$$,
  'a user inserts their own profile with the EP-41 columns'
);
select is(
  (select email from public.profiles where id = 'b4000000-0000-4000-8000-000000000001'),
  'nova@mojljubimac.test',
  'the inserted profile takes its email from auth.users'
);
select throws_ok(
  $$insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
    values ('a1000000-0000-4000-8000-000000000009', 'owner', 'x@mojljubimac.test', now(), 'v1')$$,
  '42501', null, 'a user cannot insert a profile for another id'
);
select throws_ok(
  $$insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version, is_operator)
    values ('b4000000-0000-4000-8000-000000000001', 'owner', 'x@mojljubimac.test', now(), 'v1', true)$$,
  '42501', null, 'is_operator cannot be set on insert'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'a user sees only their own profile');
select is(
  (select id from public.profiles),
  'a1000000-0000-4000-8000-000000000002'::uuid,
  'the visible profile is the caller''s'
);
update public.profiles set full_name = 'Hacked' where id = 'a1000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select full_name from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
  'Ivana Petrović',
  'another user''s profile cannot be updated'
);
set local role authenticated;
select lives_ok(
  $$update public.profiles set full_name = 'Marko J.', locale = 'en',
      city_id = (select id from public.cities where name_sr = 'Bečej')
    where id = 'a1000000-0000-4000-8000-000000000002'$$,
  'a user updates full_name, city_id and locale of their own profile'
);
select throws_ok(
  $$update public.profiles set is_operator = true where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'is_operator is not client-writable'
);
select throws_ok(
  $$update public.profiles set trial_used = true where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'trial_used is not client-writable'
);
select throws_ok(
  $$update public.profiles set deletion_requested_at = now() where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'deletion_requested_at is not client-writable'
);
select throws_ok(
  $$update public.profiles set deletion_due_at = now() where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'deletion_due_at is not client-writable'
);
select throws_ok(
  $$update public.profiles set email = 'x@mojljubimac.test' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'email is not client-writable'
);
select throws_ok(
  $$delete from public.profiles where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'profiles have no client delete'
);

-- EP-43: no profile edits while deletion is pending -------------------------------------
reset role;
update public.profiles set deletion_requested_at = now()
where id = 'a1000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.profiles set full_name = 'Jelena N.' where id = 'a1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'account_pending_deletion', 'profile update during the deletion window raises account_pending_deletion'
);

reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok(
  $$insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
    values ('b4000000-0000-4000-8000-000000000002', 'owner', 'x@mojljubimac.test', now(), 'v1')$$,
  '42501', null, 'anon cannot insert profiles'
);
reset role;

select * from finish();
rollback;
