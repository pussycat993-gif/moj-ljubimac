-- Step 28c — Operator moderation (EP-86, FR-71): rpc:admin_list_moderation (open reports oldest first, restrictions,
-- open_count, handled_this_month; empty for non-Operators — owner decision) and the service-role functions behind the
-- `moderate` action: admin_decide_report (dismiss / hide / suspend, one transaction), admin_restore_listing (active,
-- expired, or expired when the BR-55 limit refuses — owner decision) and admin_restore_user. BR-60: a suspended user
-- cannot publish, edit, extend or send, and their listings leave the public reads. The Operator never reads messages.
-- Seeded (Step 28a): Marko's open scam report on Jelena's selling listing f3…04; Ana (…06) is the Operator.
-- Added here: R1 Ivana → f3…04 (spam), R2 Ivana → user Nikola (spam), R3 Jelena → Marko's f3…02 (inappropriate),
-- R5 Marko → Ivana's resolved f3…07, Nikola's giving listing f3…08.
begin;
create extension if not exists pgtap with schema extensions;

select plan(59);

create function pg_temp.as_user(p_user text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_service()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

create temp table city (name text primary key, id uuid);
insert into city select c.name_sr, c.id from public.cities c where c.name_sr = 'Novi Sad';
grant select on city to anon, authenticated, service_role;

-- Fixtures (as the database owner) ----------------------------------------------------------------------
update public.reports set created_at = now() - interval '3 days'
where listing_id = 'f3000000-0000-4000-8000-000000000004' and reporter_id = 'a1000000-0000-4000-8000-000000000002';

insert into public.reports (id, reporter_id, listing_id, reported_user_id, reason, note, created_at) values
  ('f3200000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'f3000000-0000-4000-8000-000000000004', null, 'spam', 'Isti oglas na svim grupama.', now() - interval '2 days'),
  ('f3200000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', null,
   'a1000000-0000-4000-8000-000000000005', 'spam', 'Šalje reklame prodavnice u porukama.', now() - interval '1 day'),
  ('f3200000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003',
   'f3000000-0000-4000-8000-000000000002', null, 'inappropriate', null, now() - interval '1 hour');

insert into public.listings (id, author_id, type, title, description, category, species, city_id, published_at)
values ('f3000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000005', 'giving',
  'Poklanjam štenećak ogradicu', 'Ograda za štence, 4 panela.', 'equipment_toys', 'dog',
  (select id from city), now() - interval '4 days');

-- FR-71 #1 — the queue -----------------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000006');
set local role authenticated;
select is(
  (select array_agg(right(x ->> 'report_id', 2) order by o)
   from jsonb_array_elements(public.admin_list_moderation('open_reports') -> 'items') with ordinality as t (x, o)),
  array[
    right((select id::text from public.reports where reporter_id = 'a1000000-0000-4000-8000-000000000002'), 2),
    '01', '02', '03'
  ],
  'FR-71 #1: open reports are listed oldest first'
);
select is((public.admin_list_moderation('open_reports') ->> 'total')::int, 4, 'total counts the open reports');
select is((public.admin_list_moderation('open_reports') ->> 'open_count')::int, 4, 'open_count feeds the tab and nav badge');
select is((public.admin_list_moderation('open_reports') ->> 'handled_this_month')::int, 0, 'nothing handled yet');
select is(
  (public.admin_list_moderation('open_reports') -> 'items' -> 0) - 'report_id' - 'created_at',
  '{
    "target": "listing", "reason": "scam", "note": "Traži uplatu unapred pre nego što pokaže krevet.", "status": "open",
    "handled_at": null,
    "reporter": {"user_id": "a1000000-0000-4000-8000-000000000002", "display_name": "Marko Jovanović"},
    "listing": {"id": "f3000000-0000-4000-8000-000000000004", "title": "Prodajem krevet za psa", "status": "active"},
    "reported_user": {"user_id": "a1000000-0000-4000-8000-000000000003", "display_name": "Jelena Nikolić", "suspended_at": null},
    "same_target_open_count": 2
  }'::jsonb,
  'each card has reason, note, reporter, the reported listing and its author, and the same-target count'
);
select is(
  (public.admin_list_moderation('open_reports') -> 'items' -> 2) - 'report_id' - 'created_at' - 'note' - 'handled_at',
  '{
    "target": "user", "reason": "spam", "status": "open",
    "reporter": {"user_id": "a1000000-0000-4000-8000-000000000001", "display_name": "Ivana Petrović"},
    "listing": {"id": null, "title": null, "status": null},
    "reported_user": {"user_id": "a1000000-0000-4000-8000-000000000005", "display_name": "Nikola Đorđević", "suspended_at": null},
    "same_target_open_count": 1
  }'::jsonb,
  'a user report names the reported user'
);
select is((public.admin_list_moderation('restrictions') ->> 'total')::int, 0, 'nothing is restricted yet');
select throws_ok($$select public.admin_list_moderation('everything')$$, 'P0001', 'validation_failed',
  'an unknown view → validation_failed');
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
set local role authenticated;
select is(public.admin_list_moderation('open_reports') -> 'items', '[]'::jsonb,
  'a non-Operator gets nothing (owner decision)');
