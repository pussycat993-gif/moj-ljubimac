-- Record transfers (Step 25): FR-50 #1 (EP-60 accept copies the pet into a new pets row owned by the recipient with
-- weight, vaccinations, treatments + dose logs, vet visits + attachments (new R2 keys) and the photo; created_by
-- keeps the original authors; the organisation's original answers access.can_edit = false and refuses writes),
-- FR-50 #2 (expires_at = now + 30 days; re-send creates a new row and token and expires the previous pending one;
-- accept after expiry → invitation_expired), FR-51 (a Free recipient whose slot is taken →
-- premium_required:transfer_slot), BR-33 (only owner accounts accept), decline and the EP-59 / EP-60 errors.
-- Seeded: shelter b2…01 (Milica …04, admin) with Žuća (c1…04) and her weight entry; Ivana (…01, Premium owner),
-- Marko (…02, Free, owns Kiki), Jelena (…03, Free, no pets), Ana (…06, owner). Setup approves the shelter, adds
-- Ana as a volunteer and gives Žuća a photo, a vaccination, a treatment with a dose log and a vet visit with an
-- attachment.
begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'volunteer');
update public.pets
set photo_r2_key = 'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/photo/11111111-1111-4111-8111-111111111111-zuca.jpg',
    microchip_number = '688038100245117'
where id = 'c1000000-0000-4000-8000-000000000004';
insert into public.vaccinations (pet_id, name, given_on, next_due_on, created_by) values
  ('c1000000-0000-4000-8000-000000000004', 'Besnilo', current_date - 20, current_date + 345,
   'a1000000-0000-4000-8000-000000000004');
insert into public.treatments (id, pet_id, type, name, starts_on, created_by) values
  ('f9260000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000004', 'deworming', 'Milbemax',
   current_date - 10, 'a1000000-0000-4000-8000-000000000006');
insert into public.dose_logs (treatment_id, given_at, created_by) values
  ('f9260000-0000-4000-8000-000000000001', now() - interval '10 days', 'a1000000-0000-4000-8000-000000000006');
insert into public.vet_visits (id, pet_id, visited_on, reason, created_by) values
  ('f9260000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004', current_date - 15, 'Prijemni pregled',
   'a1000000-0000-4000-8000-000000000004');
insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes, created_by) values
  ('f9260000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004',
   'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/visits/f9260000-0000-4000-8000-000000000002/22222222-2222-4222-8222-222222222222-nalaz.pdf',
   'nalaz.pdf', 'application/pdf', 1024, 'a1000000-0000-4000-8000-000000000004');
