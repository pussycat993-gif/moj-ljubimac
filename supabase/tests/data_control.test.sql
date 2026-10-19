-- data_exports (EP-50) and r2_deletion_queue (TC §5.7, §5.9).
-- Seeded users: Ivana (…01), Marko (…02).
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- data_exports --------------------------------------------------------------------------------
select columns_are('public', 'data_exports', array[
  'id', 'user_id', 'status', 'r2_key', 'size_bytes', 'requested_at', 'ready_at', 'expires_at',
  'created_at', 'updated_at'
], 'data_exports has the TC §5.7 columns');
select enum_has_labels('public', 'data_export_status', array['preparing', 'ready', 'failed', 'expired'],
  'export status is preparing / ready / failed / expired');
select col_not_null('public', 'data_exports', 'user_id', 'user_id is not null');
select col_type_is('public', 'data_exports', 'size_bytes', 'bigint', 'size_bytes is bigint');
select fk_ok('public', 'data_exports', 'user_id', 'public', 'profiles', 'id', 'user_id references profiles');

insert into public.data_exports (user_id) values
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.data_exports), 1, 'a user sees only their own export');
select is(
  (select user_id from public.data_exports),
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'the visible export is the caller''s'
);
select throws_ok(
  $$insert into public.data_exports (user_id) values ('a1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'clients cannot insert exports'
);
select throws_ok($$update public.data_exports set status = 'ready'$$, '42501', null, 'clients cannot update exports');
select throws_ok($$delete from public.data_exports$$, '42501', null, 'clients cannot delete exports');

-- r2_deletion_queue ------------------------------------------------------------------------------
reset role;
select columns_are('public', 'r2_deletion_queue', array['r2_key', 'queued_at'], 'r2_deletion_queue has r2_key, queued_at');
select col_is_pk('public', 'r2_deletion_queue', 'r2_key', 'r2_key is the primary key');

set local role authenticated;
select throws_ok($$select * from public.r2_deletion_queue$$, '42501', null, 'r2_deletion_queue is invisible to authenticated');
select throws_ok(
  $$insert into public.r2_deletion_queue (r2_key) values ('x')$$,
  '42501', null, 'clients cannot queue R2 keys'
);
reset role;
set local role anon;
select throws_ok($$select * from public.r2_deletion_queue$$, '42501', null, 'r2_deletion_queue is invisible to anon');
reset role;

select * from finish();
rollback;