select is((public.admin_list_moderation('open_reports') ->> 'open_count')::int, 0, 'not even the count');
reset role;

-- The decisions are service-role only (the action checks is_operator first) ----------------------------
select ok(not has_function_privilege('authenticated', 'public.admin_decide_report(uuid, uuid, text)', 'execute'),
  'authenticated cannot call admin_decide_report');
select ok(not has_function_privilege('authenticated', 'public.admin_restore_listing(uuid)', 'execute'),
  'authenticated cannot call admin_restore_listing');
select ok(not has_function_privilege('authenticated', 'public.admin_restore_user(uuid)', 'execute'),
  'authenticated cannot call admin_restore_user');
select ok(has_function_privilege('service_role', 'public.admin_decide_report(uuid, uuid, text)', 'execute'),
  'the service role can');

select pg_temp.as_service();
set local role service_role;

select throws_ok(
  $$select public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-000000000002', 'hide_listing')$$,
  'P0001', 'validation_failed', 'hide_listing on a user report → validation_failed (report_id invalid)'
);
select throws_ok(
  $$select public.admin_decide_report('a1000000-0000-4000-8000-000000000002', 'f3200000-0000-4000-8000-000000000003', 'dismiss_report')$$,
  'P0001', 'forbidden_role', 'a decision in the name of a non-Operator → forbidden_role'
);
select throws_ok(
  $$select public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-0000000000ff', 'dismiss_report')$$,
  'P0001', 'not_found', 'an unknown report → not_found'
);

-- FR-71 #5 — dismiss ---------------------------------------------------------------------------------------
select is(
  public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-000000000003', 'dismiss_report')
    -> 'item' ->> 'status',
  'dismissed', 'FR-71 #5: a dismissed report is marked dismissed'
);
select is(
  (select handled_by::text from public.reports where id = 'f3200000-0000-4000-8000-000000000003'),
  'a1000000-0000-4000-8000-000000000006', 'handled_by is the Operator'
);
select is((select status::text from public.listings where id = 'f3000000-0000-4000-8000-000000000002'), 'active',
  'nothing else changes');
select throws_ok(
  $$select public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-000000000003', 'dismiss_report')$$,
  'P0001', 'already_decided', 'a decided report → already_decided'
);

-- FR-71 #2 — hide a listing ----------------------------------------------------------------------------------
create temp table hidden as
  select public.admin_decide_report('a1000000-0000-4000-8000-000000000006',
    (select id from public.reports where reporter_id = 'a1000000-0000-4000-8000-000000000002' and listing_id = 'f3000000-0000-4000-8000-000000000004'),
    'hide_listing') as r;
grant select on hidden to service_role;
select is(
  (select r -> 'email' from hidden),
  '{"template": "listing_hidden", "to": "jelena.nikolic@mojljubimac.test", "locale": "sr-Latn", "listing": "Prodajem krevet za psa", "reason": "scam"}'::jsonb,
  'FR-71 #2: the author''s listing_hidden email is due (her address, locale, the title and the report reason)'
);
select is((select status::text from public.listings where id = 'f3000000-0000-4000-8000-000000000004'), 'hidden',
  'the listing is hidden');
select is(
  (select count(*)::int from public.reports where listing_id = 'f3000000-0000-4000-8000-000000000004' and status = 'actioned'),
  2, 'this report and the other open report on the listing are actioned'
);

-- A listing that is no longer active keeps its status; only the report changes, no email.
reset role;
insert into public.reports (id, reporter_id, listing_id, reason, note) values
  ('f3200000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002',
   'f3000000-0000-4000-8000-000000000007', 'other', 'Stari oglas.');
