-- Step 30 — EP-52 nightly deletion & retention job, database side (FR-40 #1, NFR-06, NFR-08, TC §5.9, EP-52
-- steps 4–5): retention_delete_due_accounts, r2_deletion_batch / r2_dequeue, r2_keys_in_use,
-- retention_purge_deliveries, retention_expire_invitations, retention_expire_exports and
-- retention_purge_server_support (service role only) and the 'retention-nightly' pg_cron job.
-- Seeded (supabase/seed.sql): Marko (…02) owns Kiki (c1…03, not shared) and listings f3…02 / f3…06; Ivana (…01)
-- owns household b1…01; shelter b2…01 has Žuća (c1…04); breeder b2…02. Time is moved by setting timestamps in
-- fixtures (deletion_requested_at, delivered_at, created_at, window_start, expires_at).
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- Rows of any table whose foreign key points at the user (profiles or auth.users), counted dynamically.
create function pg_temp.rows_referencing(p_user uuid)
returns integer
language plpgsql
as $$
declare
  fk record;
  n integer;
  total integer := 0;
begin
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('select count(*) from %s where %I = $1', fk.tbl, fk.col) into n using p_user;
    total := total + n;
  end loop;
  return total;
end;
$$;

-- Privileges ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.retention_delete_due_accounts()$$, '42501', null,
  'a signed-in user cannot run retention_delete_due_accounts');
select throws_ok($$select * from public.r2_deletion_batch()$$, '42501', null, 'a signed-in user cannot read the R2 queue');
select throws_ok($$select public.r2_dequeue(array['x'])$$, '42501', null, 'a signed-in user cannot dequeue keys');
select throws_ok($$select public.r2_keys_in_use(array['x'])$$, '42501', null, 'a signed-in user cannot run r2_keys_in_use');
select throws_ok($$select public.retention_purge_deliveries()$$, '42501', null, 'a signed-in user cannot purge deliveries');
select throws_ok($$select public.retention_expire_invitations()$$, '42501', null, 'a signed-in user cannot expire invitations');
select throws_ok($$select public.retention_expire_exports()$$, '42501', null, 'a signed-in user cannot expire exports');
select throws_ok($$select public.retention_purge_server_support()$$, '42501', null,
  'a signed-in user cannot purge idempotency keys and rate-limit counters');
reset role;
select set_config('request.jwt.claims', '', true);

-- FR-40 #1 — permanent deletion after 30 days --------------------------------------------------------------
update public.pets set photo_r2_key = 'u/a1000000-0000-4000-8000-000000000002/pets/c1000000-0000-4000-8000-000000000003/photo/kiki.jpg'
where id = 'c1000000-0000-4000-8000-000000000003';
insert into public.data_exports (user_id, status, r2_key, size_bytes, ready_at, expires_at) values
  ('a1000000-0000-4000-8000-000000000002', 'ready', 'exports/a1000000-0000-4000-8000-000000000002/marko.zip', 1000,
   now() - interval '1 day', now() + interval '6 days');
insert into public.idempotency_keys (user_id, key, operation, result)
values ('a1000000-0000-4000-8000-000000000002', gen_random_uuid(), 'pets.create', '{}'::jsonb);
update public.profiles set deletion_requested_at = now() - interval '30 days' - interval '1 minute'
where id = 'a1000000-0000-4000-8000-000000000002';
-- Inside the window: untouched.
update public.profiles set deletion_requested_at = now() - interval '10 days'
where id = 'a1000000-0000-4000-8000-000000000006';
select ok(pg_temp.rows_referencing('a1000000-0000-4000-8000-000000000002') > 5,
  'fixture: Marko has rows in several tables (pet, listings, export, idempotency key, …)');

set local role service_role;
select is(
  public.retention_delete_due_accounts(),
  '{"failed": 0, "accounts_deleted": 1, "organisations_deleted": 0, "households_transferred": 0}'::jsonb,
  'FR-40 #1: exactly the profile past deletion_due_at is deleted'
);
reset role;
select ok(not exists (select 1 from auth.users where id = 'a1000000-0000-4000-8000-000000000002')
          and not exists (select 1 from public.profiles where id = 'a1000000-0000-4000-8000-000000000002'),
  'FR-40 #1: the account is deleted');
select ok(not exists (select 1 from public.pets where id = 'c1000000-0000-4000-8000-000000000003'),
  'FR-40 #1: with its unshared pets');
