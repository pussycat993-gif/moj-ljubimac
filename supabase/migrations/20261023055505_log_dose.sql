-- Step 15 — rpc:log_dose (EP-11; API §6 DoseLog, Access) and the EP-10 / EP-12 Request rules
-- the schema did not enforce yet, as check constraints on existing treatments and vet_visits
-- columns. The treatment_dose and vet_follow_up reminders are already synced by the Step 08
-- triggers (treatments_sync_reminder, vet_visits_sync_reminder).

-- EP-10 / EP-12 Request rules -------------------------------------------------------------
-- interval_value > 0 and cost_minor >= 0 are already column checks. The clock-dependent rule
-- (visited_on not in the future) is checked by the server action; a check constraint must not
-- depend on the clock.
alter table public.treatments
  add constraint treatments_name_length_check check (char_length(name) between 1 and 100),
  add constraint treatments_dose_length_check check (char_length(dose) <= 60),
  add constraint treatments_interval_pair_check check ((interval_value is null) = (interval_unit is null)),
  add constraint treatments_ends_on_check check (ends_on >= starts_on),
  add constraint treatments_note_length_check check (char_length(note) <= 1000);

alter table public.vet_visits
  add constraint vet_visits_reason_length_check check (char_length(reason) between 1 and 200),
  add constraint vet_visits_clinic_length_check check (char_length(clinic) <= 100),
  add constraint vet_visits_findings_length_check check (char_length(findings) <= 4000),
  add constraint vet_visits_recommendations_length_check check (char_length(recommendations) <= 4000),
  add constraint vet_visits_follow_up_on_check check (follow_up_on > visited_on);

-- The due time of a dose occurrence, when it belongs to the treatment's treatment_dose reminder
-- (EP-11 Request: p_occurrence_id must belong to the treatment's reminder); null otherwise.
-- Security definer: a member who switched household reminders off cannot read the occurrence
-- under RLS, yet may log the dose (BR-22). Only answers for a treatment the caller may read.
create function private.dose_occurrence_due_at(p_occurrence_id uuid, p_treatment_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select o.due_at
  from public.reminder_occurrences o
  join public.reminders r on r.id = o.reminder_id
  where o.id = p_occurrence_id
    and r.type = 'treatment_dose'
    and r.source_id = p_treatment_id
    and private.can_read_pet(private.treatment_pet_id(p_treatment_id));
$$;

-- EP-11 side effect: the occurrence and the other lead-time rows of the same instance
-- (reminder_id + due_at) become done by the caller. No client writes on reminder_occurrences
-- (Step 08), so this runs as definer, scoped to an occurrence the caller just logged a dose for.
create function private.complete_dose_occurrence(p_occurrence_id uuid, p_treatment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminder_occurrences o
  set status = 'done', done_at = now(), done_by = (select auth.uid())
  from public.reminder_occurrences target
  join public.reminders r on r.id = target.reminder_id
  where target.id = p_occurrence_id
    and r.type = 'treatment_dose'
    and r.source_id = p_treatment_id
    and private.can_read_pet(private.treatment_pet_id(p_treatment_id))
    and o.reminder_id = target.reminder_id
    and o.due_at = target.due_at
    and o.status <> 'done';
$$;

-- API §6 DoseLog for one dose_logs row.
create function private.dose_log_json(d public.dose_logs, p_pet_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'treatment_id', d.treatment_id,
    'given_at', d.given_at,
    'occurrence_id', d.occurrence_id,
    'created_by', d.created_by,
    'created_by_name', private.pet_person_name(p_pet_id, d.created_by),
    'access', private.entry_access(private.pet_access(p_pet_id), p_pet_id, d.created_by)
  );
$$;

revoke execute on function private.dose_occurrence_due_at(uuid, uuid) from public, anon;
revoke execute on function private.complete_dose_occurrence(uuid, uuid) from public, anon;
revoke execute on function private.dose_log_json(public.dose_logs, uuid) from public, anon;
grant execute on function private.dose_occurrence_due_at(uuid, uuid) to authenticated, service_role;
grant execute on function private.complete_dose_occurrence(uuid, uuid) to authenticated, service_role;
grant execute on function private.dose_log_json(public.dose_logs, uuid) to authenticated, service_role;

-- rpc:log_dose (EP-11) ------------------------------------------------------------------------
-- Security invoker: RLS on treatments and dose_logs and the health_record_check_write trigger
-- decide who may log (owner, member, organisation team ✅; read-only household →
-- household_read_only; no relation → not_found). An organisation's copy after an accepted
-- transfer → forbidden_role. Idempotent on p_occurrence_id: an existing dose log for the
-- occurrence is returned unchanged.
create function public.log_dose(
  p_treatment_id uuid,
  p_given_at timestamptz default null,
  p_occurrence_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_pet_id uuid;
  v_given_at timestamptz := coalesce(p_given_at, now());
  v_log public.dose_logs;
begin
  if p_treatment_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_treatment_id:required';
  end if;

  select t.pet_id into v_pet_id from public.treatments t where t.id = p_treatment_id;
  if v_pet_id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if private.is_transferred_copy(v_pet_id) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if v_given_at > now() + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_given_at:out_of_range';
  end if;

  if p_occurrence_id is not null then
    select * into v_log from public.dose_logs dl where dl.occurrence_id = p_occurrence_id;
    if found then
      if v_log.treatment_id <> p_treatment_id then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_occurrence_id:invalid';
      end if;
      return private.dose_log_json(v_log, v_pet_id);
    end if;

    if private.dose_occurrence_due_at(p_occurrence_id, p_treatment_id) is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_occurrence_id:invalid';
    end if;
  end if;

  begin
    insert into public.dose_logs (treatment_id, given_at, occurrence_id)
    values (p_treatment_id, v_given_at, p_occurrence_id)
    returning * into v_log;
  exception when unique_violation then
    -- A concurrent call logged the same occurrence first: return that log.
    select * into v_log from public.dose_logs dl where dl.occurrence_id = p_occurrence_id;
    return private.dose_log_json(v_log, v_pet_id);
  end;

  if p_occurrence_id is not null then
    perform private.complete_dose_occurrence(p_occurrence_id, p_treatment_id);
  end if;

  return private.dose_log_json(v_log, v_pet_id);
end;
$$;

revoke execute on function public.log_dose(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.log_dose(uuid, timestamptz, uuid) to authenticated;
