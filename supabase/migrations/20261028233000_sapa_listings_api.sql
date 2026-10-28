-- Step 28b — Šapa pomoći read API and atomic writes (API v1.3 §5.9): rpc:list_listings (EP-73),
-- rpc:get_listing (EP-74), rpc:list_my_listings (EP-76), rpc:get_donation_info (EP-78),
-- rpc:get_public_profile (EP-79), rpc:save_listing (EP-75, one transaction); rpc:get_me (EP-43) gains
-- display_name and marketplace (MarketplaceStatus); rpc:get_my_organisation (EP-53) gains
-- Organisation.donation. Owner decisions (Step 28b): sapa_author_card and org_has_donation_info are
-- security definer helpers that the invoker reads call; my_listing_moderation reads the actioned report
-- of the caller's own hidden listing (OQ-17 interim mapping b). The donation-column update grant
-- already shipped with Step 28a.
-- OQ-16 (open): active_listing_limit = 3 unless owner Premium or account_type shelter (PRD default).
-- OQ-17 (open): resolved_at = listings.updated_at; no new columns.
-- Internal fields (`*_r2_key`) are returned to the route handlers and actions, which turn them into
-- presigned URLs and drop them; listing_photos.r2_key is already readable under the same RLS.

-- Helpers -----------------------------------------------------------------------------------------
-- private.city_json (Step 25) builds API §6 City.

-- Whole days from today to the expiry date, both in Europe/Belgrade, never below 0 (Listing.days_left).
create function private.listing_days_left(p_expires_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    (p_expires_at at time zone 'Europe/Belgrade')::date - (now() at time zone 'Europe/Belgrade')::date
  );
$$;

