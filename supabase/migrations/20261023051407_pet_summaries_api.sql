-- Step 13 — view:pet_summaries_api (EP-01; API §5.1 Part A, §6 PetSummary, Access,
-- ReminderOccurrence) and the EP-03 / EP-04 Request rules the schema did not enforce yet,
-- as check constraints on existing pets columns. The computed-field helpers here are also
-- used by rpc:get_pet_record (EP-02).

-- EP-03 / EP-04 Request rules -----------------------------------------------------------
-- Time-dependent rules (birth_date not in the future, birth_year ≤ current year) are checked
-- by the server action; a check constraint must not depend on the clock.
alter table public.pets
  add constraint pets_name_length_check check (char_length(name) between 1 and 60),
  add constraint pets_species_other_length_check
    check (species_other is null or char_length(species_other) between 1 and 60),
  add constraint pets_breed_length_check check (char_length(breed) <= 100),
  add constraint pets_colour_markings_length_check check (char_length(colour_markings) <= 100),
  add constraint pets_microchip_number_length_check check (char_length(microchip_number) <= 100),
  add constraint pets_passport_number_length_check check (char_length(passport_number) <= 100),
  add constraint pets_vet_name_length_check check (char_length(vet_name) <= 100),
  add constraint pets_vet_phone_length_check check (char_length(vet_phone) <= 30),
  add constraint pets_note_length_check check (char_length(note) <= 2000),
  add constraint pets_public_description_length_check check (char_length(public_description) <= 1000),
  add constraint pets_approx_age_text_length_check check (char_length(approx_age_text) <= 40),
  add constraint pets_birth_year_check check (birth_year >= 1990),
  add constraint pets_birth_date_xor_year_check check (birth_date is null or birth_year is null);

-- Computed-field helpers (security definer, scoped to auth.uid()) -------------------------

-- The organisation's own copy after an accepted record transfer (EP-02, EP-60): the caller
-- belongs to the organisation that sent the pet away.
create function private.is_transferred_copy(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.record_transfers t
    join public.organisation_memberships m on m.organisation_id = t.from_organisation_id
    where t.pet_id = p_pet_id
      and t.status = 'accepted'
      and m.user_id = (select auth.uid())
  );
$$;

