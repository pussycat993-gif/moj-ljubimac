-- Step 04 — server support: idempotency_keys and rate_limit_counters
-- (TC §5.7, API §3.3, §11). Purged by the nightly job (TC §5.9).

-- idempotency_keys — replay-safe writes.
create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key uuid not null,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create trigger idempotency_keys_set_updated_at
before update on public.idempotency_keys
for each row execute function public.set_updated_at();

-- rate_limit_counters — per-user rate limits.
create table public.rate_limit_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  operation text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operation, window_start)
);

-- A counter's count can only grow.
create function public.rate_limit_counters_no_decrease()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.count < old.count then
    raise exception using
      errcode = 'P0001',
      message = 'internal_error',
      detail = 'rate_limit_counters.count cannot decrease';
  end if;
  return new;
end;
$$;

create trigger rate_limit_counters_no_decrease
before update on public.rate_limit_counters
for each row execute function public.rate_limit_counters_no_decrease();

create trigger rate_limit_counters_set_updated_at
before update on public.rate_limit_counters
for each row execute function public.set_updated_at();

-- RLS: server actions run as the user (API §3.1) — own rows only, no client delete.
alter table public.idempotency_keys enable row level security;
alter table public.rate_limit_counters enable row level security;

revoke all on table public.idempotency_keys from anon, authenticated;
revoke all on table public.rate_limit_counters from anon, authenticated;

grant select on table public.idempotency_keys to authenticated;
grant insert (user_id, key, operation, result) on table public.idempotency_keys to authenticated;

grant select on table public.rate_limit_counters to authenticated;
grant insert (user_id, operation, window_start, count) on table public.rate_limit_counters to authenticated;
grant update (count) on table public.rate_limit_counters to authenticated;

create policy idempotency_keys_select_own on public.idempotency_keys
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy idempotency_keys_insert_own on public.idempotency_keys
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy rate_limit_counters_select_own on public.rate_limit_counters
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy rate_limit_counters_insert_own on public.rate_limit_counters
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy rate_limit_counters_update_own on public.rate_limit_counters
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
