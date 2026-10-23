-- rpc:get_me (EP-43 get; API §6 Me, Entitlements), the EP-43 column grant and the
-- EP-41 complete_registration organisation path.
-- Seeded (supabase/seed.sql): Ivana (…01, Premium owner, Luna + Maks, household with
-- Jelena), Marko (…02, Free owner, Kiki), Milica (…04, shelter admin, pending),
-- Nikola (…05, breeder admin).
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

select has_function('public', 'get_me', array[]::text[], 'rpc:get_me() exists');
select function_returns('public', 'get_me', array[]::text[], 'jsonb', 'get_me returns jsonb');

-- Setup (as postgres): a verified auth user with no profiles row yet.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'a1200000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'novi.azil@mojljubimac.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1200000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'novi.vlasnik@mojljubimac.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

-- No profile → null ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_me(), null, 'get_me returns null when the session has no profiles row');
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select public.get_me()$$, '42501', null, 'anon cannot call get_me');
reset role;

-- Premium seed user (Ivana) ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table me_ivana on commit drop as select public.get_me() as me;
reset role;

select is((select me ->> 'id' from me_ivana), 'a1000000-0000-4000-8000-000000000001', 'Me.id is the caller');
select is((select me ->> 'email' from me_ivana), 'ivana.petrovic@mojljubimac.test', 'Me.email');
select is((select me ->> 'account_type' from me_ivana), 'owner', 'Me.account_type');
select is((select me ->> 'locale' from me_ivana), 'sr-Latn', 'Me.locale');
select is((select me -> 'city' ->> 'name_sr' from me_ivana), 'Novi Sad', 'Me.city is the City of profiles.city_id');
select is((select me -> 'organisation' from me_ivana), 'null'::jsonb, 'an owner has no organisation');
select is((select me -> 'entitlements' ->> 'plan' from me_ivana), 'premium', 'Premium: plan = premium');
select is((select (me -> 'entitlements' ->> 'premium')::boolean from me_ivana), true, 'Premium: premium = true');
select is((select me -> 'entitlements' ->> 'subscription_status' from me_ivana), 'active', 'subscription_status of the latest row');
select ok((select (me -> 'entitlements' ->> 'days_left')::int between 28 and 32 from me_ivana), 'days_left counts to current_period_end');
select is((select me -> 'entitlements' -> 'limits' -> 'active_pets' from me_ivana), 'null'::jsonb, 'Premium: no pet limit');
select is((select (me -> 'entitlements' -> 'limits' ->> 'household_members')::int from me_ivana), 6, 'Premium: household limit 6');
select is((select me -> 'entitlements' -> 'channels' from me_ivana), '["email", "push", "whatsapp"]'::jsonb,
  'Premium channels: email, push, whatsapp (Viber off)');
select is((select (me -> 'usage' ->> 'active_pets')::int from me_ivana), 2, 'usage.active_pets counts own active pets');
select is((select (me -> 'usage' ->> 'household_members')::int from me_ivana), 2, 'usage.household_members = owner + members');
select is((select jsonb_array_length(me -> 'usage' -> 'moments_by_pet') from me_ivana), 2, 'moments_by_pet lists every own pet');
select is((select me -> 'usage' -> 'free_slot_pet' from me_ivana), 'null'::jsonb, 'Premium: no free slot pet');

-- Viber joins the Premium channels when the Operator enables it (as postgres).
update public.app_settings set viber_enabled = true;
set local role authenticated;
select is((public.get_me() -> 'entitlements' -> 'channels'), '["email", "push", "whatsapp", "viber"]'::jsonb,
  'Premium channels include viber when app_settings.viber_enabled');
reset role;
update public.app_settings set viber_enabled = false;

-- Free seed user (Marko) ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
create temp table me_marko on commit drop as select public.get_me() as me;
reset role;

select is((select me -> 'entitlements' ->> 'plan' from me_marko), 'free', 'Free: plan = free');
select is((select me -> 'entitlements' -> 'subscription_status' from me_marko), 'null'::jsonb, 'never subscribed → status null');
select is((select me -> 'entitlements' -> 'days_left' from me_marko), 'null'::jsonb, 'never subscribed → days_left null');
select is((select (me -> 'entitlements' ->> 'trial_available')::boolean from me_marko), true, 'trial available until used');
select is((select me -> 'entitlements' -> 'limits' from me_marko),
  '{"active_pets": 1, "memorials": 2, "attachments_per_pet": 10, "moments_per_pet": 5, "household_members": 0}'::jsonb,
  'Free limits (BR-01/02, BR-19/20)');
