-- Step 24 — organisation workspace (EPIC-06): rpc:get_my_organisation (EP-53), rpc:list_org_animals
-- (EP-54), rpc:create_intake (EP-55), the og_ team-invitation functions (EP-56 invite, EP-39 / EP-40),
-- the organisation write guards (API §5.7 intro: organisation_pending_approval, breeder_plan_required;
-- EP-56 team_full and last_admin; EP-72 field checks) and the organisation-logo queue (EP-13).
-- No table, column, enum or constraint change. The pet_status_history trigger for EP-55 status
-- changes already exists (Step 09, pets_record_status_history), so it is not repeated here.

-- Helpers ---------------------------------------------------------------------------------------
-- Case- and diacritic-insensitive text for FR-59 search (owner decision, Step 24).
create function private.search_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p_value, '')), 'čćšžđáàäéèëíìóòöúùü', 'ccszdaaaeeeiiooouuu');
$$;

-- The caller's organisation membership (earliest joined), as EP-53 / EP-54 use it.
create function private.my_organisation_membership()
returns public.organisation_memberships
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.organisation_memberships m
  where m.user_id = (select auth.uid())
  order by m.created_at, m.id
  limit 1;
$$;

-- API §6 OrganisationInvitation (pending past expires_at is reported expired).
create function private.organisation_invitation_json(inv public.organisation_invitations)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', inv.id,
    'email', inv.email,
    'role', inv.role,
    'status', case when inv.status = 'pending' and inv.expires_at < now() then 'expired' else inv.status::text end,
    'expires_at', inv.expires_at,
    'created_at', inv.created_at
  );
$$;

revoke execute on function private.search_text(text) from public, anon;
revoke execute on function private.my_organisation_membership() from public, anon;
revoke execute on function private.organisation_invitation_json(public.organisation_invitations) from public, anon;
grant execute on function private.search_text(text) to authenticated, service_role;
grant execute on function private.my_organisation_membership() to authenticated, service_role;
grant execute on function private.organisation_invitation_json(public.organisation_invitations) to authenticated, service_role;

