-- pets, memorial_records (TC §5.3), household_pets (TC §5.1): columns, enums, checks,
-- uniques, indexes and ON DELETE behaviour.
-- Seeded users: Ivana (…01, Premium), Marko (…02, Free); Milica's shelter (b2…01).
begin;
create extension if not exists pgtap with schema extensions;

select plan(44);

-- Enums ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'pet_species', array[
  'dog', 'cat', 'rabbit', 'hamster', 'guinea_pig', 'chinchilla', 'ferret', 'bird', 'fish',
  'turtle', 'lizard', 'snake', 'other'
], 'species');
select enum_has_labels('public', 'pet_sex', array['male', 'female', 'unknown'], 'sex');
select enum_has_labels('public', 'neutered_status', array['yes', 'no', 'unknown'], 'neutered');
select enum_has_labels('public', 'weight_unit', array['kg', 'g'], 'weight unit');
select enum_has_labels('public', 'pet_lifecycle', array['active', 'memorial'], 'lifecycle');
select enum_has_labels('public', 'shelter_status', array[
  'intake', 'in_care', 'available', 'reserved', 'adopted', 'deceased', 'returned_to_owner'
], 'shelter status');
select enum_has_labels('public', 'offspring_status', array['available', 'reserved', 'sold'], 'offspring status');
select enum_has_labels('public', 'breeding_status', array['active', 'retired'], 'breeding status');
select enum_has_labels('public', 'memorial_reason', array['passed_away', 'rehomed', 'lost'], 'memorial reason');

-- pets ----------------------------------------------------------------------------------------
select columns_are('public', 'pets', array[
  'id', 'owner_id', 'organisation_id', 'name', 'species', 'species_other', 'breed',
  'colour_markings', 'microchip_number', 'passport_number', 'note', 'sex', 'birth_date',
  'birth_year', 'neutered', 'photo_r2_key', 'vet_name', 'vet_phone', 'weight_unit', 'lifecycle',
  'shelter_status', 'offspring_status', 'breeding_status', 'litter_id', 'price_minor',
  'public_description', 'approx_age_text', 'created_at', 'updated_at'
], 'pets has the TC §5.3 columns');
select fk_ok('public', 'pets', 'owner_id', 'public', 'profiles', 'id', 'owner_id references profiles');
select fk_ok('public', 'pets', 'organisation_id', 'public', 'organisations', 'id',
  'organisation_id references organisations');
select col_not_null('public', 'pets', 'name', 'name is not null');
select col_not_null('public', 'pets', 'species', 'species is not null');
select col_not_null('public', 'pets', 'sex', 'sex is not null');
select col_type_is('public', 'pets', 'birth_year', 'smallint', 'birth_year is a smallint');
select col_default_is('public', 'pets', 'neutered', 'unknown', 'neutered defaults to unknown');
select col_default_is('public', 'pets', 'weight_unit', 'kg', 'weight_unit defaults to kg');
select col_default_is('public', 'pets', 'lifecycle', 'active', 'lifecycle defaults to active');
select col_type_is('public', 'pets', 'litter_id', 'uuid', 'litter_id is a uuid column');
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.pets'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.pets'::regclass and attname = 'litter_id')]),
  0, 'litter_id has no FK yet (Step 09)'
);
select has_index('public', 'pets', 'pets_owner_id_lifecycle_idx', array['owner_id', 'lifecycle'],
  'index (owner_id, lifecycle)');
select has_index('public', 'pets', 'pets_organisation_id_shelter_status_idx',
  array['organisation_id', 'shelter_status'], 'index (organisation_id, shelter_status)');
select has_index('public', 'pets', 'pets_organisation_id_offspring_status_idx',
  array['organisation_id', 'offspring_status'], 'index (organisation_id, offspring_status)');

-- owner XOR organisation
select throws_ok(
  $$insert into public.pets (name, species, sex) values ('Niko', 'dog', 'male')$$,
  '23514', null, 'a pet needs an owner or an organisation'
);
select throws_ok(
  $$insert into public.pets (owner_id, organisation_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
            'Oba', 'dog', 'male')$$,
  '23514', null, 'a pet cannot have both an owner and an organisation'
);
select lives_ok(
  $$insert into public.pets (organisation_id, name, species, sex)
    values ('b2000000-0000-4000-8000-000000000001', 'Bruno', 'dog', 'male')$$,
  'an organisation animal has no owner'
);

-- species_other required exactly when species = other
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1000000-0000-4000-8000-000000000001', 'Zvrk', 'other', 'unknown')$$,
  '23514', null, 'species other requires species_other'
);
select throws_ok(
  $$insert into public.pets (owner_id, name, species, species_other, sex)
    values ('a1000000-0000-4000-8000-000000000001', 'Zvrk', 'dog', 'jež', 'unknown')$$,
  '23514', null, 'species_other only with species other'
);
select lives_ok(
  $$insert into public.pets (id, owner_id, name, species, species_other, sex)
    values ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
            'Zvrk', 'other', 'jež', 'unknown')$$,
  'species other with species_other is accepted'
);
select throws_ok(
  $$insert into public.pets (organisation_id, name, species, sex, price_minor)
    values ('b2000000-0000-4000-8000-000000000001', 'Skupi', 'dog', 'male', -1)$$,
  '23514', null, 'price_minor is ≥ 0'
);

-- memorial_records ------------------------------------------------------------------------------
select columns_are('public', 'memorial_records', array[
  'id', 'pet_id', 'date', 'reason', 'note', 'created_at', 'updated_at'
], 'memorial_records has the TC §5.3 columns');
select col_is_unique('public', 'memorial_records', 'pet_id', 'one memorial record per pet');
select col_not_null('public', 'memorial_records', 'date', 'date is not null');
select col_type_is('public', 'memorial_records', 'reason', 'memorial_reason', 'reason uses the enum');
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.memorial_records'::regclass and contype = 'f'),
  'c', 'memorial records are deleted with their pet'
);

-- household_pets --------------------------------------------------------------------------------
select columns_are('public', 'household_pets', array[
  'household_id', 'pet_id', 'created_at', 'updated_at'
], 'household_pets has the TC §5.1 columns');
select col_is_pk('public', 'household_pets', array['household_id', 'pet_id'],
  'primary key (household_id, pet_id)');
select fk_ok('public', 'household_pets', 'household_id', 'public', 'households', 'id',
  'household_id references households');
select fk_ok('public', 'household_pets', 'pet_id', 'public', 'pets', 'id', 'pet_id references pets');
select is(
  (select confdeltype::text from pg_constraint
   where conrelid = 'public.household_pets'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                         where attrelid = 'public.household_pets'::regclass and attname = 'pet_id')]),
  'c', 'sharing rows are deleted with their pet'
);

-- RLS is on ------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.pets'::regclass), 'RLS on pets');
select ok((select relrowsecurity from pg_class where oid = 'public.memorial_records'::regclass),
  'RLS on memorial_records');
select ok((select relrowsecurity from pg_class where oid = 'public.household_pets'::regclass),
  'RLS on household_pets');

select * from finish();
rollback;
