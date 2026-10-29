-- Step 30 — nightly jobs (TC §5.9, §8; ADR-04): the database steps that POST /api/internal/billing-nightly
-- (EP-49 steps 2–4) and POST /api/internal/retention-nightly (EP-52 steps 1–5 and the TC §5.9 purge) run with
-- the service role, and their pg_cron schedules. No table, column, enum or constraint changes.
--
-- Billing (EP-49):
--   billing_expire_subscriptions()                 step 2: ended subscriptions → expired
--   billing_expiry_notice_candidates(p_now)        step 3: premium rows with 30 / 7 / 1 Belgrade days left
--   mark_expiry_notice_sent(id, days)              step 3: last_notice_days, only after Resend accepted
--   billing_refresh_household_flags()              step 4: households.read_only = not is_premium(owner)
-- Retention (EP-52):
--   retention_delete_due_accounts(p_limit)         step 1: BR-27 / BR-46 succession, then the account is deleted
--   r2_deletion_batch(p_limit) / r2_dequeue(keys)  step 2: the queue, dequeued only after R2 confirmed
--   r2_keys_in_use(keys)                           step 2: orphan scan (owner decision, Step 30)
--   retention_purge_deliveries()                   step 3: reminder_deliveries older than 12 months (NFR-08)
--   retention_expire_invitations()                 step 4: pending invitations / transfers past expires_at
--   retention_expire_exports()                     step 5: ready exports past expires_at → expired, key queued
--   retention_purge_server_support()               TC §5.9: idempotency_keys > 24 h, ended rate-limit windows
-- All functions are security definer, revoked from public / anon / authenticated and granted to service_role.
-- Nothing here deletes memorial_records or memorial pets on its own (NFR-07): they go only with the account.
--
-- Schedules (owner decision, Step 30): pg_cron runs in UTC, so billing fires at 01:00 and 02:00 UTC and retention
-- at 01:30 and 02:30 UTC; each route works only when the Europe/Belgrade hour is 3 (03:00 / 03:30 in CET and
-- CEST) and answers zero counts otherwise. Same pg_cron → pg_net → Vault mechanism as Step 19.

