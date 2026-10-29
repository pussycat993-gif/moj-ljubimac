-- Step 29 — WhatsApp channel (FR-23, BR-14, BR-14a, BR-14b). The database side of the live channel, using
-- the Step 08 reminder_preferences checks and the Step 18 / 19 functions unchanged (no new migration):
-- EP-28 update through the Data API upsert (onConflict user_id,type): a Premium user with a connected number
-- saves whatsapp; without a number → whatsapp_not_connected; a Free user → premium_required:whatsapp; viber
-- while app_settings.viber_enabled = false → channel_disabled; EP-28 get returns viber_enabled and the
-- WhatsAppConnection; user_channels has no client write path (EP-30 writes it on the server);
-- EP-31 rpc:get_channel_usage counts this Europe/Belgrade month's delivered WhatsApp/Viber rows only, and
-- the dispatch claim (EP-33 step 3 input) carries the same BR-14a count, the opt-in and the channels.
-- Seeded: Ivana (…01, Premium), Marko (…02, Free).
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures (System) -----------------------------------------------------------------------------------
-- Nothing else is due during this test.
update public.reminder_occurrences set notify_at = now() + interval '1 day'
where status = 'pending' and notify_at <= now();

set local session_replication_role = replica;
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence, active) values
  ('e2900000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, 'manual',
   'WhatsApp — Step 29', now() - interval '1 day', 'none', true);
set local session_replication_role = origin;

-- EP-28 as Ivana (Premium), before a number is connected ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('manual', '{0}', '09:00', '{email,whatsapp}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'P0001', 'whatsapp_not_connected', 'FR-23 #2: whatsapp without a connected number → whatsapp_not_connected'
);
select is(
  public.get_reminder_settings() -> 'whatsapp',
  '{"channel":"whatsapp","status":"not_connected","phone":null,"connected_at":null}'::jsonb,
  'EP-28 get: WhatsAppConnection not_connected'
);
select throws_ok(
  $$insert into public.user_channels (user_id, channel, address, opted_in_at)
    values ('a1000000-0000-4000-8000-000000000001', 'whatsapp', '+381641234567', now())$$,
  '42501', null, 'user_channels has no client write path (EP-30 verifies on the server)'
);

-- EP-30 verify_code (service role on the server) upserts the verified number.
reset role;
insert into public.user_channels (user_id, channel, address, opted_in_at)
values ('a1000000-0000-4000-8000-000000000001', 'whatsapp', '+381641234567', '2026-10-29 08:00:00+00');
set local role authenticated;

select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('manual', '{0}', '09:00', '{email,whatsapp}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'FR-23 #2: a Premium user with a connected number saves whatsapp in a type''s channels'
);
select is(
  (select channels::text[] from public.reminder_preferences where type = 'manual'),
  '{email,whatsapp}'::text[], 'both selected channels are stored (FR-23 #5)'
);
select is(
  public.get_reminder_settings() -> 'whatsapp',
  '{"channel":"whatsapp","status":"connected","phone":"+381641234567","connected_at":"2026-10-29T08:00:00+00:00"}'::jsonb,
  'EP-28 get: WhatsAppConnection connected with the caller''s number'
);
select is(
  (public.get_reminder_settings() ->> 'viber_enabled')::boolean, false,
  'EP-28 get: viber_enabled = false, so S12 shows no Viber checkbox (BR-14b)'
);
select throws_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('manual', '{0}', '09:00', '{email,viber}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'P0001', 'channel_disabled', 'FR-23 #2: viber while switched off → channel_disabled (E-27)'
);
select is(
  (select channels::text[] from public.reminder_preferences where type = 'manual'),
  '{email,whatsapp}'::text[], 'a refused save leaves the stored channels unchanged'
);

