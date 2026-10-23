-- EP-05 delete_pet (FR-13): the pets delete the action runs as the caller's session removes the
-- pet with every entry, attachment, moment and reminder in one statement, and every R2 key of
-- the pet lands in r2_deletion_queue. Member and Volunteer → forbidden_role (BR-25, BR-34).
-- Seeded: Ivana (…01, owner of Luna — full record, moments, reminders, shared with Jelena),
-- Jelena (…03, household member), Ana (…06), Nikola (…05, breeder admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- Setup (as postgres): Luna has a photo, an attachment on her vet visit and a moment photo.
update public.pets set photo_r2_key = 'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/photo/p1-luna.jpg'
where id = 'c1000000-0000-4000-8000-000000000001';
insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes, created_by) values (
  'c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/visits/c3000000-0000-4000-8000-000000000001/a1-nalaz.pdf',
  'nalaz.pdf', 'application/pdf', 1024, 'a1000000-0000-4000-8000-000000000001'
);
insert into public.moment_photos (moment_id, r2_key, position) values (
  'c4000000-0000-4000-8000-000000000001',
  'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/moments/c4000000-0000-4000-8000-000000000001/1-m1-terasa.jpg',
  1
);

create temp table luna_counts (tbl text, n int) on commit drop;
insert into luna_counts
select 'weight_entries', count(*) from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'vaccinations', count(*) from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'treatments', count(*) from public.treatments where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'vet_visits', count(*) from public.vet_visits where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'attachments', count(*) from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'feeding_entries', count(*) from public.feeding_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'stool_entries', count(*) from public.stool_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'moments', count(*) from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'reminders', count(*) from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001'
union all select 'household_pets', count(*) from public.household_pets where pet_id = 'c1000000-0000-4000-8000-000000000001';

select ok((select bool_and(n > 0) from luna_counts), 'setup: Luna has rows in every record, care-log, moment and reminder table');
select ok(
  (select count(*) from public.reminder_occurrences o join public.reminders r on r.id = o.reminder_id
   where r.pet_id = 'c1000000-0000-4000-8000-000000000001') > 0,
  'setup: Luna has reminder occurrences'
);
create temp table luna_ids on commit drop as
select
  (select array_agg(id) from public.treatments where pet_id = 'c1000000-0000-4000-8000-000000000001') as treatment_ids,
  (select array_agg(id) from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000001') as moment_ids,
  (select array_agg(id) from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001') as reminder_ids;
grant select on luna_ids to authenticated;

-- A household member may not delete (BR-25).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'forbidden_role', 'a household Member deleting the shared pet → forbidden_role'
);
reset role;
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 1, 'the pet is still there');

-- Another owner sees nothing to delete (no relation → the action answers not_found).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000001' returning id$$,
  'an unrelated owner deletes no row'
);
reset role;

-- The owner confirms "Da, obriši".
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000001' returning id$$,
  $$values ('c1000000-0000-4000-8000-000000000001'::uuid)$$,
  'FR-13: the owner deletes the pet'
);
reset role;

select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 0, 'pets row gone');
select is((select count(*)::int from public.weight_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'weight entries removed');
select is((select count(*)::int from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'vaccinations removed');
select is((select count(*)::int from public.treatments where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'treatments removed');
select is((select count(*)::int from public.dose_logs where treatment_id = any ((select treatment_ids from luna_ids)::uuid[])), 0, 'dose logs removed');
select is((select count(*)::int from public.vet_visits where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'vet visits removed');
select is((select count(*)::int from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'attachments removed');
select is((select count(*)::int from public.feeding_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'feeding entries removed');
select is((select count(*)::int from public.stool_entries where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'stool entries removed');
select is((select count(*)::int from public.moments where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'moments removed');
select is((select count(*)::int from public.moment_photos where moment_id = any ((select moment_ids from luna_ids)::uuid[])), 0, 'moment photos removed');
select is((select count(*)::int from public.moment_public_links where moment_id = any ((select moment_ids from luna_ids)::uuid[])), 0,
  'public links removed (EP-24 → 404)');
select is((select count(*)::int from public.reminders where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'reminders removed');
select is((select count(*)::int from public.reminder_occurrences where reminder_id = any ((select reminder_ids from luna_ids)::uuid[])), 0,
  'reminder occurrences removed');
select is((select count(*)::int from public.household_pets where pet_id = 'c1000000-0000-4000-8000-000000000001'), 0, 'household sharing removed');

-- Every R2 key of the pet is queued for the nightly cleanup (TC §5.9).
select ok(exists (select 1 from public.r2_deletion_queue where r2_key like '%/photo/p1-luna.jpg'), 'the pet photo key is queued');
select ok(exists (select 1 from public.r2_deletion_queue where r2_key like '%/visits/%/a1-nalaz.pdf'), 'the attachment key is queued');
select ok(exists (select 1 from public.r2_deletion_queue where r2_key like '%/moments/%/1-m1-terasa.jpg'), 'the moment photo key is queued');

-- Organisation animals: Volunteer ❌, Admin ✅ (BR-34).
insert into public.organisation_memberships (organisation_id, user_id, role)
values ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006', 'volunteer');
insert into public.pets (id, organisation_id, name, species, sex, breeding_status)
values ('c1300000-0000-4000-8000-000000000009', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'female', 'active');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$delete from public.pets where id = 'c1300000-0000-4000-8000-000000000009'$$,
  'P0001', 'forbidden_role', 'a Volunteer deleting an organisation animal → forbidden_role'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$delete from public.pets where id = 'c1300000-0000-4000-8000-000000000009' returning id$$,
  $$values ('c1300000-0000-4000-8000-000000000009'::uuid)$$,
  'an OrgAdmin deletes the organisation animal'
);
reset role;
select is((select count(*)::int from public.pets where id = 'c1300000-0000-4000-8000-000000000009'), 0, 'organisation animal gone');

select * from finish();
rollback;
