-- Step 28a — conversations and messages (TC §5.10): structure; BR-61 / FR-68 #2 (one conversation
-- per listing and interested user; only on active listings; never on one's own; owner_id from the
-- listing's author; existing conversations continue after the listing is resolved or deleted);
-- FR-68 #7 (body 1–2000 characters after trim; last_message_at follows the newest message); the
-- sender must be a party; BR-59 (a blocked sender → user_blocked, the other direction succeeds);
-- BR-60 (a suspended sender → marketplace_suspended, conversations stay readable); RLS (the two
-- parties only, no Operator access, read_at only by the recipient).
-- Seeded: conversation f31…01 on Marko's gift f3…02 — Ivana (…01) asked, Marko (…02) answered
-- (unread); Jelena (…03) blocked Nikola (…05); Jelena's active seeking listing f3…05; Marko's
-- expired f3…06; Ivana's selling f3…03; Ana (…06) is the Operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

-- Structure ---------------------------------------------------------------------------------------
select columns_are('public', 'conversations', array[
  'id', 'listing_id', 'starter_id', 'owner_id', 'last_message_at', 'created_at', 'updated_at'
], 'conversations has the TC §5.10 columns');
select col_not_null('public', 'conversations', 'starter_id', 'starter_id is not null');
select col_not_null('public', 'conversations', 'owner_id', 'owner_id is not null');
select col_not_null('public', 'conversations', 'last_message_at', 'last_message_at is not null');
select col_is_unique('public', 'conversations', array['listing_id', 'starter_id'], 'BR-61: unique (listing_id, starter_id)');
select fk_ok('public', 'conversations', 'listing_id', 'public', 'listings', 'id', 'conversations.listing_id → listings');
select fk_ok('public', 'conversations', 'starter_id', 'public', 'profiles', 'id', 'conversations.starter_id → profiles');
select fk_ok('public', 'conversations', 'owner_id', 'public', 'profiles', 'id', 'conversations.owner_id → profiles');
select has_index('public', 'conversations', 'conversations_starter_id_last_message_at_idx', 'inbox index (starter)');
select has_index('public', 'conversations', 'conversations_owner_id_last_message_at_idx', 'inbox index (owner)');

select columns_are('public', 'messages', array[
  'id', 'conversation_id', 'sender_id', 'body', 'created_at', 'read_at'
], 'messages has the TC §5.10 columns (no updated_at)');
select fk_ok('public', 'messages', 'conversation_id', 'public', 'conversations', 'id', 'messages.conversation_id → conversations');
select fk_ok('public', 'messages', 'sender_id', 'public', 'profiles', 'id', 'messages.sender_id → profiles');
select has_index('public', 'messages', 'messages_conversation_id_created_at_idx', array['conversation_id', 'created_at'],
  'thread index (conversation_id, created_at)');
select has_index('public', 'messages', 'messages_unread_conversation_id_idx', 'partial unread index');
select ok((select relrowsecurity from pg_class where oid = 'public.conversations'::regclass), 'RLS on conversations');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'RLS on messages');
select ok(not has_table_privilege('anon', 'public.messages', 'select'), 'Visitors have no access to messages');

-- BR-61 -------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.conversations (listing_id) values ('f3000000-0000-4000-8000-000000000002')$$,
  '23505', null, 'FR-68 #2: a second conversation for the same listing and user is refused (the existing one opens)'
);
select throws_ok(
  $$insert into public.conversations (listing_id) values ('f3000000-0000-4000-8000-000000000003')$$,
  'P0001', 'cannot_message_self', 'BR-61: a user cannot message their own listing'
);
select throws_ok(
  $$insert into public.conversations (listing_id) values ('f3000000-0000-4000-8000-000000000006')$$,
  'P0001', 'listing_not_active', 'BR-61: no new conversation on a listing that is not active'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.conversations (listing_id) values ('f3000000-0000-4000-8000-000000000002')$$,
  'another user starts a conversation on an active listing'
);
select is(
  (select row(starter_id, owner_id)::text from public.conversations
   where listing_id = 'f3000000-0000-4000-8000-000000000002' and starter_id = 'a1000000-0000-4000-8000-000000000003'),
  row('a1000000-0000-4000-8000-000000000003'::uuid, 'a1000000-0000-4000-8000-000000000002'::uuid)::text,
  'starter_id is the caller and owner_id the listing''s author'
);

