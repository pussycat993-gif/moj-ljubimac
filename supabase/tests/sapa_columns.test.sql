-- Step 28a — CAP-08 columns (TC §5.1, §5.2, §5.5): profiles.display_name (2–40, client-writable by
-- its owner, EP-43) and marketplace_suspended_at (not client-writable); the organisations donation
-- columns (plain text / https URL — BR-58; readable only through definer functions, writable by an
-- Admin of the organisation, FR-72); the reminder_preferences type message (FR-69): every profile —
-- seeded and new — has the row {email, push}, channels a subset of {email, push} and may be empty,
-- no reminders of type message, get_reminder_settings still returns the six reminder types until
-- Step 28c (owner decision: preference_type = reminder_type).
-- Seeded: Ivana (…01, Premium), Marko (…02, Free), Jelena (…03), Dragana (…07, admin of the
-- approved shelter b2…03 Azil „Druga šansa“), Milica (…04, admin of the pending shelter b2…01).
begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

-- profiles ----------------------------------------------------------------------------------------
select has_column('public', 'profiles', 'display_name', 'profiles.display_name exists');
select col_type_is('public', 'profiles', 'display_name', 'text', 'display_name is text');
select col_is_null('public', 'profiles', 'display_name', 'display_name is optional (null = full_name is shown)');
select has_column('public', 'profiles', 'marketplace_suspended_at', 'profiles.marketplace_suspended_at exists');
select col_type_is('public', 'profiles', 'marketplace_suspended_at', 'timestamp with time zone',
  'marketplace_suspended_at is timestamptz');
select ok(has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'EP-43: display_name is client-writable');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'marketplace_suspended_at', 'UPDATE'),
  'marketplace_suspended_at is not client-writable');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.profiles set display_name = 'Marko J.' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  'a user sets their own display_name (EP-43)'
);
select throws_ok(
  $$update public.profiles set display_name = 'M' where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'display_name shorter than 2 characters is refused'
);
select throws_ok(
  $$update public.profiles set display_name = repeat('m', 41) where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'display_name longer than 40 characters is refused'
);
select lives_ok(
  $$update public.profiles set display_name = repeat('m', 40) where id = 'a1000000-0000-4000-8000-000000000002'$$,
  'display_name of 40 characters is accepted'
);
select throws_ok(
  $$update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'a user cannot suspend or unsuspend themselves'
);
update public.profiles set display_name = 'Ivana P.' where id = 'a1000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select display_name from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
  null, 'another user''s display_name is not writable'
);

update public.profiles set deletion_requested_at = now() where id = 'a1000000-0000-4000-8000-000000000003';
select throws_ok(
  $$update public.profiles set display_name = 'Jelena N.' where id = 'a1000000-0000-4000-8000-000000000003'$$,
  'P0001', 'account_pending_deletion', 'display_name cannot change while deletion is pending (EP-43)'
);
update public.profiles set deletion_requested_at = null where id = 'a1000000-0000-4000-8000-000000000003';

-- organisations: donation info (BR-58, FR-72) -----------------------------------------------------
select has_column('public', 'organisations', 'donation_bank_account', 'organisations.donation_bank_account exists');
select has_column('public', 'organisations', 'donation_url', 'organisations.donation_url exists');
select has_column('public', 'organisations', 'dropoff_address', 'organisations.dropoff_address exists');
select has_column('public', 'organisations', 'dropoff_hours', 'organisations.dropoff_hours exists');
select is(
  (select array_agg(distinct data_type) from information_schema.columns
   where table_schema = 'public' and table_name = 'organisations'
     and column_name in ('donation_bank_account', 'donation_url', 'dropoff_address', 'dropoff_hours')),
  array['text']::information_schema.character_data[], 'BR-58: donation info is plain text (no payment data)'
);
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name in ('listings', 'organisations')
     and column_name ~ '(card|iban|monri|payment|transaction|paid|amount)'),
  0, 'BR-58: no listing or organisation column stores a payment'
);
select throws_ok(
  $$update public.organisations set donation_url = 'http://drugasansa.rs/doniraj'
    where id = 'b2000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'donation_url must start with https://'
);
select is(
  (select donation_url from public.organisations where id = 'b2000000-0000-4000-8000-000000000003'),
  'https://drugasansa.rs/doniraj', 'the seeded shelter has a https donation link'
);
select ok(not has_column_privilege('authenticated', 'public.organisations', 'donation_url', 'SELECT'),
  'donation columns are not readable through the table (EP-78 / EP-53 definer functions)');
select ok(not has_column_privilege('anon', 'public.organisations', 'donation_bank_account', 'SELECT'),
  'Visitors never read donation columns');
