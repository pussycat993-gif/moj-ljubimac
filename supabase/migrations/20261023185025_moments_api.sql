-- Step 21 — view:moments_api (EP-20; API §5.1 Part A, §6 Moment, MomentPhoto, Access) and the EP-21
-- confirm write rpc:confirm_moment (owner decision 2026-10-23, option A). The EP-21 field rules are
-- already column checks (moments.text ≤ 280, BR-52; moment_photos.position 1–5, BR-06), so no new
-- constraint is added. EP-22 and EP-23 write the base tables directly (RLS, care_check_write); the
-- link is removed with its moment by the existing cascade and photo keys are queued by the existing
-- moment_photos_queue_r2_key trigger. Public reads (EP-24) use the service role on the server.

-- view:moments_api (EP-20) -------------------------------------------------------------------------
-- security_invoker: RLS on moments decides visibility (the pet's owner and its household members;
-- organisation roles have no relation). photos are the MomentPhoto rows ordered by position;
-- public_link is null until the link is first enabled. Its url follows API §6 Moment; the app
-- rebuilds it from NEXT_PUBLIC_SITE_URL (owner decision, Step 21). access is the per-entry rule
-- (creator or the pet's owner; a member's own moments lock while the household is read-only —
-- BR-23, BR-28).
create view public.moments_api
with (security_invoker = true)
as
select
  m.id,
  m.pet_id,
  m.moment_date,
  m.text,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', ph.id, 'moment_id', ph.moment_id, 'position', ph.position)
                       order by ph.position)
      from public.moment_photos ph
      where ph.moment_id = m.id
    ),
    '[]'::jsonb
  ) as photos,
  (select count(*)::integer from public.moment_photos ph where ph.moment_id = m.id) as photo_count,
  (
    select jsonb_build_object('slug', l.slug, 'active', l.active, 'url', 'https://mojljubimac.rs/t/' || l.slug)
    from public.moment_public_links l
    where l.moment_id = m.id
  ) as public_link,
  m.created_by,
  private.pet_person_name(m.pet_id, m.created_by) as created_by_name,
  m.created_at,
  private.entry_access(private.pet_access(m.pet_id), m.pet_id, m.created_by) as access
from public.moments m;

revoke all on table public.moments_api from anon, authenticated;
grant select on table public.moments_api to authenticated;

-- EP-21 step 1 (prepare_moment, server action) chooses the moment id and hands out the R2 keys
-- under it (API §10 item 6); step 3 inserts the moment with that id.
grant insert (id) on table public.moments to authenticated;

-- rpc:confirm_moment (EP-21 step 3) ------------------------------------------------------------------
-- Called by the confirm_moment server action after the draft token and every R2 HEAD were verified.
-- SECURITY INVOKER: RLS on moments / moment_photos, care_check_write (household_read_only; a member
-- adds photos only to own moments) and the Free-limit trigger (premium_required:moments, BR-01,
-- BR-24) all still apply. One call is one transaction: the moment and its photos are inserted
-- together or not at all. Rules repeated from EP-21 Request: active pet (memorial →
-- p_pet_id:invalid_state), moment_date not in the future (Europe/Belgrade), 0–5 photos
-- (too_many_photos), text or photos required, and every photo key under this moment's own prefix
-- u/<owner_id>/pets/<pet_id>/moments/<moment_id>/ (so a caller cannot attach another object).
-- No relation to the pet → not_found. Returns the Moment (view:moments_api row).
create function public.confirm_moment(
  p_moment_id uuid,
  p_pet_id uuid,
  p_moment_date date,
  p_text text,
  p_photos jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_pet record;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_prefix text;
  v_photo jsonb;
  v_result jsonb;
begin
  if p_moment_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_moment_id:required';
  end if;
  if p_pet_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_pet_id:required';
  end if;

  select p.owner_id, p.lifecycle into v_pet from public.pets p where p.id = p_pet_id;
  if not found or v_pet.owner_id is null or not private.can_access_pet_care(p_pet_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if v_pet.lifecycle <> 'active' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_pet_id:invalid_state';
  end if;

  if p_moment_date is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_moment_date:required';
  end if;
  if p_moment_date > (now() at time zone 'Europe/Belgrade')::date then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_moment_date:out_of_range';
  end if;

  if jsonb_typeof(v_photos) <> 'array' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_photos:invalid';
  end if;
  if jsonb_array_length(v_photos) > 5 then
    raise exception using errcode = 'P0001', message = 'too_many_photos';
  end if;
  if v_text is null and jsonb_array_length(v_photos) = 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_text:required';
  end if;

  v_prefix := 'u/' || v_pet.owner_id::text || '/pets/' || p_pet_id::text || '/moments/' || p_moment_id::text || '/';
  for v_photo in select value from jsonb_array_elements(v_photos) loop
    if jsonb_typeof(v_photo -> 'r2_key') <> 'string'
       or jsonb_typeof(v_photo -> 'position') <> 'number'
       or left(v_photo ->> 'r2_key', length(v_prefix)) <> v_prefix
       or length(v_photo ->> 'r2_key') = length(v_prefix) then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_photos:invalid';
    end if;
  end loop;

  insert into public.moments (id, pet_id, moment_date, text)
  values (p_moment_id, p_pet_id, p_moment_date, v_text);

  insert into public.moment_photos (moment_id, r2_key, position)
  select p_moment_id, e ->> 'r2_key', (e ->> 'position')::smallint
  from jsonb_array_elements(v_photos) e;

  select to_jsonb(v) into v_result from public.moments_api v where v.id = p_moment_id;
  return v_result;
end;
$$;

revoke execute on function public.confirm_moment(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.confirm_moment(uuid, uuid, date, text, jsonb) to authenticated;
