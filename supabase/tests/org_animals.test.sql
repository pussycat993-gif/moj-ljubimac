-- Organisation animals (Step 24): FR-44 (no animal limit, full record for each), FR-45 (EP-55 status
-- change writes pet_status_history; create_intake writes pet + intake + history in one transaction),
-- FR-59 #1 / #2 (EP-54 list_org_animals search: substring, case- and diacritic-insensitive; no match →
-- items [], total 0), EP-54 filters, counts, sort and errors.
-- Seeded: shelter b2…01 (Milica …04, admin) with Žuća (c1…04, intake 2026-10-05, status available);
-- the shelter is approved in setup. Breeder b2…02 (Nikola …05). Ivana (…01) has no organisation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

-- FR-45 / EP-55 createIntake ---------------------------------------------------------------------
create temp table intake_result on commit drop as
select public.create_intake('Lúna', 'cat', null, 'female', 'domaća kratkodlaka', 'oko 2 godine',
  current_date - 3, 'found', 'Liman 3, kod parka', 'Uplašena') as j;

select is((select j ->> 'name' from intake_result), 'Lúna', 'createIntake returns the Intake (name)');
select is((select j ->> 'shelter_status' from intake_result), 'intake', 'the new animal starts in status intake');
select is((select j ->> 'arrival_type' from intake_result), 'found', 'the intake keeps the arrival type');
select is((select j ->> 'created_by' from intake_result), 'a1000000-0000-4000-8000-000000000004', 'created_by is the caller');
select is(
  (select organisation_id from public.pets where id = (select (j ->> 'pet_id')::uuid from intake_result)),
  'b2000000-0000-4000-8000-000000000001'::uuid, 'FR-45: the pet belongs to the caller''s organisation');
select is(
  (select owner_id from public.pets where id = (select (j ->> 'pet_id')::uuid from intake_result)),
  null, 'the pet has no personal owner');
select is(
  (select count(*)::int from public.intakes where pet_id = (select (j ->> 'pet_id')::uuid from intake_result)),
  1, 'FR-45: the intakes row is written');
select is(
  (select status from public.pet_status_history where pet_id = (select (j ->> 'pet_id')::uuid from intake_result)),
  'intake', 'FR-45: the first pet_status_history row is intake');
select is(
  (select changed_by from public.pet_status_history where pet_id = (select (j ->> 'pet_id')::uuid from intake_result)),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'FR-45: … with its author');
select isnt(
  (select changed_at from public.pet_status_history where pet_id = (select (j ->> 'pet_id')::uuid from intake_result)),
  null, 'FR-45: … and its time');

-- FR-44: more animals, no Free limit (BR-33).
select lives_ok(
  $$select public.create_intake('Šapa', 'dog', null, 'male', null, null, current_date - 10, 'surrendered', null, null)$$,
  'FR-44: a second animal');
select lives_ok(
  $$select public.create_intake('Maks', 'other', 'Tvor', 'unknown', null, null, current_date, 'confiscated', null, null)$$,
  'FR-44: a third animal (species other)');
select is((select count(*)::int from public.pets where organisation_id = 'b2000000-0000-4000-8000-000000000001'), 4,
  'FR-44: the organisation holds four animals');
