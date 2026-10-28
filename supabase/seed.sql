-- Local seed data (ADR-02, TC §8) — runs only on `npx supabase db reset`,
-- after ./seed/cities.sql. Never applied to production.
--
-- Test users (password for all, local only: MojLjubimac123!):
--   ivana.petrovic@mojljubimac.test   owner, Premium (premium_monthly, active)  — Novi Sad
--   marko.jovanovic@mojljubimac.test  owner, Free                               — Beograd
--   jelena.nikolic@mojljubimac.test   owner, Free — second owner for household tests — Novi Sad
--   milica.stojanovic@mojljubimac.test shelter                                   — Bečej
--   nikola.djordjevic@mojljubimac.test breeder                                   — Beograd
--   ana.markovic@mojljubimac.test     owner, Operator (is_operator = true)      — Novi Sad
--
-- Later schema steps append their seed data to this file.

-- Accounts --------------------------------------------------------------------

with seed_users (id, email, full_name, account_type, city, is_operator) as (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'ivana.petrovic@mojljubimac.test', 'Ivana Petrović', 'owner'::public.account_type, 'Novi Sad', false),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 'marko.jovanovic@mojljubimac.test', 'Marko Jovanović', 'owner'::public.account_type, 'Beograd', false),
    ('a1000000-0000-4000-8000-000000000003'::uuid, 'jelena.nikolic@mojljubimac.test', 'Jelena Nikolić', 'owner'::public.account_type, 'Novi Sad', false),
    ('a1000000-0000-4000-8000-000000000004'::uuid, 'milica.stojanovic@mojljubimac.test', 'Milica Stojanović', 'shelter'::public.account_type, 'Bečej', false),
    ('a1000000-0000-4000-8000-000000000005'::uuid, 'nikola.djordjevic@mojljubimac.test', 'Nikola Đorđević', 'breeder'::public.account_type, 'Beograd', false),
    ('a1000000-0000-4000-8000-000000000006'::uuid, 'ana.markovic@mojljubimac.test', 'Ana Marković', 'owner'::public.account_type, 'Novi Sad', true)
),
new_auth_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
    extensions.crypt('MojLjubimac123!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', full_name), now(), now(),
    '', '', '', ''
  from seed_users
  returning id
),
new_identities as (
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(), su.id, su.id::text,
    jsonb_build_object('sub', su.id::text, 'email', su.email, 'email_verified', true),
    'email', now(), now(), now()
  from seed_users su
  join new_auth_users au on au.id = su.id
  returning user_id
)
insert into public.profiles (
  id, account_type, full_name, locale, city_id, email, is_operator,
  terms_accepted_at, terms_version
)
select
  su.id, su.account_type, su.full_name, 'sr-Latn', c.id, su.email, su.is_operator,
  now(), 'seed'
from seed_users su
join new_identities ni on ni.user_id = su.id
join public.cities c on c.name_sr = su.city;

-- Billing -----------------------------------------------------------------------

-- The Premium owner: an active monthly subscription that runs past today.
insert into public.subscriptions (
  user_id, plan, status, current_period_end, auto_renew, card_brand, card_last4
) values (
  'a1000000-0000-4000-8000-000000000001', 'premium_monthly', 'active',
  now() + interval '1 month', true, 'visa', '4242'
);


-- Households --------------------------------------------------------------------
-- Ivana (Premium owner) owns a household; Jelena (second owner) is a member.

insert into public.households (id, owner_id, name) values (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001', 'Domaćinstvo Petrović'
);

insert into public.household_memberships (household_id, user_id, joined_at) values (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003', now()
);

-- Organisations -------------------------------------------------------------------
-- Milica's shelter (pending, BR-32) and Nikola's breeding kennel (approved), each
-- with its user as admin.

insert into public.organisations (id, type, name, slug, city_id, created_by)
select o.id, o.type, o.name, o.slug, c.id, o.created_by
from (
  values
    ('b2000000-0000-4000-8000-000000000001'::uuid, 'shelter'::public.organisation_type,
     'Azil Šapica', 'azil-sapica', 'Bečej', 'a1000000-0000-4000-8000-000000000004'::uuid),
    ('b2000000-0000-4000-8000-000000000002'::uuid, 'breeder'::public.organisation_type,
     'Odgajivačnica Đorđević', 'odgajivacnica-djordjevic', 'Beograd', 'a1000000-0000-4000-8000-000000000005'::uuid)
) as o (id, type, name, slug, city, created_by)
join public.cities c on c.name_sr = o.city;

insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'admin'),
  ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000005', 'admin');

-- Pets & health record ------------------------------------------------------------------
-- Ivana (Premium) owns Luna and Maks; Luna is shared into her household (Jelena sees it).
-- Marko (Free) owns Kiki. Milica's shelter has one intake animal, Žuća.
-- Seed inserts run without a session, so every entry names its author.

insert into public.pets (
  id, owner_id, organisation_id, name, species, breed, colour_markings, microchip_number,
  passport_number, note, sex, birth_date, birth_year, neutered, vet_name, vet_phone,
  weight_unit, shelter_status, approx_age_text
) values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null,
   'Luna', 'cat', 'Britanska kratkodlaka', 'Plavo-siva, bela mrlja na grudima',
   '688038000123456', 'RS-NS-0451-23', 'Ne voli transporter — staviti ćebe unutra.',
   'female', '2023-04-12', null, 'yes',
   'Veterinarska ambulanta „Dr Vet”, Novi Sad', '021 456 789', 'kg', null, null),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', null,
   'Maks', 'dog', 'Mešanac', null, null, null, null,
   'male', null, 2022, 'unknown', null, null, 'kg', null, null),
  ('c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', null,
   'Kiki', 'rabbit', null, null, null, null, null,
   'female', null, 2025, 'unknown', null, null, 'kg', null, null),
  ('c1000000-0000-4000-8000-000000000004', null, 'b2000000-0000-4000-8000-000000000001',
   'Žuća', 'dog', 'Mešanac', null, null, null, null,
   'female', null, null, 'unknown', null, null, 'kg', 'intake', 'oko 6 meseci');

insert into public.household_pets (household_id, pet_id) values
  ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001');

insert into public.weight_entries (pet_id, measured_on, value, note, created_by) values
  ('c1000000-0000-4000-8000-000000000001', '2026-04-17', 3.8, null, 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', '2026-06-17', 4.0, null, 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', '2026-10-02', 4.1, 'Izmereno kod „Dr Vet”', 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', '2026-10-19', 4.2, null, 'a1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000002', '2026-08-14', 18.4, null, 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000003', '2026-09-29', 1.7, null, 'a1000000-0000-4000-8000-000000000002'),
  ('c1000000-0000-4000-8000-000000000004', '2026-10-18', 6.1, null, 'a1000000-0000-4000-8000-000000000004');

insert into public.vaccinations (pet_id, name, given_on, next_due_on, clinic, batch_number, created_by) values
  ('c1000000-0000-4000-8000-000000000001', 'Besnilo — Rabisin', '2025-10-26', '2026-10-26',
   'Veterinarska ambulanta „Dr Vet”', 'RB-24-0917', 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', 'Trovalentna — Purevax RCP', '2026-03-12', '2027-03-12',
   'Veterinarska ambulanta „Dr Vet”', 'PX-26-1142', 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', 'Leukoza (FeLV) — Purevax FeLV', '2024-03-12', null,
   'Veterinarska ambulanta „Dr Vet”', 'FV-24-0310', 'a1000000-0000-4000-8000-000000000001');

insert into public.treatments (
  id, pet_id, type, name, dose, interval_value, interval_unit, starts_on, ends_on, created_by
) values (
  'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  'medication', 'Tobrex kapi za oči', '1 kap u svako oko', 12, 'hours',
  '2026-10-15', '2026-10-25', 'a1000000-0000-4000-8000-000000000001'
);

insert into public.dose_logs (treatment_id, given_at, created_by) values
  ('c2000000-0000-4000-8000-000000000001', '2026-10-18 06:10:00+00', 'a1000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000001', '2026-10-18 18:05:00+00', 'a1000000-0000-4000-8000-000000000003');

insert into public.vet_visits (
  id, pet_id, visited_on, clinic, reason, findings, recommendations, cost_minor,
  follow_up_on, created_by
) values (
  'c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  '2026-10-02', 'Veterinarska ambulanta „Dr Vet”', 'Suzenje levog oka',
  'Blagi konjunktivitis, bez povrede rožnjače.',
  'Tobrex kapi 10 dana, kontrola posle terapije.', 299000, '2026-10-30',
  'a1000000-0000-4000-8000-000000000001'
);

