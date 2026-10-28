-- Step 28 — Operator admin (S26 /admin): view admin_pending_organisations (EP-68 list),
-- rpc:decide_organisation (EP-68 decide), rpc:admin_list_partners (EP-69 list), rpc:save_partner
-- (EP-69 save: partners upsert + partner_hours replacement in one transaction, old logo key queued),
-- rpc:admin_partner_click_stats (EP-70). EP-71 reads and writes app_settings through its Step 04 RLS.
-- No table, column, enum or constraint changes; the featured ≤ 3 trigger (BR-41) is Step 09's.

-- true when the caller's profile is an Operator (API §4.2).
create function private.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_operator
  );
$$;

revoke execute on function private.is_operator() from public, anon;
grant execute on function private.is_operator() to authenticated, service_role;

-- The Operator, or the service role used by lib/actions/admin.ts after its own explicit
-- profiles.is_operator check (API §3.1). Everyone else → forbidden_role (API §4.4).
create function private.assert_operator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return;
  end if;
  if not private.is_operator() then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
end;
$$;

revoke execute on function private.assert_operator() from public, anon;
grant execute on function private.assert_operator() to authenticated, service_role;

-- PendingOrganisation (05- §6) as JSON.
create function private.pending_organisation_json(p_organisation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'type', o.type,
    'name', o.name,
    'city', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
      'latitude', c.latitude, 'longitude', c.longitude
    ) end,
    'tax_id', o.tax_id,
    'registration_note', o.registration_note,
    'email', o.email,
    'phone', o.phone,
    'contact_full_name', pr.full_name,
    'contact_email', coalesce(pr.email, o.email, ''),
    'approval_status', o.approval_status,
    'rejection_reason', o.rejection_reason,
    'registered_at', o.created_at
  )
  from public.organisations o
  left join public.cities c on c.id = o.city_id
  left join public.profiles pr on pr.id = o.created_by
  where o.id = p_organisation_id;
$$;

revoke execute on function private.pending_organisation_json(uuid) from public, anon, authenticated;
grant execute on function private.pending_organisation_json(uuid) to service_role;

-- EP-68 list — PendingOrganisation rows of organisations still pending (BR-32). The view runs with
-- its owner's rights (security_invoker = false) and filters on the caller being an Operator, so
-- everyone else gets [] (owner decision, Step 28). Order by registered_at (= created_at) asc.
create view public.admin_pending_organisations
with (security_invoker = false)
as
select
  o.id,
  o.type,
  o.name,
  case when c.id is null then null else jsonb_build_object(
    'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
    'latitude', c.latitude, 'longitude', c.longitude
  ) end as city,
  o.tax_id,
  o.registration_note,
  o.email,
  o.phone,
  pr.full_name as contact_full_name,
  coalesce(pr.email, o.email, '') as contact_email,
  o.approval_status,
  o.rejection_reason,
  o.created_at as registered_at
from public.organisations o
left join public.cities c on c.id = o.city_id
left join public.profiles pr on pr.id = o.created_by
where o.approval_status = 'pending'
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.is_operator
  );

revoke all on table public.admin_pending_organisations from public, anon, authenticated;
grant select on table public.admin_pending_organisations to authenticated;

