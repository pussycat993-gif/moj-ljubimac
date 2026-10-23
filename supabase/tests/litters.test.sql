-- Litters (Step 26): FR-48 (EP-61 create_litter creates the litter and one pets row per offspring with litter_id,
-- the mother's species / breed, birth_date = born_on, offspring_status = available and a pet_status_history row
-- each), the EP-61 list (rpc:list_litters: items, eligible mothers / fathers, access), the EP-61 validation (both
-- father fields, a non-female mother, born_on in the future, count out of range), offspring status / price updates
-- (Data API, history trigger), BR-34 (a Volunteer of a breeder may write), E-21 (no breeder plan) and the role
-- errors. Seeded: breeder b2…02 (Nikola …05, admin, approved, no plan); shelter b2…01 (Milica …04) with Žuća.
-- Setup gives Nikola an active breeder plan, adds Jelena (…03) as a volunteer, and the kennel's breeding animals.
begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month', true);
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'volunteer');
insert into public.pets (id, organisation_id, name, species, breed, sex, birth_year, breeding_status) values
  ('f9260000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'Zlatni retriver',
   'female', 2021, 'active'),
  ('f9260000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Ares', 'dog', 'Zlatni retriver',
   'male', 2020, 'active'),
  ('f9260000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Daša', 'dog', 'Zlatni retriver',
   'female', 2015, 'retired');

-- EP-61 list before any litter (Nikola, breeder admin) ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;

select is(public.list_litters() -> 'items', '[]'::jsonb, 'S22 empty: items [] without litters');
select is(
  public.list_litters() -> 'eligible_mothers',
  '[{"name": "Bela", "pet_id": "f9260000-0000-4000-8000-000000000001"}]'::jsonb,
  'EP-61 eligible_mothers: female non-offspring pets with breeding_status = active');
select is(
  public.list_litters() -> 'eligible_fathers',
  '[{"name": "Ares", "pet_id": "f9260000-0000-4000-8000-000000000002"}]'::jsonb,
  'EP-61 eligible_fathers: male non-offspring pets with breeding_status = active');
select is(
  public.list_litters() -> 'access', '{"role": "org_admin", "can_edit": true, "can_delete": true}'::jsonb,
  'EP-61 access: the Admin of an approved breeder with a plan can edit');

-- FR-48: create with an outside sire ---------------------------------------------------------------------
create temp table created on commit drop as
select public.create_litter('f9260000-0000-4000-8000-000000000001', null, ' Rex ', current_date - 10, 3) as id;
grant select on created to authenticated;

select isnt((select id from created), null, 'FR-48: create_litter returns the litter id');
select is(
  (select row(l.organisation_id, l.mother_id, l.father_id, l.father_name, l.born_on, l.offspring_count)::text
   from public.litters l where l.id = (select id from created)),
  row('b2000000-0000-4000-8000-000000000002'::uuid, 'f9260000-0000-4000-8000-000000000001'::uuid, null::uuid,
      'Rex'::text, current_date - 10, 3::smallint)::text,
  'FR-48: the litter row (organisation, mother, outside sire trimmed, born_on, count)');
select is(
  (select count(*)::int from public.pets where litter_id = (select id from created)),
  3, 'FR-48: offspring_count = 3 → 3 pets rows linked to the litter');
select is(
  (select count(*)::int from public.pets
   where litter_id = (select id from created)
     and organisation_id = 'b2000000-0000-4000-8000-000000000002'
     and species = 'dog' and breed = 'Zlatni retriver'
     and birth_date = current_date - 10
     and offspring_status = 'available'
     and sex = 'unknown'
     and owner_id is null),
  3, 'FR-48: each offspring has the mother''s species / breed, birth_date = born_on, available, sex unknown');
select is(
  (select array_agg(name order by created_at, id) from public.pets where litter_id = (select id from created)),
  array['Mladunče 1', 'Mladunče 2', 'Mladunče 3'], 'EP-61: the offspring are named "Mladunče N"');
select is(
  (select count(*)::int from public.pet_status_history h
   join public.pets p on p.id = h.pet_id
   where p.litter_id = (select id from created) and h.status = 'available'
     and h.changed_by = 'a1000000-0000-4000-8000-000000000005'),
  3, 'FR-48: one pet_status_history row (available) per offspring, by the caller');

