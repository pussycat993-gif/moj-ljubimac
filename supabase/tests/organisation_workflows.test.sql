-- intakes, pet_status_history, adoption_requests, breeder_inquiries, litters,
-- record_transfers (TC §5.6): columns, enums, checks, uniques, the pets.litter_id FK
-- (FR-48) and the status-history trigger (FR-45).
-- Seeded: shelter b2…01 (Milica …04, admin), breeder b2…02 (Nikola …05, admin),
-- shelter animal Žuća (c1…04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(68);

-- Enums ---------------------------------------------------------------------------------------
select enum_has_labels('public', 'shelter_status', array[
  'intake', 'in_care', 'available', 'reserved', 'adopted', 'deceased', 'returned_to_owner'
], 'BR-35: shelter statuses are exactly Intake … Adopted, Deceased, Returned to owner');
select enum_has_labels('public', 'arrival_type', array['found', 'surrendered', 'confiscated', 'other'],
  'arrival type');
select enum_has_labels('public', 'request_status', array['pending', 'accepted', 'rejected'],
  'request status');

-- intakes -------------------------------------------------------------------------------------
select columns_are('public', 'intakes', array[
  'id', 'pet_id', 'intake_on', 'arrival_type', 'place_found', 'note', 'created_by',
  'created_at', 'updated_at'
], 'intakes has the TC §5.6 columns');
select fk_ok('public', 'intakes', 'pet_id', 'public', 'pets', 'id', 'intakes.pet_id references pets');
select col_is_unique('public', 'intakes', 'pet_id', 'one intake per pet');
select col_not_null('public', 'intakes', 'intake_on', 'intake_on is not null');
select col_not_null('public', 'intakes', 'arrival_type', 'arrival_type is not null');
select fk_ok('public', 'intakes', 'created_by', 'public', 'profiles', 'id', 'intakes.created_by references profiles');

-- pet_status_history --------------------------------------------------------------------------
select columns_are('public', 'pet_status_history', array[
  'id', 'pet_id', 'status', 'changed_at', 'changed_by', 'created_at', 'updated_at'
], 'pet_status_history has the TC §5.6 columns');
select fk_ok('public', 'pet_status_history', 'pet_id', 'public', 'pets', 'id',
  'pet_status_history.pet_id references pets');
select col_type_is('public', 'pet_status_history', 'status', 'text', 'status is text');
select col_not_null('public', 'pet_status_history', 'status', 'status is not null');
select col_not_null('public', 'pet_status_history', 'changed_at', 'changed_at is not null');
select fk_ok('public', 'pet_status_history', 'changed_by', 'public', 'profiles', 'id',
  'changed_by references profiles');

-- adoption_requests / breeder_inquiries -------------------------------------------------------
select columns_are('public', 'adoption_requests', array[
  'id', 'pet_id', 'requester_id', 'name', 'phone', 'email', 'message', 'status', 'decided_by',
  'decided_at', 'created_at', 'updated_at'
], 'adoption_requests has the TC §5.6 columns');
select columns_are('public', 'breeder_inquiries', array[
  'id', 'pet_id', 'requester_id', 'name', 'phone', 'email', 'message', 'status', 'decided_by',
  'decided_at', 'created_at', 'updated_at'
], 'breeder_inquiries has the same columns as adoption_requests');
select fk_ok('public', 'adoption_requests', 'pet_id', 'public', 'pets', 'id', 'adoption_requests.pet_id references pets');
select fk_ok('public', 'adoption_requests', 'requester_id', 'public', 'profiles', 'id',
  'adoption_requests.requester_id references profiles');
select fk_ok('public', 'breeder_inquiries', 'pet_id', 'public', 'pets', 'id', 'breeder_inquiries.pet_id references pets');
select fk_ok('public', 'breeder_inquiries', 'requester_id', 'public', 'profiles', 'id',
  'breeder_inquiries.requester_id references profiles');
select col_not_null('public', 'adoption_requests', 'name', 'name is not null');
select col_not_null('public', 'adoption_requests', 'phone', 'phone is not null');
select col_not_null('public', 'adoption_requests', 'email', 'email is not null');
select col_default_is('public', 'adoption_requests', 'status', 'pending', 'adoption request status defaults to pending');
select col_default_is('public', 'breeder_inquiries', 'status', 'pending', 'inquiry status defaults to pending');
select col_type_is('public', 'breeder_inquiries', 'status', 'request_status', 'inquiry status uses request_status');

-- litters -------------------------------------------------------------------------------------
select columns_are('public', 'litters', array[
  'id', 'organisation_id', 'mother_id', 'father_id', 'father_name', 'born_on', 'offspring_count',
  'created_at', 'updated_at'
], 'litters has the TC §5.6 columns');
select fk_ok('public', 'litters', 'organisation_id', 'public', 'organisations', 'id',
  'litters.organisation_id references organisations');
select fk_ok('public', 'litters', 'mother_id', 'public', 'pets', 'id', 'mother_id references pets');
select fk_ok('public', 'litters', 'father_id', 'public', 'pets', 'id', 'father_id references pets');
select col_not_null('public', 'litters', 'mother_id', 'mother_id is not null');
select col_not_null('public', 'litters', 'born_on', 'born_on is not null');
select col_type_is('public', 'litters', 'offspring_count', 'smallint', 'offspring_count is a smallint');

-- FR-48: pets.litter_id references litters
select fk_ok('public', 'pets', 'litter_id', 'public', 'litters', 'id', 'FR-48: pets.litter_id references litters');

-- record_transfers ----------------------------------------------------------------------------
select columns_are('public', 'record_transfers', array[
  'id', 'pet_id', 'from_organisation_id', 'recipient_email', 'token_hash', 'expires_at',
  'accepted_by', 'accepted_at', 'status', 'new_pet_id', 'created_at', 'updated_at'
], 'record_transfers has the TC §5.6 columns');
select fk_ok('public', 'record_transfers', 'pet_id', 'public', 'pets', 'id', 'record_transfers.pet_id references pets');
select fk_ok('public', 'record_transfers', 'from_organisation_id', 'public', 'organisations', 'id',
  'from_organisation_id references organisations');
select fk_ok('public', 'record_transfers', 'new_pet_id', 'public', 'pets', 'id', 'new_pet_id references pets');
select col_not_null('public', 'record_transfers', 'recipient_email', 'recipient_email is not null');
select col_is_unique('public', 'record_transfers', 'token_hash', 'token_hash is unique');
select col_type_is('public', 'record_transfers', 'status', 'invitation_status', 'transfer status enum');
select col_default_is('public', 'record_transfers', 'status', 'pending', 'transfer status defaults to pending');

-- Setup: breeder animals (as postgres) --------------------------------------------------------
insert into public.pets (id, organisation_id, name, species, sex, breed, breeding_status) values
  ('f9000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'female', 'Samojed', 'active'),
  ('f9000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Ares', 'dog', 'male', 'Samojed', 'active');

-- Father check (at most one of father_id, father_name) ----------------------------------------
select throws_ok(
  $$insert into public.litters (organisation_id, mother_id, father_id, father_name, born_on, offspring_count)
    values ('b2000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001',
            'f9000000-0000-4000-8000-000000000002', 'Spoljni pastuv', '2026-09-01', 3)$$,
  '23514', null, 'both father_id and father_name are refused'
);
select lives_ok(
  $$insert into public.litters (organisation_id, mother_id, father_name, born_on, offspring_count)
    values ('b2000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001',
            'Spoljni pastuv', '2026-08-01', 2)$$,
  'an outside sire by name only is allowed'
);
select lives_ok(
  $$insert into public.litters (organisation_id, mother_id, born_on, offspring_count)
    values ('b2000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001', '2026-07-01', 1)$$,
  'a litter without a father is allowed'
);
select throws_ok(
  $$insert into public.litters (organisation_id, mother_id, born_on, offspring_count)
    values ('b2000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001', '2026-07-01', 0)$$,
  '23514', null, 'offspring_count must be > 0'
);

insert into public.litters (id, organisation_id, mother_id, father_id, born_on, offspring_count) values
  ('f9100000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002',
   'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', '2026-09-01', 1);
select lives_ok(
  $$insert into public.pets (id, organisation_id, litter_id, name, species, sex, birth_date, offspring_status)
    values ('f9000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002',
            'f9100000-0000-4000-8000-000000000001', 'Mladunče 1', 'dog', 'unknown', '2026-09-01', 'available')$$,
  'FR-48: an offspring pet record links to its litter'
);
select throws_ok(
  $$insert into public.pets (organisation_id, litter_id, name, species, sex)
    values ('b2000000-0000-4000-8000-000000000002', 'f9100000-0000-4000-8000-0000000000ff', 'X', 'dog', 'unknown')$$,
  '23503', null, 'FR-48: litter_id must reference an existing litter'
);

-- FR-45: status changes are recorded ----------------------------------------------------------
update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
update public.pets set shelter_status = 'in_care' where id = 'c1000000-0000-4000-8000-000000000004';
reset role;

select is(
  (select status from public.pet_status_history
   where pet_id = 'c1000000-0000-4000-8000-000000000004' order by changed_at desc, created_at desc limit 1),
  'in_care', 'FR-45: a shelter_status change records the new status'
);
select is(
  (select changed_by from public.pet_status_history
   where pet_id = 'c1000000-0000-4000-8000-000000000004' and status = 'in_care'),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'FR-45: … with its author'
);
select is(
  (select changed_at from public.pet_status_history
   where pet_id = 'c1000000-0000-4000-8000-000000000004' and status = 'in_care'),
  now(), 'FR-45: … and the time of the change'
);

-- Step 24: offspring status changes need an active breeder plan (BR-11, owner decision) — fixture.
insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
update public.pets set offspring_status = 'reserved' where id = 'f9000000-0000-4000-8000-000000000003';
update public.pets set breeding_status = 'retired' where id = 'f9000000-0000-4000-8000-000000000002';
update public.pets set name = 'Bela II' where id = 'f9000000-0000-4000-8000-000000000001';
update public.pets set breeding_status = 'active' where id = 'f9000000-0000-4000-8000-000000000001';
reset role;

select is(
  (select array_agg(status) from public.pet_status_history where pet_id = 'f9000000-0000-4000-8000-000000000003'),
  array['reserved'], 'FR-45: an offspring_status change records the new status'
);
select is(
  (select changed_by from public.pet_status_history where pet_id = 'f9000000-0000-4000-8000-000000000003'),
  'a1000000-0000-4000-8000-000000000005'::uuid, 'FR-45: … with its author'
);
select is(
  (select array_agg(status) from public.pet_status_history where pet_id = 'f9000000-0000-4000-8000-000000000002'),
  array['retired'], 'FR-45: a breeding_status change records the new status'
);
select is(
  (select count(*)::int from public.pet_status_history where pet_id = 'f9000000-0000-4000-8000-000000000001'),
  0, 'no row when no status changes (other columns, or the same status again)'
);

-- System change (no session): recorded without an author.
select set_config('request.jwt.claims', '', true);
update public.pets set shelter_status = 'available' where id = 'c1000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::int from public.pet_status_history
   where pet_id = 'c1000000-0000-4000-8000-000000000004' and status = 'available' and changed_by is null),
  1, 'a System status change is recorded too'
);

