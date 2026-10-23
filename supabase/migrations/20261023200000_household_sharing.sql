-- Step 22 — household sharing API (EP-34 … EP-40). The tables, their RLS and triggers are
-- Step 05 / Step 06; this migration adds only:
--   rpc:get_household (EP-34, security definer, the caller's own households only);
--   the EP-38 column grant (re-stated: members update only reminders_enabled on their own row);
--   create_household_invitation (EP-35: creates the household on first use and the invitation in
--     one transaction — there is no client insert on households);
--   get_household_invitation / decide_household_invitation (EP-39 / EP-40: the invitee is not the
--     household owner, so RLS hides the invitation from them; the token hash is the credential, BR-52).
-- Errors follow TC §5.7.1: P0001 '<code>' or '<code>:<detail>'; field errors carry DETAIL
-- '<field>:<code>' (Step 15 convention).

-- EP-38 — members may update only reminders_enabled on their own row (Step 05 policy
-- household_memberships_update_own). Re-stated so this step's contract is in one place.
grant update (reminders_enabled) on table public.household_memberships to authenticated;

-- HouseholdInvitation (API §6) of one row ----------------------------------------------------
create function private.household_invitation_json(i public.household_invitations)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'household_id', i.household_id,
    'kind', case when i.email is null then 'link' else 'email' end,
    'email', i.email,
    'status', case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status::text end,
    'created_at', i.created_at,
    'expires_at', i.expires_at,
    'decided_at', i.decided_at,
    'accepted_by', i.accepted_by
  );
$$;

revoke execute on function private.household_invitation_json(public.household_invitations) from public, anon;
grant execute on function private.household_invitation_json(public.household_invitations) to authenticated, service_role;

-- EP-34 — rpc:get_household(household_id) → { household: Household | null, my_households } ------
create function public.get_household(p_household_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine jsonb;
  target uuid;
  h public.households;
  is_owner boolean;
  result jsonb;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  -- Owned household first, then memberships by joined_at (BR-20: several memberships possible).
  select coalesce(jsonb_agg(x.item order by x.sort_role, x.sort_at), '[]'::jsonb)
  into mine
  from (
    select 0 as sort_role, oh.created_at as sort_at,
      jsonb_build_object(
        'household_id', oh.id, 'name', oh.name,
        'owner_name', (select p.full_name from public.profiles p where p.id = oh.owner_id),
        'my_role', 'owner'
      ) as item
    from public.households oh
    where oh.owner_id = me
    union all
    select 1, m.joined_at,
      jsonb_build_object(
        'household_id', mh.id, 'name', mh.name,
        'owner_name', (select p.full_name from public.profiles p where p.id = mh.owner_id),
        'my_role', 'member'
      )
    from public.household_memberships m
    join public.households mh on mh.id = m.household_id
    where m.user_id = me
  ) x;

  if p_household_id is not null then
    if not exists (select 1 from jsonb_array_elements(mine) e where (e ->> 'household_id')::uuid = p_household_id) then
      raise exception using errcode = 'P0001', message = 'not_found';
    end if;
    target := p_household_id;
  elsif jsonb_array_length(mine) > 0 then
    target := (mine -> 0 ->> 'household_id')::uuid;
  end if;

  if target is null then
    return jsonb_build_object('household', null, 'my_households', mine);
  end if;

  select * into h from public.households where id = target;
  is_owner := h.owner_id = me;

  result := jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'owner_id', h.owner_id,
    'owner_name', (select p.full_name from public.profiles p where p.id = h.owner_id),
    'owner_premium_until', (
      select s.current_period_end
      from public.subscriptions s
      where s.user_id = h.owner_id and s.plan in ('premium_monthly', 'premium_yearly')
      order by s.current_period_end desc, s.created_at desc
      limit 1
    ),
    'read_only', h.read_only,
    'my_role', case when is_owner then 'owner' else 'member' end,
    'my_reminders_enabled', case when is_owner then null else (
      select m.reminders_enabled from public.household_memberships m
      where m.household_id = h.id and m.user_id = me
    ) end,
    'members', (
      select coalesce(jsonb_agg(x.item order by x.sort_role, x.sort_at), '[]'::jsonb)
      from (
        select 0 as sort_role, h.created_at as sort_at,
          jsonb_build_object(
            'user_id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', 'owner',
            'joined_at', h.created_at, 'reminders_enabled', null, 'is_me', p.id = me
          ) as item
        from public.profiles p
        where p.id = h.owner_id
        union all
        select 1, m.joined_at,
          jsonb_build_object(
            'user_id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', 'member',
            'joined_at', m.joined_at, 'reminders_enabled', m.reminders_enabled, 'is_me', p.id = me
          )
        from public.household_memberships m
        join public.profiles p on p.id = m.user_id
        where m.household_id = h.id
      ) x
    ),
    'member_count', 1 + (select count(*) from public.household_memberships m where m.household_id = h.id),
    'member_limit', 6,
    'pets', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'pet_id', pt.id, 'name', pt.name, 'sex', pt.sex, 'species', pt.species, 'breed', pt.breed,
          'lifecycle', pt.lifecycle,
          'shared', exists (select 1 from public.household_pets hp where hp.household_id = h.id and hp.pet_id = pt.id)
        ) order by pt.created_at, pt.name
      ), '[]'::jsonb)
      from public.pets pt
      where pt.owner_id = h.owner_id
        and (is_owner or exists (
          select 1 from public.household_pets hp where hp.household_id = h.id and hp.pet_id = pt.id
        ))
    ),
    'pending_invitations', case when is_owner then (
      select coalesce(jsonb_agg(private.household_invitation_json(i) order by i.created_at desc), '[]'::jsonb)
      from public.household_invitations i
      where i.household_id = h.id and i.status = 'pending' and i.expires_at > now()
    ) else '[]'::jsonb end,
    'access', jsonb_build_object(
      'role', case when is_owner then 'owner' else 'member' end,
      'can_edit', is_owner and not h.read_only,
      'can_delete', false
    )
  );

  return jsonb_build_object('household', result, 'my_households', mine);