-- FR-68 #7: the body ------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.messages (conversation_id, body)
    select id, '' from public.conversations where starter_id = 'a1000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'FR-68 #7: an empty message cannot be sent'
);
select throws_ok(
  $$insert into public.messages (conversation_id, body)
    select id, E'   \n  ' from public.conversations where starter_id = 'a1000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'FR-68 #7: a whitespace-only message cannot be sent'
);
select throws_ok(
  $$insert into public.messages (conversation_id, body)
    select id, repeat('a', 2001) from public.conversations where starter_id = 'a1000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'FR-68 #7: 2,001 characters are refused'
);
select lives_ok(
  $$insert into public.messages (conversation_id, body)
    select id, repeat('a', 2000) from public.conversations where starter_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'FR-68 #7: 2,000 characters are accepted'
);
select is(
  (select sender_id from public.messages where body = repeat('a', 2000)),
  'a1000000-0000-4000-8000-000000000003'::uuid, 'sender_id defaults to the caller'
);
select throws_ok(
  $$insert into public.messages (conversation_id, body) values ('f3100000-0000-4000-8000-000000000001', 'Ja bih.')$$,
  'P0001', 'not_found', 'a user who is not a party cannot write into a conversation (EP-82 not_found)'
);
reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('f3100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'Ja bih.')$$,
  'P0001', 'not_found', 'the sender must be a party for every writer'
);

insert into public.messages (conversation_id, sender_id, body, created_at)
values ('f3100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Super, dolazim.',
        now() + interval '5 minutes');
select is(
  (select last_message_at from public.conversations where id = 'f3100000-0000-4000-8000-000000000001'),
  now() + interval '5 minutes', 'last_message_at follows the newest message'
);

-- BR-59: blocks -----------------------------------------------------------------------------------
-- Nikola (blocked by Jelena) writes about Jelena's search; Jelena writes about Nikola's gift.
insert into public.listings (id, author_id, type, title, description, category, species, city_id)
values ('f3b00000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'giving',
        'Poklanjam ležaljku', 'Ležaljka za psa.', 'furniture', 'dog',
        (select id from public.cities where name_sr = 'Beograd'));

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.conversations (listing_id) values ('f3000000-0000-4000-8000-000000000005')$$,
  'the blocked user opens a conversation row'
);
select throws_ok(
  $$insert into public.messages (conversation_id, body)
    select id, 'Imam kavez.' from public.conversations where listing_id = 'f3000000-0000-4000-8000-000000000005'$$,
  'P0001', 'user_blocked', 'BR-59: a message from a blocked user to the blocker is refused'
);
select is(
  (select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
   where c.listing_id = 'f3000000-0000-4000-8000-000000000005'),
  0, 'nothing is stored'
);
select is((select count(*)::int from public.user_blocks), 0, 'the blocked user does not see the block');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.conversations (listing_id) values ('f3b00000-0000-4000-8000-000000000001')$$,
  'the blocker starts a conversation with the blocked user'
);
select lives_ok(
  $$insert into public.messages (conversation_id, body)
    select id, 'Da li je još tu?' from public.conversations where listing_id = 'f3b00000-0000-4000-8000-000000000001'$$,
  'BR-59: the other direction succeeds'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- RLS ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.conversations) + (select count(*)::int from public.messages),
  0, 'the Operator reads no conversations or messages'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.conversations where id = 'f3100000-0000-4000-8000-000000000001'),
  0, 'a non-party does not see the conversation'
);

-- Marko (the sender of the unread message) cannot mark it read; Ivana (the recipient) can.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.messages set read_at = now() where conversation_id = 'f3100000-0000-4000-8000-000000000001'
  and sender_id = 'a1000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.messages
   where conversation_id = 'f3100000-0000-4000-8000-000000000001' and read_at is null),
  2, 'the sender cannot mark their own messages read'
);
select throws_ok(
  $$update public.messages set body = 'Izmenjeno' where conversation_id = 'f3100000-0000-4000-8000-000000000001'$$,
  '42501', null, 'messages cannot be edited'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.messages set read_at = now() where conversation_id = 'f3100000-0000-4000-8000-000000000001'
  and sender_id <> 'a1000000-0000-4000-8000-000000000001' and read_at is null;
select is(
  (select count(*)::int from public.messages
   where conversation_id = 'f3100000-0000-4000-8000-000000000001' and read_at is null),
  1, 'the recipient marks the other party''s messages read (EP-83)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-61: conversations continue after the listing is resolved, then deleted ----------------------
update public.listings set status = 'resolved', resolved_outcome = 'given'
where id = 'f3000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.messages (conversation_id, body) values ('f3100000-0000-4000-8000-000000000001', 'Hvala!')$$,
  'BR-61: an existing conversation continues after the listing is resolved'
);
select lives_ok(
  $$delete from public.listings where id = 'f3000000-0000-4000-8000-000000000002'$$,
  'the author deletes the listing'
);
select is(
  (select count(*)::int from public.messages where conversation_id = 'f3100000-0000-4000-8000-000000000001'),
  4, 'FR-64 #6: the messages remain readable after the listing is deleted'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-60: suspension --------------------------------------------------------------------------------
update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.messages (conversation_id, body) values ('f3100000-0000-4000-8000-000000000001', 'Još nešto.')$$,
  'P0001', 'marketplace_suspended', 'BR-60: a suspended user cannot send messages'
);
select is(
  (select count(*)::int from public.messages where conversation_id = 'f3100000-0000-4000-8000-000000000001'),
  4, 'BR-60: a suspended user still reads their conversations'
);
reset role;

select * from finish();
rollback;
