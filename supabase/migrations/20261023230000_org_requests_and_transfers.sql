-- Step 25 — requests, inquiries and record transfers (EPIC-06): rpc:list_org_requests (EP-57), the EP-58 decision
-- (decide_org_request), EP-63 submit (submit_org_request), EP-59 send / re-send (create_record_transfer,
-- resend_record_transfer) and EP-60 view / accept / decline (get_transfer_by_token, get_transfer_copy_plan,
-- accept_record_transfer, decline_record_transfer). The read-only organisation copy after an accepted transfer
-- (pet_is_transferred + guard triggers → forbidden_role). The transfer copy runs with app.transfer_copy = on, so the
-- Step 06 created_by and attachment-limit trigger functions are recreated to keep the original authors and skip
-- the Free attachment limit for the copy (owner decisions, Step 25). No table, column, enum or constraint change.
-- EP-02 / EP-01 already answer can_edit = can_delete = false on a transferred copy (private.pet_access, Step 13).

-- Helpers ---------------------------------------------------------------------------------------
-- The pet was handed over: it has an accepted record transfer (API §6 Access, EP-60).
create function private.pet_is_transferred(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.record_transfers t where t.pet_id = p_pet and t.status = 'accepted'
  );
$$;

-- API §6 City.
create function private.city_json(p_city_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name_sr', c.name_sr, 'name_en', c.name_en,
    'latitude', c.latitude, 'longitude', c.longitude
  )
  from public.cities c
  where c.id = p_city_id;
$$;

-- API §6 RecordTransfer (a pending row past expires_at is reported expired).
create function private.record_transfer_json(t public.record_transfers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when t.id is null then null else jsonb_build_object(
    'id', t.id,
    'pet_id', t.pet_id,
    'status', t.status,
    'recipient_email', t.recipient_email,
    'sent_at', t.created_at,
    'expires_at', t.expires_at,
    'is_expired', t.status = 'expired' or (t.status = 'pending' and t.expires_at < now()),
    'accepted_at', t.accepted_at
  ) end;
$$;

-- API §6 AdoptionRequest / BreederInquiry (the two tables share their columns). pet.price only for inquiries.
create function private.org_request_json(p_kind text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select a.id, a.pet_id, a.requester_id, a.name, a.phone, a.email, a.message, a.status, a.decided_by,
           a.decided_at, a.created_at
    from public.adoption_requests a
    where p_kind = 'adoption_request' and a.id = p_id
    union all
    select b.id, b.pet_id, b.requester_id, b.name, b.phone, b.email, b.message, b.status, b.decided_by,
           b.decided_at, b.created_at
    from public.breeder_inquiries b
    where p_kind = 'breeder_inquiry' and b.id = p_id
  )
  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'requester_id', r.requester_id,
    'name', r.name,
    'phone', r.phone,
    'email', r.email,
    'message', r.message,
    'created_at', r.created_at,
    'decided_at', r.decided_at,
    'decided_by_name', (select pr.full_name from public.profiles pr where pr.id = r.decided_by),
    'pet', jsonb_build_object(
      'pet_id', p.id,
      'name', p.name,
      'species', p.species,
      'species_other', p.species_other,
      'breed', p.breed,
      'sex', p.sex,
      'approx_age_text', p.approx_age_text,
      'birth_date', p.birth_date,
      'birth_year', p.birth_year
    ) || case when p_kind = 'breeder_inquiry' then jsonb_build_object(
      'price', case when p.price_minor is null then null
               else jsonb_build_object('amount_minor', p.price_minor, 'currency', 'RSD') end
    ) else '{}'::jsonb end,
    'transfer', (
      select private.record_transfer_json(t)
      from public.record_transfers t
      where t.pet_id = r.pet_id
      order by t.created_at desc, t.id desc
      limit 1
    )
  )
  from r
  join public.pets p on p.id = r.pet_id;
$$;