-- Clearing a status (null) records nothing.
update public.pets set offspring_status = null where id = 'f9000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.pet_status_history where pet_id = 'f9000000-0000-4000-8000-000000000003'),
  1, 'clearing a status records no row'
);

-- Several statuses changed at once → one row each.
update public.pets set offspring_status = 'sold', breeding_status = 'retired'
where id = 'f9000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.pet_status_history where pet_id = 'f9000000-0000-4000-8000-000000000003'),
  3, 'two status columns changed together record two rows'
);

-- ON DELETE behaviour -------------------------------------------------------------------------
insert into public.record_transfers (pet_id, from_organisation_id, recipient_email, token_hash) values
  ('c1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'novi@mojljubimac.test', 'hash-ow-1');
select is(
  (select expires_at from public.record_transfers where token_hash = 'hash-ow-1'),
  now() + interval '30 days', 'a transfer is valid 30 days by default (BR-38)'
);
select throws_ok(
  $$insert into public.record_transfers (pet_id, from_organisation_id, recipient_email, token_hash)
    values ('c1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'x@mojljubimac.test', 'hash-ow-1')$$,
  '23505', null, 'token_hash is unique'
);
select throws_ok(
  $$insert into public.intakes (pet_id, intake_on, arrival_type, created_by)
    values ('c1000000-0000-4000-8000-000000000004', '2026-10-06', 'other', 'a1000000-0000-4000-8000-000000000004')$$,
  '23505', null, 'a pet has at most one intake'
);
select throws_ok(
  $$insert into public.intakes (pet_id, intake_on, arrival_type)
    values ('f9000000-0000-4000-8000-000000000001', '2026-10-06', 'other')$$,
  'P0001', 'internal_error', 'an intake without an author is refused at creation'
);

delete from public.pets where id = 'c1000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::int from public.intakes where pet_id = 'c1000000-0000-4000-8000-000000000004'),
  0, 'deleting the pet removes its intake'
);
select is(
  (select count(*)::int from public.pet_status_history where pet_id = 'c1000000-0000-4000-8000-000000000004'),
  0, 'deleting the pet removes its status history'
);
select is(
  (select count(*)::int from public.adoption_requests where pet_id = 'c1000000-0000-4000-8000-000000000004'),
  0, 'deleting the pet removes its adoption requests'
);
select is(
  (select count(*)::int from public.record_transfers where pet_id = 'c1000000-0000-4000-8000-000000000004'),
  0, 'deleting the pet removes its transfers'
);

delete from public.litters where id = 'f9100000-0000-4000-8000-000000000001';
select is(
  (select litter_id from public.pets where id = 'f9000000-0000-4000-8000-000000000003'),
  null, 'deleting a litter keeps the offspring and clears litter_id'
);

select * from finish();
rollback;
