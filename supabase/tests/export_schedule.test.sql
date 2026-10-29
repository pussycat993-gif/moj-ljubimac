-- Step 30a — TC §8 / ADR-13: exactly one pg_cron job calls POST /api/internal/exports every 5 minutes through
-- pg_net (private.call_internal_route), which reads dispatch_url / dispatch_secret from Vault; no secret or URL
-- value appears in the job.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select is(
  (select count(*)::int from cron.job where command like '%/api/internal/exports%'),
  1,
  'exactly one pg_cron job calls /api/internal/exports'
);
select is((select jobname from cron.job where command like '%/api/internal/exports%'), 'data-exports', 'the job is named data-exports');
select is((select schedule from cron.job where jobname = 'data-exports'), '*/5 * * * *', 'it runs every 5 minutes');
select ok((select active from cron.job where jobname = 'data-exports'), 'the job is active');
select is(
  (select command from cron.job where jobname = 'data-exports'),
  'select private.call_internal_route(''/api/internal/exports'')',
  'the job only calls private.call_internal_route with the route path'
);
select ok(
  pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%vault.decrypted_secrets%'
  and pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%dispatch_url%'
  and pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%dispatch_secret%'
  and pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%net.http_post%'
  and pg_get_functiondef('private.call_internal_route(text)'::regprocedure) ilike '%X-Dispatch-Secret%',
  'call_internal_route posts through pg_net with the Vault dispatch_url / dispatch_secret'
);
select ok(
  (select command from cron.job where jobname = 'data-exports') !~* '(https?://|secret|bearer|eyJ)',
  'no URL or secret value appears in the job'
);
select ok(
  not has_function_privilege('authenticated', 'private.call_internal_route(text)', 'execute')
  and not has_function_privilege('anon', 'private.call_internal_route(text)', 'execute'),
  'clients cannot call call_internal_route'
);

select * from finish();
rollback;
