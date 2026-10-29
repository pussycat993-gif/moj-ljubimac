-- EP-44 view v_public_plans (Step 23; API EP-44 v1.4, CR-22): readable by anon and authenticated; every plan code
-- in family-then-period order. Step 31 (BR-62): the migration seeds the four EUR rows — premium_monthly 300,
-- premium_yearly 3000, breeder_monthly 1100, breeder_yearly 11000 (euro cents before VAT); the provider price ids
-- are not exposed. A code without an active row has price and monthly_equivalent null (CR-22).
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

select has_view('public', 'v_public_plans', 'EP-44 view exists');
select is((select count(*)::int from public.plans where active and currency = 'EUR'), 4,
  'the migration seeds four active EUR plan rows (BR-62)');

-- Visitor -----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select jsonb_agg(code::text) from public.v_public_plans),
  '["premium_monthly", "premium_yearly", "breeder_monthly", "breeder_yearly"]'::jsonb,
  'anon: every plan code, family then period (monthly before yearly)'
);
select is(
  (select jsonb_agg(price) from public.v_public_plans),
  '[{"amount_minor": 300, "currency": "EUR"}, {"amount_minor": 3000, "currency": "EUR"},
    {"amount_minor": 1100, "currency": "EUR"}, {"amount_minor": 11000, "currency": "EUR"}]'::jsonb,
  'anon: BR-62 — 3 € / 30 € Premium, 11 € / 110 € breeder (euro cents before VAT)'
);
select is(
  (select jsonb_agg(jsonb_build_array(family, period, trial_days)) from public.v_public_plans),
  '[["premium", "month", 7], ["premium", "year", 7], ["breeder", "month", 0], ["breeder", "year", 0]]'::jsonb,
  'family, period and trial_days are computed from the code'
);
select is(
  (select monthly_equivalent from public.v_public_plans where code = 'premium_yearly'),
  '{"amount_minor": 250, "currency": "EUR"}'::jsonb, 'yearly monthly_equivalent = round(price_minor / 12)'
);
select is((select monthly_equivalent from public.v_public_plans where code = 'premium_monthly'), null::jsonb,
  'monthly plans have no monthly_equivalent');
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'v_public_plans' and column_name like 'provider_%'),
  0, 'the provider price ids are not exposed by EP-44'
);
select throws_ok($$insert into public.plans (code, price_minor, active) values ('premium_monthly', 300, true)$$,
  '42501', null, 'anon cannot write plans');
reset role;

-- Signed-in user ----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.v_public_plans), 4, 'authenticated reads the four plan codes');
select is((select count(*)::int from public.v_public_plans where price is not null), 4, 'authenticated: every plan is priced');
select throws_ok($$update public.plans set price_minor = 1 where code = 'premium_monthly'$$,
  '42501', null, 'authenticated cannot write plans');
reset role;

-- CR-22: a code without an active row (as postgres) ----------------------------------------------------
update public.plans set active = false where code = 'breeder_yearly';
update public.plans set price_minor = 350 where code = 'premium_monthly';

set local role anon;
select is((select price from public.v_public_plans where code = 'breeder_yearly'), null::jsonb,
  'an inactive row is not a priced plan');
select is((select monthly_equivalent from public.v_public_plans where code = 'breeder_yearly'), null::jsonb,
  'no monthly_equivalent without a price');
select is((select price from public.v_public_plans where code = 'premium_monthly'),
  '{"amount_minor": 350, "currency": "EUR"}'::jsonb, 'prices are data: the view follows the plans row');
select is((select count(*)::int from public.v_public_plans), 4, 'still one row per plan code');
reset role;

select * from finish();
rollback;
