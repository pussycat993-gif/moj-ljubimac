-- Step 04 — billing: plans, subscriptions, subscription_payments,
-- payment_webhook_events (TC §5.1, §5.7). No plan rows: prices are OQ-03.

create type public.subscription_plan as enum (
  'premium_monthly', 'premium_yearly', 'breeder_monthly', 'breeder_yearly'
);
create type public.subscription_status as enum (
  'trialing', 'active', 'cancelled', 'expired', 'payment_failed'
);
create type public.payment_kind as enum ('initial', 'renewal');
create type public.payment_result as enum ('succeeded', 'failed');

-- plans — prices as data (OQ-03 open).
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code public.subscription_plan not null unique,
  price_minor integer not null check (price_minor > 0),
  currency char(3) not null default 'RSD',
  active boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

-- subscriptions (Subscription)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  trial_ends_at timestamptz,
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  monri_token_ref text,
  monri_cit_id text,
  card_brand text,
  card_last4 char(4),
  last_notice_days smallint check (last_notice_days in (30, 7, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

-- One running (trialing / active / cancelled) row per user and plan family.
create unique index subscriptions_one_running_per_family
  on public.subscriptions (
    user_id,
    (case when plan in ('premium_monthly', 'premium_yearly') then 'premium' else 'breeder' end)
  )
  where status in ('trialing', 'active', 'cancelled');

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- subscription_payments — every charge attempt.
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null default 'RSD',
  kind public.payment_kind not null,
  result public.payment_result not null,
  monri_transaction_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscription_payments_subscription_id_idx
  on public.subscription_payments (subscription_id);

create trigger subscription_payments_set_updated_at
before update on public.subscription_payments
for each row execute function public.set_updated_at();

-- payment_webhook_events — webhook idempotency (provider deferred, OQ-11).
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, event_id)
);

create trigger payment_webhook_events_set_updated_at
before update on public.payment_webhook_events
for each row execute function public.set_updated_at();

-- RLS
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.payment_webhook_events enable row level security;

revoke all on table public.plans from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.subscription_payments from anon, authenticated;
revoke all on table public.payment_webhook_events from anon, authenticated;

-- plans: public read (EP-44); no client writes.
grant select on table public.plans to anon, authenticated;

create policy plans_select_all on public.plans
  for select to anon, authenticated
  using (true);

-- subscriptions: own rows only (EP-47); writes come from the webhook (System).
grant select on table public.subscriptions to authenticated;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- subscription_payments, payment_webhook_events: no client access.