-- A second shelter animal for the decline path.
insert into public.pets (id, organisation_id, name, species, sex, shelter_status) values
  ('f9260000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'Garfild', 'cat', 'male', 'reserved');

-- FR-50 #2 / EP-59 send and re-send (Milica, Admin) -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

create temp table sent on commit drop as
select public.create_record_transfer('f9260000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-000000000004',
  ' Jelena.Nikolic@MojLjubimac.test ', repeat('1', 64)) as j;

select is((select j #>> '{transfer,status}' from sent), 'pending', 'EP-59: the new transfer is pending');
select is((select j #>> '{transfer,recipient_email}' from sent), 'jelena.nikolic@mojljubimac.test', 'the recipient email is stored');
select is(
  (select expires_at - created_at from public.record_transfers where id = 'f9260000-0000-4000-8000-0000000000b1'),
  interval '30 days', 'FR-50 #2: a new transfer is valid 30 days');
select is((select j ->> 'organisation_name' from sent), 'Azil Šapica', 'EP-59 returns the organisation name for the email');
select is((select j ->> 'recipient_locale' from sent), 'sr-Latn', '… and the recipient''s locale');
select is(
  (select shelter_status::text from public.pets where id = 'c1000000-0000-4000-8000-000000000004'),
  'adopted', 'EP-59: the animal becomes Adopted');

create temp table resent on commit drop as
select public.resend_record_transfer('f9260000-0000-4000-8000-0000000000b2', 'f9260000-0000-4000-8000-0000000000b1',
  repeat('2', 64)) as j;
select is((select j #>> '{transfer,id}' from resent), 'f9260000-0000-4000-8000-0000000000b2', 'FR-50 #2: re-send creates a new row');
select is(
  (select recipient_email from public.record_transfers where id = 'f9260000-0000-4000-8000-0000000000b2'),
  'jelena.nikolic@mojljubimac.test', 'FR-50 #2: … to the same address');
select is(
  (select token_hash from public.record_transfers where id = 'f9260000-0000-4000-8000-0000000000b2'),
  repeat('2', 64), 'FR-50 #2: … with a new token');
select is(
  (select status::text from public.record_transfers where id = 'f9260000-0000-4000-8000-0000000000b1'),
  'expired', 'FR-50 #2: the previous pending transfer is expired');
select throws_ok(
  $$select public.create_record_transfer(gen_random_uuid(), 'c1000000-0000-4000-8000-000000000004', 'nije-mejl', repeat('3', 64))$$,
  'P0001', 'validation_failed', 'EP-59: a bad email → validation_failed');
select throws_ok(
  $$select public.create_record_transfer(gen_random_uuid(), 'c1000000-0000-4000-8000-000000000001', 'x@x.rs', repeat('3', 64))$$,
  'P0001', 'not_found', 'EP-59: a pet of no relation → not_found');
reset role;

-- BR-34: a Volunteer cannot send.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_record_transfer(gen_random_uuid(), 'c1000000-0000-4000-8000-000000000004', 'x@x.rs', repeat('3', 64))$$,
  'P0001', 'forbidden_role', 'EP-59: a Volunteer → forbidden_role');
reset role;

-- EP-60 get ----------------------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_transfer_by_token(repeat('2', 64)) ->> 'status', 'pending', 'EP-60: a Visitor holding the token sees the transfer');
select is(public.get_transfer_by_token(repeat('2', 64)) #>> '{organisation,name}', 'Azil Šapica', 'TransferView.organisation.name');
select is(public.get_transfer_by_token(repeat('2', 64)) #>> '{animal,name}', 'Žuća', 'TransferView.animal.name');
select is(
  public.get_transfer_by_token(repeat('2', 64)) -> 'counts', '{"vet_visits": 1, "attachments": 1, "vaccinations": 1}'::jsonb,
  'TransferView.counts');
select is(public.get_transfer_by_token(repeat('2', 64)) -> 'new_pet_id', 'null'::jsonb, 'new_pet_id is null before accept');
select throws_ok($$select public.get_transfer_by_token(repeat('1', 64))$$, 'P0001', 'invitation_expired',
  'EP-60: the re-sent (expired) token → invitation_expired');
select throws_ok($$select public.get_transfer_by_token(repeat('9', 64))$$, 'P0001', 'not_found', 'EP-60: unknown token → not_found');
select throws_ok(
  $$select public.accept_record_transfer(repeat('2', 64), gen_random_uuid(), '{}', '{}')$$,
  '42501', null, 'EP-60: a Visitor cannot accept (the action answers 401)');
reset role;

-- FR-51: a Free recipient whose active slot is taken (Marko owns Kiki).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.get_transfer_copy_plan(repeat('2', 64))$$, 'P0001', 'premium_required:transfer_slot',
  'FR-51: Free with an active pet → premium_required:transfer_slot (copy plan)');
select throws_ok(
  $$select public.accept_record_transfer(repeat('2', 64), gen_random_uuid(), '{}', '{}')$$,
  'P0001', 'premium_required:transfer_slot', 'FR-51: … and on accept');
reset role;

-- BR-33: a shelter account cannot receive a record.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.get_transfer_copy_plan(repeat('2', 64))$$, 'P0001', 'forbidden_role',
  'BR-33: a shelter account accepting → forbidden_role');
reset role;

-- FR-50 #2: accept after expiry → invitation_expired.
update public.record_transfers set expires_at = now() - interval '1 minute' where id = 'f9260000-0000-4000-8000-0000000000b2';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.accept_record_transfer(repeat('2', 64), gen_random_uuid(), '{}', '{}')$$,
  'P0001', 'invitation_expired', 'FR-50 #2: accept after expiry → invitation_expired');
reset role;
update public.record_transfers set expires_at = now() + interval '30 days' where id = 'f9260000-0000-4000-8000-0000000000b2';

-- FR-50 #1 / EP-60 accept (Ivana, Premium) -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

create temp table plan_result on commit drop as select public.get_transfer_copy_plan(repeat('2', 64)) as j;
select is(
  (select j ->> 'photo_r2_key' from plan_result),
  'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/photo/11111111-1111-4111-8111-111111111111-zuca.jpg',
  'the copy plan names the photo key');
select is((select jsonb_array_length(j -> 'attachments') from plan_result), 1, 'the copy plan lists the attachments');

-- A key outside u/<recipient>/pets/<new pet>/ is refused and nothing is written.
select throws_ok(
  $$select public.accept_record_transfer(repeat('2', 64), 'f9260000-0000-4000-8000-0000000000c1',
      '{"f9260000-0000-4000-8000-000000000002": "f9260000-0000-4000-8000-0000000000c2"}',
      jsonb_build_object(
        'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/photo/11111111-1111-4111-8111-111111111111-zuca.jpg',
        'u/a1000000-0000-4000-8000-000000000002/pets/f9260000-0000-4000-8000-0000000000c1/photo/x-zuca.jpg'))$$,
  'P0001', 'validation_failed', 'EP-60: a new key outside the recipient''s prefix → validation_failed');

create temp table accepted on commit drop as
select public.accept_record_transfer(
  repeat('2', 64),
  'f9260000-0000-4000-8000-0000000000c1',
  '{"f9260000-0000-4000-8000-000000000002": "f9260000-0000-4000-8000-0000000000c2"}',
  jsonb_build_object(
    'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/photo/11111111-1111-4111-8111-111111111111-zuca.jpg',
    'u/a1000000-0000-4000-8000-000000000001/pets/f9260000-0000-4000-8000-0000000000c1/photo/33333333-3333-4333-8333-333333333333-zuca.jpg',
    'o/b2000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000004/visits/f9260000-0000-4000-8000-000000000002/22222222-2222-4222-8222-222222222222-nalaz.pdf',
    'u/a1000000-0000-4000-8000-000000000001/pets/f9260000-0000-4000-8000-0000000000c1/visits/f9260000-0000-4000-8000-0000000000c2/44444444-4444-4444-8444-444444444444-nalaz.pdf'
  )) as j;

select is((select j ->> 'status' from accepted), 'accepted', 'FR-50 #1: the transfer view says accepted');
select is((select j ->> 'new_pet_id' from accepted), 'f9260000-0000-4000-8000-0000000000c1', '… with new_pet_id for the recipient');
select is(
  (select owner_id from public.pets where id = 'f9260000-0000-4000-8000-0000000000c1'),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'FR-50 #1: the new pets row is owned by the recipient');
select is(
  (select row(organisation_id, shelter_status, offspring_status, litter_id, price_minor, public_description)::text
   from public.pets where id = 'f9260000-0000-4000-8000-0000000000c1'),
  '(,,,,,)', 'EP-60: organisation-only fields are cleared');
select is(
  (select row(name, species, sex, microchip_number, approx_age_text)::text from public.pets where id = 'f9260000-0000-4000-8000-0000000000c1'),
  '(Žuća,dog,female,688038100245117,"oko 6 meseci")', 'FR-50 #1: the pet data is copied');
select is(
  (select photo_r2_key from public.pets where id = 'f9260000-0000-4000-8000-0000000000c1'),
  'u/a1000000-0000-4000-8000-000000000001/pets/f9260000-0000-4000-8000-0000000000c1/photo/33333333-3333-4333-8333-333333333333-zuca.jpg',
  'FR-50 #1: the photo gets its new key');
select is(
  (select count(*)::int from public.weight_entries where pet_id = 'f9260000-0000-4000-8000-0000000000c1'), 1,
  'FR-50 #1: weight entries are copied');
select is(
  (select created_by from public.weight_entries where pet_id = 'f9260000-0000-4000-8000-0000000000c1'),
  'a1000000-0000-4000-8000-000000000004'::uuid, 'created_by keeps the original author');
select is(
  (select row(name, next_due_on = current_date + 345, created_by = 'a1000000-0000-4000-8000-000000000004')::text
   from public.vaccinations where pet_id = 'f9260000-0000-4000-8000-0000000000c1'),
  '(Besnilo,t,t)', 'FR-50 #1: vaccinations are copied with their author');
select is(
  (select row(t.name, t.created_by = 'a1000000-0000-4000-8000-000000000006')::text
   from public.treatments t where t.pet_id = 'f9260000-0000-4000-8000-0000000000c1'),
  '(Milbemax,t)', 'FR-50 #1: treatments are copied');
select is(
  (select count(*)::int from public.dose_logs d join public.treatments t on t.id = d.treatment_id
   where t.pet_id = 'f9260000-0000-4000-8000-0000000000c1' and d.occurrence_id is null
     and d.created_by = 'a1000000-0000-4000-8000-000000000006'),
  1, 'FR-50 #1: dose logs are copied (occurrence_id null, author kept)');
select is(
  (select id from public.vet_visits where pet_id = 'f9260000-0000-4000-8000-0000000000c1'),
  'f9260000-0000-4000-8000-0000000000c2'::uuid, 'FR-50 #1: vet visits are copied with the pre-generated id');
select is(
  (select row(r2_key, file_name, vet_visit_id)::text from public.attachments where pet_id = 'f9260000-0000-4000-8000-0000000000c1'),
  '(u/a1000000-0000-4000-8000-000000000001/pets/f9260000-0000-4000-8000-0000000000c1/visits/f9260000-0000-4000-8000-0000000000c2/44444444-4444-4444-8444-444444444444-nalaz.pdf,nalaz.pdf,f9260000-0000-4000-8000-0000000000c2)',
  'FR-50 #1: attachments are copied with their new R2 key');
select is(
  (select count(*)::int from public.reminders
   where pet_id = 'f9260000-0000-4000-8000-0000000000c1' and user_id = 'a1000000-0000-4000-8000-000000000001'
     and type = 'vaccination'),
  1, 'BR-12: the reminder triggers create the recipient''s vaccination reminder');
select is(
  public.get_pet_record('f9260000-0000-4000-8000-0000000000c1') #>> '{access,role}', 'owner',
  'the recipient owns the copy');
select throws_ok(
  $$select public.accept_record_transfer(repeat('2', 64), gen_random_uuid(), '{}', '{}')$$,
  'P0001', 'invitation_used', 'EP-60: a second accept → invitation_used');
select throws_ok(
  $$select public.decline_record_transfer(repeat('2', 64))$$,
  'P0001', 'invitation_used', 'EP-60: declining an accepted transfer → invitation_used');
select is(
  public.get_transfer_by_token(repeat('2', 64)) ->> 'status', 'accepted', 'EP-60 get after accept → status accepted');
reset role;
select is(
  (select row(status, accepted_by, new_pet_id, accepted_at is not null)::text
   from public.record_transfers where id = 'f9260000-0000-4000-8000-0000000000b2'),
  '(accepted,a1000000-0000-4000-8000-000000000001,f9260000-0000-4000-8000-0000000000c1,t)',
  'FR-50 #1: the transfer is accepted');

-- FR-50 #1: the organisation keeps a read-only copy.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.get_pet_record('c1000000-0000-4000-8000-000000000004') -> 'access',
  '{"role": "org_admin", "can_edit": false, "can_delete": false}'::jsonb,
  'FR-50 #1: the organisation''s original returns access.can_edit = false');
select is(public.get_transfer_by_token(repeat('2', 64)) -> 'new_pet_id', 'null'::jsonb, 'new_pet_id only to the accepting user');
select throws_ok(
  $$update public.pets set name = 'Žuća II' where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'forbidden_role', 'read-only copy: updating the pet → forbidden_role');
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value) values ('c1000000-0000-4000-8000-000000000004', current_date, 7)$$,
  'P0001', 'forbidden_role', 'read-only copy: a new entry → forbidden_role');
select throws_ok(
  $$delete from public.pets where id = 'c1000000-0000-4000-8000-000000000004'$$,
  'P0001', 'forbidden_role', 'read-only copy: deleting the pet → forbidden_role');
select throws_ok(
  $$select public.create_record_transfer(gen_random_uuid(), 'c1000000-0000-4000-8000-000000000004', 'x@x.rs', repeat('4', 64))$$,
  'P0001', 'invitation_used', 'EP-59: the pet already has an accepted transfer → invitation_used');

-- Decline path: Garfild to Jelena.
select lives_ok(
  $$select public.create_record_transfer('f9260000-0000-4000-8000-0000000000b3', 'f9260000-0000-4000-8000-000000000003',
      'jelena.nikolic@mojljubimac.test', repeat('5', 64))$$,
  'EP-59: a second animal is sent');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(public.decline_record_transfer(repeat('5', 64)) ->> 'status', 'declined', 'EP-60: decline → status declined');
select is(public.get_transfer_by_token(repeat('5', 64)) ->> 'status', 'declined', 'EP-60 get after decline → declined');
reset role;
select is(
  (select status::text from public.record_transfers where id = 'f9260000-0000-4000-8000-0000000000b3'),
  'declined', 'the transfer row is declined');

select * from finish();
rollback;
