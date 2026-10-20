-- rpc:record_partner_click (EP-66): FR-58 every quick action is counted per partner;
-- BR-44 "Send message" needs a channel and number; actions without data are refused;
-- hidden or unknown partners → not_found.
-- Seeded in Novi Sad: „Dr Vet“ (e1…01: phone, WhatsApp number, email, website),
-- „Čupko“ (e1…03: no website), „Kod Mace“ (e1…04, paid_until passed).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Setup (as postgres) -------------------------------------------------------------------------
insert into public.partners (id, type, name, address, city_id, phone, message_channel, message_number, paid_until)
select v.id, 'pet_shop', v.name, 'Adresa, Novi Sad', c.id, '+381 21 1', v.channel::public.partner_message_channel,
       v.number, date '2027-12-31'
from (values
  ('fe000000-0000-4000-8000-000000000001'::uuid, 'Bez kanala', 'none', '+381 64 000 0000'),
  ('fe000000-0000-4000-8000-000000000002'::uuid, 'Bez broja', 'viber', null),
  ('fe000000-0000-4000-8000-000000000003'::uuid, 'SMS', 'sms', '+381 64 111 1111')
) as v (id, name, channel, number)
join public.cities c on c.name_sr = 'Novi Sad';

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- FR-58: each action is recorded ----------------------------------------------------------------
select lives_ok($$select public.record_partner_click('e1000000-0000-4000-8000-000000000001', 'call')$$, 'Call is recorded');
select lives_ok($$select public.record_partner_click('e1000000-0000-4000-8000-000000000001', 'message')$$, 'Send message is recorded');
select lives_ok($$select public.record_partner_click('e1000000-0000-4000-8000-000000000001', 'email')$$, 'Send email is recorded');
select lives_ok($$select public.record_partner_click('e1000000-0000-4000-8000-000000000001', 'website')$$, 'Visit website is recorded');
select lives_ok($$select public.record_partner_click('e1000000-0000-4000-8000-000000000001', 'call')$$, 'a repeated use is recorded again');
select lives_ok($$select public.record_partner_click('fe000000-0000-4000-8000-000000000003', 'message')$$,
  'BR-44: Send message works with the SMS channel and number');
select function_returns('public', 'record_partner_click', array['uuid', 'partner_click_action'], 'void',
  'the RPC returns nothing (204)');
select lives_ok($$select public.record_partner_click('e1000000-0000-4000-8000-000000000003', 'call')$$,
  'Call on a partner without a website is recorded');

-- BR-44 and actions without data ----------------------------------------------------------------
select throws_ok(
  $$select public.record_partner_click('fe000000-0000-4000-8000-000000000001', 'message')$$,
  'P0001', 'validation_failed', 'BR-44: Send message without a messaging channel is refused'
);
select throws_ok(
  $$select public.record_partner_click('fe000000-0000-4000-8000-000000000002', 'message')$$,
  'P0001', 'validation_failed', 'BR-44: Send message without a message number is refused'
);
select throws_ok(
  $$select public.record_partner_click('fe000000-0000-4000-8000-000000000001', 'email')$$,
  'P0001', 'validation_failed', 'Send email without an email is refused'
);
select throws_ok(
  $$select public.record_partner_click('e1000000-0000-4000-8000-000000000003', 'website')$$,
  'P0001', 'validation_failed', 'Visit website without a website is refused'
);

-- Hidden or unknown partner ---------------------------------------------------------------------
select throws_ok(
  $$select public.record_partner_click('e1000000-0000-4000-8000-000000000004', 'call')$$,
  'P0001', 'not_found', 'a partner whose paid_until has passed → not_found'
);
select throws_ok(
  $$select public.record_partner_click('fe000000-0000-4000-8000-0000000000ff', 'call')$$,
  'P0001', 'not_found', 'an unknown partner → not_found'
);
select throws_ok(
  $$select 1 from public.partner_clicks$$, '42501', null, 'clients cannot read partner_clicks directly'
);
reset role;

-- What was stored (as postgres) -----------------------------------------------------------------
select is(
  (select count(*)::int from public.partner_clicks where partner_id = 'e1000000-0000-4000-8000-000000000001'),
  5, 'FR-58: every use is counted per partner'
);
select results_eq(
  $$select action::text, count(*)::int from public.partner_clicks
    where partner_id = 'e1000000-0000-4000-8000-000000000001' group by action order by action$$,
  $$values ('call', 2), ('email', 1), ('message', 1), ('website', 1)$$,
  'FR-58: counted per action'
);
select ok(
  (select bool_and(user_id = 'a1000000-0000-4000-8000-000000000001') from public.partner_clicks),
  'FR-58: each click records the user'
);
select ok(
  (select bool_and(clicked_at = now()) from public.partner_clicks), 'FR-58: each click records the time'
);
select is(
  (select count(*)::int from public.partner_clicks
   where partner_id in ('fe000000-0000-4000-8000-000000000001', 'fe000000-0000-4000-8000-000000000002',
                        'e1000000-0000-4000-8000-000000000004')),
  0, 'refused actions record nothing'
);

delete from public.profiles where id = 'a1000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.partner_clicks where user_id is null), 7,
  'a deleted user''s clicks stay counted without the user'
);

-- Visitor -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select public.record_partner_click('e1000000-0000-4000-8000-000000000001', 'call')$$,
  '42501', null, 'anon may not call record_partner_click (401)'
);
reset role;

select * from finish();
rollback;
