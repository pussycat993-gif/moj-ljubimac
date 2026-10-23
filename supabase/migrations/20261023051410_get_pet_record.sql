-- Step 13 — rpc:get_pet_record(p_pet_id) (EP-02; API §6 PetRecord, Pet, Access, MemorialRecord,
-- ReminderOccurrence, Vaccination, Treatment, DoseLog, VetVisit, Attachment, WeightEntry).
-- Security invoker: RLS on pets and on every record table decides what the caller sees; the
-- computed fields use the helpers of the pet_summaries_api migration.

-- API §6 Pet for one pets row. Raw r2 keys are never returned (API §5.1 Part A).
create function private.pet_json(p public.pets)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'owner_id', p.owner_id,
    'organisation_id', p.organisation_id,
    'name', p.name,
    'species', p.species,
    'species_other', p.species_other,
    'breed', p.breed,
    'sex', p.sex,
    'birth_date', p.birth_date,
    'birth_year', p.birth_year,
    'colour_markings', p.colour_markings,
    'microchip_number', p.microchip_number,
    'passport_number', p.passport_number,
    'neutered', p.neutered,
    'has_photo', p.photo_r2_key is not null,
    'photo_file_name', case
      when p.photo_r2_key is null then null
      else regexp_replace(p.photo_r2_key, '^.*/', '')
    end,
    'vet_name', p.vet_name,
    'vet_phone', p.vet_phone,
    'weight_unit', p.weight_unit,
    'note', p.note,
    'lifecycle', p.lifecycle,
    'shelter_status', p.shelter_status,
    'offspring_status', p.offspring_status,
    'breeding_status', p.breeding_status,
    'litter_id', p.litter_id,
    'price', case
      when p.price_minor is null then null
      else jsonb_build_object('amount_minor', p.price_minor, 'currency', 'RSD')
    end,
    'public_description', p.public_description,
    'approx_age_text', p.approx_age_text,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  );
$$;

-- Per-entry Access (API §5.1 Part A, BR-23): creator, the pet's owner or the organisation's
-- team may edit and delete; a member's own entries lock while the household is read-only
-- (BR-28 limits members only — the owner keeps writing, Step 06).
create function private.entry_access(p_pet_access jsonb, p_pet_id uuid, p_created_by uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', p_pet_access ->> 'role',
    'can_edit', allowed,
    'can_delete', allowed
  )
  from (
    select case p_pet_access ->> 'role'
      when 'owner' then true
      when 'org_admin' then (p_pet_access ->> 'can_edit')::boolean
      when 'volunteer' then (p_pet_access ->> 'can_edit')::boolean
      when 'member' then p_created_by = (select auth.uid())
        and not private.is_pet_household_read_only(p_pet_id)
      else false
    end as allowed
  ) a;
$$;

revoke execute on function private.pet_json(public.pets) from public, anon;
revoke execute on function private.entry_access(jsonb, uuid, uuid) from public, anon;
grant execute on function private.pet_json(public.pets) to authenticated, service_role;
grant execute on function private.entry_access(jsonb, uuid, uuid) to authenticated, service_role;