-- MarketplaceStatus (API §6) of one user: suspension, the BR-55 counter, need permission (BR-54) and the
-- unread-conversations badge. OQ-16 default: a breeder plan does not lift the limit.
create function private.marketplace_status(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  v_need jsonb;
begin
  select * into me from public.profiles p where p.id = p_user;

  select jsonb_build_object('id', o.id, 'name', o.name) into v_need
  from public.organisation_memberships m
  join public.organisations o on o.id = m.organisation_id
  where m.user_id = p_user and o.type = 'shelter' and o.approval_status = 'approved'
  order by m.created_at, m.id
  limit 1;

  return jsonb_build_object(
    'suspended_at', me.marketplace_suspended_at,
    'active_listings', (
      select count(*)::integer from public.listings l
      where l.author_id = p_user and l.status = 'active' and l.type <> 'need'
    ),
    'active_listing_limit', case
      when public.is_premium(p_user) or me.account_type = 'shelter' then null
      else 3
    end,
    'can_post_need', v_need is not null,
    'need_organisation', v_need,
    'unread_conversations', (
      select count(*)::integer from public.conversations c
      where (c.starter_id = p_user or c.owner_id = p_user)
        and exists (
          select 1 from public.messages msg
          where msg.conversation_id = c.id and msg.sender_id <> p_user and msg.read_at is null
        )
    )
  );
end;
$$;

-- DonationInfo (API §6) of an organisation; payment_purpose only from EP-78.
create function private.donation_info_json(p_org uuid, p_purpose text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organisation_id', o.id,
    'organisation_name', o.name,
    'city', private.city_json(o.city_id),
    'bank_account', o.donation_bank_account,
    'payment_url', o.donation_url,
    'dropoff_address', o.dropoff_address,
    'dropoff_hours', o.dropoff_hours,
    'payment_purpose', p_purpose,
    'has_any', coalesce(
      o.donation_bank_account, o.donation_url, o.dropoff_address, o.dropoff_hours
    ) is not null
  )
  from public.organisations o
  where o.id = p_org;
$$;

revoke execute on function private.listing_days_left(timestamptz) from public;
revoke execute on function private.marketplace_status(uuid) from public, anon;
revoke execute on function private.donation_info_json(uuid, text) from public, anon;
grant execute on function private.listing_days_left(timestamptz) to authenticated, service_role;
grant execute on function private.marketplace_status(uuid) to authenticated, service_role;
grant execute on function private.donation_info_json(uuid, text) to authenticated, service_role;

-- Owner decision (Step 28b): ListingAuthor (API §6) — profiles and organisations are not readable by
-- Visitors, so the card is built here. Shelter needs show the shelter (FR-67 #3). Never email or phone.
create function public.sapa_author_card(p_author uuid, p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_org is not null then
    return (
      select jsonb_build_object(
        'kind', 'shelter',
        'user_id', p_author,
        'display_name', o.name,
        'initials', private.name_initials(o.name),
        'city', private.city_json(o.city_id),
        'member_since', o.created_at,
        'active_listing_count', (
          select count(*)::integer from listings l
          where l.organisation_id = o.id and l.status = 'active' and marketplace_author_ok(l.author_id)
        ),
        'organisation_id', o.id,
        'organisation_slug', o.slug
      )
      from organisations o
      where o.id = p_org
    );
  end if;

  select coalesce(p.display_name, p.full_name) into v_name from profiles p where p.id = p_author;
  return (
    select jsonb_build_object(
      'kind', 'user',
      'user_id', p.id,
      'display_name', v_name,
      'initials', case when v_name is null then null else private.name_initials(v_name) end,
      'city', private.city_json(p.city_id),
      'member_since', p.created_at,
      'active_listing_count', (
        select count(*)::integer from listings l
        where l.author_id = p.id and l.organisation_id is null and l.status = 'active'
          and p.marketplace_suspended_at is null
      ),
      'organisation_id', null,
      'organisation_slug', null
    )
    from profiles p
    where p.id = p_author
  );
end;
$$;

-- Owner decision (Step 28b): the Doniraj flag (Listing.has_donation_info) without exposing the values.
create function public.org_has_donation_info(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(o.donation_bank_account, o.donation_url, o.dropoff_address, o.dropoff_hours) is not null
    from organisations o
    where o.id = p_org
  ), false);
$$;

-- Owner decision (Step 28b; OQ-17 interim mapping b): time and reason of the latest actioned report on
-- the caller's own hidden listing. reports are readable only by the reporter and the Operator.
create function public.my_listing_moderation(p_listing uuid)
returns table (hidden_at timestamptz, reason public.report_reason)
language sql
stable
security definer
set search_path = public
as $$
  select r.handled_at, r.reason
  from reports r
  join listings l on l.id = r.listing_id
  where r.listing_id = p_listing
    and l.author_id = auth.uid()
    and l.status = 'hidden'
    and r.status = 'actioned'
  order by r.handled_at desc nulls last, r.created_at desc
  limit 1;
$$;

revoke all on function public.sapa_author_card(uuid, uuid) from public;
revoke all on function public.org_has_donation_info(uuid) from public;
revoke all on function public.my_listing_moderation(uuid) from public, anon;
grant execute on function public.sapa_author_card(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.org_has_donation_info(uuid) to anon, authenticated, service_role;
grant execute on function public.my_listing_moderation(uuid) to authenticated;

-- ListingSummary (API §6) of one listing row, with the cover photo key for the route to sign.
create function private.listing_summary_json(l public.listings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'type', l.type,
    'title', l.title,
    'category', l.category,
    'species', l.species,
    'city', private.city_json(l.city_id),
    'price', case when l.price_minor is null then null
                  else jsonb_build_object('amount_minor', l.price_minor, 'currency', 'RSD') end,
    'price_negotiable', l.price_negotiable,
    'published_at', l.published_at,
    'photo_count', (select count(*)::integer from public.listing_photos p where p.listing_id = l.id),
    'cover_photo', null,
    'cover_photo_r2_key', (
      select p.r2_key from public.listing_photos p where p.listing_id = l.id order by p.position limit 1
    ),
    'author', jsonb_build_object(
      'kind', case when l.organisation_id is null then 'user' else 'shelter' end,
      'display_name', public.sapa_author_card(l.author_id, l.organisation_id) ->> 'display_name'
    )
  );
$$;

revoke execute on function private.listing_summary_json(public.listings) from public;
grant execute on function private.listing_summary_json(public.listings) to authenticated, service_role;

-- EP-73 — list_listings ------------------------------------------------------------------------------
-- Security invoker: RLS decides visibility, then the public-visibility rule (active, author not
-- suspended) and, with a session, the BR-59 block filter. Every filter ANDs; newest first.
create function public.list_listings(
  p_type text default null,
  p_category text default null,
  p_species text default null,
  p_city_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_type public.listing_type;
  v_category public.listing_category;
  v_species public.listing_species;
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_total integer;
  v_items jsonb;
  v_blocked uuid[] := '{}';
begin
  if nullif(p_type, '') is not null then
    if not p_type = any (enum_range(null::public.listing_type)::text[]) then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'type:invalid';
    end if;
    v_type := p_type::public.listing_type;
  end if;
  if nullif(p_category, '') is not null then
    if not p_category = any (enum_range(null::public.listing_category)::text[]) then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'category:invalid';
    end if;
    v_category := p_category::public.listing_category;
  end if;
  if nullif(p_species, '') is not null then
    if not p_species = any (enum_range(null::public.listing_species)::text[]) then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'species:invalid';
    end if;
    v_species := p_species::public.listing_species;
  end if;
  if p_city_id is not null and not exists (select 1 from public.cities c where c.id = p_city_id) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'city_id:unknown';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offset:out_of_range';
  end if;
  -- BR-59, signed in only (Visitors have no grant on user_blocks).
  if me is not null then
    select coalesce(array_agg(b.blocked_id), '{}') into v_blocked
    from public.user_blocks b where b.blocker_id = me;
  end if;

  with visible as (
    select l.*
    from public.listings l
    where l.status = 'active'
      and public.marketplace_author_ok(l.author_id)
      and (v_type is null or l.type = v_type)
      and (v_category is null or l.category = v_category)
      and (v_species is null or l.species = v_species)
      and (p_city_id is null or l.city_id = p_city_id)
      and not (l.author_id = any (v_blocked))
  ),
  page as (
    select v.* from visible v
    order by v.published_at desc, v.id desc
    limit v_limit offset v_offset
  )
  select
    (select count(*)::integer from visible),
    coalesce(
      -- The ListingSummary of private.listing_summary_json, inlined: Visitors have no access to the
      -- private schema.
      (select jsonb_agg(jsonb_build_object(
        'id', pg.id,
        'type', pg.type,
        'title', pg.title,
        'category', pg.category,
        'species', pg.species,
        'city', (
          select jsonb_build_object(
            'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
            'latitude', c.latitude, 'longitude', c.longitude
          )
          from public.cities c where c.id = pg.city_id
        ),
        'price', case when pg.price_minor is null then null
                      else jsonb_build_object('amount_minor', pg.price_minor, 'currency', 'RSD') end,
        'price_negotiable', pg.price_negotiable,
        'published_at', pg.published_at,
        'photo_count', (select count(*)::integer from public.listing_photos p where p.listing_id = pg.id),
        'cover_photo', null,
        'cover_photo_r2_key', (
          select p.r2_key from public.listing_photos p where p.listing_id = pg.id order by p.position limit 1
        ),
        'author', jsonb_build_object(
          'kind', case when pg.organisation_id is null then 'user' else 'shelter' end,
          'display_name', public.sapa_author_card(pg.author_id, pg.organisation_id) ->> 'display_name'
        )
      ) order by pg.published_at desc, pg.id desc) from page pg),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

revoke all on function public.list_listings(text, text, text, uuid, integer, integer) from public;
grant execute on function public.list_listings(text, text, text, uuid, integer, integer) to anon, authenticated;

-- EP-74 — get_listing ---------------------------------------------------------------------------------
-- Security invoker. Anyone: a publicly visible listing not by a user the caller blocked. The author and
-- the Operator: any status. Everything else → not_found (indistinguishable, FR-62 #3).
create function public.get_listing(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  l public.listings;
  v_operator boolean := false;
  v_is_author boolean;
  v_suspended boolean := false;
  v_blocked boolean := false;
  v_my_conversation uuid;
  v_conversation_count integer;
begin
  select * into l from public.listings x where x.id = p_listing_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  v_is_author := me is not null and l.author_id = me;

  -- Signed-in reads only: Visitors have no grant on the private schema, user_blocks or conversations.
  if me is not null then
    v_operator := private.is_operator();
    select p.marketplace_suspended_at is not null into v_suspended from public.profiles p where p.id = me;
    v_blocked := exists (
      select 1 from public.user_blocks b where b.blocker_id = me and b.blocked_id = l.author_id
    );
  end if;

  if not v_is_author and not v_operator then
    if l.status <> 'active' or not public.marketplace_author_ok(l.author_id) or v_blocked then
      raise exception using errcode = 'P0001', message = 'not_found';
    end if;
  end if;

  if me is not null then
    select c.id into v_my_conversation
    from public.conversations c where c.listing_id = l.id and c.starter_id = me limit 1;
    if v_is_author then
      select count(*)::integer into v_conversation_count
      from public.conversations c where c.listing_id = l.id;
    end if;
  end if;

  return jsonb_build_object(
    'id', l.id,
    'type', l.type,
    'title', l.title,
    'description', l.description,
    'category', l.category,
    'species', l.species,
    -- Visitors have no access to the private schema: city, days_left and file_name are inlined.
    'city', (
      select jsonb_build_object(
        'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
        'latitude', c.latitude, 'longitude', c.longitude
      )
      from public.cities c where c.id = l.city_id
    ),
    'price', case when l.price_minor is null then null
                  else jsonb_build_object('amount_minor', l.price_minor, 'currency', 'RSD') end,
    'price_negotiable', l.price_negotiable,
    'status', l.status,
    'resolved_outcome', l.resolved_outcome,
    'resolved_at', case when l.status = 'resolved' then l.updated_at else null end,
    'published_at', l.published_at,
    'expires_at', l.expires_at,
    'days_left', case when l.status = 'active' then greatest(
      0,
      (l.expires_at at time zone 'Europe/Belgrade')::date - (now() at time zone 'Europe/Belgrade')::date
    ) else null end,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'listing_id', p.listing_id,
        'position', p.position,
        'file_name', regexp_replace(
          regexp_replace(p.r2_key, '^.*/', ''),
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-', ''
        ),
        'url', null,
        'r2_key', p.r2_key
      ) order by p.position)
      from public.listing_photos p
      where p.listing_id = l.id
    ), '[]'::jsonb),
    'author', public.sapa_author_card(l.author_id, l.organisation_id),
    'has_donation_info', l.type = 'need' and public.org_has_donation_info(l.organisation_id),
    'viewer', jsonb_build_object(
      'signed_in', me is not null,
      'is_author', v_is_author,
      'my_conversation_id', v_my_conversation,
      'can_message', me is not null and not v_is_author and l.status = 'active' and not v_suspended,
      'conversation_count', v_conversation_count
    ),
    'created_at', l.created_at,
    'updated_at', l.updated_at
  );
end;
$$;

revoke all on function public.get_listing(uuid) from public;
grant execute on function public.get_listing(uuid) to anon, authenticated;

-- EP-76 — list_my_listings ----------------------------------------------------------------------------
-- Security invoker, the caller's own rows. Groups: active (active + hidden), expired, resolved.
create function public.list_my_listings(
  p_group text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_usage jsonb;
  v_limit_reached boolean;
  v_suspended boolean;
  v_items jsonb;
  v_total integer;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_group is null or p_group not in ('active', 'expired', 'resolved') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_group:invalid';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_offset:out_of_range';
  end if;

  v_usage := private.marketplace_status(me);
  v_suspended := v_usage ->> 'suspended_at' is not null;
  v_limit_reached := v_usage -> 'active_listing_limit' <> 'null'::jsonb
    and (v_usage ->> 'active_listings')::integer >= (v_usage ->> 'active_listing_limit')::integer;

  with mine as (
    select l.*
    from public.listings l
    where l.author_id = me
      and case p_group
            when 'active' then l.status in ('active', 'hidden')
            when 'expired' then l.status = 'expired'
            else l.status = 'resolved'
          end
  ),
  page as (
    select m.*,
      case p_group
        when 'active' then row_number() over (order by m.expires_at asc, m.id)
        when 'expired' then row_number() over (order by m.expires_at desc, m.id)
        else row_number() over (order by m.updated_at desc, m.id)
      end as rn
    from mine m
  ),
  slice as (
    select * from page where rn > v_offset and rn <= v_offset + v_limit
  )
  select
    (select count(*)::integer from mine),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'type', s.type,
        'title', s.title,
        'price', case when s.price_minor is null then null
                      else jsonb_build_object('amount_minor', s.price_minor, 'currency', 'RSD') end,
        'price_negotiable', s.price_negotiable,
        'status', s.status,
        'resolved_outcome', s.resolved_outcome,
        'resolved_at', case when s.status = 'resolved' then s.updated_at else null end,
        'published_at', s.published_at,
        'expires_at', s.expires_at,
        'days_left', case when s.status = 'active' then private.listing_days_left(s.expires_at) else null end,
        'photo_count', (select count(*)::integer from public.listing_photos p where p.listing_id = s.id),
        'cover_photo_id', (
          select p.id from public.listing_photos p where p.listing_id = s.id order by p.position limit 1
        ),
        'conversation_count', (select count(*)::integer from public.conversations c where c.listing_id = s.id),
        'unread_count', (
          select count(*)::integer
          from public.messages msg
          join public.conversations c on c.id = msg.conversation_id
          where c.listing_id = s.id and msg.sender_id <> me and msg.read_at is null
        ),
        'hidden_at', case when s.status = 'hidden' then (select mm.hidden_at from public.my_listing_moderation(s.id) mm) end,
        'hidden_reason', case when s.status = 'hidden' then (select mm.reason from public.my_listing_moderation(s.id) mm) end,
        'can_extend', s.status in ('active', 'expired')
          and not v_suspended
          and (s.status = 'active' or s.type = 'need' or not v_limit_reached)
      ) order by s.rn)
      from slice s
    ), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'counts', jsonb_build_object(
      'active', (select count(*)::integer from public.listings l where l.author_id = me and l.status in ('active', 'hidden')),
      'expired', (select count(*)::integer from public.listings l where l.author_id = me and l.status = 'expired'),
      'resolved', (select count(*)::integer from public.listings l where l.author_id = me and l.status = 'resolved')
    ),
    'usage', v_usage
  );
