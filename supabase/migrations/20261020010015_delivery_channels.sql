-- Step 08 — delivery channels: push_subscriptions (ADR-05) and user_channels (TC §5.5),
-- RLS (API §4.4, EP-29, EP-30). Registering a push endpoint is EP-29's RPC and
-- connecting WhatsApp is EP-30's server action (both later steps).

create type public.user_channel_type as enum ('whatsapp', 'viber');

-- push_subscriptions — browser endpoints for Web Push.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

-- user_channels — verified WhatsApp/Viber identity per user.
create table public.user_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel public.user_channel_type not null,
  -- Phone (E.164) or Viber id.
  address text not null,
  opted_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel)
);

create trigger user_channels_set_updated_at
before update on public.user_channels
for each row execute function public.set_updated_at();

-- RLS ----------------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.user_channels enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.user_channels from anon, authenticated;

-- push_subscriptions: self only. EP-29 check (select by endpoint) and unregister
-- (delete); p256dh and auth are write-only and never returned.
grant select (id, user_id, endpoint, user_agent, created_at, updated_at)
  on table public.push_subscriptions to authenticated;
grant delete on table public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- user_channels: self read; written only by the EP-30 server action (service role).
grant select on table public.user_channels to authenticated;

create policy user_channels_select_own on public.user_channels
  for select to authenticated
  using (user_id = (select auth.uid()));
