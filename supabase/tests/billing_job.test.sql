-- Step 30 — EP-49 nightly subscription job, database side (FR-25 #1, FR-32, FR-39; BR-09, BR-10, BR-28):
-- billing_expire_subscriptions, billing_expiry_notice_candidates, mark_expiry_notice_sent and
-- billing_refresh_household_flags (service role only) and the 'billing-nightly' pg_cron job.
-- Seeded (supabase/seed.sql): Ivana (…01) premium_monthly active, owner of household b1…01 with Luna and Maks
-- active (Luna shared); Jelena (…03) is its member. Time is moved by setting current_period_end in fixtures and
-- by passing p_now to the candidates function.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Privileges ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.billing_expire_subscriptions()$$, '42501', null,
  'a signed-in user cannot run billing_expire_subscriptions');
select throws_ok($$select * from public.billing_expiry_notice_candidates()$$, '42501', null,
  'a signed-in user cannot run billing_expiry_notice_candidates');
select throws_ok($$select public.mark_expiry_notice_sent(gen_random_uuid(), 30)$$, '42501', null,
  'a signed-in user cannot run mark_expiry_notice_sent');
select throws_ok($$select public.billing_refresh_household_flags()$$, '42501', null,
  'a signed-in user cannot run billing_refresh_household_flags');
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select public.billing_expire_subscriptions()$$, '42501', null,
  'a Visitor cannot run billing_expire_subscriptions');
reset role;

-- FR-25 #1 — notices at 30 / 7 / 1 Belgrade days -----------------------------------------------------------
-- "Today" is 1 Nov 2026 in Belgrade (10:00 CET).
update public.subscriptions
set plan = 'premium_yearly', status = 'active', auto_renew = true, current_period_end = '2026-12-01 12:00+00'
where user_id = 'a1000000-0000-4000-8000-000000000001';
insert into public.subscriptions (user_id, plan, status, current_period_end, auto_renew) values
  ('a1000000-0000-4000-8000-000000000002', 'premium_monthly', 'active', '2026-11-08 12:00+00', false),
  ('a1000000-0000-4000-8000-000000000003', 'premium_monthly', 'cancelled', '2026-11-01 23:30+00', false),
  -- 30 days left on the first day of a monthly period: skipped (EP-49).
  ('a1000000-0000-4000-8000-000000000006', 'premium_monthly', 'active', '2026-12-01 12:00+00', true),
  -- Breeder plans get no premium_expiry email (CR-24).
  ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', '2026-11-08 12:00+00', true);

set local role service_role;
select is(
  (select jsonb_agg(jsonb_build_object('user', c.user_id, 'days', c.days_left, 'auto_renew', c.auto_renew)
     order by c.days_left desc)
   from public.billing_expiry_notice_candidates('2026-11-01 09:00+00') c),
  '[{"user": "a1000000-0000-4000-8000-000000000001", "days": 30, "auto_renew": true},
    {"user": "a1000000-0000-4000-8000-000000000002", "days": 7, "auto_renew": false},
    {"user": "a1000000-0000-4000-8000-000000000003", "days": 1, "auto_renew": false}]'::jsonb,
  'FR-25 #1: one candidate each with 30 / 7 / 1 Belgrade days left (yearly, monthly, cancelled); auto_renew picks the renew line'
);
select is(
  (select row(c.email, c.locale, c.plan)::text from public.billing_expiry_notice_candidates('2026-11-01 09:00+00') c
   where c.days_left = 30),
  row('ivana.petrovic@mojljubimac.test', 'sr-Latn', 'premium_yearly')::text,
  'the candidate carries the email, locale and plan for the email'
);
select ok(
  not exists (select 1 from public.billing_expiry_notice_candidates('2026-11-01 09:00+00') c
              where c.user_id = 'a1000000-0000-4000-8000-000000000006'),
  'a monthly plan skips the 30-day notice on the period''s first day'
);
select ok(
  not exists (select 1 from public.billing_expiry_notice_candidates('2026-11-01 09:00+00') c
              where c.user_id = 'a1000000-0000-4000-8000-000000000005'),
  'a breeder plan gets no premium_expiry notice'
);
select is(
  (select count(*)::int from public.billing_expiry_notice_candidates('2026-11-01 22:59+00')), 3,
  'the day is the Belgrade date: 23:59 Belgrade is still 1 Nov'
);
select is(
  (select count(*)::int from public.billing_expiry_notice_candidates('2026-11-01 23:00+00')), 0,
  'at 00:00 Belgrade on 2 Nov no row has 30 / 7 / 1 days left'
);
select is(
  (select count(*)::int from public.subscriptions where last_notice_days is not null), 0,
  'reading the candidates marks nothing (the route marks only after Resend accepted)'
);
select ok(
  public.mark_expiry_notice_sent(s.id, 30), 'mark_expiry_notice_sent records the 30-day notice'
) from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000001';
select ok(public.mark_expiry_notice_sent(s.id, 7), 'and the 7-day notice')
from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000002';
select ok(public.mark_expiry_notice_sent(s.id, 1), 'and the 1-day notice')
from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000003' and s.status = 'cancelled';
select is(
  (select jsonb_object_agg(s.user_id, s.last_notice_days) from public.subscriptions s where s.last_notice_days is not null),
  '{"a1000000-0000-4000-8000-000000000001": 30, "a1000000-0000-4000-8000-000000000002": 7,
    "a1000000-0000-4000-8000-000000000003": 1}'::jsonb,
  'last_notice_days is set on each row'
);
select is(
  (select count(*)::int from public.billing_expiry_notice_candidates('2026-11-01 09:00+00')), 0,
  'a re-run on the same Belgrade date finds nothing: no second notice'
);
select ok(
  not public.mark_expiry_notice_sent(s.id, 30), 'the same notice is not recorded twice'
) from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000001';
select is(
  (select jsonb_agg(jsonb_build_object('user', c.user_id, 'days', c.days_left) order by c.user_id)
   from public.billing_expiry_notice_candidates('2026-11-24 09:00+00') c),
  '[{"user": "a1000000-0000-4000-8000-000000000001", "days": 7}, {"user": "a1000000-0000-4000-8000-000000000006", "days": 7}]'::jsonb,
  'after the 30-day notice the same row gets its 7-day notice (the skipped monthly row gets its 7-day one too)'
);
select throws_ok(
  $$select public.mark_expiry_notice_sent(gen_random_uuid(), 14)$$, 'P0001', 'validation_failed',
  'only 30, 7 and 1 are notice days'
);
reset role;

