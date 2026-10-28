-- Step 28a — CAP-08 columns (TC v1.7 §5.1, §5.2, §5.5): profiles.display_name and
-- marketplace_suspended_at, the four organisations donation columns, and the reminder_preferences
-- type `message` (FR-69) with its checks and default row. None of these existed: Steps 04, 05 and 08
-- left them to this step (Build Plan §4 invariant 11).
--
-- Owner decision (2026-10-28, option 1 with guards): the docs' preference_type is public.reminder_type
-- (Step 08). Guards: no reminders of type message; message rows may have empty channels, only email /
-- push, and no delivery time; get_reminder_settings skips message until Step 28c adds the S12 row.

-- profiles (TC §5.1) ------------------------------------------------------------------------------
alter table public.profiles
  add column display_name text
    constraint profiles_display_name_check check (char_length(display_name) between 2 and 40),
  add column marketplace_suspended_at timestamptz;

-- EP-43 update: display_name joins the client-writable columns. marketplace_suspended_at has no
-- client write path (EP-86 uses the service role).
grant update (display_name) on table public.profiles to authenticated;

-- EP-43: profile edits stay refused while deletion is pending — display_name included.
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
begin
  if tg_op = 'INSERT' then
    select u.email into auth_email from auth.users u where u.id = new.id;
    new.email := coalesce(auth_email, new.email);
  end if;

  if tg_op = 'UPDATE'
     and old.deletion_requested_at is not null
     and new.deletion_requested_at is not null
     and (new.full_name is distinct from old.full_name
          or new.city_id is distinct from old.city_id
          or new.locale is distinct from old.locale
          or new.display_name is distinct from old.display_name) then
    raise exception using errcode = 'P0001', message = 'account_pending_deletion';
  end if;

  new.deletion_due_at := case
    when new.deletion_requested_at is null then null
    else new.deletion_requested_at + interval '30 days'
  end;
  return new;
end;
$$;

revoke execute on function public.profiles_before_write() from public, anon, authenticated;

-- organisations (TC §5.2) -------------------------------------------------------------------------
-- Donation info shown by "Doniraj" (FR-66, FR-72). Plain text and a URL — no payment is stored (BR-58).
alter table public.organisations
  add column donation_bank_account text,
  add column donation_url text
    constraint organisations_donation_url_check check (donation_url ~ '^https://'),
  add column dropoff_address text,
  add column dropoff_hours text;

-- Donation columns are read only through EP-78 / EP-53 definer functions (Step 28b), never through
-- a direct table read: the table-level SELECT of Step 05 becomes a column grant without them
-- (owner decision for Step 28a).
revoke select on table public.organisations from anon, authenticated;
grant select (
  id, type, name, slug, city_id, approval_status, rejection_reason, tax_id, registration_note,
  description, phone, email, website, logo_r2_key, created_by, created_at, updated_at
) on table public.organisations to authenticated;

-- FR-72 / EP-88: an Admin updates the donation columns of their own organisation
-- (organisations_update_admin policy; Volunteers are refused by it).
grant update (donation_bank_account, donation_url, dropoff_address, dropoff_hours)
  on table public.organisations to authenticated;

-- reminders: the type message has no reminders or occurrences (TC §5.5) ----------------------------
alter table public.reminders
  add constraint reminders_type_not_message_check check (type <> 'message');

-- reminder_preferences (TC §5.5, EP-28) -----------------------------------------------------------
-- message: channels a subset of {email, push}, may be empty (= notifications off); no delivery time.
alter table public.reminder_preferences
  drop constraint reminder_preferences_channels_check,
  add constraint reminder_preferences_channels_check
    check (type = 'message' or cardinality(channels) >= 1),
  add constraint reminder_preferences_message_channels_check
    check (type <> 'message' or channels <@ '{email,push}'::public.delivery_channel[]),
  drop constraint reminder_preferences_delivery_time_check,
  add constraint reminder_preferences_delivery_time_check
    check ((type in ('treatment_dose', 'meal', 'message')) = (delivery_time is null));