end;
$$;

revoke all on function public.list_my_listings(text, integer, integer) from public, anon;
grant execute on function public.list_my_listings(text, integer, integer) to authenticated;

-- EP-78 — get_donation_info ---------------------------------------------------------------------------
-- Security definer, signed-in callers only (FR-66 #2). The listing must be a need publicly visible to
-- the caller (not by a user they blocked). No money is collected (BR-58).
create function public.get_donation_info(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  l listings;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select * into l from listings x where x.id = p_listing_id;
  if not found
     or l.status <> 'active'
     or not marketplace_author_ok(l.author_id)
     or exists (select 1 from user_blocks b where b.blocker_id = me and b.blocked_id = l.author_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if l.type <> 'need' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_listing_id:invalid_state';
  end if;
  -- OQ-17 interim mapping c: recipient = organisations.name, purpose = "Donacija — <listing title>".
  return private.donation_info_json(l.organisation_id, 'Donacija — ' || l.title);
end;
$$;

revoke all on function public.get_donation_info(uuid) from public;
revoke execute on function public.get_donation_info(uuid) from anon;
grant execute on function public.get_donation_info(uuid) to authenticated;

-- EP-79 — get_public_profile --------------------------------------------------------------------------
-- Security definer returning only the TC-listed fields (FR-67): never email or phone. Suspended,
-- pending-deletion and unknown users → not_found.
create function public.get_public_profile(
  p_user_id uuid,
  p_limit integer default 18,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p profiles;
  v_name text;
  v_limit integer := coalesce(p_limit, 18);
  v_offset integer := coalesce(p_offset, 0);
  v_blocked boolean := false;
  v_count integer;
  v_items jsonb;
begin
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offset:out_of_range';
  end if;

  select * into p from profiles x where x.id = p_user_id;
  if not found or p.marketplace_suspended_at is not null or p.deletion_requested_at is not null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if me is not null then
    v_blocked := exists (select 1 from user_blocks b where b.blocker_id = me and b.blocked_id = p.id);
  end if;
  v_name := coalesce(p.display_name, p.full_name);

  select count(*)::integer into v_count
  from listings l
  where l.author_id = p.id and l.organisation_id is null and l.status = 'active';

  if v_blocked then
    v_items := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(private.listing_summary_json(x) order by x.published_at desc, x.id desc), '[]'::jsonb)
    into v_items
    from (
      select l.* from listings l
      where l.author_id = p.id and l.organisation_id is null and l.status = 'active'
      order by l.published_at desc, l.id desc
      limit v_limit offset v_offset
    ) x;
  end if;

  return jsonb_build_object(
    'user_id', p.id,
    'display_name', v_name,
    'initials', case when v_name is null then null else private.name_initials(v_name) end,
    'city', private.city_json(p.city_id),
    'member_since', p.created_at,
    'active_listing_count', v_count,
    'listings', v_items,
    'listings_total', case when v_blocked then 0 else v_count end,
    'viewer', jsonb_build_object(
      'signed_in', me is not null,
      'is_me', me is not null and me = p.id,
      'i_blocked', v_blocked
    )
  );
end;
$$;

revoke all on function public.get_public_profile(uuid, integer, integer) from public;
grant execute on function public.get_public_profile(uuid, integer, integer) to anon, authenticated;

-- EP-75 — save_listing (one transaction) --------------------------------------------------------------
-- Security invoker: the insert / update runs under the listings RLS and triggers (BR-54 … BR-57, BR-60).
-- lib/actions/listings.ts validates and merges the fields; this function writes them and, on update,
-- applies photo_ids (omitted photos deleted with their keys queued, the rest renumbered 1…n).
create function private.reorder_listing_photos(p_listing_id uuid, p_photo_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows public.listing_photos[];
begin
  if not exists (
    select 1 from public.listings l where l.id = p_listing_id and l.author_id = (select auth.uid())
  ) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if coalesce(array_length(p_photo_ids, 1), 0) > 5
     or (select count(distinct x) from unnest(p_photo_ids) x) <> coalesce(array_length(p_photo_ids, 1), 0)
     or exists (
       select 1 from unnest(p_photo_ids) x
       where not exists (select 1 from public.listing_photos p where p.id = x and p.listing_id = p_listing_id)
     ) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'photo_ids:invalid';
  end if;

  -- Omitted photos: deleted; listing_photos_queue_r2_key queues their keys (API §10 item 7).
  delete from public.listing_photos p where p.listing_id = p_listing_id and p.id <> all (p_photo_ids);

  -- Renumber 1…n in the given order. (listing_id, position) is unique and not deferrable, so the kept
  -- rows are re-inserted with their ids and keys; the queue rows their delete trigger wrote are removed.
  if exists (
    select 1 from unnest(p_photo_ids) with ordinality as o (id, n)
    join public.listing_photos p on p.id = o.id
    where p.position <> o.n
  ) then
    select array_agg(p order by o.n) into v_rows
    from unnest(p_photo_ids) with ordinality as o (id, n)
    join public.listing_photos p on p.id = o.id;

    delete from public.listing_photos p where p.listing_id = p_listing_id;
    delete from public.r2_deletion_queue q
    where q.r2_key in (select (v_rows[i]).r2_key from generate_subscripts(v_rows, 1) as i);
    insert into public.listing_photos (id, listing_id, r2_key, position, created_at)
    select (v_rows[i]).id, (v_rows[i]).listing_id, (v_rows[i]).r2_key, i::smallint, (v_rows[i]).created_at
    from generate_subscripts(v_rows, 1) as i
    order by i;
  end if;
end;
$$;

revoke execute on function private.reorder_listing_photos(uuid, uuid[]) from public, anon;
grant execute on function private.reorder_listing_photos(uuid, uuid[]) to authenticated;

create function public.save_listing(
  p_id uuid,
  p_type public.listing_type,
  p_title text,
  p_description text,
  p_category public.listing_category,
  p_species public.listing_species,
  p_city_id uuid,
  p_price_minor integer,
  p_price_negotiable boolean,
  p_organisation_id uuid default null,
  p_photo_ids uuid[] default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  if p_id is null then
    insert into public.listings (
      organisation_id, type, title, description, category, species, city_id, price_minor, price_negotiable
    ) values (
      case when p_type = 'need' then p_organisation_id else null end,
      p_type, p_title, p_description, p_category, p_species, p_city_id, p_price_minor,
      coalesce(p_price_negotiable, false)
    )
    returning id into v_id;
    return v_id;
  end if;

  -- BR-56: published_at and expires_at never change on edit.
  update public.listings l
  set type = p_type,
      title = p_title,
      description = p_description,
      category = p_category,
      species = p_species,
      city_id = p_city_id,
      price_minor = p_price_minor,
      price_negotiable = coalesce(p_price_negotiable, false)
  where l.id = p_id and l.author_id = (select auth.uid())
  returning l.id into v_id;
  if v_id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if p_photo_ids is not null then
    perform private.reorder_listing_photos(v_id, p_photo_ids);
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_listing(uuid, public.listing_type, text, text, public.listing_category,
  public.listing_species, uuid, integer, boolean, uuid, uuid[]) from public, anon;
grant execute on function public.save_listing(uuid, public.listing_type, text, text, public.listing_category,
  public.listing_species, uuid, integer, boolean, uuid, uuid[]) to authenticated;

-- EP-43 — get_me, replaced: the Step 12 body plus display_name and marketplace (Build Plan §4 inv. 11).
create or replace function public.get_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles;
  latest public.subscriptions;
  v_premium boolean;
  v_breeder boolean;
  v_plan text;
  v_active_pets integer;
begin
  if uid is null then
    return null;
  end if;

  select * into me from public.profiles p where p.id = uid;
  if not found then
    return null;
  end if;

  select * into latest
  from public.subscriptions s
  where s.user_id = uid
  order by s.created_at desc, s.current_period_end desc
  limit 1;

  v_premium := public.is_premium(uid);
  v_breeder := exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.plan in ('breeder_monthly', 'breeder_yearly')
      and s.status in ('trialing', 'active', 'cancelled')
      and s.current_period_end > now()
  );
  v_plan := case when v_premium then 'premium' when v_breeder then 'breeder' else 'free' end;

  select count(*)::integer into v_active_pets
  from public.pets pt
  where pt.owner_id = uid and pt.lifecycle = 'active';

  return jsonb_build_object(
    'id', me.id,
    'email', me.email,
    'full_name', me.full_name,
    'display_name', me.display_name,
    'account_type', me.account_type,
    'locale', me.locale,
    'city', (
      select jsonb_build_object(
        'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
        'latitude', c.latitude, 'longitude', c.longitude
      )
      from public.cities c
      where c.id = me.city_id
    ),
    'is_operator', me.is_operator,
    'terms_version', me.terms_version,
    'terms_accepted_at', me.terms_accepted_at,
    'deletion_requested_at', me.deletion_requested_at,
    'deletion_due_at', me.deletion_due_at,
    'deletion_days_left', case
      when me.deletion_due_at is null then null
      else ceil(extract(epoch from (me.deletion_due_at - now())) / 86400)::integer
    end,
    'organisation', (
      select jsonb_build_object(
        'id', o.id, 'name', o.name, 'type', o.type, 'slug', o.slug,
        'role', m.role, 'approval_status', o.approval_status
      )
      from public.organisation_memberships m
      join public.organisations o on o.id = m.organisation_id
      where m.user_id = uid
      order by m.created_at
      limit 1
    ),
    'entitlements', jsonb_build_object(
      'plan', v_plan,
      'premium', v_premium,
      'breeder_plan', v_breeder,
      'subscription_status', latest.status,
      'premium_until', latest.current_period_end,
      'days_left', case
        when latest.id is null or latest.status = 'expired' or latest.current_period_end <= now() then null
        else ceil(extract(epoch from (latest.current_period_end - now())) / 86400)::integer
      end,
      'auto_renew', latest.auto_renew,
      'trial_available', not me.trial_used,
      'limits', jsonb_build_object(
        'active_pets', case when v_premium then null else 1 end,
        'memorials', case when v_premium then null else 2 end,
        'attachments_per_pet', case when v_premium then null else 10 end,
        'moments_per_pet', case when v_premium then null else 5 end,
        'household_members', case when v_premium then 6 else 0 end
      ),
      'channels', to_jsonb(
        array['email', 'push']
        || case when v_premium then array['whatsapp'] else array[]::text[] end
        || case
             when v_premium and coalesce((select s.viber_enabled from public.app_settings s limit 1), false)
               then array['viber']
             else array[]::text[]
           end
      ),
      'pdf_export', v_premium,
      'household_sharing', v_premium,
      'logo_removal', v_premium
    ),
    'usage', jsonb_build_object(
      'active_pets', v_active_pets,
      'memorials', (
        select count(*)::integer from public.pets pt
        where pt.owner_id = uid and pt.lifecycle = 'memorial'
      ),
      'household_members', (
        select 1 + (select count(*)::integer from public.household_memberships hm where hm.household_id = h.id)
        from public.households h
        where h.owner_id = uid
      ),
      'attachments_by_pet', coalesce((
        select jsonb_agg(jsonb_build_object(
          'pet_id', pt.id, 'pet_name', pt.name,
          'count', (select count(*)::integer from public.attachments a where a.pet_id = pt.id)
        ) order by pt.created_at, pt.id)
        from public.pets pt
        where pt.owner_id = uid
      ), '[]'::jsonb),
      'moments_by_pet', coalesce((
        select jsonb_agg(jsonb_build_object(
          'pet_id', pt.id, 'pet_name', pt.name,
          'count', (select count(*)::integer from public.moments mo where mo.pet_id = pt.id)
        ) order by pt.created_at, pt.id)
        from public.pets pt
        where pt.owner_id = uid
      ), '[]'::jsonb),
      'free_slot_pet', case
        when v_premium or v_active_pets < 1 then null
        else (
          select jsonb_build_object('id', pt.id, 'name', pt.name)
          from public.pets pt
          where pt.owner_id = uid and pt.lifecycle = 'active'
          order by pt.created_at, pt.id
          limit 1
        )
      end,
      'whatsapp_connected', exists (
        select 1 from public.user_channels uc
        where uc.user_id = uid and uc.channel = 'whatsapp' and uc.opted_in_at is not null
      )
    ),
    'marketplace', private.marketplace_status(uid)
  );
end;
$$;

-- EP-53 — get_my_organisation, replaced: the Step 24 body plus Organisation.donation (shelters; the
-- function already admits members only). payment_purpose is null here (API §6 DonationInfo).
create or replace function public.get_my_organisation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine public.organisation_memberships;
  o public.organisations;
  v_plan boolean;
  v_can_edit boolean;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  mine := private.my_organisation_membership();
  if mine.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into o from public.organisations where id = mine.organisation_id;

  v_plan := o.type = 'breeder' and private.breeder_plan_active(o.id);
  v_can_edit := o.approval_status = 'approved' and (o.type = 'shelter' or v_plan);

  return jsonb_build_object(
    'organisation', jsonb_build_object(
      'id', o.id,
      'type', o.type,
      'name', o.name,
      'slug', o.slug,
      'public_path', '/o/' || o.slug,
      'city', (
        select jsonb_build_object(
          'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
          'latitude', c.latitude, 'longitude', c.longitude
        )
        from public.cities c where c.id = o.city_id
      ),
      'approval_status', o.approval_status,
      'rejection_reason', o.rejection_reason,
      'tax_id', o.tax_id,
      'registration_note', o.registration_note,
      'description', o.description,
      'phone', o.phone,
      'email', o.email,
      'website', o.website,
      'logo_url', null,
      'logo_r2_key', o.logo_r2_key,
      'donation', case when o.type = 'shelter' then private.donation_info_json(o.id, null) else null end,
      'member_count', (select count(*) from public.organisation_memberships m where m.organisation_id = o.id),
      'member_limit', 20,
      'created_at', o.created_at
    ),
    'team', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'full_name', p.full_name,
        'email', p.email,
        'role', m.role,
        'joined_at', m.created_at,
        'is_me', m.user_id = me
      ) order by (m.role = 'admin') desc, m.created_at, m.id), '[]'::jsonb)
      from public.organisation_memberships m
      join public.profiles p on p.id = m.user_id
      where m.organisation_id = o.id
    ),
    'pending_invitations', case when mine.role = 'admin' then (
      select coalesce(jsonb_agg(private.organisation_invitation_json(i) order by i.created_at desc, i.id), '[]'::jsonb)
      from public.organisation_invitations i
      where i.organisation_id = o.id and i.status = 'pending' and i.expires_at > now()
    ) else '[]'::jsonb end,
    'breeder_plan_active', v_plan,
    'access', jsonb_build_object(
      'role', case when mine.role = 'admin' then 'org_admin' else 'volunteer' end,
      'can_edit', v_can_edit,
      'can_delete', v_can_edit and mine.role = 'admin'
    )
  );
end;
$$;
