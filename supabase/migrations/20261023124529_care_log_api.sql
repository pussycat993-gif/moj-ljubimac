-- Step 20 — view:feeding_entries_api, view:stool_entries_api (EP-17, EP-18; API §5.1 Part A, §6
-- FeedingEntry, StoolEntry, Access), view:meal_schedules_api and rpc:set_meal_schedule (EP-19; §6
-- MealSchedule), and the EP-18 Request rules the schema did not enforce yet, as check constraints on
-- existing feeding_entries and stool_entries columns. The computed fields reuse the helpers of the
-- pet_summaries_api and get_pet_record migrations.

-- EP-18 Request rules -----------------------------------------------------------------------------
-- type / consistency are enums and amount_g > 0 is already a column check (numeric(8, 1) holds one
-- decimal). The clock-dependent rule (fed_at / observed_at not more than 5 min in the future) is
-- checked by the server action; a check constraint must not depend on the clock.
alter table public.feeding_entries
  add constraint feeding_entries_brand_length_check check (char_length(brand) <= 100),
  add constraint feeding_entries_note_length_check check (char_length(note) <= 500);

alter table public.stool_entries
  add constraint stool_entries_note_length_check check (char_length(note) <= 500);

-- view:feeding_entries_api / view:stool_entries_api (EP-17) -----------------------------------------
-- security_invoker: RLS on feeding_entries / stool_entries still decides visibility (the pet's owner
-- and its household members; organisation roles have no relation). Adds created_by_name and the
-- per-entry access (creator or the pet's owner; a member's own entries lock while the household is
-- read-only — BR-23, BR-28).
create view public.feeding_entries_api
with (security_invoker = true)
as
select
  f.id,
  f.pet_id,
  f.fed_at,
  f.type,
  f.brand,
  f.amount_g,
  f.note,
  f.created_by,
  private.pet_person_name(f.pet_id, f.created_by) as created_by_name,
  f.created_at,
  private.entry_access(private.pet_access(f.pet_id), f.pet_id, f.created_by) as access
from public.feeding_entries f;

create view public.stool_entries_api
with (security_invoker = true)
as
select
  s.id,
  s.pet_id,
  s.observed_at,
  s.consistency,
  s.blood_or_mucus,
  s.note,
  s.created_by,
  private.pet_person_name(s.pet_id, s.created_by) as created_by_name,
  s.created_at,
  private.entry_access(private.pet_access(s.pet_id), s.pet_id, s.created_by) as access
from public.stool_entries s;

revoke all on table public.feeding_entries_api from anon, authenticated;
revoke all on table public.stool_entries_api from anon, authenticated;
grant select on table public.feeding_entries_api to authenticated;
grant select on table public.stool_entries_api to authenticated;

-- view:meal_schedules_api (EP-19 get) ---------------------------------------------------------------
-- API §6 MealSchedule of one reminder row: meal_times as "HH:MM" ascending, meal_weekdays ascending
-- (1 = Monday), every_day when all of 1…7 are chosen.
create function private.meal_schedule_json(r public.reminders)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'pet_id', r.pet_id,
    'reminder_id', r.id,
    'meal_times', coalesce(
      (select jsonb_agg(to_char(t, 'HH24:MI') order by t) from unnest(r.meal_times) t), '[]'::jsonb
    ),
    'meal_weekdays', coalesce(
      (select jsonb_agg(d::integer order by d) from unnest(r.meal_weekdays) d), '[]'::jsonb
    ),
    'every_day', coalesce(array[1, 2, 3, 4, 5, 6, 7]::smallint[] <@ r.meal_weekdays, false),
    'active', r.active
  );
$$;

