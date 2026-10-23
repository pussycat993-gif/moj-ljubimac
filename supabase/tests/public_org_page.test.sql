-- Public organisation page (Step 26): FR-46 (EP-62 get_public_org_page lists an approved shelter's available
-- animals with exactly the PublicAnimal fields — no health-record field), FR-49 #1 (a breeder with an active plan
-- lists available offspring with the price as Money; without a plan → not_found, E-21), pending / rejected /
-- unknown organisations → not_found, paging, the R2 keys for the service role only, and FR-60 #1 (a profile change
-- saved through EP-72 shows on the next request — nothing is cached, TC ADR-18).
-- Seeded: shelter b2…01 "Azil Šapica" (Milica …04, admin, pending) with Žuća (c1…04, available); breeder b2…02
-- (Nikola …05, admin, approved, no plan). Setup approves the shelter and adds animals.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

update public.organisations set approval_status = 'approved' where id = 'b2000000-0000-4000-8000-000000000001';
update public.pets set public_description = 'Mazna i mirna.', neutered = 'yes', photo_r2_key = 'o/x/zuca.jpg',
  microchip_number = '688038000999999', note = 'Interna napomena'
where id = 'c1000000-0000-4000-8000-000000000004';
insert into public.vaccinations (pet_id, name, given_on, created_by) values
  ('c1000000-0000-4000-8000-000000000004', 'Besnilo', current_date - 5, 'a1000000-0000-4000-8000-000000000004');
insert into public.pets (id, organisation_id, name, species, sex, shelter_status, created_at) values
  ('f9261000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Garfild', 'cat', 'male', 'in_care', now()),
  ('f9261000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Mrvica', 'cat', 'female', 'available',
   now() + interval '1 second');
-- The breeder: a breeding mother (never listed) and offspring.
insert into public.pets (id, organisation_id, name, species, breed, sex, birth_year, breeding_status) values
  ('f9261000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002', 'Bela', 'dog', 'Zlatni retriver',
   'female', 2021, 'active');
insert into public.pets (id, organisation_id, name, species, breed, sex, birth_date, offspring_status, price_minor) values
  ('f9261000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000002', 'Zlatko', 'dog', 'Zlatni retriver',
   'male', current_date - 60, 'available', 12000000),
  ('f9261000-0000-4000-8000-000000000012', 'b2000000-0000-4000-8000-000000000002', 'Mila', 'dog', 'Zlatni retriver',
   'female', current_date - 60, 'reserved', 13000000);

create function pg_temp.keys(j jsonb) returns text[] language sql as $$
  select array_agg(k order by k) from jsonb_object_keys(j) k
$$;

-- FR-46: a Visitor (anon) ------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is((public.get_public_org_page('azil-sapica') ->> 'total')::int, 2, 'FR-46: the two available animals are listed');
select is(
  (select array_agg(a ->> 'name') from jsonb_array_elements(public.get_public_org_page('azil-sapica') -> 'animals') a),
  array['Mrvica', 'Žuća'], 'FR-46: only available animals, sorted created_at desc (in care is not listed)');
select is(
  pg_temp.keys(public.get_public_org_page('azil-sapica') -> 'animals' -> 1),
  array['approx_age_text', 'birth_date', 'birth_year', 'breed', 'name', 'neutered', 'pet_id', 'photo_url', 'price',
        'public_description', 'sex', 'species', 'species_other', 'vaccinated'],
  'FR-46 / BR-37: exactly the PublicAnimal fields — no health-record field, no R2 key');
select is(
  pg_temp.keys(public.get_public_org_page('azil-sapica') -> 'organisation'),
  array['city', 'description', 'email', 'initials', 'logo_url', 'name', 'phone', 'slug', 'type', 'website'],
  'EP-62: exactly the PublicOrgPage.organisation fields');
select is(
  pg_temp.keys(public.get_public_org_page('azil-sapica')), array['animals', 'organisation', 'total'],
  'EP-62: PublicOrgPage');
select is(
  (public.get_public_org_page('azil-sapica') -> 'animals' -> 1) - 'pet_id'::text,
  '{"name": "Žuća", "species": "dog", "species_other": null, "breed": "Mešanac", "sex": "female",
    "approx_age_text": "oko 6 meseci", "birth_date": null, "birth_year": null,
    "public_description": "Mazna i mirna.", "neutered": "yes", "vaccinated": true, "price": null,
    "photo_url": null}'::jsonb,
  'FR-46: photo, name, species, sex, age, description, neutered yes/no and vaccinated yes/no; no price for shelters');
select is(
  (public.get_public_org_page('azil-sapica') -> 'animals' -> 0 ->> 'vaccinated')::boolean, false,
  'PublicAnimal.vaccinated = false without a vaccinations row');