end;
$$;

revoke execute on function public.get_household(uuid) from public, anon;
grant execute on function public.get_household(uuid) to authenticated, service_role;

-- EP-35 — create_household_invitation ----------------------------------------------------------
-- The server action (lib/actions/household.ts) checks the session gates, the request shape, the
-- 20-per-day limit and idempotency, picks the invitation id and signs the hh_ token; this function
-- does the database side effects in one transaction and returns, besides the HouseholdInvitation,
-- what the invitation email needs (household name, inviter, shared pets, the recipient's locale when
-- the address belongs to an account).
create function public.create_household_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_email text default null,
  p_household_name text default null
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
  h public.households;
  hh_name text := btrim(coalesce(p_household_name, ''));
  addr text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  inv public.household_invitations;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select * into caller from public.profiles where id = me;
  if caller.id is null or caller.account_type <> 'owner' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  -- BR-19, E-10.
  if not public.is_premium(me) then
    raise exception using errcode = 'P0001', message = 'premium_required:household';
  end if;
  if p_invitation_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'invitation_id:required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'token_hash:invalid';
  end if;
  if addr is not null and (length(addr) > 254 or addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'email:invalid';
  end if;

  select * into h from public.households where owner_id = me for update;
  if h.id is null then
    if hh_name = '' then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'household_name:required';
    end if;
    if char_length(hh_name) > 60 then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'household_name:too_long';
    end if;
    insert into public.households (owner_id, name, read_only) values (me, hh_name, false)
    returning * into h;
  end if;

  -- BR-20, E-11: pending invitations do not reserve a slot.
  if 1 + (select count(*) from public.household_memberships m where m.household_id = h.id) >= 6 then
    raise exception using errcode = 'P0001', message = 'household_full';
  end if;

  if addr is not null then
    if lower(caller.email) = addr or exists (
      select 1 from public.household_memberships m
      join public.profiles p on p.id = m.user_id
      where m.household_id = h.id and lower(p.email) = addr
    ) then
      raise exception using errcode = 'P0001', message = 'already_member';
    end if;
    -- A newer invitation to the same address replaces the pending one.
    update public.household_invitations
    set status = 'expired'
    where household_id = h.id and status = 'pending' and lower(email) = addr;
  end if;

  insert into public.household_invitations (id, household_id, email, token_hash, expires_at, status)
  values (p_invitation_id, h.id, addr, p_token_hash, now() + interval '7 days', 'pending')
  returning * into inv;

  return jsonb_build_object(
    'invitation', private.household_invitation_json(inv),
    'household_name', h.name,
    'inviter_name', caller.full_name,
    'inviter_locale', caller.locale,
    'recipient_locale', (
      select p.locale from public.profiles p where addr is not null and lower(p.email) = addr limit 1
    ),
    'shared_pets', (
      select coalesce(jsonb_agg(pt.name order by pt.created_at, pt.name), '[]'::jsonb)
      from public.household_pets hp
      join public.pets pt on pt.id = hp.pet_id
      where hp.household_id = h.id and pt.lifecycle = 'active'
    )
  );
end;
$$;

revoke execute on function public.create_household_invitation(uuid, text, text, text) from public, anon;
grant execute on function public.create_household_invitation(uuid, text, text, text) to authenticated;

-- EP-39 — get_household_invitation(token_hash) → InvitationView (kind = household) ---------------
-- Visitors get the limited fields; (session) fields are null without a session.
create function public.get_household_invitation(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  inv public.household_invitations;
  h public.households;
  owner_profile public.profiles;
  signed_in boolean := me is not null;
begin
  select * into inv from public.household_invitations where token_hash = p_token_hash;
  if inv.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if inv.status = 'expired' or inv.expires_at < now() then
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;

  select * into h from public.households where id = inv.household_id;
  select * into owner_profile from public.profiles where id = h.owner_id;

  return jsonb_build_object(
    'kind', 'household',
    'status', inv.status,
    'expires_at', inv.expires_at,
    'household_name', h.name,
    'organisation_name', null,
    'organisation_type', null,
    'role', null,
    'inviter_name', owner_profile.full_name,
    'inviter_city', case when signed_in then (
      select jsonb_build_object(
        'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
        'latitude', c.latitude, 'longitude', c.longitude
      )
      from public.cities c where c.id = owner_profile.city_id
    ) end,
    'shared_pets', case when signed_in then (
      select coalesce(jsonb_agg(
        jsonb_build_object('name', pt.name, 'sex', pt.sex, 'species', pt.species, 'breed', pt.breed)
        order by pt.created_at, pt.name
      ), '[]'::jsonb)
      from public.household_pets hp
      join public.pets pt on pt.id = hp.pet_id
      where hp.household_id = h.id and pt.lifecycle = 'active'
    ) end,
    'member_count', case when signed_in then
      1 + (select count(*) from public.household_memberships m where m.household_id = h.id) end,
    'member_limit', case when signed_in then 6 end,
    'is_signed_in', signed_in,
    'already_member', case when signed_in then (
      h.owner_id = me or exists (
        select 1 from public.household_memberships m where m.household_id = h.id and m.user_id = me
      )
    ) end
  );
end;
$$;

revoke execute on function public.get_household_invitation(text) from public;
grant execute on function public.get_household_invitation(text) to anon, authenticated;

-- EP-40 — decide_household_invitation(token_hash, decision) -------------------------------------
create function public.decide_household_invitation(p_token_hash text, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  inv public.household_invitations;
  h public.households;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_decision is null or p_decision not in ('accept', 'decline') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'decision:invalid';
  end if;

  select * into inv from public.household_invitations where token_hash = p_token_hash for update;
  if inv.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if inv.status in ('accepted', 'declined') then
    raise exception using errcode = 'P0001', message = 'invitation_used';
  end if;
  if inv.status = 'expired' or inv.expires_at < now() then
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;

  select * into h from public.households where id = inv.household_id for update;

  if p_decision = 'decline' then
    update public.household_invitations
    set status = 'declined', decided_at = now()
    where id = inv.id;
    return jsonb_build_object('kind', 'household', 'status', 'declined', 'household_id', h.id, 'organisation_id', null);
  end if;

  if h.owner_id = me or exists (
    select 1 from public.household_memberships m where m.household_id = h.id and m.user_id = me
  ) then
    raise exception using errcode = 'P0001', message = 'already_member';
  end if;
  -- BR-28: no one joins while the owner has no Premium.
  if h.read_only or not public.is_premium(h.owner_id) then
    raise exception using errcode = 'P0001', message = 'household_read_only';
  end if;

  -- BR-20: household_memberships_check_size raises household_full at 6.
  insert into public.household_memberships (household_id, user_id, joined_at, reminders_enabled)
  values (h.id, me, now(), false);

  update public.household_invitations
  set status = 'accepted', accepted_by = me, decided_at = now()
  where id = inv.id;

  return jsonb_build_object('kind', 'household', 'status', 'accepted', 'household_id', h.id, 'organisation_id', null);
end;
$$;

revoke execute on function public.decide_household_invitation(text, text) from public, anon;
grant execute on function public.decide_household_invitation(text, text) to authenticated;
