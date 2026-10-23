-- Step 19 — reminder dispatch (EP-33) and the action link (EP-32).
--   rpc:claim_due_occurrences(limit)        EP-33 step 1 (claim) with steps 2–3 inputs (recipients)
--   claim_resend_occurrences(limit)         EP-33 step 6 (BR-15 re-send of final notices)
--   mark_missed_occurrences()               EP-33 step 7 (BR-15, E-05)
--   dispatch_watchdog_due()                 EP-33 step 8 condition (RISK-14)
--   mark_occurrence_done_for(occ, user)     EP-32: the EP-26 effects with done_by = the recipient
--   private.call_internal_route(path)       pg_cron → pg_net → the app's internal routes (TC §8)
-- Every function here is for the service role (the dispatch route and the action-link route) only.

create extension if not exists pg_net;

-- A claimable notice (EP-33 step 1): its reminder is active, its pet (if any) is not a memorial
-- (BR-17), its owner is not pending deletion and its instance is not done.
create function private.is_dispatchable(p_occurrence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reminder_occurrences o
    join public.reminders r on r.id = o.reminder_id
    join public.profiles owner on owner.id = r.user_id
    left join public.pets p on p.id = r.pet_id
    where o.id = p_occurrence_id
      and r.active
      and (r.pet_id is null or p.lifecycle = 'active')
      and owner.deletion_requested_at is null
      and not exists (
        select 1
        from public.reminder_occurrences x
        where x.reminder_id = o.reminder_id
          and x.due_at = o.due_at
          and x.status = 'done'
      )
  );
$$;

-- One claimed notice with everything the route needs for EP-33 steps 2–5:
--   recipients (step 2) — the reminder owner, plus every opted-in (reminders_enabled) member of a
--     household the pet is shared with whose account is not pending deletion (BR-24, FR-29);
--   per recipient (step 3 inputs) — reminder_preferences.channels for the type (default
--     {email, push}), Premium, WhatsApp / Viber opt-in (user_channels.opted_in_at), the BR-14a
--     count of delivered WhatsApp/Viber messages this Europe/Belgrade calendar month, locale,
--     name and email, and the stored push endpoints (step 4).
create function private.dispatch_occurrence_json(p_occurrence_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with month_start as (
    select (date_trunc('month', now() at time zone 'Europe/Belgrade')) at time zone 'Europe/Belgrade' as at
  ),
  target as (
    select o.*, r.user_id as owner_id, r.pet_id, r.type, r.source_id, r.title as reminder_title
    from public.reminder_occurrences o
    join public.reminders r on r.id = o.reminder_id
    where o.id = p_occurrence_id
  ),
  recipient_ids as (
    select t.owner_id as id, true as is_owner from target t
    union
    select m.user_id, false
    from target t
    join public.household_pets hp on hp.pet_id = t.pet_id
    join public.household_memberships m on m.household_id = hp.household_id
    join public.profiles pr on pr.id = m.user_id
    where m.reminders_enabled
      and pr.deletion_requested_at is null
      and m.user_id <> t.owner_id
  )
  select jsonb_build_object(
    'occurrence_id', t.id,
    'reminder_id', t.reminder_id,
    'due_at', t.due_at,
    'notify_at', t.notify_at,
    'type', t.type,
    'title', case t.type
      when 'manual' then t.reminder_title
      when 'vaccination' then (select v.name from public.vaccinations v where v.id = t.source_id)
      when 'treatment_dose' then (select tr.name from public.treatments tr where tr.id = t.source_id)
      when 'vet_follow_up' then (select vv.reason from public.vet_visits vv where vv.id = t.source_id)
      else null
    end,
    'pet_id', t.pet_id,
    'pet_name', (select p.name from public.pets p where p.id = t.pet_id),
    'viber_enabled', coalesce((select s.viber_enabled from public.app_settings s limit 1), false),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'is_owner', ri.is_owner,
        'email', pr.email,
        'full_name', pr.full_name,
        'locale', pr.locale,
        'premium', public.is_premium(pr.id),
        'channels', to_jsonb(coalesce(
          (select rp.channels from public.reminder_preferences rp
           where rp.user_id = pr.id and rp.type::text = t.type::text),
          '{email,push}'::public.delivery_channel[]
        )),
        'whatsapp_opted_in', exists (
          select 1 from public.user_channels uc
          where uc.user_id = pr.id and uc.channel = 'whatsapp' and uc.opted_in_at is not null
        ),
        'viber_opted_in', exists (
          select 1 from public.user_channels uc
          where uc.user_id = pr.id and uc.channel = 'viber' and uc.opted_in_at is not null
        ),
        'cap_used', (
          select count(*)::integer
          from public.reminder_deliveries d
          where d.recipient_id = pr.id
            and d.channel in ('whatsapp', 'viber')
            and d.status = 'delivered'
            and d.delivered_at >= (select at from month_start)
        ),
        'push_subscriptions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth
          ) order by ps.created_at)
          from public.push_subscriptions ps
          where ps.user_id = pr.id
        ), '[]'::jsonb)
      ) order by ri.is_owner desc, pr.id)
      from recipient_ids ri
      join public.profiles pr on pr.id = ri.id
    ), '[]'::jsonb)
  )
  from target t;
