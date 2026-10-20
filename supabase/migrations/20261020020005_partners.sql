-- Step 09 — partners: partners, partner_hours, partner_clicks (TC §5.7), the
-- featured-partner limit (BR-41) and RLS (BR-40, API §4.4, EP-64 … EP-66, EP-69).

create type public.partner_type as enum ('vet', 'pet_shop', 'grooming', 'pet_hotel');
create type public.partner_message_channel as enum ('none', 'sms', 'viber', 'whatsapp');
create type public.partner_click_action as enum ('call', 'message', 'email', 'website');

-- partners (Partner) — written only by the Operator through the service role (EP-69).
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  type public.partner_type not null,
  name text not null,
  address text not null,
  city_id uuid not null references public.cities (id),
  phone text not null,
  email text,
  website text,
  instagram text,
  description text,
  logo_r2_key text,
  -- Channel used by "Send message" (BR-44).
  message_channel public.partner_message_channel not null default 'none',
  message_number text,
  -- From Nominatim, editable by the Operator (ADR-11).
  latitude double precision,
  longitude double precision,
  featured boolean not null default false,
  -- Hidden after this date (BR-40).
  paid_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partners_city_id_type_featured_paid_until_idx
  on public.partners (city_id, type, featured, paid_until);

create trigger partners_set_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

-- partner_hours — structured working hours; a missing weekday means closed.
create table public.partner_hours (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, weekday)
);

create trigger partner_hours_set_updated_at
before update on public.partner_hours
for each row execute function public.set_updated_at();

-- partner_clicks (Partner Click) — quick-action uses (FR-58), written only by
-- rpc:record_partner_click.
create table public.partner_clicks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  action public.partner_click_action not null,
  clicked_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partner_clicks_partner_id_action_idx on public.partner_clicks (partner_id, action);

create trigger partner_clicks_set_updated_at
before update on public.partner_clicks
for each row execute function public.set_updated_at();

-- BR-41: at most 3 featured partners per (city_id, type) → featured_limit_reached.
create function public.partners_check_featured_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  featured_count integer;
begin
  if not new.featured then
    return new;
  end if;

  -- Serialise concurrent featuring in the same city and type.
  perform pg_advisory_xact_lock(hashtext('partners_featured:' || new.city_id::text || ':' || new.type::text));

  select count(*) into featured_count
  from public.partners p
  where p.city_id = new.city_id
    and p.type = new.type
    and p.featured
    and p.id <> new.id;

  if featured_count >= 3 then
    raise exception using errcode = 'P0001', message = 'featured_limit_reached';
  end if;
  return new;
end;
$$;

create trigger partners_check_featured_limit
before insert or update of featured, city_id, type on public.partners
for each row execute function public.partners_check_featured_limit();

revoke execute on function public.partners_check_featured_limit() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.partner_hours enable row level security;
alter table public.partner_clicks enable row level security;

revoke all on table public.partners from anon, authenticated;
revoke all on table public.partner_hours from anon, authenticated;
revoke all on table public.partner_clicks from anon, authenticated;

-- partners: signed-in users read partners whose paid_until has not passed in
-- Europe/Belgrade (BR-40); no client writes (EP-69 uses the service role).
grant select on table public.partners to authenticated;

create policy partners_select_active on public.partners
  for select to authenticated
  using (paid_until >= (now() at time zone 'Europe/Belgrade')::date);

-- partner_hours: readable with a visible partner; no client writes.
grant select on table public.partner_hours to authenticated;

create policy partner_hours_select_active on public.partner_hours
  for select to authenticated
  using (
    exists (
      select 1 from public.partners p
      where p.id = partner_hours.partner_id
        and p.paid_until >= (now() at time zone 'Europe/Belgrade')::date
    )
  );

-- partner_clicks: no client access (no grants, no policies).