-- Care log & moments --------------------------------------------------------------------
-- Luna's feeding and stool log (one feeding by Jelena, the member) and two moments by
-- Ivana; the second has a public link.

insert into public.feeding_entries (pet_id, fed_at, type, brand, amount_g, note, created_by) values
  ('c1000000-0000-4000-8000-000000000001', '2026-10-18 06:30:00+00', 'dry', 'Royal Canin Indoor', 30, null,
   'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', '2026-10-18 16:00:00+00', 'wet', 'Gourmet Gold', 85, null,
   'a1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000001', '2026-10-19 06:30:00+00', 'dry', 'Royal Canin Indoor', 30,
   'Pojela sve', 'a1000000-0000-4000-8000-000000000001');

insert into public.stool_entries (pet_id, observed_at, consistency, blood_or_mucus, note, created_by) values
  ('c1000000-0000-4000-8000-000000000001', '2026-10-18 08:15:00+00', 'normal', false, null,
   'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', '2026-10-19 08:40:00+00', 'soft', false, 'Posle nove hrane',
   'a1000000-0000-4000-8000-000000000001');

insert into public.moments (id, pet_id, moment_date, text, created_by) values
  ('c4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '2026-09-14',
   'Prvi put na terasi — sat vremena je gledala ptice.', 'a1000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', '2026-10-12',
   'Luna je danas napunila tri i po godine.', 'a1000000-0000-4000-8000-000000000001');

insert into public.moment_public_links (moment_id, slug) values
  ('c4000000-0000-4000-8000-000000000002', 'Lu7nAk3QpZ9xRtW2mVb4Ys');

-- Reminders -----------------------------------------------------------------------------
-- Luna's vaccinations, treatment, vet visit and date of birth already produced their
-- reminders through the Step 08 triggers. One manual reminder for Ivana, for her only
-- (BR-18), monthly.

insert into public.reminders (user_id, pet_id, type, title, starts_at, recurrence) values (
  'a1000000-0000-4000-8000-000000000001', null, 'manual', 'Kupiti hranu za Lunu',
  '2026-11-01 09:00:00+01', 'monthly'
);

-- Organisation workflows ----------------------------------------------------------------
-- Žuća came into Milica's shelter as a found dog; Milica then made her available
-- (the status trigger records the change with Milica as author), and Marko sent an
-- adoption request.

insert into public.intakes (pet_id, intake_on, arrival_type, place_found, note, created_by) values (
  'c1000000-0000-4000-8000-000000000004', '2026-10-05', 'found', 'Bečej, kod pijace',
  'Uplašena, bez čipa.', 'a1000000-0000-4000-8000-000000000004'
);

insert into public.pet_status_history (pet_id, status, changed_at, changed_by) values (
  'c1000000-0000-4000-8000-000000000004', 'intake', '2026-10-05 10:00:00+02',
  'a1000000-0000-4000-8000-000000000004'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004"}', false);
update public.pets set shelter_status = 'available'
where id = 'c1000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claims', '', false);

insert into public.adoption_requests (pet_id, requester_id, name, phone, email, message) values (
  'c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002',
  'Marko Jovanović', '+381 64 123 4567', 'marko.jovanovic@mojljubimac.test',
  'Imam dvorište i iskustva sa psima. Mogu da dođem u subotu.'
);

-- Partners ------------------------------------------------------------------------------
-- Four partners in Novi Sad (Design §9). „Dr Vet“ is featured; „Kod Mace“ has a
-- paid_until in the past, so it is hidden (BR-40).

insert into public.partners (
  id, type, name, address, city_id, phone, email, website, instagram, description,
  message_channel, message_number, latitude, longitude, featured, paid_until
)
select p.id, p.type, p.name, p.address, c.id, p.phone, p.email, p.website, p.instagram,
       p.description, p.message_channel, p.message_number, p.latitude, p.longitude,
       p.featured, p.paid_until