-- Step 2 — expiry -----------------------------------------------------------------------------------------
update public.subscriptions set last_notice_days = null;
update public.subscriptions set status = 'cancelled', current_period_end = now() - interval '1 hour'
where user_id = 'a1000000-0000-4000-8000-000000000001';
-- Renewal pending (auto_renew on, a Paddle subscription): not expired — Paddle decides and the EP-49 step 1
-- reconciliation mirrors it (Step 31).
update public.subscriptions set status = 'active', auto_renew = true, current_period_end = now() - interval '1 hour',
  provider_subscription_id = 'sub_test_billing_job', provider_customer_id = 'ctm_test_billing_job'
where user_id = 'a1000000-0000-4000-8000-000000000002';
-- Auto-renew on, but the account deletion is pending: expired (EP-51).
update public.subscriptions set status = 'active', auto_renew = true, current_period_end = now() - interval '1 hour'
where user_id = 'a1000000-0000-4000-8000-000000000006';
update public.profiles set deletion_requested_at = now() - interval '2 days' where id = 'a1000000-0000-4000-8000-000000000006';
-- Still running: untouched.
update public.subscriptions set current_period_end = now() + interval '5 days'
where user_id = 'a1000000-0000-4000-8000-000000000003';
-- The fixture updates above already refreshed the flag through the Step 05 trigger; in production the period simply
-- runs out with no row change, so the stored flag is still the old one when the job starts.
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'), false,
  'before the run Ivana''s household is not read-only (the flag is stale)');

set local role service_role;
select is(
  public.billing_expire_subscriptions(),
  '{"expired": 2, "household_ids": ["b1000000-0000-4000-8000-000000000001"]}'::jsonb,
  'the job expires the cancelled row and the pending-deletion row and reports the household whose flag changed'
);
reset role;
select is(
  (select jsonb_object_agg(s.user_id, s.status) from public.subscriptions s where s.plan::text like 'premium%'),
  '{"a1000000-0000-4000-8000-000000000001": "expired", "a1000000-0000-4000-8000-000000000002": "active",
    "a1000000-0000-4000-8000-000000000003": "cancelled", "a1000000-0000-4000-8000-000000000006": "expired"}'::jsonb,
  'a renewal-pending row and a running row stay as they are'
);
select ok(not public.is_premium('a1000000-0000-4000-8000-000000000001'),
  'FR-25 #2 (database side): Ivana is no longer Premium, so the dispatch falls back to email + push');

-- FR-32 — members keep read-only access ------------------------------------------------------------------
select is((select read_only from public.households where id = 'b1000000-0000-4000-8000-000000000001'), true,
  'FR-32: the owner''s household becomes read-only');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select name from public.pets where id = 'c1000000-0000-4000-8000-000000000001'), 'Luna',
  'FR-32: the member still reads the shared pet');
select throws_ok(
  $$insert into public.weight_entries (pet_id, measured_on, value) values ('c1000000-0000-4000-8000-000000000001', current_date, 4.2)$$,
  'P0001', 'household_read_only', 'FR-32: the member cannot add to its record while the household is read-only'
);
reset role;

-- FR-39 — downgrade: everything stays visible, new items beyond Free are blocked -------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.pets where owner_id = 'a1000000-0000-4000-8000-000000000001' and lifecycle = 'active'), 2,
  'FR-39: both active pets stay readable after expiry (Free allows 1)');
select is((select count(*)::int from public.vaccinations where pet_id = 'c1000000-0000-4000-8000-000000000001') > 0, true,
  'FR-39: their records stay readable');
select throws_ok(
  $$insert into public.pets (owner_id, name, species, sex) values ('a1000000-0000-4000-8000-000000000001', 'Novi', 'dog', 'male')$$,
  'P0001', 'premium_required:pets', 'FR-39: a new pet beyond the Free limit fails with premium_required'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Step 4 — household flag recompute ----------------------------------------------------------------------
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.billing_refresh_household_flags(), array['b1000000-0000-4000-8000-000000000001']::uuid[],
  'a stale household flag is recomputed and reported');
select is(public.billing_refresh_household_flags(), '{}'::uuid[], 'a second run changes nothing');
reset role;

-- Schedule -------------------------------------------------------------------------------------------------
select is(
  (select row(schedule, active, command like '%private.call_internal_route(''/api/internal/billing-nightly'')%')::text
   from cron.job where jobname = 'billing-nightly'),
  row('0 1,2 * * *', true, true)::text,
  'billing-nightly runs at 01:00 and 02:00 UTC through call_internal_route (the route keeps 03:00 Belgrade)'
);

select * from finish();
rollback;
