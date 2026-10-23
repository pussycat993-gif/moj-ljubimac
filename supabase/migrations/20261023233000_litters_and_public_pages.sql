-- Step 26 — litters and public organisation pages (EPIC-06): rpc:list_litters (EP-61 list), create_litter (the
-- transactional side effects of EP-61 createLitter) and get_public_org_page (the EP-62 read, so that only the public
-- fields of BR-37 leave the database). Offspring status / price changes stay Data API pets updates (EP-61): the
-- Step 09 trigger writes pet_status_history and the Step 24 guard answers breeder_plan_required. Nothing is cached
-- (TC ADR-18): EP-62 reads the current rows on every request. No table, column, enum or constraint change.

-- Helpers ---------------------------------------------------------------------------------------
-- API §6 Litter (father_name: the father's pets.name, else the outside sire; offspring in creation order).
create function private.litter_json(l public.litters)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'mother', jsonb_build_object('pet_id', l.mother_id, 'name', m.name),
    'breed', m.breed,
    'father_id', l.father_id,
    'father_name', coalesce(f.name, l.father_name),
    'father_external', l.father_name is not null,
    'born_on', l.born_on,
    'offspring_count', l.offspring_count,
    'available_count', (
      select count(*) from public.pets p where p.litter_id = l.id and p.offspring_status = 'available'
    ),
    'offspring', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'pet_id', p.id,
        'name', p.name,
        'sex', p.sex,
        'offspring_status', p.offspring_status,
        'price', case when p.price_minor is null then null
                      else jsonb_build_object('amount_minor', p.price_minor, 'currency', 'RSD') end
      ) order by p.created_at, p.id), '[]'::jsonb)
      from public.pets p
      where p.litter_id = l.id
    )
  )
  from public.pets m
  left join public.pets f on f.id = l.father_id
  where m.id = l.mother_id;
$$;

-- Initials of an organisation name: the first letter of its first two words that have letters ("Azil Šapica" → "AŠ").
create function private.name_initials(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(upper(string_agg(left(firsts.w, 1), '' order by firsts.n)), '')
  from (
    select words.w, words.n
    from (
      select regexp_replace(t.word, '[^[:alpha:]]', '', 'g') as w, t.n
      from unnest(regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+')) with ordinality as t (word, n)
    ) words
    where words.w <> ''
    order by words.n
    limit 2
  ) firsts;
$$;

revoke execute on function private.litter_json(public.litters) from public, anon;
revoke execute on function private.name_initials(text) from public, anon;
grant execute on function private.litter_json(public.litters) to authenticated, service_role;
grant execute on function private.name_initials(text) to authenticated, service_role;

-- EP-61 list — list_litters() → { items, eligible_mothers, eligible_fathers, access } ----------------------
-- Admins and Volunteers of a breeder organisation (a shelter → forbidden_role; no organisation → not_found).
-- Security definer with an explicit membership check. items by born_on desc; mothers / fathers = the
-- organisation's female / male non-offspring pets with breeding_status = active. access.can_edit = approved and
-- an active breeder plan (writes need both; reads stay available, BR-10 spirit / E-21); can_delete for Admins.
create function public.list_litters()
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
  if o.type <> 'breeder' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  v_can_edit := o.approval_status = 'approved' and private.breeder_plan_active(o.id);

  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(private.litter_json(l) order by l.born_on desc, l.created_at desc, l.id), '[]'::jsonb)
      from public.litters l
      where l.organisation_id = o.id
    ),
    'eligible_mothers', (
      select coalesce(jsonb_agg(jsonb_build_object('pet_id', p.id, 'name', p.name) order by p.name, p.id), '[]'::jsonb)
      from public.pets p
      where p.organisation_id = o.id and p.sex = 'female' and p.offspring_status is null
        and p.breeding_status = 'active'
    ),
    'eligible_fathers', (
      select coalesce(jsonb_agg(jsonb_build_object('pet_id', p.id, 'name', p.name) order by p.name, p.id), '[]'::jsonb)
      from public.pets p
      where p.organisation_id = o.id and p.sex = 'male' and p.offspring_status is null
        and p.breeding_status = 'active'
    ),
    'access', jsonb_build_object(
      'role', case when mine.role = 'admin' then 'org_admin' else 'volunteer' end,
      'can_edit', v_can_edit,
      'can_delete', v_can_edit and mine.role = 'admin'
    )
  );
end;
$$;

revoke execute on function public.list_litters() from public, anon;
grant execute on function public.list_litters() to authenticated;

