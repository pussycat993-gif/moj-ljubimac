-- R2 keys queued in r2_deletion_queue when rows are deleted (TC §5.9, API §10 step 7):
-- deleting an attachment, a vet visit, or a pet with a photo and attachments.
-- Seeded: Ivana (…01, Premium) owns Luna (c1…01, vet visit c3…01).
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

update public.pets
set photo_r2_key = 'u/a1/pets/c1-luna/photo/1-luna.jpg'
where id = 'c1000000-0000-4000-8000-000000000001';

insert into public.vet_visits (id, pet_id, visited_on, reason, created_by) values
  ('e5000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', current_date,
   'Kontrola', 'a1000000-0000-4000-8000-000000000001');

insert into public.attachments (id, vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by) values
  ('e5000000-0000-4000-8000-000000000011', 'c3000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'u/a1/pets/c1/visits/c3/1-nalaz.pdf', 'application/pdf', 800000,
   'a1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000012', 'c3000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'u/a1/pets/c1/visits/c3/2-krvna-slika.pdf', 'application/pdf', 1200000,
   'a1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000013', 'e5000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'u/a1/pets/c1/visits/e5/3-zubi.jpg', 'image/jpeg', 3400000,
   'a1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000014', 'e5000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'u/a1/pets/c1/visits/e5/4-rendgen.jpg', 'image/jpeg', 2000000,
   'a1000000-0000-4000-8000-000000000001');

select is((select count(*)::int from public.r2_deletion_queue), 0, 'the queue starts empty');

-- Deleting one attachment (EP-14), as the owner.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
delete from public.attachments where id = 'e5000000-0000-4000-8000-000000000011';
reset role;
select results_eq(
  $$select r2_key from public.r2_deletion_queue$$,
  $$values ('u/a1/pets/c1/visits/c3/1-nalaz.pdf')$$,
  'deleting an attachment queues its key'
);

-- Deleting a vet visit removes its attachments and queues their keys.
set local role authenticated;
delete from public.vet_visits where id = 'e5000000-0000-4000-8000-000000000001';
reset role;
select is((select count(*)::int from public.attachments where vet_visit_id = 'e5000000-0000-4000-8000-000000000001'),
  0, 'the visit''s attachments are gone');
select results_eq(
  $$select r2_key from public.r2_deletion_queue order by r2_key$$,
  $$values ('u/a1/pets/c1/visits/c3/1-nalaz.pdf'), ('u/a1/pets/c1/visits/e5/3-zubi.jpg'),
           ('u/a1/pets/c1/visits/e5/4-rendgen.jpg')$$,
  'deleting a vet visit queues every attachment key'
);

-- Re-queuing a key already in the queue is harmless.
insert into public.r2_deletion_queue (r2_key) values ('u/a1/pets/c1/photo/x.jpg');

-- Deleting the pet (EP-05), as the owner: photo and every remaining attachment.
set local role authenticated;
delete from public.pets where id = 'c1000000-0000-4000-8000-000000000001';
reset role;
select is((select count(*)::int from public.pets where id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'the pet is deleted');
select is((select count(*)::int from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  0, 'its attachments are gone with it');
select results_eq(
  $$select r2_key from public.r2_deletion_queue where r2_key <> 'u/a1/pets/c1/photo/x.jpg' order by r2_key$$,
  $$values ('u/a1/pets/c1-luna/photo/1-luna.jpg'), ('u/a1/pets/c1/visits/c3/1-nalaz.pdf'),
           ('u/a1/pets/c1/visits/c3/2-krvna-slika.pdf'), ('u/a1/pets/c1/visits/e5/3-zubi.jpg'),
           ('u/a1/pets/c1/visits/e5/4-rendgen.jpg')$$,
  'deleting a pet queues its photo and every attachment key'
);

-- A pet without a photo queues nothing for the photo.
delete from public.pets where id = 'c1000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.r2_deletion_queue), 6,
  'deleting a pet without photo or attachments queues nothing');

select * from finish();
rollback;