select is(
  (select count(*)::int from public.pets p
   where p.organisation_id = 'b2000000-0000-4000-8000-000000000001'
     and public.get_pet_record(p.id) #>> '{pet,id}' = p.id::text),
  4, 'FR-44: EP-02 returns the full record for each animal');
select is(
  public.get_pet_record((select id from public.pets where name = 'Šapa')) #>> '{access,role}',
  'org_admin', 'FR-44: … with the organisation role');

-- Validation: one transaction, nothing written on failure.
select throws_ok(
  $$select public.create_intake('  ', 'dog', null, 'male', null, null, current_date, 'found', null, null)$$,
  'P0001', 'validation_failed', 'name is required');
select throws_ok(
  $$select public.create_intake('X', 'other', null, 'male', null, null, current_date, 'found', null, null)$$,
  'P0001', 'validation_failed', 'species_other is required for species other');
select throws_ok(
  $$select public.create_intake('X', 'dog', null, 'male', null, null, current_date + 2, 'found', null, null)$$,
  'P0001', 'validation_failed', 'intake_on may not be in the future');
select throws_ok(
  $$select public.create_intake('X', 'dog', null, 'male', null, null, current_date, 'stolen', null, null)$$,
  'P0001', 'validation_failed', 'arrival_type must be an enum value');
select is((select count(*)::int from public.pets where name = 'X'), 0, 'a refused intake writes nothing');

-- FR-45: a status change through EP-55 records status and time.
update public.pets set shelter_status = 'in_care' where name = 'Šapa';
select is(
  (select array_agg(status order by status) from public.pet_status_history
   where pet_id = (select id from public.pets where name = 'Šapa')),
  array['in_care', 'intake'], 'FR-45: the status change writes pet_status_history');
select is(
  (select count(*)::int from public.pet_status_history
   where pet_id = (select id from public.pets where name = 'Šapa') and status = 'in_care' and changed_at = now()),
  1, 'FR-45: … with changed_at');

-- EP-54 list ---------------------------------------------------------------------------------------
select is((public.list_org_animals() ->> 'total')::int, 4, 'EP-54 lists every animal of the organisation');
select is(
  (select array_agg(e ->> 'name' order by ord) from jsonb_array_elements(public.list_org_animals() -> 'items') with ordinality as t(e, ord)),
  array['Maks', 'Lúna', 'Šapa', 'Žuća'], 'shelter sort: intake_on desc');
select is(
  public.list_org_animals() -> 'items' -> 0 ->> 'status_kind', 'shelter', 'OrgAnimalRow.status_kind = shelter');
select is(
  public.list_org_animals() -> 'items' -> 0 ->> 'since_date', current_date::text, 'OrgAnimalRow.since_date = intake_on');
select is(
  public.list_org_animals() -> 'status_counts',
  '{"intake": 2, "in_care": 1, "available": 1, "reserved": 0, "adopted": 0, "deceased": 0, "returned_to_owner": 0}'::jsonb,
  'status_counts per shelter status, over all animals');
select is((public.list_org_animals(null, 'in_care') ->> 'total')::int, 1, 'p_status filters');
select is(
  public.list_org_animals(null, 'in_care') -> 'status_counts' ->> 'intake', '2', 'status_counts ignore p_status');
select is(jsonb_array_length(public.list_org_animals(null, null, 2, 0) -> 'items'), 2, 'p_limit pages');
select is((public.list_org_animals(null, null, 2, 2) -> 'items' -> 0 ->> 'name'), 'Šapa', 'p_offset pages');

-- FR-59 #1 / #2: search.
select is(
  (select array_agg(e ->> 'name') from jsonb_array_elements(public.list_org_animals('luna') -> 'items') e),
  array['Lúna'], 'FR-59 #1: "luna" matches "Lúna"');
select is(
  (select array_agg(e ->> 'name') from jsonb_array_elements(public.list_org_animals('sapa') -> 'items') e),
  array['Šapa'], 'FR-59 #1: "sapa" matches "Šapa"');
select is(
  (select array_agg(e ->> 'name') from jsonb_array_elements(public.list_org_animals('UĆ') -> 'items') e),
  array['Žuća'], 'FR-59 #1: a substring in any case and diacritics ("UĆ" matches "Žuća")');
select is(public.list_org_animals('xyz') - 'status_counts', '{"items": [], "total": 0}'::jsonb,
  'FR-59 #2: no match → items [] and total 0');

-- Errors.
select throws_ok($$select public.list_org_animals(null, 'sold')$$, 'P0001', 'validation_failed',
  'an unknown p_status for a shelter → validation_failed');
select throws_ok($$select public.list_org_animals(null, null, 51)$$, 'P0001', 'validation_failed',
  'p_limit > 50 → validation_failed');

reset role;

select * from finish();
rollback;
