-- BR-48: every new profile gets six reminder_preferences rows with the stated defaults;
-- BR-13 doses and meals stored at the exact time; EP-28 channel rules (premium_required,
-- whatsapp_not_connected, channel_disabled). Step 18: the EP-28 upsert regenerates future pending
-- occurrences (FR-22), doses and meals stay exact, several channels are stored and returned by
-- rpc:get_reminder_settings (EP-28 get), and rpc:get_channel_usage (EP-31).
-- Seeded: Ivana (…01, Premium), Marko (…02, Free).
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

insert into auth.users (id, email) values ('da000000-0000-4000-8000-000000000001', 'novi@mojljubimac.test');
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
values ('da000000-0000-4000-8000-000000000001', 'owner', 'novi@mojljubimac.test', now(), 'seed');

select is(
  (select count(*)::int from public.reminder_preferences where user_id = 'da000000-0000-4000-8000-000000000001'),
  6, 'a new profile gets six preference rows (BR-48)'
);
select results_eq(
  $$select type::text, lead_minutes, delivery_time, channels::text[]
    from public.reminder_preferences
    where user_id = 'da000000-0000-4000-8000-000000000001'
    order by public.reminder_preferences.type$$,
  $$values
    ('vaccination', '{10080,0}'::integer[], '09:00'::time, '{email,push}'::text[]),
    ('treatment_dose', '{0}'::integer[], null::time, '{email,push}'::text[]),
    ('vet_follow_up', '{1440,0}'::integer[], '09:00'::time, '{email,push}'::text[]),
    ('meal', '{0}'::integer[], null::time, '{email,push}'::text[]),
    ('birthday', '{0}'::integer[], '09:00'::time, '{email,push}'::text[]),
    ('manual', '{0}'::integer[], '09:00'::time, '{email,push}'::text[])$$,
  'vaccinations 7 days + on the day at 09:00; follow-ups 1 day + on the day at 09:00; birthdays and manual on the day at 09:00; doses and meals exact; email + push (BR-48)'
);
select is(
  (select count(*)::int from public.profiles p
   where (select count(*) from public.reminder_preferences r where r.user_id = p.id) <> 6),
  0, 'every seeded profile has its six rows'
);
select is(
  (select count(*)::int from public.reminder_preferences where user_id = 'a1000000-0000-4000-8000-000000000004'),
  6, 'shelter accounts get the defaults too'
);

-- BR-13: doses and meals keep lead 0 and no delivery time --------------------------------------
update public.reminder_preferences set lead_minutes = '{1440,0}', delivery_time = '07:00'
where user_id = 'da000000-0000-4000-8000-000000000001' and type in ('treatment_dose', 'meal');
select is(
  (select count(*)::int from public.reminder_preferences
   where user_id = 'da000000-0000-4000-8000-000000000001' and type in ('treatment_dose', 'meal')
     and lead_minutes = '{0}' and delivery_time is null),
  2, 'doses and meals are always stored at their exact time (BR-13)'
);
select throws_ok(
  $$update public.reminder_preferences set lead_minutes = '{60}'
    where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination'$$,
  '23514', null, 'lead times come from the EP-28 value set'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{}'
    where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination'$$,
  '23514', null, 'at least one channel'
);
select throws_ok(
  $$update public.reminder_preferences set delivery_time = null
    where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination'$$,
  '23514', null, 'lead-time types need a delivery time'
);

-- Step 18 — FR-22: the EP-28 upsert regenerates future pending occurrences ---------------------
-- The new user's vaccination due in 20 days (Belgrade), first set to 1 day before at 18:00, with a
-- done and a missed instance in its history.
insert into public.reminders (id, user_id, type, starts_at)
values (
  'da000000-0000-4000-8000-0000000000a1', 'da000000-0000-4000-8000-000000000001', 'vaccination',
  (((now() at time zone 'Europe/Belgrade')::date + 20) + time '10:00') at time zone 'Europe/Belgrade'
);
update public.reminder_preferences set lead_minutes = '{1440}', delivery_time = '18:00'
where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination';
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at, status, sent_at, resent_at, done_at)
values
  ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-0000000000a1',
   now() - interval '40 days', now() - interval '40 days', 'done', now() - interval '40 days', null, now() - interval '39 days'),
  ('da000000-0000-4000-8000-0000000000b2', 'da000000-0000-4000-8000-0000000000a1',
   now() - interval '10 days', now() - interval '10 days', 'missed', now() - interval '10 days', now() - interval '10 days', null);

