-- Step 04 — reference data: cities (TC §5.7, ADR-11) and app_settings (TC §5.5).

-- cities — preloaded Serbian cities, seeded from supabase/seed/cities.sql.
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name_sr text not null,
  name_en text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger cities_set_updated_at
before update on public.cities
for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_city_id_fkey foreign key (city_id) references public.cities (id);

-- RLS: readable by everyone, Visitor included (EP-67); no client writes.
alter table public.cities enable row level security;

revoke all on table public.cities from anon, authenticated;
grant select on table public.cities to anon, authenticated;

create policy cities_select_all on public.cities
  for select to anon, authenticated
  using (true);

-- app_settings — Operator switches: exactly one row (BR-14b).
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  viber_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guard: a second row cannot exist.
create unique index app_settings_single_row on public.app_settings ((true));

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

insert into public.app_settings (viber_enabled) values (false);

-- RLS: Operator select and update (EP-71); no other client access.
alter table public.app_settings enable row level security;

revoke all on table public.app_settings from anon, authenticated;
grant select on table public.app_settings to authenticated;
grant update (viber_enabled) on table public.app_settings to authenticated;

create policy app_settings_select_operator on public.app_settings
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_operator
  ));

create policy app_settings_update_operator on public.app_settings
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_operator
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_operator
  ));
