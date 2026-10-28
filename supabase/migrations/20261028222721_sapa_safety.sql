-- Step 28a — Šapa pomoći safety (TC v1.7 §5.10): user_blocks and reports with their checks,
-- indexes, triggers and RLS (BR-59; FR-70 data side). Moderation functions come with Step 28c.

-- user_blocks (User Block) — no updated_at ---------------------------------------------------------
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self_check check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

-- messages_not_blocked lookup.
create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

-- reports (Report) --------------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  -- Not null at creation (trigger below); cleared when the reporter's account is deleted.
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  -- Set to the author when a listing is reported.
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason public.report_reason not null,
  note text constraint reports_note_check check (char_length(note) <= 500),
  status public.report_status not null default 'open',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- FR-70: a note is required for reason "other".
  constraint reports_note_required_check check (reason <> 'other' or coalesce(char_length(btrim(note)), 0) >= 1)
);

-- FR-70: one open report per reporter and target.
create unique index reports_open_listing_key on public.reports (reporter_id, listing_id)
  where status = 'open' and listing_id is not null;
create unique index reports_open_user_key on public.reports (reporter_id, reported_user_id)
  where status = 'open' and listing_id is null;
-- EP-86 moderation queue, oldest first.
create index reports_status_created_at_idx on public.reports (status, created_at);

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

-- At creation: reporter_id is not null and the report names a listing or a user; a listing report
-- names the listing's author as the reported user.
create function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.reporter_id := coalesce(new.reporter_id, (select auth.uid()));
  if new.reporter_id is null or (new.listing_id is null and new.reported_user_id is null) then
    raise exception using errcode = 'P0001', message = 'validation_failed';
  end if;

  if new.listing_id is not null then
    new.reported_user_id := coalesce(
      (select l.author_id from public.listings l where l.id = new.listing_id),
      new.reported_user_id
    );
  end if;
  return new;
end;
$$;

create trigger reports_before_insert
before insert on public.reports
for each row execute function public.reports_before_insert();

revoke execute on function public.reports_before_insert() from public, anon, authenticated;

-- RLS ---------------------------------------------------------------------------------------------
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

revoke all on table public.user_blocks from anon, authenticated;
revoke all on table public.reports from anon, authenticated;

-- user_blocks: the blocker selects, inserts and deletes their own rows; the blocked user sees nothing.
grant select, delete on table public.user_blocks to authenticated;
grant insert (blocked_id) on table public.user_blocks to authenticated;

create policy user_blocks_select_own on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- reports: any signed-in user reports as themselves and reads their own; the Operator reads and
-- handles all.
grant select on table public.reports to authenticated;
grant insert (listing_id, reported_user_id, reason, note) on table public.reports to authenticated;
grant update (status, handled_by, handled_at) on table public.reports to authenticated;

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy reports_select_operator on public.reports
  for select to authenticated
  using (private.is_operator());

create policy reports_update_operator on public.reports
  for update to authenticated
  using (private.is_operator())
  with check (private.is_operator());
