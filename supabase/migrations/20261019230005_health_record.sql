-- Step 06 — health record: weight_entries, vaccinations, treatments, dose_logs,
-- vet_visits, attachments (TC §5.3); created_by triggers; BR-50 weight-unit
-- conversion; R2 keys queued on delete (TC §5.9, API §10 step 7); RLS
-- (API §4.4, EP-08 … EP-15).

create type public.treatment_type as enum ('medication', 'deworming', 'flea_tick', 'other');
create type public.treatment_interval_unit as enum ('hours', 'days');

-- weight_entries (Weight Entry) — value stored in the pet's weight_unit.
create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  measured_on date not null,
  value numeric(9, 3) not null check (value > 0),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index weight_entries_pet_id_measured_on_idx on public.weight_entries (pet_id, measured_on);

-- vaccinations (Vaccination)
create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  name text not null,
  given_on date not null,
  next_due_on date,
  clinic text,
  batch_number text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vaccinations_pet_id_given_on_idx on public.vaccinations (pet_id, given_on);

-- treatments (Treatment)
create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  type public.treatment_type not null,
  name text not null,
  dose text,
  interval_value integer check (interval_value > 0),
  interval_unit public.treatment_interval_unit,
  starts_on date not null,
  ends_on date,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- dose_logs (Dose Log). FK occurrence_id → reminder_occurrences is added in Step 08.
