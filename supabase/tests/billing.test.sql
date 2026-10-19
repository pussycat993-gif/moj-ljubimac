-- plans, subscriptions, subscription_payments, payment_webhook_events (TC §5.1, §5.7),
-- BR-07 (data side), EP-44, EP-47.
-- Seeded users: Ivana (…01, premium_monthly active), Marko (…02, Free).
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- BR-07: monthly or yearly, auto-renewing, one trial per user ----------------------------
select enum_has_labels('public', 'subscription_plan',
  array['premium_monthly', 'premium_yearly', 'breeder_monthly', 'breeder_yearly'],
  'plans are premium/breeder, monthly/yearly');
select enum_has_labels('public', 'subscription_status',
  array['trialing', 'active', 'cancelled', 'expired', 'payment_failed'],
  'subscription statuses');
select col_not_null('public', 'subscriptions', 'auto_renew', 'auto_renew is not null');
select col_default_is('public', 'subscriptions', 'auto_renew', 'true', 'auto_renew defaults to true');
select col_not_null('public', 'profiles', 'trial_used', 'trial_used is not null');
select col_default_is('public', 'profiles', 'trial_used', 'false', 'trial_used defaults to false');

-- plans -------------------------------------------------------------------------------------
select columns_are('public', 'plans', array['id', 'code', 'price_minor', 'currency', 'active', 'created_at', 'updated_at'],
  'plans has code, price_minor, currency, active');
select col_type_is('public', 'plans', 'code', 'subscription_plan', 'plans.code uses the plan enum');
select col_is_unique('public', 'plans', 'code', 'plans.code is unique');
select col_type_is('public', 'plans', 'currency', 'character(3)', 'currency is char(3)');
select col_default_is('public', 'plans', 'currency', 'RSD'::bpchar, 'currency defaults to RSD');
select is((select count(*)::int from public.plans), 0, 'plans is empty (prices are OQ-03)');
select throws_ok(
  $$insert into public.plans (code, price_minor, active) values ('premium_monthly', 0, true)$$,
  '23514', null, 'price_minor must be > 0'
);

-- subscriptions -------------------------------------------------------------------------------
select columns_are('public', 'subscriptions', array[
  'id', 'user_id', 'plan', 'status', 'trial_ends_at', 'current_period_end', 'auto_renew',
  'monri_token_ref', 'monri_cit_id', 'card_brand', 'card_last4', 'last_notice_days',
  'created_at', 'updated_at'
], 'subscriptions has the TC §5.1 columns');
select col_not_null('public', 'subscriptions', 'current_period_end', 'current_period_end is not null');
select col_type_is('public', 'subscriptions', 'card_last4', 'character(4)', 'card_last4 is char(4)');
select has_index('public', 'subscriptions', 'subscriptions_user_id_idx', 'subscriptions.user_id is indexed');
select throws_ok(
  $$insert into public.subscriptions (user_id, plan, status, current_period_end)
    values ('a1000000-0000-4000-8000-000000000001', 'premium_yearly', 'trialing', now() + interval '7 days')$$,
  '23505', null, 'a second running premium subscription for the same user is rejected'
);
select lives_ok(
  $$insert into public.subscriptions (user_id, plan, status, current_period_end)
    values ('a1000000-0000-4000-8000-000000000001', 'premium_yearly', 'expired', now() - interval '1 day')$$,
  'an expired premium row can sit beside the running one'
);
select lives_ok(
  $$insert into public.subscriptions (user_id, plan, status, current_period_end)
    values ('a1000000-0000-4000-8000-000000000001', 'breeder_monthly', 'active', now() + interval '1 month')$$,
  'a running row of the other plan family is allowed'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, plan, status, current_period_end, last_notice_days)
    values ('a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'active', now() + interval '1 month', 14)$$,
  '23514', null, 'last_notice_days is 30, 7 or 1'
);

-- subscription_payments ---------------------------------------------------------------------
insert into public.subscription_payments (subscription_id, amount_minor, kind, result, monri_transaction_id)
select id, 99000, 'initial', 'succeeded', 'tx-1' from public.subscriptions
where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly';
select throws_ok(
  $$insert into public.subscription_payments (subscription_id, amount_minor, kind, result, monri_transaction_id)
    select id, 0, 'renewal', 'failed', 'tx-2' from public.subscriptions
    where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly'$$,
  '23514', null, 'amount_minor must be > 0'
);
select throws_ok(
  $$insert into public.subscription_payments (subscription_id, amount_minor, kind, result, monri_transaction_id)
    select id, 99000, 'renewal', 'succeeded', 'tx-1' from public.subscriptions
    where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly'$$,
  '23505', null, 'monri_transaction_id is unique'
);
select col_default_is('public', 'subscription_payments', 'currency', 'RSD'::bpchar, 'payment currency defaults to RSD');

-- payment_webhook_events ----------------------------------------------------------------------
insert into public.payment_webhook_events (provider, event_id) values ('test', 'evt-1');
select throws_ok(
  $$insert into public.payment_webhook_events (provider, event_id) values ('test', 'evt-1')$$,
  '23505', null, 'provider + event_id is unique'
);
select lives_ok(
  $$insert into public.payment_webhook_events (provider, event_id) values ('other', 'evt-1')$$,
  'the same event id from another provider is accepted'
);

-- RLS -----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.subscriptions), 0, 'a Free user sees no subscriptions (not another user''s)');
select throws_ok(
  $$insert into public.subscriptions (user_id, plan, status, current_period_end)
    values ('a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'active', now() + interval '1 month')$$,
  '42501', null, 'clients cannot insert subscriptions'
);
select throws_ok($$select * from public.subscription_payments$$, '42501', null, 'subscription_payments are invisible to clients');
select throws_ok($$select * from public.payment_webhook_events$$, '42501', null, 'payment_webhook_events are invisible to clients');
select throws_ok(
  $$insert into public.plans (code, price_minor, active) values ('premium_monthly', 1, true)$$,
  '42501', null, 'clients cannot write plans'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.subscriptions),
  (select count(*)::int from public.subscriptions where user_id = 'a1000000-0000-4000-8000-000000000001'),
  'a user sees only their own subscriptions'
);
select is((select count(*)::int from public.subscriptions), 3, 'the Premium owner sees all three of their rows');
select throws_ok($$update public.subscriptions set auto_renew = false$$, '42501', null, 'clients cannot update subscriptions');
select throws_ok($$delete from public.subscriptions$$, '42501', null, 'clients cannot delete subscriptions');

reset role;
set local role anon;
select lives_ok($$select * from public.plans$$, 'anon reads plans');
select throws_ok($$select * from public.subscriptions$$, '42501', null, 'anon cannot read subscriptions');
reset role;

select * from finish();
rollback;