from (
  values
    ('e1000000-0000-4000-8000-000000000001'::uuid, 'vet'::public.partner_type,
     'Veterinarska ambulanta „Dr Vet“', 'Bulevar oslobođenja 45, Novi Sad', '+381 21 455 100',
     'kontakt@drvet.rs', 'https://drvet.rs', 'drvet.ns', 'Pregledi, vakcinacija i mala hirurgija za pse i mačke.',
     'whatsapp'::public.partner_message_channel, '+381 64 455 1000', 45.2541, 19.8425, true, date '2027-12-31'),
    ('e1000000-0000-4000-8000-000000000002'::uuid, 'pet_shop'::public.partner_type,
     'Pet shop „Šapica“', 'Zmaj Jovina 20, Novi Sad', '+381 21 662 040',
     'prodaja@sapica.rs', 'https://sapica.rs', null, null,
     'whatsapp'::public.partner_message_channel, '+381 65 662 0400', 45.2560, 19.8452, false, date '2027-06-30'),
    ('e1000000-0000-4000-8000-000000000003'::uuid, 'grooming'::public.partner_type,
     'Grooming salon „Čupko“', 'Bulevar Evrope 18, Novi Sad', '+381 21 633 818',
     'zakazivanje@cupko.rs', null, null, null,
     'viber'::public.partner_message_channel, '+381 64 633 8180', 45.2474, 19.8130, false, date '2027-03-31'),
    ('e1000000-0000-4000-8000-000000000004'::uuid, 'pet_hotel'::public.partner_type,
     'Pet hotel „Kod Mace“', 'Veternička rampa bb, Novi Sad', '+381 21 820 777',
     'rezervacije@kodmace.rs', 'https://kodmace.rs', null, null,
     'whatsapp'::public.partner_message_channel, '+381 60 820 7770', 45.2470, 19.7710, false, date '2026-09-30')
) as p (id, type, name, address, phone, email, website, instagram, description,
        message_channel, message_number, latitude, longitude, featured, paid_until)
join public.cities c on c.name_sr = 'Novi Sad';

insert into public.partner_hours (partner_id, weekday, opens, closes)
select 'e1000000-0000-4000-8000-000000000001'::uuid, d, time '08:00', time '20:00' from generate_series(1, 5) d
union all select 'e1000000-0000-4000-8000-000000000001', 6, time '09:00', time '14:00'
union all select 'e1000000-0000-4000-8000-000000000002', d, time '09:00', time '20:00' from generate_series(1, 6) d
union all select 'e1000000-0000-4000-8000-000000000003', d, time '10:00', time '18:00' from generate_series(2, 6) d
union all select 'e1000000-0000-4000-8000-000000000004', d, time '00:00', time '24:00' from generate_series(1, 7) d;

-- Šapa pomoći (Step 28a) ------------------------------------------------------------------
-- One more test user (same local-only password as above):
--   dragana.kovacevic@mojljubimac.test shelter, admin of the approved shelter
--                                      Azil „Druga šansa“ (with donation info) — Novi Sad
-- (Milica's shelter stays pending.) Listings per Design §12 S32: a need by the shelter, a gift
-- by Marko (Free, Bečej), a sale with a price (Ivana) and one "po dogovoru" (Jelena), a search
-- (Jelena), one expired (Marko) and one resolved (Ivana). Ivana asked Marko about the gift and he
-- answered (unread); Jelena blocked Nikola; Marko has one open report.

with seed_users (id, email, full_name, account_type, city) as (
  values
    ('a1000000-0000-4000-8000-000000000007'::uuid, 'dragana.kovacevic@mojljubimac.test',
     'Dragana Kovačević', 'shelter'::public.account_type, 'Novi Sad')
),
new_auth_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
    extensions.crypt('MojLjubimac123!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', full_name), now(), now(),
    '', '', '', ''
  from seed_users
  returning id
),
new_identities as (
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(), su.id, su.id::text,
    jsonb_build_object('sub', su.id::text, 'email', su.email, 'email_verified', true),
    'email', now(), now(), now()
  from seed_users su
  join new_auth_users au on au.id = su.id
  returning user_id
)
insert into public.profiles (
  id, account_type, full_name, locale, city_id, email, terms_accepted_at, terms_version
)
select su.id, su.account_type, su.full_name, 'sr-Latn', c.id, su.email, now(), 'seed'
from seed_users su
join new_identities ni on ni.user_id = su.id
join public.cities c on c.name_sr = su.city;