select results_eq(
  $$select notify_at from public.reminder_occurrences
    where reminder_id = 'da000000-0000-4000-8000-0000000000a1' and status = 'pending'$$,
  $$values ((((now() at time zone 'Europe/Belgrade')::date + 19) + time '18:00') at time zone 'Europe/Belgrade')$$,
  'before: one pending notice, 1 day before at 18:00'
);

select set_config('request.jwt.claims', '{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('vaccination', '{10080,0}', '09:00', '{email,push}')
    on conflict (user_id, type) do update
      set lead_minutes = excluded.lead_minutes, delivery_time = excluded.delivery_time, channels = excluded.channels$$,
  'EP-28 update: the user upserts {10080, 0} at 09:00 for vaccinations'
);
reset role;

select results_eq(
  $$select notify_at from public.reminder_occurrences
    where reminder_id = 'da000000-0000-4000-8000-0000000000a1' and status = 'pending'
    order by notify_at$$,
  $$values
    ((((now() at time zone 'Europe/Belgrade')::date + 13) + time '09:00') at time zone 'Europe/Belgrade'),
    ((((now() at time zone 'Europe/Belgrade')::date + 20) + time '09:00') at time zone 'Europe/Belgrade')$$,
  'future pending occurrences are regenerated: one notify_at per lead time (7 days before, on the day) at 09:00 Europe/Belgrade (FR-22)'
);
select is(
  (select array_agg(distinct due_at) from public.reminder_occurrences
   where reminder_id = 'da000000-0000-4000-8000-0000000000a1' and status = 'pending'),
  array[(((now() at time zone 'Europe/Belgrade')::date + 20) + time '09:00') at time zone 'Europe/Belgrade'],
  'both notices belong to the same instance, due on the day at the delivery time'
);
select results_eq(
  $$select id, status::text, notify_at, done_at from public.reminder_occurrences
    where id in ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-0000000000b2')
    order by id$$,
  $$values
    ('da000000-0000-4000-8000-0000000000b1'::uuid, 'done'::text, now() - interval '40 days', now() - interval '39 days'),
    ('da000000-0000-4000-8000-0000000000b2'::uuid, 'missed'::text, now() - interval '10 days', null::timestamptz)$$,
  'done and missed rows are untouched'
);

-- FR-22: doses and meals are exact; FR-23: several channels stored ---------------------------------
set local role authenticated;
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, delivery_time, channels)
    values ('treatment_dose', '{10080}', '08:00', '{push}'), ('meal', '{1440,0}', '07:30', '{email,push}')
    on conflict (user_id, type) do update
      set lead_minutes = excluded.lead_minutes, delivery_time = excluded.delivery_time, channels = excluded.channels$$,
  'EP-28 upsert for doses and meals with lead times and a time'
);
select results_eq(
  $$select type::text, lead_minutes, delivery_time from public.reminder_preferences
    where type in ('treatment_dose', 'meal') order by type$$,
  $$values ('meal'::text, '{0}'::integer[], null::time), ('treatment_dose'::text, '{0}'::integer[], null::time)$$,
  'treatment_dose and meal are stored as lead_minutes {0} and delivery_time null (BR-13)'
);
select is(
  (select channels::text[] from public.reminder_preferences where type = 'vaccination'),
  array['email', 'push'], '{email, push} is stored for one type (BR-14)'
);