select unalike(
  public.get_public_org_page('azil-sapica')::text, '%688038000999999%', 'BR-37: the microchip number never leaves');
select unalike(
  public.get_public_org_page('azil-sapica')::text, '%Interna napomena%', 'BR-37: the private note never leaves');
select unalike(
  public.get_public_org_page('azil-sapica')::text, '%Besnilo%', 'BR-37: vaccination details never leave');
select is(public.get_public_org_page('azil-sapica') #>> '{organisation,initials}', 'AŠ', 'PublicOrgPage.organisation.initials');
select is(public.get_public_org_page('azil-sapica') #>> '{organisation,type}', 'shelter', 'PublicOrgPage.organisation.type');
select is(public.get_public_org_page('azil-sapica') #>> '{organisation,city,name_sr}', 'Bečej', 'PublicOrgPage.organisation.city');

-- Paging.
select is(jsonb_array_length(public.get_public_org_page('azil-sapica', 1, 0) -> 'animals'), 1, 'EP-62 limit');
select is(public.get_public_org_page('azil-sapica', 1, 1) #>> '{animals,0,name}', 'Žuća', 'EP-62 offset');
select is((public.get_public_org_page('azil-sapica', 1, 0) ->> 'total')::int, 2, 'EP-62 total counts every listed animal');
select throws_ok($$select public.get_public_org_page('azil-sapica', 51, 0)$$, 'P0001', 'validation_failed', 'EP-62: limit max 50');
select throws_ok($$select public.get_public_org_page('azil-sapica', 20, -1)$$, 'P0001', 'validation_failed', 'EP-62: offset ≥ 0');

-- Unknown / breeder without a plan → not_found (E-21).
select throws_ok($$select public.get_public_org_page('nema-takve')$$, 'P0001', 'not_found', 'EP-62: unknown slug → not_found');
select throws_ok(
  $$select public.get_public_org_page('odgajivacnica-djordjevic')$$, 'P0001', 'not_found',
  'FR-49 #1 / E-21: a breeder without an active plan → not_found');
reset role;

-- FR-49 #1: a breeder with an active plan ------------------------------------------------------------------
insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month', true);
set local role anon;
select is(
  (select array_agg(a ->> 'name') from jsonb_array_elements(public.get_public_org_page('odgajivacnica-djordjevic') -> 'animals') a),
  array['Zlatko'], 'FR-49 #1: only available offspring (reserved offspring and breeding animals are not listed)');
select is(
  public.get_public_org_page('odgajivacnica-djordjevic') #> '{animals,0,price}',
  '{"amount_minor": 12000000, "currency": "RSD"}'::jsonb, 'FR-49 #1: the price as Money');
reset role;

-- A signed-in user sees the same public fields.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((public.get_public_org_page('azil-sapica') ->> 'total')::int, 2, 'EP-62 for a signed-in user');
select is(
  public.get_public_org_page('azil-sapica') #> '{animals,1}' ? 'photo_r2_key', false,
  'a signed-in user gets no R2 key');
reset role;

-- The service role (the server building presigned URLs) also gets the R2 keys.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  public.get_public_org_page('azil-sapica') #>> '{animals,1,photo_r2_key}', 'o/x/zuca.jpg',
  'API §10: the service role gets photo_r2_key to presign');
select is(
  public.get_public_org_page('azil-sapica') -> 'organisation' ? 'logo_r2_key', true,
  'API §10: the service role gets logo_r2_key to presign');
reset role;

-- FR-60 #1 (Step 24) / TC ADR-18: an EP-72 profile change and an EP-55 status change show on the next request.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
update public.organisations set description = 'Novi opis azila.', phone = '+381 21 400 500'
where id = 'b2000000-0000-4000-8000-000000000001';
update public.pets set shelter_status = 'reserved' where id = 'f9261000-0000-4000-8000-000000000002';
reset role;
set local role anon;
select is(
  public.get_public_org_page('azil-sapica') #>> '{organisation,description}', 'Novi opis azila.',
  'FR-60 #1: the description saved through EP-72 shows on the next request');
select is(
  (public.get_public_org_page('azil-sapica') ->> 'total')::int, 1,
  'EP-55: a reserved animal leaves the public page on the next request');
reset role;

-- Pending and rejected organisations → not_found.
update public.organisations set approval_status = 'pending' where id = 'b2000000-0000-4000-8000-000000000001';
set local role anon;
select throws_ok($$select public.get_public_org_page('azil-sapica')$$, 'P0001', 'not_found', 'EP-62: a pending organisation → not_found');
reset role;
update public.organisations set approval_status = 'rejected' where id = 'b2000000-0000-4000-8000-000000000001';
set local role anon;
select throws_ok($$select public.get_public_org_page('azil-sapica')$$, 'P0001', 'not_found', 'EP-62: a rejected organisation → not_found');
reset role;

select * from finish();
rollback;