select is(jsonb_array_length(public.list_litters() -> 'items'), 1, 'S22 default: the new litter is listed');
select is(public.list_litters() #>> '{items,0,mother,name}', 'Bela', 'Litter.mother.name');
select is(public.list_litters() #>> '{items,0,breed}', 'Zlatni retriver', 'Litter.breed is the mother''s breed');
select is(public.list_litters() #>> '{items,0,father_name}', 'Rex', 'Litter.father_name = the outside sire');
select is((public.list_litters() #>> '{items,0,father_external}')::boolean, true, 'Litter.father_external');
select is((public.list_litters() #>> '{items,0,available_count}')::int, 3, 'Litter.available_count');
select is(
  (public.list_litters() #> '{items,0,offspring,0}') - 'pet_id'::text,
  '{"name": "Mladunče 1", "sex": "unknown", "price": null, "offspring_status": "available"}'::jsonb,
  'Litter.offspring[] shape, in creation order');

-- A sire of the kennel.
create temp table created_with_father on commit drop as
select public.create_litter('f9260000-0000-4000-8000-000000000001', 'f9260000-0000-4000-8000-000000000002', null,
  current_date - 400, 1) as id;
grant select on created_with_father to authenticated;
select is(
  (select l -> 'father_name' from jsonb_array_elements(public.list_litters() -> 'items') l
   where l ->> 'id' = (select id from created_with_father)::text),
  '"Ares"'::jsonb, 'Litter.father_name = the father''s pets.name');
select is(
  public.list_litters() #> '{items,0,id}', to_jsonb((select id from created)),
  'EP-61 list: items sorted by born_on desc');

-- EP-61 validation ----------------------------------------------------------------------------------------
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', 'f9260000-0000-4000-8000-000000000002', 'Rex', current_date, 2)$$,
  'P0001', 'validation_failed', 'FR-48: both father fields set → validation_failed');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000002', null, null, current_date, 2)$$,
  'P0001', 'validation_failed', 'FR-48: a non-female mother → validation_failed');
select throws_ok(
  $$select public.create_litter('c1000000-0000-4000-8000-000000000004', null, null, current_date, 2)$$,
  'P0001', 'validation_failed', 'EP-61: a mother of another organisation → validation_failed');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', 'f9260000-0000-4000-8000-000000000001', null, current_date, 2)$$,
  'P0001', 'validation_failed', 'EP-61: a father that is not a male of the organisation → validation_failed');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date + 2, 2)$$,
  'P0001', 'validation_failed', 'EP-61: born_on in the future → validation_failed');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date, 0)$$,
  'P0001', 'validation_failed', 'EP-61: offspring_count 0 → validation_failed');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date, 21)$$,
  'P0001', 'validation_failed', 'EP-61: offspring_count 21 → validation_failed');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, repeat('a', 121), current_date, 2)$$,
  'P0001', 'validation_failed', 'EP-61: father_name ≤ 120');
select is((select count(*)::int from public.litters), 2, 'a refused create leaves nothing behind');

-- EP-61 update offspring (Data API) -----------------------------------------------------------------------
update public.pets set offspring_status = 'reserved', price_minor = 12000000
where name = 'Mladunče 1' and litter_id = (select id from created);
select is(
  (select row(offspring_status, price_minor)::text from public.pets where name = 'Mladunče 1' and litter_id = (select id from created)),
  row('reserved'::public.offspring_status, 12000000)::text, 'EP-61 update: status and price are saved');
select is(
  (select count(*)::int from public.pet_status_history h join public.pets p on p.id = h.pet_id
   where p.name = 'Mladunče 1' and p.litter_id = (select id from created) and h.status = 'reserved'),
  1, 'EP-61 update: the status change writes pet_status_history');
select is(
  (select l #> '{offspring,0,price}' from jsonb_array_elements(public.list_litters() -> 'items') l
   where l ->> 'id' = (select id from created)::text),
  '{"amount_minor": 12000000, "currency": "RSD"}'::jsonb, 'Litter.offspring[].price is Money (RSD)');
select is(
  (select (l ->> 'available_count')::int from jsonb_array_elements(public.list_litters() -> 'items') l
   where l ->> 'id' = (select id from created)::text),
  2, 'available_count follows the status change');
select throws_ok(
  $$update public.pets set price_minor = -1 where name = 'Mladunče 2'$$,
  '23514', null, 'EP-61 update: a negative price is refused');
reset role;

-- BR-34: a Volunteer of the breeder writes but does not delete ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.list_litters() -> 'access', '{"role": "volunteer", "can_edit": true, "can_delete": false}'::jsonb,
  'EP-61 access for a Volunteer');
select isnt(
  public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date, 1), null,
  'EP-61: a Volunteer of a breeder creates a litter');
reset role;

-- E-21: no active breeder plan → read-only ------------------------------------------------------------------
update public.subscriptions set current_period_end = now() - interval '1 day'
where user_id = 'a1000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((public.list_litters() #>> '{access,can_edit}')::boolean, false, 'S22 read_only: no plan → can_edit = false');
select is(jsonb_array_length(public.list_litters() -> 'items'), 3, 'E-21: reads stay available without a plan');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date, 1)$$,
  'P0001', 'breeder_plan_required', 'E-21: create without a plan → breeder_plan_required');
select throws_ok(
  $$update public.pets set offspring_status = 'sold' where name = 'Mladunče 2'$$,
  'P0001', 'breeder_plan_required', 'E-21: an offspring status change without a plan → breeder_plan_required');
reset role;
update public.subscriptions set current_period_end = now() + interval '1 month'
where user_id = 'a1000000-0000-4000-8000-000000000005';

-- A pending organisation → organisation_pending_approval.
update public.organisations set approval_status = 'pending' where id = 'b2000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date, 1)$$,
  'P0001', 'organisation_pending_approval', 'EP-61: a pending organisation → organisation_pending_approval');
reset role;
update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000002';

-- Roles ---------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.list_litters()$$, 'P0001', 'forbidden_role', 'EP-61: a shelter → forbidden_role (list)');
select throws_ok(
  $$select public.create_litter('f9260000-0000-4000-8000-000000000001', null, null, current_date, 1)$$,
  'P0001', 'forbidden_role', 'EP-61: a shelter → forbidden_role (create)');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.list_litters()$$, 'P0001', 'not_found', 'EP-61: no organisation → not_found');
select throws_ok(
  $$insert into public.litters (organisation_id, mother_id, born_on, offspring_count)
    values ('b2000000-0000-4000-8000-000000000002', 'f9260000-0000-4000-8000-000000000001', current_date, 1)$$,
  '42501', null, 'litters has no client insert path (EP-61 goes through create_litter)');
reset role;

set local role anon;
select throws_ok($$select public.list_litters()$$, '42501', null, 'a Visitor cannot list litters');
reset role;

select * from finish();
rollback;