revoke execute on function private.pet_is_transferred(uuid) from public, anon;
revoke execute on function private.city_json(uuid) from public, anon;
revoke execute on function private.record_transfer_json(public.record_transfers) from public, anon;
revoke execute on function private.org_request_json(text, uuid) from public, anon;
grant execute on function private.pet_is_transferred(uuid) to authenticated, service_role;
grant execute on function private.city_json(uuid) to authenticated, service_role;
grant execute on function private.record_transfer_json(public.record_transfers) to authenticated, service_role;
grant execute on function private.org_request_json(text, uuid) to authenticated, service_role;

-- Read-only organisation copy (EP-60, API §6 Access) ------------------------------------------------
-- After an accepted transfer the organisation keeps the animal read-only: client writes on the pet and on its
-- health-record entries → forbidden_role. Only the organisation team has a relation to the original; anyone
-- else falls through to RLS. System paths are unaffected.
create function public.transferred_copy_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry jsonb;
  v_pet_id uuid;
begin
  if current_user = 'authenticated' then
    entry := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    v_pet_id := case tg_table_name
      when 'pets' then (entry ->> 'id')::uuid
      when 'dose_logs' then private.treatment_pet_id((entry ->> 'treatment_id')::uuid)
      when 'attachments' then private.vet_visit_pet_id((entry ->> 'vet_visit_id')::uuid)
      else (entry ->> 'pet_id')::uuid
    end;
    if v_pet_id is not null
       and private.pet_is_transferred(v_pet_id)
       and private.is_pet_organisation_member(v_pet_id) then
      raise exception using errcode = 'P0001', message = 'forbidden_role';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger pets_check_transferred_copy
before update or delete on public.pets
for each row execute function public.transferred_copy_check_write();
create trigger weight_entries_check_transferred_copy
before insert or update or delete on public.weight_entries
for each row execute function public.transferred_copy_check_write();
create trigger vaccinations_check_transferred_copy
before insert or update or delete on public.vaccinations
for each row execute function public.transferred_copy_check_write();
create trigger treatments_check_transferred_copy
before insert or update or delete on public.treatments
for each row execute function public.transferred_copy_check_write();
create trigger dose_logs_check_transferred_copy
before insert or update or delete on public.dose_logs
for each row execute function public.transferred_copy_check_write();
create trigger vet_visits_check_transferred_copy
before insert or update or delete on public.vet_visits
for each row execute function public.transferred_copy_check_write();
create trigger attachments_check_transferred_copy
before insert or update or delete on public.attachments
for each row execute function public.transferred_copy_check_write();

revoke execute on function public.transferred_copy_check_write() from public, anon, authenticated;

-- Transfer copy flag (owner decision, Step 25) -----------------------------------------------------
-- Step 06 set_created_by, recreated: inside the EP-60 copy (app.transfer_copy = on, set by
-- accept_record_transfer only) the supplied created_by is kept, so the copied entries keep their original
-- authors; an entry whose author was deleted (null) is credited to the recipient. Client sessions never get
-- the flag honoured.
create or replace function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated'
     and coalesce(current_setting('app.transfer_copy', true), '') = 'on'
     and new.created_by is not null then
    return new;
  end if;
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  if new.created_by is null then
    raise exception using
      errcode = 'P0001',
      message = 'internal_error',
      detail = tg_table_name || '.created_by is required at creation';
  end if;
  return new;
end;
$$;

-- Step 06 attachments_enforce_free_limit, recreated: the EP-60 copy hands over the whole record, so the Free
-- attachment limit is skipped while app.transfer_copy = on.
create or replace function public.attachments_enforce_free_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pet_id uuid;
  pet_owner_id uuid;
begin
  if coalesce(current_setting('app.transfer_copy', true), '') = 'on' then
    return new;
  end if;

  target_pet_id := private.vet_visit_pet_id(new.vet_visit_id);

  -- Serialise concurrent uploads to the same pet.
  select p.owner_id into pet_owner_id
  from public.pets p
  where p.id = target_pet_id
  for update;

  if pet_owner_id is null or public.is_premium(pet_owner_id) then
    return new;
  end if;

  if (select count(*) from public.attachments a where a.pet_id = target_pet_id) >= 10 then
    raise exception using errcode = 'P0001', message = 'premium_required:attachments';
  end if;
  return new;
