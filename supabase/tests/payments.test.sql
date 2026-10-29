-- Step 31 — payments (API EP-46 side effects, EP-49 step 1, EP-51, EP-52; TC ADR-09 v1.8; PRD FR-37, FR-42, BR-07,
-- BR-08, BR-09, BR-28, BR-51; E-15, E-21). apply_payment_event applies the neutral events lib/integrations/paddle.ts
-- maps from Paddle: idempotency on event_id, out-of-order guard, the status table, trial_used, last_notice_days,
-- payment rows (zero-amount rule, (provider_transaction_id, result) dedupe), the household flag through the existing
-- trigger, duplicate purchases and unknown price ids. Plus set_renewal_paused_for_deletion, manage_billing_available
-- and retention_delete_due_accounts(p_skip).
-- Seeded: Ivana (…01, owner, premium_monthly active without provider ids, owns household b1…01), Marko (…02, owner,
-- never subscribed), Jelena (…03, owner, household member), Nikola (…05, admin of breeder b2…02, no breeder plan).
-- Price ids below are test fixtures, not real Paddle ids.
begin;
create extension if not exists pgtap with schema extensions;

select plan(67);

-- Fixtures (as postgres) ---------------------------------------------------------------------------------------
update public.plans set provider_price_id = 'pri_test_pm', provider_trial_price_id = 'pri_test_pm_trial' where code = 'premium_monthly';
update public.plans set provider_price_id = 'pri_test_py', provider_trial_price_id = 'pri_test_py_trial' where code = 'premium_yearly';
update public.plans set provider_price_id = 'pri_test_bm' where code = 'breeder_monthly';
update public.plans set provider_price_id = 'pri_test_by' where code = 'breeder_yearly';

insert into public.pets (id, organisation_id, name, species, sex, offspring_status, price_minor) values
  ('e3100000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000002', 'Zlatko', 'dog', 'male', 'available', 9000000);

create function pg_temp.sub_event(
  p_event_id text, p_occurred timestamptz, p_sub text, p_status text, p_user uuid, p_plan text, p_price text,
  p_period_end timestamptz, p_trial_end timestamptz default null, p_cancel boolean default false,
  p_ended timestamptz default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'event_id', p_event_id, 'type', 'subscription', 'occurred_at', p_occurred,
    'provider_subscription_id', p_sub, 'provider_customer_id', 'ctm_test_' || p_sub, 'provider_status', p_status,
    'user_id', p_user, 'plan', p_plan, 'price_id', p_price, 'period_ends_at', p_period_end,
    'trial_ends_at', p_trial_end, 'cancel_scheduled', p_cancel, 'ended_at', coalesce(p_ended, p_occurred))
$$;

create function pg_temp.txn_event(
  p_event_id text, p_type text, p_txn text, p_sub text, p_kind text, p_amount integer,
  p_brand text default null, p_last4 text default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'event_id', p_event_id, 'type', p_type, 'occurred_at', now(), 'provider_transaction_id', p_txn,
    'provider_subscription_id', p_sub, 'kind', p_kind, 'amount_minor', p_amount, 'currency', 'EUR',
    'card_brand', p_brand, 'card_last4', p_last4)
$$;

create temp table t on commit drop as select now() as t0;

-- Access ------------------------------------------------------------------------------------------------------
select is((select prosecdef from pg_proc where oid = 'public.apply_payment_event(jsonb, boolean)'::regprocedure), true,
  'apply_payment_event is security definer');
select ok(not has_function_privilege('anon', 'public.apply_payment_event(jsonb, boolean)', 'execute'),
  'anon cannot apply payment events');
select ok(not has_function_privilege('authenticated', 'public.apply_payment_event(jsonb, boolean)', 'execute'),
  'a signed-in user cannot apply payment events');
select ok(has_function_privilege('service_role', 'public.apply_payment_event(jsonb, boolean)', 'execute'),
  'the service role (EP-46 route, EP-49 job) applies payment events');
select ok(has_function_privilege('authenticated', 'public.set_renewal_paused_for_deletion(boolean)', 'execute'),
  'EP-51: a signed-in user sets their own deletion flag');
select ok(not has_function_privilege('anon', 'public.set_renewal_paused_for_deletion(boolean)', 'execute'),
  'anon cannot set the deletion flag');

