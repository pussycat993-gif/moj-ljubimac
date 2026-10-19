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

