-- Direct messages: any member can message a public member, and both people can
-- keep talking even if one later goes private. One conversation per pair
-- (user_a < user_b). Members can only read conversations they are in; every
-- write goes through the functions below, which check the caller themselves.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  a_read_at timestamptz not null default now(),
  b_read_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index conversations_user_b_idx on public.conversations (user_b);
comment on table public.conversations is 'Direct message threads between two members. Written through send_message().';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and body = btrim(body)),
  -- clock_timestamp keeps messages sent in one transaction in order.
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);
comment on table public.messages is 'Direct messages. Written through send_message().';

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy "Members read their conversations" on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy "Members read messages in their conversations" on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_a, c.user_b)));
-- Supabase's default privileges grant everything on new tables; only reading is allowed here.
revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations, public.messages to authenticated;

-- The caller's conversations, newest first, with the other person, the last message and the unread count.
create function public.my_conversations()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(item order by last_at desc), '[]'::jsonb)
  from (
    select c.last_message_at as last_at, jsonb_build_object(
      'id', other.id,
      'username', other.username,
      'name', coalesce(other.display_name, other.username),
      'avatarPath', other.avatar_path,
      'lastMessage', last.body,
      'lastMine', last.sender_id = auth.uid(),
      'lastAt', c.last_message_at,
      'unread', (
        select count(*) from public.messages m
        where m.conversation_id = c.id and m.sender_id <> auth.uid()
          and m.created_at > case when c.user_a = auth.uid() then c.a_read_at else c.b_read_at end
      )
    ) as item
    from public.conversations c
    join public.profiles other on other.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
    left join lateral (
      select m.body, m.sender_id from public.messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1
    ) last on true
    where auth.uid() in (c.user_a, c.user_b)
    order by c.last_message_at desc
    limit 100
  ) rows;
$$;

-- The latest 100 messages with one person, oldest first, and marks them read.
-- A public member with no conversation yet answers with no messages, ready for a first one.
create function public.conversation_messages(other uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  thread public.conversations;
  partner jsonb;
  newest timestamptz;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select * into thread from public.conversations where user_a = least(me, other) and user_b = greatest(me, other);
  select jsonb_build_object('id', p.id, 'username', p.username, 'name', coalesce(p.display_name, p.username), 'headline', p.headline, 'avatarPath', p.avatar_path)
  into partner
  from public.profiles p
  where p.id = other and p.id <> me and (thread.id is not null or (p.visibility = 'public' and p.hidden_at is null));
  if partner is null then
    raise exception 'That member isn’t available.' using errcode = 'P0002';
  end if;
  if thread.id is null then
    return jsonb_build_object('partner', partner, 'messages', '[]'::jsonb);
  end if;

  select max(created_at) into newest from public.messages where conversation_id = thread.id;
  if newest > (case when thread.user_a = me then thread.a_read_at else thread.b_read_at end) then
    update public.conversations set
      a_read_at = case when user_a = me then newest else a_read_at end,
      b_read_at = case when user_b = me then newest else b_read_at end
    where id = thread.id;
  end if;

  return jsonb_build_object('partner', partner, 'messages', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'mine', m.sender_id = me, 'createdAt', m.created_at) order by m.created_at, m.id)
    from (select * from public.messages where conversation_id = thread.id order by created_at desc limit 100) m
  ), '[]'::jsonb));
end;
$$;

-- Sends a message, starting the conversation when needed. A new conversation
-- needs a public recipient; an existing one keeps working either way.
create function public.send_message(recipient uuid, body text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  thread uuid;
  sent public.messages;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if recipient = me then
    raise exception 'You can’t message yourself.' using errcode = '22023';
  end if;
  body := btrim(coalesce(body, ''));
  if char_length(body) not between 1 and 2000 then
    raise exception 'Write a message of 1 to 2,000 characters.' using errcode = '22023';
  end if;
  perform private.throttle_creator('message', 120, 900);

  select id into thread from public.conversations where user_a = least(me, recipient) and user_b = greatest(me, recipient);
  if thread is null then
    if not private.profile_is_public(recipient) then
      raise exception 'That member isn’t available.' using errcode = 'P0002';
    end if;
    -- Both people may start the conversation at the same moment; the second insert reuses the first.
    insert into public.conversations (user_a, user_b) values (least(me, recipient), greatest(me, recipient))
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into thread;
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (thread, me, body) returning * into sent;
  update public.conversations set
    last_message_at = sent.created_at,
    a_read_at = case when user_a = me then sent.created_at else a_read_at end,
    b_read_at = case when user_b = me then sent.created_at else b_read_at end
  where id = thread;

  return jsonb_build_object('id', sent.id, 'body', sent.body, 'mine', true, 'createdAt', sent.created_at);
end;
$$;

-- Public members to start a conversation with, by username or name. Empty finds recent members.
create function public.find_members(query text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'name', coalesce(p.display_name, p.username),
    'headline', p.headline,
    'avatarPath', p.avatar_path
  ) order by p.rank, p.username), '[]'::jsonb)
  from (
    select p.*, case when lower(p.username) = lower(btrim(query)) then 0 else 1 end as rank
    from public.profiles p
    where p.id <> auth.uid() and p.visibility = 'public' and p.hidden_at is null
      and (btrim(query) = ''
        or position(lower(btrim(query)) in lower(p.username)) > 0
        or position(lower(btrim(query)) in lower(coalesce(p.display_name, ''))) > 0)
    order by rank, p.published_at desc nulls last
    limit 12
  ) p;
$$;

comment on function public.my_conversations() is 'Messages: the caller''s conversations with unread counts.';
comment on function public.conversation_messages(uuid) is 'Messages: one conversation, marked read.';
comment on function public.send_message(uuid, text) is 'Messages: send one, starting the conversation when needed.';
comment on function public.find_members(text) is 'Messages: public members to write to.';

revoke all on function public.my_conversations(), public.conversation_messages(uuid), public.send_message(uuid, text), public.find_members(text) from public, anon, authenticated;
grant execute on function public.my_conversations(), public.conversation_messages(uuid), public.send_message(uuid, text), public.find_members(text) to authenticated;
