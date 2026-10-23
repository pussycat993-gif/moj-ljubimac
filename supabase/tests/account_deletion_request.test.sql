-- EP-51 request_account_deletion / cancel_account_deletion (Step 23; FR-40, BR-31, E-16) and the EP-50 database
-- side (request_data_export, get_my_data_overview_base). Seeded: Ivana (…01, Premium owner of a household
-- whose member is Jelena …03), Marko (…02, Free owner of Kiki).
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

select has_function('public', 'request_account_deletion', array[]::text[], 'EP-51 request function exists');
select has_function('public', 'cancel_account_deletion', array[]::text[], 'EP-51 cancel function exists');
select has_function('public', 'request_data_export', array[]::text[], 'EP-50 request function exists');
select has_function('public', 'get_my_data_overview_base', array[]::text[], 'EP-50 overview function exists');
select ok(not has_function_privilege('anon', 'public.request_account_deletion()', 'execute'), 'a Visitor cannot request deletion');
select ok(not has_function_privilege('anon', 'public.cancel_account_deletion()', 'execute'), 'a Visitor cannot cancel deletion');
select ok(not has_function_privilege('anon', 'public.request_data_export()', 'execute'), 'a Visitor cannot request an export');

-- Snapshot before the request (as postgres).
create temp table before_profile on commit drop as
  select to_jsonb(p) - 'updated_at' as row from public.profiles p where p.id = 'a1000000-0000-4000-8000-000000000001';
create temp table before_pets on commit drop as
  select jsonb_agg(to_jsonb(p) order by p.id) as rows from public.pets p where p.owner_id = 'a1000000-0000-4000-8000-000000000001';
create temp table before_subs on commit drop as
  select jsonb_agg(to_jsonb(s) order by s.id) as rows from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000001';

-- FR-40 #1 — request -------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.request_account_deletion()$$, 'the owner requests deletion');
reset role;

select is((select deletion_requested_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'), now(),
  'deletion_requested_at = now()');
select is((select deletion_due_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'), now() + interval '30 days',
  'deletion_due_at = now() + 30 days (BR-31)');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.request_account_deletion()$$, 'P0001', 'account_pending_deletion',
  'a second request while pending → account_pending_deletion');
select throws_ok(
  $$update public.profiles set full_name = 'Neko drugi' where id = 'a1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'account_pending_deletion', 'a protected profile write while pending → account_pending_deletion'
);
select is((public.get_me() ->> 'deletion_days_left')::int, 30, 'EP-43 reports 30 days left');
select is((public.get_my_data_overview_base() -> 'deletion' ->> 'days_left')::int, 30, 'EP-50 deletion.days_left = 30');
select is(public.get_my_data_overview_base() -> 'deletion' ->> 'heir_full_name', 'Jelena Nikolić',
  'EP-50 heir = the earliest-joined household member (BR-27)');
reset role;

select is(
  (select jsonb_agg(to_jsonb(s) order by s.id) from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000001'),
  (select rows from before_subs), 'subscriptions are not changed by the request (E-16)'
);

-- FR-40 #2 — cancel ------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.cancel_account_deletion()$$, 'the owner cancels the deletion');
select is(public.get_me() -> 'deletion_due_at', 'null'::jsonb, 'EP-43 shows no pending deletion');
reset role;

select is(
  (select jsonb_build_array(deletion_requested_at, deletion_due_at) from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
  '[null, null]'::jsonb, 'cancel clears both columns'
);
select is((select to_jsonb(p) - 'updated_at' from public.profiles p where p.id = 'a1000000-0000-4000-8000-000000000001'),
  (select row from before_profile), 'the profile is identical to before the request (updated_at aside)');
select is(
  (select jsonb_agg(to_jsonb(p) order by p.id) from public.pets p where p.owner_id = 'a1000000-0000-4000-8000-000000000001'),
  (select rows from before_pets), 'pets are identical to before the request'
);
select is(
  (select jsonb_agg(to_jsonb(s) order by s.id) from public.subscriptions s where s.user_id = 'a1000000-0000-4000-8000-000000000001'),
  (select rows from before_subs), 'subscriptions are identical to before the request'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.cancel_account_deletion()$$, 'cancel with nothing pending is a no-op');
reset role;

-- EP-50 — data export request and overview (Marko) ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.data_exports (user_id) values ('a1000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'clients cannot insert data_exports directly'
);
select is((public.request_data_export()).status::text, 'preparing', 'requestDataExport inserts a preparing row');
select throws_ok($$select public.request_data_export()$$, 'P0001', 'export_in_progress',
  'a second request while preparing → export_in_progress');
select is((select count(*)::int from public.data_exports), 1, 'the caller sees exactly their one export');
select is(public.get_my_data_overview_base() -> 'summary' -> 'pet_names', '["Kiki"]'::jsonb, 'summary.pet_names');
select is(public.get_my_data_overview_base() -> 'deletion' -> 'heir_full_name', 'null'::jsonb, 'no household → no heir');
reset role;

-- A finished export allows a new request.
update public.data_exports set status = 'ready' where user_id = 'a1000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.request_data_export()$$, 'a new request once the previous archive is ready');
reset role;

select * from finish();
rollback;