-- Organisation write guards ---------------------------------------------------------------------
-- API §4.1 gate 4, §5.7 intro: client writes to organisations, organisation_memberships and
-- organisation_invitations of a pending / rejected organisation → organisation_pending_approval.
-- EP-72: the public-profile fields are checked here as well (validation_failed, DETAIL '<field>:<code>'),
-- and a logo key must come from an EP-13 ticket of this organisation (o/<org_id>/logo-…).
-- Only client sessions (role authenticated) are checked; System paths are unaffected.
create function public.organisation_guard_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org_id uuid;
begin
  if current_user = 'authenticated' then
    if tg_table_name = 'organisations' then
      org_id := old.id;
    elsif tg_op = 'INSERT' then
      org_id := new.organisation_id;
    else
      org_id := old.organisation_id;
    end if;

    if private.is_organisation_member(org_id) then
      perform private.assert_organisation_writable(org_id);
    end if;

    if tg_table_name = 'organisations' then
      if new.description is not null and char_length(new.description) > 1000 then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'description:too_long';
      end if;
      if new.phone is not null and char_length(new.phone) > 30 then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'phone:too_long';
      end if;
      if new.email is not null
         and (char_length(new.email) > 254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'email:invalid';
      end if;
      if new.website is not null and new.website !~ '^https://[^[:space:]]+\.[^[:space:]]+$' then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'website:invalid';
      end if;
      if new.logo_r2_key is distinct from old.logo_r2_key and new.logo_r2_key is not null
         and left(new.logo_r2_key, char_length('o/' || old.id::text || '/logo-')) <> 'o/' || old.id::text || '/logo-' then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'logo_r2_key:invalid';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organisations_guard_write
before update on public.organisations
for each row execute function public.organisation_guard_write();

create trigger organisation_memberships_guard_write
before insert or update or delete on public.organisation_memberships
for each row execute function public.organisation_guard_write();

create trigger organisation_invitations_guard_write
before insert or update or delete on public.organisation_invitations
for each row execute function public.organisation_guard_write();

-- EP-56, BR-34: members + pending invitations already 20 → team_full (every writer).
create function public.organisation_invitations_check_team_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;
  -- Serialise concurrent invitations and joins of the same organisation.
  perform 1 from public.organisations o where o.id = new.organisation_id for update;

  if (select count(*) from public.organisation_memberships m where m.organisation_id = new.organisation_id)
     + (select count(*) from public.organisation_invitations i
        where i.organisation_id = new.organisation_id
          and i.status = 'pending'
          and i.expires_at > now()
          and i.id <> new.id) >= 20 then
    raise exception using errcode = 'P0001', message = 'team_full';
  end if;
  return new;
end;
$$;

create trigger organisation_invitations_check_team_size
before insert on public.organisation_invitations
for each row execute function public.organisation_invitations_check_team_size();

-- EP-56: a role change or removal that would leave the organisation without an admin →
-- validation_failed:last_admin (the action maps it to fields.user_id). Client sessions only, so
-- System paths (account deletion, BR-46 succession in Step 30) are unaffected.
-- Another admin remains besides membership p_membership (locks the organisation row so two
-- concurrent demotions cannot both pass).
create function private.organisation_other_admin_exists(p_organisation_id uuid, p_membership_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organisations o where o.id = p_organisation_id for update;
  return exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = p_organisation_id and m.role = 'admin' and m.id <> p_membership_id
  );
end;
$$;

revoke execute on function private.organisation_other_admin_exists(uuid, uuid) from public, anon;
grant execute on function private.organisation_other_admin_exists(uuid, uuid) to authenticated, service_role;

create function public.organisation_memberships_check_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not private.organisation_other_admin_exists(old.organisation_id, old.id) then
      raise exception using errcode = 'P0001', message = 'validation_failed:last_admin', detail = 'user_id:last_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organisation_memberships_check_last_admin
before update of role or delete on public.organisation_memberships
for each row execute function public.organisation_memberships_check_last_admin();

-- BR-11, E-21: offspring status and price changes of a breeder's animals need an active breeder
-- plan → breeder_plan_required. EP-55: breeding_status is breeder-only (shelter → forbidden_role).
-- Client sessions only.
create function public.pets_check_breeder_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org_type public.organisation_type;
begin
  if current_user = 'authenticated' and new.organisation_id is not null
     and private.is_organisation_member(new.organisation_id) then
    select o.type into org_type from public.organisations o where o.id = new.organisation_id;

    if org_type = 'shelter' and new.breeding_status is distinct from old.breeding_status then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
    if org_type = 'breeder'
       and (new.offspring_status is distinct from old.offspring_status
            or new.price_minor is distinct from old.price_minor)
       and not private.breeder_plan_active(new.organisation_id) then
      raise exception using errcode = 'P0001', message = 'breeder_plan_required';
    end if;
  end if;
  return new;
end;
$$;

create trigger pets_check_breeder_write
before update of offspring_status, price_minor, breeding_status on public.pets
for each row execute function public.pets_check_breeder_write();

-- EP-13 organisation_logo / EP-72: a replaced or removed logo is queued for the nightly R2 cleanup.
create function public.organisations_queue_logo_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.logo_r2_key is not null and old.logo_r2_key is distinct from new.logo_r2_key then
    insert into public.r2_deletion_queue (r2_key)
    values (old.logo_r2_key)
    on conflict (r2_key) do nothing;
  end if;
  return null;
end;
$$;

create trigger organisations_queue_logo_key
after update of logo_r2_key on public.organisations
for each row execute function public.organisations_queue_logo_key();

revoke execute on function public.organisation_guard_write() from public, anon, authenticated;
revoke execute on function public.organisation_invitations_check_team_size() from public, anon, authenticated;
revoke execute on function public.organisation_memberships_check_last_admin() from public, anon, authenticated;
revoke execute on function public.pets_check_breeder_write() from public, anon, authenticated;
revoke execute on function public.organisations_queue_logo_key() from public, anon, authenticated;

-- Column grants (re-stated; Steps 05 / 06 granted them) -----------------------------------------
-- EP-55 status changes and EP-72 profile columns.
grant update (shelter_status, breeding_status) on table public.pets to authenticated;
grant update (description, phone, email, website, logo_r2_key) on table public.organisations to authenticated;

-- EP-53 — get_my_organisation() → { organisation, team, pending_invitations, breeder_plan_active, access }
-- Security definer with an explicit membership check: team names and emails come from profiles,
-- which other members cannot read under RLS. organisation.logo_r2_key is returned for the server
-- action, which turns it into Organisation.logo_url (a presigned GET) and drops the key.
create function public.get_my_organisation()
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
      'donation', null,
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

revoke execute on function public.get_my_organisation() from public, anon;
grant execute on function public.get_my_organisation() to authenticated;

-- EP-54 — list_org_animals(p_q, p_status, p_limit, p_offset) → { items, total, status_counts } --------
create function public.list_org_animals(
  p_q text default null,
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
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
  v_q text := nullif(private.search_text(btrim(coalesce(p_q, ''))), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_statuses text[];
  v_items jsonb;
  v_total integer;
  v_counts jsonb;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  mine := private.my_organisation_membership();
  if mine.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into o from public.organisations where id = mine.organisation_id;

  v_statuses := case o.type
    when 'shelter' then array(select unnest(enum_range(null::public.shelter_status))::text)
    else array(select unnest(enum_range(null::public.offspring_status))::text) || array['breeding_active', 'breeding_retired']
  end;

  if v_status is not null and not (v_status = any (v_statuses)) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_status:invalid';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_offset:out_of_range';
  end if;

  with animals as (
    select
      p.*,
      case
        when p.shelter_status is not null then 'shelter'
        when p.offspring_status is not null then 'offspring'
        when p.breeding_status is not null then 'breeding'
        else case o.type when 'shelter' then 'shelter' else 'breeding' end
      end as kind,
      coalesce(p.shelter_status::text, p.offspring_status::text, p.breeding_status::text) as status_value,
      case
        when p.shelter_status is not null then (select i.intake_on from public.intakes i where i.pet_id = p.id)
        when p.offspring_status is not null then (select l.born_on from public.litters l where l.id = p.litter_id)
      end as since,
      case
        when p.offspring_status is not null then p.offspring_status::text
        when p.breeding_status is not null then 'breeding_' || p.breeding_status::text
        else p.shelter_status::text
      end as filter_key
    from public.pets p
    where p.organisation_id = o.id
  ),
  matching as (
    select a.*
    from animals a
    where (v_q is null or strpos(private.search_text(a.name), v_q) > 0)
      and (v_status is null or a.filter_key = v_status)
  ),
  page as (
    select m.*
    from matching m
    order by
      case when o.type = 'shelter' then m.since end desc nulls last,
      m.created_at desc,
      m.id
    limit v_limit offset v_offset
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
        'pet_id', pg.id,
        'name', pg.name,
        'species', pg.species,
        'species_other', pg.species_other,
        'breed', pg.breed,
        'sex', pg.sex,
        'approx_age_text', pg.approx_age_text,
        'birth_date', pg.birth_date,
        'birth_year', pg.birth_year,
        'status_kind', pg.kind,
        'status', pg.status_value,
        'since_date', pg.since,
        'is_mother', exists (select 1 from public.litters l where l.mother_id = pg.id),
        'lifecycle', pg.lifecycle,
        'transferred', exists (
          select 1 from public.record_transfers t where t.pet_id = pg.id and t.status = 'accepted'
        )
      ) order by
        case when o.type = 'shelter' then pg.since end desc nulls last,
        pg.created_at desc,
        pg.id), '[]'::jsonb)
     from page pg),
    (select count(*)::integer from matching),
    (select jsonb_object_agg(s, (select count(*) from animals a where a.filter_key = s))
     from unnest(v_statuses) as s)
  into v_items, v_total, v_counts;

  return jsonb_build_object('items', v_items, 'total', v_total, 'status_counts', v_counts);
