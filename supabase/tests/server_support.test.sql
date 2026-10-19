-- idempotency_keys and rate_limit_counters (TC §5.7, API §3.1, §3.3, §11).
-- Seeded users: Ivana (…01), Marko (…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Columns and uniques ---------------------------------------------------------------------------
select columns_are('public', 'idempotency_keys', array[
  'id', 'user_id', 'key', 'operation', 'result', 'created_at', 'updated_at'
], 'idempotency_keys has the TC §5.7 columns');
select col_type_is('public', 'idempotency_keys', 'key', 'uuid', 'key is uuid');
select col_type_is('public', 'idempotency_keys', 'result', 'jsonb', 'result is jsonb');
select col_not_null('public', 'idempotency_keys', 'operation', 'operation is not null');
select col_is_unique('public', 'idempotency_keys', array['user_id', 'key'], 'unique (user_id, key)');

select columns_are('public', 'rate_limit_counters', array[
  'id', 'user_id', 'operation', 'window_start', 'count', 'created_at', 'updated_at'
], 'rate_limit_counters has the TC §5.7 columns');
select col_default_is('public', 'rate_limit_counters', 'count', '0', 'count defaults to 0');
select col_is_unique('public', 'rate_limit_counters', array['user_id', 'operation', 'window_start'],
  'unique (user_id, operation, window_start)');

-- idempotency_keys RLS -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.idempotency_keys (user_id, key, operation, result)
    values ('a1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'invitations.send', '{"ok":true}')$$,
  'a user stores their own idempotency key'
);
select throws_ok(
  $$insert into public.idempotency_keys (user_id, key, operation)
    values ('a1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'invitations.send')$$,
  '23505', null, 'the same key twice is rejected'
);
select throws_ok(
  $$insert into public.idempotency_keys (user_id, key, operation)
    values ('a1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'invitations.send')$$,
  '42501', null, 'a user cannot store a key for someone else'
);
select is((select count(*)::int from public.idempotency_keys), 1, 'a user reads their own key');
select throws_ok($$update public.idempotency_keys set result = '{}'$$, '42501', null, 'idempotency_keys have no update');
select throws_ok($$delete from public.idempotency_keys$$, '42501', null, 'idempotency_keys have no client delete');

-- rate_limit_counters RLS and count rule --------------------------------------------------------------
select lives_ok(
  $$insert into public.rate_limit_counters (user_id, operation, window_start, count)
    values ('a1000000-0000-4000-8000-000000000001', 'invitations.send', '2026-10-19 00:00:00+00', 1)$$,
  'a user creates their own counter'
);
select lives_ok(
  $$insert into public.rate_limit_counters (user_id, operation, window_start, count)
    values ('a1000000-0000-4000-8000-000000000001', 'invitations.send', '2026-10-19 00:00:00+00', 1)
    on conflict (user_id, operation, window_start)
    do update set count = public.rate_limit_counters.count + 1$$,
  'a user increments their counter with an upsert'
);
select is((select count from public.rate_limit_counters), 2, 'the counter grew to 2');
select throws_ok(
  $$update public.rate_limit_counters set count = 1$$,
  'P0001', 'internal_error', 'a counter cannot decrease'
);
select throws_ok(
  $$insert into public.rate_limit_counters (user_id, operation, window_start)
    values ('a1000000-0000-4000-8000-000000000002', 'invitations.send', '2026-10-19 00:00:00+00')$$,
  '42501', null, 'a user cannot create a counter for someone else'
);
select throws_ok($$delete from public.rate_limit_counters$$, '42501', null, 'rate_limit_counters have no client delete');

-- Another user sees nothing -------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.idempotency_keys), 0, 'another user''s keys are invisible');
select is((select count(*)::int from public.rate_limit_counters), 0, 'another user''s counters are invisible');
update public.rate_limit_counters set count = 99;
reset role;
select is((select count from public.rate_limit_counters), 2, 'another user''s counter cannot be updated');

reset role;
set local role anon;
select throws_ok($$select * from public.idempotency_keys$$, '42501', null, 'anon cannot read idempotency_keys');
select throws_ok($$select * from public.rate_limit_counters$$, '42501', null, 'anon cannot read rate_limit_counters');
reset role;

select * from finish();
rollback;