$$;

revoke execute on function private.is_dispatchable(uuid) from public, anon, authenticated;
revoke execute on function private.dispatch_occurrence_json(uuid) from public, anon, authenticated;
grant execute on function private.is_dispatchable(uuid) to service_role;
grant execute on function private.dispatch_occurrence_json(uuid) to service_role;

-- rpc:claim_due_occurrences (EP-33 step 1) ---------------------------------------------------------
-- Claims up to p_limit (≤ 200) pending notices with notify_at ≤ now(): status → sent, sent_at = now().
-- FOR UPDATE SKIP LOCKED: overlapping runs can never claim the same row. Skips instances already done,
-- inactive reminders, memorial pets (BR-17) and owners with deletion_requested_at set; those rows stay
-- pending. Returns a jsonb array of private.dispatch_occurrence_json, oldest notify_at first.
create function public.claim_due_occurrences(p_limit integer default 200)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;

  with claimed as (
    update public.reminder_occurrences o
    set status = 'sent', sent_at = now()
    where o.id in (
      select c.id
      from public.reminder_occurrences c
      join public.reminders r on r.id = c.reminder_id
      join public.profiles owner on owner.id = r.user_id
      left join public.pets p on p.id = r.pet_id
      where c.status = 'pending'
        and c.notify_at <= now()
        and r.active
        and (r.pet_id is null or p.lifecycle = 'active')
        and owner.deletion_requested_at is null
        and not exists (
          select 1
          from public.reminder_occurrences x
          where x.reminder_id = c.reminder_id
            and x.due_at = c.due_at
            and x.status = 'done'
        )
      order by c.notify_at, c.id
      limit p_limit
      for update of c skip locked
    )
    returning o.id, o.notify_at
  )
  select array_agg(id order by notify_at, id) into v_ids from claimed;

  return coalesce((
    select jsonb_agg(private.dispatch_occurrence_json(c.id) order by c.ord)
    from unnest(v_ids) with ordinality as c (id, ord)
  ), '[]'::jsonb);
end;
$$;

-- claim_resend_occurrences (EP-33 step 6, BR-15) ---------------------------------------------------
-- Final notices (the row with the latest notify_at of the instance) with status = sent,
-- sent_at ≤ now() − 30 min and the instance not done are re-sent once, on the same rules as the claim:
-- status → resent, resent_at = now(). Earlier lead-time notices are never re-sent and stay sent.
-- Same return shape as claim_due_occurrences.
create function public.claim_resend_occurrences(p_limit integer default 200)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;

  with claimed as (
    update public.reminder_occurrences o
    set status = 'resent', resent_at = now()
    where o.id in (
      select c.id
      from public.reminder_occurrences c
      where c.status = 'sent'
        and c.sent_at <= now() - interval '30 minutes'
        and not exists (
          select 1
          from public.reminder_occurrences later
          where later.reminder_id = c.reminder_id
            and later.due_at = c.due_at
            and (later.notify_at > c.notify_at or (later.notify_at = c.notify_at and later.id < c.id))
        )
        and private.is_dispatchable(c.id)
      order by c.sent_at, c.id
      limit p_limit
      for update of c skip locked
    )
    returning o.id, o.sent_at
  )
  select array_agg(id order by sent_at, id) into v_ids from claimed;

  return coalesce((
    select jsonb_agg(private.dispatch_occurrence_json(c.id) order by c.ord)
    from unnest(v_ids) with ordinality as c (id, ord)
  ), '[]'::jsonb);
