-- Free limits on pets and memorials (BR-01, BR-02, BR-03; E-02, E-03, E-26) and
-- organisation animals (BR-33).
-- Seeded: Ivana (…01, Premium; Luna, Maks), Marko (…02, Free; Kiki c1…03),
-- Milica (…04, shelter account, admin of shelter b2…01), Nikola (…05, breeder account,
-- admin of kennel b2…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- BR-01 / E-26: a second active pet on Free --------------------------------------------------
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000002', 'Bruno', 'dog', 'male')$$,
  'P0001', 'premium_required:pets', 'a Free owner cannot create a second active pet'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000002', 'Bruno', 'dog', 'male')$$,
  'P0001', 'premium_required:pets', 'the same limit holds for the owner''s own session'
);
reset role;

-- BR-03: a memorial frees the active slot ----------------------------------------------------
select lives_ok(
  $$update public.pets set lifecycle = 'memorial' where id = 'c1000000-0000-4000-8000-000000000003'$$,
  'Kiki moves to memorial (first memorial)'
);
select lives_ok(
  $$insert into public.pets (id, owner_id, name, species, sex)
    values ('e2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
            'Bruno', 'dog', 'male')$$,
  'with the only active pet in memorial, a new active pet is allowed'
);

-- E-03: restore into a taken slot ------------------------------------------------------------
select throws_ok(
  $$update public.pets set lifecycle = 'active' where id = 'c1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'premium_required:pets', 'restoring a memorial while the active slot is taken is blocked'
);

-- E-02: third memorial -----------------------------------------------------------------------
select lives_ok(
  $$update public.pets set lifecycle = 'memorial' where id = 'e2000000-0000-4000-8000-000000000001'$$,
  'second memorial is allowed'
);
select lives_ok(
  $$insert into public.pets (id, owner_id, name, species, sex)
    values ('e2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002',
            'Lola', 'cat', 'female')$$,
  'a new active pet after two memorials'
);
select throws_ok(
  $$update public.pets set lifecycle = 'memorial' where id = 'e2000000-0000-4000-8000-000000000002'$$,
  'P0001', 'premium_required:memorials', 'a Free owner cannot have a third memorial'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex, lifecycle)
    values ('a1000000-0000-4000-8000-000000000002', 'Mica', 'cat', 'female', 'memorial')$$,
  'P0001', 'premium_required:memorials', 'nor insert one directly as a memorial'
);
select is(
  (select count(*)::int from public.pets
   where owner_id = 'a1000000-0000-4000-8000-000000000002' and lifecycle = 'memorial'),
  2, 'Marko keeps exactly 2 memorials'
);

-- Restore into a free slot ---------------------------------------------------------------------
delete from public.pets where id = 'e2000000-0000-4000-8000-000000000002';
select lives_ok(
  $$update public.pets set lifecycle = 'active' where id = 'c1000000-0000-4000-8000-000000000003'$$,
  'restoring a memorial into a free slot is allowed'
);

-- BR-02: Premium has no pet or memorial limit ------------------------------------------------
select lives_ok(
  $$insert into public.pets (owner_id, name, species, sex) values
      ('a1000000-0000-4000-8000-000000000001', 'Bela', 'dog', 'female'),
      ('a1000000-0000-4000-8000-000000000001', 'Nala', 'cat', 'female')$$,
  'a Premium owner adds more active pets'
);
select lives_ok(
  $$update public.pets set lifecycle = 'memorial'
    where owner_id = 'a1000000-0000-4000-8000-000000000001'$$,
  'a Premium owner moves four pets to memorial'
);
select lives_ok(
  $$update public.pets set lifecycle = 'active'
    where owner_id = 'a1000000-0000-4000-8000-000000000001'$$,
  'and restores them all'
);

-- When Premium ends the Free limits apply again.
update public.subscriptions set status = 'expired'
where user_id = 'a1000000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000001', 'Feđa', 'dog', 'male')$$,
  'P0001', 'premium_required:pets', 'an owner whose Premium expired is limited again'
);

-- BR-33: organisation animals are unlimited; organisation accounts own no personal pets ----------
select lives_ok(
  $$insert into public.pets (organisation_id, name, species, sex, shelter_status) values
      ('b2000000-0000-4000-8000-000000000001', 'Garfild', 'cat', 'male', 'in_care'),
      ('b2000000-0000-4000-8000-000000000001', 'Mrvica', 'cat', 'unknown', 'available'),
      ('b2000000-0000-4000-8000-000000000002', 'Zlatko', 'dog', 'male', null)$$,
  'organisations add any number of animals'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000004', 'Mica', 'cat', 'female')$$,
  'P0001', 'forbidden_role', 'a shelter account cannot own a personal pet'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000005', 'Rocko', 'dog', 'male')$$,
  'P0001', 'forbidden_role', 'a breeder account cannot own a personal pet'
);

select * from finish();
rollback;