-- EP-68 decide — approve → approved; reject → rejected + rejection_reason. Not pending →
-- already_decided; unknown → not_found. Returns { organisation: PendingOrganisation,
-- creator_locale } so the action can email the creator in their language (Design §9.1).
create function public.decide_organisation(
  p_organisation_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  status public.approval_status;
  reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  locale text;
begin
  perform private.assert_operator();

  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'decision:invalid';
  end if;
  if p_decision = 'approve' and reason is not null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'rejection_reason:invalid';
  end if;
  if char_length(reason) > 500 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'rejection_reason:too_long';
  end if;

  select o.approval_status into status
  from public.organisations o
  where o.id = p_organisation_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'already_decided';
  end if;

  update public.organisations
  set approval_status = case p_decision when 'approve' then 'approved' else 'rejected' end::public.approval_status,
      rejection_reason = case p_decision when 'approve' then null else reason end
  where id = p_organisation_id;

  select pr.locale::text into locale
  from public.organisations o
  join public.profiles pr on pr.id = o.created_by
  where o.id = p_organisation_id;

  return jsonb_build_object(
    'organisation', private.pending_organisation_json(p_organisation_id),
    'creator_locale', locale
  );
end;
$$;

revoke execute on function public.decide_organisation(uuid, text, text) from public, anon;
grant execute on function public.decide_organisation(uuid, text, text) to authenticated, service_role;

-- Partner (05- §6) as JSON for the admin: every partner, hidden ones included; distance_km and
-- today_hours as EP-64/65 compute them without a reference point; logo_url null (the action signs
-- logo_r2_key, then drops it).
create function private.admin_partner_json(p_partner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'type', p.type,
    'name', p.name,
    'initials', private.partner_initials(p.name),
    'address', p.address,
    'city', jsonb_build_object(
      'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
      'latitude', c.latitude, 'longitude', c.longitude
    ),
    'phone', p.phone,
    'message_channel', p.message_channel,
    'message_number', p.message_number,
    'email', p.email,
    'website', p.website,
    'instagram', p.instagram,
    'description', p.description,
    'logo_url', null,
    'logo_r2_key', p.logo_r2_key,
    'latitude', p.latitude,
    'longitude', p.longitude,
    'featured', p.featured,
    'paid_until', p.paid_until,
    'active', p.paid_until >= (now() at time zone 'Europe/Belgrade')::date,
    'distance_km', null,
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
      where h.partner_id = p.id
    ), '[]'::jsonb),
    'today_hours', (
      select jsonb_build_object(
        'weekday', h.weekday,
        'opens', to_char(h.opens, 'HH24:MI'),
        'closes', to_char(h.closes, 'HH24:MI')
      )
      from public.partner_hours h
      where h.partner_id = p.id
        and h.weekday = extract(isodow from now() at time zone 'Europe/Belgrade')::smallint
    ),
    'featured_count', (
      select count(*)::int
      from public.partners f
      where f.city_id = p.city_id and f.type = p.type and f.featured
    )
  )
  from public.partners p
  join public.cities c on c.id = p.city_id
  where p.id = p_partner_id;
$$;

revoke execute on function private.admin_partner_json(uuid) from public, anon, authenticated;
grant execute on function private.admin_partner_json(uuid) to service_role;

