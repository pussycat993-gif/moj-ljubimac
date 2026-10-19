-- Step 05 — households: households, household_memberships, household_invitations
-- (TC §5.1), the BR-19/BR-20/BR-28/BR-51 triggers and RLS (API §4.4, EP-34 … EP-40).
-- household_pets needs pets and is created in Step 06.

-- Shared by household and organisation invitations (TC §5.1, §5.2).
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired');

-- households (Household)
create table public.households (
  id uuid primary key default gen_random_uuid(),
  -- BR-20: an owner owns at most one household. Set null on owner deletion;
  -- ownership transfer (BR-27) is Step 30.
  owner_id uuid unique references public.profiles (id) on delete set null,
  name text not null,
  -- Derived: not is_premium(owner_id), maintained by the triggers below (BR-19, BR-28).
  read_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

-- household_memberships (Household Membership). The owner has no row (EP-38).
create table public.household_memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  reminders_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create trigger household_memberships_set_updated_at
before update on public.household_memberships
for each row execute function public.set_updated_at();

-- household_invitations — email or link invitations (FR-26), valid 7 days (BR-47).
create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles (id) on delete set null,
  status public.invitation_status not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger household_invitations_set_updated_at
before update on public.household_invitations
for each row execute function public.set_updated_at();

-- RLS helpers ------------------------------------------------------------------------
-- Security definer so policies on households and household_memberships can refer to
-- each other without recursion. Kept out of the exposed `public` schema (no RPCs).
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create function private.is_household_owner(household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.households h
    where h.id = is_household_owner.household_id
      and h.owner_id = (select auth.uid())
  );
$$;

create function private.is_household_member(household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_memberships m
    where m.household_id = is_household_member.household_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_household_owner(uuid) from public, anon;
revoke execute on function private.is_household_member(uuid) from public, anon;
grant execute on function private.is_household_owner(uuid) to authenticated, service_role;
grant execute on function private.is_household_member(uuid) to authenticated, service_role;

-- BR-19, BR-28: read_only = not is_premium(owner) when the household is created ----------
create function public.households_set_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.read_only := not public.is_premium(new.owner_id);
  return new;
end;
$$;

create trigger households_set_read_only
before insert on public.households
for each row execute function public.households_set_read_only();

-- …and whenever a subscriptions row of the owner is inserted or updated. Time-based
-- expiry without a row change is the Step 30 nightly job.
create function public.subscriptions_refresh_household_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.households h
  set read_only = not public.is_premium(h.owner_id)
  where h.owner_id = new.user_id
     or (tg_op = 'UPDATE' and h.owner_id = old.user_id);
  return null;
end;
$$;

create trigger subscriptions_refresh_household_read_only
after insert or update on public.subscriptions
for each row execute function public.subscriptions_refresh_household_read_only();

-- BR-20, BR-51: owner + memberships ≤ 6 ---------------------------------------------------
create function public.household_memberships_check_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  -- Serialise concurrent joins of the same household.
  perform 1 from public.households h where h.id = new.household_id for update;

  select count(*) into member_count
  from public.household_memberships m
  where m.household_id = new.household_id;

  -- 1 (owner) + existing memberships + this one may not exceed 6.
  if 1 + member_count + 1 > 6 then
    raise exception using errcode = 'P0001', message = 'household_full';
  end if;
  return new;
end;
$$;

create trigger household_memberships_check_size
before insert on public.household_memberships
for each row execute function public.household_memberships_check_size();

-- Client deletes of memberships (EP-36): the owner removes members (BR-25), a member
-- leaves. Anyone else in the household → forbidden_role. remove_member while the
-- household is read-only → household_read_only; leave stays allowed.
-- Only checked for client sessions (role authenticated); System paths are unaffected.
create function public.household_memberships_check_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.user_id is distinct from (select auth.uid()) then
    if not private.is_household_owner(old.household_id) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
    if exists (
      select 1 from public.households h
      where h.id = old.household_id and h.read_only
    ) then
      raise exception using errcode = 'P0001', message = 'household_read_only';
    end if;
  end if;
  return old;
end;
$$;

create trigger household_memberships_check_delete
before delete on public.household_memberships
for each row execute function public.household_memberships_check_delete();

-- Invitations are written by the household owner only (BR-25, EP-35); a member who
-- tries gets forbidden_role. Unrelated users fall through to RLS.
create function public.household_invitations_check_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and private.is_household_member(new.household_id)
     and not private.is_household_owner(new.household_id) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  return new;
end;
$$;

create trigger household_invitations_check_role
before insert on public.household_invitations
for each row execute function public.household_invitations_check_role();

revoke execute on function public.households_set_read_only() from public, anon, authenticated;
revoke execute on function public.subscriptions_refresh_household_read_only() from public, anon, authenticated;
revoke execute on function public.household_memberships_check_size() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.household_invitations enable row level security;

revoke all on table public.households from anon, authenticated;
revoke all on table public.household_memberships from anon, authenticated;
revoke all on table public.household_invitations from anon, authenticated;

-- households: owner selects and updates own; members select; no client insert/delete
-- (EP-35 creates the household server-side, Step 22). read_only and owner_id are not
-- client-writable.
grant select on table public.households to authenticated;
grant update (name) on table public.households to authenticated;

create policy households_select_owner_or_member on public.households
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_household_member(id));

create policy households_update_owner on public.households
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- household_memberships: owner and members of the household select; a member updates
-- only reminders_enabled on their own row (EP-38); delete per the trigger above (EP-36).
-- Inserts come from accepting an invitation (EP-40, Step 22).
grant select on table public.household_memberships to authenticated;
grant update (reminders_enabled) on table public.household_memberships to authenticated;
grant delete on table public.household_memberships to authenticated;

create policy household_memberships_select on public.household_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_household_owner(household_id)
    or private.is_household_member(household_id)
  );

create policy household_memberships_update_own on public.household_memberships
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy household_memberships_delete on public.household_memberships
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_household_owner(household_id)
    or private.is_household_member(household_id)
  );

-- household_invitations: owner of the household only (BR-25). Invitees reach them only
-- through EP-39 / EP-40 server actions (Step 22).
grant select on table public.household_invitations to authenticated;
grant insert (household_id, email, token_hash, expires_at)
  on table public.household_invitations to authenticated;
grant update (status, expires_at) on table public.household_invitations to authenticated;

create policy household_invitations_select_owner on public.household_invitations
  for select to authenticated
  using (private.is_household_owner(household_id));

create policy household_invitations_insert_owner on public.household_invitations
  for insert to authenticated
  with check (private.is_household_owner(household_id));

create policy household_invitations_update_owner on public.household_invitations
  for update to authenticated
  using (private.is_household_owner(household_id))
  with check (private.is_household_owner(household_id));