select pg_temp.as_service();
set local role service_role;
select is(
  public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-000000000005', 'hide_listing')
    -> 'email',
  'null'::jsonb, 'hiding a resolved listing sends no email'
);
select is((select status::text from public.listings where id = 'f3000000-0000-4000-8000-000000000007'), 'resolved',
  'and the resolved listing stays resolved');
reset role;

set local role anon;
select ok(
  not (public.list_listings() -> 'items') @> '[{"id": "f3000000-0000-4000-8000-000000000004"}]',
  'the hidden listing disappears from the public list (EP-73)'
);
reset role;
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000004')$$, 'P0001', 'not_found',
  'and from its detail (EP-74)');
reset role;
select pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
set local role authenticated;
select is(public.get_listing('f3000000-0000-4000-8000-000000000004') ->> 'status', 'hidden',
  'its author still sees it as hidden');
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000006');
set local role authenticated;
select is(
  (public.admin_list_moderation('restrictions') -> 'items' -> 0) - 'restricted_at',
  '{"kind": "listing", "listing_id": "f3000000-0000-4000-8000-000000000004", "listing_title": "Prodajem krevet za psa",
    "user_id": "a1000000-0000-4000-8000-000000000003", "user_display_name": "Jelena Nikolić", "reason": "scam"}'::jsonb,
  'the hidden listing is listed under restrictions with the actioned report''s reason (OQ-17)'
);
select is(
  (public.admin_list_moderation('restrictions') -> 'items' -> 0 ->> 'restricted_at')::timestamptz,
  (select max(handled_at) from public.reports where listing_id = 'f3000000-0000-4000-8000-000000000004'),
  'restricted_at is the time of the actioned report'
);
reset role;

