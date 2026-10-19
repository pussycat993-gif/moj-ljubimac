-- BR-48: every new profile gets six reminder_preferences rows with the stated defaults;
-- BR-13 doses and meals stored at the exact time; EP-28 channel rules (premium_required,
-- whatsapp_not_connected, channel_disabled).
-- Seeded: Ivana (…01, Premium), Marko (…02, Free).
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values ('da000000-0000-4000-8000-000000000001', 'novi@mojljubimac.test');
insert into public.profiles (id, account_type, email, terms_accepted_at, terms_version)
values ('da000000-0000-4000-8000-000000000001', 'owner', 'novi@mojljubimac.test', now(), 'seed');

select is(
  (select count(*)::int from public.reminder_preferences where user_id = 'da000000-0000-4000-8000-000000000001'),
  6, 'a new profile gets six preference rows (BR-48)'
);
select results_eq(
  $$select type::text, lead_minutes, delivery_time, channels::text[]
    from public.reminder_preferences
    where user_id = 'da000000-0000-4000-8000-000000000001'
    order by public.reminder_preferences.type$$,
  $$values
    ('vaccination', '{10080,0}'::integer[], '09:00'::time, '{email,push}'::text[]),
    ('treatment_dose', '{0}'::integer[], null::time, '{email,push}'::text[]),
    ('vet_follow_up', '{1440,0}'::integer[], '09:00'::time, '{email,push}'::text[]),
    ('meal', '{0}'::integer[], null::time, '{email,push}'::text[]),
    ('birthday', '{0}'::integer[], '09:00'::time, '{email,push}'::text[]),
    ('manual', '{0}'::integer[], '09:00'::time, '{email,push}'::text[])$$,
  'vaccinations 7 days + on the day at 09:00; follow-ups 1 day + on the day at 09:00; birthdays and manual on the day at 09:00; doses and meals exact; email + push (BR-48)'
);
select is(
  (select count(*)::int from public.profiles p
   where (select count(*) from public.reminder_preferences r where r.user_id = p.id) <> 6),
  0, 'every seeded profile has its six rows'
);
select is(
  (select count(*)::int from public.reminder_preferences where user_id = 'a1000000-0000-4000-8000-000000000004'),
  6, 'shelter accounts get the defaults too'
);

-- BR-13: doses and meals keep lead 0 and no delivery time --------------------------------------
update public.reminder_preferences set lead_minutes = '{1440,0}', delivery_time = '07:00'
where user_id = 'da000000-0000-4000-8000-000000000001' and type in ('treatment_dose', 'meal');
select is(
  (select count(*)::int from public.reminder_preferences
   where user_id = 'da000000-0000-4000-8000-000000000001' and type in ('treatment_dose', 'meal')
     and lead_minutes = '{0}' and delivery_time is null),
  2, 'doses and meals are always stored at their exact time (BR-13)'
);
select throws_ok(
  $$update public.reminder_preferences set lead_minutes = '{60}'
    where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination'$$,
  '23514', null, 'lead times come from the EP-28 value set'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{}'
    where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination'$$,
  '23514', null, 'at least one channel'
);
select throws_ok(
  $$update public.reminder_preferences set delivery_time = null
    where user_id = 'da000000-0000-4000-8000-000000000001' and type = 'vaccination'$$,
  '23514', null, 'lead-time types need a delivery time'
);

-- EP-28 as Marko (Free) -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update public.reminder_preferences set lead_minutes = '{4320,0}', delivery_time = '20:00', channels = '{push}'
    where type = 'vaccination'$$,
  'a user updates own preferences (EP-28)'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'vaccination'$$,
  'P0001', 'premium_required:whatsapp', 'WhatsApp needs Premium (BR-14)'
);
select throws_ok(
  $$update public.reminder_preferences set channels = '{viber}' where type = 'vaccination'$$,
  'P0001', 'channel_disabled', 'Viber is refused while switched off (BR-14b)'
);
select is(
  (select count(*)::int from public.reminder_preferences),
  6, 'a user sees only own preferences'
);

-- As Ivana (Premium, no WhatsApp number) ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'vaccination'$$,
  'P0001', 'whatsapp_not_connected', 'WhatsApp needs a connected number'
);
reset role;
insert into public.user_channels (user_id, channel, address, opted_in_at)
values ('a1000000-0000-4000-8000-000000000001', 'whatsapp', '+381641234567', now());
set local role authenticated;
select lives_ok(
  $$update public.reminder_preferences set channels = '{email,whatsapp}' where type = 'vaccination'$$,
  'a Premium user with a connected number chooses WhatsApp'
);
reset role;
update public.app_settings set viber_enabled = true;
set local role authenticated;
select throws_ok(
  $$update public.reminder_preferences set channels = '{viber}' where type = 'vaccination'$$,
  'P0001', 'whatsapp_not_connected:viber', 'Viber, when on, needs a connected Viber identity'
);
select throws_ok(
  $$update public.reminder_preferences set user_id = 'a1000000-0000-4000-8000-000000000002' where type = 'manual'$$,
  '42501', null, 'user_id is not client-writable'
);

select * from finish();
rollback;
