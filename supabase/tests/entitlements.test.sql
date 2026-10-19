-- is_premium(user) truth table (API §5.6 "Premium active") and the seeded users.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

select has_function('public', 'is_premium', array['uuid'], 'is_premium(uuid) exists');
select function_returns('public', 'is_premium', array['uuid'], 'boolean', 'is_premium returns boolean');
select volatility_is('public', 'is_premium', array['uuid'], 'stable', 'is_premium is stable');

-- One test user per case (one running row per family per user).
insert into auth.users (id, email)
select ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'premium-case-' || n || '@mojljubimac.test'
from generate_series(1, 9) n;
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
select ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'owner', 'x', now(), 'seed'
from generate_series(1, 9) n;

insert into public.subscriptions (user_id, plan, status, current_period_end) values
  ('e0000000-0000-4000-8000-000000000001', 'premium_monthly', 'trialing', now() + interval '7 days'),
  ('e0000000-0000-4000-8000-000000000002', 'premium_monthly', 'active', now() + interval '1 month'),
  ('e0000000-0000-4000-8000-000000000003', 'premium_yearly', 'cancelled', now() + interval '1 day'),
  ('e0000000-0000-4000-8000-000000000004', 'premium_monthly', 'expired', now() + interval '1 month'),
  ('e0000000-0000-4000-8000-000000000005', 'premium_monthly', 'payment_failed', now() + interval '1 month'),
  ('e0000000-0000-4000-8000-000000000006', 'premium_monthly', 'active', now() - interval '1 second'),
  ('e0000000-0000-4000-8000-000000000007', 'breeder_monthly', 'active', now() + interval '1 month'),
  ('e0000000-0000-4000-8000-000000000008', 'breeder_yearly', 'trialing', now() + interval '1 month');
-- …009 has no subscription.

select is(public.is_premium('e0000000-0000-4000-8000-000000000001'), true, 'trialing with a future period end is premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000002'), true, 'active with a future period end is premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000003'), true, 'cancelled with a future period end is still premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000004'), false, 'expired is not premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000005'), false, 'payment_failed is not premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000006'), false, 'a past current_period_end is not premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000007'), false, 'a breeder plan is not premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000008'), false, 'a breeder trial is not premium');
select is(public.is_premium('e0000000-0000-4000-8000-000000000009'), false, 'no subscription is not premium');

-- Seeded users (supabase/seed.sql) -----------------------------------------------------------------
select is(public.is_premium('a1000000-0000-4000-8000-000000000001'), true, 'the seeded Premium owner is premium');
select is(public.is_premium('a1000000-0000-4000-8000-000000000002'), false, 'the seeded Free owner is not premium');
select is(
  (select array_agg(account_type::text order by account_type::text) from (select distinct account_type from public.profiles
   where id::text like 'a1000000-%') t),
  array['breeder', 'owner', 'shelter'],
  'the seed has a user of every account type'
);

select * from finish();
rollback;