insert into public.organisations (
  id, type, name, slug, city_id, created_by, description, phone, email,
  donation_bank_account, donation_url, dropoff_address, dropoff_hours
)
select 'b2000000-0000-4000-8000-000000000003', 'shelter', 'Azil „Druga šansa“', 'azil-druga-sansa',
       c.id, 'a1000000-0000-4000-8000-000000000007',
       'Udomljavamo napuštene pse i mačke iz Novog Sada i okoline.', '+381 21 400 200',
       'kontakt@drugasansa.rs', '160-0000012345678-90', 'https://drugasansa.rs/doniraj',
       'Primorska 12, Novi Sad', 'pon–pet 10–16h'
from public.cities c where c.name_sr = 'Novi Sad';

-- Shelters start pending (BR-32); the Operator approved this one.
update public.organisations set approval_status = 'approved'
where id = 'b2000000-0000-4000-8000-000000000003';

insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('b2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000007', 'admin');

insert into public.listings (
  id, author_id, organisation_id, type, title, description, category, species, city_id,
  price_minor, price_negotiable, status, resolved_outcome, published_at
)
select l.id, l.author_id, l.organisation_id, l.type, l.title, l.description, l.category, l.species,
       c.id, l.price_minor, l.price_negotiable, l.status, l.resolved_outcome, l.published_at
from (
  values
    ('f3000000-0000-4000-8000-000000000001'::uuid, 'a1000000-0000-4000-8000-000000000007'::uuid,
     'b2000000-0000-4000-8000-000000000003'::uuid, 'need'::public.listing_type,
     'Potrebno 20 kg granula za odrasle pse',
     'Imamo 34 psa i hrane nam ponestaje. Bilo koja granula za odrasle pse dobro dođe.',
     'food'::public.listing_category, 'dog'::public.listing_species, 'Novi Sad',
     null::integer, false, 'active'::public.listing_status, null::public.listing_outcome,
     now() - interval '2 days'),
    ('f3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', null, 'giving',
     'Poklanjam grebalicu za mačke',
     'Grebalica sa dva nivoa, malo korišćena. Preuzimanje u Bečeju.',
     'equipment_toys', 'cat', 'Bečej', null, false, 'active', null, now() - interval '1 day'),
    ('f3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', null, 'selling',
     'Prodajem transporter za psa',
     'Plastični transporter za pse do 15 kg, kao nov.',
     'carriers', 'dog', 'Novi Sad', 250000, false, 'active', null, now() - interval '3 days'),
    ('f3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000003', null, 'selling',
     'Prodajem krevet za psa',
     'Ortopedski krevet 90 × 70 cm, presvlaka se pere.',
     'furniture', 'dog', 'Novi Sad', null, true, 'active', null, now() - interval '5 days'),
    ('f3000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000003', null, 'seeking',
     'Tražim kavez za zeca',
     'Treba mi veći kavez ili ograda za patuljastog zeca.',
     'equipment_toys', 'other', 'Subotica', null, false, 'active', null, now() - interval '6 days'),
    ('f3000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', null, 'giving',
     'Poklanjam povodnik i ogrlicu',
     'Povodnik od 2 m i ogrlica za male pse.',
     'equipment_toys', 'dog', 'Beograd', null, false, 'expired', null, now() - interval '40 days'),
    ('f3000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', null, 'giving',
     'Poklanjam činije za hranu',
     'Dve keramičke činije, za mačke ili male pse.',
     'equipment_toys', 'cat', 'Novi Sad', null, false, 'resolved', 'given', now() - interval '12 days')
) as l (id, author_id, organisation_id, type, title, description, category, species, city,
        price_minor, price_negotiable, status, resolved_outcome, published_at)
join public.cities c on c.name_sr = l.city;

insert into public.conversations (id, listing_id, starter_id, owner_id, last_message_at) values (
  'f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', now()
);

insert into public.messages (conversation_id, sender_id, body, created_at, read_at) values
  ('f3100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Zdravo! Da li je grebalica još dostupna?', now() - interval '20 hours', now() - interval '19 hours'),
  ('f3100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'Jeste, možeš da je preuzmeš u subotu pre podne.', now() - interval '18 hours', null);

insert into public.user_blocks (blocker_id, blocked_id) values (
  'a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000005'
);

insert into public.reports (reporter_id, listing_id, reason, note) values (
  'a1000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000004', 'scam',
  'Traži uplatu unapred pre nego što pokaže krevet.'
);
