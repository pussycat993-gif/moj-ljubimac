-- Organisation RLS (API §4.4, EP-53, EP-56, EP-68, EP-72): BR-34.
-- Seeded: shelter b2…01 (Milica …04, admin, pending), breeder b2…02 (Nikola …05, admin).
-- Marko (…02) joins the breeder as a volunteer; Ana (…06) is unrelated.
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- Setup (as postgres)
insert into public.organisation_memberships (organisation_id, user_id, role)
values ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'volunteer');
insert into public.organisation_invitations (id, organisation_id, email, role, token_hash, status) values
  ('d2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002',
   'pozvan@mojljubimac.test', 'volunteer', 'hash-orgrls-pending', 'pending'),
  ('d2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002',
   'prihvatio@mojljubimac.test', 'volunteer', 'hash-orgrls-accepted', 'accepted'),
  ('d2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001',
   'azil@mojljubimac.test', 'volunteer', 'hash-orgrls-shelter', 'pending');

-- Admin (Nikola, breeder) -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.organisations), 1, 'an admin reads only their organisation');
select is((select id from public.organisations), 'b2000000-0000-4000-8000-000000000002'::uuid,
  'it is their own organisation');
select is((select count(*)::int from public.organisation_memberships), 2, 'an admin reads their team');
select is((select count(*)::int from public.organisation_invitations), 2,
  'an admin reads all of their organisation''s invitations, pending included');
select lives_ok(
  $$update public.organisations
    set description = 'Opis', phone = '+381 11 123 4567', email = 'info@odgajivacnica.test',
        website = 'https://odgajivacnica.test', logo_r2_key = 'o/b2000000-0000-4000-8000-000000000002/logo-1.png'
    where id = 'b2000000-0000-4000-8000-000000000002'$$,
  'an admin updates the EP-72 public-profile columns'
);
select throws_ok(
  $$update public.organisations set approval_status = 'approved'$$,
  '42501', null, 'approval_status has no client write path'
);
select throws_ok(
  $$update public.organisations set rejection_reason = 'x'$$,
  '42501', null, 'rejection_reason has no client write path'
);
select throws_ok(
  $$update public.organisations set name = 'Drugo ime'$$,
  '42501', null, 'columns outside EP-72 are not writable'
);
select throws_ok(
  $$insert into public.organisations (type, name, slug) values ('breeder', 'Nova', 'nova')$$,
  '42501', null, 'organisations have no client insert'
);
select throws_ok(
  $$delete from public.organisations$$,
  '42501', null, 'organisations have no client delete'
);
select lives_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'volunteer')$$,
  'an admin adds a team member'
);
select lives_ok(
  $$update public.organisation_memberships set role = 'admin'
    where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'an admin changes a role'
);
select lives_ok(
  $$delete from public.organisation_memberships where user_id = 'a1000000-0000-4000-8000-000000000003'$$,
  'an admin removes a team member'
);
select lives_ok(
  $$insert into public.organisation_invitations (organisation_id, email, role, token_hash)
    values ('b2000000-0000-4000-8000-000000000002', 'nov@mojljubimac.test', 'admin', 'hash-orgrls-new')$$,
  'an admin invites'
);
select lives_ok(
  $$update public.organisation_invitations set status = 'expired' where token_hash = 'hash-orgrls-new'$$,
  'an admin expires an earlier invitation'
);
select lives_ok(
  $$delete from public.organisation_invitations where id = 'd2000000-0000-4000-8000-000000000001'$$,
  'an admin revokes a pending invitation'
);
select throws_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'admin')$$,
  '42501', null, 'an admin cannot add themselves to another organisation'
);
update public.organisations set description = 'Tuđe' where id = 'b2000000-0000-4000-8000-000000000001';
delete from public.organisation_invitations where organisation_id = 'b2000000-0000-4000-8000-000000000001';

