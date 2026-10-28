-- Step 28b — rpc:get_me (EP-43) gains display_name and marketplace (API §6 MarketplaceStatus):
-- can_post_need / need_organisation (FR-63 #2, BR-54), active_listings / active_listing_limit (FR-63 #6,
-- #7, BR-55, OQ-16 default), unread_conversations and suspended_at (BR-60).
-- Seeded (supabase/seed.sql): Ivana (…01, Premium; active f3…03), Marko (…02, Free; active f3…02,
-- expired f3…06), Milica (…04, Admin of the pending shelter b2…01), Nikola (…05, Admin of the breeder
-- b2…02), Dragana (…07, shelter account, Admin of the approved shelter b2…03; need f3…01).
-- Conversation f3100000…01 (Ivana → Marko on f3…02) has one unread message from Marko.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

create temp table me (who text primary key, j jsonb);
grant select, insert on me to authenticated;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into me values ('ivana', public.get_me());
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into me values ('marko', public.get_me());
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
insert into me values ('milica', public.get_me());
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
insert into me values ('dragana', public.get_me());
reset role;

-- FR-63 #2 — need permission -----------------------------------------------------------------------------
select is(
  (select jsonb_build_object('can', j -> 'marketplace' -> 'can_post_need', 'org', j -> 'marketplace' -> 'need_organisation')
   from me where who = 'dragana'),
  '{"can": true, "org": {"id": "b2000000-0000-4000-8000-000000000003", "name": "Azil „Druga šansa“"}}'::jsonb,
  'FR-63 #2: Dragana (approved shelter) can post needs for „Druga šansa“'
);
select is(
  (select jsonb_build_object('can', j -> 'marketplace' -> 'can_post_need', 'org', j -> 'marketplace' -> 'need_organisation')
   from me where who = 'marko'),
  '{"can": false, "org": null}'::jsonb, 'Marko (owner) cannot'
);
select is(
  (select jsonb_build_object('can', j -> 'marketplace' -> 'can_post_need', 'org', j -> 'marketplace' -> 'need_organisation')
   from me where who = 'milica'),
  '{"can": false, "org": null}'::jsonb, 'Milica (pending shelter) cannot'
);

-- FR-63 #6 / #7 — the active-listing limit ---------------------------------------------------------------
select is(
  (select jsonb_build_object('limit', j -> 'marketplace' -> 'active_listing_limit', 'active', j -> 'marketplace' -> 'active_listings')
   from me where who = 'marko'),
  '{"limit": 3, "active": 1}'::jsonb,
  'FR-63 #6: Free Marko — limit 3, one active listing (the expired one not counted)'
);
select is((select j -> 'marketplace' -> 'active_listing_limit' from me where who = 'ivana'), 'null'::jsonb,
  'FR-63 #7: Premium Ivana has no limit');
select is(
  (select jsonb_build_object('limit', j -> 'marketplace' -> 'active_listing_limit', 'active', j -> 'marketplace' -> 'active_listings')
   from me where who = 'dragana'),
  '{"limit": null, "active": 0}'::jsonb,
  'a shelter account has no limit, and needs do not count as active listings'
);

-- Two more listings bring Marko to the limit.
insert into public.listings (author_id, type, title, description, category, species, city_id)
select 'a1000000-0000-4000-8000-000000000002', x.type::public.listing_type, x.title, 'Opis.', 'equipment_toys', 'dog', c.id
from (values ('giving', 'Poklanjam činiju'), ('seeking', 'Tražim povodnik')) as x (type, title)
cross join public.cities c where c.name_sr = 'Bečej';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_me() -> 'marketplace' -> 'active_listings', '3'::jsonb, 'active_listings follows new listings');
reset role;

-- OQ-16 default: a breeder plan does not lift the limit.
insert into public.subscriptions (user_id, plan, status, current_period_end)
values ('a1000000-0000-4000-8000-000000000005', 'breeder_monthly', 'active', now() + interval '1 month');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select jsonb_build_object('plan', j -> 'entitlements' ->> 'plan', 'limit', j -> 'marketplace' -> 'active_listing_limit',
     'can', j -> 'marketplace' -> 'can_post_need')
   from (select public.get_me() as j) x),
  '{"plan": "breeder", "limit": 3, "can": false}'::jsonb,
  'OQ-16: Nikola with an active breeder plan still has the limit 3 (and cannot post needs)'
);
reset role;

-- Unread conversations ------------------------------------------------------------------------------------
select is((select j -> 'marketplace' -> 'unread_conversations' from me where who = 'ivana'), '1'::jsonb,
  'Ivana has one conversation with an unread message from Marko');
select is((select j -> 'marketplace' -> 'unread_conversations' from me where who = 'marko'), '0'::jsonb,
  'Marko has read everything (his own message does not count)');
select is((select j -> 'marketplace' -> 'unread_conversations' from me where who = 'dragana'), '0'::jsonb,
  'Dragana has no conversations');

update public.messages set read_at = now()
where conversation_id = 'f3100000-0000-4000-8000-000000000001' and read_at is null;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.get_me() -> 'marketplace' -> 'unread_conversations', '0'::jsonb,
  'once read, the badge clears');
reset role;

-- Suspension and display name --------------------------------------------------------------------------------
select is((select j -> 'marketplace' -> 'suspended_at' from me where who = 'marko'), 'null'::jsonb,
  'suspended_at is null for a user in good standing');
update public.profiles set marketplace_suspended_at = now() - interval '1 hour', display_name = 'Marko iz Bečeja'
where id = 'a1000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
create temp table me_suspended as select public.get_me() as j;
reset role;
select is((select (j -> 'marketplace' ->> 'suspended_at')::timestamptz from me_suspended), now() - interval '1 hour',
  'suspended_at reflects profiles.marketplace_suspended_at');
select is((select j ->> 'display_name' from me_suspended), 'Marko iz Bečeja', 'display_name is returned when set');
select ok((select j ? 'display_name' and j -> 'display_name' = 'null'::jsonb from me where who = 'ivana'),
  'display_name is present (null) when not set');
select is((select j ->> 'full_name' from me_suspended), 'Marko Jovanović', 'full_name is unchanged');

select is(
  (select array_agg(k order by k) from me, jsonb_object_keys(j -> 'marketplace') k where who = 'ivana'),
  array['active_listing_limit', 'active_listings', 'can_post_need', 'need_organisation', 'suspended_at',
        'unread_conversations'],
  'MarketplaceStatus has exactly the API §6 fields'
);

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select public.get_me()$$, '42501', null, 'Visitors cannot call get_me');
reset role;

select * from finish();
rollback;