-- FR-71 #3 — suspend a user --------------------------------------------------------------------------------
select pg_temp.as_service();
set local role service_role;
select is(
  public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-000000000002', 'suspend_user')
    -> 'email',
  '{"template": "marketplace_suspended", "to": "nikola.djordjevic@mojljubimac.test", "locale": "sr-Latn", "reason": "spam"}'::jsonb,
  'FR-71 #3: a new suspension emails the user'
);
select isnt((select marketplace_suspended_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000005'), null,
  'marketplace_suspended_at is set');
select is((select status::text from public.reports where id = 'f3200000-0000-4000-8000-000000000002'), 'actioned',
  'the report is actioned');
reset role;

insert into public.reports (id, reporter_id, reported_user_id, reason, note) values
  ('f3200000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000003',
   'a1000000-0000-4000-8000-000000000005', 'scam', 'Traži novac unapred.');
select pg_temp.as_service();
set local role service_role;
select is(
  public.admin_decide_report('a1000000-0000-4000-8000-000000000006', 'f3200000-0000-4000-8000-000000000006', 'suspend_user')
    -> 'email',
  'null'::jsonb, 'suspending an already suspended user sends no second email'
);
reset role;

set local role anon;
select ok(
  not (public.list_listings() -> 'items') @> '[{"id": "f3000000-0000-4000-8000-000000000008"}]',
  'the suspended user''s listings are hidden from the public list'
);
reset role;
select is((select status::text from public.listings where id = 'f3000000-0000-4000-8000-000000000008'), 'active',
  'their rows keep their status');

select pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
set local role authenticated;
select throws_ok(
  $$insert into public.listings (type, title, description, category, species, city_id)
    values ('giving', 'Poklanjam činiju', 'Nova činija.', 'equipment_toys', 'dog', (select id from city))$$,
  'P0001', 'marketplace_suspended', 'a suspended user cannot publish'
);
select throws_ok(
  $$update public.listings set title = 'Izmenjeno' where id = 'f3000000-0000-4000-8000-000000000008'$$,
  'P0001', 'marketplace_suspended', 'nor edit'
);
select throws_ok(
  $$update public.listings set expires_at = now() + interval '30 days' where id = 'f3000000-0000-4000-8000-000000000008'$$,
  'P0001', 'marketplace_suspended', 'nor extend'
);
select throws_ok($$select public.send_message('f3000000-0000-4000-8000-000000000003', null, 'Zdravo')$$, 'P0001',
  'marketplace_suspended', 'nor send messages');
select isnt(public.get_me() -> 'marketplace' ->> 'suspended_at', null, 'Me.marketplace.suspended_at shows it (S state)');
reset role;

select pg_temp.as_user('a1000000-0000-4000-8000-000000000006');
set local role authenticated;
select ok(
  (public.admin_list_moderation('restrictions') -> 'items')
    @> '[{"kind": "user", "user_id": "a1000000-0000-4000-8000-000000000005", "user_display_name": "Nikola Đorđević"}]',
  'the suspended user is listed under restrictions'
);
reset role;

-- FR-71 #4 — restore ---------------------------------------------------------------------------------------
select pg_temp.as_service();
set local role service_role;
select is(public.admin_restore_listing('f3000000-0000-4000-8000-000000000004')::text, 'active',
  'FR-71 #4: a hidden listing that has not expired returns as active');
reset role;
set local role anon;
select ok(
  (public.list_listings() -> 'items') @> '[{"id": "f3000000-0000-4000-8000-000000000004"}]',
  'and is public again'
);
reset role;
select pg_temp.as_service();
set local role service_role;
select throws_ok($$select public.admin_restore_listing('f3000000-0000-4000-8000-000000000004')$$, 'P0001',
  'validation_failed', 'restoring a listing that is not hidden → validation_failed (invalid_state)');
select throws_ok($$select public.admin_restore_listing('f3000000-0000-4000-8000-0000000000ff')$$, 'P0001', 'not_found',
  'an unknown listing → not_found');
select is(public.admin_get_restriction('listing', 'f3000000-0000-4000-8000-000000000004'), null,
  'a listing that is not hidden has no restriction');
reset role;

-- Past its expiry → expired.
update public.listings set status = 'hidden', expires_at = now() - interval '1 day'
where id = 'f3000000-0000-4000-8000-000000000005';
select pg_temp.as_service();
set local role service_role;
select is(public.admin_restore_listing('f3000000-0000-4000-8000-000000000005')::text, 'expired',
  'a hidden listing past its expiry returns as expired');
reset role;

-- The BR-55 limit refuses active (Jelena is Free and has 3 active listings) → expired (owner decision).
insert into public.listings (id, author_id, type, title, description, category, species, city_id, status) values
  ('f3000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000003', 'giving', 'Poklanjam igračke',
   'Gumene igračke za pse.', 'equipment_toys', 'dog', (select id from city), 'active'),
  ('f3000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000003', 'giving', 'Poklanjam ćebe',
   'Ćebe za mačke.', 'other', 'cat', (select id from city), 'active'),
  ('f3000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000003', 'giving', 'Poklanjam posudu',
   'Posuda za vodu.', 'equipment_toys', 'cat', (select id from city), 'hidden');
select ok(not public.is_premium('a1000000-0000-4000-8000-000000000003'), 'Jelena is on the Free plan');
select pg_temp.as_service();
set local role service_role;
select is(public.admin_restore_listing('f3000000-0000-4000-8000-00000000000b')::text, 'expired',
  'when the limit trigger refuses active, the listing is restored as expired');
reset role;

select pg_temp.as_service();
set local role service_role;
select is(
  public.admin_restore_user('a1000000-0000-4000-8000-000000000005') - 'restricted_at',
  '{"kind": "user", "listing_id": null, "listing_title": null, "user_id": "a1000000-0000-4000-8000-000000000005",
    "user_display_name": "Nikola Đorđević", "reason": "scam"}'::jsonb,
  'FR-71 #4: restore_user returns the lifted restriction (latest actioned report''s reason)'
);
select is((select marketplace_suspended_at from public.profiles where id = 'a1000000-0000-4000-8000-000000000005'), null,
  'the suspension is cleared');
select throws_ok($$select public.admin_restore_user('a1000000-0000-4000-8000-000000000005')$$, 'P0001',
  'validation_failed', 'restoring a user who is not suspended → validation_failed (invalid_state)');
select throws_ok($$select public.admin_restore_user('a1000000-0000-4000-8000-0000000000ff')$$, 'P0001', 'not_found',
  'an unknown user → not_found');
reset role;
set local role anon;
select ok(
  (public.list_listings() -> 'items') @> '[{"id": "f3000000-0000-4000-8000-000000000008"}]',
  'the user''s listings reappear by their own status'
);
reset role;

-- Counts, and no Operator read path to messages (TC §5.10) ------------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000006');
set local role authenticated;
select is((public.admin_list_moderation('open_reports') ->> 'open_count')::int, 0, 'every report is decided');
select is((public.admin_list_moderation('open_reports') ->> 'handled_this_month')::int, 6,
  'handled_this_month counts the decided reports (Obrađeno ovog meseca)');
select is((select count(*)::int from public.messages), 0, 'the Operator cannot read message bodies');
reset role;

select * from finish();
rollback;
