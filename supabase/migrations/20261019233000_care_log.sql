-- Step 07 — care log: feeding_entries and stool_entries (TC §5.4), created_by triggers,
-- the care-access helpers shared with the moments migration, and RLS (API §4.4,
-- EP-17, EP-18). Feeding and stool logs are unlimited on every tier (BR-04).

create type public.feeding_type as enum ('dry', 'wet', 'treat', 'home_made', 'other');
create type public.stool_consistency as enum ('normal', 'soft', 'diarrhoea', 'hard');

-- feeding_entries (Feeding Entry)
create table public.feeding_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  fed_at timestamptz not null,
  type public.feeding_type not null,
  brand text,
  amount_g numeric(8, 1) check (amount_g > 0),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feeding_entries_pet_id_fed_at_idx on public.feeding_entries (pet_id, fed_at);

-- stool_entries (Stool Entry)
create table public.stool_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  observed_at timestamptz not null,
  consistency public.stool_consistency not null,
  blood_or_mucus boolean not null default false,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger feeding_entries_set_updated_at
before update on public.feeding_entries
for each row execute function public.set_updated_at();
create trigger stool_entries_set_updated_at
before update on public.stool_entries
for each row execute function public.set_updated_at();

create trigger feeding_entries_set_created_by
before insert on public.feeding_entries
for each row execute function public.set_created_by();
create trigger stool_entries_set_created_by
before insert on public.stool_entries
for each row execute function public.set_created_by();

-- Care access (API §4.4 EP-17 … EP-23) ------------------------------------------------------
-- Care log and moments exist only for personal pets: the owner and members of a
-- household the pet is shared with. Organisation roles have no relation (rows absent).
create function private.can_access_pet_care(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pet_owner(can_access_pet_care.pet_id)
      or private.is_pet_household_member(can_access_pet_care.pet_id);
$$;

revoke execute on function private.can_access_pet_care(uuid) from public, anon;
grant execute on function private.can_access_pet_care(uuid) to authenticated, service_role;

-- Client write rules on care entries (EP-18, EP-21 … EP-23) -------------------------------
-- The owner writes every row. A household member (BR-22, BR-23, BR-28):
--   any write while the household is read-only → household_read_only;
--   feeding_entries, stool_entries, moments: insert; update/delete only rows they
--     created, else forbidden_role (E-12);
--   moment_photos, moment_public_links: every write only on a moment they created,
--     else forbidden_role.
-- Users with no relation (organisation roles included) fall through to RLS. Only
-- checked for client sessions; cascades and the service role are unaffected.
create function public.care_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry jsonb;
  target_pet_id uuid;
  author uuid;
begin
  if current_user <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- The parent columns are not client-updatable, so OLD and NEW agree on them.
  entry := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name in ('moment_photos', 'moment_public_links') then
    select m.pet_id, m.created_by into target_pet_id, author
    from public.moments m
    where m.id = (entry ->> 'moment_id')::uuid;
  else
    target_pet_id := (entry ->> 'pet_id')::uuid;
    if tg_op <> 'INSERT' then
      author := (to_jsonb(old) ->> 'created_by')::uuid;
    end if;
  end if;

  if target_pet_id is not null
     and not private.is_pet_owner(target_pet_id)
     and private.is_pet_household_member(target_pet_id) then
    if private.is_pet_household_read_only(target_pet_id) then
      raise exception using errcode = 'P0001', message = 'household_read_only';
    end if;
    if (tg_op <> 'INSERT' or tg_table_name in ('moment_photos', 'moment_public_links'))
       and author is distinct from (select auth.uid()) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger feeding_entries_check_write
before insert or update or delete on public.feeding_entries
for each row execute function public.care_check_write();
create trigger stool_entries_check_write
before insert or update or delete on public.stool_entries
for each row execute function public.care_check_write();

-- RLS ----------------------------------------------------------------------------------
-- Visible to the pet's owner and its household members (EP-17). Update and delete pass
-- every related user through USING so the trigger above answers with the API error
-- code. pet_id and created_by are not client-updatable.
alter table public.feeding_entries enable row level security;
alter table public.stool_entries enable row level security;

revoke all on table public.feeding_entries from anon, authenticated;
revoke all on table public.stool_entries from anon, authenticated;

-- feeding_entries (EP-18)
grant select, delete on table public.feeding_entries to authenticated;
grant insert (pet_id, fed_at, type, brand, amount_g, note)
  on table public.feeding_entries to authenticated;
grant update (fed_at, type, brand, amount_g, note)
  on table public.feeding_entries to authenticated;

create policy feeding_entries_select on public.feeding_entries
  for select to authenticated
  using (private.can_access_pet_care(pet_id));

create policy feeding_entries_insert on public.feeding_entries
  for insert to authenticated
  with check (private.can_access_pet_care(pet_id));

create policy feeding_entries_update on public.feeding_entries
  for update to authenticated
  using (private.can_access_pet_care(pet_id))
  with check (private.can_access_pet_care(pet_id));

create policy feeding_entries_delete on public.feeding_entries
  for delete to authenticated
  using (private.can_access_pet_care(pet_id));

-- stool_entries (EP-18)
grant select, delete on table public.stool_entries to authenticated;
grant insert (pet_id, observed_at, consistency, blood_or_mucus, note)
  on table public.stool_entries to authenticated;
grant update (observed_at, consistency, blood_or_mucus, note)
  on table public.stool_entries to authenticated;

create policy stool_entries_select on public.stool_entries
  for select to authenticated
  using (private.can_access_pet_care(pet_id));

create policy stool_entries_insert on public.stool_entries
  for insert to authenticated
  with check (private.can_access_pet_care(pet_id));

create policy stool_entries_update on public.stool_entries
  for update to authenticated
  using (private.can_access_pet_care(pet_id))
  with check (private.can_access_pet_care(pet_id));

create policy stool_entries_delete on public.stool_entries
  for delete to authenticated
  using (private.can_access_pet_care(pet_id));
