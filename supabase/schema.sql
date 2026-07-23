-- Moj Ljubimac — Supabase shema za deljenje profila (household + sync)
-- Pokreni ovo u Supabase SQL editoru (jednom, na novom projektu).
--
-- Model: korisnici pripadaju "household"-u (porodici). Svi podaci ljubimca
-- nose household_id, a RLS dozvoljava pristup samo članovima tog household-a.
-- ID-jevi ljubimaca/zapisa su TEXT (aplikacija koristi kratke lokalne ID-jeve,
-- ne UUID); household_id je UUID koji generiše baza.

-- ---------- Household ----------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Moja porodica',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Helper: da li je tekući korisnik član datog household-a.
-- SECURITY DEFINER da bi zaobišao RLS na household_members (izbegava rekurziju u politikama).
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

-- ---------- Podaci ljubimca ----------

create table if not exists public.pets (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  species text not null,
  breed text not null default '',
  sex text not null,
  dob text not null,
  microchip text,
  neutered boolean,
  photo_uri text,
  created_at text not null
);

create table if not exists public.weights (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  date_iso text not null,
  kg double precision not null
);

create table if not exists public.vaccinations (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  name text not null,
  date_iso text not null,
  valid_until_iso text,
  clinic text,
  notes text
);

create table if not exists public.medications (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  name text not null,
  dose text,
  interval_days integer,
  last_given_iso text,
  active boolean not null default true,
  notes text
);

create table if not exists public.checkups (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  title text not null,
  date_iso text not null,
  vet text,
  notes text,
  attachments jsonb not null default '[]'::jsonb
);

create table if not exists public.food_profiles (
  pet_id text primary key references public.pets (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  brand text,
  daily_grams integer,
  notes text,
  photo_uri text
);

create table if not exists public.stools (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  date_iso text not null,
  quality text not null
);

create table if not exists public.milestones (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  date_iso text not null,
  title text not null,
  description text,
  photo_uri text
);

create table if not exists public.reminders (
  id text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  pet_id text not null references public.pets (id) on delete cascade,
  title text not null,
  date_iso text not null,
  done boolean not null default false
);

-- ---------- RLS ----------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.pets              enable row level security;
alter table public.weights           enable row level security;
alter table public.vaccinations      enable row level security;
alter table public.medications       enable row level security;
alter table public.checkups          enable row level security;
alter table public.food_profiles     enable row level security;
alter table public.stools            enable row level security;
alter table public.milestones        enable row level security;
alter table public.reminders         enable row level security;

-- households: član vidi svoj household; svako prijavljen može da napravi novi (kao vlasnik).
create policy "households_select" on public.households
  for select using (public.is_household_member(id));
create policy "households_insert" on public.households
  for insert with check (created_by = auth.uid());

-- household_members: korisnik vidi članstva svog household-a; može da doda/ukloni SEBE.
create policy "members_select" on public.household_members
  for select using (public.is_household_member(household_id));
create policy "members_insert_self" on public.household_members
  for insert with check (user_id = auth.uid());
create policy "members_delete_self" on public.household_members
  for delete using (user_id = auth.uid());

-- Podaci: pun pristup samo članovima household-a. Jedna "for all" politika po tabeli.
create policy "pets_all"          on public.pets          for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "weights_all"       on public.weights       for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "vaccinations_all"  on public.vaccinations  for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "medications_all"   on public.medications   for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "checkups_all"      on public.checkups      for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "food_profiles_all" on public.food_profiles for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "stools_all"        on public.stools        for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "milestones_all"    on public.milestones    for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "reminders_all"     on public.reminders     for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

-- ---------- Realtime ----------
-- Uključi realtime za tabele koje aplikacija sluša.
alter publication supabase_realtime add table
  public.pets, public.weights, public.vaccinations, public.medications,
  public.checkups, public.food_profiles, public.stools, public.milestones,
  public.reminders;
