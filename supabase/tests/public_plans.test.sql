-- EP-44 view v_public_plans (Step 23; API EP-44, CR-22): readable by anon and authenticated; every plan code in
-- family-then-period order; before payments (no priced plans rows, OQ-03) price and monthly_equivalent are null.
-- An active priced row (a test fixture only — migrations and seed insert none) fills its price.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

select has_view('public', 'v_public_plans', 'EP-44 view exists');
select is((select count(*)::int from public.plans), 0, 'migrations and seed insert no plan rows (OQ-03)');

-- Visitor -----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select jsonb_agg(code::text) from public.v_public_plans),
  '["premium_monthly", "premium_yearly", "breeder_monthly", "breeder_yearly"]'::jsonb,
  'anon: every plan code, family then period (monthly before yearly)'
);
select is(
  (select count(*)::int from public.v_public_plans where price is null and monthly_equivalent is null),
  4, 'anon: before payments every price field is null'
);
select is(
  (select jsonb_agg(jsonb_build_array(family, period, trial_days)) from public.v_public_plans),
  '[["premium", "month", 7], ["premium", "year", 7], ["breeder", "month", 0], ["breeder", "year", 0]]'::jsonb,
  'family, period and trial_days are computed from the code'
);
select throws_ok($$insert into public.plans (code, price_minor, active) values ('premium_monthly', 49900, true)$$,
  '42501', null, 'anon cannot write plans');
reset role;

-- Signed-in user ----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.v_public_plans), 4, 'authenticated reads the four plan codes');
select is((select count(*)::int from public.v_public_plans where price is null), 4, 'authenticated: prices null before payments');
select throws_ok($$insert into public.plans (code, price_minor, active) values ('premium_monthly', 49900, true)$$,
  '42501', null, 'authenticated cannot write plans');
reset role;

-- Test fixture: priced rows (as postgres) --------------------------------------------------------------
insert into public.plans (code, price_minor, currency, active) values
  ('premium_monthly', 49900, 'RSD', true),
  ('premium_yearly', 499000, 'RSD', true),
  ('breeder_monthly', 199000, 'RSD', false);

set local role anon;
select is((select price from public.v_public_plans where code = 'premium_monthly'),
  '{"amount_minor": 49900, "currency": "RSD"}'::jsonb, 'an active priced row fills price');
select is((select monthly_equivalent from public.v_public_plans where code = 'premium_monthly'), null::jsonb,
  'monthly plans have no monthly_equivalent');
select is((select monthly_equivalent from public.v_public_plans where code = 'premium_yearly'),
  '{"amount_minor": 41583, "currency": "RSD"}'::jsonb, 'yearly monthly_equivalent = round(price_minor / 12)');
select is((select price from public.v_public_plans where code = 'breeder_monthly'), null::jsonb,
  'an inactive row is not a priced plan');
select is((select count(*)::int from public.v_public_plans), 4, 'still one row per plan code');
reset role;

select * from finish();
rollback;
