-- Step 28b — EP-87 listing expiry job (FR-65, BR-56): listings_expiry_notice_candidates,
-- mark_listing_notices_sent and expire_listings (service role only) and the 'listings-daily' pg_cron job.
-- Seeded (supabase/seed.sql): active f3…01 need (Dragana …07), f3…02 (Marko …02), f3…03 (Ivana …01),
-- f3…04 / f3…05 (Jelena …03); f3…06 expired (Marko); f3…07 resolved (Ivana). All seeded active
-- listings expire 3–4 weeks out, so the test moves expires_at as needed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Privileges ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select * from public.listings_expiry_notice_candidates()$$, '42501', null,
  'a Visitor cannot run listings_expiry_notice_candidates');
select throws_ok($$select public.mark_listing_notices_sent(array[]::uuid[])$$, '42501', null,
  'a Visitor cannot run mark_listing_notices_sent');
select throws_ok($$select * from public.expire_listings()$$, '42501', null,
  'a Visitor cannot run expire_listings');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from public.listings_expiry_notice_candidates()$$, '42501', null,
  'a signed-in user (even the Operator) cannot run listings_expiry_notice_candidates');
select throws_ok($$select public.mark_listing_notices_sent(array[]::uuid[])$$, '42501', null,
  'a signed-in user cannot run mark_listing_notices_sent');
select throws_ok($$select * from public.expire_listings()$$, '42501', null,
  'a signed-in user cannot run expire_listings');
reset role;
select set_config('request.jwt.claims', '', true);

-- FR-65 #1 — expiry notices --------------------------------------------------------------------------------
update public.listings set expires_at = now() + interval '2 days' where id = 'f3000000-0000-4000-8000-000000000002';
update public.listings set expires_at = now() + interval '5 days' where id = 'f3000000-0000-4000-8000-000000000003';
-- Authors who get no email: Jelena suspended, Dragana with a pending account deletion.
update public.listings set expires_at = now() + interval '1 day' where id = 'f3000000-0000-4000-8000-000000000004';
update public.listings set expires_at = now() + interval '3 days' - interval '1 minute'
where id = 'f3000000-0000-4000-8000-000000000001';
update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000003';
update public.profiles set deletion_requested_at = now() where id = 'a1000000-0000-4000-8000-000000000007';
-- A resolved listing with an expiry date in the window.
update public.listings set expires_at = now() + interval '1 day' where id = 'f3000000-0000-4000-8000-000000000007';

set local role service_role;
select is(
  (select array_agg(c.listing_id::text order by c.expires_at) from public.listings_expiry_notice_candidates() c),
  array['f3000000-0000-4000-8000-000000000002'],
  'FR-65 #1: only the active listing with ≤ 3 days left of an author who can be emailed is a candidate'
);
select is(
  (select jsonb_build_object('title', c.title, 'author', c.author_id, 'email', c.email, 'locale', c.locale,
     'expires', c.expires_at = now() + interval '2 days')
   from public.listings_expiry_notice_candidates() c),
  '{"title": "Poklanjam grebalicu za mačke", "author": "a1000000-0000-4000-8000-000000000002", "email": "marko.jovanovic@mojljubimac.test", "locale": "sr-Latn", "expires": true}'::jsonb,
  'the candidate carries title, expiry, author, email and locale for the email'
);
select is(
  (select count(*)::int from public.listings_expiry_notice_candidates(1)), 1, 'p_limit caps the batch'
);
select is(
  (select count(*)::int from public.listings l where l.expiry_notice_sent_at is not null), 0,
  'reading the candidates marks nothing (the route marks only after Resend accepted)'
);
select is(
  public.mark_listing_notices_sent(array['f3000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000007', 'f3000000-0000-4000-8000-000000000006']::uuid[]),
  1, 'mark_listing_notices_sent marks only active listings'
);
select is(
  (select array_agg(l.id::text) from public.listings l where l.expiry_notice_sent_at is not null),
  array['f3000000-0000-4000-8000-000000000002'], 'expiry_notice_sent_at is set on that listing only'
);
select is(
  public.mark_listing_notices_sent(array['f3000000-0000-4000-8000-000000000002']::uuid[]), 0,
  'a listing that already has a notice is not marked again'
);
select is(
  (select count(*)::int from public.listings_expiry_notice_candidates()), 0,
  'a re-run finds no candidate: no second notice'
);
reset role;

