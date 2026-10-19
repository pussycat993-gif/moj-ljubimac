-- Step 07 — moments: moments, moment_photos, moment_public_links (TC §5.4); text ≤ 280
-- characters (BR-52); at most 5 photos (BR-06); the Free moment limit (BR-01, BR-02,
-- BR-24, E-08); R2 keys queued on delete (TC §5.9, API §10); RLS (API §4.4,
-- EP-20 … EP-23). Public reads (EP-24) use the service role — no anon policy.

-- moments (Moment)
create table public.moments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  moment_date date not null,
  text text check (char_length(text) <= 280),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moments_pet_id_idx on public.moments (pet_id);

-- moment_photos (Moment Photo) — positions 1–5, one photo per position (BR-06).
create table public.moment_photos (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments (id) on delete cascade,
  r2_key text not null,
  position smallint not null check (position between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (moment_id, position)
);

-- moment_public_links (Public Link) — one per moment; removed with the moment (BR-45).
create table public.moment_public_links (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null unique references public.moments (id) on delete cascade,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger moments_set_updated_at
before update on public.moments
for each row execute function public.set_updated_at();
create trigger moment_photos_set_updated_at
before update on public.moment_photos
for each row execute function public.set_updated_at();
create trigger moment_public_links_set_updated_at
before update on public.moment_public_links
for each row execute function public.set_updated_at();

create trigger moments_set_created_by
before insert on public.moments
for each row execute function public.set_created_by();

create trigger moments_check_write
before insert or update or delete on public.moments
for each row execute function public.care_check_write();
create trigger moment_photos_check_write
before insert or update or delete on public.moment_photos
for each row execute function public.care_check_write();
create trigger moment_public_links_check_write
before insert or update or delete on public.moment_public_links
for each row execute function public.care_check_write();

-- Free limit: 5 moments per pet unless the creator has Premium (BR-01, BR-02; EP-21).
-- The creator's own entitlement decides — an owner's Premium does not extend to
-- members (BR-24). Enforced for every writer, client or System.
create function public.moments_enforce_free_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator uuid;
begin
  -- The same author set_created_by() records, independent of trigger order.
  creator := coalesce((select auth.uid()), new.created_by);

  -- Serialise concurrent inserts on the same pet.
  perform 1 from public.pets p where p.id = new.pet_id for update;

  if creator is not null and public.is_premium(creator) then
    return new;
  end if;

  if (select count(*) from public.moments m where m.pet_id = new.pet_id) >= 5 then
    raise exception using errcode = 'P0001', message = 'premium_required:moments';
  end if;
  return new;
end;
$$;

create trigger moments_enforce_free_limit
before insert on public.moments
for each row execute function public.moments_enforce_free_limit();

-- R2 keys queued on delete (TC §5.9, API §10) --------------------------------------------
-- Row triggers also fire for rows removed by a cascade (pet → moments → photos).
create function public.moment_photos_queue_r2_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.r2_deletion_queue (r2_key)
  values (old.r2_key)
  on conflict (r2_key) do nothing;
  return null;
end;
$$;

create trigger moment_photos_queue_r2_key
after delete on public.moment_photos
for each row execute function public.moment_photos_queue_r2_key();

revoke execute on function public.moments_enforce_free_limit() from public, anon, authenticated;
revoke execute on function public.moment_photos_queue_r2_key() from public, anon, authenticated;

-- Pet lookup for rows that reach their pet through a moment.
create function private.moment_pet_id(moment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.pet_id from public.moments m where m.id = moment_pet_id.moment_id;
$$;

revoke execute on function private.moment_pet_id(uuid) from public, anon;
grant execute on function private.moment_pet_id(uuid) to authenticated, service_role;

-- RLS ----------------------------------------------------------------------------------
-- Visible to the pet's owner and its household members (EP-20). Update and delete pass
-- every related user through USING so care_check_write() answers with the API error
-- code. Parent ids, created_by, r2_key and slug are not client-updatable.
alter table public.moments enable row level security;
alter table public.moment_photos enable row level security;
alter table public.moment_public_links enable row level security;

revoke all on table public.moments from anon, authenticated;
revoke all on table public.moment_photos from anon, authenticated;
revoke all on table public.moment_public_links from anon, authenticated;

-- moments (EP-20 … EP-22)
grant select, delete on table public.moments to authenticated;
grant insert (pet_id, moment_date, text) on table public.moments to authenticated;
grant update (moment_date, text) on table public.moments to authenticated;

create policy moments_select on public.moments
  for select to authenticated
  using (private.can_access_pet_care(pet_id));

create policy moments_insert on public.moments
  for insert to authenticated
  with check (private.can_access_pet_care(pet_id));

create policy moments_update on public.moments
  for update to authenticated
  using (private.can_access_pet_care(pet_id))
  with check (private.can_access_pet_care(pet_id));

create policy moments_delete on public.moments
  for delete to authenticated
  using (private.can_access_pet_care(pet_id));

-- moment_photos (EP-21): inserted with the moment, removed with it; never updated.
grant select, delete on table public.moment_photos to authenticated;
grant insert (moment_id, r2_key, position) on table public.moment_photos to authenticated;

create policy moment_photos_select on public.moment_photos
  for select to authenticated
  using (private.can_access_pet_care(private.moment_pet_id(moment_id)));

create policy moment_photos_insert on public.moment_photos
  for insert to authenticated
  with check (private.can_access_pet_care(private.moment_pet_id(moment_id)));

create policy moment_photos_delete on public.moment_photos
  for delete to authenticated
  using (private.can_access_pet_care(private.moment_pet_id(moment_id)));

-- moment_public_links (EP-23): the first enable inserts the link, later toggles update
-- active and keep the slug; the link goes only with its moment.
grant select on table public.moment_public_links to authenticated;
grant insert (moment_id, slug, active) on table public.moment_public_links to authenticated;
grant update (active) on table public.moment_public_links to authenticated;

create policy moment_public_links_select on public.moment_public_links
  for select to authenticated
  using (private.can_access_pet_care(private.moment_pet_id(moment_id)));

create policy moment_public_links_insert on public.moment_public_links
  for insert to authenticated
  with check (private.can_access_pet_care(private.moment_pet_id(moment_id)));

create policy moment_public_links_update on public.moment_public_links
  for update to authenticated
  using (private.can_access_pet_care(private.moment_pet_id(moment_id)))
  with check (private.can_access_pet_care(private.moment_pet_id(moment_id)));