-- API §6 Access on a pet: role, can_edit, can_delete. Null when the caller has no relation.
create function private.pet_access(p_pet_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pet record;
  v_role text;
  transferred boolean;
begin
  select p.owner_id, p.organisation_id into pet from public.pets p where p.id = p_pet_id;
  if not found then
    return null;
  end if;

  if pet.owner_id is not null and pet.owner_id = uid then
    v_role := 'owner';
  elsif pet.owner_id is not null and private.is_pet_household_member(p_pet_id) then
    v_role := 'member';
  elsif pet.organisation_id is not null then
    select case m.role when 'admin' then 'org_admin' else 'volunteer' end into v_role
    from public.organisation_memberships m
    where m.organisation_id = pet.organisation_id and m.user_id = uid;
  end if;

  if v_role is null then
    return null;
  end if;

  transferred := v_role in ('org_admin', 'volunteer') and private.is_transferred_copy(p_pet_id);
  return jsonb_build_object(
    'role', v_role,
    'can_edit', v_role in ('owner', 'org_admin', 'volunteer') and not transferred,
    'can_delete', v_role in ('owner', 'org_admin') and not transferred
  );
end;
$$;

-- PetSummary.can_log / PetRecord.can_log: owner and organisation roles, or a member while a
-- household sharing the pet is not read-only (BR-28); never on a transferred copy.
create function private.pet_can_log(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.pet_access(p_pet_id) ->> 'role'
    when 'owner' then true
    when 'member' then not private.is_pet_household_read_only(p_pet_id)
    when 'org_admin' then not private.is_transferred_copy(p_pet_id)
    when 'volunteer' then not private.is_transferred_copy(p_pet_id)
    else false
  end;
$$;

-- profiles.full_name of a person linked to a pet (its owner, an entry's author), for a caller
-- who may see the pet. profiles RLS is self-only, so owner_name / created_by_name / done_by_name
-- are read here.
create function private.pet_person_name(p_pet_id uuid, p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.full_name
  from public.profiles pr
  where pr.id = p_profile_id
    and private.can_read_pet(p_pet_id);
$$;

-- API §6 ReminderOccurrence for the next open instances of a pet's reminders, as the caller
-- sees them (EP-25 rules: the reminder's own user, or an opted-in household member; active
-- reminders only). Instance = rows sharing (reminder_id, due_at); its final notice is the row
-- with the latest notify_at (API §5.3). Open = not done, final notice pending / sent / resent,
-- due_at ≥ now(). Order due_at asc. Returns a JSON array (PetSummary.next_reminder = element 0,
-- PetRecord.upcoming_reminders = up to 3).
create function private.pet_upcoming_reminders(p_pet_id uuid, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with uid as (
    select (select auth.uid()) as id
  ),
  instances as (
    select
      o.reminder_id,
      o.due_at,
      (array_agg(o.id order by o.notify_at desc, o.id))[1] as final_id,
      array_agg(o.id) as row_ids,
      bool_or(o.status = 'done') as any_done
    from public.reminder_occurrences o
    join public.reminders r on r.id = o.reminder_id
    cross join uid
    where r.pet_id = p_pet_id
      and r.active
      and o.due_at >= now()
      and (r.user_id = uid.id or private.is_pet_reminder_member(r.pet_id))
    group by o.reminder_id, o.due_at
  ),
  open_instances as (
    select i.*, f.status, f.sent_at, r.type, r.title, r.source_id, r.user_id
    from instances i
    join public.reminder_occurrences f on f.id = i.final_id
    join public.reminders r on r.id = i.reminder_id
    where not i.any_done
      and f.status in ('pending', 'sent', 'resent')
    order by i.due_at, i.final_id
    limit p_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.final_id,
      'reminder_id', oi.reminder_id,
      'type', oi.type,
      'title', case oi.type
        when 'manual' then oi.title
        when 'vaccination' then (select v.name from public.vaccinations v where v.id = oi.source_id)
        when 'treatment_dose' then (select t.name from public.treatments t where t.id = oi.source_id)
        when 'vet_follow_up' then (select vv.reason from public.vet_visits vv where vv.id = oi.source_id)
        else null
      end,
      'due_at', oi.due_at,
      'status', oi.status,
      'display_status', case
        when (oi.due_at at time zone 'Europe/Belgrade')::date = (now() at time zone 'Europe/Belgrade')::date
          then 'today'
        else 'soon'
      end,
      'pet_id', p.id,
      'pet_name', p.name,
      'pet_sex', p.sex,
      'pet_species', p.species,
      'channels', case
        when oi.sent_at is not null then (
          select coalesce(jsonb_agg(c.channel order by c.channel), '[]'::jsonb)
          from (
            select distinct d.channel
            from public.reminder_deliveries d
            where d.occurrence_id = any (oi.row_ids)
              and d.recipient_id = (select id from uid)
              and d.status = 'delivered'
          ) c
        )
        else (
          select coalesce(jsonb_agg(c.channel order by c.channel), '[]'::jsonb)
          from unnest(coalesce(
            (
              select rp.channels
              from public.reminder_preferences rp
              where rp.user_id = (select id from uid) and rp.type = oi.type
            ),
            '{email,push}'::public.delivery_channel[]
          )) as c (channel)
          where c.channel in ('email', 'push')
             or (
               oi.user_id = (select id from uid)
               and public.is_premium((select id from uid))
               and (
                 c.channel = 'whatsapp'
                 or (c.channel = 'viber'
                     and coalesce((select s.viber_enabled from public.app_settings s limit 1), false))
               )
             )
        )
      end,
      'sent_at', oi.sent_at,
      'done_at', null,
      'done_by', null,
      'done_by_name', null,
      'is_shared', oi.user_id <> (select id from uid),
      'can_mark_done', oi.user_id = (select id from uid)
        or (oi.user_id <> (select id from uid) and not private.is_pet_household_read_only(p_pet_id))
    )
    order by oi.due_at, oi.final_id
  ), '[]'::jsonb)
  from open_instances oi
  join public.pets p on p.id = p_pet_id;
$$;

revoke execute on function private.is_transferred_copy(uuid) from public, anon;
revoke execute on function private.pet_access(uuid) from public, anon;
revoke execute on function private.pet_can_log(uuid) from public, anon;
revoke execute on function private.pet_person_name(uuid, uuid) from public, anon;
revoke execute on function private.pet_upcoming_reminders(uuid, integer) from public, anon;
grant execute on function private.is_transferred_copy(uuid) to authenticated, service_role;
grant execute on function private.pet_access(uuid) to authenticated, service_role;
grant execute on function private.pet_can_log(uuid) to authenticated, service_role;
grant execute on function private.pet_person_name(uuid, uuid) to authenticated, service_role;
grant execute on function private.pet_upcoming_reminders(uuid, integer) to authenticated, service_role;

-- view:pet_summaries_api (EP-01) --------------------------------------------------------
-- security_invoker: RLS on pets still decides visibility. On top of RLS, EP-01 lists
--   Owner — own pets (active and memorial);
--   Member — pets shared with a household they belong to, active only;
--   OrgAdmin / Volunteer — the organisation's breeding stock (breeding_status = active).
-- Order (lifecycle asc, name asc) is requested by the client.
create view public.pet_summaries_api
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.species,
  p.species_other,
  p.breed,
  p.sex,
  p.birth_date,
  p.birth_year,
  p.photo_r2_key is not null as has_photo,
  p.lifecycle,
  p.organisation_id,
  private.pet_person_name(p.id, p.owner_id) as owner_name,
  p.vet_name,
  (select count(*)::integer from public.attachments a where a.pet_id = p.id) as attachment_count,
  (select count(*)::integer from public.moments m where m.pet_id = p.id) as moment_count,
  private.pet_upcoming_reminders(p.id, 1) -> 0 as next_reminder,
  (
    select jsonb_build_object(
      'id', mr.id, 'pet_id', mr.pet_id, 'date', mr.date, 'reason', mr.reason,
      'note', mr.note, 'created_at', mr.created_at
    )
    from public.memorial_records mr
    where mr.pet_id = p.id
  ) as memorial,
  private.pet_access(p.id) as access,
  private.pet_can_log(p.id) as can_log
from public.pets p
where p.owner_id = (select auth.uid())
   or (p.owner_id is not null and p.lifecycle = 'active' and private.is_pet_household_member(p.id))
   or (
     p.organisation_id is not null
     and p.breeding_status = 'active'
     and private.is_organisation_member(p.organisation_id)
   );

revoke all on table public.pet_summaries_api from anon, authenticated;
grant select on table public.pet_summaries_api to authenticated;
