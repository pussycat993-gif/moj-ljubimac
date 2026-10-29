-- Step 28c — the reminder_preferences row of type message (FR-69, EP-28; owner decision: preference_type =
-- reminder_type): rpc:get_reminder_settings returns seven rows incl. message; a new profile's message row is
-- {email, push} (FR-69 #3); the EP-28 upsert accepts {}, {email}, {push}, {email, push} and refuses WhatsApp / Viber
-- (fields.channels = "invalid" in the action, the Step 28a reminder_preferences_message_channels_check here); no lead
-- time or delivery time. EP-82 reads the row at send time: rpc:new_message_notification returns its channels
-- (FR-69 #2). Seeded: conversation f31…01 with Marko's (…02) message to Ivana (…01).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- FR-69 #3 — a new user ---------------------------------------------------------------------------------
insert into auth.users (id, email) values ('da280000-0000-4000-8000-000000000c01', 'poruke.nove@mojljubimac.test');
insert into public.profiles (id, account_type, full_name, locale, terms_accepted_at, terms_version)
values ('da280000-0000-4000-8000-000000000c01', 'owner', 'Nova Korisnica', 'en', now(), 'test');

select is(
  (select channels::text[] from public.reminder_preferences
   where user_id = 'da280000-0000-4000-8000-000000000c01' and type = 'message'),
  '{email,push}'::text[], 'FR-69 #3: a new profile''s message row is {email, push}'
);
select is(
  (select row(lead_minutes, delivery_time)::text from public.reminder_preferences
   where user_id = 'da280000-0000-4000-8000-000000000c01' and type = 'message'),
  row('{0}'::integer[], null::time)::text, 'with no lead time and no delivery time'
);

select set_config('request.jwt.claims', '{"sub":"da280000-0000-4000-8000-000000000c01","role":"authenticated"}', true);
set local role authenticated;
select is(jsonb_array_length(public.get_reminder_settings() -> 'preferences'), 7,
  'EP-28: get_reminder_settings returns seven rows');
select is(
  (select array_agg(p ->> 'type' order by o) from jsonb_array_elements(public.get_reminder_settings() -> 'preferences')
     with ordinality as t (p, o)),
  array['vaccination', 'treatment_dose', 'vet_follow_up', 'meal', 'birthday', 'manual', 'message'],
  'message is the seventh row'
);
select is(
  (select p - 'updated_at' from jsonb_array_elements(public.get_reminder_settings() -> 'preferences') p
   where p ->> 'type' = 'message'),
  '{"type": "message", "lead_minutes": [0], "delivery_time": null, "channels": ["email", "push"], "fixed_time": false, "is_default": false}'::jsonb,
  'the message row: both switches on, no lead or delivery time, not fixed-time'
);

-- FR-69 #2 — the Poruke card saves through the EP-28 upsert ------------------------------------------------
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('message', '{0}', null, '{}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'both switches off ({}) is accepted'
);
select is(
  (select p -> 'channels' from jsonb_array_elements(public.get_reminder_settings() -> 'preferences') p
   where p ->> 'type' = 'message'),
  '[]'::jsonb, 'and read back empty (notifications off)'
);
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels) values ('message', '{0}', null, '{email}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  '{email} is accepted'
);
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels) values ('message', '{0}', null, '{push}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  '{push} is accepted'
);
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels) values ('message', '{0}', null, '{email,push}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  '{email, push} is accepted'
);
select throws_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels) values ('message', '{0}', null, '{email,whatsapp}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  '23514', null, 'WhatsApp is refused for messages (fields.channels = "invalid")'
);
select throws_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels) values ('message', '{0}', null, '{viber}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  '23514', null, 'Viber is refused for messages'
);
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels) values ('message', '{1440}', '08:00', '{push}')
    on conflict (user_id, type) do update set lead_minutes = excluded.lead_minutes, delivery_time = excluded.delivery_time,
      channels = excluded.channels$$,
  'a lead time or delivery time sent for message is ignored'
);
select is(
  (select p - 'updated_at' from jsonb_array_elements(public.get_reminder_settings() -> 'preferences') p
   where p ->> 'type' = 'message'),
  '{"type": "message", "lead_minutes": [0], "delivery_time": null, "channels": ["push"], "fixed_time": false, "is_default": false}'::jsonb,
  'the row stays lead {0} with no delivery time'
);
select is(
  (select count(*)::int from public.reminder_preferences where type = 'message'),
  1, 'a user reads only their own message row (RLS)'
);
reset role;

-- FR-69 #2 — EP-82 reads the recipient's channels at send time ---------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.new_message_notification(uuid)', 'execute'),
  'the notification read is service-role only');

create temp table marko_message as
  select m.id from public.messages m
  where m.conversation_id = 'f3100000-0000-4000-8000-000000000001' and m.sender_id = 'a1000000-0000-4000-8000-000000000002';
grant select on marko_message to service_role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  public.new_message_notification((select id from marko_message)) - 'push_subscriptions',
  jsonb_build_object(
    'conversation_id', 'f3100000-0000-4000-8000-000000000001',
    'body', 'Jeste, možeš da je preuzmeš u subotu pre podne.',
    'sender_name', 'Marko Jovanović',
    'listing_title', 'Poklanjam grebalicu za mačke',
    'recipient', jsonb_build_object(
      'id', 'a1000000-0000-4000-8000-000000000001', 'email', 'ivana.petrovic@mojljubimac.test', 'locale', 'sr-Latn',
      'full_name', 'Ivana Petrović', 'deletion_pending', false, 'channels', '["email", "push"]'::jsonb
    )
  ),
  'the recipient is the other party; default channels {email, push}; sender display name and listing title'
);
reset role;

update public.reminder_preferences set channels = '{email}'
where user_id = 'a1000000-0000-4000-8000-000000000001' and type = 'message';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.new_message_notification((select id from marko_message)) -> 'recipient' -> 'channels', '["email"]'::jsonb,
  'FR-69 #2: {email} → email only');
reset role;

update public.reminder_preferences set channels = '{}'
where user_id = 'a1000000-0000-4000-8000-000000000001' and type = 'message';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.new_message_notification((select id from marko_message)) -> 'recipient' -> 'channels', '[]'::jsonb,
  'FR-69 #2: {} → no notification');
reset role;

update public.profiles set display_name = 'Marko J.' where id = 'a1000000-0000-4000-8000-000000000002';
delete from public.listings where id = 'f3000000-0000-4000-8000-000000000002';
update public.profiles set deletion_requested_at = now() where id = 'a1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  public.new_message_notification((select id from marko_message)) -> 'sender_name', '"Marko J."'::jsonb,
  'the sender is shown by display name'
);
select is(public.new_message_notification((select id from marko_message)) -> 'listing_title', 'null'::jsonb,
  'a deleted listing has no title (the action uses "oglas obrisan")');
select is(public.new_message_notification((select id from marko_message)) -> 'recipient' -> 'deletion_pending', 'true'::jsonb,
  'a recipient whose deletion is pending is flagged (no notification)');
reset role;

select * from finish();
rollback;