-- EP-61 create — create_litter(p_mother_id, p_father_id, p_father_name, p_born_on, p_offspring_count) → uuid ----
-- Owner decision (Step 26): security definer, checks the membership and the breeder plan. One transaction:
-- litters{organisation_id, mother_id, father_id, father_name, born_on, offspring_count} + offspring_count pets
-- {organisation_id, litter_id, name = "Mladunče N", species / breed = the mother's, sex = unknown,
-- birth_date = born_on, offspring_status = available} + one pet_status_history row each (available).
-- Errors: not_found (no organisation), forbidden_role (shelter), organisation_pending_approval,
-- breeder_plan_required, validation_failed (DETAIL '<field>:<code>').
create function public.create_litter(
  p_mother_id uuid,
  p_father_id uuid,
  p_father_name text,
  p_born_on date,
  p_offspring_count integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine public.organisation_memberships;
  o public.organisations;
  mother public.pets;
  v_father_name text := nullif(btrim(coalesce(p_father_name, '')), '');
  v_litter uuid;
  v_pet uuid;
  i integer;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  mine := private.my_organisation_membership();
  if mine.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into o from public.organisations where id = mine.organisation_id;
  if o.type <> 'breeder' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  perform private.assert_organisation_writable(o.id);
  if not private.breeder_plan_active(o.id) then
    raise exception using errcode = 'P0001', message = 'breeder_plan_required';
  end if;

  if p_mother_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'mother_id:required';
  end if;
  select * into mother from public.pets where id = p_mother_id and organisation_id = o.id;
  if mother.id is null or mother.sex <> 'female' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'mother_id:invalid';
  end if;
  if p_father_id is not null and v_father_name is not null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'father_id:invalid';
  end if;
  if p_father_id is not null and not exists (
    select 1 from public.pets f where f.id = p_father_id and f.organisation_id = o.id and f.sex = 'male'
  ) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'father_id:invalid';
  end if;
  if v_father_name is not null and char_length(v_father_name) > 120 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'father_name:too_long';
  end if;
  if p_born_on is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'born_on:required';
  end if;
  if p_born_on > (now() at time zone 'Europe/Belgrade')::date then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'born_on:invalid';
  end if;
  if p_offspring_count is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offspring_count:required';
  end if;
  if p_offspring_count < 1 or p_offspring_count > 20 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offspring_count:out_of_range';
  end if;

  insert into public.litters (organisation_id, mother_id, father_id, father_name, born_on, offspring_count)
  values (o.id, mother.id, p_father_id, v_father_name, p_born_on, p_offspring_count)
  returning id into v_litter;

  for i in 1 .. p_offspring_count loop
    -- clock_timestamp() keeps the creation order (Mladunče 1, 2, …) for Litter.offspring.
    insert into public.pets (
      organisation_id, litter_id, name, species, species_other, breed, sex, birth_date, offspring_status, created_at
    ) values (
      o.id, v_litter, 'Mladunče ' || i, mother.species, mother.species_other, mother.breed, 'unknown', p_born_on,
      'available', clock_timestamp()
    )
    returning id into v_pet;

    insert into public.pet_status_history (pet_id, status, changed_at, changed_by)
    values (v_pet, 'available', now(), me);
  end loop;

  return v_litter;
end;
$$;

revoke execute on function public.create_litter(uuid, uuid, text, date, integer) from public, anon;
grant execute on function public.create_litter(uuid, uuid, text, date, integer) to authenticated;

-- EP-62 — get_public_org_page(p_slug, p_limit, p_offset) → PublicOrgPage ---------------------------------
-- Everyone, Visitor included (owner decision: security definer, granted to anon and authenticated). Only an
-- approved organisation; a breeder also needs an active breeder plan (E-21); otherwise not_found. Animals: shelter
-- shelter_status = available, breeder offspring_status = available, active lifecycle; sort created_at desc. Only
-- the PublicOrgPage / PublicAnimal fields (BR-37) — never the health record (vaccinated is a yes/no). The R2 keys
-- of the logo and photos are added only for the service role (the server builds the presigned URLs from them,
-- API §10); anon and authenticated callers get logo_url / photo_url null and no key.
create function public.get_public_org_page(p_slug text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.organisations;
  v_keys boolean := coalesce((select auth.role()), '') = 'service_role';
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offset:out_of_range';
  end if;

  select * into o from public.organisations where slug = p_slug;
  if o.id is null
     or o.approval_status <> 'approved'
     or (o.type = 'breeder' and not private.breeder_plan_active(o.id)) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  return jsonb_build_object(
    'organisation', jsonb_build_object(
      'name', o.name,
      'type', o.type,
      'slug', o.slug,
      'initials', private.name_initials(o.name),
      'city', private.city_json(o.city_id),
      'description', o.description,
      'phone', o.phone,
      'email', o.email,
      'website', o.website,
      'logo_url', null
    ) || case when v_keys then jsonb_build_object('logo_r2_key', o.logo_r2_key) else '{}'::jsonb end,
    'animals', (
      select coalesce(jsonb_agg(a.j order by a.created_at desc, a.id), '[]'::jsonb)
      from (
        select p.id, p.created_at,
          jsonb_build_object(
            'pet_id', p.id,
            'name', p.name,
            'species', p.species,
            'species_other', p.species_other,
            'breed', p.breed,
            'sex', p.sex,
            'approx_age_text', p.approx_age_text,
            'birth_date', p.birth_date,
            'birth_year', p.birth_year,
            'public_description', p.public_description,
            'neutered', p.neutered,
            'vaccinated', exists (select 1 from public.vaccinations v where v.pet_id = p.id),
            'price', case when o.type = 'breeder' and p.price_minor is not null
                          then jsonb_build_object('amount_minor', p.price_minor, 'currency', 'RSD') end,
            'photo_url', null
          ) || case when v_keys then jsonb_build_object('photo_r2_key', p.photo_r2_key) else '{}'::jsonb end as j
        from public.pets p
        where p.organisation_id = o.id
          and p.lifecycle = 'active'
          and ((o.type = 'shelter' and p.shelter_status = 'available')
               or (o.type = 'breeder' and p.offspring_status = 'available'))
        order by p.created_at desc, p.id
        limit p_limit offset p_offset
      ) a
    ),
    'total', (
      select count(*)
      from public.pets p
      where p.organisation_id = o.id
        and p.lifecycle = 'active'
        and ((o.type = 'shelter' and p.shelter_status = 'available')
             or (o.type = 'breeder' and p.offspring_status = 'available'))
    )
  );
end;
$$;

revoke execute on function public.get_public_org_page(text, integer, integer) from public;
grant execute on function public.get_public_org_page(text, integer, integer) to anon, authenticated, service_role;
