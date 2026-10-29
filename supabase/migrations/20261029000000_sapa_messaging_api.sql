-- Step 28c — Šapa pomoći messaging, safety and moderation API (API v1.3 §5.9): rpc:list_my_conversations
-- (EP-80), rpc:get_conversation (EP-81), rpc:send_message (EP-82, one transaction — the action adds the
-- rate limit, idempotency and the notification), rpc:mark_conversation_read (EP-83), rpc:block_user /
-- rpc:unblock_user (EP-85), rpc:admin_list_moderation (EP-86 list) and the service-role functions the
-- EP-86 `moderate` action calls so every decision is atomic. rpc:get_reminder_settings (EP-28) is replaced
-- to return the seventh `message` row (owner decision carried from Step 28a). No table, column, enum or
-- constraint changes: the EP-28 message-row validation is Step 28a's reminder_preferences checks.
-- OQ-17 (open): the Operator's note is not stored; restrictions take their time and reason from the
-- actioned report. The Operator has no read path to message bodies (TC §5.10).

-- Helpers -----------------------------------------------------------------------------------------

-- Display-name rule (API §5.9): coalesce(display_name, full_name); null when both are null.
create function private.person_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.display_name, p.full_name) from public.profiles p where p.id = p_user;
$$;

-- API §6 ConversationSummary for the caller (auth.uid()); null when the caller is not a party.
create function private.conversation_summary_json(p_conversation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.conversations;
  l public.listings;
  v_other uuid;
  v_shelter boolean;
  v_name text;
  v_slug text;
  v_last public.messages;
begin
  select * into c from public.conversations x where x.id = p_conversation;
  if not found or me is null or me not in (c.starter_id, c.owner_id) then
    return null;
  end if;

  if c.listing_id is not null then
    select * into l from public.listings x where x.id = c.listing_id;
  end if;

  v_other := case when c.starter_id = me then c.owner_id else c.starter_id end;
  v_shelter := v_other = c.owner_id and l.organisation_id is not null;
  if v_shelter then
    select o.name, o.slug into v_name, v_slug from public.organisations o where o.id = l.organisation_id;
  else
    v_name := private.person_name(v_other);
  end if;

  select * into v_last
  from public.messages m
  where m.conversation_id = c.id
  order by m.created_at desc, m.id desc
  limit 1;

  return jsonb_build_object(
    'id', c.id,
    'listing', jsonb_build_object(
      'id', c.listing_id,
      'title', l.title,
      'type', l.type,
      'active', l.id is not null and l.status = 'active' and public.marketplace_author_ok(l.author_id),
      'deleted', c.listing_id is null
    ),
    'i_am_author', c.owner_id = me,
    'other', jsonb_build_object(
      'user_id', v_other,
      'kind', case when v_shelter then 'shelter' else 'user' end,
      'display_name', v_name,
      'initials', case when v_name is null then null else private.name_initials(v_name) end,
      'organisation_slug', case when v_shelter then v_slug end
    ),
    'last_message', jsonb_build_object(
      'preview', coalesce(left(v_last.body, 120), ''),
      'from_me', coalesce(v_last.sender_id = me, false)
    ),
    'last_message_at', c.last_message_at,
    'unread_count', (
      select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.sender_id <> me and m.read_at is null
    ),
    'i_blocked_other', exists (
      select 1 from public.user_blocks b where b.blocker_id = me and b.blocked_id = v_other
    )
  );
end;
$$;

-- API §6 Message for the caller.
create function private.message_json(m public.messages)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', m.sender_id,
    'from_me', m.sender_id = (select auth.uid()),
    'body', m.body,
    'created_at', m.created_at,
    'read_at', m.read_at
  );
$$;

