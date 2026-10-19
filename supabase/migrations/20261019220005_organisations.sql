-- Step 05 — organisations: organisations, organisation_memberships,
-- organisation_invitations (TC §5.2), the BR-32/BR-34 triggers and RLS
-- (API §4.4, EP-53, EP-56, EP-68, EP-72).

create type public.organisation_type as enum ('shelter', 'breeder');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.organisation_role as enum ('admin', 'volunteer');

-- organisations (Organisation)
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  type public.organisation_type not null,
  name text not null,
  slug text not null unique,
  city_id uuid references public.cities (id),
  -- Set on insert by the trigger below (BR-32); changed only by the Operator (EP-68).
  approval_status public.approval_status not null default 'pending',
  rejection_reason text,
  tax_id text,
  registration_note text,
  description text,
  phone text,
  email text,
  website text,
  logo_r2_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

-- organisation_memberships (Organisation Membership)
create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.organisation_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create trigger organisation_memberships_set_updated_at
before update on public.organisation_memberships
for each row execute function public.set_updated_at();

-- organisation_invitations — team invitations (FR-43), valid 7 days (BR-47).
create table public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null,
  role public.organisation_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  status public.invitation_status not null default 'pending',
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organisation_invitations_set_updated_at
before update on public.organisation_invitations
for each row execute function public.set_updated_at();

-- RLS helpers (security definer, see the households migration) ---------------------------
create function private.is_organisation_member(organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = is_organisation_member.organisation_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.is_organisation_admin(organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = is_organisation_admin.organisation_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

revoke execute on function private.is_organisation_member(uuid) from public, anon;
revoke execute on function private.is_organisation_admin(uuid) from public, anon;
grant execute on function private.is_organisation_member(uuid) to authenticated, service_role;
grant execute on function private.is_organisation_admin(uuid) to authenticated, service_role;

-- BR-32: shelters start pending, breeders approved --------------------------------------
create function public.organisations_set_approval_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.approval_status := case new.type
    when 'shelter' then 'pending'::public.approval_status
    else 'approved'::public.approval_status
  end;
  return new;
end;
$$;

create trigger organisations_set_approval_status
before insert on public.organisations
for each row execute function public.organisations_set_approval_status();

-- BR-34: at most 20 organisation_memberships per organisation ----------------------------
create function public.organisation_memberships_check_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  -- Serialise concurrent joins of the same organisation.
  perform 1 from public.organisations o where o.id = new.organisation_id for update;

  select count(*) into member_count
  from public.organisation_memberships m
  where m.organisation_id = new.organisation_id;

  if member_count + 1 > 20 then
    raise exception using errcode = 'P0001', message = 'team_full';
  end if;
  return new;
end;
$$;

create trigger organisation_memberships_check_size
before insert on public.organisation_memberships
for each row execute function public.organisation_memberships_check_size();

-- BR-34, EP-56, EP-72: a member who is not an Admin may not write the organisation
-- profile, team rows or invitations → forbidden_role. Users with no relation fall
-- through to RLS (row invisible / insert refused). Only checked for client sessions
-- (role authenticated); System paths are unaffected.
create function public.organisation_check_admin_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org_id uuid;
begin
  if current_user = 'authenticated' then
    -- organisation_id is not client-updatable (column grants), so OLD and NEW agree.
    if tg_table_name = 'organisations' then
      org_id := old.id;
    elsif tg_op = 'INSERT' then
      org_id := new.organisation_id;
    else
      org_id := old.organisation_id;
    end if;

    if private.is_organisation_member(org_id) and not private.is_organisation_admin(org_id) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organisations_check_admin_write
before update on public.organisations
for each row execute function public.organisation_check_admin_write();

create trigger organisation_memberships_check_admin_write
before insert or update or delete on public.organisation_memberships
for each row execute function public.organisation_check_admin_write();

create trigger organisation_invitations_check_admin_write
before insert or update or delete on public.organisation_invitations
for each row execute function public.organisation_check_admin_write();

revoke execute on function public.organisation_memberships_check_size() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;
alter table public.organisation_invitations enable row level security;

revoke all on table public.organisations from anon, authenticated;
revoke all on table public.organisation_memberships from anon, authenticated;
revoke all on table public.organisation_invitations from anon, authenticated;

-- organisations: members select their organisation (EP-53); Admins update only the
-- EP-72 public-profile columns. approval_status / rejection_reason have no client
-- write path (EP-68 uses the service role). No client insert or delete.
grant select on table public.organisations to authenticated;
grant update (description, phone, email, website, logo_r2_key)
  on table public.organisations to authenticated;

create policy organisations_select_member on public.organisations
  for select to authenticated
  using (private.is_organisation_member(id));

-- Members pass USING so a Volunteer reaches the forbidden_role trigger; the
-- check admits Admins only.
create policy organisations_update_admin on public.organisations
  for update to authenticated
  using (private.is_organisation_member(id))
  with check (private.is_organisation_admin(id));

-- organisation_memberships: members select their team; only Admins write (BR-34, EP-56).
grant select on table public.organisation_memberships to authenticated;
grant insert (organisation_id, user_id, role) on table public.organisation_memberships to authenticated;
grant update (role) on table public.organisation_memberships to authenticated;
grant delete on table public.organisation_memberships to authenticated;

create policy organisation_memberships_select_member on public.organisation_memberships
  for select to authenticated
  using (private.is_organisation_member(organisation_id));

create policy organisation_memberships_insert_admin on public.organisation_memberships
  for insert to authenticated
  with check (private.is_organisation_admin(organisation_id));

create policy organisation_memberships_update_admin on public.organisation_memberships
  for update to authenticated
  using (private.is_organisation_member(organisation_id))
  with check (private.is_organisation_admin(organisation_id));

create policy organisation_memberships_delete_admin on public.organisation_memberships
  for delete to authenticated
  using (private.is_organisation_member(organisation_id));

-- organisation_invitations: Admins see all of their organisation's invitations;
-- Volunteers see them except pending ones (EP-53). Only Admins write (EP-56).
grant select on table public.organisation_invitations to authenticated;
grant insert (organisation_id, email, role, token_hash, expires_at)
  on table public.organisation_invitations to authenticated;
grant update (status) on table public.organisation_invitations to authenticated;
grant delete on table public.organisation_invitations to authenticated;

create policy organisation_invitations_select_member on public.organisation_invitations
  for select to authenticated
  using (
    private.is_organisation_admin(organisation_id)
    or (private.is_organisation_member(organisation_id) and status <> 'pending')
  );

create policy organisation_invitations_insert_admin on public.organisation_invitations
  for insert to authenticated
  with check (private.is_organisation_admin(organisation_id));

create policy organisation_invitations_update_admin on public.organisation_invitations
  for update to authenticated
  using (private.is_organisation_member(organisation_id))
  with check (private.is_organisation_admin(organisation_id));

create policy organisation_invitations_delete_admin on public.organisation_invitations
  for delete to authenticated
  using (private.is_organisation_member(organisation_id));
