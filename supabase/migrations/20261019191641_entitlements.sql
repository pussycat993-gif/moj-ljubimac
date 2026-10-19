-- Step 04 — entitlements: is_premium(user) (API §5.6 intro, "Premium active").
-- True exactly when the user has a premium_* subscription with status in
-- (trialing, active, cancelled) and current_period_end > now().
-- Security definer so RLS policies and triggers of later steps can test any
-- user (e.g. a household owner) without reading their subscriptions rows.

create function public.is_premium(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = is_premium.user_id
      and s.plan in ('premium_monthly', 'premium_yearly')
      and s.status in ('trialing', 'active', 'cancelled')
      and s.current_period_end > now()
  );
$$;

revoke execute on function public.is_premium(uuid) from public, anon;
grant execute on function public.is_premium(uuid) to authenticated, service_role;
