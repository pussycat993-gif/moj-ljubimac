-- Step 08 — reminders: reminders and reminder_preferences (TC §5.5), their write rules
-- and RLS (API §4.4, EP-25, EP-27, EP-28). Occurrences, deliveries and the generation
-- function are in the reminder_occurrences migration; source triggers in
-- reminder_triggers.

create type public.reminder_type as enum (
  'vaccination', 'treatment_dose', 'vet_follow_up', 'meal', 'birthday', 'manual'
);
create type public.reminder_recurrence as enum (
  'none', 'hourly_interval', 'daily', 'weekly', 'monthly', 'yearly'
);
-- Shared by reminder_preferences.channels and reminder_deliveries.channel.
create type public.delivery_channel as enum ('email', 'push', 'whatsapp', 'viber');

-- reminders (Reminder) — the definition.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  -- EP-27: defaults to the caller and is not client-writable.
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  type public.reminder_type not null,
  source_id uuid,
  title text,
  starts_at timestamptz,
  recurrence public.reminder_recurrence not null default 'none',
  interval_value integer check (interval_value > 0),
  meal_times time[],
  meal_weekdays smallint[] check (meal_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Every type except meal is scheduled from starts_at (EP-09, EP-10, EP-27).
  constraint reminders_starts_at_check check (type = 'meal' or starts_at is not null),
  -- BR-18 / EP-27: manual reminders repeat none / daily / weekly / monthly / yearly.
  constraint reminders_manual_recurrence_check
    check (type <> 'manual' or recurrence <> 'hourly_interval')
);

-- E-01: find the reminder of a vaccination / treatment / vet visit.
create index reminders_source_id_idx on public.reminders (source_id);
-- One meal schedule per pet (EP-19).
create unique index reminders_one_meal_per_pet on public.reminders (pet_id) where type = 'meal';

create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

-- reminder_preferences — per-user, per-type settings (FR-22, FR-23).
create table public.reminder_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type public.reminder_type not null,
  -- EP-28 value set: 0 / 1 / 3 / 7 / 14 / 30 days, 1–6 values.
  lead_minutes integer[] not null default '{0}'
    check (
      cardinality(lead_minutes) between 1 and 6
      and lead_minutes <@ array[0, 1440, 4320, 10080, 20160, 43200]
    ),
  delivery_time time,
  channels public.delivery_channel[] not null default '{email,push}'
    check (cardinality(channels) >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type),
  -- BR-13: doses and meals go at the exact time, every other type at a time of day.
  constraint reminder_preferences_delivery_time_check
    check ((type in ('treatment_dose', 'meal')) = (delivery_time is null))
);

create trigger reminder_preferences_set_updated_at
before update on public.reminder_preferences
for each row execute function public.set_updated_at();

-- RLS helpers --------------------------------------------------------------------------
-- The caller is a household member who switched reminders on (FR-29) in a household
-- the pet is shared with (EP-25).
create function private.is_pet_reminder_member(pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_pets hp
    join public.household_memberships m on m.household_id = hp.household_id
    where hp.pet_id = is_pet_reminder_member.pet_id
      and m.user_id = (select auth.uid())
      and m.reminders_enabled
  );
$$;

-- The caller may see a reminder and its occurrences: its owner, or an opted-in member
-- of a household its pet is shared with (EP-25). Organisation roles and the Operator
-- have no relation to personal reminders.
create function private.can_read_reminder(reminder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reminders r
    where r.id = can_read_reminder.reminder_id
      and (
        r.user_id = (select auth.uid())
        or (r.pet_id is not null and private.is_pet_reminder_member(r.pet_id))
      )
  );
$$;

revoke execute on function private.is_pet_reminder_member(uuid) from public, anon;
revoke execute on function private.can_read_reminder(uuid) from public, anon;
grant execute on function private.is_pet_reminder_member(uuid) to authenticated, service_role;
grant execute on function private.can_read_reminder(uuid) to authenticated, service_role;

-- BR-17: a reminder on a memorial pet is never active (every writer).
create function public.reminders_memorial_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pet_id is not null
     and exists (
       select 1 from public.pets p where p.id = new.pet_id and p.lifecycle = 'memorial'
     ) then
    new.active := false;
  end if;
  return new;
end;
$$;

create trigger reminders_memorial_inactive
before insert or update on public.reminders
for each row execute function public.reminders_memorial_inactive();