-- EP-80 unread_conversations (= Me.marketplace.unread_conversations).
create function private.unread_conversations(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.conversations c
  where (c.starter_id = p_user or c.owner_id = p_user)
    and exists (
      select 1 from public.messages m
      where m.conversation_id = c.id and m.sender_id <> p_user and m.read_at is null
    );
$$;

-- EP-82 error choice for a listing the caller cannot see: its status when it exists (listing_not_active for a
-- resolved / expired / hidden listing), null otherwise. Reveals nothing but that status.
create function private.listing_status_of(p_listing uuid)
returns public.listing_status
language sql
stable
security definer
set search_path = ''
as $$
  select l.status from public.listings l where l.id = p_listing;
$$;

revoke execute on function private.listing_status_of(uuid) from public, anon;
grant execute on function private.listing_status_of(uuid) to authenticated, service_role;
revoke execute on function private.person_name(uuid) from public, anon;
revoke execute on function private.conversation_summary_json(uuid) from public, anon;
revoke execute on function private.message_json(public.messages) from public, anon;
revoke execute on function private.unread_conversations(uuid) from public, anon;
grant execute on function private.person_name(uuid) to authenticated, service_role;
grant execute on function private.conversation_summary_json(uuid) to authenticated, service_role;
grant execute on function private.message_json(public.messages) to authenticated, service_role;
grant execute on function private.unread_conversations(uuid) to authenticated, service_role;

-- EP-80 — list_my_conversations ---------------------------------------------------------------------
create function public.list_my_conversations(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_offset:out_of_range';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(private.conversation_summary_json(page.id) order by page.last_message_at desc, page.id)
      from (
        select c.id, c.last_message_at
        from public.conversations c
        where c.starter_id = me or c.owner_id = me
        order by c.last_message_at desc, c.id
        limit p_limit offset p_offset
      ) page
    ), '[]'::jsonb),
    'total', (
      select count(*)::integer from public.conversations c where c.starter_id = me or c.owner_id = me
    ),
    'unread_conversations', private.unread_conversations(me)
  );
end;
$$;

revoke all on function public.list_my_conversations(integer, integer) from public, anon;
grant execute on function public.list_my_conversations(integer, integer) to authenticated;

