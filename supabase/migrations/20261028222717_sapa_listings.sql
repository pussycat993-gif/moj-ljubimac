-- Step 28a — Šapa pomoći listings (TC v1.7 §5.10): the seven shared enums, listings and listing_photos
-- with their checks, indexes, triggers and RLS (BR-54 … BR-57, BR-60; FR-61 … FR-65 data side).
-- OQ-16 (open): the PRD default applies — only owner Premium (is_premium) and account_type = shelter
-- lift the 3-active-listing limit; an active breeder plan does not. OQ-17 (open): none of its proposed
-- columns are added.

create type public.listing_type as enum ('need', 'giving', 'selling', 'seeking');
create type public.listing_category as enum (
  'food', 'equipment_toys', 'furniture', 'carriers', 'medicine_care', 'other'
);
create type public.listing_species as enum ('dog', 'cat', 'other');
create type public.listing_status as enum ('active', 'resolved', 'expired', 'hidden');
create type public.listing_outcome as enum ('given', 'sold', 'donated', 'found');
create type public.report_reason as enum ('spam', 'scam', 'inappropriate', 'animal_welfare', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- listings (Listing) ------------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  -- EP-75: the author is the caller; not client-writable.
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- need only: the shelter the need is posted for (BR-54).
  organisation_id uuid references public.organisations (id) on delete cascade,
  type public.listing_type not null,
  title text not null constraint listings_title_check check (char_length(title) between 1 and 80),
  description text not null
    constraint listings_description_check check (char_length(description) between 1 and 2000),
  category public.listing_category not null,
  species public.listing_species not null,
  city_id uuid not null references public.cities (id),
  price_minor integer constraint listings_price_minor_check check (price_minor > 0),
  price_negotiable boolean not null default false,
  status public.listing_status not null default 'active',
  resolved_outcome public.listing_outcome,
  published_at timestamptz not null default now(),
  -- published_at + 30 days on insert (trigger below, BR-56).
  expires_at timestamptz not null,
  expiry_notice_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_need_organisation_check check ((type = 'need') = (organisation_id is not null)),
  -- BR-54: medicine and care only for needs (API §7.1 maps SQLSTATE 23514 here to category_not_allowed).
  constraint listings_category_check check (category <> 'medicine_care' or type = 'need'),
  -- BR-57: selling carries exactly one of a price or "po dogovoru"; other types carry neither.
  constraint listings_price_check check (
    case
      when type = 'selling' then (price_minor is not null) <> price_negotiable
      else price_minor is null and not price_negotiable
    end
  ),
  constraint listings_resolved_outcome_check check ((status = 'resolved') = (resolved_outcome is not null))
);

-- EP-73 public list, newest first, and its filtered form.
create index listings_active_published_at_idx on public.listings (published_at desc)
  where status = 'active';
create index listings_active_filters_idx
  on public.listings (city_id, type, category, species, published_at desc)
  where status = 'active';
-- BR-55 Free limit count and "Moje objave" (EP-76).
create index listings_author_id_status_idx on public.listings (author_id, status);
-- EP-87 expiry job.
create index listings_active_expires_at_idx on public.listings (expires_at) where status = 'active';
create index listings_organisation_id_idx on public.listings (organisation_id)
  where organisation_id is not null;

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

-- listing_photos (Listing Photo) — at most 5 per listing (BR-55) -----------------------------------
create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  r2_key text not null,
  position smallint not null constraint listing_photos_position_check check (position between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, position)
);

create trigger listing_photos_set_updated_at
before update on public.listing_photos
for each row execute function public.set_updated_at();

-- Helpers -----------------------------------------------------------------------------------------
-- true unless the author is suspended from Šapa pomoći (BR-60); used by the public-visibility
-- policies, so anon may execute it (owner decision for Step 28a).
create function public.marketplace_author_ok(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from profiles where id = p_author and marketplace_suspended_at is not null
  );
$$;

revoke all on function public.marketplace_author_ok(uuid) from public;
grant execute on function public.marketplace_author_ok(uuid) to anon, authenticated, service_role;

-- Triggers (TC §5.10; errors in the §5.7.1 format) ------------------------------------------------

-- BR-56: expires_at = published_at + 30 days on insert.
create function public.listings_set_expires_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.expires_at := new.published_at + interval '30 days';
  return new;
end;
$$;

create trigger listings_set_expires_at
before insert on public.listings
for each row execute function public.listings_set_expires_at();

