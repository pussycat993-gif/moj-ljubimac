-- rpc:claim_due_occurrences (EP-33 step 1; FR-20 delivered, NFR-01): claims only pending notices with
-- notify_at ≤ now() (→ sent, sent_at = now()); skips done instances, inactive reminders, memorial pets
-- (BR-17) and owners pending deletion; a claimed row is never claimed twice (FOR UPDATE SKIP LOCKED);
-- batches of ≤ 200. Each claimed notice carries its recipients (EP-33 step 2: owner plus opted-in
-- household members). Also: the every-minute pg_cron schedule through pg_net with the Vault secrets
-- dispatch_url / dispatch_secret (TC §8), and mark_occurrence_done_for (EP-32: the EP-26 effects with
-- done_by = the recipient, same access rules).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium, Luna c1…01 shared into her household b1…01),
-- Marko (…02), Jelena (…03, member of Ivana's household), Ana (…06).
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

create function pg_temp.error_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_message text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_message = message_text;
  return v_message;
end;
$$;

select has_function('public', 'claim_due_occurrences', array['integer'], 'rpc:claim_due_occurrences exists');
select ok(
  not has_function_privilege('anon', 'public.claim_due_occurrences(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_due_occurrences(integer)', 'execute'),
  'only the service role can claim (anon and authenticated cannot)'
);
select ok(
  has_function_privilege('service_role', 'public.claim_due_occurrences(integer)', 'execute'),
  'the service role can claim'
);
select ok(
  pg_get_functiondef('public.claim_due_occurrences(integer)'::regprocedure) ilike '%for update of c skip locked%',
  'the claim locks with FOR UPDATE SKIP LOCKED, so overlapping runs skip each other''s rows'
);

-- Nothing else is due during this test.
update public.reminder_occurrences set notify_at = now() + interval '1 day'
where status = 'pending' and notify_at <= now();

-- Fixtures (no triggers: memorial pet with an active reminder, inactive reminder, owner pending deletion).
set local session_replication_role = replica;
insert into public.pets (id, owner_id, name, species, sex, lifecycle) values
  ('f9000000-0000-4000-8000-0000000000e1', 'a1000000-0000-4000-8000-000000000002', 'Uspomena — Step 19', 'cat', 'female', 'memorial');
insert into public.reminders (id, user_id, pet_id, type, title, starts_at, recurrence, active) values
  ('f9000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', null, 'manual', 'Due — Step 19', now() - interval '1 day', 'none', true),
  ('f9000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', null, 'manual', 'Inactive — Step 19', now() - interval '1 day', 'none', false),
  ('f9000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-0000000000e1', 'manual', 'Memorial — Step 19', now() - interval '1 day', 'none', true),
  ('f9000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000006', null, 'manual', 'Deleting — Step 19', now() - interval '1 day', 'none', true),
  ('f9000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', null, 'manual', 'Done — Step 19', now() - interval '1 day', 'none', true),
  ('f9000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'manual', 'Shared — Step 19', now() - interval '1 day', 'none', true);
update public.profiles set deletion_requested_at = now() where id = 'a1000000-0000-4000-8000-000000000006';
set local session_replication_role = origin;

insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at, status, sent_at, done_at) values
  -- claimable
  ('f9000000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-000000000001', now() + interval '1 hour', now() - interval '5 minutes', 'pending', null, null),
  -- not yet due
  ('f9000000-0000-4000-8000-0000000000a2', 'f9000000-0000-4000-8000-000000000001', now() + interval '2 hours', now() + interval '5 minutes', 'pending', null, null),
  -- already sent
  ('f9000000-0000-4000-8000-0000000000a3', 'f9000000-0000-4000-8000-000000000001', now() + interval '3 hours', now() - interval '10 minutes', 'sent', now() - interval '10 minutes', null),
  -- inactive reminder / memorial pet / owner pending deletion
  ('f9000000-0000-4000-8000-0000000000b1', 'f9000000-0000-4000-8000-000000000002', now() + interval '1 hour', now() - interval '5 minutes', 'pending', null, null),
  ('f9000000-0000-4000-8000-0000000000b2', 'f9000000-0000-4000-8000-000000000003', now() + interval '1 hour', now() - interval '5 minutes', 'pending', null, null),
  ('f9000000-0000-4000-8000-0000000000b3', 'f9000000-0000-4000-8000-000000000004', now() + interval '1 hour', now() - interval '5 minutes', 'pending', null, null),
  -- an instance already done (its other notice is still pending)
  ('f9000000-0000-4000-8000-0000000000b4', 'f9000000-0000-4000-8000-000000000005', now() + interval '1 hour', now() - interval '20 minutes', 'done', null, now() - interval '1 minute'),
  ('f9000000-0000-4000-8000-0000000000b5', 'f9000000-0000-4000-8000-000000000005', now() + interval '1 hour', now() - interval '5 minutes', 'pending', null, null),
  -- Ivana's reminder on Luna, shared with Jelena
  ('f9000000-0000-4000-8000-0000000000c1', 'f9000000-0000-4000-8000-000000000006', now() + interval '1 hour', now() - interval '1 minute', 'pending', null, null);

-- Jelena switches reminders on for the shared household (FR-29).
update public.household_memberships set reminders_enabled = true
where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003';

create temp table t_claim as select public.claim_due_occurrences(200) as j;
create temp table t_ids as
select (e ->> 'occurrence_id')::uuid as id, e from t_claim, jsonb_array_elements(j) e;

select is(
  (select array_agg(id order by id) from t_ids),
  array['f9000000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-0000000000c1']::uuid[],
  'claims exactly the pending notices with notify_at <= now() of active reminders'
);
select is(
  (select array_agg(id order by (e ->> 'notify_at')::timestamptz) from t_ids),
  array['f9000000-0000-4000-8000-0000000000a1', 'f9000000-0000-4000-8000-0000000000c1']::uuid[],
  'claimed notices come oldest notify_at first'
);
select is(
  (select row(status, sent_at)::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000a1'),
  row('sent'::public.occurrence_status, now())::text,
  'a claimed notice is sent with sent_at = now()'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000a2'),
  'pending', 'a notice not yet due stays pending'
);
select is(
  (select row(status, sent_at)::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000a3'),
  row('sent'::public.occurrence_status, now() - interval '10 minutes')::text,
  'an already sent notice is not claimed again'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000b1'),
  'pending', 'an inactive reminder is skipped (stays pending)'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000b2'),
  'pending', 'a memorial pet''s reminder is skipped (BR-17)'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000b3'),
  'pending', 'an owner pending deletion is skipped'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000b5'),
  'pending', 'a notice of an instance already done is skipped'
);

-- Payload (EP-33 steps 2–3 inputs).
select is(
  (select e ->> 'title' from t_ids where id = 'f9000000-0000-4000-8000-0000000000a1'),
  'Due — Step 19', 'the payload carries the reminder title'
);
select is(
  (select jsonb_array_length(e -> 'recipients') from t_ids where id = 'f9000000-0000-4000-8000-0000000000a1'),
  1, 'a personal reminder has one recipient'
);
select is(
  (select row(r ->> 'id', r ->> 'is_owner', r ->> 'locale', r -> 'channels')::text
   from t_ids, jsonb_array_elements(e -> 'recipients') r where id = 'f9000000-0000-4000-8000-0000000000a1'),
  row('a1000000-0000-4000-8000-000000000002', 'true', 'sr-Latn', '["email", "push"]'::jsonb)::text,
  'the owner is the recipient, with locale and preference channels'
);
select is(
  (select array_agg(r ->> 'id' order by r ->> 'id') from t_ids, jsonb_array_elements(e -> 'recipients') r
   where id = 'f9000000-0000-4000-8000-0000000000c1'),
  array['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003'],
  'a shared pet''s reminder goes to the owner and the opted-in member (BR-24, FR-29)'
);
select is(
  (select row(r ->> 'is_owner', r ->> 'premium')::text from t_ids, jsonb_array_elements(e -> 'recipients') r
   where id = 'f9000000-0000-4000-8000-0000000000c1' and r ->> 'id' = 'a1000000-0000-4000-8000-000000000001'),
  row('true', 'true')::text,
  'the owner is marked as owner with Premium'
);
select is(
  (select r ->> 'is_owner' from t_ids, jsonb_array_elements(e -> 'recipients') r
   where id = 'f9000000-0000-4000-8000-0000000000c1' and r ->> 'id' = 'a1000000-0000-4000-8000-000000000003'),
  'false', 'the member is marked as not the owner'
);
select is(
  (select e ->> 'pet_name' from t_ids where id = 'f9000000-0000-4000-8000-0000000000c1'),
  'Luna', 'the payload carries the pet name'
);

-- No double claim.
select is(public.claim_due_occurrences(200), '[]'::jsonb, 'a second run claims nothing already claimed');

-- Member not opted in → not a recipient.
update public.household_memberships set reminders_enabled = false
where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003';
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at) values
  ('f9000000-0000-4000-8000-0000000000c2', 'f9000000-0000-4000-8000-000000000006', now() + interval '5 hours', now() - interval '1 minute');
select is(
  (select jsonb_path_query_array(public.claim_due_occurrences(200), '$[*].recipients[*].id')),
  '["a1000000-0000-4000-8000-000000000001"]'::jsonb,
  'a member who did not switch reminders on gets nothing'
);

-- Batches.
insert into public.reminder_occurrences (id, reminder_id, due_at, notify_at) values
  ('f9000000-0000-4000-8000-0000000000d1', 'f9000000-0000-4000-8000-000000000001', now() + interval '6 hours', now() - interval '3 minutes'),
  ('f9000000-0000-4000-8000-0000000000d2', 'f9000000-0000-4000-8000-000000000001', now() + interval '7 hours', now() - interval '2 minutes');
select is(
  jsonb_array_length(public.claim_due_occurrences(1)), 1, 'the limit bounds the batch'
);
select is(
  (select status::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000d2'),
  'pending', 'the rest waits for the next batch'
);
select is(
  pg_temp.error_of('select public.claim_due_occurrences(201)'),
  'validation_failed', 'a batch is at most 200'
);

-- pg_cron → pg_net (TC §8, ADR-04) ------------------------------------------------------------------
select has_extension('pg_net', 'pg_net is installed');
select is(
  (select row(schedule, command, active)::text from cron.job where jobname = 'reminder-dispatch'),
  row('* * * * *', 'select private.call_internal_route(''/api/internal/dispatch'')', true)::text,
  'the dispatch job runs every minute and calls the dispatch route'
);
select ok(
  pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%dispatch_url%'
  and pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%dispatch_secret%'
  and pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%X-Dispatch-Secret%',
  'the call reads dispatch_url / dispatch_secret from Vault and sends the secret header'
);
create temp table t_queue as select count(*)::int as n from net.http_request_queue;
select is(
  private.call_internal_route('/api/internal/dispatch'), null,
  'without the Vault secrets the call does nothing'
);
select is(
  (select count(*)::int from net.http_request_queue), (select n from t_queue),
  'and queues no HTTP request'
);
select ok(
  not has_function_privilege('anon', 'private.call_internal_route(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.call_internal_route(text)', 'execute'),
  'anon and authenticated cannot call the internal route'
);

-- mark_occurrence_done_for (EP-32) --------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.mark_occurrence_done_for(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_occurrence_done_for(uuid, uuid)', 'execute'),
  'only the service role can mark done for a recipient'
);
select is(
  (select public.mark_occurrence_done_for('f9000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000002') ->> 'display_status'),
  'done', 'the recipient''s link marks the instance done'
);
select is(
  (select row(status, done_by, done_at)::text from public.reminder_occurrences where id = 'f9000000-0000-4000-8000-0000000000a1'),
  row('done'::public.occurrence_status, 'a1000000-0000-4000-8000-000000000002'::uuid, now())::text,
  'done_by = the recipient, done_at = now()'
);
select is(
  coalesce(current_setting('request.jwt.claim.sub', true), ''), '',
  'the caller identity is restored afterwards'
);
select is(
  pg_temp.error_of($$select public.mark_occurrence_done_for('f9000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-000000000003')$$),
  'not_found', 'a member who switched reminders off lost access → not_found'
);
select is(
  pg_temp.error_of($$select public.mark_occurrence_done_for('f9000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-000000000002')$$),
  'not_found', 'someone with no relation → not_found'
);
update public.household_memberships set reminders_enabled = true
where household_id = 'b1000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003';
update public.households set read_only = true where id = 'b1000000-0000-4000-8000-000000000001';
select is(
  pg_temp.error_of($$select public.mark_occurrence_done_for('f9000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-000000000003')$$),
  'household_read_only', 'a member of a read-only household → household_read_only'
);
update public.households set read_only = false where id = 'b1000000-0000-4000-8000-000000000001';
select is(
  (select public.mark_occurrence_done_for('f9000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-000000000003') ->> 'done_by'),
  'a1000000-0000-4000-8000-000000000003', 'an opted-in member marks the shared instance done as themselves'
);

select * from finish();
rollback;