-- EP-81 — get_conversation ----------------------------------------------------------------------------
-- The p_limit newest messages after skipping p_offset, returned oldest → newest (FR-68). Reading does
-- not mark anything read (EP-83 does).
create function public.get_conversation(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_summary jsonb;
  v_total integer;
  v_suspended boolean;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_offset:out_of_range';
  end if;

  v_summary := private.conversation_summary_json(p_conversation_id);
  if v_summary is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  select count(*)::integer into v_total from public.messages m where m.conversation_id = p_conversation_id;
  select p.marketplace_suspended_at is not null into v_suspended from public.profiles p where p.id = me;

  return jsonb_build_object(
    'conversation', v_summary || jsonb_build_object(
      -- Does not reveal whether the other party blocked the caller (BR-59).
      'can_send', not coalesce(v_suspended, false) and not (v_summary ->> 'i_blocked_other')::boolean,
      'message_total', v_total
    ),
    'messages', coalesce((
      select jsonb_agg(private.message_json(page) order by page.created_at, page.id)
      from (
        select m.*
        from public.messages m
        where m.conversation_id = p_conversation_id
        order by m.created_at desc, m.id desc
        limit p_limit offset p_offset
      ) page
    ), '[]'::jsonb),
    'total', v_total
  );
end;
$$;

revoke all on function public.get_conversation(uuid, integer, integer) from public, anon;
grant execute on function public.get_conversation(uuid, integer, integer) to authenticated;

-- EP-82 — send_message (pre-approved exception 6: one transaction) ---------------------------------------
-- Security invoker: RLS and the Step 28a triggers decide (conversations_listing_active → listing_not_active /
-- cannot_message_self, messages_sender_is_party, messages_not_blocked → user_blocked, marketplace_not_suspended
-- → marketplace_suspended, messages_touch_conversation). Starting on a listing reuses the caller's existing
-- conversation about it (BR-61). Rate limit, idempotency and the new-message notification are the action's.
create function public.send_message(p_listing_id uuid, p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_conversation uuid;
  v_created boolean := false;
  v_author uuid;
  v_message public.messages;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if (p_listing_id is null) = (p_conversation_id is null) then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'listing_id:invalid';
  end if;
  if char_length(v_body) = 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'body:required';
  end if;
  if char_length(v_body) > 2000 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'body:too_long';
  end if;

  if p_conversation_id is not null then
    -- conversations RLS: parties only.
    select c.id into v_conversation from public.conversations c where c.id = p_conversation_id;
    if v_conversation is null then
      raise exception using errcode = 'P0001', message = 'not_found';
    end if;
  else
    select c.id into v_conversation
    from public.conversations c
    where c.listing_id = p_listing_id and c.starter_id = me;

    if v_conversation is null then
      -- listings RLS: publicly visible (active, author not suspended), own, or Operator.
      select l.author_id into v_author from public.listings l where l.id = p_listing_id;
      if v_author is null then
        if private.listing_status_of(p_listing_id) is distinct from 'active' and private.listing_status_of(p_listing_id) is not null then
          raise exception using errcode = 'P0001', message = 'listing_not_active';
        end if;
        raise exception using errcode = 'P0001', message = 'not_found';
      end if;
      if v_author = me then
        raise exception using errcode = 'P0001', message = 'cannot_message_self';
      end if;
      -- BR-59: a listing whose author the caller blocked is not visible to the caller.
      if exists (select 1 from public.user_blocks b where b.blocker_id = me and b.blocked_id = v_author) then
        raise exception using errcode = 'P0001', message = 'not_found';
      end if;

      insert into public.conversations (listing_id) values (p_listing_id)
      on conflict (listing_id, starter_id) do nothing
      returning id into v_conversation;
      v_created := v_conversation is not null;
      if not v_created then
        select c.id into v_conversation
        from public.conversations c
        where c.listing_id = p_listing_id and c.starter_id = me;
      end if;
    end if;
  end if;

  insert into public.messages (conversation_id, body)
  values (v_conversation, v_body)
  returning * into v_message;

  return jsonb_build_object(
    'conversation', private.conversation_summary_json(v_conversation),
    'message', private.message_json(v_message),
    'created_conversation', v_created
  );
end;
$$;

revoke all on function public.send_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_message(uuid, uuid, text) to authenticated;

-- What the EP-82 new-message notification needs about the recipient and the sender (service role only):
-- the message row, channels from the recipient's `message` preference (default {email, push}), email,
-- locale, full_name and deletion state, the sender's display name, the listing title and push endpoints.
create function public.new_message_notification(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conversation_id', c.id,
    'body', m.body,
    'sender_name', case
      when m.sender_id = c.owner_id and l.organisation_id is not null then o.name
      else coalesce(s.display_name, s.full_name)
    end,
    'listing_title', l.title,
    'recipient', jsonb_build_object(
      'id', r.id,
      'email', r.email,
      'locale', r.locale,
      'full_name', r.full_name,
      'deletion_pending', r.deletion_requested_at is not null,
      'channels', to_jsonb(coalesce(
        (select p.channels from reminder_preferences p where p.user_id = r.id and p.type = 'message'),
        '{email,push}'::delivery_channel[]
      ))
    ),
    'push_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
        order by ps.created_at)
      from push_subscriptions ps where ps.user_id = r.id
    ), '[]'::jsonb)
  )
  from messages m
  join conversations c on c.id = m.conversation_id
  join profiles s on s.id = m.sender_id
  join profiles r on r.id = case when m.sender_id = c.starter_id then c.owner_id else c.starter_id end
  left join listings l on l.id = c.listing_id
  left join organisations o on o.id = l.organisation_id
  where m.id = p_message_id;
$$;

revoke all on function public.new_message_notification(uuid) from public, anon, authenticated;
grant execute on function public.new_message_notification(uuid) to service_role;

