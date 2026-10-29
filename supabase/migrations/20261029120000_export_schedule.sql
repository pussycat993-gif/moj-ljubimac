-- Step 30a — data export archives (FR-41; TC ADR-13 Mechanics, §8; API EP-50): the pg_cron schedule that calls
-- POST /api/internal/exports every 5 minutes. Same pg_cron → pg_net → Vault mechanism as the reminder dispatch
-- (Step 19): private.call_internal_route reads the URL and the secret from the Vault secrets dispatch_url and
-- dispatch_secret at run time and does nothing while either is unset, so no URL or secret value lives here.
-- No table, column, enum or constraint changes; the route reads and updates data_exports with the service role.

select cron.schedule(
  'data-exports',
  '*/5 * * * *',
  $$select private.call_internal_route('/api/internal/exports')$$
);
