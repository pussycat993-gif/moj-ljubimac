-- Step 17 — rpc:list_reminder_occurrences (EP-25) and rpc:mark_occurrence_done (EP-26), returning
-- API §6 ReminderOccurrence. Everything user-facing works on the instance = all rows sharing
-- (reminder_id, due_at); its final notice is the row with the latest notify_at, whose id identifies
-- the instance (API §5.3). Visibility (EP-25): the reminder's own user, or a household member who
-- switched reminders on (reminders_enabled) for a pet shared with them; active reminders only
-- (BR-17); organisation roles and the Operator have no personal reminders of others.

-- API §6 ReminderOccurrence for one instance, as the caller sees it. Security definer (channels read
-- preferences / deliveries / app_settings, done_by_name reads profiles), so it checks visibility
-- itself and returns null for an instance the caller may not see.
create function private.reminder_occurrence_json(p_reminder_id uuid, p_due_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with uid as (
    select (select auth.uid()) as id
  ),
  inst as (
    select
      (array_agg(o.id order by o.notify_at desc, o.id))[1] as final_id,
      array_agg(o.id) as row_ids,
      bool_or(o.status = 'done') as any_done,
      bool_or(o.sent_at is not null) as any_sent,
      max(o.done_at) filter (where o.status = 'done') as done_at,
      (array_agg(o.done_by order by o.done_at desc nulls last) filter (where o.status = 'done'))[1] as done_by
    from public.reminder_occurrences o
    where o.reminder_id = p_reminder_id
      and o.due_at = p_due_at
    having count(*) > 0
  )
  select jsonb_build_object(
    'id', i.final_id,
    'reminder_id', r.id,
    'type', r.type,
    'title', case r.type
      when 'manual' then r.title
      when 'vaccination' then (select v.name from public.vaccinations v where v.id = r.source_id)
      when 'treatment_dose' then (select t.name from public.treatments t where t.id = r.source_id)
      when 'vet_follow_up' then (select vv.reason from public.vet_visits vv where vv.id = r.source_id)
      else null
    end,
    'due_at', p_due_at,
    'status', case when i.any_done then 'done'::public.occurrence_status else f.status end,
    'display_status', case
      when i.any_done then 'done'
      when f.status = 'missed' then 'missed'
      when (p_due_at at time zone 'Europe/Belgrade')::date = (now() at time zone 'Europe/Belgrade')::date
        then 'today'
      else 'soon'
    end,
    'pet_id', p.id,
    'pet_name', p.name,
    'pet_sex', p.sex,
    'pet_species', p.species,
    'channels', case
      when i.any_sent then (
        select coalesce(jsonb_agg(c.channel order by c.channel), '[]'::jsonb)
        from (
          select distinct d.channel
          from public.reminder_deliveries d
          where d.occurrence_id = any (i.row_ids)
            and d.recipient_id = (select id from uid)
            and d.status = 'delivered'
        ) c
      )
      else (
        select coalesce(jsonb_agg(c.channel order by c.channel), '[]'::jsonb)
        from unnest(coalesce(
          (
            select rp.channels
            from public.reminder_preferences rp
            where rp.user_id = (select id from uid) and rp.type = r.type
          ),
          '{email,push}'::public.delivery_channel[]
        )) as c (channel)
        where c.channel in ('email', 'push')
           or (
             r.user_id = (select id from uid)
             and public.is_premium((select id from uid))
             and (
               c.channel = 'whatsapp'
               or (c.channel = 'viber'
                   and coalesce((select s.viber_enabled from public.app_settings s limit 1), false))
             )
           )
      )
    end,
    'sent_at', f.sent_at,
    'done_at', i.done_at,
    'done_by', i.done_by,
    'done_by_name', (select pr.full_name from public.profiles pr where pr.id = i.done_by),
    'is_shared', r.user_id <> (select id from uid),
    'can_mark_done', not i.any_done
      and (
        r.user_id = (select id from uid)
        or (r.pet_id is not null and not private.is_pet_household_read_only(r.pet_id))
      )
  )
  from inst i
  join public.reminder_occurrences f on f.id = i.final_id
  join public.reminders r on r.id = p_reminder_id
  left join public.pets p on p.id = r.pet_id
  where r.active
    and private.can_read_reminder(r.id);
$$;

revoke execute on function private.reminder_occurrence_json(uuid, timestamptz) from public, anon;
grant execute on function private.reminder_occurrence_json(uuid, timestamptz) to authenticated, service_role;

-- rpc:list_reminder_occurrences (EP-25) ------------------------------------------------------------
-- Security invoker: RLS on reminders (own, or opted-in member of a shared pet) and
-- reminder_occurrences (private.can_read_reminder) decides visibility; active reminders on
-- active pets only (BR-17). Filters, on the Europe/Belgrade calendar (NFR-02):
--   today    due date = today, not done, not missed — whole list, due_at asc
--   upcoming due from tomorrow 00:00 up to the 60-day window, not done — paged, due_at asc
--   missed   final notice missed (and not done) — paged, due_at desc
--   done     instance done — paged, done_at desc
--   next     due_at ≥ today 00:00, not done, not missed — paged, due_at asc (S03)
-- Returns { items: ReminderOccurrence[], total, counts: { today, upcoming, missed, done } };
-- total counts the requested filter, counts the four S10 tabs, both in the same pet scope.
create function public.list_reminder_occurrences(
  p_filter text,
  p_pet_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/Belgrade')::date;
  v_today_start timestamptz := ((now() at time zone 'Europe/Belgrade')::date)::timestamp at time zone 'Europe/Belgrade';
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_total integer;
  v_counts jsonb;
begin
  if p_filter is null or p_filter not in ('today', 'upcoming', 'missed', 'done', 'next') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'filter:invalid';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'limit:out_of_range';
  end if;
  if v_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'offset:out_of_range';
  end if;
  if p_pet_id is not null and not exists (select 1 from public.pets p where p.id = p_pet_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_filter = 'today' then
    v_limit := null;
    v_offset := 0;
  end if;

  with instances as (
    select
      o.reminder_id,
      o.due_at,
      (array_agg(o.id order by o.notify_at desc, o.id))[1] as final_id,
      (array_agg(o.status order by o.notify_at desc, o.id))[1] as final_status,
      bool_or(o.status = 'done') as any_done,
      max(o.done_at) filter (where o.status = 'done') as done_at
    from public.reminder_occurrences o
    join public.reminders r on r.id = o.reminder_id
    left join public.pets p on p.id = r.pet_id
    where r.active
      and (r.pet_id is null or p.lifecycle = 'active')
      and (p_pet_id is null or r.pet_id = p_pet_id)
    group by o.reminder_id, o.due_at
  ),
  classified as (
    select
      i.*,
      case
        when i.any_done then 'done'
        when i.final_status = 'missed' then 'missed'
        when (i.due_at at time zone 'Europe/Belgrade')::date = v_today then 'today'
        when (i.due_at at time zone 'Europe/Belgrade')::date > v_today
             and i.due_at <= v_now + interval '60 days' then 'upcoming'
        else null
      end as bucket,
      (not i.any_done and i.final_status <> 'missed' and i.due_at >= v_today_start) as is_next
    from instances i
  ),
  selected as (
    select c.*
    from classified c
    where (p_filter = 'next' and c.is_next) or (p_filter <> 'next' and c.bucket = p_filter)
  ),
  page as (
    select s.*
    from selected s
    order by
      case when p_filter = 'done' then s.done_at end desc,
      case when p_filter = 'missed' then s.due_at end desc,
      case when p_filter in ('today', 'upcoming', 'next') then s.due_at end asc,
      s.final_id
    limit v_limit offset v_offset
  )
  select
    (select coalesce(jsonb_agg(
       private.reminder_occurrence_json(pg.reminder_id, pg.due_at)
       order by
         case when p_filter = 'done' then pg.done_at end desc,
         case when p_filter = 'missed' then pg.due_at end desc,
         case when p_filter in ('today', 'upcoming', 'next') then pg.due_at end asc,
         pg.final_id
     ), '[]'::jsonb) from page pg),
    (select count(*)::integer from selected),
    (select jsonb_build_object(
       'today', count(*) filter (where c.bucket = 'today'),
       'upcoming', count(*) filter (where c.bucket = 'upcoming'),
       'missed', count(*) filter (where c.bucket = 'missed'),
       'done', count(*) filter (where c.bucket = 'done')
     ) from classified c)
  into v_items, v_total, v_counts;

  return jsonb_build_object('items', v_items, 'total', v_total, 'counts', v_counts);
end;
$$;

revoke execute on function public.list_reminder_occurrences(text, uuid, integer, integer) from public, anon;
grant execute on function public.list_reminder_occurrences(text, uuid, integer, integer) to authenticated, service_role;

-- rpc:mark_occurrence_done (EP-26) ------------------------------------------------------------------
-- Owner of the reminder, or a member who can see the instance (EP-25 rule). Clients have no write
-- path on reminder_occurrences (Step 08), so this runs as definer and checks the caller itself:
--   not visible (unknown, other user's, inactive reminder) → not_found;
--   already done → returned unchanged, original done_at / done_by (naturally idempotent);
--   member of a read-only household (BR-28) → household_read_only.
-- Every row of the instance → done, done_at = now(), done_by = the caller; a missed instance may
-- still be marked done. For a treatment_dose reminder a dose log is inserted once (same rule as
-- EP-11: unless a dose log for the instance already exists).
create function public.mark_occurrence_done(p_occurrence_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_target record;
begin
  if p_occurrence_id is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'occurrence_id:required';
  end if;

  select o.reminder_id, o.due_at, r.user_id, r.pet_id, r.type, r.source_id
  into v_target
  from public.reminder_occurrences o
  join public.reminders r on r.id = o.reminder_id
  left join public.pets p on p.id = r.pet_id
  where o.id = p_occurrence_id
    and r.active
    and (r.pet_id is null or p.lifecycle = 'active')
    and uid is not null
    and (r.user_id = uid or (r.pet_id is not null and private.is_pet_reminder_member(r.pet_id)));
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  -- Serialise concurrent marks of the same instance.
  perform 1
  from public.reminder_occurrences o
  where o.reminder_id = v_target.reminder_id and o.due_at = v_target.due_at
  for update;

  if exists (
    select 1
    from public.reminder_occurrences o
    where o.reminder_id = v_target.reminder_id
      and o.due_at = v_target.due_at
      and o.status = 'done'
  ) then
    return private.reminder_occurrence_json(v_target.reminder_id, v_target.due_at);
  end if;

  if v_target.user_id <> uid and private.is_pet_household_read_only(v_target.pet_id) then
    raise exception using errcode = 'P0001', message = 'household_read_only';
  end if;

  update public.reminder_occurrences o
  set status = 'done', done_at = now(), done_by = uid
  where o.reminder_id = v_target.reminder_id
    and o.due_at = v_target.due_at;

  if v_target.type = 'treatment_dose'
     and v_target.source_id is not null
     and not exists (
       select 1
       from public.dose_logs d
       join public.reminder_occurrences o on o.id = d.occurrence_id
       where o.reminder_id = v_target.reminder_id
         and o.due_at = v_target.due_at
     ) then
    begin
      insert into public.dose_logs (treatment_id, given_at, occurrence_id, created_by)
      values (v_target.source_id, now(), p_occurrence_id, uid);
    exception when unique_violation then
      -- A concurrent EP-11 / EP-26 call logged this occurrence first.
      null;
    end;
  end if;

  return private.reminder_occurrence_json(v_target.reminder_id, v_target.due_at);
end;
$$;

revoke execute on function public.mark_occurrence_done(uuid) from public, anon;
grant execute on function public.mark_occurrence_done(uuid) to authenticated, service_role;
