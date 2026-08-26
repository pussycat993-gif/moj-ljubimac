-- Moj Ljubimac — zakrpa za brisanje naloga (Faza 3.5)
--
-- KADA OVO TREBA: samo ako si `supabase/schema.sql` VEĆ pokrenula u starijoj
-- verziji, gde je households.created_by imao "on delete cascade".
-- Ako pravis novi projekat i pokreneš aktuelni schema.sql — preskoči ovaj fajl,
-- tamo je već ispravljeno.
--
-- ŠTA MENJA: brisanjem naloga tvorca household-a više se NE briše ceo
-- porodični karton. Household preživi, a vlasništvo prelazi na preostalog
-- člana (to radi Edge Function `delete-account`).

-- created_by sme da bude prazan (kad tvorac obriše nalog, a porodica ostane).
alter table public.households
  alter column created_by drop not null;

-- Zameni kaskadu sa "set null".
alter table public.households
  drop constraint if exists households_created_by_fkey;

alter table public.households
  add constraint households_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- Provera: očekuje se delete_rule = 'SET NULL'
-- select rc.delete_rule
-- from information_schema.referential_constraints rc
-- where rc.constraint_name = 'households_created_by_fkey';
