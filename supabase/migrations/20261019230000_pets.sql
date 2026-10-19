-- Step 06 — pets: pets, memorial_records (TC §5.3) and household_pets (TC §5.1), the
-- shared created_by trigger function (TC §5 conventions), RLS helpers and RLS
-- (API §4.4, EP-01 … EP-07, EP-37). Free limits are in the pet_limits migration.

create type public.pet_species as enum (
  'dog', 'cat', 'rabbit', 'hamster', 'guinea_pig', 'chinchilla', 'ferret',
  'bird', 'fish', 'turtle', 'lizard', 'snake', 'other'
);
create type public.pet_sex as enum ('male', 'female', 'unknown');
create type public.neutered_status as enum ('yes', 'no', 'unknown');
create type public.weight_unit as enum ('kg', 'g');
create type public.pet_lifecycle as enum ('active', 'memorial');
create type public.shelter_status as enum (
  'intake', 'in_care', 'available', 'reserved', 'adopted', 'deceased', 'returned_to_owner'
);
create type public.offspring_status as enum ('available', 'reserved', 'sold');
create type public.breeding_status as enum ('active', 'retired');
create type public.memorial_reason as enum ('passed_away', 'rehomed', 'lost');

-- pets (Pet) — personal pets, shelter animals, breeder animals and offspring.
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  -- Account deletion (BR-31) removes the owner's pets with their record.
  owner_id uuid references public.profiles (id) on delete cascade,
  organisation_id uuid references public.organisations (id),
  name text not null,
  species public.pet_species not null,
  species_other text,
  breed text,
  colour_markings text,
  microchip_number text,
  passport_number text,
  note text,
  sex public.pet_sex not null,
  birth_date date,
  birth_year smallint,
  neutered public.neutered_status not null default 'unknown',
  photo_r2_key text,
  vet_name text,
  vet_phone text,
  weight_unit public.weight_unit not null default 'kg',
  lifecycle public.pet_lifecycle not null default 'active',
  shelter_status public.shelter_status,
  offspring_status public.offspring_status,
  breeding_status public.breeding_status,
  -- FK → litters is added in Step 09.
  litter_id uuid,
  price_minor integer check (price_minor >= 0),
  public_description text,
  approx_age_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pets_owner_xor_organisation check ((owner_id is null) <> (organisation_id is null)),
  constraint pets_species_other_check check (
    (species = 'other' and species_other is not null)
    or (species <> 'other' and species_other is null)
  )
);

create index pets_owner_id_lifecycle_idx on public.pets (owner_id, lifecycle);
create index pets_organisation_id_shelter_status_idx on public.pets (organisation_id, shelter_status);
create index pets_organisation_id_offspring_status_idx on public.pets (organisation_id, offspring_status);

create trigger pets_set_updated_at
before update on public.pets
for each row execute function public.set_updated_at();

-- memorial_records (Memorial Record)
create table public.memorial_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null unique references public.pets (id) on delete cascade,
  date date not null,
  reason public.memorial_reason,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger memorial_records_set_updated_at
before update on public.memorial_records
for each row execute function public.set_updated_at();

-- household_pets — "household shares pets" (FR-27).
create table public.household_pets (
  household_id uuid not null references public.households (id),
  pet_id uuid not null references public.pets (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, pet_id)
);

create index household_pets_pet_id_idx on public.household_pets (pet_id);

create trigger household_pets_set_updated_at
before update on public.household_pets
for each row execute function public.set_updated_at();

-- created_by on every care/record entry (TC §5 conventions) -------------------------------
-- Set from the session on insert; a System insert (no session) must name the author.
-- The column is not client-updatable, and the FK clears it when the author is deleted.
create function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  if new.created_by is null then
    raise exception using
      errcode = 'P0001',
      message = 'internal_error',
      detail = tg_table_name || '.created_by is required at creation';
  end if;
  return new;
end;
$$;

-- RLS helpers (security definer, see the households migration) ---------------------------
create function private.is_pet_owner(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pets p
    where p.id = is_pet_owner.pet_id
      and p.owner_id = (select auth.uid())
  );
$$;

