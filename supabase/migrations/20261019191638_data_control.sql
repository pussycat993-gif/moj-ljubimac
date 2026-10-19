-- Step 04 — data control: data_exports and r2_deletion_queue (TC §5.7).

create type public.data_export_status as enum ('preparing', 'ready', 'failed', 'expired');

-- data_exports — personal data archives (FR-41).
create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.data_export_status not null default 'preparing',
  r2_key text,
  size_bytes bigint,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger data_exports_set_updated_at
before update on public.data_exports
for each row execute function public.set_updated_at();

-- r2_deletion_queue — R2 keys waiting for the nightly job (TC §5.9).
create table public.r2_deletion_queue (
  r2_key text primary key,
  queued_at timestamptz not null default now()
);

-- RLS
alter table public.data_exports enable row level security;
alter table public.r2_deletion_queue enable row level security;

revoke all on table public.data_exports from anon, authenticated;
revoke all on table public.r2_deletion_queue from anon, authenticated;

-- data_exports: own rows only (EP-50); rows are written by the export job.
grant select on table public.data_exports to authenticated;

create policy data_exports_select_own on public.data_exports
  for select to authenticated
  using (user_id = (select auth.uid()));

-- r2_deletion_queue: no client access.
