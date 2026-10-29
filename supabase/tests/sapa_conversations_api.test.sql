-- Step 28c — Šapa pomoći conversations API: rpc:list_my_conversations (EP-80, FR-68 #5), rpc:get_conversation
-- (EP-81, FR-68 #6), rpc:mark_conversation_read (EP-83, FR-68 #6), rpc:send_message (EP-82 one transaction,
-- FR-68 #1–#3, #7, FR-70 #4) and rpc:block_user / rpc:unblock_user (EP-85, FR-70 #3, #5).
-- Seeded (Step 28a): conversation f31…01 Ivana (…01) → Marko (…02) about Marko's giving listing f3…02, with
-- Ivana's read message and Marko's unread reply; Jelena (…03) blocked Nikola (…05). Added here: f31…02 Jelena →
-- Ivana about Ivana's selling listing f3…03 (newest), f31…03 Ivana → the shelter need f3…01 of „Druga šansa“
-- (Dragana …07, oldest).
begin;
create extension if not exists pgtap with schema extensions;

select plan(69);

create function pg_temp.as_user(p_user text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Fixtures (as the database owner) ----------------------------------------------------------------------
update public.conversations set last_message_at = now() - interval '18 hours'
where id = 'f3100000-0000-4000-8000-000000000001';

insert into public.conversations (id, listing_id, starter_id) values
  ('f3100000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003'),
  ('f3100000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001');
insert into public.messages (conversation_id, sender_id, body, created_at) values
  ('f3100000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003',
   'Zdravo! Da li je transporter još dostupan?', now() - interval '1 hour'),
  ('f3100000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
   'Mogu da donesem 10 kg granula u subotu.', now() - interval '30 hours'),
  ('f3100000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000007',
   'Hvala ti! Subotom smo tu od 10:00 do 14:00.', now() - interval '29 hours');
update public.messages set read_at = now() - interval '28 hours'
where conversation_id = 'f3100000-0000-4000-8000-000000000003' and sender_id = 'a1000000-0000-4000-8000-000000000007';

-- EP-80 — inbox (FR-68 #5) ----------------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select array_agg(right(x ->> 'id', 2) order by o)
   from jsonb_array_elements(public.list_my_conversations() -> 'items') with ordinality as t (x, o)),
  array['02', '01', '03'], 'FR-68 #5: the inbox lists the conversations by latest message first'
);
select is((public.list_my_conversations() ->> 'total')::int, 3, 'total counts every conversation of the caller');
select is(
  (public.list_my_conversations() -> 'items' -> 0) - 'last_message_at',
  jsonb_build_object(
    'id', 'f3100000-0000-4000-8000-000000000002',
    'listing', jsonb_build_object('id', 'f3000000-0000-4000-8000-000000000003', 'title', 'Prodajem transporter za psa',
      'type', 'selling', 'active', true, 'deleted', false),
    'i_am_author', true,
    'other', jsonb_build_object('user_id', 'a1000000-0000-4000-8000-000000000003', 'kind', 'user',
      'display_name', 'Jelena Nikolić', 'initials', 'JN', 'organisation_slug', null),
    'last_message', jsonb_build_object('preview', 'Zdravo! Da li je transporter još dostupan?', 'from_me', false),
    'unread_count', 1,
    'i_blocked_other', false
  ),
  'each row carries the listing title, the other user''s display name, the last message and the unread count'
);
select is(
  public.list_my_conversations() -> 'items' -> 2 -> 'other',
  '{"user_id": "a1000000-0000-4000-8000-000000000007", "kind": "shelter", "display_name": "Azil „Druga šansa“", "initials": "AD", "organisation_slug": "azil-druga-sansa"}'::jsonb,
  'the author of a need is shown as the shelter (FR-67)'
);
select is(public.list_my_conversations() -> 'items' -> 2 -> 'last_message',
  '{"preview": "Hvala ti! Subotom smo tu od 10:00 do 14:00.", "from_me": false}'::jsonb,
  'the last message is the newest one');
select is((public.list_my_conversations() -> 'items' -> 1 -> 'last_message' ->> 'from_me')::boolean, false,
  'Marko''s reply is not from me');
select is((public.list_my_conversations() ->> 'unread_conversations')::int, 2,
  'unread_conversations counts conversations with unread messages from the other party');
select is(
  (public.list_my_conversations() ->> 'unread_conversations')::int,
  (public.get_me() -> 'marketplace' ->> 'unread_conversations')::int,
  'unread_conversations equals Me.marketplace.unread_conversations (Poruke badge)'
);
select is(
  (select array_agg(right(x ->> 'id', 2)) from jsonb_array_elements(public.list_my_conversations(1, 1) -> 'items') x),
  array['01'], 'limit / offset page the inbox'
);
select throws_ok($$select public.list_my_conversations(0)$$, 'P0001', 'validation_failed', 'limit 0 → validation_failed');
select throws_ok($$select public.list_my_conversations(51)$$, 'P0001', 'validation_failed', 'limit 51 → validation_failed');
select throws_ok($$select public.list_my_conversations(20, -1)$$, 'P0001', 'validation_failed',
  'negative offset → validation_failed');

-- EP-81 — thread (FR-68 #6) ---------------------------------------------------------------------------------
select is(
  (select array_agg(m ->> 'body' order by o)
   from jsonb_array_elements(public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'messages')
     with ordinality as t (m, o)),
  array['Zdravo! Da li je grebalica još dostupna?', 'Jeste, možeš da je preuzmeš u subotu pre podne.'],
  'FR-68 #6: messages come oldest to newest'
);
select is((public.get_conversation('f3100000-0000-4000-8000-000000000001') ->> 'total')::int, 2, 'total counts the messages');
select is(
  (select array_agg((m ->> 'from_me')::boolean order by o)
   from jsonb_array_elements(public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'messages')
     with ordinality as t (m, o)),
  array[true, false], 'from_me marks the caller''s own messages'
);
select is(
  public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'conversation' -> 'can_send', 'true'::jsonb,
  'a party who is not suspended and did not block the other can send'
);
select is(
  (public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'conversation' ->> 'message_total')::int, 2,
  'the thread header carries message_total'
);
select is(
  public.get_conversation('f3100000-0000-4000-8000-000000000001', 1) -> 'messages' -> 0 ->> 'body',
  'Jeste, možeš da je preuzmeš u subotu pre podne.', 'a page holds the newest messages'
);
select is(
  public.get_conversation('f3100000-0000-4000-8000-000000000001', 1, 1) -> 'messages' -> 0 ->> 'body',
  'Zdravo! Da li je grebalica još dostupna?', 'the offset counts back from the newest ("Učitaj starije")'
);
select is(
  (public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'conversation' ->> 'unread_count')::int, 1,
  'reading the thread does not mark it read (EP-83 does)'
);
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
set local role authenticated;
select throws_ok($$select public.get_conversation('f3100000-0000-4000-8000-000000000001')$$, 'P0001', 'not_found',
  'someone who is not a party gets not_found');
select throws_ok($$select public.mark_conversation_read('f3100000-0000-4000-8000-000000000001')$$, 'P0001', 'not_found',
  'nor can they mark it read');
select is((public.list_my_conversations() ->> 'total')::int, 0, 'nor list it');
reset role;

-- EP-83 — mark read (FR-68 #6) ------------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  public.mark_conversation_read('f3100000-0000-4000-8000-000000000001'),
  '{"conversation_id": "f3100000-0000-4000-8000-000000000001", "marked": 1, "unread_conversations": 1}'::jsonb,
  'FR-68 #6: opening the conversation marks the other party''s messages read'
);
select is(
  (public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'conversation' ->> 'unread_count')::int, 0,
  'its unread count becomes 0'
);
select is((public.mark_conversation_read('f3100000-0000-4000-8000-000000000001') ->> 'marked')::int, 0,
  'marking again changes nothing (naturally idempotent)');
reset role;
select is(
  (select count(*)::int from public.messages
   where conversation_id = 'f3100000-0000-4000-8000-000000000001' and read_at is null),
  0, 'read_at is set on the other party''s message'
);

select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
set local role authenticated;
select isnt(
  public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'messages' -> 0 ->> 'read_at', null,
  'Ivana''s message shows as read to Marko (· Pročitano)'
);
reset role;

-- EP-82 — send (FR-68 #1, #2, #3, #7) ------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
set local role authenticated;
create temp table sent1 as
  select public.send_message('f3000000-0000-4000-8000-000000000002', null, E'  Zdravo Marko!\n ') as r;
select is((select (r ->> 'created_conversation')::boolean from sent1), true,
  'FR-68 #1: the first message on a listing creates the conversation');
select is((select r -> 'message' ->> 'body' from sent1), 'Zdravo Marko!', 'the body is stored trimmed');
select is((select r -> 'conversation' -> 'other' ->> 'user_id' from sent1), 'a1000000-0000-4000-8000-000000000002',
  'the conversation is with the listing''s author');
select is((select (r -> 'conversation' ->> 'i_am_author')::boolean from sent1), false, 'the starter is not the author');
create temp table sent2 as
  select public.send_message('f3000000-0000-4000-8000-000000000002', null, 'Mogu li danas?') as r;
select is((select (r ->> 'created_conversation')::boolean from sent2), false,
  'FR-68 #2: a second start on the same listing reuses the conversation (BR-61)');
select is((select r -> 'conversation' ->> 'id' from sent2), (select r -> 'conversation' ->> 'id' from sent1),
  'the same conversation id');
select is((select r -> 'message' ->> 'body' from sent2), 'Mogu li danas?',
  'the second message is returned with the reused conversation');
reset role;
select is(
  (select count(*)::int from public.conversations
   where listing_id = 'f3000000-0000-4000-8000-000000000002' and starter_id = 'a1000000-0000-4000-8000-000000000005'),
  1, 'one conversation per listing and interested user'
);
select is(
  (select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
   where c.listing_id = 'f3000000-0000-4000-8000-000000000002' and c.starter_id = 'a1000000-0000-4000-8000-000000000005'),
  2, 'both messages are delivered into it'
);

select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-000000000002', null, 'Ja')$$, 'P0001',
  'cannot_message_self', 'FR-68 #3: the author cannot message their own listing');
select lives_ok(
  $$select public.send_message(null, (select id from public.conversations where starter_id = 'a1000000-0000-4000-8000-000000000005'), 'Može, posle 17h.')$$,
  'the author replies in the conversation'
);
select is((public.list_my_conversations() ->> 'unread_conversations')::int, 1,
  'the new conversation is unread for its author');
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-000000000006', null, 'Zdravo')$$, 'P0001',
  'listing_not_active', 'starting on an expired listing → listing_not_active (E-33)');
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-0000000000ff', null, 'Zdravo')$$, 'P0001',
  'not_found', 'an unknown listing → not_found');
select throws_ok($$select public.send_message(null, 'f3100000-0000-4000-8000-0000000000ff', 'Zdravo')$$, 'P0001',
  'not_found', 'a conversation that is not the caller''s → not_found');
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-000000000002', null, E' \n\t ')$$, 'P0001',
  'validation_failed', 'FR-68 #7: an empty message cannot be sent');
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-000000000002', null, repeat('a', 2001))$$,
  'P0001', 'validation_failed', 'FR-68 #7: more than 2,000 characters is refused');
