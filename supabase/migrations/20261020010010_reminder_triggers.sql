-- Step 08 — reminder triggers: reminders created and maintained from vaccinations,
-- treatments, vet visits and dates of birth (FR-20, BR-12, FR-05, E-01, EP-04, EP-09,
-- EP-10, EP-12); memorial deactivation (BR-17, EP-06); default reminder preferences on
-- profile creation (BR-48). Personally owned pets only: organisation animals get no
-- automatic reminders (BR-51). reminders.user_id is the pet's owner.
-- Re-enabling reminders on restore from memorial is Step 16.

-- The owner's delivery time for a reminder type (defaults 09:00, BR-48).
create function private.reminder_delivery_time(p_user_id uuid, p_type public.reminder_type)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.delivery_time from public.reminder_preferences p
     where p.user_id = p_user_id and p.type = p_type),
    time '09:00'
  );
$$;

-- BR-49 / EP-10: the first dose is due on the start date at 08:00 Europe/Belgrade; if that
-- moment has passed, at the next full hour after p_now.
create function private.treatment_first_dose_at(p_starts_on date, p_now timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when ((p_starts_on + time '08:00') at time zone 'Europe/Belgrade') > p_now
      then (p_starts_on + time '08:00') at time zone 'Europe/Belgrade'
    else date_trunc('hour', p_now) + interval '1 hour'
  end;
$$;

-- Creates, updates or removes the single reminder of a source record.
--   p_source_id null → the reminder is found by (pet_id, type) (birthday).
--   p_starts_at null → the reminder is removed with its occurrences (FR-05, E-01).
--   A pet without a personal owner (organisation animal) → no reminder (BR-51).
-- active follows the pet's lifecycle (BR-17); the reminders triggers regenerate the
-- occurrences.
create function private.sync_source_reminder(
  p_type public.reminder_type,
  p_source_id uuid,
  p_pet_id uuid,
  p_starts_at timestamptz,
  p_recurrence public.reminder_recurrence,
  p_interval_value integer,
  p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pet record;
  existing_id uuid;
begin
  select p.owner_id, p.lifecycle into pet from public.pets p where p.id = p_pet_id;

  select r.id into existing_id
  from public.reminders r
  where r.type = p_type
    and r.pet_id = p_pet_id
    and r.source_id is not distinct from p_source_id
  limit 1;

  if p_starts_at is null or pet.owner_id is null then
    if existing_id is not null then
      delete from public.reminders r where r.id = existing_id;
    end if;
    return;
  end if;

  if existing_id is null then
    insert into public.reminders (
      user_id, pet_id, type, source_id, starts_at, recurrence, interval_value, ends_at, active
    ) values (
      pet.owner_id, p_pet_id, p_type, p_source_id, p_starts_at, p_recurrence, p_interval_value,
      p_ends_at, pet.lifecycle = 'active'
    );
  else
    update public.reminders r
    set user_id = pet.owner_id,
        starts_at = p_starts_at,
        recurrence = p_recurrence,
        interval_value = p_interval_value,
        ends_at = p_ends_at,
        active = pet.lifecycle = 'active'
    where r.id = existing_id;
  end if;
end;
$$;

-- vaccinations: next_due_on at the owner's vaccination delivery time (EP-09).
create function public.vaccinations_sync_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.reminders r where r.type = 'vaccination' and r.source_id = old.id;
    return null;
  end if;

  select p.owner_id into owner from public.pets p where p.id = new.pet_id;
  perform private.sync_source_reminder(
    'vaccination', new.id, new.pet_id,
    case when new.next_due_on is not null then
      (new.next_due_on + private.reminder_delivery_time(owner, 'vaccination'))
        at time zone 'Europe/Belgrade'
    end,
    'none', null, null
  );
  return null;
end;
$$;

create trigger vaccinations_sync_reminder
after insert or update or delete on public.vaccinations
for each row execute function public.vaccinations_sync_reminder();

-- treatments: one treatment_dose reminder (EP-10). First dose per BR-49, computed when
-- the reminder is created or starts_on changes; hours → hourly_interval, days → daily,
-- with interval_value; no interval → a single dose; ends_at = end of ends_on.
create function public.treatments_sync_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_dose timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from public.reminders r where r.type = 'treatment_dose' and r.source_id = old.id;
    return null;
  end if;

  if tg_op = 'UPDATE' and new.starts_on = old.starts_on then
    select r.starts_at into first_dose
    from public.reminders r
    where r.type = 'treatment_dose' and r.source_id = new.id
    limit 1;
  end if;

  perform private.sync_source_reminder(
    'treatment_dose', new.id, new.pet_id,
    coalesce(first_dose, private.treatment_first_dose_at(new.starts_on, now())),
    case
      when new.interval_value is null or new.interval_unit is null then 'none'
      when new.interval_unit = 'hours' then 'hourly_interval'
      else 'daily'
    end::public.reminder_recurrence,
    case when new.interval_unit is not null then new.interval_value end,
    case when new.ends_on is not null then
      (new.ends_on + time '23:59:59') at time zone 'Europe/Belgrade'
    end
  );
  return null;
end;
$$;

create trigger treatments_sync_reminder
after insert or update or delete on public.treatments
for each row execute function public.treatments_sync_reminder();

-- vet_visits: follow_up_on, exactly as vaccinations (EP-12).
create function public.vet_visits_sync_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.reminders r where r.type = 'vet_follow_up' and r.source_id = old.id;
    return null;
  end if;

  select p.owner_id into owner from public.pets p where p.id = new.pet_id;
  perform private.sync_source_reminder(
    'vet_follow_up', new.id, new.pet_id,
    case when new.follow_up_on is not null then
      (new.follow_up_on + private.reminder_delivery_time(owner, 'vet_follow_up'))
        at time zone 'Europe/Belgrade'
    end,
    'none', null, null
  );
  return null;
end;
$$;

create trigger vet_visits_sync_reminder
after insert or update or delete on public.vet_visits
for each row execute function public.vet_visits_sync_reminder();

-- pets: birth_date → yearly birthday reminder at the owner's birthday delivery time
-- (FR-09, EP-04); changed or cleared accordingly.
create function public.pets_sync_birthday_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_source_reminder(
    'birthday', null, new.id,
    case when new.birth_date is not null then
      (new.birth_date + private.reminder_delivery_time(new.owner_id, 'birthday'))
        at time zone 'Europe/Belgrade'
    end,
    'yearly', null, null
  );
  return null;
end;
$$;

create trigger pets_sync_birthday_reminder_insert
after insert on public.pets
for each row
when (new.birth_date is not null)
execute function public.pets_sync_birthday_reminder();

create trigger pets_sync_birthday_reminder_update
after update of birth_date on public.pets
for each row
when (new.birth_date is distinct from old.birth_date)
execute function public.pets_sync_birthday_reminder();

-- BR-17 / EP-06: a pet becoming memorial deactivates all its reminders and removes their
-- pending occurrences.
create function public.pets_deactivate_memorial_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reminders r set active = false where r.pet_id = new.id and r.active;

  delete from public.reminder_occurrences o
  using public.reminders r
  where o.reminder_id = r.id
    and r.pet_id = new.id
    and o.status = 'pending';
  return null;
end;
$$;

create trigger pets_deactivate_memorial_reminders
after update of lifecycle on public.pets
for each row
when (new.lifecycle = 'memorial' and old.lifecycle is distinct from 'memorial')
execute function public.pets_deactivate_memorial_reminders();

-- BR-48: every new profile gets the six default reminder preference rows.
create function public.profiles_create_reminder_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reminder_preferences (user_id, type, lead_minutes, delivery_time, channels)
  values
    (new.id, 'vaccination', '{10080,0}', '09:00', '{email,push}'),
    (new.id, 'treatment_dose', '{0}', null, '{email,push}'),
    (new.id, 'vet_follow_up', '{1440,0}', '09:00', '{email,push}'),
    (new.id, 'meal', '{0}', null, '{email,push}'),
    (new.id, 'birthday', '{0}', '09:00', '{email,push}'),
    (new.id, 'manual', '{0}', '09:00', '{email,push}')
  on conflict (user_id, type) do nothing;
  return null;
end;
$$;

create trigger profiles_create_reminder_preferences
after insert on public.profiles
for each row execute function public.profiles_create_reminder_preferences();

revoke execute on function private.reminder_delivery_time(uuid, public.reminder_type) from public, anon, authenticated;
revoke execute on function private.treatment_first_dose_at(date, timestamptz) from public, anon, authenticated;
revoke execute on function private.sync_source_reminder(
  public.reminder_type, uuid, uuid, timestamptz, public.reminder_recurrence, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function public.vaccinations_sync_reminder() from public, anon, authenticated;
revoke execute on function public.treatments_sync_reminder() from public, anon, authenticated;
revoke execute on function public.vet_visits_sync_reminder() from public, anon, authenticated;
revoke execute on function public.pets_sync_birthday_reminder() from public, anon, authenticated;
revoke execute on function public.pets_deactivate_memorial_reminders() from public, anon, authenticated;
revoke execute on function public.profiles_create_reminder_preferences() from public, anon, authenticated;