select is(
  (select array_agg(r2_key order by r2_key) from public.r2_deletion_queue where r2_key like '%a1000000-0000-4000-8000-000000000002%'),
  array['exports/a1000000-0000-4000-8000-000000000002/marko.zip',
        'u/a1000000-0000-4000-8000-000000000002/pets/c1000000-0000-4000-8000-000000000003/photo/kiki.jpg'],
  'FR-40 #1: the pet photo and the export archive keys are queued for R2'
);
select is(
  (select row(deletion_requested_at is not null, deletion_due_at > now())::text from public.profiles
   where id = 'a1000000-0000-4000-8000-000000000006'),
  row(true, true)::text,
  'FR-40 #1: a profile inside the 30-day window is untouched'
);

-- NFR-06 — 31 days after the request nothing of the account remains ---------------------------------------
select is(pg_temp.rows_referencing('a1000000-0000-4000-8000-000000000002'), 0,
  'NFR-06: no row references the deleted user');
set local role service_role;
select ok(
  (select array_agg(k) from public.r2_deletion_batch() k) @>
  array['exports/a1000000-0000-4000-8000-000000000002/marko.zip',
        'u/a1000000-0000-4000-8000-000000000002/pets/c1000000-0000-4000-8000-000000000003/photo/kiki.jpg'],
  'step 2: the R2 batch hands the queued keys to the route'
);
select is(public.r2_dequeue(array['exports/a1000000-0000-4000-8000-000000000002/marko.zip']), 1,
  'step 2: a key R2 confirmed is dequeued');
select is((select count(*)::int from public.r2_deletion_queue where r2_key like '%a1000000-0000-4000-8000-000000000002%'), 1,
  'step 2: a key R2 has not confirmed stays queued');
select is(public.r2_dequeue(array['u/a1000000-0000-4000-8000-000000000002/pets/c1000000-0000-4000-8000-000000000003/photo/kiki.jpg']), 1,
  'step 2: the next confirmation dequeues it');
reset role;
select is((select count(*)::int from public.r2_deletion_queue where r2_key like '%a1000000-0000-4000-8000-000000000002%'), 0,
  'NFR-06: no queued key of the deleted user remains');

-- Orphan scan (API §10 item 7) ------------------------------------------------------------------------------
update public.pets set photo_r2_key = 'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/photo/luna.jpg'
where id = 'c1000000-0000-4000-8000-000000000001';
insert into public.r2_deletion_queue (r2_key) values ('u/queued.jpg');
set local role service_role;
select is(
  public.r2_keys_in_use(array[
    'u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/photo/luna.jpg',
    'u/orphan.jpg', 'u/queued.jpg']),
  array['u/a1000000-0000-4000-8000-000000000001/pets/c1000000-0000-4000-8000-000000000001/photo/luna.jpg', 'u/queued.jpg'],
  'r2_keys_in_use returns the keys a row uses (or the queue holds); the orphan is left out'
);
reset role;

-- NFR-08 — delivery history is kept 12 months ------------------------------------------------------------
insert into public.reminder_deliveries (occurrence_id, recipient_id, channel, status, delivered_at, created_at)
select o.id, 'a1000000-0000-4000-8000-000000000001', v.channel::public.delivery_channel, v.status::public.delivery_status,
       v.delivered_at, v.created_at
from (select id from public.reminder_occurrences order by id limit 1) o
cross join (values
  ('email', 'delivered', now() - interval '12 months' - interval '1 day', now() - interval '12 months' - interval '1 day'),
  ('push', 'delivered', now() - interval '11 months', now() - interval '11 months'),
  ('whatsapp', 'failed', null::timestamptz, now() - interval '13 months')
) as v(channel, status, delivered_at, created_at);
set local role service_role;
select is(public.retention_purge_deliveries(), 2, 'NFR-08: deliveries older than 12 months are purged (failed rows by created_at)');
reset role;
select is((select array_agg(channel::text) from public.reminder_deliveries where created_at < now() - interval '1 day'),
  array['push'], 'NFR-08: the newer delivery is kept');

-- TC §5.9 — idempotency keys and rate-limit windows ---------------------------------------------------------
insert into public.idempotency_keys (user_id, key, operation, result, created_at) values
  ('a1000000-0000-4000-8000-000000000001', gen_random_uuid(), 'test.old', '{}'::jsonb, now() - interval '25 hours'),
  ('a1000000-0000-4000-8000-000000000001', gen_random_uuid(), 'test.new', '{}'::jsonb, now() - interval '1 hour');
insert into public.rate_limit_counters (user_id, operation, window_start, count) values
  ('a1000000-0000-4000-8000-000000000001', 'test.ended', now() - interval '25 hours', 3),
  ('a1000000-0000-4000-8000-000000000001', 'test.current', date_trunc('hour', now()), 1);