-- Once the author can be emailed again, the listing becomes a candidate.
update public.profiles set marketplace_suspended_at = null where id = 'a1000000-0000-4000-8000-000000000003';
set local role service_role;
select is(
  (select array_agg(c.listing_id::text order by c.expires_at) from public.listings_expiry_notice_candidates() c),
  array['f3000000-0000-4000-8000-000000000004'],
  'a lifted suspension makes the author''s listing a candidate again'
);
reset role;
update public.profiles set marketplace_suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000003';

-- FR-65 #3 — expire_listings ---------------------------------------------------------------------------------
update public.listings set expires_at = now() - interval '1 hour' where id = 'f3000000-0000-4000-8000-000000000003';
update public.listings set expires_at = now() - interval '30 minutes' where id = 'f3000000-0000-4000-8000-000000000001';
update public.listings set expires_at = now() - interval '1 minute' where id = 'f3000000-0000-4000-8000-000000000004';
update public.listings set expires_at = now() - interval '1 day' where id = 'f3000000-0000-4000-8000-000000000007';

set local role service_role;
create temp table expired_rows as select * from public.expire_listings();
reset role;

select is(
  (select array_agg(e.listing_id::text || ':' || e.notify order by e.expires_at) from expired_rows e),
  array['f3000000-0000-4000-8000-000000000003:true', 'f3000000-0000-4000-8000-000000000001:false',
        'f3000000-0000-4000-8000-000000000004:false'],
  'FR-65 #3: active listings past expires_at expire; suspended / deletion-pending authors get notify = false'
);
select is(
  (select jsonb_build_object('title', e.title, 'email', e.email, 'locale', e.locale)
   from expired_rows e where e.listing_id = 'f3000000-0000-4000-8000-000000000003'),
  '{"title": "Prodajem transporter za psa", "email": "ivana.petrovic@mojljubimac.test", "locale": "sr-Latn"}'::jsonb,
  'the row carries what the listing_expired email needs'
);
select is(
  (select array_agg(l.id::text || ':' || l.status order by l.id) from public.listings l
   where l.id in ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
                  'f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000004',
                  'f3000000-0000-4000-8000-000000000007')),
  array['f3000000-0000-4000-8000-000000000001:expired', 'f3000000-0000-4000-8000-000000000002:active',
        'f3000000-0000-4000-8000-000000000003:expired', 'f3000000-0000-4000-8000-000000000004:expired',
        'f3000000-0000-4000-8000-000000000007:resolved'],
  'statuses: expired ones set, the future and the resolved ones untouched'
);
set local role service_role;
select is((select count(*)::int from public.expire_listings()), 0, 'a re-run expires nothing more');
reset role;

-- The expired listings leave EP-73.
update public.profiles set marketplace_suspended_at = null where id = 'a1000000-0000-4000-8000-000000000003';
set local role anon;
select is(
  (select array_agg(x ->> 'id' order by o)
   from jsonb_array_elements(public.list_listings() -> 'items') with ordinality as t (x, o)),
  array['f3000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000005'],
  'expired listings leave list_listings'
);
select throws_ok($$select public.get_listing('f3000000-0000-4000-8000-000000000003')$$, 'P0001', 'not_found',
  'and are not_found for Visitors');
reset role;

-- Cron schedule ----------------------------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'listings-daily'), 1, 'the listings-daily job exists');
select is((select schedule from cron.job where jobname = 'listings-daily'), '0 7,8 * * *',
  'it runs at 07:00 and 08:00 UTC (09:00 Europe/Belgrade in summer and winter)');
select ok(
  (select command from cron.job where jobname = 'listings-daily') like '%/api/internal/listings-daily%',
  'it calls /api/internal/listings-daily'
);
select ok(
  (select command from cron.job where jobname = 'listings-daily') like '%private.call_internal_route%',
  'through the shared internal-route caller'
);

select * from finish();
rollback;