-- EP-28 write rules: doses, meals and message are stored as lead {0} with no delivery time. The
-- WhatsApp / Viber rules apply to the six reminder types; a message row with either channel is
-- refused by reminder_preferences_message_channels_check.
create or replace function public.reminder_preferences_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if new.type in ('treatment_dose', 'meal', 'message') then
    new.lead_minutes := '{0}';
    new.delivery_time := null;
  end if;

  -- Checked for a signed-in caller writing own preferences; System paths (EP-30
  -- disconnect, service role) are unaffected.
  if caller is not null and new.user_id = caller and new.type <> 'message' then
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

revoke execute on function public.reminder_preferences_before_write() from public, anon, authenticated;

-- BR-48 + FR-69: every new profile gets the six reminder rows and the message row {email, push}
-- (the Step 08 mechanism, extended).
create or replace function public.profiles_create_reminder_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reminder_preferences (user_id, type, lead_minutes, delivery_time, channels)
  values
    (new.id, 'vaccination', '{10080,0}', '09:00', '{email,push}'),
    (new.id, 'treatment_dose', '{0}', null, '{email,push}'),
    (new.id, 'vet_follow_up', '{1440,0}', '09:00', '{email,push}'),
    (new.id, 'meal', '{0}', null, '{email,push}'),
    (new.id, 'birthday', '{0}', '09:00', '{email,push}'),
    (new.id, 'manual', '{0}', '09:00', '{email,push}'),
    (new.id, 'message', '{0}', null, '{email,push}')
  on conflict (user_id, type) do nothing;
  return null;
end;
$$;

revoke execute on function public.profiles_create_reminder_preferences() from public, anon, authenticated;

-- Existing profiles get their message row.
insert into public.reminder_preferences (user_id, type, lead_minutes, delivery_time, channels)
select p.id, 'message', '{0}', null, '{email,push}'
from public.profiles p
on conflict (user_id, type) do nothing;

-- rpc:get_reminder_settings (Step 18), recreated with the same body except that it skips the message
-- type: the seventh row and the S12 Poruke card come with Step 28c (owner decision).
create or replace function public.get_reminder_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  return jsonb_build_object(
    'preferences', (
      select jsonb_agg(
        jsonb_build_object(
          'type', t.type,
          'lead_minutes', to_jsonb(
            case
              when t.type in ('treatment_dose', 'meal') then '{0}'::integer[]
              else coalesce(p.lead_minutes, private.default_lead_minutes(t.type))
            end
          ),
          'delivery_time', case
            when t.type in ('treatment_dose', 'meal') then null
            else left(coalesce(p.delivery_time, time '09:00')::text, 5)
          end,
          'channels', to_jsonb(coalesce(p.channels, '{email,push}'::public.delivery_channel[])),
          'fixed_time', t.type in ('treatment_dose', 'meal'),
          'is_default', p.id is null,
          'updated_at', p.updated_at
        )
        order by t.ord
      )
      from unnest(enum_range(null::public.reminder_type)) with ordinality as t (type, ord)
      left join public.reminder_preferences p on p.user_id = uid and p.type = t.type
      where t.type <> 'message'
    ),
    'viber_enabled', coalesce((select s.viber_enabled from public.app_settings s limit 1), false),
    'whatsapp', (
      select jsonb_build_object(
        'channel', 'whatsapp',
        'status', case when c.opted_in_at is not null then 'connected' else 'not_connected' end,
        'phone', case when c.opted_in_at is not null then c.address end,
        'connected_at', c.opted_in_at
      )
      from (select 1) as one
      left join public.user_channels c on c.user_id = uid and c.channel = 'whatsapp'
    )
  );
end;
$$;

revoke execute on function public.get_reminder_settings() from public, anon;
grant execute on function public.get_reminder_settings() to authenticated, service_role;
