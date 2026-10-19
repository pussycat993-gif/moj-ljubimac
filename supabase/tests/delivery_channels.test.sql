-- reminder_deliveries, push_subscriptions, user_channels (TC §5.5): structure, uniques,
-- indexes; self-only access (EP-29, EP-30, EP-31); no client writes to deliveries and
-- user_channels.
-- Seeded: Ivana (…01), Marko (…02), Jelena (…03).
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- Structure -----------------------------------------------------------------------------------
select enum_has_labels('public', 'delivery_status', array['delivered', 'failed'], 'delivery statuses');
select enum_has_labels('public', 'user_channel_type', array['whatsapp', 'viber'], 'user channel types');

select columns_are('public', 'reminder_deliveries', array[
  'id', 'occurrence_id', 'recipient_id', 'channel', 'status', 'provider_message_id', 'error', 'delivered_at',
  'created_at', 'updated_at'
], 'reminder_deliveries has the TC §5.5 columns');
select col_type_is('public', 'reminder_deliveries', 'channel', 'delivery_channel', 'channel is delivery_channel');
select col_type_is('public', 'reminder_deliveries', 'status', 'delivery_status', 'status is delivery_status');
select fk_ok('public', 'reminder_deliveries', 'occurrence_id', 'public', 'reminder_occurrences', 'id',
  'occurrence_id → reminder_occurrences');
select fk_ok('public', 'reminder_deliveries', 'recipient_id', 'public', 'profiles', 'id', 'recipient_id → profiles');
select has_index('public', 'reminder_deliveries', 'reminder_deliveries_recipient_channel_delivered_at_idx',
  array['recipient_id', 'channel', 'delivered_at'], 'index (recipient_id, channel, delivered_at) (BR-14a)');
select has_index('public', 'reminder_deliveries', 'reminder_deliveries_delivered_at_idx', array['delivered_at'],
  'index (delivered_at) (NFR-08)');
select ok((select relrowsecurity from pg_class where oid = 'public.reminder_deliveries'::regclass),
  'RLS on reminder_deliveries');

select columns_are('public', 'push_subscriptions', array[
  'id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at', 'updated_at'
], 'push_subscriptions has the TC §5.5 columns');
select col_is_unique('public', 'push_subscriptions', 'endpoint', 'endpoint is unique');
select fk_ok('public', 'push_subscriptions', 'user_id', 'public', 'profiles', 'id', 'user_id → profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  'RLS on push_subscriptions');

select columns_are('public', 'user_channels', array[
  'id', 'user_id', 'channel', 'address', 'opted_in_at', 'created_at', 'updated_at'
], 'user_channels has the TC §5.5 columns');
select col_type_is('public', 'user_channels', 'channel', 'user_channel_type', 'channel is user_channel_type');
select col_is_unique('public', 'user_channels', array['user_id', 'channel'], 'unique (user_id, channel)');
select fk_ok('public', 'user_channels', 'user_id', 'public', 'profiles', 'id', 'user_id → profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.user_channels'::regclass), 'RLS on user_channels');

-- Setup (System) --------------------------------------------------------------------------------
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence) values
  ('dc000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'manual', 'Luna — kupanje', now() + interval '2 days', 'none');
insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status, delivered_at)
select o.id, x.recipient, x.channel::public.delivery_channel, 'delivered', now()
from public.reminder_occurrences o
cross join (values ('a1000000-0000-4000-8000-000000000001'::uuid, 'email'),
                   ('a1000000-0000-4000-8000-000000000001'::uuid, 'push'),
                   ('a1000000-0000-4000-8000-000000000003'::uuid, 'email')) as x (recipient, channel)
where o.reminder_id = 'dc000000-0000-4000-8000-000000000001';

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values
  ('a1000000-0000-4000-8000-000000000001', 'https://push.example/ivana', 'p-key', 'a-key', 'Firefox'),
  ('a1000000-0000-4000-8000-000000000002', 'https://push.example/marko', 'p-key', 'a-key', 'Chrome');
insert into public.user_channels (user_id, channel, address, opted_in_at) values
  ('a1000000-0000-4000-8000-000000000001', 'whatsapp', '+381641234567', now());

select throws_ok(
  $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('a1000000-0000-4000-8000-000000000003', 'https://push.example/ivana', 'p', 'a')$$,
  '23505', null, 'an endpoint is stored once'
);
select throws_ok(
  $$insert into public.user_channels (user_id, channel, address)
    values ('a1000000-0000-4000-8000-000000000001', 'whatsapp', '+381600000000')$$,
  '23505', null, 'one WhatsApp identity per user'
);

-- Ivana -----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.reminder_deliveries), 2, 'the recipient reads own deliveries only');
select throws_ok(
  $$insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status)
    select id, 'a1000000-0000-4000-8000-000000000001', 'email', 'delivered' from public.reminder_occurrences limit 1$$,
  '42501', null, 'no client inserts on deliveries'
);
select throws_ok($$update public.reminder_deliveries set status = 'failed'$$, '42501', null,
  'no client updates on deliveries');
select throws_ok($$delete from public.reminder_deliveries$$, '42501', null, 'no client deletes on deliveries');

select is((select endpoint from public.push_subscriptions), 'https://push.example/ivana',
  'a user sees own push endpoints only (EP-29)');
select throws_ok($$select p256dh, auth from public.push_subscriptions$$, '42501', null,
  'p256dh and auth are write-only (EP-29)');
select throws_ok(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/x', 'p', 'a')$$,
  '42501', null, 'push endpoints are registered through EP-29''s RPC, not directly'
);
with d as (delete from public.push_subscriptions where endpoint = 'https://push.example/marko' returning 1)
select is((select count(*)::int from d), 0, 'a user cannot unregister someone else''s endpoint');
select lives_ok($$delete from public.push_subscriptions where endpoint = 'https://push.example/ivana'$$,
  'a user unregisters own endpoint (EP-29)');

select is((select address from public.user_channels), '+381641234567', 'a user reads own WhatsApp connection');
select throws_ok(
  $$insert into public.user_channels (user_id, channel, address)
    values ('a1000000-0000-4000-8000-000000000001', 'viber', 'x')$$,
  '42501', null, 'no client inserts on user_channels (EP-30 is a server action)'
);
select throws_ok($$update public.user_channels set address = '+381600000000'$$, '42501', null,
  'no client updates on user_channels');
select throws_ok($$delete from public.user_channels$$, '42501', null, 'no client deletes on user_channels');

-- Jelena / Marko -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.reminder_deliveries), 1, 'a member reads only her own delivery');
select is((select count(*)::int from public.user_channels), 0, 'and no one else''s channels');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.reminder_deliveries), 0, 'Marko has no deliveries');

reset role;
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/marko'), 1,
  'Marko''s endpoint survived');

select * from finish();
rollback;