-- EP-83 — mark_conversation_read ------------------------------------------------------------------------
create function public.mark_conversation_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_marked integer;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and me in (c.starter_id, c.owner_id)
  ) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  update public.messages m
  set read_at = now()
  where m.conversation_id = p_conversation_id and m.sender_id <> me and m.read_at is null;
  get diagnostics v_marked = row_count;

  return jsonb_build_object(
    'conversation_id', p_conversation_id,
    'marked', v_marked,
    'unread_conversations', private.unread_conversations(me)
  );
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- EP-85 — block_user / unblock_user (security invoker; user_blocks RLS: own rows only) ------------------
create function public.block_user(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  b public.user_blocks;
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_user_id is null or p_user_id = me then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_user_id:invalid';
  end if;

  begin
    insert into public.user_blocks (blocked_id) values (p_user_id)
    on conflict (blocker_id, blocked_id) do nothing;
  exception when foreign_key_violation then
    -- Owner decision (Step 28c): an unknown user → not_found.
    raise exception using errcode = 'P0001', message = 'not_found';
  end;

  select * into b from public.user_blocks x where x.blocker_id = me and x.blocked_id = p_user_id;
  return jsonb_build_object('blocker_id', b.blocker_id, 'blocked_id', b.blocked_id, 'created_at', b.created_at);
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if p_user_id is null or p_user_id = me then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_user_id:invalid';
  end if;
  delete from public.user_blocks b where b.blocker_id = me and b.blocked_id = p_user_id;
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- EP-86 — moderation ----------------------------------------------------------------------------------

-- API §6 ModerationItem.
create function private.moderation_item_json(r public.reports)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'report_id', r.id,
    'target', case when r.listing_id is not null then 'listing' else 'user' end,
    'reason', r.reason,
    'note', r.note,
    'status', r.status,
    'created_at', r.created_at,
    'handled_at', r.handled_at,
    'reporter', jsonb_build_object('user_id', r.reporter_id, 'display_name', private.person_name(r.reporter_id)),
    'listing', jsonb_build_object(
      'id', r.listing_id,
      'title', (select l.title from public.listings l where l.id = r.listing_id),
      'status', (select l.status from public.listings l where l.id = r.listing_id)
    ),
    'reported_user', jsonb_build_object(
      'user_id', r.reported_user_id,
      'display_name', private.person_name(r.reported_user_id),
      'suspended_at', (select p.marketplace_suspended_at from public.profiles p where p.id = r.reported_user_id)
    ),
    'same_target_open_count', (
      select count(*)::integer from public.reports x
      where x.status = 'open'
        and case
          when r.listing_id is not null then x.listing_id = r.listing_id
          else x.listing_id is null and x.reported_user_id = r.reported_user_id
        end
    )
  );
$$;

