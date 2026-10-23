-- Attachments as EP-13 confirm_upload inserts them and EP-14 deletes them, as the signed-in caller:
-- FR-08 / BR-05 (images or PDFs, ≤ 10 MB), FR-08 / FR-36 / BR-01 / E-04 (a Free owner's 11th attachment
-- on a pet → premium_required, limit = attachments), FR-08 / BR-02 (Premium has no per-pet limit), and
-- the member rule (FR-28: attachments are view only → forbidden_role).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium; Luna c1…01 with vet visit c3…01), Marko (…02, Free;
-- Kiki c1…03), Jelena (…03, member of Ivana's household, Luna shared).
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Marko (Free) records a visit for Kiki --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.vet_visits (pet_id, visited_on, reason)
    values ('c1000000-0000-4000-8000-000000000003', current_date - 1, 'Pregled — Step 15')$$,
  'a Free owner saves a visit'
);
reset role;
create temp table t_visit on commit drop as
select id from public.vet_visits where reason = 'Pregled — Step 15';
grant select on t_visit to authenticated;

-- FR-08 / BR-05: type and size --------------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-video', 'kiki.mp4', 'video/mp4', 1000 from t_visit$$,
  '23514', null, 'FR-08: a video is rejected (mime check)'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-doc', 'nalaz.docx',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000 from t_visit$$,
  '23514', null, 'FR-08: a Word document is rejected (mime check)'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-big', 'snimak.jpg', 'image/jpeg', 10485761 from t_visit$$,
  '23514', null, 'FR-08: a file over 10 MB is rejected (size check, NFR-09)'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-pdf', 'nalaz.pdf', 'application/pdf', 10485760 from t_visit$$,
  'FR-08: a PDF of exactly 10 MB is stored with the visit'
);
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-png', 'kiki.png', 'image/png', 2400000 from t_visit$$,
  'FR-08: an image is stored with the visit'
);
reset role;
select is(
  (select row(pet_id, created_by)::text from public.attachments where r2_key = 'k-pdf'),
  row('c1000000-0000-4000-8000-000000000003'::uuid, 'a1000000-0000-4000-8000-000000000002'::uuid)::text,
  'pet_id is the visit''s pet; created_by is the caller'
);

-- FR-08 / FR-36: 10 per pet on Free --------------------------------------------------------------------------
set local role authenticated;
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-free-' || i, 'slika-' || i || '.jpg', 'image/jpeg', 1000
    from t_visit, generate_series(3, 10) as i$$,
  'a Free owner reaches 10 attachments on a pet'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-free-11', 'slika-11.jpg', 'image/jpeg', 1000 from t_visit$$,
  'P0001', 'premium_required:attachments', 'FR-08 / FR-36: the 11th is blocked with premium_required, limit = attachments'
);
reset role;
select is(
  (select count(*)::int from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000003'),
  10, 'Kiki keeps exactly 10 attachments'
);

-- A deletion frees a slot (EP-14 → the counter "n / 10" decreases) -------------------------------------------
set local role authenticated;
select lives_ok($$delete from public.attachments where r2_key = 'k-free-10'$$, 'the owner deletes an attachment');
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select id, 'c1000000-0000-4000-8000-000000000003', 'k-free-10b', 'slika-10.jpg', 'image/jpeg', 1000 from t_visit$$,
  'then the tenth slot can be used again'
);
reset role;

-- FR-08 / BR-02: Premium (Ivana) has no per-pet limit ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    select 'c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
           'k-premium-' || i, 'nalaz-' || i || '.pdf', 'application/pdf', 1000
    from generate_series(1, 11) as i$$,
  'FR-08: a Premium owner adds an 11th attachment to a pet'
);
reset role;
select is(
  (select count(*)::int from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  11, 'Luna has 11 attachments'
);

-- Member: view only (FR-28) ----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.attachments where pet_id = 'c1000000-0000-4000-8000-000000000001'),
  11, 'a member sees the shared pet''s attachments'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    values ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
            'k-member', 'nalaz.pdf', 'application/pdf', 1000)$$,
  'P0001', 'forbidden_role', 'FR-28: a member cannot add an attachment'
);
select throws_ok(
  $$delete from public.attachments where r2_key = 'k-premium-1'$$,
  'P0001', 'forbidden_role', 'FR-28: a member cannot delete an attachment'
);
reset role;

select * from finish();
rollback;