-- The meal reminder of a pet, for a caller who may see the pet's care log (EP-19 get: Owner ✅,
-- Member 👁). reminders RLS shows a member only the reminders they opted into (FR-29), so the row is
-- read here; who may see the pet still comes from RLS on pets in the view below.
create function private.pet_meal_schedule(p_pet_id uuid)
returns table (
  reminder_id uuid,
  meal_times text[],
  meal_weekdays integer[],
  every_day boolean,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    coalesce((select array_agg(to_char(t, 'HH24:MI') order by t) from unnest(r.meal_times) t), '{}'),
    coalesce((select array_agg(d::integer order by d) from unnest(r.meal_weekdays) d), '{}'),
    coalesce(array[1, 2, 3, 4, 5, 6, 7]::smallint[] <@ r.meal_weekdays, false),
    r.active
  from public.reminders r
  where r.pet_id = p_pet_id
    and r.type = 'meal'
    and private.can_access_pet_care(p_pet_id);
$$;

revoke execute on function private.meal_schedule_json(public.reminders) from public, anon;
revoke execute on function private.pet_meal_schedule(uuid) from public, anon;
grant execute on function private.meal_schedule_json(public.reminders) to authenticated, service_role;
grant execute on function private.pet_meal_schedule(uuid) to authenticated, service_role;

-- security_invoker: RLS on pets decides which pets the caller sees; 0 or 1 row per pet.
create view public.meal_schedules_api
with (security_invoker = true)
as
select
  p.id as pet_id,
  m.reminder_id,
  m.meal_times,
  m.meal_weekdays,
  m.every_day,
  m.active
from public.pets p
cross join lateral private.pet_meal_schedule(p.id) m;

revoke all on table public.meal_schedules_api from anon, authenticated;
grant select on table public.meal_schedules_api to authenticated;

-- rpc:set_meal_schedule (EP-19 set) -----------------------------------------------------------------
-- Owner only (pets.owner_id = caller); a household member → forbidden_role; no relation (organisation
-- roles included, care log is personal) → not_found; a memorial pet → p_pet_id:invalid_state (BR-17).
-- Request rules: p_meal_times 0–6 distinct whole-minute times (required, empty removes the schedule);
-- p_meal_weekdays 1–7 distinct values in 1…7 when times are non-empty.
-- Side effects: at most one meal reminder per pet (reminders_one_meal_per_pet). Non-empty times upsert
-- it (type meal, user_id = the owner, active) and the reminders trigger regenerates its future
-- occurrences at the exact times on the chosen days (BR-13, FR-15); empty times delete the reminder
-- and, by cascade, its occurrences. Returns the MealSchedule (reminder_id null and empty arrays after
-- removal).
create function public.set_meal_schedule(
  p_pet_id uuid,
  p_meal_times time[],
  p_meal_weekdays smallint[] default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pet public.pets;
  v_reminder public.reminders;
  v_times time[];
  v_days smallint[];
begin
  if p_pet_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_pet_id:required';
  end if;

  select * into v_pet from public.pets p where p.id = p_pet_id for update;
  if not found or not private.can_access_pet_care(p_pet_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if v_pet.owner_id is distinct from (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if v_pet.lifecycle <> 'active' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_pet_id:invalid_state';
  end if;

  if p_meal_times is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_meal_times:required';
  end if;
  if cardinality(p_meal_times) > 6 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_meal_times:out_of_range';
  end if;
  if array_position(p_meal_times, null) is not null
     or exists (select 1 from unnest(p_meal_times) t where t <> date_trunc('minute', t::interval)::time)
     or (select count(distinct t) from unnest(p_meal_times) t) <> cardinality(p_meal_times) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_meal_times:invalid';
  end if;

  if cardinality(p_meal_times) = 0 then
    delete from public.reminders r where r.pet_id = p_pet_id and r.type = 'meal';
    return jsonb_build_object(
      'pet_id', p_pet_id,
      'reminder_id', null,
      'meal_times', '[]'::jsonb,
      'meal_weekdays', '[]'::jsonb,
      'every_day', false,
      'active', false
    );
  end if;

  if p_meal_weekdays is null or cardinality(p_meal_weekdays) = 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_meal_weekdays:required';
  end if;
  if array_position(p_meal_weekdays, null) is not null
     or not (p_meal_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
     or (select count(distinct d) from unnest(p_meal_weekdays) d) <> cardinality(p_meal_weekdays) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_meal_weekdays:invalid';
  end if;

  select array_agg(t order by t) into v_times from unnest(p_meal_times) t;
  select array_agg(d order by d) into v_days from unnest(p_meal_weekdays) d;

  insert into public.reminders (user_id, pet_id, type, meal_times, meal_weekdays, active)
  values (v_pet.owner_id, p_pet_id, 'meal', v_times, v_days, true)
  on conflict (pet_id) where type = 'meal' do update
    set meal_times = excluded.meal_times,
        meal_weekdays = excluded.meal_weekdays,
        active = true
  returning * into v_reminder;

  return private.meal_schedule_json(v_reminder);
end;
$$;

revoke execute on function public.set_meal_schedule(uuid, time[], smallint[]) from public, anon;
grant execute on function public.set_meal_schedule(uuid, time[], smallint[]) to authenticated;