-- Caller is a member of a household the pet is shared with (household_pets).
create function private.is_pet_household_member(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_pets hp
    join public.household_memberships m on m.household_id = hp.household_id
    where hp.pet_id = is_pet_household_member.pet_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Caller is an Admin or Volunteer of the pet's organisation.
create function private.is_pet_organisation_member(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets p
    join public.organisation_memberships m on m.organisation_id = p.organisation_id
    where p.id = is_pet_organisation_member.pet_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Owner or organisation role: may write the pet's record.
create function private.can_manage_pet(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pet_owner(can_manage_pet.pet_id)
      or private.is_pet_organisation_member(can_manage_pet.pet_id);
$$;

-- Any relation to the pet: owner, household member, organisation role (API §4.3).
create function private.can_read_pet(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_pet(can_read_pet.pet_id)
      or private.is_pet_household_member(can_read_pet.pet_id);
$$;

-- BR-28: a member's access to a shared pet is read-only when every household through
-- which they reach the pet is read-only.
create function private.is_pet_household_read_only(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.household_pets hp
    join public.household_memberships m on m.household_id = hp.household_id
    join public.households h on h.id = hp.household_id
    where hp.pet_id = is_pet_household_read_only.pet_id
      and m.user_id = (select auth.uid())
      and not h.read_only
  );
$$;

-- API §4.1 gate 4, §5.7 intro: organisation writes on a pending organisation →
-- organisation_pending_approval; on a rejected one the same code with
-- details.approval_status = 'rejected'.
create function private.assert_organisation_writable(organisation_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  status public.approval_status;
begin
  select o.approval_status into status
  from public.organisations o
  where o.id = assert_organisation_writable.organisation_id;

  if status = 'pending' then
    raise exception using errcode = 'P0001', message = 'organisation_pending_approval';
  elsif status = 'rejected' then
    raise exception using errcode = 'P0001', message = 'organisation_pending_approval:rejected';
  end if;
end;
$$;

-- The caller's role on a pet for a write: 'owner', 'member', 'org_admin', 'volunteer',
-- or null (no relation — left to RLS). Organisation roles pass the approval gate first.
create function private.pet_write_role(pet_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pet record;
  member_role public.organisation_role;
begin
  select p.owner_id, p.organisation_id into pet
  from public.pets p
  where p.id = pet_write_role.pet_id;

  if not found then
    return null;
  end if;

  if pet.owner_id is not null then
    if pet.owner_id = (select auth.uid()) then
      return 'owner';
    elsif private.is_pet_household_member(pet_write_role.pet_id) then
      return 'member';
    end if;
    return null;
  end if;

  select m.role into member_role
  from public.organisation_memberships m
  where m.organisation_id = pet.organisation_id
    and m.user_id = (select auth.uid());

  if not found then
    return null;
  end if;

  perform private.assert_organisation_writable(pet.organisation_id);
  return case member_role when 'admin' then 'org_admin' else 'volunteer' end;
end;
$$;

revoke execute on function private.is_pet_owner(uuid) from public, anon;
revoke execute on function private.is_pet_household_member(uuid) from public, anon;
revoke execute on function private.is_pet_organisation_member(uuid) from public, anon;
revoke execute on function private.can_manage_pet(uuid) from public, anon;
revoke execute on function private.can_read_pet(uuid) from public, anon;
revoke execute on function private.is_pet_household_read_only(uuid) from public, anon;
revoke execute on function private.assert_organisation_writable(uuid) from public, anon;
revoke execute on function private.pet_write_role(uuid) from public, anon;
grant execute on function private.is_pet_owner(uuid) to authenticated, service_role;
grant execute on function private.is_pet_household_member(uuid) to authenticated, service_role;
grant execute on function private.is_pet_organisation_member(uuid) to authenticated, service_role;
grant execute on function private.can_manage_pet(uuid) to authenticated, service_role;
grant execute on function private.can_read_pet(uuid) to authenticated, service_role;
grant execute on function private.is_pet_household_read_only(uuid) to authenticated, service_role;
grant execute on function private.assert_organisation_writable(uuid) to authenticated, service_role;
grant execute on function private.pet_write_role(uuid) to authenticated, service_role;

-- Client write rules on pets (EP-03 … EP-07) ----------------------------------------------
-- Only checked for client sessions (role authenticated); System paths are unaffected.
--   insert: owner_id other than the caller → forbidden_role (EP-03); organisation
--           members pass the approval gate.
--   update: Member → forbidden_role (EP-04); organisation animals have no memorial
--           lifecycle (EP-06, EP-07) → forbidden_role.
--   delete: Member and Volunteer → forbidden_role (BR-25, BR-34, EP-05).
create function public.pets_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role text;
begin
  if current_user <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is not null and new.owner_id is distinct from (select auth.uid()) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
    if new.organisation_id is not null
       and private.is_organisation_member(new.organisation_id) then
      perform private.assert_organisation_writable(new.organisation_id);
    end if;
    return new;
  end if;

  role := private.pet_write_role(old.id);

  if role = 'member' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if tg_op = 'UPDATE' then
    if role in ('org_admin', 'volunteer') and new.lifecycle is distinct from old.lifecycle then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
    return new;
  end if;

  if role = 'volunteer' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  return old;
end;
$$;

create trigger pets_check_write
before insert or update or delete on public.pets
for each row execute function public.pets_check_write();

-- memorial_records: owner only (EP-06, EP-07); members and organisation roles →
-- forbidden_role.
create function public.memorial_records_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role text;
begin
  if current_user = 'authenticated' then
    role := private.pet_write_role(
      case when tg_op = 'DELETE' then old.pet_id else new.pet_id end
    );
    if role in ('member', 'org_admin', 'volunteer') then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memorial_records_check_write
before insert or update or delete on public.memorial_records
for each row execute function public.memorial_records_check_write();

-- household_pets (EP-37): the household owner shares own pets (BR-21). A member →
-- forbidden_role; a read-only household → household_read_only.
create function public.household_pets_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hh_id uuid;
begin
  if current_user = 'authenticated' then
    hh_id := case when tg_op = 'DELETE' then old.household_id else new.household_id end;

    if private.is_household_member(hh_id) and not private.is_household_owner(hh_id) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
    if private.is_household_owner(hh_id)
       and exists (select 1 from public.households h where h.id = hh_id and h.read_only) then
      raise exception using errcode = 'P0001', message = 'household_read_only';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger household_pets_check_write
before insert or delete on public.household_pets
for each row execute function public.household_pets_check_write();

-- RLS ----------------------------------------------------------------------------------
alter table public.pets enable row level security;
alter table public.memorial_records enable row level security;
alter table public.household_pets enable row level security;

revoke all on table public.pets from anon, authenticated;
revoke all on table public.memorial_records from anon, authenticated;
revoke all on table public.household_pets from anon, authenticated;

-- pets: visible to the owner, members of a household it is shared with, and its
-- organisation's team (API §4.3: everyone else sees nothing). owner_id and
-- organisation_id are fixed after insert.
grant select, delete on table public.pets to authenticated;
grant insert (
  owner_id, organisation_id, name, species, species_other, breed, colour_markings,
  microchip_number, passport_number, note, sex, birth_date, birth_year, neutered,
  photo_r2_key, vet_name, vet_phone, weight_unit, lifecycle, shelter_status,
  offspring_status, breeding_status, litter_id, price_minor, public_description,
  approx_age_text
) on table public.pets to authenticated;
grant update (
  name, species, species_other, breed, colour_markings, microchip_number,
  passport_number, note, sex, birth_date, birth_year, neutered, photo_r2_key,
  vet_name, vet_phone, weight_unit, lifecycle, shelter_status, offspring_status,
  breeding_status, litter_id, price_minor, public_description, approx_age_text
) on table public.pets to authenticated;

create policy pets_select on public.pets
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.is_organisation_member(organisation_id)
    or private.is_pet_household_member(id)
  );

create policy pets_insert on public.pets
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    or (organisation_id is not null and private.is_organisation_member(organisation_id))
  );

-- Every related user passes USING so the role trigger answers with forbidden_role;
-- the check admits only the owner and the organisation's team.
create policy pets_update on public.pets
  for update to authenticated
  using (private.can_read_pet(id))
  with check (
    owner_id = (select auth.uid())
    or (organisation_id is not null and private.is_organisation_member(organisation_id))
  );

create policy pets_delete on public.pets
  for delete to authenticated
  using (private.can_read_pet(id));

-- memorial_records: read with the pet; written by the owner (EP-06, EP-07).
grant select, delete on table public.memorial_records to authenticated;
grant insert (pet_id, date, reason, note) on table public.memorial_records to authenticated;
grant update (date, reason, note) on table public.memorial_records to authenticated;

create policy memorial_records_select on public.memorial_records
  for select to authenticated
  using (private.can_read_pet(pet_id));

create policy memorial_records_insert_owner on public.memorial_records
  for insert to authenticated
  with check (private.is_pet_owner(pet_id));

create policy memorial_records_update_owner on public.memorial_records
  for update to authenticated
  using (private.can_read_pet(pet_id))
  with check (private.is_pet_owner(pet_id));

create policy memorial_records_delete_owner on public.memorial_records
  for delete to authenticated
  using (private.can_read_pet(pet_id));

-- household_pets: the household's owner and members read; the owner shares and
-- unshares own pets in own household (BR-21, EP-37).
grant select, delete on table public.household_pets to authenticated;
grant insert (household_id, pet_id) on table public.household_pets to authenticated;

create policy household_pets_select on public.household_pets
  for select to authenticated
  using (
    private.is_household_owner(household_id)
    or private.is_household_member(household_id)
  );

create policy household_pets_insert_owner on public.household_pets
  for insert to authenticated
  with check (
    private.is_household_owner(household_id)
    and private.is_pet_owner(pet_id)
  );

create policy household_pets_delete on public.household_pets
  for delete to authenticated
  using (
    private.is_household_owner(household_id)
    or private.is_household_member(household_id)
  );
