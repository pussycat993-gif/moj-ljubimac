-- Step 23 — subscription status, Premium page and account data control.
-- EP-44 view v_public_plans; EP-47 rpc:get_my_subscription; EP-48 set_auto_renew; EP-50
-- request_data_export and get_my_data_overview_base; EP-51 request_account_deletion and
-- cancel_account_deletion (owner decisions, Step 23). No table, column, enum or constraint
-- changes and no plan rows (OQ-03). Errors are raised per TC §5.7.1 with API §7.2 codes.

-- EP-44 — v_public_plans ---------------------------------------------------------------------
-- Every plan code, in enum order (family, then monthly before yearly), left-joined to its active
-- plans row. Before payments (no priced rows, OQ-03 / CR-22) price and monthly_equivalent are null.
create view public.v_public_plans
with (security_invoker = true)
as
select
  c.code,
  case when c.code::text like 'premium_%' then 'premium' else 'breeder' end as family,
  case when c.code::text like '%_monthly' then 'month' else 'year' end as period,
  case
    when p.id is null then null
    else jsonb_build_object('amount_minor', p.price_minor, 'currency', p.currency)
  end as price,
  case
    when p.id is null or c.code::text like '%_monthly' then null
    else jsonb_build_object('amount_minor', round(p.price_minor / 12.0)::integer, 'currency', p.currency)
  end as monthly_equivalent,
  case when c.code::text like 'premium_%' then 7 else 0 end as trial_days
from unnest(enum_range(null::public.subscription_plan)) with ordinality as c(code, ord)
left join public.plans p on p.code = c.code and p.active
order by c.ord;

revoke all on table public.v_public_plans from public, anon, authenticated;
grant select on table public.v_public_plans to anon, authenticated, service_role;

-- Shared role check (EP-45, EP-47, EP-48) ----------------------------------------------------------
-- The caller's plan family: owner → premium, admin of a breeder organisation → breeder.
-- Shelter accounts and breeder accounts that are not a breeder admin → forbidden_role.
create function private.subscription_family_of(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.account_type;
begin
  select p.account_type into v_type from public.profiles p where p.id = p_user;
  if v_type is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if v_type = 'owner' then
    return 'premium';
  end if;
  if v_type = 'breeder' and exists (
    select 1
    from public.organisation_memberships m
    join public.organisations o on o.id = m.organisation_id
    where m.user_id = p_user and m.role = 'admin' and o.type = 'breeder'
  ) then
    return 'breeder';
  end if;
  raise exception using errcode = 'P0001', message = 'forbidden_role';
end;
$$;

revoke execute on function private.subscription_family_of(uuid) from public, anon;
grant execute on function private.subscription_family_of(uuid) to authenticated, service_role;

-- EP-47 — rpc:get_my_subscription ---------------------------------------------------------------
-- Security invoker: reads only the caller's rows through RLS. The most recent row of the caller's
-- plan family; a user who never subscribed gets the never-subscribed shape with trial_available.
create function public.get_my_subscription()
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
    'over_limits', v_over
  );
end;
$$;

revoke execute on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated, service_role;

-- EP-48 — set_auto_renew ------------------------------------------------------------------------
-- false → auto_renew = false, status = cancelled (Premium stays until current_period_end, BR-08);
-- true → auto_renew = true, status = trialing while trial_ends_at > now(), else active.
-- No running row (trialing / active / cancelled with current_period_end > now()) → subscription_not_active.
create function public.set_auto_renew(p_auto_renew boolean)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_family text;
  s public.subscriptions;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_auto_renew is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'auto_renew:required';
  end if;
  v_family := private.subscription_family_of(uid);

  select * into s
  from public.subscriptions x
  where x.user_id = uid
    and case when x.plan in ('premium_monthly', 'premium_yearly') then 'premium' else 'breeder' end = v_family
    and x.status in ('trialing', 'active', 'cancelled')
    and x.current_period_end > now()
  order by x.created_at desc
  limit 1
  for update;

  if s.id is null then
    raise exception using errcode = 'P0001', message = 'subscription_not_active';
  end if;

  update public.subscriptions x
  set auto_renew = p_auto_renew,
      status = case
        when not p_auto_renew then 'cancelled'::public.subscription_status
        when x.trial_ends_at is not null and x.trial_ends_at > now() then 'trialing'::public.subscription_status
        else 'active'::public.subscription_status
      end
  where x.id = s.id
  returning * into s;

  return s;
