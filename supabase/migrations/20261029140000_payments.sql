-- Step 31 — payments & pricing (OQ-11 = Paddle Billing, TC ADR-09 v1.8; OQ-03 = EUR prices, PRD BR-62).
--   subscriptions: the monri_* columns are dropped; provider_customer_id, provider_subscription_id (unique),
--     provider_event_at and renewal_paused_for_deletion are added (TC §5.1).
--   subscription_payments: monri_transaction_id → provider_transaction_id, unique (provider_transaction_id, result);
--     currency defaults to EUR.
--   plans: currency defaults to EUR; provider_price_id and provider_trial_price_id (Premium only); the four EUR
--     price rows (BR-62) with null provider ids — the ids are environment data, set per environment with the SQL
--     update in the README "Payments (Paddle)" section, never in a migration.
--   apply_payment_event(p_event, p_record_event) — EP-46 side effects in one transaction (service role only),
--     also used by the EP-49 reconciliation without a payment_webhook_events row.
--   set_renewal_paused_for_deletion(p_paused) — EP-51 flag on the caller's running provider row.
--   get_my_subscription() — recreated with Subscription.manage_billing_available (API §6, v1.4).
--   retention_delete_due_accounts(p_limit, p_skip) — recreated with p_skip: accounts whose Paddle cancellation
--     failed are skipped for the night (EP-52, v1.4).
-- The existing subscriptions trigger keeps households.read_only in step with Premium (BR-28); no new trigger.
-- Errors are raised per TC §5.7.1 with API §7.2 codes.

-- subscriptions -------------------------------------------------------------------------------------------------
alter table public.subscriptions
  drop column monri_token_ref,
  drop column monri_cit_id,
  add column provider_customer_id text,
  add column provider_subscription_id text unique,
  add column provider_event_at timestamptz,
  add column renewal_paused_for_deletion boolean not null default false;

-- subscription_payments -----------------------------------------------------------------------------------------
alter table public.subscription_payments rename column monri_transaction_id to provider_transaction_id;
alter table public.subscription_payments drop constraint subscription_payments_monri_transaction_id_key;
alter table public.subscription_payments
  add constraint subscription_payments_provider_transaction_id_result_key unique (provider_transaction_id, result);
alter table public.subscription_payments alter column currency set default 'EUR';

-- plans ---------------------------------------------------------------------------------------------------------
alter table public.plans alter column currency set default 'EUR';
alter table public.plans
  add column provider_price_id text,
  add column provider_trial_price_id text,
  add constraint plans_trial_price_premium_only
    check (provider_trial_price_id is null or code in ('premium_monthly', 'premium_yearly'));

-- BR-62: euro cents before VAT (Paddle adds VAT at checkout).
insert into public.plans (code, price_minor, currency, active) values
  ('premium_monthly', 300, 'EUR', true),
  ('premium_yearly', 3000, 'EUR', true),
  ('breeder_monthly', 1100, 'EUR', true),
  ('breeder_yearly', 11000, 'EUR', true)
on conflict (code) do update set price_minor = excluded.price_minor, currency = excluded.currency;

-- EP-46 — apply_payment_event -----------------------------------------------------------------------------------
-- p_event is the neutral event lib/integrations/paddle.ts maps from a Paddle envelope (API EP-46 "Request"):
--   { event_id, type: subscription | payment_succeeded | payment_failed, occurred_at, … }.
-- Returns 'applied', 'duplicate' (event_id already processed), 'ignored' (older than provider_event_at, unknown
-- price id, transaction without a subscription, duplicate purchase already ended) or 'duplicate_subscription' (a
-- second running subscription of the same family — the route cancels it at Paddle). A transaction whose
-- subscription is unknown raises not_found:subscription, so nothing is recorded and Paddle's retry succeeds.
create function public.apply_payment_event(p_event jsonb, p_record_event boolean default true)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_type text := p_event ->> 'type';
  v_event_id text := nullif(p_event ->> 'event_id', '');
  v_occurred_at timestamptz;
  v_sub_id text := nullif(p_event ->> 'provider_subscription_id', '');
  v_customer_id text;
  v_provider_status text;
  v_price_id text;
  v_user uuid;
  v_request_plan text;
  v_plan public.subscription_plan;
  v_is_trial_price boolean := false;
  v_family text;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_cancel boolean;
  v_ended_at timestamptz;
  v_status public.subscription_status;
  v_auto_renew boolean;
  v_new_end timestamptz;
  s public.subscriptions;
  v_amount integer;
  v_result public.payment_result;
  v_kind public.payment_kind;
  v_inserted integer;