end;
$$;

revoke execute on function public.attachments_enforce_free_limit() from public, anon, authenticated;

-- EP-57 — list_org_requests(p_status, p_limit, p_offset) ------------------------------------------------
-- Security definer with an explicit membership check (decided_by_name comes from profiles). A shelter lists
-- adoption_requests, a breeder breeder_inquiries; sort created_at desc; status_counts over all rows.
create function public.list_org_requests(
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine public.organisation_memberships;
  o public.organisations;
  v_kind text;
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_can_edit boolean;
  v_items jsonb;
  v_total integer;
  v_counts jsonb;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  mine := private.my_organisation_membership();
  if mine.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into o from public.organisations where id = mine.organisation_id;

  if v_status is not null and v_status not in ('pending', 'accepted', 'rejected') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_status:invalid';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_offset:out_of_range';
  end if;

  v_kind := case o.type when 'shelter' then 'adoption_request' else 'breeder_inquiry' end;
  v_can_edit := mine.role = 'admin'
    and o.approval_status = 'approved'
    and (o.type = 'shelter' or private.breeder_plan_active(o.id));

  with rows as (
    select a.id, a.status::text as status, a.created_at
    from public.adoption_requests a
    join public.pets p on p.id = a.pet_id
    where v_kind = 'adoption_request' and p.organisation_id = o.id
    union all
    select b.id, b.status::text, b.created_at
    from public.breeder_inquiries b
    join public.pets p on p.id = b.pet_id
    where v_kind = 'breeder_inquiry' and p.organisation_id = o.id
  ),
  matching as (
    select r.* from rows r where v_status is null or r.status = v_status
  ),
  page as (
    select m.* from matching m order by m.created_at desc, m.id desc limit v_limit offset v_offset
  )
  select
    (select coalesce(jsonb_agg(private.org_request_json(v_kind, pg.id) order by pg.created_at desc, pg.id desc), '[]'::jsonb)
     from page pg),
    (select count(*)::integer from matching),
    jsonb_build_object(
      'pending', (select count(*)::integer from rows where status = 'pending'),
      'accepted', (select count(*)::integer from rows where status = 'accepted'),
      'rejected', (select count(*)::integer from rows where status = 'rejected')
    )
  into v_items, v_total, v_counts;

  return jsonb_build_object(
    'kind', v_kind,
    'items', v_items,
    'total', v_total,
    'status_counts', v_counts,
    'access', jsonb_build_object(
      'role', case when mine.role = 'admin' then 'org_admin' else 'volunteer' end,
      'can_edit', v_can_edit,
      'can_delete', v_can_edit
    )
  );
end;
$$;

revoke execute on function public.list_org_requests(text, integer, integer) from public, anon;
grant execute on function public.list_org_requests(text, integer, integer) to authenticated;

-- EP-58 — decide_org_request(p_kind, p_id, p_decision) ----------------------------------------------
-- Admins only (BR-34); pending / rejected organisation → organisation_pending_approval; breeder without an active
-- plan → breeder_plan_required; not pending → already_decided. Accept reserves the animal (the Step 09 trigger
-- writes pet_status_history). Returns the updated request, the applicant's locale and the organisation's
-- contact details for the email (BR-36). Other pending requests for the same pet are left unchanged.
create function public.decide_org_request(p_kind text, p_id uuid, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_pet_id uuid;
  v_requester uuid;
  v_status public.request_status;
  pet public.pets;
  o public.organisations;
  member_role public.organisation_role;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_decision is null or p_decision not in ('accept', 'reject') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'decision:invalid';
  end if;
  if p_kind is null or p_kind not in ('adoption_request', 'breeder_inquiry') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'kind:invalid';
  end if;

  if p_kind = 'adoption_request' then
    select a.pet_id, a.requester_id, a.status into v_pet_id, v_requester, v_status
    from public.adoption_requests a where a.id = p_id for update;
  else
    select b.pet_id, b.requester_id, b.status into v_pet_id, v_requester, v_status
    from public.breeder_inquiries b where b.id = p_id for update;
  end if;
  if v_pet_id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  select * into pet from public.pets where id = v_pet_id;
  select m.role into member_role
  from public.organisation_memberships m
  where m.organisation_id = pet.organisation_id and m.user_id = me;
  if pet.organisation_id is null or member_role is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into o from public.organisations where id = pet.organisation_id;

  if (o.type = 'shelter') <> (p_kind = 'adoption_request') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'kind:invalid';
  end if;
  if member_role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  perform private.assert_organisation_writable(o.id);
  if o.type = 'breeder' and not private.breeder_plan_active(o.id) then
    raise exception using errcode = 'P0001', message = 'breeder_plan_required';
  end if;
  if v_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'already_decided';
  end if;

  if p_kind = 'adoption_request' then
    update public.adoption_requests
    set status = case when p_decision = 'accept' then 'accepted' else 'rejected' end::public.request_status,
        decided_by = me, decided_at = now()
    where id = p_id;
  else
    update public.breeder_inquiries
    set status = case when p_decision = 'accept' then 'accepted' else 'rejected' end::public.request_status,
        decided_by = me, decided_at = now()
    where id = p_id;
  end if;

  if p_decision = 'accept' then
    if o.type = 'shelter' then
      update public.pets set shelter_status = 'reserved' where id = pet.id;
    else
      update public.pets set offspring_status = 'reserved' where id = pet.id;
    end if;
  end if;

  return jsonb_build_object(
    'request', private.org_request_json(p_kind, p_id),
    'applicant_locale', (select pr.locale from public.profiles pr where pr.id = v_requester),
    'organisation', jsonb_build_object(
      'name', o.name,
      'slug', o.slug,
      'phone', o.phone,
      'email', coalesce(o.email, (select pr.email from public.profiles pr where pr.id = me))
    )
  );
end;
$$;

revoke execute on function public.decide_org_request(text, uuid, text) from public, anon;
grant execute on function public.decide_org_request(text, uuid, text) to authenticated;

-- EP-63 — submit_org_request(p_pet_id, p_name, p_phone, p_email, p_message) ----------------------------
-- The pet must be listed on EP-62 right now: an approved organisation; a shelter animal with
-- shelter_status = available, or a breeder's offspring with offspring_status = available and an active breeder
-- plan (E-21); otherwise not_found. Inserts the pending adoption request / breeder inquiry for auth.uid().
create function public.submit_org_request(
  p_pet_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pet public.pets;
  o public.organisations;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_kind text;
  v_id uuid;
  v_created timestamptz;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  select * into pet from public.pets where id = p_pet_id;
  if pet.id is not null and pet.organisation_id is not null then
    select * into o from public.organisations where id = pet.organisation_id;
  end if;
  if o.id is null
     or o.approval_status <> 'approved'
     or pet.lifecycle <> 'active'
     or (o.type = 'shelter' and pet.shelter_status is distinct from 'available')
     or (o.type = 'breeder' and (pet.offspring_status is distinct from 'available'
                                 or not private.breeder_plan_active(o.id))) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if v_name = '' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'name:required';
  end if;
  if char_length(v_name) > 120 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'name:too_long';
  end if;
  if v_phone = '' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'phone:required';
  end if;
  if char_length(v_phone) < 6 or char_length(v_phone) > 30 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'phone:invalid';
  end if;
  if v_email = '' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'email:required';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'email:invalid';
  end if;
  if v_message is not null and char_length(v_message) > 2000 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'message:too_long';
  end if;

  if o.type = 'shelter' then
    v_kind := 'adoption_request';
    insert into public.adoption_requests (pet_id, requester_id, name, phone, email, message)
    values (pet.id, me, v_name, v_phone, v_email, v_message)
    returning id, created_at into v_id, v_created;
  else
    v_kind := 'breeder_inquiry';
    insert into public.breeder_inquiries (pet_id, requester_id, name, phone, email, message)
    values (pet.id, me, v_name, v_phone, v_email, v_message)
    returning id, created_at into v_id, v_created;
  end if;

  return jsonb_build_object('id', v_id, 'kind', v_kind, 'status', 'pending', 'created_at', v_created);
end;
$$;

revoke execute on function public.submit_org_request(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_org_request(uuid, text, text, text, text) to authenticated;

-- EP-59 send — create_record_transfer(p_id, p_pet_id, p_recipient_email, p_token_hash) -------------------
-- Admins of the animal's organisation only. The pet already handed over → invitation_used. One transaction:
-- any pending transfer of the pet → expired; the new row (valid 30 days, BR-38); the animal → adopted
-- (shelter) / sold (breeder offspring) if not already (the Step 09 trigger writes pet_status_history). Returns
-- the RecordTransfer and what the record_transfer email needs.
create function public.create_record_transfer(
  p_id uuid,
  p_pet_id uuid,
  p_recipient_email text,
  p_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pet public.pets;
  o public.organisations;
  member_role public.organisation_role;
  addr text := lower(btrim(coalesce(p_recipient_email, '')));
  t public.record_transfers;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  select * into pet from public.pets where id = p_pet_id for update;
  if pet.id is not null and pet.organisation_id is not null then
    select m.role into member_role
    from public.organisation_memberships m
    where m.organisation_id = pet.organisation_id and m.user_id = me;
  end if;
  if member_role is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into o from public.organisations where id = pet.organisation_id;

  if member_role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  perform private.assert_organisation_writable(o.id);
  if o.type = 'breeder' and not private.breeder_plan_active(o.id) then
    raise exception using errcode = 'P0001', message = 'breeder_plan_required';
  end if;

  if p_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'id:required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'token_hash:invalid';
  end if;
  if addr = '' or char_length(addr) > 254 or addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'recipient_email:invalid';
  end if;

  if private.pet_is_transferred(pet.id) then
    raise exception using errcode = 'P0001', message = 'invitation_used';
  end if;

  update public.record_transfers
  set status = 'expired'
  where pet_id = pet.id and status = 'pending';

  insert into public.record_transfers (id, pet_id, from_organisation_id, recipient_email, token_hash, expires_at, status)
  values (p_id, pet.id, o.id, addr, p_token_hash, now() + interval '30 days', 'pending')
  returning * into t;

  if o.type = 'shelter' then
    update public.pets set shelter_status = 'adopted'
    where id = pet.id and shelter_status is distinct from 'adopted';
  elsif pet.breeding_status is null then
    update public.pets set offspring_status = 'sold'
    where id = pet.id and offspring_status is distinct from 'sold';
  end if;

  return jsonb_build_object(
    'transfer', private.record_transfer_json(t),
    'organisation_name', o.name,
    'pet_name', pet.name,
    'sender_locale', (select pr.locale from public.profiles pr where pr.id = me),
    'recipient_locale', (select pr.locale from public.profiles pr where lower(pr.email) = addr limit 1)
  );
end;
$$;

revoke execute on function public.create_record_transfer(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_record_transfer(uuid, uuid, text, text) to authenticated;

-- EP-59 re-send — resend_record_transfer(p_new_id, p_transfer_id, p_token_hash) ---------------------------
-- Copies pet_id and recipient_email from the earlier transfer and sends again with a new token (BR-38).
create function public.resend_record_transfer(p_new_id uuid, p_transfer_id uuid, p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t public.record_transfers;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  select * into t from public.record_transfers where id = p_transfer_id;
  if t.id is null or not private.is_organisation_member(t.from_organisation_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  return public.create_record_transfer(p_new_id, t.pet_id, t.recipient_email, p_token_hash);
end;
$$;

revoke execute on function public.resend_record_transfer(uuid, uuid, text) from public, anon;
grant execute on function public.resend_record_transfer(uuid, uuid, text) to authenticated;

-- EP-60 helpers --------------------------------------------------------------------------------------
-- API §6 TransferView of transfer t for caller p_me. new_pet_id only to the accepting user. photo_r2_key is
-- internal: the server action turns it into animal.photo_url (a presigned GET) and drops it.
create function private.transfer_view_json(t public.record_transfers, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'transfer_id', t.id,
    'status', t.status,
    'expires_at', t.expires_at,
    'organisation', jsonb_build_object('name', o.name, 'city', private.city_json(o.city_id)),
    'animal', jsonb_build_object(
      'name', p.name,
      'sex', p.sex,
      'species', p.species,
      'species_other', p.species_other,
      'breed', p.breed,
      'approx_age_text', p.approx_age_text,
      'birth_date', p.birth_date,
      'microchip_number', p.microchip_number,
      'photo_url', null,
      'photo_r2_key', p.photo_r2_key
    ),
    'counts', jsonb_build_object(
      'vaccinations', (select count(*)::integer from public.vaccinations v where v.pet_id = p.id),
      'vet_visits', (select count(*)::integer from public.vet_visits v where v.pet_id = p.id),
      'attachments', (select count(*)::integer from public.attachments a where a.pet_id = p.id)
    ),
    'new_pet_id', case when p_me is not null and t.accepted_by = p_me then t.new_pet_id end
  )
  from public.pets p
  join public.organisations o on o.id = t.from_organisation_id
  where p.id = t.pet_id;
$$;

-- The transfer of a token for a decision (EP-60): unknown → not_found; accepted / declined → invitation_used;
-- expired → invitation_expired. Locks the row.
create function private.pending_transfer_for_update(p_token_hash text)
returns public.record_transfers
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.record_transfers;
begin
  select * into t from public.record_transfers where token_hash = p_token_hash for update;
  if t.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if t.status in ('accepted', 'declined') then
    raise exception using errcode = 'P0001', message = 'invitation_used';
  end if;
  if t.status = 'expired' or t.expires_at < now() then
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;
  return t;
end;
$$;

-- The checks before an accept: an owner account (BR-33 → forbidden_role) and, on Free, no active pet already in
-- the slot (BR-39, E-20 → premium_required:transfer_slot).
create function private.assert_transfer_recipient(p_me uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Serialise concurrent accepts and pet inserts of the same user.
  perform 1 from public.profiles p where p.id = p_me for update;
  if not exists (select 1 from public.profiles p where p.id = p_me and p.account_type = 'owner') then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;
  if not public.is_premium(p_me)
     and exists (select 1 from public.pets p where p.owner_id = p_me and p.lifecycle = 'active') then
    raise exception using errcode = 'P0001', message = 'premium_required:transfer_slot';
  end if;
end;
$$;

revoke execute on function private.transfer_view_json(public.record_transfers, uuid) from public, anon;
revoke execute on function private.pending_transfer_for_update(text) from public, anon;
revoke execute on function private.assert_transfer_recipient(uuid) from public, anon;
grant execute on function private.transfer_view_json(public.record_transfers, uuid) to authenticated, service_role;
grant execute on function private.pending_transfer_for_update(text) to authenticated, service_role;
grant execute on function private.assert_transfer_recipient(uuid) to authenticated, service_role;

-- EP-60 get — get_transfer_by_token(p_token_hash) → TransferView ----------------------------------------
-- Anyone holding the token, Visitor included (BR-52: the token hash is the credential). Unknown → not_found;
-- expired (status expired, or pending past expires_at) → invitation_expired; accepted / declined are returned
-- with their status (S14 accepted / declined variants).
create function public.get_transfer_by_token(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.record_transfers;
begin
  select * into t from public.record_transfers where token_hash = p_token_hash;
  if t.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if t.status = 'expired' or (t.status = 'pending' and t.expires_at < now()) then
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;
  return private.transfer_view_json(t, (select auth.uid()));
end;
$$;

revoke execute on function public.get_transfer_by_token(text) from public;
grant execute on function public.get_transfer_by_token(text) to anon, authenticated;

-- EP-60 accept, step 1 — get_transfer_copy_plan(p_token_hash) ---------------------------------------------
-- Runs every accept check, then lists what the server action must copy in R2 before the database step: the
-- photo key and each vet visit with its attachments (owner decision: plan → ids and new u/ keys → R2 copy →
-- accept_record_transfer).
create function public.get_transfer_copy_plan(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t public.record_transfers;
  pet public.pets;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  t := private.pending_transfer_for_update(p_token_hash);
  perform private.assert_transfer_recipient(me);
  select * into pet from public.pets where id = t.pet_id;

  return jsonb_build_object(
    'transfer_id', t.id,
    'owner_id', me,
    'photo_r2_key', pet.photo_r2_key,
    'vet_visits', (
      select coalesce(jsonb_agg(jsonb_build_object('id', v.id) order by v.visited_on, v.id), '[]'::jsonb)
      from public.vet_visits v where v.pet_id = pet.id
    ),
    'attachments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'vet_visit_id', a.vet_visit_id, 'r2_key', a.r2_key, 'file_name', a.file_name
      ) order by a.created_at, a.id), '[]'::jsonb)
      from public.attachments a where a.pet_id = pet.id
    )
  );
end;
$$;

revoke execute on function public.get_transfer_copy_plan(text) from public, anon;
grant execute on function public.get_transfer_copy_plan(text) to authenticated;

-- EP-60 accept, step 2 — accept_record_transfer(p_token_hash, p_new_pet_id, p_visit_id_map, p_key_map) -------
-- One transaction (FR-50): a new pets row owned by the caller with the organisation-only fields cleared; copies
-- of weight_entries, vaccinations, treatments + dose_logs (occurrence_id null), vet_visits + attachments (new
-- visit ids from p_visit_id_map, new R2 keys from p_key_map, already copied by the action), the photo key;
-- created_by keeps the original authors (app.transfer_copy). The Step 08 triggers create the recipient's
-- reminders (BR-12). The transfer → accepted. Every new key must sit under u/<caller>/pets/<new_pet_id>/.
create function public.accept_record_transfer(
  p_token_hash text,
  p_new_pet_id uuid,
  p_visit_id_map jsonb,
  p_key_map jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t public.record_transfers;
  src public.pets;
  prefix text;
  v_photo text;
  v_visit record;
  v_new_visit uuid;
  v_treatment record;
  v_new_treatment uuid;
  v_attachment record;
  v_new_key text;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  t := private.pending_transfer_for_update(p_token_hash);
  perform private.assert_transfer_recipient(me);

  if p_new_pet_id is null or exists (select 1 from public.pets where id = p_new_pet_id) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'new_pet_id:invalid';
  end if;
  prefix := 'u/' || me::text || '/pets/' || p_new_pet_id::text || '/';

  select * into src from public.pets where id = t.pet_id;

  if src.photo_r2_key is not null then
    v_photo := coalesce(p_key_map, '{}'::jsonb) ->> src.photo_r2_key;
    if v_photo is null or left(v_photo, char_length(prefix || 'photo/')) <> prefix || 'photo/' then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'key_map:invalid';
    end if;
  end if;

  perform set_config('app.transfer_copy', 'on', true);

  insert into public.pets (
    id, owner_id, organisation_id, name, species, species_other, breed, colour_markings, microchip_number,
    passport_number, note, sex, birth_date, birth_year, neutered, photo_r2_key, vet_name, vet_phone,
    weight_unit, lifecycle, approx_age_text
  ) values (
    p_new_pet_id, me, null, src.name, src.species, src.species_other, src.breed, src.colour_markings,
    src.microchip_number, src.passport_number, src.note, src.sex, src.birth_date, src.birth_year, src.neutered,
    v_photo, src.vet_name, src.vet_phone, src.weight_unit, 'active', src.approx_age_text
  );

  insert into public.weight_entries (pet_id, measured_on, value, note, created_by)
  select p_new_pet_id, w.measured_on, w.value, w.note, w.created_by
  from public.weight_entries w where w.pet_id = src.id
  order by w.measured_on, w.created_at, w.id;

  insert into public.vaccinations (pet_id, name, given_on, next_due_on, clinic, batch_number, note, created_by)
  select p_new_pet_id, v.name, v.given_on, v.next_due_on, v.clinic, v.batch_number, v.note, v.created_by
  from public.vaccinations v where v.pet_id = src.id
  order by v.given_on, v.created_at, v.id;

  for v_treatment in
    select * from public.treatments tr where tr.pet_id = src.id order by tr.starts_on, tr.created_at, tr.id
  loop
    v_new_treatment := gen_random_uuid();
    insert into public.treatments (
      id, pet_id, type, name, dose, interval_value, interval_unit, starts_on, ends_on, note, created_by
    ) values (
      v_new_treatment, p_new_pet_id, v_treatment.type, v_treatment.name, v_treatment.dose,
      v_treatment.interval_value, v_treatment.interval_unit, v_treatment.starts_on, v_treatment.ends_on,
      v_treatment.note, v_treatment.created_by
    );
    insert into public.dose_logs (treatment_id, given_at, occurrence_id, created_by)
    select v_new_treatment, d.given_at, null, d.created_by
    from public.dose_logs d where d.treatment_id = v_treatment.id
    order by d.given_at, d.id;
  end loop;

  for v_visit in
    select * from public.vet_visits vv where vv.pet_id = src.id order by vv.visited_on, vv.created_at, vv.id
  loop
    v_new_visit := (coalesce(p_visit_id_map, '{}'::jsonb) ->> v_visit.id::text)::uuid;
    if v_new_visit is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'visit_id_map:invalid';
    end if;
    insert into public.vet_visits (
      id, pet_id, visited_on, clinic, reason, findings, recommendations, cost_minor, follow_up_on, created_by
    ) values (
      v_new_visit, p_new_pet_id, v_visit.visited_on, v_visit.clinic, v_visit.reason, v_visit.findings,
      v_visit.recommendations, v_visit.cost_minor, v_visit.follow_up_on, v_visit.created_by
    );

    for v_attachment in
      select * from public.attachments a where a.vet_visit_id = v_visit.id order by a.created_at, a.id
    loop
      v_new_key := coalesce(p_key_map, '{}'::jsonb) ->> v_attachment.r2_key;
      if v_new_key is null
         or left(v_new_key, char_length(prefix || 'visits/' || v_new_visit::text || '/'))
            <> prefix || 'visits/' || v_new_visit::text || '/' then
        raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'key_map:invalid';
      end if;
      insert into public.attachments (vet_visit_id, pet_id, r2_key, file_name, mime_type, size_bytes, created_by)
      values (
        v_new_visit, p_new_pet_id, v_new_key, v_attachment.file_name, v_attachment.mime_type,
        v_attachment.size_bytes, v_attachment.created_by
      );
    end loop;
  end loop;

  perform set_config('app.transfer_copy', 'off', true);

  update public.record_transfers
  set status = 'accepted', accepted_by = me, accepted_at = now(), new_pet_id = p_new_pet_id
  where id = t.id
  returning * into t;

  return private.transfer_view_json(t, me);
end;
$$;

revoke execute on function public.accept_record_transfer(text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.accept_record_transfer(text, uuid, jsonb, jsonb) to authenticated;

-- EP-60 decline — decline_record_transfer(p_token_hash) → TransferView (status declined) -------------------
create function public.decline_record_transfer(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t public.record_transfers;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  t := private.pending_transfer_for_update(p_token_hash);

  update public.record_transfers set status = 'declined' where id = t.id
  returning * into t;

  return private.transfer_view_json(t, me);
end;
$$;

revoke execute on function public.decline_record_transfer(text) from public, anon;
grant execute on function public.decline_record_transfer(text) to authenticated;