end;
$$;

revoke execute on function public.set_auto_renew(boolean) from public, anon;
grant execute on function public.set_auto_renew(boolean) to authenticated;

-- EP-50 — request_data_export -------------------------------------------------------------------
-- Inserts data_exports{status = preparing}; the archive is built by /api/internal/exports (Step 30a).
-- A row still preparing → export_in_progress.
create function public.request_data_export()
returns public.data_exports
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  e public.data_exports;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  -- Serialise concurrent requests of the same user.
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if exists (select 1 from public.data_exports d where d.user_id = uid and d.status = 'preparing') then
    raise exception using errcode = 'P0001', message = 'export_in_progress';
  end if;

  insert into public.data_exports (user_id, status, requested_at)
  values (uid, 'preparing', now())
  returning * into e;
  return e;
end;
$$;

revoke execute on function public.request_data_export() from public, anon;
grant execute on function public.request_data_export() to authenticated;

-- EP-50 — get_my_data_overview_base -------------------------------------------------------------
-- The summary and deletion block of getMyDataOverview, including the BR-27 heir's name (another
-- user's profile, hence security definer). latest_export and its download URL are added by the action.
create function public.get_my_data_overview_base()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select * into me from public.profiles p where p.id = uid;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'pet_names', coalesce((
        select jsonb_agg(pt.name order by pt.name, pt.id) from public.pets pt where pt.owner_id = uid
      ), '[]'::jsonb),
      'attachment_count', (
        select count(*)::integer
        from public.attachments a
        join public.pets pt on pt.id = a.pet_id
        where pt.owner_id = uid
      ),
      'moment_count', (
        select count(*)::integer
        from public.moments mo
        join public.pets pt on pt.id = mo.pet_id
        where pt.owner_id = uid
      )
    ),
    'deletion', jsonb_build_object(
      'requested_at', me.deletion_requested_at,
      'due_at', me.deletion_due_at,
      'days_left', case
        when me.deletion_due_at is null then null
        else greatest(0, (me.deletion_due_at at time zone 'Europe/Belgrade')::date
          - (now() at time zone 'Europe/Belgrade')::date)
      end,
      'heir_full_name', (
        select hp.full_name
        from public.households h
        join public.household_memberships hm on hm.household_id = h.id
        join public.profiles hp on hp.id = hm.user_id
        where h.owner_id = uid
        order by hm.joined_at, hm.id
        limit 1
      )
    )
  );
end;
$$;

revoke execute on function public.get_my_data_overview_base() from public, anon;
grant execute on function public.get_my_data_overview_base() to authenticated;

-- EP-51 — request_account_deletion / cancel_account_deletion ------------------------------------
-- Request: deletion_requested_at = now(); the profiles trigger derives deletion_due_at = +30 days
-- (BR-31). Already pending → account_pending_deletion. Subscriptions are not changed (E-16).
create function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_requested timestamptz;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select p.deletion_requested_at into v_requested from public.profiles p where p.id = uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if v_requested is not null then
    raise exception using errcode = 'P0001', message = 'account_pending_deletion';
  end if;
  update public.profiles set deletion_requested_at = now() where id = uid;
end;
$$;

-- Cancel: both columns back to null; nothing pending → no-op (EP-51).
create function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  update public.profiles
  set deletion_requested_at = null
  where id = uid and deletion_requested_at is not null;
end;
$$;

revoke execute on function public.request_account_deletion() from public, anon;
revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
