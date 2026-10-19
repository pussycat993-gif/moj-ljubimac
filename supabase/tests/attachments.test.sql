-- Attachments: BR-05 (images or PDFs, ≤ 10 MB) and the Free limit of 10 per pet
-- (BR-01, BR-02, E-04).
-- Seeded: Ivana (…01, Premium; Luna c1…01 with vet visit c3…01), Marko (…02, Free;
-- Kiki c1…03), shelter b2…01 (Žuća c1…04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.vet_visits (id, pet_id, visited_on, reason, created_by) values
  ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', current_date,
   'Pregled', 'a1000000-0000-4000-8000-000000000002'),
  ('e4000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004', current_date,
   'Prijem', 'a1000000-0000-4000-8000-000000000004');

-- BR-05: type and size --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k1',
            'application/msword', 1000, 'a1000000-0000-4000-8000-000000000002')$$,
  '23514', null, 'a Word document is rejected'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k1',
            'video/mp4', 1000, 'a1000000-0000-4000-8000-000000000002')$$,
  '23514', null, 'a video is rejected'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k1',
            'application/pdf', 10485761, 'a1000000-0000-4000-8000-000000000002')$$,
  '23514', null, 'a file over 10 MB is rejected'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k-pdf',
            'application/pdf', 10485760, 'a1000000-0000-4000-8000-000000000002')$$,
  'a PDF of exactly 10 MB is accepted'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k-jpg',
            'image/jpeg', 3400000, 'a1000000-0000-4000-8000-000000000002')$$,
  'a JPEG is accepted'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k-heic',
            'image/heic', 2000000, 'a1000000-0000-4000-8000-000000000002')$$,
  'any image type is accepted'
);

-- BR-01 / E-04: the 11th attachment on a Free owner's pet -----------------------------------------
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    select 'e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003',
           'k-free-' || i, 'image/png', 1000, 'a1000000-0000-4000-8000-000000000002'
    from generate_series(4, 10) as i$$,
  'a Free owner reaches 10 attachments on a pet'
);
select is(
  (select count(*)::int from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  10, 'Kiki has 10 attachments'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k-11',
            'image/png', 1000, 'a1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'premium_required:attachments', 'the 11th attachment on Free is blocked'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k-11',
            'image/png', 1000)$$,
  'P0001', 'premium_required:attachments', 'the same limit holds for the owner''s own session'
);
select lives_ok(
  $$delete from public.attachments where r2_key = 'k-free-10'$$,
  'the owner deletes one attachment'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes)
    values ('e4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'k-again',
            'image/png', 1000)$$,
  'a freed slot can be used again'
);
reset role;

-- BR-02: Premium unlimited; organisation animals unlimited (BR-33) -------------------------------
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    select 'c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
           'k-premium-' || i, 'application/pdf', 1000, 'a1000000-0000-4000-8000-000000000001'
    from generate_series(1, 12) as i$$,
  'a Premium owner adds 12 attachments to one pet'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, mime_type, size_bytes, created_by)
    select 'e4000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004',
           'k-org-' || i, 'image/png', 1000, 'a1000000-0000-4000-8000-000000000004'
    from generate_series(1, 12) as i$$,
  'an organisation animal takes 12 attachments'
);

select * from finish();
rollback;