-- FR-37 #1 — subscription.trialing (Marko, trial price) -----------------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_1', now() - interval '50 minutes', 'sub_test_marko', 'trialing',
    'a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'pri_test_pm_trial',
    now() + interval '7 days', now() + interval '7 days')),
  'applied', 'FR-37 #1: the trialing event is applied'
);
select is(
  (select jsonb_build_array(status, plan, auto_renew, provider_customer_id, trial_ends_at = current_period_end)
   from public.subscriptions where provider_subscription_id = 'sub_test_marko'),
  '["trialing", "premium_monthly", true, "ctm_test_sub_test_marko", true]'::jsonb,
  'FR-37 #1: a trialing row with trial_ends_at from items[0].trial_dates.ends_at'
);
select ok((select current_period_end between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
  from public.subscriptions where provider_subscription_id = 'sub_test_marko'), 'FR-37 #1: 7 days free before the first charge');
select is((select trial_used from public.profiles where id = 'a1000000-0000-4000-8000-000000000002'), true,
  'BR-07: trial_used is set on trialing');
select ok(public.is_premium('a1000000-0000-4000-8000-000000000002'), 'the trial is Premium');
select is((select count(*)::int from public.payment_webhook_events where provider = 'paddle' and event_id = 'evt_test_1'), 1,
  'the event is recorded once processed');

-- Idempotency ---------------------------------------------------------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_1', now() - interval '1 minute', 'sub_test_marko', 'canceled',
    'a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'pri_test_pm_trial', null)),
  'duplicate', 'the same event_id twice → duplicate'
);
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_test_marko'), 'trialing',
  'a duplicate changes nothing');

-- Zero-amount transaction (the card check at the start of the trial) ------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.txn_event('evt_test_2', 'payment_succeeded', 'txn_test_trial', 'sub_test_marko', 'initial', 0, 'visa', '4242')),
  'applied', 'the zero-amount transaction is applied'
);
select is((select count(*)::int from public.subscription_payments p join public.subscriptions s on s.id = p.subscription_id
  where s.provider_subscription_id = 'sub_test_marko'), 0, 'a zero-amount transaction writes no payment row');
select is((select card_brand || ' ' || card_last4 from public.subscriptions where provider_subscription_id = 'sub_test_marko'),
  'visa 4242', 'card brand and last four are stored for display');

-- Out-of-order delivery -------------------------------------------------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_3', now() - interval '2 hours', 'sub_test_marko', 'canceled',
    'a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'pri_test_pm_trial', null)),
  'ignored', 'an event older than provider_event_at is ignored'
);
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_test_marko'), 'trialing',
  'the older event changes nothing');
select is((select count(*)::int from public.payment_webhook_events where event_id = 'evt_test_3'), 1,
  'the older event is still recorded as processed');

-- FR-37 #2 — renewal: subscription.updated (active, later period) + transaction.completed (subscription_recurring) ----
update public.subscriptions set last_notice_days = 7 where provider_subscription_id = 'sub_test_marko';
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_4', now() - interval '40 minutes', 'sub_test_marko', 'active',
    'a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'pri_test_pm',
    now() + interval '1 month 7 days')),
  'applied', 'FR-37 #2: the renewal update is applied'
);
select is(
  (select jsonb_build_array(status, auto_renew, last_notice_days, plan) from public.subscriptions
   where provider_subscription_id = 'sub_test_marko'),
  '["active", true, null, "premium_monthly"]'::jsonb,
  'FR-37 #2: status active, auto_renew on, last_notice_days reset when current_period_end moves later (BR-09)'
);
select ok((select current_period_end > now() + interval '1 month' from public.subscriptions
  where provider_subscription_id = 'sub_test_marko'), 'FR-37 #2: current_period_end moves to the new period');
select ok((select trial_ends_at is not null from public.subscriptions where provider_subscription_id = 'sub_test_marko'),
  'trial_ends_at is unchanged by an active event');
select is(
  public.apply_payment_event(pg_temp.txn_event('evt_test_5', 'payment_succeeded', 'txn_test_renewal', 'sub_test_marko', 'renewal', 363)),
  'applied', 'FR-37 #2: the renewal transaction is applied'
);
select is(
  (select jsonb_agg(jsonb_build_array(p.kind, p.result, p.amount_minor, p.currency))
   from public.subscription_payments p join public.subscriptions s on s.id = p.subscription_id
   where s.provider_subscription_id = 'sub_test_marko'),
  '[["renewal", "succeeded", 363, "EUR"]]'::jsonb, 'FR-37 #2: one renewal payment row (VAT included, EUR)'
);
select is(
  public.apply_payment_event(pg_temp.txn_event('evt_test_6', 'payment_succeeded', 'txn_test_renewal', 'sub_test_marko', 'renewal', 363)),
  'applied', 'a redelivery of the transaction under a new event id is applied'
);
select is((select count(*)::int from public.subscription_payments where provider_transaction_id = 'txn_test_renewal'), 1,
  'payment rows dedupe on (provider_transaction_id, result)');