-- EP-28 get: rpc:get_reminder_settings ------------------------------------------------------------
select is(
  jsonb_array_length(public.get_reminder_settings() -> 'preferences'), 6,
  'get_reminder_settings returns one preference per reminder type (6)'
);
select is(
  (select p - 'updated_at' from jsonb_array_elements(public.get_reminder_settings() -> 'preferences') p
   where p ->> 'type' = 'vaccination'),
  '{"type":"vaccination","lead_minutes":[10080,0],"delivery_time":"09:00","channels":["email","push"],"fixed_time":false,"is_default":false}'::jsonb,
  'the stored {email, push} and {10080, 0} at 09:00 are returned for vaccinations'
);
select is(
  (select p - 'updated_at' from jsonb_array_elements(public.get_reminder_settings() -> 'preferences') p
   where p ->> 'type' = 'treatment_dose'),
  '{"type":"treatment_dose","lead_minutes":[0],"delivery_time":null,"channels":["push"],"fixed_time":true,"is_default":false}'::jsonb,
  'doses come back as fixed_time with lead [0] and no delivery time'
);
select is(
  (select array_agg(p ->> 'type' order by ord) from jsonb_array_elements(public.get_reminder_settings() -> 'preferences')
     with ordinality as e (p, ord)),
  array['vaccination', 'treatment_dose', 'vet_follow_up', 'meal', 'birthday', 'manual'],
  'preferences come in reminder-type order'
);
select is(public.get_reminder_settings() -> 'viber_enabled', 'false'::jsonb, 'viber_enabled is false (BR-14b)');
select is(
  public.get_reminder_settings() -> 'whatsapp',
  '{"channel":"whatsapp","status":"not_connected","phone":null,"connected_at":null}'::jsonb,
  'no WhatsApp number → WhatsAppConnection not_connected'
);
reset role;
delete from public.reminder_preferences
where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'birthday';
set local role authenticated;
select is(
  (select p from jsonb_array_elements(public.get_reminder_settings() -> 'preferences') p where p ->> 'type' = 'birthday'),
  '{"type":"birthday","lead_minutes":[0],"delivery_time":"09:00","channels":["email","push"],"fixed_time":false,"is_default":true,"updated_at":null}'::jsonb,
  'a type without a stored row returns the defaults with is_default = true'
);

-- EP-31: rpc:get_channel_usage ----------------------------------------------------------------------
reset role;
insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status, delivered_at) values
  ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-000000000001', 'whatsapp', 'delivered', now()),
  ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-000000000001', 'whatsapp', 'delivered', now()),
  ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-000000000001', 'viber', 'delivered', now()),
  ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-000000000001', 'whatsapp', 'failed', null),
  ('da000000-0000-4000-8000-0000000000b1', 'da000000-0000-4000-8000-000000000001', 'email', 'delivered', now()),
  ('da000000-0000-4000-8000-0000000000b2', 'da000000-0000-4000-8000-000000000001', 'whatsapp', 'delivered', now() - interval '40 days');
set local role authenticated;
select is(
  public.get_channel_usage(),
  jsonb_build_object(
    'month', to_char(now() at time zone 'Europe/Belgrade', 'YYYY-MM'),
    'used', 3, 'used_whatsapp', 2, 'used_viber', 1, 'cap', 30, 'remaining', 27,
    'resets_on', (date_trunc('month', now() at time zone 'Europe/Belgrade') + interval '1 month')::date
  ),
  'ChannelUsage counts delivered WhatsApp / Viber messages of this Belgrade month, cap 30 (BR-14a)'
);
reset role;
set local role anon;
select throws_ok($$select public.get_reminder_settings()$$, '42501', null, 'anon cannot read reminder settings');
select throws_ok($$select public.get_channel_usage()$$, '42501', null, 'anon cannot read channel usage');
reset role;

-- EP-28 as Marko (Free) -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update public.reminder_preferences set lead_minutes = '{4320,0}', delivery_time = '20:00', channels = '{push}'
    where type = 'vaccination'$$,
  'a user updates own preferences (EP-28)'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'vaccination'$$,
  'P0001', 'premium_required:whatsapp', 'WhatsApp needs Premium (BR-14)'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{viber}' where type = 'vaccination'$$,
  'P0001', 'channel_disabled', 'Viber is refused while switched off (BR-14b)'
);
select is(
  (select count(*)::int from public.reminder_preferences),
  6, 'a user sees only own preferences'
);

-- As Ivana (Premium, no WhatsApp number) ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'vaccination'$$,
  'P0001', 'whatsapp_not_connected', 'WhatsApp needs a connected number'
);
reset role;
insert into public.user_channels (user_id, channel, address, opted_in_at)
values ('a1000000-0000-4000-8000-000000000001', 'whatsapp', '+381641234567', now());
set local role authenticated;
select lives_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'vaccination'$$,
  'a Premium user with a connected number chooses WhatsApp'
);
reset role;
update public.app_settings set viber_enabled = true;
set local role authenticated;
select throws_ok(
  $$update public.reminder_preferences set channels = '{viber}' where type = 'vaccination'$$,
  'P0001', 'whatsapp_not_connected:viber', 'Viber, when on, needs a connected Viber identity'
);
select throws_ok(
  $$update public.reminder_preferences set user_id = 'a1000000-0000-4000-8000-000000000002' where type = 'manual'$$,
  '42501', null, 'user_id is not client-writable'
);

select * from finish();
rollback;