reset role;
select is(
  (select description from public.organisations where id = 'b2000000-0000-4000-8000-000000000002'),
  'Opis', 'the profile change is stored'
);
select is(
  (select description from public.organisations where id = 'b2000000-0000-4000-8000-000000000001'),
  null, 'another organisation cannot be updated'
);
select is(
  (select count(*)::int from public.organisation_invitations where organisation_id = 'b2000000-0000-4000-8000-000000000001'),
  1, 'another organisation''s invitations cannot be deleted'
);

-- Volunteer (Marko, breeder) ----------------------------------------------------------------------------
insert into public.organisation_invitations (id, organisation_id, email, role, token_hash) values
  ('d2000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000002',
   'jos@mojljubimac.test', 'volunteer', 'hash-orgrls-pending-2');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.organisations), 1, 'a volunteer reads their organisation');
select is((select count(*)::int from public.organisation_memberships), 2, 'a volunteer reads their team');
select is(
  (select count(*)::int from public.organisation_invitations where status = 'pending'),
  0, 'a volunteer does not see pending invitations (EP-53)'
);
select throws_ok(
  $$update public.organisations set description = 'Volonter'$$,
  'P0001', 'forbidden_role', 'a volunteer cannot update the public profile (EP-72)'
);
select throws_ok(
  $$insert into public.organisation_memberships (organisation_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'volunteer')$$,
  'P0001', 'forbidden_role', 'a volunteer cannot add a team member (BR-34)'
);
select throws_ok(
  $$update public.organisation_memberships set role = 'admin'
    where user_id = 'a1000000-0000-4000-8000-000000000002'$$,
  'P0001', 'forbidden_role', 'a volunteer cannot change a role (BR-34)'
);
select throws_ok(
  $$delete from public.organisation_memberships where user_id = 'a1000000-0000-4000-8000-000000000005'$$,
  'P0001', 'forbidden_role', 'a volunteer cannot remove a team member (BR-34)'
);
select throws_ok(
  $$insert into public.organisation_invitations (organisation_id, email, role, token_hash)
    values ('b2000000-0000-4000-8000-000000000002', 'v@mojljubimac.test', 'volunteer', 'hash-orgrls-vol')$$,
  'P0001', 'forbidden_role', 'a volunteer cannot invite (BR-34)'
);
select throws_ok(
  $$update public.organisation_invitations set status = 'expired'$$,
  'P0001', 'forbidden_role', 'a volunteer cannot change an invitation'
);
delete from public.organisation_invitations where id = 'd2000000-0000-4000-8000-000000000004';

reset role;
select is(
  (select status::text from public.organisation_invitations where id = 'd2000000-0000-4000-8000-000000000004'),
  'pending', 'a volunteer cannot revoke a pending invitation they cannot see'
);

-- Pending shelter admin (Milica): approval columns are not writable ---------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select approval_status::text from public.organisations),
  'pending', 'a pending shelter''s admin reads the pending status'
);
select throws_ok(
  $$update public.organisations set approval_status = 'approved'$$,
  '42501', null, 'a pending shelter cannot approve itself'
);
select is(
  (select count(*)::int from public.organisation_memberships), 1,
  'the shelter admin sees only their own team'
);

-- Unrelated user (Ana) sees nothing -----------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.organisations), 0, 'an unrelated user sees no organisation');
select is((select count(*)::int from public.organisation_memberships), 0, 'an unrelated user sees no team');
select is((select count(*)::int from public.organisation_invitations), 0, 'an unrelated user sees no invitations');
select throws_ok(
  $$insert into public.organisation_invitations (organisation_id, email, role, token_hash)
    values ('b2000000-0000-4000-8000-000000000002', 'a@mojljubimac.test', 'admin', 'hash-orgrls-stranger')$$,
  '42501', null, 'an unrelated user cannot invite'
);

reset role;
set local role anon;
select throws_ok($$select * from public.organisations$$, '42501', null, 'anon cannot read organisations');
select throws_ok($$select * from public.organisation_memberships$$, '42501', null, 'anon cannot read memberships');
reset role;

select * from finish();
rollback;