-- payment_failed and past_due ---------------------------------------------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.txn_event('evt_test_7', 'payment_failed', 'txn_test_next', 'sub_test_marko', 'renewal', 363)),
  'applied', 'transaction.payment_failed is applied'
);
select is((select result::text from public.subscription_payments where provider_transaction_id = 'txn_test_next'), 'failed',
  'payment_failed inserts one failed row');
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_8', now() - interval '30 minutes', 'sub_test_marko', 'past_due',
    'a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'pri_test_pm', now() + interval '1 month 7 days')),
  'applied', 'subscription.past_due is applied'
);
select is((select jsonb_build_array(status, auto_renew) from public.subscriptions where provider_subscription_id = 'sub_test_marko'),
  '["payment_failed", true]'::jsonb, 'status table: past_due → payment_failed, auto_renew on (Paddle retries)');
select is(
  public.apply_payment_event(pg_temp.txn_event('evt_test_9', 'payment_succeeded', 'txn_test_next', 'sub_test_marko', 'renewal', 363)),
  'applied', 'the retried charge succeeds'
);
select is((select jsonb_agg(result order by result) from public.subscription_payments where provider_transaction_id = 'txn_test_next'),
  '["succeeded", "failed"]'::jsonb, 'a transaction can fail and later succeed: both rows exist');

-- active + scheduled cancel → cancelled (BR-08) ---------------------------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_10', now() - interval '20 minutes', 'sub_test_marko', 'active',
    'a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'pri_test_pm', now() + interval '1 month 7 days', null, true)),
  'applied', 'an active event with a scheduled cancellation is applied'
);
select is((select jsonb_build_array(status, auto_renew) from public.subscriptions where provider_subscription_id = 'sub_test_marko'),
  '["cancelled", false]'::jsonb, 'status table: active + cancel_scheduled → cancelled, auto_renew off');
select ok(public.is_premium('a1000000-0000-4000-8000-000000000002'), 'BR-08: Premium stays until the period ends');

-- EP-51 flag and EP-47 manage_billing_available (as Marko) ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((public.get_my_subscription() ->> 'manage_billing_available')::boolean, true,
  'EP-47: manage_billing_available with a Paddle customer');
select lives_ok($$select public.set_renewal_paused_for_deletion(true)$$, 'EP-51: the deletion request flags the row');
reset role;
select is((select renewal_paused_for_deletion from public.subscriptions where provider_subscription_id = 'sub_test_marko'), true,
  'renewal_paused_for_deletion = true');
set local role authenticated;
select lives_ok($$select public.set_renewal_paused_for_deletion(false)$$, 'EP-51: cancelling the deletion clears the flag');
reset role;
select is((select renewal_paused_for_deletion from public.subscriptions where provider_subscription_id = 'sub_test_marko'), false,
  'renewal_paused_for_deletion = false');

-- Duplicate purchase and unknown price ------------------------------------------------------------------------------
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_11', now() - interval '10 minutes', 'sub_test_marko_2', 'active',
    'a1000000-0000-4000-8000-000000000002', 'premium_yearly', 'pri_test_py', now() + interval '1 year')),
  'duplicate_subscription', 'a second running Premium subscription → duplicate_subscription'
);
select is((select count(*)::int from public.subscriptions where provider_subscription_id = 'sub_test_marko_2'), 0,
  'nothing is written for the duplicate purchase');
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_12', now() - interval '10 minutes', 'sub_test_jelena', 'active',
    'a1000000-0000-4000-8000-000000000003', 'premium_monthly', 'pri_test_unknown', now() + interval '1 month')),
  'ignored', 'an unknown price id is ignored'
);
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_13', now() - interval '10 minutes', 'sub_test_jelena', 'active',
    'a1000000-0000-4000-8000-000000000003', 'premium_monthly', 'pri_test_bm', now() + interval '1 month')),
  'ignored', 'a price of the other family is ignored'
);
select is((select count(*)::int from public.subscriptions where user_id = 'a1000000-0000-4000-8000-000000000003'), 0,
  'no row for an unknown price');

