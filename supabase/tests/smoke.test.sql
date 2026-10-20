-- CI pgTAP gate (Step 03): the local database answers and pgTAP loads.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select ok(true, 'pgTAP is available');
select is((select 1), 1, 'the local database answers a query');
select has_schema('public', 'the public schema exists');

select * from finish();
rollback;
