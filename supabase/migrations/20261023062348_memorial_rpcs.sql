-- Step 16 — rpc:move_pet_to_memorial (EP-06) and rpc:restore_pet_from_memorial (EP-07); API §6
-- MemorialRecord, Pet. Both are security invoker: RLS on pets and memorial_records, the pets role
-- trigger (pets_check_write: member / organisation lifecycle → forbidden_role) and the Free limit
-- trigger (pets_enforce_free_limits: premium_required:memorials / premium_required:pets, BR-01,
-- BR-03, E-02, E-03) decide who may change the lifecycle. The Step 08 trigger
-- pets_deactivate_memorial_reminders stops the reminders on the way in (BR-17); re-enabling them
-- on the way out is the definer helper below, because clients write only their own manual
-- reminders (Step 08 RLS).
-- Field codes travel in DETAIL '<field>:<code>' (API §7.1 field codes; convention of log_dose).

-- EP-07 side effect: the pet's reminders whose next due time is still in the future become
-- active again; the reminders_generate_occurrences trigger regenerates their occurrences.
--   once (recurrence none): starts_at in the future (vaccination next_due_on, vet follow_up_on,
--     a single treatment dose, a one-off manual reminder);
--   repeating (treatment interval, birthday, monthly manual …) and meal: no end, or the end
--     (treatment ends_on) still in the future.
-- Only for the pet's owner, and only once the pet is active again (BR-17).
create function private.reenable_pet_reminders(p_pet_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminders r
  set active = true
  where r.pet_id = p_pet_id
    and not r.active
    and private.is_pet_owner(p_pet_id)
    and exists (select 1 from public.pets p where p.id = p_pet_id and p.lifecycle = 'active')
    and (
      case
        when r.type = 'meal' then r.ends_at is null or r.ends_at > now()
        when r.recurrence = 'none' then r.starts_at > now()
        else r.ends_at is null or r.ends_at > now()
      end
    );
$$;

revoke execute on function private.reenable_pet_reminders(uuid) from public, anon;
grant execute on function private.reenable_pet_reminders(uuid) to authenticated, service_role;

-- rpc:move_pet_to_memorial (EP-06) ---------------------------------------------------------------
-- Owner only; organisation animals and members → forbidden_role; no relation → not_found.
-- Request rules: date required, not in the future (Europe/Belgrade); note ≤ 1000; the pet must be
-- active (pet_id:invalid_state). Side effects: memorial_records row; pets.lifecycle = memorial;
-- every reminder of the pet inactive and its pending occurrences deleted (trigger, BR-17); the pet
-- no longer counts toward the active-pet limit (BR-03).
create function public.move_pet_to_memorial(
  p_pet_id uuid,
  p_date date,
  p_reason public.memorial_reason default null,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_pet public.pets;
  v_record public.memorial_records;
  v_note text := nullif(btrim(p_note), '');
begin
  if p_pet_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'pet_id:required';
  end if;

  select * into v_pet from public.pets p where p.id = p_pet_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if v_pet.owner_id is distinct from (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if v_pet.lifecycle <> 'active' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'pet_id:invalid_state';
  end if;

  if p_date is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'date:required';
  end if;
  if p_date > (now() at time zone 'Europe/Belgrade')::date then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'date:out_of_range';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'note:too_long';
  end if;

  update public.pets p set lifecycle = 'memorial' where p.id = p_pet_id;

  insert into public.memorial_records (pet_id, date, reason, note)
  values (p_pet_id, p_date, p_reason, v_note)
  on conflict (pet_id) do update
    set date = excluded.date, reason = excluded.reason, note = excluded.note
  returning * into v_record;

  return jsonb_build_object(
    'id', v_record.id,
    'pet_id', v_record.pet_id,
    'date', v_record.date,
    'reason', v_record.reason,
    'note', v_record.note,
    'created_at', v_record.created_at
  );
end;
$$;

revoke execute on function public.move_pet_to_memorial(uuid, date, public.memorial_reason, text) from public, anon;
grant execute on function public.move_pet_to_memorial(uuid, date, public.memorial_reason, text) to authenticated;

-- rpc:restore_pet_from_memorial (EP-07) ----------------------------------------------------------
-- Owner only; organisation animals and members → forbidden_role; no relation → not_found; the pet
-- must be a memorial (pet_id:invalid_state). A Free owner whose active slot is taken →
-- premium_required:pets (limit trigger, E-03). Side effects: memorial_records row deleted;
-- pets.lifecycle = active; with p_reenable_reminders (default true) the reminders still due in the
-- future are active again, with their occurrences. Returns the Pet.
create function public.restore_pet_from_memorial(
  p_pet_id uuid,
  p_reenable_reminders boolean default true
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_pet public.pets;
begin
  if p_pet_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'pet_id:required';
  end if;

  select * into v_pet from public.pets p where p.id = p_pet_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if v_pet.owner_id is distinct from (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if v_pet.lifecycle <> 'memorial' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'pet_id:invalid_state';
  end if;

  update public.pets p set lifecycle = 'active' where p.id = p_pet_id returning * into v_pet;

  delete from public.memorial_records mr where mr.pet_id = p_pet_id;

  if coalesce(p_reenable_reminders, true) then
    perform private.reenable_pet_reminders(p_pet_id);
  end if;

  return private.pet_json(v_pet);
end;
$$;

revoke execute on function public.restore_pet_from_memorial(uuid, boolean) from public, anon;
grant execute on function public.restore_pet_from_memorial(uuid, boolean) to authenticated;
