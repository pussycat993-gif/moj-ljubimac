-- Step 18 — reminder settings RPCs: rpc:get_reminder_settings (EP-28 get), rpc:register_push_subscription
-- (EP-29 register) and rpc:get_channel_usage (EP-31), returning API §6 ReminderPreference,
-- WhatsAppConnection, PushSubscription and ChannelUsage. The EP-28 update stays a Data API upsert on
-- reminder_preferences: its validation (lead-time value set, delivery time, at least one channel, BR-13
-- exact time for doses and meals, premium_required / whatsapp_not_connected / channel_disabled) and its
-- side effect (future pending occurrences regenerated, done / missed history untouched) are the Step 08
-- check constraints and the reminder_preferences_before_write / reminder_preferences_regenerate triggers.
-- The seventh preference row (`message`) is added by Step 28c (Build Plan §4 invariant 11).

-- rpc:get_reminder_settings ---------------------------------------------------------------
-- Security definer so viber_enabled can be read from app_settings (Operator-only under RLS); every
-- read is scoped to auth.uid(). One ReminderPreference per reminder type in enum order (always 6);
-- a type without a stored row gets the 05- ReminderPreference defaults and is_default = true.
create function public.get_reminder_settings()
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

-- rpc:register_push_subscription -----------------------------------------------------------
-- Security definer: an endpoint already stored for another user (same browser, other account) is
-- re-assigned to the caller with the new keys (EP-29). endpoint must be an https:// URL
-- (fields.endpoint: invalid); p256dh and auth are base64url (required | invalid); user_agent is kept
-- for diagnostics only and cut to 300 characters. p256dh and auth are never returned.
create function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  saved public.push_subscriptions;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'endpoint:invalid';
  end if;
  if p_p256dh is null or btrim(p_p256dh) = '' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p256dh:required';
  end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]+=*$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p256dh:invalid';
  end if;
  if p_auth is null or btrim(p_auth) = '' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'auth:required';
  end if;
  if p_auth !~ '^[A-Za-z0-9_-]+=*$' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'auth:invalid';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(nullif(btrim(p_user_agent), ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent
  returning * into saved;

  return jsonb_build_object(
    'id', saved.id,
    'endpoint', saved.endpoint,
    'user_agent', saved.user_agent,
    'created_at', saved.created_at
  );
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated, service_role;

-- rpc:get_channel_usage --------------------------------------------------------------------
-- BR-14a counter: the caller's delivered WhatsApp / Viber messages in the current Europe/Belgrade
-- calendar month, cap 30, reset on the first day of the next month. Security invoker: RLS lets the
-- recipient read own reminder_deliveries rows.
create function public.get_channel_usage()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  month_start date := date_trunc('month', now() at time zone 'Europe/Belgrade')::date;
  next_month date := (date_trunc('month', now() at time zone 'Europe/Belgrade') + interval '1 month')::date;
  used_whatsapp integer;
  used_viber integer;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  select
    count(*) filter (where d.channel = 'whatsapp'),
    count(*) filter (where d.channel = 'viber')
  into used_whatsapp, used_viber
  from public.reminder_deliveries d
  where d.recipient_id = uid
    and d.channel in ('whatsapp', 'viber')
    and d.status = 'delivered'
    and d.delivered_at >= (month_start::timestamp at time zone 'Europe/Belgrade')
    and d.delivered_at < (next_month::timestamp at time zone 'Europe/Belgrade');

  return jsonb_build_object(
    'month', to_char(month_start, 'YYYY-MM'),
    'used', used_whatsapp + used_viber,
    'used_whatsapp', used_whatsapp,
    'used_viber', used_viber,
    'cap', 30,
    'remaining', greatest(0, 30 - used_whatsapp - used_viber),
    'resets_on', next_month
  );
end;
$$;

revoke execute on function public.get_channel_usage() from public, anon;
grant execute on function public.get_channel_usage() to authenticated, service_role;
