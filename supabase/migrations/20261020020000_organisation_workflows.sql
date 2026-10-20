-- Step 09 — organisation workflows: intakes, pet_status_history, adoption_requests,
-- breeder_inquiries, litters, record_transfers (TC §5.6), the pets.litter_id FK, the
-- status-history trigger (FR-45) and RLS (API §4.4, §5.7 intro, EP-55 … EP-63).

create type public.arrival_type as enum ('found', 'surrendered', 'confiscated', 'other');
create type public.request_status as enum ('pending', 'accepted', 'rejected');

-- intakes (Intake) — shelter animals only (EP-55).
create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null unique references public.pets (id) on delete cascade,
  intake_on date not null,
  arrival_type public.arrival_type not null,
  place_found text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger intakes_set_updated_at
before update on public.intakes
for each row execute function public.set_updated_at();

create trigger intakes_set_created_by
before insert on public.intakes
for each row execute function public.set_created_by();

-- pet_status_history — dated status changes (FR-45).
create table public.pet_status_history (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pet_status_history_set_updated_at
before update on public.pet_status_history
for each row execute function public.set_updated_at();

-- adoption_requests (Adoption Request) — shelter animals (EP-63, EP-58).
create table public.adoption_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text not null,
  email text not null,
  message text,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger adoption_requests_set_updated_at
before update on public.adoption_requests
for each row execute function public.set_updated_at();

-- breeder_inquiries (Breeder Inquiry) — same columns as adoption_requests.
create table public.breeder_inquiries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text not null,
  email text not null,
  message text,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger breeder_inquiries_set_updated_at
before update on public.breeder_inquiries
for each row execute function public.set_updated_at();

-- litters (Litter) — breeder organisations (EP-61).
create table public.litters (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  mother_id uuid not null references public.pets (id) on delete cascade,
  father_id uuid references public.pets (id) on delete set null,
  -- Sire outside the system.
  father_name text,
  born_on date not null,
  offspring_count smallint not null check (offspring_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint litters_father_check check (father_id is null or father_name is null)
);

create trigger litters_set_updated_at
before update on public.litters
for each row execute function public.set_updated_at();

-- FR-48: each offspring's pet record is linked to its litter (column from Step 06).
alter table public.pets
  add constraint pets_litter_id_fkey foreign key (litter_id)
  references public.litters (id) on delete set null;

-- record_transfers (Record Transfer) — valid 30 days; re-send creates a new token (BR-38).
create table public.record_transfers (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  from_organisation_id uuid not null references public.organisations (id),
  recipient_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  status public.invitation_status not null default 'pending',
  -- The copy created for the new owner; the original stays with the organisation.
  new_pet_id uuid references public.pets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger record_transfers_set_updated_at
before update on public.record_transfers
for each row execute function public.set_updated_at();

-- FR-45 (EP-55, EP-58, EP-59, EP-61 side effects): every change of shelter_status,
-- offspring_status or breeding_status records the new status, time and author.
-- Security definer: the history row is written whoever may update the pet.
create function public.pets_record_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shelter_status is distinct from old.shelter_status and new.shelter_status is not null then
    insert into public.pet_status_history (pet_id, status, changed_at, changed_by)
    values (new.id, new.shelter_status::text, now(), (select auth.uid()));
  end if;
  if new.offspring_status is distinct from old.offspring_status and new.offspring_status is not null then
    insert into public.pet_status_history (pet_id, status, changed_at, changed_by)
    values (new.id, new.offspring_status::text, now(), (select auth.uid()));
  end if;
  if new.breeding_status is distinct from old.breeding_status and new.breeding_status is not null then
    insert into public.pet_status_history (pet_id, status, changed_at, changed_by)
    values (new.id, new.breeding_status::text, now(), (select auth.uid()));
  end if;
  return null;
end;
$$;

create trigger pets_record_status_history
after update of shelter_status, offspring_status, breeding_status on public.pets
for each row execute function public.pets_record_status_history();

revoke execute on function public.pets_record_status_history() from public, anon, authenticated;

-- RLS helpers (security definer, see the households migration) ---------------------------
-- Caller is an Admin of the pet's organisation.
create function private.is_pet_organisation_admin(pet_id uuid)
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
    where p.id = is_pet_organisation_admin.pet_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

-- API §5.6 intro: "Breeder plan active" = a breeder_* subscription with status in
-- (trialing, active, cancelled) and current_period_end > now(), held by any admin of
-- the organisation.
create function private.breeder_plan_active(organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_memberships m
    join public.subscriptions s on s.user_id = m.user_id
    where m.organisation_id = breeder_plan_active.organisation_id
      and m.role = 'admin'
      and s.plan in ('breeder_monthly', 'breeder_yearly')
      and s.status in ('trialing', 'active', 'cancelled')
      and s.current_period_end > now()
  );
$$;

-- Caller is an Admin or Volunteer of a breeder organisation (EP-61).
create function private.is_breeder_organisation_member(organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_organisation_member(is_breeder_organisation_member.organisation_id)
     and exists (
       select 1 from public.organisations o
       where o.id = is_breeder_organisation_member.organisation_id
         and o.type = 'breeder'
     );
$$;

revoke execute on function private.is_pet_organisation_admin(uuid) from public, anon;
revoke execute on function private.breeder_plan_active(uuid) from public, anon;
revoke execute on function private.is_breeder_organisation_member(uuid) from public, anon;
grant execute on function private.is_pet_organisation_admin(uuid) to authenticated, service_role;
grant execute on function private.breeder_plan_active(uuid) to authenticated, service_role;
grant execute on function private.is_breeder_organisation_member(uuid) to authenticated, service_role;

-- Client write rules --------------------------------------------------------------------
-- Only checked for client sessions (role authenticated); System paths are unaffected.
-- Users with no relation to the pet fall through to RLS.

-- intakes, pet_status_history (EP-55): organisation writes on a pending/rejected
-- organisation → organisation_pending_approval; an intake is shelter-only (breeder →
-- forbidden_role). Client history rows carry the caller and the current time.
create function public.organisation_status_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org_id uuid;
  org_type public.organisation_type;
begin
  if current_user = 'authenticated' then
    select p.organisation_id, o.type into org_id, org_type
    from public.pets p
    join public.organisations o on o.id = p.organisation_id
    where p.id = new.pet_id;

    if org_id is not null and private.is_organisation_member(org_id) then
      perform private.assert_organisation_writable(org_id);
      if tg_table_name = 'intakes' and org_type <> 'shelter' then
        raise exception using errcode = 'P0001', message = 'forbidden_role';
      end if;
    end if;

    if tg_table_name = 'pet_status_history' then
      new.changed_at := now();
      new.changed_by := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger intakes_check_write
before insert on public.intakes
for each row execute function public.organisation_status_check_write();

create trigger pet_status_history_check_write
before insert on public.pet_status_history
for each row execute function public.organisation_status_check_write();

-- adoption_requests, breeder_inquiries (EP-58): only Admins decide (Volunteer →
-- forbidden_role); pending/rejected organisation → organisation_pending_approval;
-- breeder without an active plan → breeder_plan_required; a request that is no
-- longer pending → already_decided. The decision records its author and time.
create function public.org_request_check_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org_id uuid;
begin
  if current_user = 'authenticated' then
    select p.organisation_id into org_id
    from public.pets p
    where p.id = old.pet_id;

    if org_id is not null and private.is_organisation_member(org_id) then
      perform private.assert_organisation_writable(org_id);
      if not private.is_organisation_admin(org_id) then
        raise exception using errcode = 'P0001', message = 'forbidden_role';
      end if;
      if tg_table_name = 'breeder_inquiries' and not private.breeder_plan_active(org_id) then
        raise exception using errcode = 'P0001', message = 'breeder_plan_required';
      end if;
      if old.status <> 'pending' then
        raise exception using errcode = 'P0001', message = 'already_decided';
      end if;
      new.decided_by := (select auth.uid());
      new.decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger adoption_requests_check_decision
before update on public.adoption_requests
for each row execute function public.org_request_check_decision();

create trigger breeder_inquiries_check_decision
before update on public.breeder_inquiries
for each row execute function public.org_request_check_decision();

-- RLS ----------------------------------------------------------------------------------
alter table public.intakes enable row level security;
alter table public.pet_status_history enable row level security;
alter table public.adoption_requests enable row level security;
alter table public.breeder_inquiries enable row level security;
alter table public.litters enable row level security;
alter table public.record_transfers enable row level security;

revoke all on table public.intakes from anon, authenticated;
revoke all on table public.pet_status_history from anon, authenticated;
revoke all on table public.adoption_requests from anon, authenticated;
revoke all on table public.breeder_inquiries from anon, authenticated;
revoke all on table public.litters from anon, authenticated;
revoke all on table public.record_transfers from anon, authenticated;

-- intakes: the pet's organisation team reads and adds (EP-54, EP-55); no update or
-- delete (deleting the animal is EP-05, which cascades).
grant select on table public.intakes to authenticated;
grant insert (pet_id, intake_on, arrival_type, place_found, note)
  on table public.intakes to authenticated;

create policy intakes_select on public.intakes
  for select to authenticated
  using (private.is_pet_organisation_member(pet_id));

create policy intakes_insert on public.intakes
  for insert to authenticated
  with check (private.is_pet_organisation_member(pet_id));

-- pet_status_history: the pet's organisation team reads and adds; status changes
-- through pets updates are written by the trigger above.
grant select on table public.pet_status_history to authenticated;
grant insert (pet_id, status) on table public.pet_status_history to authenticated;

create policy pet_status_history_select on public.pet_status_history
  for select to authenticated
  using (private.is_pet_organisation_member(pet_id));

create policy pet_status_history_insert on public.pet_status_history
  for insert to authenticated
  with check (private.is_pet_organisation_member(pet_id));

-- adoption_requests, breeder_inquiries: the requester reads own rows; the animal's
-- organisation team reads (Volunteer read-only, EP-57); only Admins write the decision
-- columns (EP-58). Inserts go through EP-63's server action — no client insert.
grant select on table public.adoption_requests to authenticated;
grant update (status, decided_by, decided_at) on table public.adoption_requests to authenticated;

create policy adoption_requests_select on public.adoption_requests
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or private.is_pet_organisation_member(pet_id)
  );

-- The team passes USING so a Volunteer reaches the forbidden_role trigger; the check
-- admits Admins only.
create policy adoption_requests_update_admin on public.adoption_requests
  for update to authenticated
  using (private.is_pet_organisation_member(pet_id))
  with check (private.is_pet_organisation_admin(pet_id));

grant select on table public.breeder_inquiries to authenticated;
grant update (status, decided_by, decided_at) on table public.breeder_inquiries to authenticated;

create policy breeder_inquiries_select on public.breeder_inquiries
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or private.is_pet_organisation_member(pet_id)
  );

create policy breeder_inquiries_update_admin on public.breeder_inquiries
  for update to authenticated
  using (private.is_pet_organisation_member(pet_id))
  with check (private.is_pet_organisation_admin(pet_id));

-- litters: Admins and Volunteers of a breeder organisation read (EP-61); inserts go
-- through EP-61's server action.
grant select on table public.litters to authenticated;

create policy litters_select on public.litters
  for select to authenticated
  using (private.is_breeder_organisation_member(organisation_id));

-- record_transfers: the sending organisation's Admins read (EP-59); inserts and
-- updates go through the EP-59 / EP-60 server actions.
grant select on table public.record_transfers to authenticated;

create policy record_transfers_select_admin on public.record_transfers
  for select to authenticated
  using (private.is_organisation_admin(from_organisation_id));