create table public.dose_logs (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.treatments (id) on delete cascade,
  given_at timestamptz not null,
  occurrence_id uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- vet_visits (Vet Visit)
create table public.vet_visits (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  visited_on date not null,
  clinic text,
  reason text not null,
  findings text,
  recommendations text,
  cost_minor integer check (cost_minor >= 0),
  follow_up_on date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- attachments (Attachment) — images or PDFs ≤ 10 MB (BR-05); pet_id denormalised from
-- the visit for the per-pet Free limit (BR-01).
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  vet_visit_id uuid not null references public.vet_visits (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  r2_key text not null,
  file_name text,
  mime_type text not null
    check (mime_type like 'image/%' or mime_type = 'application/pdf'),
  size_bytes integer not null check (size_bytes <= 10485760),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index attachments_pet_id_idx on public.attachments (pet_id);

-- updated_at and created_by on every entry table ---------------------------------------
create trigger weight_entries_set_updated_at
before update on public.weight_entries
for each row execute function public.set_updated_at();
create trigger vaccinations_set_updated_at
before update on public.vaccinations
for each row execute function public.set_updated_at();
create trigger treatments_set_updated_at
before update on public.treatments
for each row execute function public.set_updated_at();
create trigger dose_logs_set_updated_at
before update on public.dose_logs
for each row execute function public.set_updated_at();
create trigger vet_visits_set_updated_at
before update on public.vet_visits
for each row execute function public.set_updated_at();
create trigger attachments_set_updated_at
before update on public.attachments
for each row execute function public.set_updated_at();

create trigger weight_entries_set_created_by
before insert on public.weight_entries
for each row execute function public.set_created_by();
create trigger vaccinations_set_created_by
before insert on public.vaccinations
for each row execute function public.set_created_by();
create trigger treatments_set_created_by
before insert on public.treatments
for each row execute function public.set_created_by();
create trigger dose_logs_set_created_by
before insert on public.dose_logs
for each row execute function public.set_created_by();
create trigger vet_visits_set_created_by
before insert on public.vet_visits
for each row execute function public.set_created_by();
create trigger attachments_set_created_by
before insert on public.attachments
for each row execute function public.set_created_by();

-- Pet lookups for rows that reach their pet through a parent -----------------------------
create function private.treatment_pet_id(treatment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.pet_id from public.treatments t where t.id = treatment_pet_id.treatment_id;
$$;

create function private.vet_visit_pet_id(vet_visit_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.pet_id from public.vet_visits v where v.id = vet_visit_pet_id.vet_visit_id;
$$;

revoke execute on function private.treatment_pet_id(uuid) from public, anon;
revoke execute on function private.vet_visit_pet_id(uuid) from public, anon;
grant execute on function private.treatment_pet_id(uuid) to authenticated, service_role;
grant execute on function private.vet_visit_pet_id(uuid) to authenticated, service_role;

-- attachments.pet_id is always the visit's pet.
create function public.attachments_set_pet_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.pet_id := private.vet_visit_pet_id(new.vet_visit_id);
  return new;
end;
$$;

create trigger attachments_set_pet_id
before insert on public.attachments
for each row execute function public.attachments_set_pet_id();

-- Client write rules on entries (API §4.4, EP-08 … EP-14) ------------------------------
-- Owner and organisation roles write every entry (organisation roles after the
-- approval gate). A household member (BR-22, BR-23, BR-28):
--   weight_entries, dose_logs: insert; update/delete only rows they created, else
--     forbidden_role (E-12); any write on a read-only household → household_read_only;
--   every other entry table: forbidden_role.
-- Users with no relation fall through to RLS. Only checked for client sessions.
create function public.health_record_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry jsonb;
  pet_id uuid;
  role text;
begin
  if current_user <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- The parent columns are not client-updatable, so OLD and NEW agree on them.
  entry := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  pet_id := case tg_table_name
    when 'dose_logs' then private.treatment_pet_id((entry ->> 'treatment_id')::uuid)
    when 'attachments' then private.vet_visit_pet_id((entry ->> 'vet_visit_id')::uuid)
    else (entry ->> 'pet_id')::uuid
  end;

  role := private.pet_write_role(pet_id);

  if role = 'member' then
    if tg_table_name not in ('weight_entries', 'dose_logs') then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
    if private.is_pet_household_read_only(pet_id) then
      raise exception using errcode = 'P0001', message = 'household_read_only';
    end if;
    if tg_op <> 'INSERT'
       and (to_jsonb(old) ->> 'created_by')::uuid is distinct from (select auth.uid()) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger weight_entries_check_write
before insert or update or delete on public.weight_entries
for each row execute function public.health_record_check_write();
create trigger vaccinations_check_write
before insert or update or delete on public.vaccinations
for each row execute function public.health_record_check_write();
create trigger treatments_check_write
before insert or update or delete on public.treatments
for each row execute function public.health_record_check_write();
create trigger dose_logs_check_write
before insert or update or delete on public.dose_logs
for each row execute function public.health_record_check_write();
create trigger vet_visits_check_write
before insert or update or delete on public.vet_visits
for each row execute function public.health_record_check_write();
create trigger attachments_check_write
before insert or update or delete on public.attachments
for each row execute function public.health_record_check_write();

-- BR-50: changing a pet's weight unit converts its existing weight entries --------------
create function public.pets_convert_weight_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.weight_entries w
  set value = case new.weight_unit
    when 'g' then w.value * 1000
    else w.value / 1000
  end
  where w.pet_id = new.id;
  return null;
end;
$$;

create trigger pets_convert_weight_entries
after update of weight_unit on public.pets
for each row
when (old.weight_unit is distinct from new.weight_unit)
execute function public.pets_convert_weight_entries();

-- R2 keys queued on delete (TC §5.9, API §10 step 7) -------------------------------------
-- Row triggers also fire for rows removed by a cascade (pet → vet visits → attachments).
create function public.attachments_queue_r2_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.r2_deletion_queue (r2_key)
  values (old.r2_key)
  on conflict (r2_key) do nothing;
  return null;
end;
$$;

create trigger attachments_queue_r2_key
after delete on public.attachments
for each row execute function public.attachments_queue_r2_key();

create function public.pets_queue_r2_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_r2_key is not null then
    insert into public.r2_deletion_queue (r2_key)
    values (old.photo_r2_key)
    on conflict (r2_key) do nothing;
  end if;
  return null;
end;
$$;

create trigger pets_queue_r2_key
after delete on public.pets
for each row execute function public.pets_queue_r2_key();

revoke execute on function public.pets_convert_weight_entries() from public, anon, authenticated;
revoke execute on function public.attachments_queue_r2_key() from public, anon, authenticated;
revoke execute on function public.pets_queue_r2_key() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------------------
-- Every entry is visible to whoever may see its pet (API §4.3). Inserts: owner and
-- organisation roles; members too on weight_entries and dose_logs (BR-22). Update and
-- delete pass every related user through USING so the trigger above answers with the
-- API error code. parent ids and created_by are not client-updatable.
alter table public.weight_entries enable row level security;
alter table public.vaccinations enable row level security;
alter table public.treatments enable row level security;
alter table public.dose_logs enable row level security;
alter table public.vet_visits enable row level security;
alter table public.attachments enable row level security;

revoke all on table public.weight_entries from anon, authenticated;
revoke all on table public.vaccinations from anon, authenticated;
revoke all on table public.treatments from anon, authenticated;
revoke all on table public.dose_logs from anon, authenticated;
revoke all on table public.vet_visits from anon, authenticated;
revoke all on table public.attachments from anon, authenticated;

-- weight_entries (EP-08)
grant select, delete on table public.weight_entries to authenticated;
grant insert (pet_id, measured_on, value, note) on table public.weight_entries to authenticated;
grant update (measured_on, value, note) on table public.weight_entries to authenticated;

create policy weight_entries_select on public.weight_entries
  for select to authenticated
  using (private.can_read_pet(pet_id));

create policy weight_entries_insert on public.weight_entries
  for insert to authenticated
  with check (private.can_manage_pet(pet_id) or private.is_pet_household_member(pet_id));

create policy weight_entries_update on public.weight_entries
  for update to authenticated
  using (private.can_read_pet(pet_id))
  with check (private.can_manage_pet(pet_id) or private.is_pet_household_member(pet_id));

create policy weight_entries_delete on public.weight_entries
  for delete to authenticated
  using (private.can_read_pet(pet_id));

-- vaccinations (EP-09)
grant select, delete on table public.vaccinations to authenticated;
grant insert (pet_id, name, given_on, next_due_on, clinic, batch_number, note)
  on table public.vaccinations to authenticated;
grant update (name, given_on, next_due_on, clinic, batch_number, note)
  on table public.vaccinations to authenticated;

create policy vaccinations_select on public.vaccinations
  for select to authenticated
  using (private.can_read_pet(pet_id));

create policy vaccinations_insert on public.vaccinations
  for insert to authenticated
  with check (private.can_manage_pet(pet_id));

create policy vaccinations_update on public.vaccinations
  for update to authenticated
  using (private.can_read_pet(pet_id))
  with check (private.can_manage_pet(pet_id));

create policy vaccinations_delete on public.vaccinations
  for delete to authenticated
  using (private.can_read_pet(pet_id));

-- treatments (EP-10)
grant select, delete on table public.treatments to authenticated;
grant insert (pet_id, type, name, dose, interval_value, interval_unit, starts_on, ends_on, note)
  on table public.treatments to authenticated;
grant update (type, name, dose, interval_value, interval_unit, starts_on, ends_on, note)
  on table public.treatments to authenticated;

create policy treatments_select on public.treatments
  for select to authenticated
  using (private.can_read_pet(pet_id));

create policy treatments_insert on public.treatments
  for insert to authenticated
  with check (private.can_manage_pet(pet_id));

create policy treatments_update on public.treatments
  for update to authenticated
  using (private.can_read_pet(pet_id))
  with check (private.can_manage_pet(pet_id));

create policy treatments_delete on public.treatments
  for delete to authenticated
  using (private.can_read_pet(pet_id));

-- dose_logs (EP-11)
grant select, delete on table public.dose_logs to authenticated;
grant insert (treatment_id, given_at, occurrence_id) on table public.dose_logs to authenticated;
grant update (given_at) on table public.dose_logs to authenticated;

create policy dose_logs_select on public.dose_logs
  for select to authenticated
  using (private.can_read_pet(private.treatment_pet_id(treatment_id)));

create policy dose_logs_insert on public.dose_logs
  for insert to authenticated
  with check (
    private.can_manage_pet(private.treatment_pet_id(treatment_id))
    or private.is_pet_household_member(private.treatment_pet_id(treatment_id))
  );

create policy dose_logs_update on public.dose_logs
  for update to authenticated
  using (private.can_read_pet(private.treatment_pet_id(treatment_id)))
  with check (
    private.can_manage_pet(private.treatment_pet_id(treatment_id))
    or private.is_pet_household_member(private.treatment_pet_id(treatment_id))
  );

create policy dose_logs_delete on public.dose_logs
  for delete to authenticated
  using (private.can_read_pet(private.treatment_pet_id(treatment_id)));

-- vet_visits (EP-12)
grant select, delete on table public.vet_visits to authenticated;
grant insert (
  pet_id, visited_on, clinic, reason, findings, recommendations, cost_minor, follow_up_on
) on table public.vet_visits to authenticated;
grant update (
  visited_on, clinic, reason, findings, recommendations, cost_minor, follow_up_on
) on table public.vet_visits to authenticated;

create policy vet_visits_select on public.vet_visits
  for select to authenticated
  using (private.can_read_pet(pet_id));

create policy vet_visits_insert on public.vet_visits
  for insert to authenticated
  with check (private.can_manage_pet(pet_id));

create policy vet_visits_update on public.vet_visits
  for update to authenticated
  using (private.can_read_pet(pet_id))
  with check (private.can_manage_pet(pet_id));

create policy vet_visits_delete on public.vet_visits
  for delete to authenticated
  using (private.can_read_pet(pet_id));

-- attachments (EP-13, EP-14): inserted by confirm_upload, deleted by delete_attachment;
-- never updated.
grant select, delete on table public.attachments to authenticated;
grant insert (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes)
  on table public.attachments to authenticated;

create policy attachments_select on public.attachments
  for select to authenticated
  using (private.can_read_pet(pet_id));

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (private.can_manage_pet(pet_id));

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (private.can_read_pet(pet_id));
