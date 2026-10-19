-- Step 06 — Free limits on personally owned pets (BR-01, BR-02, BR-03, BR-33;
-- E-02, E-03, E-04, E-26), raised per TC §5.7.1. Organisation animals have no limit
-- (BR-33). Enforced for every writer, client or System.

-- pets: 1 active pet and 2 memorials on Free; organisation accounts own no personal
-- pets (BR-33 → forbidden_role).
create function public.pets_enforce_free_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_changed boolean;
begin
  if new.owner_id is null then
    return new;
  end if;

  owner_changed := tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id;

  if owner_changed and exists (
    select 1 from public.profiles p
    where p.id = new.owner_id and p.account_type <> 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if not (owner_changed or new.lifecycle is distinct from old.lifecycle) then
    return new;
  end if;

  -- Serialise concurrent writes of the same owner's pets.
  perform 1 from public.profiles p where p.id = new.owner_id for update;

  if public.is_premium(new.owner_id) then
    return new;
  end if;

  -- BR-01, BR-03: memorial pets do not count toward the active-pet limit.
  if new.lifecycle = 'active' and exists (
    select 1 from public.pets p
    where p.owner_id = new.owner_id and p.lifecycle = 'active' and p.id <> new.id
  ) then
    raise exception using errcode = 'P0001', message = 'premium_required:pets';
  end if;

  if new.lifecycle = 'memorial' and (
    select count(*) from public.pets p
    where p.owner_id = new.owner_id and p.lifecycle = 'memorial' and p.id <> new.id
  ) >= 2 then
    raise exception using errcode = 'P0001', message = 'premium_required:memorials';
  end if;

  return new;
end;
$$;

create trigger pets_enforce_free_limits
before insert or update of owner_id, lifecycle on public.pets
for each row execute function public.pets_enforce_free_limits();

-- attachments: 10 per pet on Free (BR-01, E-04).
create function public.attachments_enforce_free_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pet_id uuid;
  pet_owner_id uuid;
begin
  target_pet_id := private.vet_visit_pet_id(new.vet_visit_id);

  -- Serialise concurrent uploads to the same pet.
  select p.owner_id into pet_owner_id
  from public.pets p
  where p.id = target_pet_id
  for update;

  if pet_owner_id is null or public.is_premium(pet_owner_id) then
    return new;
  end if;

  if (select count(*) from public.attachments a where a.pet_id = target_pet_id) >= 10 then
    raise exception using errcode = 'P0001', message = 'premium_required:attachments';
  end if;
  return new;
end;
$$;

create trigger attachments_enforce_free_limit
before insert on public.attachments
for each row execute function public.attachments_enforce_free_limit();

revoke execute on function public.pets_enforce_free_limits() from public, anon, authenticated;
revoke execute on function public.attachments_enforce_free_limit() from public, anon, authenticated;
