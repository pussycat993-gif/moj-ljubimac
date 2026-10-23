-- Step 27 — partner directory: rpc:get_partner (EP-65). The Step 09 functions partners_nearby
-- (EP-64) and record_partner_click (EP-66) pass their Step 27 tests unchanged.

-- EP-65 — Get partner. Returns one Partner (05- §6) as JSON, or raises not_found when the
-- partner is unknown or its paid_until has passed in Europe/Belgrade (BR-40, E-23). distance_km
-- comes from the coordinates if given, else from the p_city_id city's coordinates, else null
-- (BR-42). hours = every partner_hours row by weekday; today_hours = today's ISO weekday row
-- (Europe/Belgrade), null = closed today. logo_url is null here; logo_r2_key is returned for
-- lib/actions/partners.ts getPartner, which signs it (10 min) and drops the key before replying.
-- Security invoker: the partners / partner_hours RLS applies as well.
create function public.get_partner(
  p_partner_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_city_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Belgrade')::date;
  today_isodow smallint := extract(isodow from now() at time zone 'Europe/Belgrade')::smallint;
  ref_lat double precision := p_lat;
  ref_lng double precision := p_lng;
  partner public.partners;
  result jsonb;
begin
  if p_partner_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'partner_id:required';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception using
      errcode = 'P0001', message = 'validation_failed',
      detail = case when p_lat is null then 'lat:required' else 'lng:required' end;
  end if;

  select p.* into partner
  from public.partners p
  where p.id = p_partner_id
    and p.paid_until >= today;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if ref_lat is null and p_city_id is not null then
    select c.latitude, c.longitude into ref_lat, ref_lng
    from public.cities c
    where c.id = p_city_id;
  end if;

  select jsonb_build_object(
    'id', partner.id,
    'type', partner.type,
    'name', partner.name,
    'initials', private.partner_initials(partner.name),
    'address', partner.address,
    'city', jsonb_build_object(
      'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
      'latitude', c.latitude, 'longitude', c.longitude
    ),
    'phone', partner.phone,
    'message_channel', partner.message_channel,
    'message_number', partner.message_number,
    'email', partner.email,
    'website', partner.website,
    'instagram', partner.instagram,
    'description', partner.description,
    'logo_url', null,
    'logo_r2_key', partner.logo_r2_key,
    'latitude', partner.latitude,
    'longitude', partner.longitude,
    'featured', partner.featured,
    'paid_until', partner.paid_until,
    'active', partner.paid_until >= today,
    'distance_km', case
      when ref_lat is null or partner.latitude is null or partner.longitude is null then null
      else round(private.distance_km(ref_lat, ref_lng, partner.latitude, partner.longitude)::numeric, 1)
    end,
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
      where h.partner_id = partner.id
    ), '[]'::jsonb),
    'today_hours', (
      select jsonb_build_object(
        'weekday', h.weekday,
        'opens', to_char(h.opens, 'HH24:MI'),
        'closes', to_char(h.closes, 'HH24:MI')
      )
      from public.partner_hours h
      where h.partner_id = partner.id
        and h.weekday = today_isodow
    )
  ) into result
  from public.cities c
  where c.id = partner.city_id;

  return result;
end;
$$;

revoke execute on function public.get_partner(uuid, double precision, double precision, uuid) from public, anon;
grant execute on function public.get_partner(uuid, double precision, double precision, uuid) to authenticated, service_role;
