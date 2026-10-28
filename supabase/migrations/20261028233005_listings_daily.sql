-- Step 28b — EP-87 listing expiry job (FR-65, BR-56; TC §8): the two database steps that
-- POST /api/internal/listings-daily runs with the service role, and the daily pg_cron schedule.
--   1. listings_expiry_notice_candidates(limit)  active listings with ≤ 3 days left and no notice yet
--      mark_listing_notices_sent(ids)            expiry_notice_sent_at = now(), only after Resend accepted
--   2. expire_listings(limit)                    active listings past expires_at → expired
-- Batches of ≤ 200 rows, FOR UPDATE SKIP LOCKED. Authors suspended from Šapa pomoći or with a pending
-- account deletion get no emails (notify = false); their listings still expire.
-- Schedule (owner decision, Step 28b): pg_cron runs in UTC, so the job fires at 07:00 and 08:00 UTC and
-- the route works only when it is 09:00 in Europe/Belgrade (CET or CEST); the other call returns zeros.

create function public.listings_expiry_notice_candidates(p_limit integer default 200)
returns table (
  listing_id uuid,
  title text,
  expires_at timestamptz,
  author_id uuid,
  email text,
  locale public.app_locale
)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select l.id
    from public.listings l
    join public.profiles p on p.id = l.author_id
    where l.status = 'active'
      and l.expiry_notice_sent_at is null
      and l.expires_at > now()
      and l.expires_at <= now() + interval '3 days'
      and p.marketplace_suspended_at is null
      and p.deletion_requested_at is null
    order by l.expires_at, l.id
    limit least(greatest(coalesce(p_limit, 200), 1), 200)
    for update of l skip locked
  )
  select l.id, l.title, l.expires_at, l.author_id, p.email, p.locale
  from due
  join public.listings l on l.id = due.id
  join public.profiles p on p.id = l.author_id
  order by l.expires_at, l.id;
$$;

create function public.mark_listing_notices_sent(p_listing_ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with marked as (
    update public.listings l
    set expiry_notice_sent_at = now()
    where l.id = any (p_listing_ids)
      and l.status = 'active'
      and l.expiry_notice_sent_at is null
    returning l.id
  )
  select count(*)::integer from marked;
$$;

create function public.expire_listings(p_limit integer default 200)
returns table (
  listing_id uuid,
  title text,
  expires_at timestamptz,
  author_id uuid,
  email text,
  locale public.app_locale,
  notify boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select l.id
    from public.listings l
    where l.status = 'active' and l.expires_at <= now()
    order by l.expires_at, l.id
    limit least(greatest(coalesce(p_limit, 200), 1), 200)
    for update of l skip locked
  ),
  expired as (
    update public.listings l
    set status = 'expired'
    from due
    where l.id = due.id
    returning l.id, l.title, l.expires_at, l.author_id
  )
  select e.id, e.title, e.expires_at, e.author_id, p.email, p.locale,
         p.marketplace_suspended_at is null and p.deletion_requested_at is null
  from expired e
  join public.profiles p on p.id = e.author_id
  order by e.expires_at, e.id;
$$;

revoke execute on function public.listings_expiry_notice_candidates(integer) from public, anon, authenticated;
revoke execute on function public.mark_listing_notices_sent(uuid[]) from public, anon, authenticated;
revoke execute on function public.expire_listings(integer) from public, anon, authenticated;
grant execute on function public.listings_expiry_notice_candidates(integer) to service_role;
grant execute on function public.mark_listing_notices_sent(uuid[]) to service_role;
grant execute on function public.expire_listings(integer) to service_role;

-- Daily at 09:00 Europe/Belgrade (07:00 UTC in summer, 08:00 UTC in winter; the route ignores the
-- other call). Same pg_cron → pg_net mechanism and Vault secrets as the reminder dispatch (Step 19).
select cron.schedule(
  'listings-daily',
  '0 7,8 * * *',
  $$select private.call_internal_route('/api/internal/listings-daily')$$
);
