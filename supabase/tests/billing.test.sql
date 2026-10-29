-- plans, subscriptions, subscription_payments, payment_webhook_events (TC §5.1, §5.7),
-- BR-07 (data side), EP-44, EP-47. Step 31 (TC v1.8): the Paddle provider columns, the dropped monri_* columns,
-- unique (provider_transaction_id, result), the trial-price check on breeder rows, EUR defaults and the four
-- seeded EUR plan rows (BR-62).
-- Seeded users: Ivana (…01, premium_monthly active), Marko (…02, Free).
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

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
select columns_are('public', 'plans', array['id', 'code', 'price_minor', 'currency', 'active', 'created_at', 'updated_at',
  'provider_price_id', 'provider_trial_price_id'],
  'plans has code, price_minor, currency, active and the Paddle price ids');
select col_type_is('public', 'plans', 'code', 'subscription_plan', 'plans.code uses the plan enum');
select col_is_unique('public', 'plans', 'code', 'plans.code is unique');
select col_type_is('public', 'plans', 'currency', 'character(3)', 'currency is char(3)');
select col_default_is('public', 'plans', 'currency', 'EUR'::bpchar, 'currency defaults to EUR');
select is((select count(*)::int from public.plans), 4, 'the four EUR plan rows are seeded (BR-62)');
select is((select count(*)::int from public.plans where provider_price_id is null and provider_trial_price_id is null), 4,
  'provider price ids are environment data — null after the migration');
select throws_ok(
  $$update public.plans set provider_trial_price_id = 'pri_test_trial' where code = 'breeder_monthly'$$,
  '23514', null, 'a breeder plan cannot have a trial price (BR-51)'
);
select lives_ok(
  $$update public.plans set provider_trial_price_id = 'pri_test_trial' where code = 'premium_monthly'$$,
  'a Premium plan can have a trial price'
);
select throws_ok(
  $$insert into public.plans (code, price_minor, active) values ('premium_monthly', 0, true)$$,
  '23514', null, 'price_minor must be > 0'
);

-- subscriptions -------------------------------------------------------------------------------
select columns_are('public', 'subscriptions', array[
  'id', 'user_id', 'plan', 'status', 'trial_ends_at', 'current_period_end', 'auto_renew',
  'provider_customer_id', 'provider_subscription_id', 'provider_event_at', 'renewal_paused_for_deletion',
  'card_brand', 'card_last4', 'last_notice_days', 'created_at', 'updated_at'
], 'subscriptions has the TC §5.1 (v1.8) columns');
select hasnt_column('public', 'subscriptions', 'monri_token_ref', 'monri_token_ref is dropped');
select hasnt_column('public', 'subscriptions', 'monri_cit_id', 'monri_cit_id is dropped');
select col_is_unique('public', 'subscriptions', 'provider_subscription_id', 'provider_subscription_id is unique');
select col_not_null('public', 'subscriptions', 'renewal_paused_for_deletion', 'renewal_paused_for_deletion is not null');
select col_default_is('public', 'subscriptions', 'renewal_paused_for_deletion', 'false',
  'renewal_paused_for_deletion defaults to false');
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
select hasnt_column('public', 'subscription_payments', 'monri_transaction_id', 'monri_transaction_id is renamed');
select has_column('public', 'subscription_payments', 'provider_transaction_id', 'provider_transaction_id exists');
insert into public.subscription_payments (subscription_id, amount_minor, kind, result, provider_transaction_id)
select id, 300, 'initial', 'succeeded', 'txn_test_1' from public.subscriptions
where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly';
select throws_ok(
  $$insert into public.subscription_payments (subscription_id, amount_minor, kind, result, provider_transaction_id)
    select id, 0, 'renewal', 'failed', 'txn_test_2' from public.subscriptions
    where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly'$$,
  '23514', null, 'amount_minor must be > 0'
);
select throws_ok(
  $$insert into public.subscription_payments (subscription_id, amount_minor, kind, result, provider_transaction_id)
    select id, 300, 'renewal', 'succeeded', 'txn_test_1' from public.subscriptions
    where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly'$$,
  '23505', null, '(provider_transaction_id, result) is unique'
);
select lives_ok(
  $$insert into public.subscription_payments (subscription_id, amount_minor, kind, result, provider_transaction_id)
    select id, 300, 'initial', 'failed', 'txn_test_1' from public.subscriptions
    where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly'$$,
  'a transaction can fail and later succeed (unique together with result)'
);
select col_default_is('public', 'subscription_payments', 'currency', 'EUR'::bpchar, 'payment currency defaults to EUR');

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
