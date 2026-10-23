-- FR-39 downgrade behaviour (Step 23; BR-10, E-02, E-04, E-08): a user whose Premium ended with more than Free
-- allows — 2 active pets, 11 attachments and 6 moments on one pet — still reads every row; a further pet,
-- attachment or moment fails with premium_required; EP-47 lists the over_limits summary for S18.
-- Fixture (this transaction): owner …a1300000…01 with a Premium subscription while the rows are created,
-- then the subscription expires.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

select set_config('request.jwt.claims', '', true);

insert into auth.users (id, email) values ('a1300000-0000-4000-8000-000000000001', 'bivsi.premium@mojljubimac.test');
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version, full_name)
values ('a1300000-0000-4000-8000-000000000001', 'owner', 'bivsi.premium@mojljubimac.test', now(), 'seed', 'Petar Ilić');

insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1300000-0000-4000-8000-000000000001', 'premium_monthly', 'active', now() + interval '10 days', true);

insert into public.pets (id, owner_id, name, species, sex) values
  ('c1300000-0000-4000-8000-000000000001', 'a1300000-0000-4000-8000-000000000001', 'Bobi', 'dog', 'male'),
  ('c1300000-0000-4000-8000-000000000002', 'a1300000-0000-4000-8000-000000000001', 'Mica', 'cat', 'female');

insert into public.vet_visits (id, pet_id, visited_on, reason, created_by)
values ('d1300000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-000000000001', current_date, 'Kontrola',
        'a1300000-0000-4000-8000-000000000001');

insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes, created_by)
select 'd1300000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-000000000001',
       'u/a1300000-0000-4000-8000-000000000001/pets/c1300000-0000-4000-8000-000000000001/visits/x/' || n || '.pdf',
       n || '.pdf', 'application/pdf', 1000, 'a1300000-0000-4000-8000-000000000001'
from generate_series(1, 11) n;

insert into public.moments (pet_id, moment_date, text, created_by)
select 'c1300000-0000-4000-8000-000000000001', current_date, 'Trenutak ' || n, 'a1300000-0000-4000-8000-000000000001'
from generate_series(1, 6) n;

-- Premium ends.
update public.subscriptions set status = 'expired', current_period_end = now() - interval '1 day', auto_renew = false
where user_id = 'a1300000-0000-4000-8000-000000000001';

select is(public.is_premium('a1300000-0000-4000-8000-000000000001'), false, 'the subscription has expired');

-- All existing rows stay readable ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets where lifecycle = 'active'), 2, 'both active pets remain readable');
select is((select count(*)::int from public.attachments where pet_id = 'c1300000-0000-4000-8000-000000000001'), 11,
  'all 11 attachments remain readable');
select is((select count(*)::int from public.moments where pet_id = 'c1300000-0000-4000-8000-000000000001'), 6,
  'all 6 moments remain readable');

-- New items beyond Free limits are blocked --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex)
    values ('a1300000-0000-4000-8000-000000000001', 'Treći', 'rabbit', 'female')$$,
  'P0001', 'premium_required:pets', 'a further pet → premium_required:pets'
);
select throws_ok(
  $$insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
    values ('d1300000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-000000000001',
            'u/a1300000-0000-4000-8000-000000000001/pets/c1300000-0000-4000-8000-000000000001/visits/x/12.pdf',
            '12.pdf', 'application/pdf', 1000)$$,
  'P0001', 'premium_required:attachments', 'a 12th attachment → premium_required:attachments'
);
select throws_ok(
  $$insert into public.moments (pet_id, moment_date, text)
    values ('c1300000-0000-4000-8000-000000000001', current_date, 'Sedmi')$$,
  'P0001', 'premium_required:moments', 'a 7th moment → premium_required:moments'
);

-- S18 expired variant: EP-47 over_limits ---------------------------------------------------------------------------
create temp table sub on commit drop as select public.get_my_subscription() as s;
create temp table me on commit drop as select public.get_me() as m;
reset role;

select is((select s ->> 'status' from sub), 'expired', 'EP-47 status expired');
select is((select (s ->> 'is_active')::boolean from sub), false, 'EP-47 is_active = false');
select is(
  (select jsonb_path_query_array(s -> 'over_limits', '$[*] ? (@.limit == "pets")') from sub),
  '[{"used": 2, "limit": "pets", "pet_id": null, "allowed": 1, "pet_name": null}]'::jsonb,
  'over_limits: pets 2 of 1'
);
select is(
  (select jsonb_path_query_array(s -> 'over_limits', '$[*] ? (@.limit == "attachments")') from sub),
  '[{"used": 11, "limit": "attachments", "pet_id": "c1300000-0000-4000-8000-000000000001", "allowed": 10, "pet_name": "Bobi"}]'::jsonb,
  'over_limits: attachments per pet, 11 of 10'
);
select is((select jsonb_array_length(s -> 'over_limits') from sub), 2, 'no household or WhatsApp entry without them');
select is((select m -> 'entitlements' ->> 'plan' from me), 'free', 'Entitlements: back on Free');
select is((select (m -> 'entitlements' -> 'limits' ->> 'active_pets')::int from me), 1, 'Entitlements: Free pet limit');

select * from finish();
rollback;