-- API §6 Restriction of a hidden listing or a suspended user; null when it is neither.
create function private.restriction_json(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listings;
  p public.profiles;
  r public.reports;
begin
  if p_kind = 'listing' then
    select * into l from public.listings x where x.id = p_id and x.status = 'hidden';
    if not found then
      return null;
    end if;
    select * into r from public.reports x
    where x.listing_id = l.id and x.status = 'actioned'
    order by x.handled_at desc nulls last, x.created_at desc
    limit 1;
    return jsonb_build_object(
      'kind', 'listing',
      'listing_id', l.id,
      'listing_title', l.title,
      'user_id', l.author_id,
      'user_display_name', private.person_name(l.author_id),
      'restricted_at', coalesce(r.handled_at, l.updated_at),
      'reason', r.reason
    );
  end if;

  select * into p from public.profiles x where x.id = p_id and x.marketplace_suspended_at is not null;
  if not found then
    return null;
  end if;
  select * into r from public.reports x
  where x.reported_user_id = p.id and x.status = 'actioned'
  order by x.handled_at desc nulls last, x.created_at desc
  limit 1;
  return jsonb_build_object(
    'kind', 'user',
    'listing_id', null,
    'listing_title', null,
    'user_id', p.id,
    'user_display_name', coalesce(p.display_name, p.full_name),
    'restricted_at', p.marketplace_suspended_at,
    'reason', r.reason
  );
end;
$$;

revoke execute on function private.moderation_item_json(public.reports) from public, anon, authenticated;
revoke execute on function private.restriction_json(text, uuid) from public, anon, authenticated;
grant execute on function private.moderation_item_json(public.reports) to service_role;
grant execute on function private.restriction_json(text, uuid) to service_role;

-- EP-86 list (owner decision, Step 28c): security definer; a caller who is not an Operator gets an empty
-- result. open_reports oldest first; restrictions newest first.
create function public.admin_list_moderation(p_view text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_total integer;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Belgrade') at time zone 'Europe/Belgrade';
begin
  if p_view is null or p_view not in ('open_reports', 'restrictions') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_view:invalid';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_limit:out_of_range';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'p_offset:out_of_range';
  end if;

  if not private.is_operator() then
    return jsonb_build_object('view', p_view, 'items', '[]'::jsonb, 'total', 0, 'open_count', 0,
      'handled_this_month', 0);
  end if;

  if p_view = 'open_reports' then
    select coalesce(jsonb_agg(private.moderation_item_json(page) order by page.created_at, page.id), '[]'::jsonb)
    into v_items
    from (
      select r.* from reports r where r.status = 'open'
      order by r.created_at, r.id
      limit p_limit offset p_offset
    ) page;
    select count(*)::integer into v_total from reports r where r.status = 'open';
  else
    with restricted as (
      select x.restriction
      from (
        select private.restriction_json('listing', l.id) as restriction from listings l where l.status = 'hidden'
        union all
        select private.restriction_json('user', p.id) from profiles p where p.marketplace_suspended_at is not null
      ) x
    )
    select
      coalesce((
        select jsonb_agg(page.restriction order by (page.restriction ->> 'restricted_at')::timestamptz desc,
          page.restriction ->> 'kind', coalesce(page.restriction ->> 'listing_id', page.restriction ->> 'user_id'))
        from (
          select rs.restriction from restricted rs
          order by (rs.restriction ->> 'restricted_at')::timestamptz desc, rs.restriction ->> 'kind',
            coalesce(rs.restriction ->> 'listing_id', rs.restriction ->> 'user_id')
          limit p_limit offset p_offset
        ) page
      ), '[]'::jsonb),
      (select count(*)::integer from restricted)
    into v_items, v_total;
  end if;

  return jsonb_build_object(
    'view', p_view,
    'items', v_items,
    'total', v_total,
    'open_count', (select count(*)::integer from reports r where r.status = 'open'),
    'handled_this_month', (select count(*)::integer from reports r where r.handled_at >= v_month_start)
  );
end;
$$;

revoke all on function public.admin_list_moderation(text, integer, integer) from public, anon;
grant execute on function public.admin_list_moderation(text, integer, integer) to authenticated;

-- EP-86 dismiss_report / hide_listing / suspend_user, one transaction each. Service role only: the
-- `moderate` action has checked profiles.is_operator and passes the Operator as p_operator. Returns the
-- updated ModerationItem and what the action needs for the author's email (null when no email is due).
create function public.admin_decide_report(p_operator uuid, p_report_id uuid, p_op text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r reports;
  l listings;
  v_target uuid;
  v_email jsonb := null;
  v_hidden boolean := false;
  v_new_suspension boolean := false;
begin
  if p_op is null or p_op not in ('dismiss_report', 'hide_listing', 'suspend_user') then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'op:invalid';
  end if;
  if p_operator is null or not exists (select 1 from profiles p where p.id = p_operator and p.is_operator) then
    raise exception using errcode = 'P0001', message = 'forbidden_role';
  end if;

  select * into r from reports x where x.id = p_report_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if r.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'already_decided';
  end if;

  if p_op = 'dismiss_report' then
    update reports set status = 'dismissed', handled_by = p_operator, handled_at = now() where id = r.id;

  elsif p_op = 'hide_listing' then
    if r.listing_id is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'report_id:invalid';
    end if;
    select * into l from listings x where x.id = r.listing_id for update;
    -- Only an active listing is hidden; resolved / expired / hidden listings keep their status.
    if l.status = 'active' then
      update listings set status = 'hidden' where id = l.id;
      v_hidden := true;
    end if;
    -- The decided report is stamped last, so it is "the latest actioned report" whose reason the restriction
    -- and the S35 hidden card show (OQ-17).
    update reports set status = 'actioned', handled_by = p_operator, handled_at = now()
    where status = 'open' and listing_id = l.id and id <> r.id;
    update reports set status = 'actioned', handled_by = p_operator, handled_at = clock_timestamp() where id = r.id;
    if v_hidden then
      select jsonb_build_object(
        'template', 'listing_hidden', 'to', p.email, 'locale', p.locale, 'listing', l.title, 'reason', r.reason
      ) into v_email
      from profiles p where p.id = l.author_id;
    end if;

  else
    v_target := r.reported_user_id;
    if v_target is null then
      raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'report_id:invalid';
    end if;
    update profiles set marketplace_suspended_at = now()
    where id = v_target and marketplace_suspended_at is null;
    v_new_suspension := found;
    update reports set status = 'actioned', handled_by = p_operator, handled_at = now()
    where status = 'open' and reported_user_id = v_target and id <> r.id;
    update reports set status = 'actioned', handled_by = p_operator, handled_at = clock_timestamp() where id = r.id;
    if v_new_suspension then
      select jsonb_build_object('template', 'marketplace_suspended', 'to', p.email, 'locale', p.locale,
        'reason', r.reason)
      into v_email
      from profiles p where p.id = v_target;
    end if;
  end if;

  select * into r from reports x where x.id = p_report_id;
  return jsonb_build_object('item', private.moderation_item_json(r), 'email', v_email);
end;
$$;

-- EP-86 restore_listing (owner decision, Step 28c): active when expires_at > now(), otherwise expired; when
-- the listings_active_limit trigger refuses `active` (premium_required:listings), expired instead.
create function public.admin_restore_listing(p_id uuid)
returns listing_status
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings;
  v_status listing_status;
begin
  select * into l from listings x where x.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if l.status <> 'hidden' then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'listing_id:invalid_state';
  end if;

  v_status := case when l.expires_at > now() then 'active'::listing_status else 'expired'::listing_status end;
  begin
    update listings set status = v_status where id = p_id;
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'premium_required%' then
      raise;
    end if;
    v_status := 'expired';
    update listings set status = v_status where id = p_id;
  end;
  return v_status;
end;
$$;

-- EP-86 restore_user: clears the suspension and returns the lifted Restriction.
create function public.admin_restore_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restriction jsonb;
begin
  if not exists (select 1 from profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  v_restriction := private.restriction_json('user', p_user_id);
  if v_restriction is null then
    raise exception using errcode = 'P0001', message = 'validation_failed', detail = 'user_id:invalid_state';
  end if;
  update profiles set marketplace_suspended_at = null where id = p_user_id;
  return v_restriction;
end;
$$;

-- The Restriction of a hidden listing (read by the action before restore_listing); null otherwise.
create function public.admin_get_restriction(p_kind text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select private.restriction_json(p_kind, p_id);
$$;

revoke all on function public.admin_decide_report(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_restore_listing(uuid) from public, anon, authenticated;
revoke all on function public.admin_restore_user(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_restriction(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_decide_report(uuid, uuid, text) to service_role;
grant execute on function public.admin_restore_listing(uuid) to service_role;
grant execute on function public.admin_restore_user(uuid) to service_role;
grant execute on function public.admin_get_restriction(text, uuid) to service_role;

-- EP-28 — rpc:get_reminder_settings, now seven rows: the Step 28a body without its `message` filter. The
-- message row has no lead time and no delivery time, is not fixed-time (sent at once by EP-82) and
-- defaults to {email, push} (FR-69).
create or replace function public.get_reminder_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  return jsonb_build_object(
    'preferences', (
      select jsonb_agg(
        jsonb_build_object(
          'type', t.type,
          'lead_minutes', to_jsonb(
            case
              when t.type in ('treatment_dose', 'meal', 'message') then '{0}'::integer[]
              else coalesce(p.lead_minutes, private.default_lead_minutes(t.type))
            end
          ),
          'delivery_time', case
            when t.type in ('treatment_dose', 'meal', 'message') then null
            else left(coalesce(p.delivery_time, time '09:00')::text, 5)
          end,
          'channels', to_jsonb(coalesce(p.channels, '{email,push}'::public.delivery_channel[])),
          'fixed_time', t.type in ('treatment_dose', 'meal'),
          'is_default', p.id is null,
          'updated_at', p.updated_at
        )
        order by t.ord
      )
      from unnest(enum_range(null::public.reminder_type)) with ordinality as t (type, ord)
      left join public.reminder_preferences p on p.user_id = uid and p.type = t.type
    ),
    'viber_enabled', coalesce((select s.viber_enabled from public.app_settings s limit 1), false),
    'whatsapp', (
      select jsonb_build_object(
        'channel', 'whatsapp',
        'status', case when c.opted_in_at is not null then 'connected' else 'not_connected' end,
        'phone', case when c.opted_in_at is not null then c.address end,
        'connected_at', c.opted_in_at
      )
      from (select 1) as one
      left join public.user_channels c on c.user_id = uid and c.channel = 'whatsapp'
    )
  );
end;
$$;

revoke execute on function public.get_reminder_settings() from public, anon;
grant execute on function public.get_reminder_settings() to authenticated, service_role;