-- EP-69 list — { items: (Partner & { featured_count })[], total }, sorted by name, hidden partners
-- included. Operator only (owner decision, Step 28).
create function public.admin_list_partners(
  p_city_id uuid default null,
  p_type public.partner_type default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_total integer;
  v_items jsonb;
begin
  if not private.is_operator() then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offset:out_of_range';
  end if;

  select count(*)::int into v_total
  from public.partners p
  where (p_city_id is null or p.city_id = p_city_id)
    and (p_type is null or p.type = p_type);

  select coalesce(jsonb_agg(private.admin_partner_json(x.id) - 'logo_r2_key' order by x.name, x.id), '[]'::jsonb)
  into v_items
  from (
    select p.id, p.name
    from public.partners p
    where (p_city_id is null or p.city_id = p_city_id)
      and (p_type is null or p.type = p_type)
    order by p.name, p.id
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

revoke execute on function public.admin_list_partners(uuid, public.partner_type, integer, integer) from public, anon;
grant execute on function public.admin_list_partners(uuid, public.partner_type, integer, integer) to authenticated;

-- EP-69 save — creates (p_id null) or updates a partner; on update only the keys present in
-- p_fields change. p_hours (array of { weekday, opens, closes }), when not null, replaces every
-- partner_hours row. A replaced or removed logo_r2_key is queued for the nightly R2 cleanup
-- (EP-52). One transaction; the BR-41 trigger raises featured_limit_reached. Returns the Partner
-- (with logo_r2_key for signing).
create function public.save_partner(
  p_id uuid,
  p_fields jsonb,
  p_hours jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  existing public.partners;
  v_id uuid := p_id;
begin
  perform private.assert_operator();

  if p_id is null then
    insert into public.partners (
      type, name, address, city_id, phone, email, website, instagram, description,
      message_channel, message_number, latitude, longitude, logo_r2_key, featured, paid_until
    ) values (
      (f ->> 'type')::public.partner_type,
      f ->> 'name',
      f ->> 'address',
      (f ->> 'city_id')::uuid,
      f ->> 'phone',
      f ->> 'email',
      f ->> 'website',
      f ->> 'instagram',
      f ->> 'description',
      coalesce((f ->> 'message_channel')::public.partner_message_channel, 'none'),
      f ->> 'message_number',
      (f ->> 'latitude')::double precision,
      (f ->> 'longitude')::double precision,
      f ->> 'logo_r2_key',
      coalesce((f ->> 'featured')::boolean, false),
      (f ->> 'paid_until')::date
    )
    returning id into v_id;
  else
    select * into existing from public.partners where id = p_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'not_found';
    end if;

    update public.partners set
      type = case when f ? 'type' then (f ->> 'type')::public.partner_type else type end,
      name = case when f ? 'name' then f ->> 'name' else name end,
      address = case when f ? 'address' then f ->> 'address' else address end,
      city_id = case when f ? 'city_id' then (f ->> 'city_id')::uuid else city_id end,
      phone = case when f ? 'phone' then f ->> 'phone' else phone end,
      email = case when f ? 'email' then f ->> 'email' else email end,
      website = case when f ? 'website' then f ->> 'website' else website end,
      instagram = case when f ? 'instagram' then f ->> 'instagram' else instagram end,
      description = case when f ? 'description' then f ->> 'description' else description end,
      message_channel = case when f ? 'message_channel'
        then coalesce((f ->> 'message_channel')::public.partner_message_channel, 'none') else message_channel end,
      message_number = case when f ? 'message_number' then f ->> 'message_number' else message_number end,
      latitude = case when f ? 'latitude' then (f ->> 'latitude')::double precision else latitude end,
      longitude = case when f ? 'longitude' then (f ->> 'longitude')::double precision else longitude end,
      logo_r2_key = case when f ? 'logo_r2_key' then f ->> 'logo_r2_key' else logo_r2_key end,
      featured = case when f ? 'featured' then coalesce((f ->> 'featured')::boolean, false) else featured end,
      paid_until = case when f ? 'paid_until' then (f ->> 'paid_until')::date else paid_until end
    where id = p_id;

    if f ? 'logo_r2_key' and existing.logo_r2_key is not null
       and existing.logo_r2_key is distinct from (f ->> 'logo_r2_key') then
      insert into public.r2_deletion_queue (r2_key) values (existing.logo_r2_key)
      on conflict (r2_key) do nothing;
    end if;
  end if;

  if p_hours is not null then
    delete from public.partner_hours where partner_id = v_id;
    insert into public.partner_hours (partner_id, weekday, opens, closes)
    select v_id, (h ->> 'weekday')::smallint, (h ->> 'opens')::time, (h ->> 'closes')::time
    from jsonb_array_elements(p_hours) as h;
  end if;

  return private.admin_partner_json(v_id) - 'featured_count';
end;
$$;

revoke execute on function public.save_partner(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_partner(uuid, jsonb, jsonb) to authenticated, service_role;

-- EP-70 — clicks per partner and action in a Europe/Belgrade calendar month (default: the current
-- one): { period, available_periods (distinct months with clicks, newest first), items:
-- PartnerClickStats[], total }. Sort total desc, then partner name; partners without clicks in the
-- period are omitted. Operator only (owner decision, Step 28).
create function public.admin_partner_click_stats(
  p_period text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(p_period, to_char(now() at time zone 'Europe/Belgrade', 'YYYY-MM'));
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_start timestamp;
  v_items jsonb;
  v_total integer;
  v_periods jsonb;
begin
  if not private.is_operator() then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  if v_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'period:invalid';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offset:out_of_range';
  end if;

  v_start := to_timestamp(v_period || '-01', 'YYYY-MM-DD')::date::timestamp;

  with counted as (
    select
      k.partner_id,
      count(*) filter (where k.action = 'call')::int as call,
      count(*) filter (where k.action = 'message')::int as message,
      count(*) filter (where k.action = 'email')::int as email,
      count(*) filter (where k.action = 'website')::int as website,
      count(*)::int as total
    from public.partner_clicks k
    where (k.clicked_at at time zone 'Europe/Belgrade') >= v_start
      and (k.clicked_at at time zone 'Europe/Belgrade') < v_start + interval '1 month'
    group by k.partner_id
  ),
  stat_rows as (
    select x.*, p.name, p.type, c.name_sr
    from counted x
    join public.partners p on p.id = x.partner_id
    join public.cities c on c.id = p.city_id
  )
  select
    (select count(*)::int from stat_rows),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'partner_id', r.partner_id,
          'partner_name', r.name,
          'partner_type', r.type,
          'city_name_sr', r.name_sr,
          'call', r.call,
          'message', r.message,
          'email', r.email,
          'website', r.website,
          'total', r.total
        )
        order by r.total desc, r.name, r.partner_id
      )
      from (select * from stat_rows order by total desc, name, partner_id limit v_limit offset v_offset) r
    ), '[]'::jsonb)
  into v_total, v_items;

  select coalesce(jsonb_agg(m.period order by m.period desc), '[]'::jsonb)
  into v_periods
  from (
    select distinct to_char(k.clicked_at at time zone 'Europe/Belgrade', 'YYYY-MM') as period
    from public.partner_clicks k
  ) m;

  return jsonb_build_object(
    'period', v_period,
    'available_periods', v_periods,
    'items', v_items,
    'total', v_total
  );
end;
$$;

revoke execute on function public.admin_partner_click_stats(text, integer, integer) from public, anon;
grant execute on function public.admin_partner_click_stats(text, integer, integer) to authenticated;