select lives_ok($$select public.send_message('f3000000-0000-4000-8000-000000000002', null, repeat('a', 2000))$$,
  '2,000 characters are accepted');
select throws_ok($$select public.send_message(null, null, 'Zdravo')$$, 'P0001', 'validation_failed',
  'neither listing_id nor conversation_id → validation_failed');
select throws_ok(
  $$select public.send_message('f3000000-0000-4000-8000-000000000002', 'f3100000-0000-4000-8000-000000000001', 'Zdravo')$$,
  'P0001', 'validation_failed', 'both → validation_failed');
reset role;

-- FR-70 #4 — a blocked sender is refused and nothing is stored --------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
set local role authenticated;
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-000000000004', null, 'Zdravo Jelena')$$,
  'P0001', 'user_blocked', 'FR-70 #4: Nikola, blocked by Jelena, cannot message her');
reset role;
select is(
  (select count(*)::int from public.conversations
   where listing_id = 'f3000000-0000-4000-8000-000000000004' and starter_id = 'a1000000-0000-4000-8000-000000000005'),
  0, 'the refused send leaves no conversation behind (one transaction)'
);

-- EP-85 — block (FR-70 #3) ----------------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
set local role authenticated;
create temp table blocked1 as select public.block_user('a1000000-0000-4000-8000-000000000002') as r;
select is((select r ->> 'blocked_id' from blocked1), 'a1000000-0000-4000-8000-000000000002',
  'FR-70 #3: Ivana blocks Marko (UserBlock)');
select is(public.block_user('a1000000-0000-4000-8000-000000000002'), (select r from blocked1),
  'blocking again returns the existing row');
select ok(
  not (public.list_listings() -> 'items') @> '[{"id": "f3000000-0000-4000-8000-000000000002"}]',
  'the blocked user''s listings disappear from the blocker''s EP-73 list'
);
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000002')$$, 'P0001', 'not_found',
  'and from EP-74');
