-- Step 04 — accounts: shared updated_at trigger, profiles, email sync (TC §5, §5.1).

-- Shared trigger function: every table with updated_at uses it (TC §5 conventions).
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create type public.account_type as enum ('owner', 'shelter', 'breeder');
create type public.app_locale as enum ('sr-Latn', 'en');

-- profiles (User) — one row per auth.users row (TC §5.1).
-- city_id gets its foreign key to cities in the reference_data migration.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_type public.account_type not null,
  full_name text,
  locale public.app_locale not null default 'sr-Latn',
  city_id uuid,
  email text not null,
  is_operator boolean not null default false,
  trial_used boolean not null default false,
  deletion_requested_at timestamptz,
  deletion_due_at timestamptz,
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_deletion_due_at_idx on public.profiles (deletion_due_at);

-- Keeps profiles.email equal to auth.users.email on insert, derives
-- deletion_due_at = deletion_requested_at + 30 days (BR-31), and refuses
-- profile edits while deletion is pending (EP-43 → account_pending_deletion).
create function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
begin
  if tg_op = 'INSERT' then
    select u.email into auth_email from auth.users u where u.id = new.id;
    new.email := coalesce(auth_email, new.email);
  end if;

  if tg_op = 'UPDATE'
     and old.deletion_requested_at is not null
     and new.deletion_requested_at is not null
     and (new.full_name is distinct from old.full_name
          or new.city_id is distinct from old.city_id
          or new.locale is distinct from old.locale) then
    raise exception using errcode = 'P0001', message = 'account_pending_deletion';
  end if;

  new.deletion_due_at := case
    when new.deletion_requested_at is null then null
    else new.deletion_requested_at + interval '30 days'
  end;
  return new;
end;
$$;

create trigger profiles_before_write
before insert or update on public.profiles
for each row execute function public.profiles_before_write();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Copies auth.users.email into profiles.email whenever the auth email changes (TC §5.1).
create function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (new.email is distinct from old.email and new.email is not null)
execute function public.sync_profile_email();

revoke execute on function public.profiles_before_write() from public, anon, authenticated;
revoke execute on function public.sync_profile_email() from public, anon, authenticated;

-- RLS: a user sees and edits only their own row (EP-41, EP-43).
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- EP-41 complete_registration writes exactly these columns.
grant insert (id, account_type, locale, email, terms_accepted_at, terms_version)
  on table public.profiles to authenticated;
-- EP-43 update: the column grant limits writable columns to these three.
grant update (full_name, city_id, locale) on table public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
