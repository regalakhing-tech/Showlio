-- Messenger touches: active status, a colour theme per conversation, and "Seen".
-- Active status is shared only between two people who both keep it switched on
-- (Settings > Privacy), like other messengers.

create table public.member_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table public.member_presence enable row level security;
revoke all on public.member_presence from anon, authenticated;
comment on table public.member_presence is 'When each member last had Showlio open. Read only through private.active_at().';

alter table public.user_preferences add column show_active_status boolean not null default true;
grant update (show_active_status) on public.user_preferences to authenticated;

alter table public.conversations add column theme text not null default 'showlio'
  check (theme in ('showlio', 'ocean', 'violet', 'sunset', 'rose', 'forest', 'midnight'));

-- Marks the caller active. Writes at most every 30 seconds, although the workspace polls more often.
create function private.touch_presence()
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.member_presence (user_id)
  select auth.uid() where auth.uid() is not null
  on conflict (user_id) do update set last_active_at = now()
  where public.member_presence.last_active_at < now() - interval '30 seconds';
$$;

-- When someone was last active, as the caller may see it: null unless both share their active status.
create function private.active_at(who uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select p.last_active_at from public.member_presence p
  where p.user_id = who
    and coalesce((select u.show_active_status from public.user_preferences u where u.user_id = who), true)
    and coalesce((select u.show_active_status from public.user_preferences u where u.user_id = auth.uid()), true);
$$;
revoke all on function private.touch_presence(), private.active_at(uuid) from public;

create or replace function public.my_conversations()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.touch_presence();
  return (
    select coalesce(jsonb_agg(item order by last_at desc), '[]'::jsonb)
    from (
      select c.last_message_at as last_at, jsonb_build_object(
        'id', other.id,
        'username', other.username,
        'name', coalesce(other.display_name, other.username),
        'avatarPath', other.avatar_path,
        'activeAt', private.active_at(other.id),
        'theme', c.theme,
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
    ) rows
  );
end;
$$;

create or replace function public.conversation_messages(other uuid)
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
  perform private.touch_presence();
  select * into thread from public.conversations where user_a = least(me, other) and user_b = greatest(me, other);
  select jsonb_build_object('id', p.id, 'username', p.username, 'name', coalesce(p.display_name, p.username), 'headline', p.headline,
    'avatarPath', p.avatar_path, 'location', p.location_region, 'activeAt', private.active_at(p.id))
  into partner
  from public.profiles p
  where p.id = other and p.id <> me and (thread.id is not null or (p.visibility = 'public' and p.hidden_at is null));
  if partner is null then
    raise exception 'That member isn’t available.' using errcode = 'P0002';
  end if;
  if thread.id is null then
    return jsonb_build_object('partner', partner, 'theme', 'showlio', 'partnerReadAt', null, 'messages', '[]'::jsonb);
  end if;

  select max(created_at) into newest from public.messages where conversation_id = thread.id;
  if newest > (case when thread.user_a = me then thread.a_read_at else thread.b_read_at end) then
    update public.conversations set
      a_read_at = case when user_a = me then newest else a_read_at end,
      b_read_at = case when user_b = me then newest else b_read_at end
    where id = thread.id;
  end if;

  return jsonb_build_object(
    'partner', partner,
    'theme', thread.theme,
    'partnerReadAt', case when thread.user_a = me then thread.b_read_at else thread.a_read_at end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'mine', m.sender_id = me, 'createdAt', m.created_at) order by m.created_at, m.id)
      from (select * from public.messages where conversation_id = thread.id order by created_at desc limit 100) m
    ), '[]'::jsonb)
  );
end;
$$;

-- Either person can change the conversation's theme; both see it.
create function public.set_conversation_theme(other uuid, choice text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('chat-theme', 60, 900);
  update public.conversations set theme = choice
  where user_a = least(me, other) and user_b = greatest(me, other);
  if not found then
    raise exception 'Send a message first, then choose a theme.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('theme', choice);
end;
$$;
comment on function public.set_conversation_theme(uuid, text) is 'Messages: the colour theme of one conversation.';
revoke all on function public.set_conversation_theme(uuid, text) from public, anon, authenticated;
grant execute on function public.set_conversation_theme(uuid, text) to authenticated;

-- Settings gain "Show active status".
create or replace function public.my_profile()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'username', p.username,
      'email', coalesce(auth.jwt() ->> 'email', ''),
      'name', p.display_name,
      'headline', p.headline,
      'bio', p.bio,
      'location', p.location_region,
      'avatarPath', p.avatar_path,
      'availability', p.availability,
      'visible', p.visibility = 'public',
      'skills', coalesce((
        select jsonb_agg(s.name order by ps.sort_order)
        from public.profile_skills ps join public.skills s on s.id = ps.skill_id
        where ps.profile_id = p.id
      ), '[]'::jsonb),
      'links', (
        select jsonb_build_object(
          'website', coalesce(min(l.url::text) filter (where l.kind = 'website'), ''),
          'instagram', coalesce(min(l.url::text) filter (where l.kind = 'instagram'), ''),
          'youtube', coalesce(min(l.url::text) filter (where l.kind = 'youtube'), '')
        )
        from public.social_links l where l.profile_id = p.id
      )
    ),
    'preferences', jsonb_build_object(
      'showAvailability', p.show_availability,
      'communityDiscovery', p.discoverable,
      'projectNotifications', coalesce(u.notify_project_activity, true),
      'messageNotifications', coalesce(u.notify_messages, true),
      'communityNotifications', coalesce(u.notify_community, true),
      'productNotifications', coalesce(u.notify_product, false),
      'profileCompleted', coalesce(u.profile_completed, false),
      'showActiveStatus', coalesce(u.show_active_status, true)
    )
  )
  from public.profiles p
  left join public.user_preferences u on u.user_id = p.id
  where p.id = auth.uid();
$$;

create or replace function public.set_my_preferences(changes jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('preferences', 120, 900);
  update public.profiles set
    show_availability = coalesce((changes ->> 'showAvailability')::boolean, show_availability),
    discoverable = coalesce((changes ->> 'communityDiscovery')::boolean, discoverable)
  where id = uid and (changes ? 'showAvailability' or changes ? 'communityDiscovery');
  update public.user_preferences set
    notify_project_activity = coalesce((changes ->> 'projectNotifications')::boolean, notify_project_activity),
    notify_messages = coalesce((changes ->> 'messageNotifications')::boolean, notify_messages),
    notify_community = coalesce((changes ->> 'communityNotifications')::boolean, notify_community),
    notify_product = coalesce((changes ->> 'productNotifications')::boolean, notify_product),
    profile_completed = profile_completed or coalesce((changes ->> 'profileCompleted')::boolean, false),
    show_active_status = coalesce((changes ->> 'showActiveStatus')::boolean, show_active_status)
  where user_id = uid and (changes ?| array['projectNotifications', 'messageNotifications', 'communityNotifications', 'productNotifications', 'profileCompleted', 'showActiveStatus']);
  return public.my_profile();
end;
$$;
