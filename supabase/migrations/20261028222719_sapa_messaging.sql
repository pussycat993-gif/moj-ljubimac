-- Step 28a — Šapa pomoći messaging (TC v1.7 §5.10): conversations and messages with their checks,
-- indexes, triggers and RLS (BR-59, BR-60, BR-61; FR-68 data side). The Operator has no access to
-- conversations or messages in v1.

-- conversations (Conversation) --------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The conversation survives deletion of its listing and shows "listing deleted" (FR-64, BR-61).
  listing_id uuid references public.listings (id) on delete set null,
  -- The interested user (EP-82: the caller).
  starter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The listing's author at creation; set by conversations_listing_active.
  owner_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_starter_owner_check check (starter_id <> owner_id),
  -- BR-61: one conversation per listing and interested user.
  unique (listing_id, starter_id)
);

-- EP-80 inbox.
create index conversations_starter_id_last_message_at_idx
  on public.conversations (starter_id, last_message_at desc);
create index conversations_owner_id_last_message_at_idx
  on public.conversations (owner_id, last_message_at desc);

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

-- messages (Message) — never edited, so no updated_at ---------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- FR-68: text only, 1–2000 characters after trimming spaces, tabs and line breaks.
  body text not null
    constraint messages_body_check check (char_length(btrim(body, E' \t\r\n')) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- EP-81 thread, newest last; EP-80 unread counts.
create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index messages_unread_conversation_id_idx on public.messages (conversation_id)
  where read_at is null;

-- Triggers (TC §5.10; errors in the §5.7.1 format) ------------------------------------------------

-- BR-61: a conversation starts only on an active listing, never on one's own; owner_id is the
-- listing's author.
create function public.conversations_listing_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_author uuid;
  listing_status public.listing_status;
begin
  select l.author_id, l.status into listing_author, listing_status
  from public.listings l
  where l.id = new.listing_id;

  if listing_author is null or listing_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'listing_not_active';
  end if;

  new.owner_id := listing_author;
  if new.starter_id = new.owner_id then
    raise exception using errcode = 'P0001', message = 'cannot_message_self';
  end if;
  return new;
end;
$$;

create trigger conversations_listing_active
before insert on public.conversations
for each row execute function public.conversations_listing_active();

-- The sender must be one of the conversation's two parties (TC §5.10, EP-82 → not_found).
create function public.messages_sender_is_party()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and new.sender_id in (c.starter_id, c.owner_id)
  ) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  return new;
end;
$$;

create trigger messages_sender_is_party
before insert on public.messages
for each row execute function public.messages_sender_is_party();

-- BR-59: the other party has blocked the sender → user_blocked (nothing is stored). Security definer:
-- user_blocks rows are visible only to the blocker (owner decision for Step 28a).
create function public.messages_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  select case when c.starter_id = new.sender_id then c.owner_id else c.starter_id end
  into other
  from conversations c
  where c.id = new.conversation_id;

  if exists (
    select 1 from user_blocks b where b.blocker_id = other and b.blocked_id = new.sender_id
  ) then
    raise exception using errcode = 'P0001', message = 'user_blocked';
  end if;
  return new;
end;
$$;

-- user_blocks is created in sapa_safety; PL/pgSQL resolves the table when the trigger runs.
create trigger messages_not_blocked
before insert on public.messages
for each row execute function public.messages_not_blocked();

-- BR-60: a suspended sender cannot send (function from sapa_listings).
create trigger marketplace_not_suspended
before insert on public.messages
for each row execute function public.marketplace_not_suspended();

-- last_message_at follows the newest message (EP-80 order).
create function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end;
$$;

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.messages_touch_conversation();

revoke execute on function public.conversations_listing_active() from public, anon, authenticated;
revoke execute on function public.messages_sender_is_party() from public, anon, authenticated;
revoke execute on function public.messages_not_blocked() from public, anon, authenticated;
revoke execute on function public.messages_touch_conversation() from public, anon, authenticated;

-- RLS ---------------------------------------------------------------------------------------------
-- Only the two parties read a conversation and its messages; a party sends as themselves; only the
-- recipient sets read_at (EP-83). No Operator access.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select on table public.conversations to authenticated;
grant insert (listing_id) on table public.conversations to authenticated;

create policy conversations_select_party on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (starter_id, owner_id));

create policy conversations_insert_starter on public.conversations
  for insert to authenticated
  with check (starter_id = (select auth.uid()));

grant select on table public.messages to authenticated;
grant insert (conversation_id, body) on table public.messages to authenticated;
grant update (read_at) on table public.messages to authenticated;

create policy messages_select_party on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));

create policy messages_insert_sender on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  );

create policy messages_update_recipient on public.messages
  for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  )
  with check (
    sender_id <> (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  );
