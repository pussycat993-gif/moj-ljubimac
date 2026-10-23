-- Step 12 — rpc:get_me() (EP-43 get; API §6 Me and Entitlements), the EP-43
-- profiles column grant, and the organisation path of EP-41 complete_registration
-- (Step 05 follow-up: no client insert existed for organisations or for the
-- creator's first admin membership).
-- Me.display_name and Me.marketplace are added by Step 28b (Build Plan §4 invariant 11).

-- rpc:get_me ------------------------------------------------------------------------------
-- Security definer so Entitlements.channels can read app_settings.viber_enabled (Operator-only
-- under RLS); every read is scoped to auth.uid(). Returns null when the caller has no
-- profiles row yet (the client routes to the S15 completion step).
create function public.get_me()
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
    )
  );
end;
$$;

revoke execute on function public.get_me() from public, anon;
grant execute on function public.get_me() to authenticated, service_role;

-- EP-43 update: the column grant limits writable profile columns to these three
-- (display_name joins them in Step 28a/28b).
revoke update on table public.profiles from authenticated;
grant update (full_name, city_id, locale) on table public.profiles to authenticated;

-- EP-41 complete_registration — organisation path ------------------------------------------
-- A shelter/breeder account inserts its one organisation (created_by = itself, type = its
-- account type, no organisation yet); approval_status is set by the BR-32 trigger. The
-- creator's admin membership is added by the trigger below in the same statement.
create function private.can_register_organisation(p_type public.organisation_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.account_type::text = p_type::text
    )
    and not exists (
      select 1 from public.organisation_memberships m where m.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.organisations o where o.created_by = (select auth.uid())
    );
$$;

create function private.add_creator_admin(p_organisation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.organisation_memberships (organisation_id, user_id, role)
  select o.id, o.created_by, 'admin'
  from public.organisations o
  where o.id = p_organisation_id
    and o.created_by = (select auth.uid())
    and not exists (select 1 from public.organisation_memberships m where m.organisation_id = o.id);
$$;

revoke execute on function private.can_register_organisation(public.organisation_type) from public, anon;
revoke execute on function private.add_creator_admin(uuid) from public, anon;
grant execute on function private.can_register_organisation(public.organisation_type) to authenticated, service_role;
grant execute on function private.add_creator_admin(uuid) to authenticated, service_role;

-- Only client inserts (role authenticated) get the automatic admin membership; seeds,
-- tests and System paths insert memberships themselves.
create function public.organisations_add_creator_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    perform private.add_creator_admin(new.id);
  end if;
  return null;
end;
$$;

create trigger organisations_add_creator_admin
after insert on public.organisations
for each row execute function public.organisations_add_creator_admin();

revoke execute on function public.organisations_add_creator_admin() from public, anon, authenticated;

grant insert (id, type, name, slug, city_id, tax_id, registration_note, created_by)
  on table public.organisations to authenticated;

create policy organisations_insert_registration on public.organisations
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_register_organisation(type)
  );
