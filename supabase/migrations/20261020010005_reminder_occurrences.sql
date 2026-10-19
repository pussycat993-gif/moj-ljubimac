-- Step 08 — reminder occurrences: reminder_occurrences and reminder_deliveries (TC §5.5),
-- the dose_logs.occurrence_id FK (TC §5.3), the occurrence-generation functions
-- (TC §5.5 rolling 60-day window, API §5.3 "Occurrence instances", EP-27/EP-28 side
-- effects, BR-13, NFR-02) and RLS (API §4.4, EP-25).

create type public.occurrence_status as enum ('pending', 'sent', 'resent', 'done', 'missed');
create type public.delivery_status as enum ('delivered', 'failed');

-- reminder_occurrences — one row per lead time of each due instance. An instance is all
-- rows sharing (reminder_id, due_at) (API §5.3).
create table public.reminder_occurrences (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  due_at timestamptz not null,
  -- due_at minus a lead time.
  notify_at timestamptz not null,
  status public.occurrence_status not null default 'pending',
  sent_at timestamptz,
  resent_at timestamptz,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The every-minute dispatch lookup (ADR-04, EP-33 claim).
create index reminder_occurrences_pending_notify_at_idx
  on public.reminder_occurrences (notify_at) where status = 'pending';
-- The 30-minute re-send lookup (BR-15).
create index reminder_occurrences_sent_sent_at_idx
  on public.reminder_occurrences (sent_at) where status = 'sent';

create trigger reminder_occurrences_set_updated_at
before update on public.reminder_occurrences
for each row execute function public.set_updated_at();

-- reminder_deliveries (Reminder Delivery) — one row per recipient × channel (EP-33).
create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.reminder_occurrences (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null,
  provider_message_id text,
  error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Monthly WhatsApp/Viber cap count (BR-14a).
create index reminder_deliveries_recipient_channel_delivered_at_idx
  on public.reminder_deliveries (recipient_id, channel, delivered_at);
-- North-star query and the 12-month retention purge (NFR-08).
create index reminder_deliveries_delivered_at_idx on public.reminder_deliveries (delivered_at);

create trigger reminder_deliveries_set_updated_at
before update on public.reminder_deliveries
for each row execute function public.set_updated_at();

-- dose_logs.occurrence_id → reminder_occurrences (TC §5.3; the column is from Step 06).
-- A dose log outlives its occurrence.
alter table public.dose_logs
  add constraint dose_logs_occurrence_id_fkey
  foreign key (occurrence_id) references public.reminder_occurrences (id) on delete set null;

-- Occurrence generation ------------------------------------------------------------------
-- All schedule arithmetic runs on the Europe/Belgrade wall clock and is stored as UTC
-- (NFR-02, TC §5 conventions), so an 08:00 reminder stays at 08:00 across DST changes.

-- Defaults when a user has no reminder_preferences row (05- ReminderPreference, BR-48).
create function private.default_lead_minutes(p_type public.reminder_type)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'vaccination' then '{10080,0}'::integer[]
    when 'vet_follow_up' then '{1440,0}'::integer[]
    else '{0}'::integer[]
  end;
$$;

-- Due times of one reminder in (p_from, p_to]:
--   vaccination / vet_follow_up / birthday: the date of starts_at at the delivery time
--     (EP-09, EP-12);
--   treatment_dose / manual: starts_at itself;
--   recurrence none = once; hourly_interval = every interval_value hours (elapsed time);
--   daily = every interval_value (default 1) days; weekly / monthly / yearly = every
--   week / month / year, counted from starts_at so month ends do not drift;
--   meal: every meal_times × meal_weekdays (1 = Monday) (FR-15);
--   nothing after ends_at.
create function private.reminder_due_times(
  p_type public.reminder_type,
  p_starts_at timestamptz,
  p_recurrence public.reminder_recurrence,
  p_interval_value integer,
  p_meal_times time[],
  p_meal_weekdays smallint[],
  p_ends_at timestamptz,
  p_delivery_time time,
  p_from timestamptz,
  p_to timestamptz
)
returns setof timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  tz constant text := 'Europe/Belgrade';
  upper_bound timestamptz := least(p_to, coalesce(p_ends_at, p_to));
  base_local timestamp;
  step interval;
  approx_step_seconds numeric;
  k integer;
  due timestamptz;
  d date;
  t time;
begin
  if p_type = 'meal' then
    if p_meal_times is null or p_meal_weekdays is null then
      return;
    end if;
    for d in
      select g::date
      from generate_series(
        (p_from at time zone tz)::date, (upper_bound at time zone tz)::date, interval '1 day'
      ) g
    loop
      if extract(isodow from d)::smallint = any (p_meal_weekdays) then
        foreach t in array p_meal_times loop
          due := (d + t) at time zone tz;
          if due > p_from and due <= upper_bound
             and (p_starts_at is null or due >= p_starts_at) then
            return next due;
          end if;
        end loop;
      end if;
    end loop;
    return;
  end if;

  if p_starts_at is null then
    return;
  end if;

  if p_recurrence = 'hourly_interval' then
    step := make_interval(hours => coalesce(p_interval_value, 1));
    k := greatest(0, floor(extract(epoch from (p_from - p_starts_at)) / extract(epoch from step))::integer);
    loop
      due := p_starts_at + k * step;
      exit when due > upper_bound;
      if due > p_from then
        return next due;
      end if;
      k := k + 1;
    end loop;
    return;
  end if;

  base_local := p_starts_at at time zone tz;
  if p_type in ('vaccination', 'vet_follow_up', 'birthday') then
    base_local := base_local::date + coalesce(p_delivery_time, time '09:00');
  end if;

  if p_recurrence = 'none' then
    due := base_local at time zone tz;
    if due > p_from and due <= upper_bound then
      return next due;
    end if;
    return;
  end if;

  step := case p_recurrence
    when 'daily' then make_interval(days => coalesce(p_interval_value, 1))
    when 'weekly' then make_interval(weeks => coalesce(p_interval_value, 1))
    when 'monthly' then make_interval(months => coalesce(p_interval_value, 1))
    else make_interval(years => coalesce(p_interval_value, 1))
  end;
  approx_step_seconds := coalesce(p_interval_value, 1) * case p_recurrence
    when 'daily' then 86400
    when 'weekly' then 604800
    when 'monthly' then 2629746
    else 31556952
  end;
  -- Skip whole periods before p_from; two periods of margin for calendar irregularities.
  k := greatest(0, floor(extract(epoch from (p_from - p_starts_at)) / approx_step_seconds)::integer - 2);
  loop
    due := (base_local + k * step) at time zone tz;
    exit when due > upper_bound;
    if due > p_from then
      return next due;
    end if;
    k := k + 1;
  end loop;
end;
$$;

-- notify_at of one lead time (FR-22, BR-13): lead 0 → the due time itself; an earlier
-- lead → that many days before the due date, at the delivery time.
create function private.reminder_notify_at(
  p_due_at timestamptz,
  p_lead_minutes integer,
  p_delivery_time time
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_lead_minutes = 0 then p_due_at
    else (
      ((p_due_at at time zone 'Europe/Belgrade')::date - (p_lead_minutes / 1440))
      + coalesce(p_delivery_time, time '09:00')
    ) at time zone 'Europe/Belgrade'
  end;
$$;

-- Regenerates occurrences of one reminder (p_reminder_id) or of every reminder (null):
--   1. deletes future pending rows (notify_at > p_now);
--   2. inserts one row per lead time (owner's reminder_preferences for the type, defaults
--      if none; treatment_dose and meal always lead 0) for every instance due inside the
--      rolling 60-day window (p_now, p_now + 60 days] of an active reminder, skipping
--      notices already past, rows that still exist (sent, resent, past pending) and
--      instances already done.
-- Done and missed rows are never touched.
create function private.regenerate_reminder_occurrences(p_reminder_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reminder_occurrences o
  where o.status = 'pending'
    and o.notify_at > p_now
    and (p_reminder_id is null or o.reminder_id = p_reminder_id);

  insert into public.reminder_occurrences (reminder_id, due_at, notify_at)
  select distinct c.reminder_id, c.due_at, c.notify_at
  from (
    select
      r.id as reminder_id,
      d.due_at,
      private.reminder_notify_at(d.due_at, l.lead, s.delivery_time) as notify_at
    from public.reminders r
    left join public.reminder_preferences p on p.user_id = r.user_id and p.type = r.type
    cross join lateral (
      select
        case
          when r.type in ('treatment_dose', 'meal') then '{0}'::integer[]
          else coalesce(p.lead_minutes, private.default_lead_minutes(r.type))
        end as leads,
        case
          when r.type in ('treatment_dose', 'meal') then null::time
          else coalesce(p.delivery_time, time '09:00')
        end as delivery_time
    ) s
    cross join lateral private.reminder_due_times(
      r.type, r.starts_at, r.recurrence, r.interval_value, r.meal_times, r.meal_weekdays,
      r.ends_at, s.delivery_time, p_now, p_now + interval '60 days'
    ) as d (due_at)
    cross join lateral unnest(s.leads) as l (lead)
    where r.active
      and (p_reminder_id is null or r.id = p_reminder_id)
  ) c
  where c.notify_at > p_now
    and not exists (
      select 1
      from public.reminder_occurrences o
      where o.reminder_id = c.reminder_id
        and o.due_at = c.due_at
        and (o.notify_at = c.notify_at or o.status = 'done')
    );
end;
$$;

-- One reminder (reminders and reminder_preferences triggers, EP-27, EP-28).
create function private.generate_reminder_occurrences(
  p_reminder_id uuid,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reminder_id is not null then
    perform private.regenerate_reminder_occurrences(p_reminder_id, p_now);
  end if;
end;
$$;

-- Every active reminder at once — the nightly refresh (TC §8, occurrence_schedule).
create function private.generate_all_reminder_occurrences(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.regenerate_reminder_occurrences(null, p_now);
end;
$$;

revoke execute on function private.default_lead_minutes(public.reminder_type) from public, anon, authenticated;
revoke execute on function private.reminder_due_times(
  public.reminder_type, timestamptz, public.reminder_recurrence, integer, time[], smallint[],
  timestamptz, time, timestamptz, timestamptz
) from public, anon, authenticated;
revoke execute on function private.reminder_notify_at(timestamptz, integer, time) from public, anon, authenticated;
revoke execute on function private.regenerate_reminder_occurrences(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.generate_reminder_occurrences(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.generate_all_reminder_occurrences(timestamptz) from public, anon, authenticated;
grant execute on function private.generate_reminder_occurrences(uuid, timestamptz) to service_role;
grant execute on function private.generate_all_reminder_occurrences(timestamptz) to service_role;

-- reminders insert/update → (re)generate its occurrences (EP-27 side effects).
create function public.reminders_generate_occurrences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.generate_reminder_occurrences(new.id);
  return null;
end;
$$;

create trigger reminders_generate_occurrences
after insert or update on public.reminders
for each row execute function public.reminders_generate_occurrences();

-- reminder_preferences insert/update → regenerate the owner's reminders of that type
-- (EP-28 side effects). A new delivery time also moves starts_at of date-based reminders
-- (EP-09: starts_at = date at the delivery time).
create function public.reminder_preferences_regenerate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
begin
  if new.type in ('vaccination', 'vet_follow_up', 'birthday')
     and (tg_op = 'INSERT' or new.delivery_time is distinct from old.delivery_time) then
    update public.reminders r
    set starts_at = ((r.starts_at at time zone 'Europe/Belgrade')::date + new.delivery_time)
                    at time zone 'Europe/Belgrade'
    where r.user_id = new.user_id
      and r.type = new.type
      and r.starts_at is not null
      and r.starts_at is distinct from
          ((r.starts_at at time zone 'Europe/Belgrade')::date + new.delivery_time)
          at time zone 'Europe/Belgrade';
  end if;

  for rid in
    select r.id from public.reminders r where r.user_id = new.user_id and r.type = new.type
  loop
    perform private.generate_reminder_occurrences(rid);
  end loop;
  return null;
end;
$$;

create trigger reminder_preferences_regenerate
after insert or update on public.reminder_preferences
for each row execute function public.reminder_preferences_regenerate();

revoke execute on function public.reminders_generate_occurrences() from public, anon, authenticated;
revoke execute on function public.reminder_preferences_regenerate() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.reminder_occurrences enable row level security;
alter table public.reminder_deliveries enable row level security;

revoke all on table public.reminder_occurrences from anon, authenticated;
revoke all on table public.reminder_deliveries from anon, authenticated;

-- reminder_occurrences: read with the reminder (owner, opted-in member, EP-25). No client
-- writes: done marking is EP-26's RPC (Step 17), sending the dispatch job (EP-33).
grant select on table public.reminder_occurrences to authenticated;

create policy reminder_occurrences_select on public.reminder_occurrences
  for select to authenticated
  using (private.can_read_reminder(reminder_id));

-- reminder_deliveries: the recipient reads own rows; written by the dispatch job only.
grant select on table public.reminder_deliveries to authenticated;

create policy reminder_deliveries_select_own on public.reminder_deliveries
  for select to authenticated
  using (recipient_id = (select auth.uid()));