-- Transaction before its subscription → error, nothing recorded; accepted on retry ------------------------------------
select throws_ok(
  $$select public.apply_payment_event(pg_temp.txn_event('evt_test_14', 'payment_succeeded', 'txn_test_early', 'sub_test_jelena_2', 'initial', 300))$$,
  'P0001', 'not_found:subscription', 'a transaction.completed before its subscription raises (→ 500)'
);
select is((select count(*)::int from public.payment_webhook_events where event_id = 'evt_test_14'), 0,
  'nothing is recorded, so Paddle''s retry processes it again');
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_15', now() - interval '5 minutes', 'sub_test_jelena_2', 'active',
    'a1000000-0000-4000-8000-000000000003', 'premium_monthly', 'pri_test_pm', now() + interval '1 month')),
  'applied', 'the subscription arrives'
);
select is(
  public.apply_payment_event(pg_temp.txn_event('evt_test_14', 'payment_succeeded', 'txn_test_early', 'sub_test_jelena_2', 'initial', 300)),
  'applied', 'the retried transaction is accepted'
);
select is((select trial_used from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'), false,
  'E-15: buying the plain price does not use the trial');
select throws_ok(
  $$select public.apply_payment_event('{"event_id": "evt_test_16", "type": "subscription", "occurred_at": "2026-10-29T10:00:00Z", "provider_subscription_id": "sub_test_x"}'::jsonb)$$,
  'P0001', 'validation_failed', 'a subscription event without its required fields → validation_failed'
);

-- BR-28 — household read_only after subscription.canceled of the owner (Ivana) ----------------------------------------
update public.subscriptions set provider_subscription_id = 'sub_test_ivana', provider_customer_id = 'ctm_test_ivana'
where user_id = 'a1000000-0000-4000-8000-000000000001' and plan = 'premium_monthly';
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'), false,
  'Ivana''s household is writable while she is Premium');
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_17', now() - interval '1 minute', 'sub_test_ivana', 'canceled',
    null, null, 'pri_test_pm', null)),
  'applied', 'subscription.canceled is applied'
);
select is((select jsonb_build_array(status, auto_renew, current_period_end <= now()) from public.subscriptions
  where provider_subscription_id = 'sub_test_ivana'),
  '["expired", false, true]'::jsonb, 'status table: canceled → expired, current_period_end = the earlier of stored and ended_at');
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'), true,
  'BR-28: the household becomes read-only through the existing subscriptions trigger');

-- EP-49 step 1 — reconciliation without a webhook event row ---------------------------------------------------------
select is(
  public.apply_payment_event(
    pg_temp.sub_event(null, now(), 'sub_test_jelena_2', 'trialing', null, null, 'pri_test_pm', now() + interval '2 months', null, true),
    false),
  'applied', 'EP-49: a Paddle read is applied without an event id'
);
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_test_jelena_2'), 'cancelled',
  'status table: trialing + cancel_scheduled → cancelled');
select is((select count(*)::int from public.payment_webhook_events where event_id is null or event_id = ''), 0,
  'EP-49: no payment_webhook_events row');

-- FR-42 / E-21 — breeder plan (Nikola, breeder Admin) -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.pets set offspring_status = 'reserved' where id = 'e3100000-0000-4000-8000-000000000011'$$,
  'P0001', 'breeder_plan_required', 'E-21: without a breeder plan the offspring write → breeder_plan_required'
);
reset role;
select is(
  public.apply_payment_event(pg_temp.sub_event('evt_test_18', now() - interval '1 minute', 'sub_test_nikola', 'active',
    'a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'pri_test_bm', now() + interval '1 month')),
  'applied', 'FR-42: subscription.activated for the breeder Admin is applied'
);
select ok(private.breeder_plan_active('b2000000-0000-4000-8000-000000000002'), 'FR-42: breeder_plan_active is true');
select is((select trial_used from public.profiles where id = 'a1000000-0000-4000-8000-000000000005'), false,
  'BR-51: a breeder plan uses no trial');
set local role authenticated;
select lives_ok(
  $$update public.pets set offspring_status = 'reserved' where id = 'e3100000-0000-4000-8000-000000000011'$$,
  'E-21: the breeder-only write that failed now succeeds'
);
reset role;

-- EP-52 — retention_delete_due_accounts skips the accounts whose Paddle cancellation failed ---------------------------
update public.profiles set deletion_requested_at = now() - interval '31 days'
where id = 'a1000000-0000-4000-8000-000000000003';
set local role service_role;
select is(
  (public.retention_delete_due_accounts(100, array['a1000000-0000-4000-8000-000000000003']::uuid[]) ->> 'accounts_deleted')::int,
  0, 'EP-52: an account in p_skip is not deleted tonight'
);
reset role;
select is((select count(*)::int from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'), 1,
  'the skipped account is still there');

select * from finish();
rollback;