begin
  if v_type is null or v_type not in ('subscription', 'payment_succeeded', 'payment_failed') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'type:invalid';
  end if;
  begin
    v_occurred_at := (p_event ->> 'occurred_at')::timestamptz;
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'occurred_at:invalid';
  end;
  if v_occurred_at is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'occurred_at:required';
  end if;

  -- Idempotency: the event row rolls back with everything else on failure.
  if p_record_event then
    if v_event_id is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'event_id:required';
    end if;
    insert into public.payment_webhook_events (provider, event_id)
    values ('paddle', v_event_id)
    on conflict (provider, event_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      return 'duplicate';
    end if;
  end if;

  -- Payment events ----------------------------------------------------------------------------------------------
  if v_type in ('payment_succeeded', 'payment_failed') then
    if nullif(p_event ->> 'provider_transaction_id', '') is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'provider_transaction_id:required';
    end if;
    if v_sub_id is null then
      return 'ignored';
    end if;
    if p_event ->> 'amount_minor' is null or (p_event ->> 'amount_minor') !~ '^[0-9]+$' then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'amount_minor:required';
    end if;
    v_amount := (p_event ->> 'amount_minor')::integer;

    select * into s from public.subscriptions x where x.provider_subscription_id = v_sub_id for update;
    if s.id is null then
      raise exception using errcode = 'P0001', message = 'not_found:subscription';
    end if;

    v_result := case when v_type = 'payment_succeeded' then 'succeeded' else 'failed' end;
    v_kind := case when p_event ->> 'kind' = 'renewal' then 'renewal' else 'initial' end;

    if v_result = 'succeeded' and nullif(p_event ->> 'card_brand', '') is not null then
      update public.subscriptions x
      set card_brand = p_event ->> 'card_brand',
          card_last4 = case
            when (p_event ->> 'card_last4') ~ '^[0-9]{4}$' then p_event ->> 'card_last4'
            else null
          end
      where x.id = s.id;
    end if;

    -- A zero-amount transaction (the card check at the start of a trial) writes no payment row.
    if v_amount > 0 then
      insert into public.subscription_payments (subscription_id, amount_minor, currency, kind, result, provider_transaction_id)
      values (s.id, v_amount, coalesce(nullif(upper(p_event ->> 'currency'), ''), 'EUR'), v_kind, v_result,
              p_event ->> 'provider_transaction_id')
      on conflict (provider_transaction_id, result) do nothing;
    end if;
    return 'applied';
  end if;

  -- Subscription events -----------------------------------------------------------------------------------------
  v_customer_id := nullif(p_event ->> 'provider_customer_id', '');
  v_provider_status := nullif(p_event ->> 'provider_status', '');
  v_price_id := nullif(p_event ->> 'price_id', '');
  if v_sub_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'provider_subscription_id:required';
  end if;
  if v_customer_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'provider_customer_id:required';
  end if;
  if v_provider_status is null or v_provider_status not in ('trialing', 'active', 'past_due', 'paused', 'canceled') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'provider_status:invalid';
  end if;
  if v_price_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'price_id:required';
  end if;
  begin
    v_period_end := (p_event ->> 'period_ends_at')::timestamptz;
    v_trial_end := (p_event ->> 'trial_ends_at')::timestamptz;
    v_ended_at := coalesce((p_event ->> 'ended_at')::timestamptz, v_occurred_at);
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'timestamp:invalid';
  end;
  v_cancel := coalesce((p_event ->> 'cancel_scheduled')::boolean, false);

  select * into s from public.subscriptions x where x.provider_subscription_id = v_sub_id for update;

  if s.id is null then
    begin
      v_user := nullif(p_event ->> 'user_id', '')::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'user_id:invalid';
    end;
    v_request_plan := nullif(p_event ->> 'plan', '');
    if v_user is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'user_id:required';
    end if;
    if v_request_plan is null
       or v_request_plan not in ('premium_monthly', 'premium_yearly', 'breeder_monthly', 'breeder_yearly') then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'plan:required';
    end if;
    v_family := case when v_request_plan like 'premium_%' then 'premium' else 'breeder' end;
  else
    -- Out-of-order delivery: an older event changes nothing (still recorded as processed).
    if s.provider_event_at is not null and v_occurred_at < s.provider_event_at then
      return 'ignored';
    end if;
    v_family := case when s.plan in ('premium_monthly', 'premium_yearly') then 'premium' else 'breeder' end;
  end if;

  -- The price gives the stored plan; it must belong to the same family. Unknown price ids are ignored (logged).
  select p.code, p.provider_trial_price_id is not distinct from v_price_id
    into v_plan, v_is_trial_price
  from public.plans p
  where (p.provider_price_id = v_price_id or p.provider_trial_price_id = v_price_id)
    and case when p.code in ('premium_monthly', 'premium_yearly') then 'premium' else 'breeder' end = v_family
  limit 1;
  if v_plan is null then
    return 'ignored';
  end if;

  -- Status table (API EP-46).
  if v_provider_status in ('trialing', 'active') then
    v_status := case
      when v_cancel then 'cancelled'
      when v_provider_status = 'trialing' then 'trialing'
      else 'active'
    end;
    v_auto_renew := not v_cancel;
    v_new_end := coalesce(v_period_end, s.current_period_end);
  elsif v_provider_status = 'past_due' then
    v_status := 'payment_failed';
    v_auto_renew := true;
    v_new_end := coalesce(v_period_end, s.current_period_end);
  else
    v_status := 'expired';
    v_auto_renew := false;
    v_new_end := case
      when s.current_period_end is null then v_ended_at
      else least(s.current_period_end, v_ended_at)
    end;
  end if;
  if v_new_end is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'period_ends_at:required';
  end if;

  if s.id is null then
    if not exists (select 1 from public.profiles p where p.id = v_user) then
      return 'ignored';
    end if;
    -- Duplicate purchase: a second running subscription of the same family is not stored.
    if exists (
      select 1 from public.subscriptions x
      where x.user_id = v_user
        and x.status in ('trialing', 'active', 'cancelled')
        and case when x.plan in ('premium_monthly', 'premium_yearly') then 'premium' else 'breeder' end = v_family
    ) then
      return case when v_status = 'expired' then 'ignored' else 'duplicate_subscription' end;
    end if;

    insert into public.subscriptions (
      user_id, plan, status, trial_ends_at, current_period_end, auto_renew,
      provider_customer_id, provider_subscription_id, provider_event_at
    ) values (
      v_user, v_plan, v_status,
      case when v_provider_status = 'trialing' then v_trial_end else null end,
      v_new_end, v_auto_renew, v_customer_id, v_sub_id, v_occurred_at
    );
  else
    update public.subscriptions x
    set plan = v_plan,
        status = v_status,
        auto_renew = v_auto_renew,
        current_period_end = v_new_end,
        trial_ends_at = case when v_provider_status = 'trialing' then v_trial_end else x.trial_ends_at end,
        provider_customer_id = v_customer_id,
        provider_event_at = v_occurred_at,
        -- BR-09: a renewal (period end moves later) re-arms the expiry notices.
        last_notice_days = case when v_new_end > x.current_period_end then null else x.last_notice_days end
    where x.id = s.id;
    v_user := s.user_id;
  end if;

  -- BR-07: the one trial is used once Paddle reports a trial (or the trial price was bought).
  if v_provider_status = 'trialing' or v_is_trial_price then
    update public.profiles p set trial_used = true where p.id = v_user and not p.trial_used;
  end if;

  return 'applied';
end;
$$;

revoke all on function public.apply_payment_event(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_payment_event(jsonb, boolean) to service_role;

-- EP-51 — set_renewal_paused_for_deletion -----------------------------------------------------------------------
-- true: the caller's running provider rows are flagged after the scheduled Paddle cancellation (deletion request);
-- false: the flag is cleared after the Paddle resume (deletion cancelled, E-16). Acts on auth.uid() only.
create function public.set_renewal_paused_for_deletion(p_paused boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_paused is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'paused:required';
  end if;

  update public.subscriptions x
  set renewal_paused_for_deletion = p_paused
  where x.user_id = uid
    and x.provider_subscription_id is not null
    and x.status in ('trialing', 'active', 'cancelled', 'payment_failed')
    and x.renewal_paused_for_deletion is distinct from p_paused;
end;
$$;

revoke all on function public.set_renewal_paused_for_deletion(boolean) from public, anon;
grant execute on function public.set_renewal_paused_for_deletion(boolean) to authenticated;

-- EP-47 — get_my_subscription with manage_billing_available (v1.4) ----------------------------------------------
create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_family text;
  v_trial_used boolean;
  v_type public.account_type;
  s public.subscriptions;
  v_price jsonb;
  v_is_active boolean;
  v_today date := (now() at time zone 'Europe/Belgrade')::date;
  v_end date;
  v_period_days integer;
  v_over jsonb := '[]'::jsonb;
  v_count integer;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  v_family := private.subscription_family_of(uid);

  select p.trial_used, p.account_type into v_trial_used, v_type from public.profiles p where p.id = uid;

  select * into s
  from public.subscriptions x
  where x.user_id = uid
    and case when x.plan in ('premium_monthly', 'premium_yearly') then 'premium' else 'breeder' end = v_family
  order by x.created_at desc, x.current_period_end desc
  limit 1;

  v_is_active := s.id is not null
    and s.status in ('trialing', 'active', 'cancelled')
    and s.current_period_end > now();

  if s.id is not null then
    select jsonb_build_object('amount_minor', pl.price_minor, 'currency', pl.currency)
      into v_price
    from public.plans pl where pl.code = s.plan;

    v_end := (s.current_period_end at time zone 'Europe/Belgrade')::date;
    v_period_days := case
      when s.status = 'trialing' then 7
      when s.plan in ('premium_monthly', 'breeder_monthly')
        then v_end - ((s.current_period_end - interval '1 month') at time zone 'Europe/Belgrade')::date
      else v_end - ((s.current_period_end - interval '1 year') at time zone 'Europe/Belgrade')::date
    end;
  end if;

  -- over_limits: owners without an active subscription, every Free limit currently exceeded (BR-01, FR-39).
  if v_type = 'owner' and not v_is_active then
    select count(*)::integer into v_count from public.pets pt where pt.owner_id = uid and pt.lifecycle = 'active';
    if v_count > 1 then
      v_over := v_over || jsonb_build_object('limit', 'pets', 'pet_id', null, 'pet_name', null, 'used', v_count, 'allowed', 1);
    end if;

    v_over := v_over || coalesce((
      select jsonb_agg(jsonb_build_object('limit', 'attachments', 'pet_id', x.id, 'pet_name', x.name, 'used', x.n, 'allowed', 10)
        order by x.created_at, x.id)
      from (
        select pt.id, pt.name, pt.created_at, count(a.id)::integer as n
        from public.pets pt
        join public.attachments a on a.pet_id = pt.id
        where pt.owner_id = uid
        group by pt.id
        having count(a.id) > 10
      ) x
    ), '[]'::jsonb);

    select count(*)::integer into v_count
    from public.household_memberships hm
    join public.households h on h.id = hm.household_id
    where h.owner_id = uid;
    if v_count > 0 then
      v_over := v_over || jsonb_build_object('limit', 'household', 'pet_id', null, 'pet_name', null, 'used', v_count, 'allowed', 0);
    end if;

    select count(*)::integer into v_count
    from public.reminder_preferences rp
    where rp.user_id = uid and 'whatsapp' = any (rp.channels);
    if v_count > 0 then
      v_over := v_over || jsonb_build_object('limit', 'whatsapp', 'pet_id', null, 'pet_name', null, 'used', v_count, 'allowed', 0);
    end if;
  end if;

  return jsonb_build_object(
    'id', s.id,
    'plan', s.plan,
    'status', s.status,
    'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'auto_renew', s.auto_renew,
    'price', v_price,
    'period_days', v_period_days,
    'days_remaining', case when s.id is null then null else greatest(0, v_end - v_today) end,
    'is_active', v_is_active,
    'trial_available', v_family = 'premium' and not coalesce(v_trial_used, false),
    'card_brand', s.card_brand,
    'card_last4', s.card_last4,
    'manage_billing_available', s.provider_customer_id is not null,
    'over_limits', v_over
  );
end;
$$;

revoke execute on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated, service_role;

-- EP-52 — retention_delete_due_accounts with p_skip (v1.4) -----------------------------------------------------
-- The route cancels each due account's non-expired Paddle subscription immediately before this runs; an account
-- whose cancellation failed is passed in p_skip and waits for the next night, so a deleted user is never charged.
drop function public.retention_delete_due_accounts(integer);

create function public.retention_delete_due_accounts(p_limit integer default 100, p_skip uuid[] default '{}')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_result jsonb;
  v_deleted integer := 0;
  v_failed integer := 0;
  v_transferred integer := 0;
  v_organisations integer := 0;
begin
  for v_user in
    select p.id from public.profiles p
    where p.deletion_due_at <= now()
      and not (p.id = any (coalesce(p_skip, '{}')))
    order by p.deletion_due_at, p.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  loop
    begin
      v_result := private.nightly_delete_account(v_user);
      v_deleted := v_deleted + 1;
      v_transferred := v_transferred + (v_result ->> 'households_transferred')::integer;
      v_organisations := v_organisations + (v_result ->> 'organisations_deleted')::integer;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'retention: account % not deleted: % (%)', v_user, sqlerrm, sqlstate;
    end;
  end loop;

  return jsonb_build_object(
    'accounts_deleted', v_deleted,
    'households_transferred', v_transferred,
    'organisations_deleted', v_organisations,
    'failed', v_failed
  );
end;
$$;

revoke execute on function public.retention_delete_due_accounts(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.retention_delete_due_accounts(integer, uuid[]) to service_role;