select is((select me -> 'entitlements' -> 'channels' from me_marko), '["email", "push"]'::jsonb, 'Free channels: email, push');
select is((select (me -> 'entitlements' ->> 'pdf_export')::boolean from me_marko), false, 'Free: no PDF export');
select is((select (me -> 'usage' ->> 'active_pets')::int from me_marko), 1, 'Free: one active pet');
select is((select me -> 'usage' -> 'household_members' from me_marko), 'null'::jsonb, 'no owned household → null');
select is((select me -> 'usage' -> 'free_slot_pet' ->> 'name' from me_marko), 'Kiki', 'Free: the slot holder is the earliest active pet');

-- Organisation member (Milica, pending shelter) --------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_me() -> 'organisation',
  '{"id": "b2000000-0000-4000-8000-000000000001", "name": "Azil Šapica", "type": "shelter", "slug": "azil-sapica", "role": "admin", "approval_status": "pending"}'::jsonb,
  'Me.organisation is the caller''s membership');

-- EP-43 column grant: only full_name, city_id, locale ---------------------------------------------
select lives_ok(
  $$update public.profiles set full_name = 'Milica S.', locale = 'en', city_id = null
    where id = 'a1000000-0000-4000-8000-000000000004'$$,
  'full_name, city_id and locale are updatable'
);
select throws_ok($$update public.profiles set account_type = 'owner'$$, '42501', null, 'account_type is not updatable');
select throws_ok($$update public.profiles set terms_version = 'x'$$, '42501', null, 'terms_version is not updatable');
select throws_ok($$update public.profiles set is_operator = true$$, '42501', null, 'is_operator is not updatable');
select is(public.get_me() ->> 'locale', 'en', 'get_me reflects the updated locale');
reset role;

-- EP-41 complete_registration: shelter path --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.profiles (id, account_type, locale, email, terms_accepted_at, terms_version)
    values ('a1200000-0000-4000-8000-000000000001', 'shelter', 'sr-Latn', 'novi.azil@mojljubimac.test', now(), '2026-10-20')$$,
  'a verified user inserts their own profile'
);
select throws_ok(
  $$insert into public.organisations (id, type, name, slug, city_id, created_by)
    values ('b2100000-0000-4000-8000-000000000009', 'breeder', 'Pogrešan tip', 'pogresan-tip', null,
            'a1200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'the organisation type must match the account type'
);
select throws_ok(
  $$insert into public.organisations (id, type, name, slug, city_id, created_by)
    values ('b2100000-0000-4000-8000-000000000008', 'shelter', 'Tuđi azil', 'tudji-azil', null,
            'a1000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'created_by must be the caller'
);
select lives_ok(
  $$insert into public.organisations (id, type, name, slug, city_id, tax_id, created_by)
    values ('b2100000-0000-4000-8000-000000000001', 'shelter', 'Udruženje Druga šansa', 'udruzenje-druga-sansa',
            (select id from public.cities where name_sr = 'Bečej'), '108765432',
            'a1200000-0000-4000-8000-000000000001')$$,
  'a shelter account inserts its organisation'
);
select is(public.get_me() -> 'organisation' ->> 'approval_status', 'pending', 'a new shelter is pending (BR-32)');
select is(public.get_me() -> 'organisation' ->> 'role', 'admin', 'the creator becomes its admin');
select throws_ok(
  $$insert into public.organisations (id, type, name, slug, created_by)
    values ('b2100000-0000-4000-8000-000000000002', 'shelter', 'Drugi azil', 'drugi-azil',
            'a1200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'one organisation per registration'
);
reset role;
select is(
  (select count(*)::int from public.organisation_memberships where organisation_id = 'b2100000-0000-4000-8000-000000000001'),
  1, 'exactly one membership was created'
);

-- An owner account cannot create an organisation.
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.profiles (id, account_type, locale, email, terms_accepted_at, terms_version)
    values ('a1200000-0000-4000-8000-000000000002', 'owner', 'en', 'novi.vlasnik@mojljubimac.test', now(), '2026-10-20')$$,
  'an owner registers'
);
select throws_ok(
  $$insert into public.organisations (id, type, name, slug, created_by)
    values ('b2100000-0000-4000-8000-000000000003', 'shelter', 'Nije azil', 'nije-azil',
            'a1200000-0000-4000-8000-000000000002')$$,
  '42501', null, 'an owner account cannot insert an organisation'
);
reset role;

select * from finish();
rollback;