set local role service_role;
select is(public.retention_purge_server_support(), '{"idempotency_keys": 1, "rate_limit_counters": 1}'::jsonb,
  'TC §5.9: one old idempotency key and one ended window are purged');
reset role;
select is((select array_agg(operation) from public.idempotency_keys where operation like 'test.%'), array['test.new'],
  'TC §5.9: an idempotency key younger than 24 h is kept');
select is((select array_agg(operation) from public.rate_limit_counters where operation like 'test.%'), array['test.current'],
  'TC §5.9: the current rate-limit window is kept');

-- EP-52 step 4 — invitation and transfer expiry -------------------------------------------------------------
insert into public.household_invitations (household_id, email, token_hash, expires_at) values
  ('b1000000-0000-4000-8000-000000000001', 'a@mojljubimac.test', 'test-hh-old', now() - interval '1 minute'),
  ('b1000000-0000-4000-8000-000000000001', 'b@mojljubimac.test', 'test-hh-new', now() + interval '1 day');
insert into public.organisation_invitations (organisation_id, email, role, token_hash, expires_at) values
  ('b2000000-0000-4000-8000-000000000002', 'c@mojljubimac.test', 'volunteer', 'test-og-old', now() - interval '1 minute');
insert into public.record_transfers (pet_id, from_organisation_id, recipient_email, token_hash, expires_at, status) values
  ('c1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'd@mojljubimac.test', 'test-tr-old',
   now() - interval '1 minute', 'pending'),
  ('c1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'e@mojljubimac.test', 'test-tr-declined',
   now() - interval '1 minute', 'declined');
set local role service_role;
select is(public.retention_expire_invitations(), '{"transfers_expired": 1, "invitations_expired": 2}'::jsonb,
  'EP-52 step 4: pending household and team invitations and transfers past expires_at expire');
reset role;
select is(
  (select jsonb_object_agg(token_hash, status) from (
     select token_hash, status::text from public.household_invitations where token_hash like 'test-%'
     union all select token_hash, status::text from public.organisation_invitations where token_hash like 'test-%'
     union all select token_hash, status::text from public.record_transfers where token_hash like 'test-%') x),
  '{"test-hh-old": "expired", "test-hh-new": "pending", "test-og-old": "expired", "test-tr-old": "expired",
    "test-tr-declined": "declined"}'::jsonb,
  'only pending rows past expires_at change; a valid invitation and a decided transfer stay'
);

-- EP-52 step 5 — export archives ----------------------------------------------------------------------------
insert into public.data_exports (user_id, status, r2_key, size_bytes, ready_at, expires_at) values
  ('a1000000-0000-4000-8000-000000000001', 'ready', 'exports/a1000000-0000-4000-8000-000000000001/old.zip', 10,
   now() - interval '8 days', now() - interval '1 day'),
  ('a1000000-0000-4000-8000-000000000001', 'ready', 'exports/a1000000-0000-4000-8000-000000000001/new.zip', 10,
   now() - interval '1 day', now() + interval '6 days');
set local role service_role;
select is(public.retention_expire_exports(),
  '{"r2_keys": ["exports/a1000000-0000-4000-8000-000000000001/old.zip"], "exports_expired": 1}'::jsonb,
  'EP-52 step 5: a ready export past expires_at expires and its archive key is handed to R2');
reset role;
select is(
  (select jsonb_object_agg(r2_key, status) from public.data_exports where user_id = 'a1000000-0000-4000-8000-000000000001'),
  '{"exports/a1000000-0000-4000-8000-000000000001/old.zip": "expired",
    "exports/a1000000-0000-4000-8000-000000000001/new.zip": "ready"}'::jsonb,
  'EP-52 step 5: the valid archive stays ready'
);
select ok(exists (select 1 from public.r2_deletion_queue where r2_key = 'exports/a1000000-0000-4000-8000-000000000001/old.zip'),
  'EP-52 step 5: the archive stays queued until R2 confirms the deletion');

-- Schedule -------------------------------------------------------------------------------------------------
select is(
  (select row(schedule, active, command like '%private.call_internal_route(''/api/internal/retention-nightly'')%')::text
   from cron.job where jobname = 'retention-nightly'),
  row('30 1,2 * * *', true, true)::text,
  'retention-nightly runs at 01:30 and 02:30 UTC through call_internal_route (the route keeps 03:30 Belgrade)'
);

select * from finish();
rollback;
