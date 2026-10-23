-- EP-29 rpc:register_push_subscription (Step 18): registers the caller's browser endpoint, returns the
-- PushSubscription shape without the keys, re-assigns an endpoint stored for another user (same browser,
-- other account) to the caller with the new keys, validates the request; check (select by endpoint) and
-- unregister (delete by endpoint) are the Data API on push_subscriptions.
-- Seeded: Ivana (…01), Marko (…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

select has_function('public', 'register_push_subscription', array['text', 'text', 'text', 'text'],
  'rpc:register_push_subscription(endpoint, p256dh, auth, user_agent) exists');
select is(
  (select prosecdef from pg_proc where oid = 'public.register_push_subscription(text, text, text, text)'::regprocedure),
  true, 'register_push_subscription is security definer (EP-29 re-assignment)'
);

-- Anonymous callers cannot register -------------------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.register_push_subscription('https://push.example/anon', 'BKey', 'secret', null)$$,
  '42501', null, 'anon cannot execute register_push_subscription'
);
reset role;

-- Marko registers his browser ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  array(
    select k from jsonb_object_keys(public.register_push_subscription(
      'https://push.example/shared-browser', 'BMarkoKey_-1', 'markoSecret', 'Firefox')) as k
    order by k
  ),
  array['created_at', 'endpoint', 'id', 'user_agent'],
  'register returns PushSubscription { id, endpoint, user_agent, created_at } — never p256dh or auth'
);
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/shared-browser'),
  1, 'check (select by endpoint) finds the registered endpoint for its owner'
);
select is(
  (public.register_push_subscription('https://push.example/shared-browser', 'BMarkoKey_-2', 'markoSecret2', 'Firefox'))->>'endpoint',
  'https://push.example/shared-browser', 'registering the same endpoint again is an update, not an error'
);

-- Validation (fields.endpoint: invalid; keys required / base64url) -------------------------------
select throws_like(
  $$select public.register_push_subscription('http://push.example/plain', 'BKey', 'secret', null)$$,
  'validation_failed', 'endpoint must be an https:// URL'
);
select throws_ok(
  $$select public.register_push_subscription('not a url', 'BKey', 'secret', null)$$,
  'P0001', 'validation_failed', 'an endpoint that is not a URL → validation_failed'
);
select throws_ok(
  $$select public.register_push_subscription('https://push.example/k', '', 'secret', null)$$,
  'P0001', 'validation_failed', 'p256dh is required'
);
select throws_ok(
  $$select public.register_push_subscription('https://push.example/k', 'BKey', 'not base64!', null)$$,
  'P0001', 'validation_failed', 'auth must be base64url'
);
select is(
  length((public.register_push_subscription('https://push.example/long-ua', 'BKey', 'secret', repeat('a', 400)))->>'user_agent'),
  300, 'user_agent is kept to 300 characters'
);

-- EP-29 re-assignment: Ivana signs in on the same browser ---------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.register_push_subscription('https://push.example/shared-browser', 'BIvanaKey', 'ivanaSecret', 'Safari')$$,
  'an endpoint stored for another user can be registered by the caller'
);
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/shared-browser'),
  1, 'Ivana now sees the endpoint on check'
);
reset role;

select results_eq(
  $$select user_id, p256dh, auth, user_agent from public.push_subscriptions
    where endpoint = 'https://push.example/shared-browser'$$,
  $$values ('a1000000-0000-4000-8000-000000000001'::uuid, 'BIvanaKey'::text, 'ivanaSecret'::text, 'Safari'::text)$$,
  'the endpoint is re-assigned to the caller with the new keys (one row, unique endpoint)'
);

-- Marko no longer sees it; unregister is the caller's own delete -----------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/shared-browser'),
  0, 'the previous user no longer sees the re-assigned endpoint (check → [])'
);
select lives_ok(
  $$delete from public.push_subscriptions where endpoint = 'https://push.example/long-ua'$$,
  'unregister deletes the caller''s own endpoint'
);
reset role;
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/long-ua'),
  0, 'unregistered endpoint is gone'
);

select * from finish();
rollback;
