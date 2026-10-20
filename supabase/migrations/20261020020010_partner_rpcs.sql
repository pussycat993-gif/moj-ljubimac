-- Step 09 — partner RPCs: rpc:partners_nearby (EP-64) and rpc:record_partner_click
-- (EP-66). Distance is computed in SQL without extensions (ADR-11).

-- Great-circle distance in kilometres (haversine, mean Earth radius 6371 km).
create function private.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Initials of a partner name (05- §6 Partner.initials): the words of the quoted part
-- („Dr Vet“) or of the whole name, first letter of each, at most two, upper case.
create function private.partner_initials(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(left(string_agg(left(w, 1), '' order by n), 2))
  from regexp_split_to_table(
    btrim(coalesce(substring(partner_initials.name from '„([^“”"]+)[“”"]'), partner_initials.name)),
    '\s+'
  ) with ordinality as t (w, n)
  where w <> '';
$$;

revoke execute on function private.distance_km(double precision, double precision, double precision, double precision) from public, anon;
revoke execute on function private.partner_initials(text) from public, anon;
grant execute on function private.distance_km(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function private.partner_initials(text) to authenticated, service_role;

-- EP-64 — List partners nearby. Returns Partner[] (05- §6) as a JSON array:
-- only partners with paid_until >= today in Europe/Belgrade (BR-40), in the city
-- p_city_id or else the cities row nearest to the coordinates; featured first (at most
-- 3 per type per city, BR-41), then by distance_km asc — from the coordinates if
-- given, else from the city's coordinates (BR-42). logo_url is null in this list.
-- Security invoker: the partners / partner_hours RLS applies as well.
create function public.partners_nearby(
  p_lat double precision default null,
  p_lng double precision default null,
  p_city_id uuid default null,
  p_type public.partner_type default null,
  p_limit integer default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Belgrade')::date;
  today_isodow smallint := extract(isodow from now() at time zone 'Europe/Belgrade')::smallint;
  v_city_id uuid := p_city_id;
  ref_lat double precision := p_lat;
  ref_lng double precision := p_lng;
  result jsonb;
begin
  if (p_lat is null) <> (p_lng is null) then
    raise exception using
      errcode = 'P0001', message = 'validation_failed',
      detail = case when p_lat is null then 'p_lat:required' else 'p_lng:required' end;
  end if;
  if p_lat is null and p_city_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_city_id:required';
  end if;
  if p_limit is not null and (p_limit < 1 or p_limit > 50) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;

  if v_city_id is null then
    select c.id into v_city_id
    from public.cities c
    order by private.distance_km(p_lat, p_lng, c.latitude, c.longitude)
    limit 1;
  end if;

  if ref_lat is null then
    select c.latitude, c.longitude into ref_lat, ref_lng
    from public.cities c
    where c.id = v_city_id;
  end if;

  with visible as (
    select
      p.*,
      case
        when ref_lat is null or p.latitude is null or p.longitude is null then null
        else round(private.distance_km(ref_lat, ref_lng, p.latitude, p.longitude)::numeric, 1)
      end as distance_km
    from public.partners p
    where p.city_id = v_city_id
      and p.paid_until >= today
      and (p_type is null or p.type = p_type)
  ),
  ranked as (
    select
      v.*,
      v.featured and row_number() over (
        partition by v.type, v.featured
        order by v.distance_km asc nulls last, v.name, v.id
      ) <= 3 as featured_first
    from visible v
  ),
  ordered as (
    select
      r.*,
      row_number() over (
        order by r.featured_first desc, r.distance_km asc nulls last, r.name, r.id
      ) as position
    from ranked r
    order by position
    limit p_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'type', o.type,
        'name', o.name,
        'initials', private.partner_initials(o.name),
        'address', o.address,
        'city', jsonb_build_object(
          'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
          'latitude', c.latitude, 'longitude', c.longitude
        ),
        'phone', o.phone,
        'message_channel', o.message_channel,
        'message_number', o.message_number,
        'email', o.email,
        'website', o.website,
        'instagram', o.instagram,
        'description', o.description,
        'logo_url', null,
        'latitude', o.latitude,
        'longitude', o.longitude,
        'featured', o.featured,
        'paid_until', o.paid_until,
        'active', o.paid_until >= today,
        'distance_km', o.distance_km,
        'hours', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'weekday', h.weekday,
              'opens', to_char(h.opens, 'HH24:MI'),
              'closes', to_char(h.closes, 'HH24:MI')
            )
            order by h.weekday
          )
          from public.partner_hours h
          where h.partner_id = o.id
        ), '[]'::jsonb),
        'today_hours', (
          select jsonb_build_object(
            'weekday', h.weekday,
            'opens', to_char(h.opens, 'HH24:MI'),
            'closes', to_char(h.closes, 'HH24:MI')
          )
          from public.partner_hours h
          where h.partner_id = o.id
            and h.weekday = today_isodow
        )
      )
      order by o.position
    ),
    '[]'::jsonb
  ) into result
  from ordered o
  join public.cities c on c.id = o.city_id;

  return result;
end;
$$;

revoke execute on function public.partners_nearby(double precision, double precision, uuid, public.partner_type, integer) from public, anon;
grant execute on function public.partners_nearby(double precision, double precision, uuid, public.partner_type, integer) to authenticated, service_role;

-- EP-66 — Record partner click. The partner must be visible (paid_until not passed,
-- BR-40) → else not_found; the action needs its data (phone; message_channel <> none
-- and message_number, BR-44; email; website) → else validation_failed. Inserts
-- partner_clicks{partner_id, action, user_id = auth.uid(), clicked_at = now()} (FR-58).
-- Security definer: partner_clicks has no client access.
create function public.record_partner_click(
  p_partner_id uuid,
  p_action public.partner_click_action
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  partner record;
  has_data boolean;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  select p.phone, p.message_channel, p.message_number, p.email, p.website into partner
  from public.partners p
  where p.id = p_partner_id
    and p.paid_until >= (now() at time zone 'Europe/Belgrade')::date;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  has_data := case p_action
    when 'call' then nullif(btrim(partner.phone), '') is not null
    when 'message' then partner.message_channel <> 'none'
                        and nullif(btrim(partner.message_number), '') is not null
    when 'email' then nullif(btrim(partner.email), '') is not null
    when 'website' then nullif(btrim(partner.website), '') is not null
    else false
  end;

  if not coalesce(has_data, false) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_action:invalid';
  end if;

  insert into public.partner_clicks (partner_id, action, user_id, clicked_at)
  values (p_partner_id, p_action, (select auth.uid()), now());
end;
$$;

revoke execute on function public.record_partner_click(uuid, public.partner_click_action) from public, anon;
grant execute on function public.record_partner_click(uuid, public.partner_click_action) to authenticated, service_role;