-- Client write rules on reminders (EP-27). Only checked for client sessions; triggers
-- and System paths are unaffected. RLS limits client writes to own manual reminders.
--   shelter/breeder accounts → forbidden_role;
--   a pet the caller does not own but can see (household member) → forbidden_role;
--   a pet with no relation falls through to the RLS check.
create function public.reminders_check_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or tg_op = 'DELETE' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_type <> 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  if new.pet_id is not null
     and not private.is_pet_owner(new.pet_id)
     and private.can_read_pet(new.pet_id) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  return new;
end;
$$;

create trigger reminders_check_write
before insert or update on public.reminders
for each row execute function public.reminders_check_write();

-- Client write rules on reminder_preferences (EP-28):
--   treatment_dose / meal: stored as lead {0} and no delivery time (BR-13), every writer;
--   the channel rules below apply to a signed-in caller's own row:
--   whatsapp: Premium → else premium_required:whatsapp; a connected number → else
--     whatsapp_not_connected;
--   viber: off → channel_disabled (BR-14b); on → Premium as for WhatsApp and a
--     connected Viber identity → else whatsapp_not_connected:viber.
create function public.reminder_preferences_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if new.type in ('treatment_dose', 'meal') then
    new.lead_minutes := '{0}';
    new.delivery_time := null;
  end if;

  -- Checked for a signed-in caller writing own preferences; System paths (EP-30
  -- disconnect, service role) are unaffected.
  if caller is not null and new.user_id = caller then
    if 'viber' = any (new.channels) then
      if not coalesce((select s.viber_enabled from public.app_settings s limit 1), false) then
        raise exception using errcode = 'P0001', message = 'channel_disabled';
      end if;
      if not public.is_premium(caller) then
        raise exception using errcode = 'P0001', message = 'premium_required:whatsapp';
      end if;
      if not exists (
        select 1 from public.user_channels c
        where c.user_id = caller and c.channel = 'viber' and c.opted_in_at is not null
      ) then
        raise exception using errcode = 'P0001', message = 'whatsapp_not_connected:viber';
      end if;
    end if;

    if 'whatsapp' = any (new.channels) then
      if not public.is_premium(caller) then
        raise exception using errcode = 'P0001', message = 'premium_required:whatsapp';
      end if;
      if not exists (
        select 1 from public.user_channels c
        where c.user_id = caller and c.channel = 'whatsapp' and c.opted_in_at is not null
      ) then
        raise exception using errcode = 'P0001', message = 'whatsapp_not_connected';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger reminder_preferences_before_write
before insert or update on public.reminder_preferences
for each row execute function public.reminder_preferences_before_write();

revoke execute on function public.reminders_memorial_inactive() from public, anon, authenticated;
revoke execute on function public.reminder_preferences_before_write() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------------------
alter table public.reminders enable row level security;
alter table public.reminder_preferences enable row level security;

revoke all on table public.reminders from anon, authenticated;
revoke all on table public.reminder_preferences from anon, authenticated;

-- reminders: the owner reads own reminders; an opted-in member reads the reminders of
-- shared pets (EP-25 joins them). Clients write only own manual reminders (EP-27);
-- every other type is written by triggers. user_id and type are fixed after insert.
grant select, delete on table public.reminders to authenticated;
grant insert (type, title, pet_id, starts_at, recurrence) on table public.reminders to authenticated;
grant update (title, pet_id, starts_at, recurrence) on table public.reminders to authenticated;

create policy reminders_select on public.reminders
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (pet_id is not null and private.is_pet_reminder_member(pet_id))
  );

create policy reminders_insert_manual on public.reminders
  for insert to authenticated
  with check (
    type = 'manual'
    and user_id = (select auth.uid())
    and (pet_id is null or private.is_pet_owner(pet_id))
  );

create policy reminders_update_manual on public.reminders
  for update to authenticated
  using (type = 'manual' and user_id = (select auth.uid()))
  with check (
    type = 'manual'
    and user_id = (select auth.uid())
    and (pet_id is null or private.is_pet_owner(pet_id))
  );

create policy reminders_delete_manual on public.reminders
  for delete to authenticated
  using (type = 'manual' and user_id = (select auth.uid()));

-- reminder_preferences: self only (EP-28 upsert on (user_id, type)).
grant select on table public.reminder_preferences to authenticated;
grant insert (type, lead_minutes, delivery_time, channels)
  on table public.reminder_preferences to authenticated;
grant update (type, lead_minutes, delivery_time, channels)
  on table public.reminder_preferences to authenticated;

create policy reminder_preferences_select_own on public.reminder_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reminder_preferences_insert_own on public.reminder_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy reminder_preferences_update_own on public.reminder_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