select is(
  public.get_public_profile('a1000000-0000-4000-8000-000000000002') -> 'viewer' -> 'i_blocked', 'true'::jsonb,
  'EP-79 shows the blocked state'
);
select is(jsonb_array_length(public.get_public_profile('a1000000-0000-4000-8000-000000000002') -> 'listings'), 0,
  'with no listings');
select is(
  (select x -> 'i_blocked_other' from jsonb_array_elements(public.list_my_conversations() -> 'items') x
   where x ->> 'id' = 'f3100000-0000-4000-8000-000000000001'),
  'true'::jsonb, 'the inbox row shows Blokiran korisnik'
);
select is(
  public.get_conversation('f3100000-0000-4000-8000-000000000001') -> 'conversation' -> 'can_send', 'false'::jsonb,
  'the thread hides the composer (can_send = false) but stays readable'
);
select throws_ok($$select public.block_user('a1000000-0000-4000-8000-000000000001')$$, 'P0001', 'validation_failed',
  'a user cannot block themselves');
select throws_ok($$select public.block_user('a1000000-0000-4000-8000-0000000000ff')$$, 'P0001', 'not_found',
  'an unknown user → not_found');
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok(
  $$select public.send_message(null, 'f3100000-0000-4000-8000-000000000001', 'Jesi li tu?')$$,
  'P0001', 'user_blocked', 'the blocked user can no longer send messages to the blocker'
);
select is(public.get_public_profile('a1000000-0000-4000-8000-000000000001') -> 'viewer' -> 'i_blocked', 'false'::jsonb,
  'the blocked user is never told (EP-79 shows nothing)');
reset role;

-- EP-85 — unblock (FR-70 #5) --------------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$select public.unblock_user('a1000000-0000-4000-8000-000000000002')$$, 'FR-70 #5: Ivana unblocks Marko');
select ok(
  (public.list_listings() -> 'items') @> '[{"id": "f3000000-0000-4000-8000-000000000002"}]',
  'his listings return to her list'
);
select lives_ok($$select public.unblock_user('a1000000-0000-4000-8000-000000000002')$$,
  'unblocking when no block exists is fine (204)');
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
set local role authenticated;
select lives_ok($$select public.send_message(null, 'f3100000-0000-4000-8000-000000000001', 'Jesi li tu?')$$,
  'and messaging works again');
reset role;

-- Grants ----------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.list_my_conversations(integer, integer)', 'execute'),
  'a Visitor cannot list conversations');
select ok(not has_function_privilege('anon', 'public.send_message(uuid, uuid, text)', 'execute'),
  'a Visitor cannot send (401 in the action)');
select ok(not has_function_privilege('authenticated', 'public.new_message_notification(uuid)', 'execute'),
  'the notification read is service-role only');

select * from finish();
rollback;