-- BR-55: a non-need listing becoming active (insert, extend from expired, restore) is refused when the
-- author has no active Premium, is not a Shelter account, and already has 3 active non-need listings.
-- Every writer, client or System (EP-86 restore falls back to expired on this error).
create function public.listings_active_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' or new.type = 'need' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  -- Serialise concurrent publishes of the same author.
  perform 1 from public.profiles p where p.id = new.author_id for update;

  if public.is_premium(new.author_id)
     or exists (select 1 from public.profiles p where p.id = new.author_id and p.account_type = 'shelter') then
    return new;
  end if;

  if (
    select count(*) from public.listings l
    where l.author_id = new.author_id
      and l.status = 'active'
      and l.type <> 'need'
      and l.id <> new.id
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'premium_required:listings';
  end if;
  return new;
end;
$$;

create trigger listings_active_limit
before insert or update of status on public.listings
for each row execute function public.listings_active_limit();

-- BR-54: a need is posted for an approved shelter in which the author is an Admin or Volunteer.
-- Checked on insert and when the author edits; System writes (expiry job, moderation) pass.
create function public.listings_need_shelter_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if new.type <> 'need' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (caller is null or caller <> new.author_id) then
    return new;
  end if;

  if not exists (
    select 1
    from public.organisations o
    join public.organisation_memberships m on m.organisation_id = o.id
    where o.id = new.organisation_id
      and o.type = 'shelter'
      and o.approval_status = 'approved'
      and m.user_id = new.author_id
  ) then
    raise exception using errcode = 'P0001', message = 'listing_type_not_allowed';
  end if;
  return new;
end;
$$;

create trigger listings_need_shelter_only
before insert or update on public.listings
for each row execute function public.listings_need_shelter_only();

-- BR-61 / EP-75 / EP-77: the author cannot change a resolved or hidden listing, nor hide one; hiding
-- and restoring belong to the Operator. The service role (auth.uid() null) passes (owner decision).
create function public.listings_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is not null
     and caller = old.author_id
     and not private.is_operator()
     and (old.status in ('hidden', 'resolved') or new.status = 'hidden') then
    raise exception using errcode = 'P0001', message = 'listing_not_active';
  end if;
  return new;
end;
$$;

create trigger listings_status_guard
before update on public.listings
for each row execute function public.listings_status_guard();

-- BR-60: a suspended user cannot publish or edit listings (as author) or send messages. Shared by
-- listings (insert; update by the author) and messages (insert, attached in sapa_messaging).
create function public.marketplace_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  if tg_table_name = 'messages' then
    actor := new.sender_id;
  else
    if tg_op = 'UPDATE' and (select auth.uid()) is distinct from old.author_id then
      return new;
    end if;
    actor := new.author_id;
  end if;

  if exists (
    select 1 from public.profiles p where p.id = actor and p.marketplace_suspended_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'marketplace_suspended';
  end if;
  return new;
end;
$$;

create trigger marketplace_not_suspended
before insert or update on public.listings
for each row execute function public.marketplace_not_suspended();

-- BR-55: at most 5 photos per listing (backs the position check).
create function public.listing_photos_max()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialise concurrent photo inserts on the same listing.
  perform 1 from public.listings l where l.id = new.listing_id for update;

  if (select count(*) from public.listing_photos p where p.listing_id = new.listing_id) >= 5 then
    raise exception using errcode = 'P0001', message = 'validation_failed';
  end if;
  return new;
end;
$$;

create trigger listing_photos_max
before insert on public.listing_photos
for each row execute function public.listing_photos_max();

-- TC §5.9 / ADR-07: photo keys are queued on delete. Row triggers also fire for rows removed by a
-- cascade, so listing and account deletion queue them too (FR-64, EP-52).
create function public.listing_photos_queue_r2_key()
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

create trigger listing_photos_queue_r2_key
after delete on public.listing_photos
for each row execute function public.listing_photos_queue_r2_key();

revoke execute on function public.listings_set_expires_at() from public, anon, authenticated;
revoke execute on function public.listings_active_limit() from public, anon, authenticated;
revoke execute on function public.listings_need_shelter_only() from public, anon, authenticated;
revoke execute on function public.listings_status_guard() from public, anon, authenticated;
revoke execute on function public.marketplace_not_suspended() from public, anon, authenticated;
revoke execute on function public.listing_photos_max() from public, anon, authenticated;
revoke execute on function public.listing_photos_queue_r2_key() from public, anon, authenticated;

-- RLS ---------------------------------------------------------------------------------------------
-- Public visibility (API §5.9): status active and the author not suspended — anonymous and signed in.
-- The author reads all of their rows, the Operator reads all. The BR-59 block filter is the EP-73
-- query's (Step 28b). Writes by the author only; hide / restore by the Operator (EP-86).
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;

revoke all on table public.listings from anon, authenticated;
revoke all on table public.listing_photos from anon, authenticated;

grant select on table public.listings to anon, authenticated;
grant insert (organisation_id, type, title, description, category, species, city_id, price_minor,
  price_negotiable) on table public.listings to authenticated;
grant update (type, title, description, category, species, city_id, price_minor, price_negotiable,
  status, resolved_outcome, expires_at, expiry_notice_sent_at) on table public.listings to authenticated;
grant delete on table public.listings to authenticated;

create policy listings_select_public on public.listings
  for select to anon, authenticated
  using (status = 'active' and public.marketplace_author_ok(author_id));

create policy listings_select_own on public.listings
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy listings_select_operator on public.listings
  for select to authenticated
  using (private.is_operator());

create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy listings_update_own on public.listings
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy listings_update_operator on public.listings
  for update to authenticated
  using (private.is_operator())
  with check (private.is_operator());

create policy listings_delete_own on public.listings
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- listing_photos follow their listing's visibility (the subquery runs under listings RLS); the
-- author adds, reorders and removes them.
grant select on table public.listing_photos to anon, authenticated;
grant insert (listing_id, r2_key, position) on table public.listing_photos to authenticated;
grant update (position) on table public.listing_photos to authenticated;
grant delete on table public.listing_photos to authenticated;

create policy listing_photos_select on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

create policy listing_photos_insert_author on public.listing_photos
  for insert to authenticated
  with check (exists (
    select 1 from public.listings l where l.id = listing_id and l.author_id = (select auth.uid())
  ));

create policy listing_photos_update_author on public.listing_photos
  for update to authenticated
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.author_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.listings l where l.id = listing_id and l.author_id = (select auth.uid())
  ));

create policy listing_photos_delete_author on public.listing_photos
  for delete to authenticated
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.author_id = (select auth.uid())
  ));