select ok(has_column_privilege('authenticated', 'public.organisations', 'name', 'SELECT'),
  'the other organisation columns stay readable to members');

-- Dragana (Admin of the approved shelter) updates her shelter's donation info.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.organisations set dropoff_hours = 'pon–sub 9–17h'
    where id = 'b2000000-0000-4000-8000-000000000003'$$,
  'FR-72: an organisation Admin updates the donation columns'
);
select throws_ok(
  $$select donation_bank_account from public.organisations$$,
  '42501', null, 'even the Admin reads donation info only through the definer functions'
);
select is((select name from public.organisations), 'Azil „Druga šansa“', 'members still read their organisation');
-- Marko is not a member: the update matches nothing.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.organisations set donation_bank_account = '000-0-00' where id = 'b2000000-0000-4000-8000-000000000003';
reset role;
select is(
  (select row(donation_bank_account, dropoff_hours)::text from public.organisations
   where id = 'b2000000-0000-4000-8000-000000000003'),
  row('160-0000012345678-90', 'pon–sub 9–17h')::text,
  'the Admin''s change is stored; another user cannot change a shelter''s donation info'
);

-- reminder_preferences: type message (FR-69) -------------------------------------------------------
select is(
  (select count(*)::int from public.profiles p
   where not exists (
     select 1 from public.reminder_preferences r
     where r.user_id = p.id and r.type = 'message' and r.channels = '{email,push}'
   )),
  0, 'every seeded profile has the message row {email, push}'
);

insert into auth.users (id, email) values ('da280000-0000-4000-8000-000000000001', 'poruke@mojljubimac.test');
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
values ('da280000-0000-4000-8000-000000000001', 'owner', 'poruke@mojljubimac.test', now(), 'seed');
select is(
  (select row(lead_minutes, delivery_time, channels::text[])::text from public.reminder_preferences
   where user_id = 'da280000-0000-4000-8000-000000000001' and type = 'message'),
  row('{0}'::integer[], null::time, '{email,push}'::text[])::text,
  'a new profile gets the message row {email, push} with no lead time or delivery time'
);

select throws_ok(
  $$insert into public.reminders (user_id, type, title, starts_at)
    values ('a1000000-0000-4000-8000-000000000001', 'message', 'Poruka', now() + interval '1 day')$$,
  '23514', null, 'there are no reminders of type message'
);

-- Ivana (Premium): a message row takes only email / push.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'message'$$,
  '23514', null, 'whatsapp in a message row is refused'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{viber}' where type = 'message'$$,
  '23514', null, 'viber in a message row is refused'
);
select lives_ok(
  $$update public.reminder_preferences set channels = '{push}' where type = 'message'$$,
  'a message row with push only'
);
select lives_ok(
  $$update public.reminder_preferences set channels = '{}' where type = 'message'$$,
  'an empty message row switches new-message notifications off'
);
select is(
  (select channels::text[] from public.reminder_preferences where type = 'message'),
  '{}'::text[], 'the empty array is stored'
);
select lives_ok(
  $$update public.reminder_preferences set lead_minutes = '{1440,0}', delivery_time = '07:00'
    where type = 'message'$$,
  'lead time and delivery time sent for message are ignored'
);
select is(
  (select row(lead_minutes, delivery_time)::text from public.reminder_preferences where type = 'message'),
  row('{0}'::integer[], null::time)::text, 'message is stored with lead {0} and no delivery time'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{}' where type = 'vaccination'$$,
  '23514', null, 'the six reminder types still need at least one channel (BR-14)'
);
select lives_ok(
  $$insert into public.reminder_preferences (type, lead_minutes, channels)
    values ('message', '{0}', '{email}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  'the EP-28 upsert works for message'
);
select is(
  (select channels::text[] from public.reminder_preferences where type = 'message'),
  '{email}'::text[], 'the upserted message channels are stored'
);
select is(
  jsonb_array_length(public.get_reminder_settings() -> 'preferences'), 6,
  'get_reminder_settings keeps returning the six reminder types until Step 28c'
);
select ok(
  not (public.get_reminder_settings() -> 'preferences') @> '[{"type":"message"}]',
  'get_reminder_settings skips message'
);
reset role;

select throws_ok(
  $$insert into public.reminder_preferences (user_id, type, lead_minutes, channels)
    values ('da280000-0000-4000-8000-000000000001', 'message', '{0}', '{whatsapp}')
    on conflict (user_id, type) do update set channels = excluded.channels$$,
  '23514', null, 'the subset check holds for System writes too'
);

select * from finish();
rollback;
