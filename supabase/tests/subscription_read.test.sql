-- EP-47 rpc:get_my_subscription and EP-48 set_auto_renew (Step 23; FR-25 display data, FR-38, BR-07, BR-08).
-- Seeded: Ivana (…01, owner, premium_monthly active), Marko (…02, owner, never subscribed), Jelena (…03, owner,
-- Free), Milica (…04, shelter admin), Nikola (…05, breeder admin). Other subscription rows are fixtures
-- inserted in this transaction. Step 31: price from the seeded EUR plans row (BR-62) and manage_billing_available
-- (API §6 v1.4: true only with a Paddle customer).
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

select has_function('public', 'get_my_subscription', array[]::text[], 'EP-47 function exists');
select is((select prosecdef from pg_proc where oid = 'public.get_my_subscription()'::regprocedure), false,
  'EP-47 is security invoker');
select has_function('public', 'set_auto_renew', array['boolean'], 'EP-48 function exists');
select ok(not has_function_privilege('anon', 'public.get_my_subscription()', 'execute'), 'a Visitor cannot read a subscription');
select ok(not has_function_privilege('anon', 'public.set_auto_renew(boolean)', 'execute'), 'a Visitor cannot change a subscription');

create temp table ivana_before on commit drop as
  select id, current_period_end from public.subscriptions where user_id = 'a1000000-0000-4000-8000-000000000001';

-- EP-47 — an active Premium owner ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table sub_ivana on commit drop as select public.get_my_subscription() as s;
reset role;
select is((select s ->> 'status' from sub_ivana), 'active', 'status of the latest premium row');
select is((select (s ->> 'is_active')::boolean from sub_ivana), true, 'is_active while the period runs');
select is((select s ->> 'plan' from sub_ivana), 'premium_monthly', 'plan');
select ok((select (s ->> 'days_remaining')::int between 28 and 32 from sub_ivana), 'days_remaining counts to current_period_end');
select ok((select (s ->> 'period_days')::int between 28 and 31 from sub_ivana), 'period_days of a monthly plan');
select is((select s -> 'price' from sub_ivana), '{"amount_minor": 300, "currency": "EUR"}'::jsonb,
  'price from the plans row of the subscription''s plan (EUR, BR-62)');
select is((select (s ->> 'manage_billing_available')::boolean from sub_ivana), false,
  'manage_billing_available is false for a row without a Paddle customer (seed data)');
select is((select s ->> 'card_brand' from sub_ivana), 'visa', 'card_brand');
select is((select s -> 'over_limits' from sub_ivana), '[]'::jsonb, 'over_limits is empty while active');
select is((select (s ->> 'trial_available')::boolean from sub_ivana), true, 'trial_available = not trial_used (BR-07)');

-- EP-47 — never subscribed -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
create temp table sub_marko on commit drop as select public.get_my_subscription() as s;
reset role;
select is((select jsonb_build_array(s -> 'id', s -> 'plan', s -> 'status', s -> 'current_period_end', s -> 'days_remaining') from sub_marko),
  '[null, null, null, null, null]'::jsonb, 'never subscribed: id, plan, status and period fields are null');
select is((select (s ->> 'is_active')::boolean from sub_marko), false, 'never subscribed: not active');
select is((select (s ->> 'trial_available')::boolean from sub_marko), true, 'never subscribed: trial available');
select is((select (s ->> 'manage_billing_available')::boolean from sub_marko), false,
  'never subscribed: manage_billing_available = false');

-- Breeder admin: breeder family, no trial (BR-07 covers Premium only).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((public.get_my_subscription() ->> 'trial_available')::boolean, false, 'breeder family: trial_available = false');
reset role;

-- Shelter accounts → forbidden_role.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.get_my_subscription()$$, 'P0001', 'forbidden_role', 'a shelter account → forbidden_role (EP-47)');
select throws_ok($$select public.set_auto_renew(false)$$, 'P0001', 'forbidden_role', 'a shelter account → forbidden_role (EP-48)');
reset role;

-- FR-38 — cancel auto-renew (EP-48 false) ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.subscriptions set auto_renew = false where user_id = 'a1000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'clients cannot update subscriptions directly'
);
create temp table cancelled on commit drop as select (public.set_auto_renew(false)).*;
create temp table me_after_cancel on commit drop as select public.get_me() as me, public.get_my_subscription() as s;
reset role;
select is((select status::text from cancelled), 'cancelled', 'auto_renew = false → status cancelled');
select is((select auto_renew from cancelled), false, 'auto_renew = false');
select is((select current_period_end from cancelled), (select current_period_end from ivana_before), 'current_period_end unchanged (BR-08)');
select is((select id from cancelled), (select id from ivana_before), 'the same row is updated');
select is(public.is_premium('a1000000-0000-4000-8000-000000000001'), true, 'Premium stays until the end of the period');
select is((select (me -> 'entitlements' ->> 'premium')::boolean from me_after_cancel), true, 'Entitlements.premium still true');
select is((select (s ->> 'is_active')::boolean from me_after_cancel), true, 'EP-47 still active after cancelling');

-- EP-48 true resumes.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temp table resumed on commit drop as select (public.set_auto_renew(true)).*;
reset role;
select is((select status::text || ':' || auto_renew::text from resumed), 'active:true', 'auto_renew = true → active again');

-- A trialing subscription resumes as trialing (fixture for Jelena).
insert into public.subscriptions (user_id, plan, status, trial_ends_at, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000003', 'premium_monthly', 'trialing', now() + interval '3 days', now() + interval '3 days', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((public.get_my_subscription() ->> 'period_days')::int, 7, 'period_days is 7 while trialing');
select is((public.set_auto_renew(false)).status::text, 'cancelled', 'cancelling during the trial → cancelled (no first charge)');
select is((public.set_auto_renew(true)).status::text, 'trialing', 'resuming during the trial → trialing');
reset role;

-- No running row → subscription_not_active -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.set_auto_renew(false)$$, 'P0001', 'subscription_not_active', 'never subscribed → subscription_not_active');
reset role;

insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew)
values ('a1000000-0000-4000-8000-000000000002', 'premium_yearly', 'expired', now() - interval '2 days', false);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.set_auto_renew(true)$$, 'P0001', 'subscription_not_active', 'an expired row → subscription_not_active (use EP-45)');
create temp table sub_expired on commit drop as select public.get_my_subscription() as s;
reset role;
select is((select s ->> 'status' from sub_expired), 'expired', 'EP-47 returns the most recent row, expired');
select is((select (s ->> 'is_active')::boolean from sub_expired), false, 'an expired row is not active');
select is((select (s ->> 'days_remaining')::int from sub_expired), 0, 'days_remaining is at least 0');

-- A cancelled row whose period has ended cannot be resumed either.
update public.subscriptions set status = 'cancelled', current_period_end = now() - interval '1 hour'
where user_id = 'a1000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.set_auto_renew(true)$$, 'P0001', 'subscription_not_active', 'a cancelled row past its period → subscription_not_active');
reset role;

select * from finish();
rollback;