create function public.get_pet_record(p_pet_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  pet public.pets;
  v_access jsonb;
  v_today date := (now() at time zone 'Europe/Belgrade')::date;
  v_reason text;
begin
  select * into pet from public.pets p where p.id = p_pet_id;
  v_access := case when found then private.pet_access(p_pet_id) end;
  if v_access is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  v_reason := case
    when (v_access ->> 'role') in ('org_admin', 'volunteer') and private.is_transferred_copy(p_pet_id)
      then 'transferred'
    when (v_access ->> 'role') = 'member' and private.is_pet_household_read_only(p_pet_id)
      then 'household_read_only'
    when (v_access ->> 'role') = 'member'
      then 'household_member'
    else null
  end;

  return jsonb_build_object(
    'pet', private.pet_json(pet),
    'access', v_access,
    'can_log', private.pet_can_log(p_pet_id),
    'read_only_reason', v_reason,
    'owner_name', private.pet_person_name(p_pet_id, pet.owner_id),
    'memorial', (
      select jsonb_build_object(
        'id', mr.id, 'pet_id', mr.pet_id, 'date', mr.date, 'reason', mr.reason,
        'note', mr.note, 'created_at', mr.created_at
      )
      from public.memorial_records mr
      where mr.pet_id = p_pet_id
    ),
    'upcoming_reminders', private.pet_upcoming_reminders(p_pet_id, 3),
    'vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'pet_id', v.pet_id,
        'name', v.name,
        'given_on', v.given_on,
        'next_due_on', v.next_due_on,
        'days_until_due', v.next_due_on - v_today,
        'clinic', v.clinic,
        'batch_number', v.batch_number,
        'note', v.note,
        'created_by', v.created_by,
        'created_at', v.created_at,
        'updated_at', v.updated_at
      ) order by v.given_on desc, v.created_at desc)
      from public.vaccinations v
      where v.pet_id = p_pet_id
    ), '[]'::jsonb),
    'treatments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'pet_id', t.pet_id,
        'type', t.type,
        'name', t.name,
        'dose', t.dose,
        'interval_value', t.interval_value,
        'interval_unit', t.interval_unit,
        'starts_on', t.starts_on,
        'ends_on', t.ends_on,
        'note', t.note,
        'is_active', t.is_active,
        'next_dose_at', nd.due_at,
        'next_dose_occurrence_id', nd.id,
        'recent_doses', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', d.id,
            'treatment_id', d.treatment_id,
            'given_at', d.given_at,
            'occurrence_id', d.occurrence_id,
            'created_by', d.created_by,
            'created_by_name', private.pet_person_name(p_pet_id, d.created_by),
            'access', private.entry_access(v_access, p_pet_id, d.created_by)
          ) order by d.given_at desc, d.id)
          from (
            select * from public.dose_logs dl
            where dl.treatment_id = t.id
            order by dl.given_at desc, dl.id
            limit 4
          ) d
        ), '[]'::jsonb),
        'dose_count', (select count(*)::integer from public.dose_logs dl where dl.treatment_id = t.id),
        'created_by', t.created_by,
        'created_at', t.created_at
      ) order by t.is_active desc, t.starts_on desc, t.created_at desc)
      from (
        select tr.*, tr.starts_on <= v_today and v_today <= coalesce(tr.ends_on, 'infinity'::date) as is_active
        from public.treatments tr
        where tr.pet_id = p_pet_id
      ) t
      left join lateral (
        select o.id, o.due_at
        from public.reminders r
        join public.reminder_occurrences o on o.reminder_id = r.id
        where r.type = 'treatment_dose'
          and r.source_id = t.id
          and o.status in ('pending', 'sent', 'resent')
        order by o.due_at, o.notify_at desc, o.id
        limit 1
      ) nd on true
    ), '[]'::jsonb),
    'vet_visits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vv.id,
        'pet_id', vv.pet_id,
        'visited_on', vv.visited_on,
        'clinic', vv.clinic,
        'reason', vv.reason,
        'findings', vv.findings,
        'recommendations', vv.recommendations,
        'cost', case
          when vv.cost_minor is null then null
          else jsonb_build_object('amount_minor', vv.cost_minor, 'currency', 'RSD')
        end,
        'follow_up_on', vv.follow_up_on,
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'vet_visit_id', a.vet_visit_id,
            'pet_id', a.pet_id,
            'file_name', a.file_name,
            'mime_type', a.mime_type,
            'size_bytes', a.size_bytes,
            'created_by', a.created_by,
            'created_at', a.created_at
          ) order by a.created_at, a.id)
          from public.attachments a
          where a.vet_visit_id = vv.id
        ), '[]'::jsonb),
        'created_by', vv.created_by,
        'created_at', vv.created_at,
        'updated_at', vv.updated_at
      ) order by vv.visited_on desc, vv.created_at desc)
      from public.vet_visits vv
      where vv.pet_id = p_pet_id
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'pet_id', w.pet_id,
        'measured_on', w.measured_on,
        'value', w.value,
        'weight_unit', pet.weight_unit,
        'note', w.note,
        'created_by', w.created_by,
        'created_by_name', private.pet_person_name(p_pet_id, w.created_by),
        'created_at', w.created_at,
        'access', private.entry_access(v_access, p_pet_id, w.created_by)
      ) order by w.measured_on desc, w.created_at desc)
      from public.weight_entries w
      where w.pet_id = p_pet_id
    ), '[]'::jsonb),
    'attachment_count', (select count(*)::integer from public.attachments a where a.pet_id = p_pet_id)
  );
end;
$$;

revoke execute on function public.get_pet_record(uuid) from public, anon;
grant execute on function public.get_pet_record(uuid) to authenticated, service_role;