end;
$$;

-- mark_missed_occurrences (EP-33 step 7, BR-15, E-05) ----------------------------------------------
-- Final notices with status = resent, resent_at ≤ now() − 30 min and the instance not done → missed.
-- Returns the number of notices marked.
create function public.mark_missed_occurrences()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.reminder_occurrences o
  set status = 'missed'
  where o.status = 'resent'
    and o.resent_at <= now() - interval '30 minutes'
    and not exists (
      select 1
      from public.reminder_occurrences x
      where x.reminder_id = o.reminder_id
        and x.due_at = o.due_at
        and x.status = 'done'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- dispatch_watchdog_due (EP-33 step 8, RISK-14) ----------------------------------------------------
-- True when claimable pending notices are more than 15 minutes overdue and no delivery was recorded
-- in the last 15 minutes. Notices the claim skips by design (inactive, memorial, owner pending
-- deletion, instance done) are not counted. The route logs the condition at most once per hour.
create function public.dispatch_watchdog_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reminder_occurrences o
    where o.status = 'pending'
      and o.notify_at < now() - interval '15 minutes'
      and private.is_dispatchable(o.id)
  )
  and not exists (
    select 1
    from public.reminder_deliveries d
    where d.created_at > now() - interval '15 minutes'
  );
$$;

-- mark_occurrence_done_for (EP-32) ----------------------------------------------------------------
-- The action link marks the instance done as its recipient: the EP-26 rules and effects
-- (public.mark_occurrence_done) evaluated with auth.uid() = p_recipient_id, so the same access check
-- applies — the owner, or a member still opted in to a shared pet (else not_found); a member of a
-- read-only household → household_read_only; an instance already done is returned unchanged.
-- Returns API §6 ReminderOccurrence as the recipient sees it.
create function public.mark_occurrence_done_for(p_occurrence_id uuid, p_recipient_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_previous text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  if p_occurrence_id is null or p_recipient_id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  perform set_config('request.jwt.claim.sub', p_recipient_id::text, true);
  v_result := public.mark_occurrence_done(p_occurrence_id);
  perform set_config('request.jwt.claim.sub', coalesce(v_previous, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.claim_due_occurrences(integer) from public, anon, authenticated;
revoke execute on function public.claim_resend_occurrences(integer) from public, anon, authenticated;
revoke execute on function public.mark_missed_occurrences() from public, anon, authenticated;
revoke execute on function public.dispatch_watchdog_due() from public, anon, authenticated;
revoke execute on function public.mark_occurrence_done_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_due_occurrences(integer) to service_role;
grant execute on function public.claim_resend_occurrences(integer) to service_role;
grant execute on function public.mark_missed_occurrences() to service_role;
grant execute on function public.dispatch_watchdog_due() to service_role;
grant execute on function public.mark_occurrence_done_for(uuid, uuid) to service_role;

-- pg_cron → app (TC §8, ADR-04) ------------------------------------------------------------------
-- POSTs to <dispatch_url><p_path> with header X-Dispatch-Secret = dispatch_secret, both read by name
-- from Supabase Vault (set per environment by the owner; never stored in a migration). Does nothing
-- and returns null while either secret is missing — e.g. locally, so local runs never call out.
create function private.call_internal_route(p_path text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'dispatch_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'dispatch_secret';
  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || p_path,
    body := jsonb_build_object('run_at', now()),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Dispatch-Secret', v_secret),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function private.call_internal_route(text) from public, anon, authenticated;

-- Every minute (ADR-04, NFR-01): the dispatch route claims, sends, re-sends and marks missed.
select cron.schedule(
  'reminder-dispatch',
  '* * * * *',
  $$select private.call_internal_route('/api/internal/dispatch')$$
);