-- System bypass of the Free limits ------------------------------------------------------------------------------
-- BR-27 moves the shared pets to the heir, who may be on Free with an active pet of their own; FR-31 keeps those
-- pets. The account-deletion step sets app.nightly_job = on for its transaction, and the Step 06 trigger function
-- is recreated to skip the Free-limit checks (not the account-type check) while that flag is on, the same pattern
-- as Step 25's app.transfer_copy. Clients cannot set the flag (the Data API exposes no set_config).
create or replace function public.pets_enforce_free_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_changed boolean;
begin
  if new.owner_id is null then
    return new;
  end if;

  owner_changed := tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id;

  if owner_changed and exists (
    select 1 from public.profiles p
    where p.id = new.owner_id and p.account_type <> 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if not (owner_changed or new.lifecycle is distinct from old.lifecycle) then
    return new;
  end if;

  -- Step 30: BR-27 succession inside the nightly retention job keeps every shared pet (FR-31).
  if coalesce(current_setting('app.nightly_job', true), '') = 'on' then
    return new;
  end if;

  -- Serialise concurrent writes of the same owner's pets.
  perform 1 from public.profiles p where p.id = new.owner_id for update;

  if public.is_premium(new.owner_id) then
    return new;
  end if;

  -- BR-01, BR-03: memorial pets do not count toward the active-pet limit.
  if new.lifecycle = 'active' and exists (
    select 1 from public.pets p
    where p.owner_id = new.owner_id and p.lifecycle = 'active' and p.id <> new.id
  ) then
    raise exception using errcode = 'P0001', message = 'premium_required:pets';
  end if;

  if new.lifecycle = 'memorial' and (
    select count(*) from public.pets p
    where p.owner_id = new.owner_id and p.lifecycle = 'memorial' and p.id <> new.id
  ) >= 2 then
    raise exception using errcode = 'P0001', message = 'premium_required:memorials';
  end if;

  return new;
end;
$$;

-- =============================================================================================================
-- EP-49 — billing
-- =============================================================================================================

-- Step 2 — expiry. Rows whose period has ended and that will not renew: cancelled, payment_failed, trialing /
-- active with auto_renew off, or any running row of a user with a pending deletion (EP-51: no renewal then).
-- The Step 05 trigger recomputes the owner's households.read_only for every updated row; the ids of households
-- whose flag changed are returned so the route can report households_updated (step 4).
create function public.billing_expire_subscriptions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_read_only_before uuid[];
  v_expired integer;
  v_changed uuid[];
begin
  select coalesce(array_agg(h.id), '{}') into v_read_only_before from public.households h where h.read_only;

  with expired as (
    update public.subscriptions s
    set status = 'expired'
    where s.current_period_end <= now()
      and (
        s.status in ('cancelled', 'payment_failed')
        or (s.status in ('trialing', 'active') and not s.auto_renew)
        or (
          s.status <> 'expired'
          and exists (select 1 from public.profiles p where p.id = s.user_id and p.deletion_requested_at is not null)
        )
      )
    returning s.id
  )
  select count(*)::integer into v_expired from expired;

  select coalesce(array_agg(h.id order by h.id), '{}') into v_changed
  from public.households h
  where h.read_only is distinct from (h.id = any (v_read_only_before));

  return jsonb_build_object('expired', v_expired, 'household_ids', to_jsonb(v_changed));
end;
$$;

-- Step 3 — notices (BR-09, TC §5.1 last_notice_days; owner decision, Step 30). Premium rows (trialing, active,
-- cancelled) whose whole days left on the Europe/Belgrade calendar are 30, 7 or 1, and whose last notice was
-- for more days (or none). A 30-day notice that would fall on or before a monthly period's first day is
-- skipped (EP-49). Breeder-plan rows get no premium_expiry email (CR-24). p_now lets the tests pick the date.
create function public.billing_expiry_notice_candidates(p_now timestamptz default now())
returns table (
  subscription_id uuid,
  user_id uuid,
  email text,
  locale public.app_locale,
  plan public.subscription_plan,
  current_period_end timestamptz,
  auto_renew boolean,
  days_left integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (
    select (coalesce(p_now, now()) at time zone 'Europe/Belgrade')::date as d
  ),
  rows as (
    select s.*, ((s.current_period_end at time zone 'Europe/Belgrade')::date - t.d) as left_days, t.d as today
    from public.subscriptions s
    cross join today t
    where s.plan in ('premium_monthly', 'premium_yearly')
      and s.status in ('trialing', 'active', 'cancelled')
      and s.current_period_end > coalesce(p_now, now())
  )
  select r.id, r.user_id, p.email, p.locale, r.plan, r.current_period_end, r.auto_renew, r.left_days
  from rows r
  join public.profiles p on p.id = r.user_id
  where r.left_days in (30, 7, 1)
    and (r.last_notice_days is null or r.left_days < r.last_notice_days)
    and not (
      r.left_days = 30
      and r.plan = 'premium_monthly'
      and ((r.current_period_end - interval '1 month') at time zone 'Europe/Belgrade')::date >= r.today
    )
  order by r.current_period_end, r.id;
$$;

-- Step 3 — records the notice Resend accepted, so a re-run on the same Belgrade date sends nothing.
create function public.mark_expiry_notice_sent(p_subscription_id uuid, p_days integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  if p_days is null or p_days not in (30, 7, 1) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_days:invalid';
  end if;
  update public.subscriptions s
  set last_notice_days = p_days
  where s.id = p_subscription_id
    and (s.last_notice_days is null or p_days < s.last_notice_days);
  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

-- Step 4 — household flag (BR-28). Recomputes every household whose stored flag no longer matches the owner's
-- Premium: time-based changes with no subscriptions row change (Step 05 follow-up) are caught here.
create function public.billing_refresh_household_flags()
returns uuid[]
language sql
volatile
security definer
set search_path = ''
as $$
  with changed as (
    update public.households h
    set read_only = not public.is_premium(h.owner_id)
    where h.owner_id is not null
      and h.read_only is distinct from (not public.is_premium(h.owner_id))
    returning h.id
  )
  select coalesce(array_agg(c.id order by c.id), '{}') from changed c;
$$;

-- =============================================================================================================
-- EP-52 — retention
-- =============================================================================================================

-- BR-46: an organisation without members is deleted with its animals and files. Organisation pets cascade to
-- their records (their R2 keys are queued by the Step 06 / 07 triggers), litters and record transfers; the logo
-- key is queued here because the Step 24 trigger queues it on update only.
create function private.nightly_delete_organisation(p_organisation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.r2_deletion_queue (r2_key)
  select o.logo_r2_key from public.organisations o
  where o.id = p_organisation_id and o.logo_r2_key is not null
  on conflict (r2_key) do nothing;

  delete from public.pets p where p.organisation_id = p_organisation_id;
  delete from public.litters l where l.organisation_id = p_organisation_id;
  delete from public.record_transfers t where t.from_organisation_id = p_organisation_id;
  delete from public.organisations o where o.id = p_organisation_id;
end;
$$;

-- Step 1 for one account (FR-40, FR-31, BR-27, BR-31, BR-46, NFR-06).
--   BR-27: the owner's household passes to the earliest-joined member (household_memberships.joined_at) who owns
--          no household of their own (households.owner_id is unique); that membership row is deleted, the shared
--          pets (household_pets) move to the heir with their records and pet reminders, and read_only follows the
--          heir's Premium. A household without such a member is deleted. The heir email has no §9.1 template (CR-24).
--   BR-46: in each organisation, the last Admin's earliest-joined remaining member (organisation_memberships
--          .created_at) becomes Admin; an organisation with no other member is deleted with its animals (its grace
--          is the last member's own 30-day grace — owner decision, Step 30).
--   Files: the user's data_exports keys are queued here; pet, attachment, moment and listing photo keys are queued by
--          the delete triggers when the cascade removes their rows.
--   Last, auth.users is deleted; profiles and everything owned by the account cascade (reports keep set-null ids).
create function private.nightly_delete_account(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h public.households;
  m public.organisation_memberships;
  v_heir uuid;
  v_transferred integer := 0;
  v_organisations_deleted integer := 0;
begin
  perform set_config('app.nightly_job', 'on', true);

  -- BR-27
  select * into h from public.households where owner_id = p_user_id for update;
  if found then
    select hm.user_id into v_heir
    from public.household_memberships hm
    join public.profiles p on p.id = hm.user_id
    where hm.household_id = h.id
      and hm.user_id <> p_user_id
      and p.account_type = 'owner'
      and not exists (select 1 from public.households o where o.owner_id = hm.user_id)
    order by hm.joined_at, hm.created_at, hm.id
    limit 1;

    if v_heir is null then
      delete from public.household_pets hp where hp.household_id = h.id;
      delete from public.households x where x.id = h.id;
    else
      delete from public.household_memberships hm where hm.household_id = h.id and hm.user_id = v_heir;
      update public.reminders r
      set user_id = v_heir
      where r.user_id = p_user_id
        and r.pet_id in (
          select hp.pet_id from public.household_pets hp
          join public.pets pt on pt.id = hp.pet_id
          where hp.household_id = h.id and pt.owner_id = p_user_id
        );
      update public.pets pt
      set owner_id = v_heir
      where pt.owner_id = p_user_id
        and pt.id in (select hp.pet_id from public.household_pets hp where hp.household_id = h.id);
      update public.households x
      set owner_id = v_heir, read_only = not public.is_premium(v_heir)
      where x.id = h.id;
      v_transferred := 1;
    end if;
  end if;

  -- BR-46
  for m in
    select om.* from public.organisation_memberships om where om.user_id = p_user_id
  loop
    if not exists (
      select 1 from public.organisation_memberships o
      where o.organisation_id = m.organisation_id and o.user_id <> p_user_id
    ) then
      perform private.nightly_delete_organisation(m.organisation_id);
      v_organisations_deleted := v_organisations_deleted + 1;
    elsif m.role = 'admin' and not exists (
      select 1 from public.organisation_memberships o
      where o.organisation_id = m.organisation_id and o.user_id <> p_user_id and o.role = 'admin'
    ) then
      update public.organisation_memberships o
      set role = 'admin'
      where o.id = (
        select x.id from public.organisation_memberships x
        where x.organisation_id = m.organisation_id and x.user_id <> p_user_id
        order by x.created_at, x.id
        limit 1
      );
    end if;
  end loop;

  insert into public.r2_deletion_queue (r2_key)
  select e.r2_key from public.data_exports e where e.user_id = p_user_id and e.r2_key is not null
  on conflict (r2_key) do nothing;

  delete from auth.users u where u.id = p_user_id;

  perform set_config('app.nightly_job', 'off', true);
  return jsonb_build_object('households_transferred', v_transferred, 'organisations_deleted', v_organisations_deleted);
end;
$$;

-- Step 1 — every profile whose deletion_due_at has passed, oldest first, at most p_limit per call. Each account
-- runs in its own subtransaction: a failing account is logged (warning) and retried the next night, the others
-- are still deleted.
create function public.retention_delete_due_accounts(p_limit integer default 100)
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

-- Step 2 — the queue, oldest first. Keys are removed only by r2_dequeue after R2 confirmed the deletion.
create function public.r2_deletion_batch(p_limit integer default 500)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select q.r2_key from public.r2_deletion_queue q
  order by q.queued_at, q.r2_key
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

create function public.r2_dequeue(p_keys text[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.r2_deletion_queue q where q.r2_key = any (coalesce(p_keys, '{}')) returning 1
  )
  select count(*)::integer from removed;
$$;

-- Step 2 — orphan scan (API §10 item 7; owner decision, Step 30): the subset of p_keys that a row still uses,
-- or that is already queued (the queue deletes those).
create function public.r2_keys_in_use(p_keys text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(k.key order by k.key), '{}')
  from unnest(coalesce(p_keys, '{}')) as k(key)
  where exists (select 1 from public.pets x where x.photo_r2_key = k.key)
     or exists (select 1 from public.attachments x where x.r2_key = k.key)
     or exists (select 1 from public.moment_photos x where x.r2_key = k.key)
     or exists (select 1 from public.organisations x where x.logo_r2_key = k.key)
     or exists (select 1 from public.partners x where x.logo_r2_key = k.key)
     or exists (select 1 from public.listing_photos x where x.r2_key = k.key)
     or exists (select 1 from public.data_exports x where x.r2_key = k.key and x.status <> 'expired')
     or exists (select 1 from public.r2_deletion_queue x where x.r2_key = k.key);
$$;

-- Step 3 — NFR-08: delivery history is kept 12 months. Failed rows have no delivered_at; their created_at counts.
create function public.retention_purge_deliveries()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with purged as (
    delete from public.reminder_deliveries d
    where coalesce(d.delivered_at, d.created_at) < now() - interval '12 months'
    returning 1
  )
  select count(*)::integer from purged;
$$;

-- Step 4 — pending household / team invitations and record transfers past expires_at (BR-38, BR-47).
create function public.retention_expire_invitations()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household integer;
  v_organisation integer;
  v_transfers integer;
begin
  update public.household_invitations i set status = 'expired'
  where i.status = 'pending' and i.expires_at < now();
  get diagnostics v_household = row_count;

  update public.organisation_invitations i set status = 'expired'
  where i.status = 'pending' and i.expires_at < now();
  get diagnostics v_organisation = row_count;

  update public.record_transfers t set status = 'expired'
  where t.status = 'pending' and t.expires_at < now();
  get diagnostics v_transfers = row_count;

  return jsonb_build_object('invitations_expired', v_household + v_organisation, 'transfers_expired', v_transfers);
end;
$$;

-- Step 5 — ready archives past expires_at become expired and their keys are queued; the route deletes the queued
-- objects right away and dequeues what R2 confirmed (without R2 they stay queued for the next run).
create function public.retention_expire_exports()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_keys text[];
  v_count integer;
begin
  with expired as (
    update public.data_exports e set status = 'expired'
    where e.status = 'ready' and e.expires_at < now()
    returning e.r2_key
  )
  select count(*)::integer, coalesce(array_agg(x.r2_key order by x.r2_key) filter (where x.r2_key is not null), '{}')
  into v_count, v_keys
  from expired x;

  insert into public.r2_deletion_queue (r2_key)
  select k from unnest(v_keys) as k
  on conflict (r2_key) do nothing;

  return jsonb_build_object('exports_expired', v_count, 'r2_keys', to_jsonb(v_keys));
end;
$$;

-- TC §5.9 — idempotency keys older than 24 hours; rate-limit windows that have ended. The table stores no window
-- length; the longest window in API §11 is one day, so every row whose window started more than 24 hours ago has
-- ended (shorter windows are purged at the latest a day later).
create function public.retention_purge_server_support()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_keys integer;
  v_counters integer;
begin
  delete from public.idempotency_keys k where k.created_at < now() - interval '24 hours';
  get diagnostics v_keys = row_count;
  delete from public.rate_limit_counters c where c.window_start <= now() - interval '24 hours';
  get diagnostics v_counters = row_count;
  return jsonb_build_object('idempotency_keys', v_keys, 'rate_limit_counters', v_counters);
end;
$$;

-- Privileges ---------------------------------------------------------------------------------------------------
revoke execute on function private.nightly_delete_organisation(uuid) from public, anon, authenticated;
revoke execute on function private.nightly_delete_account(uuid) from public, anon, authenticated;
revoke execute on function public.billing_expire_subscriptions() from public, anon, authenticated;
revoke execute on function public.billing_expiry_notice_candidates(timestamptz) from public, anon, authenticated;
revoke execute on function public.mark_expiry_notice_sent(uuid, integer) from public, anon, authenticated;
revoke execute on function public.billing_refresh_household_flags() from public, anon, authenticated;
revoke execute on function public.retention_delete_due_accounts(integer) from public, anon, authenticated;
revoke execute on function public.r2_deletion_batch(integer) from public, anon, authenticated;
revoke execute on function public.r2_dequeue(text[]) from public, anon, authenticated;
revoke execute on function public.r2_keys_in_use(text[]) from public, anon, authenticated;
revoke execute on function public.retention_purge_deliveries() from public, anon, authenticated;
revoke execute on function public.retention_expire_invitations() from public, anon, authenticated;
revoke execute on function public.retention_expire_exports() from public, anon, authenticated;
revoke execute on function public.retention_purge_server_support() from public, anon, authenticated;
grant execute on function public.billing_expire_subscriptions() to service_role;
grant execute on function public.billing_expiry_notice_candidates(timestamptz) to service_role;
grant execute on function public.mark_expiry_notice_sent(uuid, integer) to service_role;
grant execute on function public.billing_refresh_household_flags() to service_role;
grant execute on function public.retention_delete_due_accounts(integer) to service_role;
grant execute on function public.r2_deletion_batch(integer) to service_role;
grant execute on function public.r2_dequeue(text[]) to service_role;
grant execute on function public.r2_keys_in_use(text[]) to service_role;
grant execute on function public.retention_purge_deliveries() to service_role;
grant execute on function public.retention_expire_invitations() to service_role;
grant execute on function public.retention_expire_exports() to service_role;
grant execute on function public.retention_purge_server_support() to service_role;

-- Schedules (EP-49 03:00, EP-52 03:30 Europe/Belgrade; the routes ignore the call whose Belgrade hour is not 3).
select cron.schedule(
  'billing-nightly',
  '0 1,2 * * *',
  $$select private.call_internal_route('/api/internal/billing-nightly')$$
);
select cron.schedule(
  'retention-nightly',
  '30 1,2 * * *',
  $$select private.call_internal_route('/api/internal/retention-nightly')$$
);