-- EP-28 as Marko (Free) ------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('vaccination', '{10080,0}', '09:00', '{email,whatsapp}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'P0001', 'premium_required:whatsapp', 'FR-23 #3: a Free user saving whatsapp → premium_required (whatsapp)'
);
select throws_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('vaccination', '{10080,0}', '09:00', '{viber}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'P0001', 'channel_disabled', 'viber is refused for everyone while switched off'
);

-- EP-31 / BR-14a: the Belgrade calendar month ---------------------------------------------------------
reset role;
-- The EP-28 upserts above regenerate future pending occurrences of the type, so the notices come after them.
delete from public.reminder_occurrences where reminder_id = 'e2900000-0000-4000-8000-000000000001';
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at, status) values
  ('e2900000-0000-4000-8000-0000000000a1', 'e2900000-0000-4000-8000-000000000001', now() + interval '1 hour',
   now() - interval '1 minute', 'pending'),
  ('e2900000-0000-4000-8000-0000000000a2', 'e2900000-0000-4000-8000-000000000001', now() + interval '2 days',
   now() + interval '1 day', 'pending');

create temp table t_month as
select (date_trunc('month', now() at time zone 'Europe/Belgrade')) at time zone 'Europe/Belgrade' as starts_at;

insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status, provider_message_id, delivered_at)
select 'e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'whatsapp', 'delivered',
       'wamid.' || g, (select starts_at from t_month) + interval '30 minutes'
from generate_series(1, 28) g;
insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status, provider_message_id, error, delivered_at) values
  -- counted: one more WhatsApp and one Viber message this month
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'whatsapp', 'delivered', 'wamid.29', null, now()),
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'viber', 'delivered', 'vb.1', null, now()),
  -- not counted: last Belgrade month (still this month in UTC around midnight), failed, cap rows, email
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'whatsapp', 'delivered', 'wamid.old',
   null, (select starts_at from t_month) - interval '30 minutes'),
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'whatsapp', 'failed', 'wamid.f', 'whatsapp_500', null),
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'whatsapp', 'failed', null, 'whatsapp_cap_reached', null),
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'email', 'delivered', 're_1', null, now()),
  -- another user's message is not counted for Ivana
  ('e2900000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000002', 'whatsapp', 'delivered', 'wamid.m', null, now());

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.get_channel_usage(),
  jsonb_build_object(
    'month', to_char(now() at time zone 'Europe/Belgrade', 'YYYY-MM'),
    'used', 30, 'used_whatsapp', 29, 'used_viber', 1, 'cap', 30, 'remaining', 0,
    'resets_on', (date_trunc('month', now() at time zone 'Europe/Belgrade') + interval '1 month')::date
  ),
  'EP-31: get_channel_usage counts this Belgrade month''s delivered WhatsApp/Viber rows only (cap 30, BR-14a)'
);
reset role;

-- EP-33 step 3 input: the claimed notice carries the recipient's channels, opt-in and BR-14a count --------
create temp table t_claim as select public.claim_due_occurrences(200) as j;
create temp table t_recipient as
select r
from t_claim, jsonb_array_elements(j) e, jsonb_array_elements(e -> 'recipients') r
where e ->> 'occurrence_id' = 'e2900000-0000-4000-8000-0000000000a1';

select is((select count(*)::int from t_recipient), 1, 'the due WhatsApp reminder is claimed with its owner as the only recipient');
select is((select (r ->> 'whatsapp_opted_in')::boolean from t_recipient), true, 'the recipient''s verified number counts as opted in');
select is(
  (select array(select jsonb_array_elements_text(r -> 'channels')) from t_recipient),
  '{email,whatsapp}'::text[], 'the recipient''s channels for the type'
);
select is(
  (select (r ->> 'cap_used')::int from t_recipient), 30,
  'cap_used = 30 delivered this Belgrade month: the dispatch falls back to email + push (FR-23 #4)'
);
select is(
  (select (r ->> 'premium')::boolean from t_recipient), true, 'the recipient''s Premium flag (BR-16 fallback input)'
);

select * from finish();
rollback;
