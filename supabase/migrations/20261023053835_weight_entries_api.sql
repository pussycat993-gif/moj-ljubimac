-- Step 14 — view:weight_entries_api (EP-08; API §5.1 Part A, §6 WeightEntry, Access) and the
-- EP-08 / EP-09 Request rules the schema did not enforce yet, as check constraints on existing
-- weight_entries and vaccinations columns. The computed fields reuse the helpers of the
-- pet_summaries_api and get_pet_record migrations.

-- EP-08 / EP-09 Request rules -----------------------------------------------------------
-- value > 0 is already a column check, and numeric(9, 3) holds at most 3 decimals. The
-- clock-dependent rules (measured_on / given_on not in the future) are checked by the server
-- action; a check constraint must not depend on the clock.
alter table public.weight_entries
  add constraint weight_entries_note_length_check check (char_length(note) <= 500);

alter table public.vaccinations
  add constraint vaccinations_name_length_check check (char_length(name) between 1 and 100),
  add constraint vaccinations_next_due_on_check check (next_due_on > given_on),
  add constraint vaccinations_clinic_length_check check (char_length(clinic) <= 100),
  add constraint vaccinations_batch_number_length_check check (char_length(batch_number) <= 60),
  add constraint vaccinations_note_length_check check (char_length(note) <= 1000);

-- view:weight_entries_api (EP-08) --------------------------------------------------------
-- security_invoker: RLS on weight_entries and pets still decides visibility. Adds the WeightEntry
-- computed fields: weight_unit (the pet's unit, values are stored in it), created_by_name and
-- the per-entry access (creator, the pet's owner or the organisation's team; a member's own
-- entries lock while the household is read-only — BR-23, BR-28).
create view public.weight_entries_api
with (security_invoker = true)
as
select
  w.id,
  w.pet_id,
  w.measured_on,
  w.value,
  p.weight_unit,
  w.note,
  w.created_by,
  private.pet_person_name(w.pet_id, w.created_by) as created_by_name,
  w.created_at,
  private.entry_access(private.pet_access(w.pet_id), w.pet_id, w.created_by) as access
from public.weight_entries w
join public.pets p on p.id = w.pet_id;

revoke all on table public.weight_entries_api from anon, authenticated;
grant select on table public.weight_entries_api to authenticated;