end;
$$;

revoke execute on function public.list_org_animals(text, text, integer, integer) from public, anon;
grant execute on function public.list_org_animals(text, text, integer, integer) to authenticated;

-- EP-55 — create_intake(…) → Intake --------------------------------------------------------------
-- Security invoker: RLS and the Step 06 / Step 09 triggers decide who may write (shelter team;
-- pending organisation → organisation_pending_approval; breeder → forbidden_role). One transaction:
-- the pet, its intake and the first pet_status_history row (the Step 09 trigger records updates only).
create function public.create_intake(
  p_name text,
  p_species text,
  p_species_other text,
  p_sex text,
  p_breed text,
  p_approx_age_text text,
  p_intake_on date,
  p_arrival_type text,
  p_place_found text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine public.organisation_memberships;
  org_type public.organisation_type;
  v_name text := btrim(coalesce(p_name, ''));
  v_species_other text := nullif(btrim(coalesce(p_species_other, '')), '');
  v_breed text := nullif(btrim(coalesce(p_breed, '')), '');
  v_age text := nullif(btrim(coalesce(p_approx_age_text, '')), '');
  v_place text := nullif(btrim(coalesce(p_place_found, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  pet public.pets;
  intake public.intakes;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select m.* into mine
  from public.organisation_memberships m
  where m.user_id = me
  order by m.created_at, m.id
  limit 1;
  if mine.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select o.type into org_type from public.organisations o where o.id = mine.organisation_id;
  perform private.assert_organisation_writable(mine.organisation_id);
  if org_type <> 'shelter' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if v_name = '' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'name:required';
  end if;
  if char_length(v_name) > 80 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'name:too_long';
  end if;
  if p_species is null or not (p_species = any (enum_range(null::public.pet_species)::text[])) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'species:invalid';
  end if;
  if p_species = 'other' and v_species_other is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'species_other:required';
  end if;
  if p_species <> 'other' then
    v_species_other := null;
  end if;
  if v_species_other is not null and char_length(v_species_other) > 60 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'species_other:too_long';
  end if;
  if p_sex is null or p_sex not in ('male', 'female', 'unknown') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'sex:invalid';
  end if;
  if v_breed is not null and char_length(v_breed) > 80 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'breed:too_long';
  end if;
  if v_age is not null and char_length(v_age) > 80 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'approx_age_text:too_long';
  end if;
  if p_intake_on is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'intake_on:required';
  end if;
  if p_intake_on > (now() at time zone 'Europe/Belgrade')::date then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'intake_on:in_future';
  end if;
  if p_arrival_type is null or not (p_arrival_type = any (enum_range(null::public.arrival_type)::text[])) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'arrival_type:invalid';
  end if;
  if v_place is not null and char_length(v_place) > 200 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'place_found:too_long';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'note:too_long';
  end if;

  insert into public.pets (organisation_id, name, species, species_other, sex, breed, approx_age_text, shelter_status)
  values (
    mine.organisation_id, v_name, p_species::public.pet_species, v_species_other, p_sex::public.pet_sex,
    v_breed, v_age, 'intake'
  )
  returning * into pet;

  insert into public.intakes (pet_id, intake_on, arrival_type, place_found, note)
  values (pet.id, p_intake_on, p_arrival_type::public.arrival_type, v_place, v_note)
  returning * into intake;

  insert into public.pet_status_history (pet_id, status)
  values (pet.id, 'intake');

  return jsonb_build_object(
    'pet_id', pet.id,
    'organisation_id', pet.organisation_id,
    'name', pet.name,
    'species', pet.species,
    'species_other', pet.species_other,
    'sex', pet.sex,
    'breed', pet.breed,
    'approx_age_text', pet.approx_age_text,
    'shelter_status', pet.shelter_status,
    'intake_on', intake.intake_on,
    'arrival_type', intake.arrival_type,
    'place_found', intake.place_found,
    'note', intake.note,
    'created_by', intake.created_by,
    'created_at', intake.created_at
  );
end;
$$;

revoke execute on function public.create_intake(text, text, text, text, text, text, date, text, text, text) from public, anon;
grant execute on function public.create_intake(text, text, text, text, text, text, date, text, text, text) to authenticated;

-- EP-56 invite — create_organisation_invitation(id, token_hash, email, role) -----------------------
-- Security definer: one transaction (expire the earlier pending invitation to the same address,
-- insert the new one) and the already_member check reads team members' emails (profiles RLS).
-- The organisation_invitations_check_team_size trigger raises team_full.
create function public.create_organisation_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  caller public.profiles;
  mine public.organisation_memberships;
  o public.organisations;
  addr text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  inv public.organisation_invitations;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select * into caller from public.profiles where id = me;
  mine := private.my_organisation_membership();
  if mine.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- BR-34: only Admins manage the team.
  if mine.role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  perform private.assert_organisation_writable(mine.organisation_id);

  if p_invitation_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'invitation_id:required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'token_hash:invalid';
  end if;
  if addr is null or length(addr) > 254 or addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'email:invalid';
  end if;
  if p_role is null or p_role not in ('admin', 'volunteer') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'role:invalid';
  end if;

  select * into o from public.organisations where id = mine.organisation_id for update;

  if exists (
    select 1 from public.organisation_memberships m
    join public.profiles p on p.id = m.user_id
    where m.organisation_id = o.id and lower(p.email) = addr
  ) then
    raise exception using errcode = 'P0001', message = 'already_member';
  end if;

  -- A newer invitation to the same address replaces the pending one.
  update public.organisation_invitations
  set status = 'expired'
  where organisation_id = o.id and status = 'pending' and lower(email) = addr;

  insert into public.organisation_invitations (id, organisation_id, email, role, token_hash, expires_at, status)
  values (p_invitation_id, o.id, addr, p_role::public.organisation_role, p_token_hash, now() + interval '7 days', 'pending')
  returning * into inv;

  return jsonb_build_object(
    'invitation', private.organisation_invitation_json(inv),
    'organisation_name', o.name,
    'inviter_name', caller.full_name,
    'inviter_locale', caller.locale,
    'recipient_locale', (select p.locale from public.profiles p where lower(p.email) = addr limit 1)
  );
end;
$$;

revoke execute on function public.create_organisation_invitation(uuid, text, text, text) from public, anon;
grant execute on function public.create_organisation_invitation(uuid, text, text, text) to authenticated;

-- EP-39 (og_) — get_organisation_invitation(token_hash) → InvitationView (kind = organisation) ------
-- Visitors get the limited fields; (session) fields are null without a session.
create function public.get_organisation_invitation(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  inv public.organisation_invitations;
  o public.organisations;
  signed_in boolean := me is not null;
begin
  select * into inv from public.organisation_invitations where token_hash = p_token_hash;
  if inv.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if inv.status = 'expired' or inv.expires_at < now() then
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;

  select * into o from public.organisations where id = inv.organisation_id;

  return jsonb_build_object(
    'kind', 'organisation',
    'status', inv.status,
    'expires_at', inv.expires_at,
    'household_name', null,
    'organisation_name', o.name,
    'organisation_type', o.type,
    'role', inv.role,
    'inviter_name', (select p.full_name from public.profiles p where p.id = o.created_by),
    'inviter_city', case when signed_in then (
      select jsonb_build_object(
        'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
        'latitude', c.latitude, 'longitude', c.longitude
      )
      from public.cities c where c.id = o.city_id
    ) end,
    'shared_pets', null,
    'member_count', case when signed_in then
      (select count(*) from public.organisation_memberships m where m.organisation_id = o.id) end,
    'member_limit', case when signed_in then 20 end,
    'is_signed_in', signed_in,
    'already_member', case when signed_in then exists (
      select 1 from public.organisation_memberships m where m.organisation_id = o.id and m.user_id = me
    ) end
  );
end;
$$;

revoke execute on function public.get_organisation_invitation(text) from public;
grant execute on function public.get_organisation_invitation(text) to anon, authenticated;

-- EP-40 (og_) — decide_organisation_invitation(token_hash, decision) ------------------------------
-- Accept inserts organisation_memberships with the invited role; profiles.account_type is not
-- touched (BR-53). organisation_memberships_check_size raises team_full at 20 (BR-34).
create function public.decide_organisation_invitation(p_token_hash text, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  inv public.organisation_invitations;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_decision is null or p_decision not in ('accept', 'decline') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'decision:invalid';
  end if;

  select * into inv from public.organisation_invitations where token_hash = p_token_hash for update;
  if inv.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if inv.status in ('accepted', 'declined') then
    raise exception using errcode = 'P0001', message = 'invitation_used';
  end if;
  if inv.status = 'expired' or inv.expires_at < now() then
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;

  if p_decision = 'decline' then
    update public.organisation_invitations set status = 'declined' where id = inv.id;
    return jsonb_build_object('kind', 'organisation', 'status', 'declined', 'household_id', null,
      'organisation_id', inv.organisation_id);
  end if;

  if exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = inv.organisation_id and m.user_id = me
  ) then
    raise exception using errcode = 'P0001', message = 'already_member';
  end if;

  insert into public.organisation_memberships (organisation_id, user_id, role)
  values (inv.organisation_id, me, inv.role);

  update public.organisation_invitations
  set status = 'accepted', accepted_by = me
  where id = inv.id;

  return jsonb_build_object('kind', 'organisation', 'status', 'accepted', 'household_id', null,
    'organisation_id', inv.organisation_id);
end;
$$;

revoke execute on function public.decide_organisation_invitation(text, text) from public, anon;
grant execute on function public.decide_organisation_invitation(text, text) to authenticated;
