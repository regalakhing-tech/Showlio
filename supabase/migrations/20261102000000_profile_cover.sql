-- Each creator can choose a cover photo for their profile, shown in the workspace and on
-- their card in Explore. The image lives in the creator's own folder of the public avatars
-- bucket; my_profile() and workspace_feed() now include it, so each stays one call.

alter table public.profiles add column if not exists cover_path text
  check (char_length(cover_path) <= 300 and cover_path like id::text || '/%');
grant update (cover_path) on public.profiles to authenticated;
comment on column public.profiles.cover_path is 'Profile cover photo in the avatars bucket, inside the owner''s folder.';

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
      'coverPath', p.cover_path,
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

create or replace function public.workspace_feed()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible as (
    select p.id, p.creator_id, p.title, p.summary, p.status, p.visibility, p.video_url, p.video_duration,
      p.like_count, p.bookmark_count, p.view_count, p.comment_count, coalesce(p.published_at, p.created_at) as shown_at
    from public.projects p
    join public.profiles c on c.id = p.creator_id
    where p.creator_id = auth.uid()
      or (p.visibility = 'published' and p.hidden_at is null and c.visibility = 'public' and c.hidden_at is null and c.discoverable)
    order by shown_at desc
    limit 200
  ),
  creators as (
    select c.id, c.username, c.display_name, c.headline, c.bio, c.avatar_path, c.cover_path
    from public.profiles c
    where c.id <> auth.uid()
      and (c.id in (select creator_id from visible) or (c.visibility = 'public' and c.hidden_at is null and c.discoverable))
    order by c.published_at desc nulls last
    limit 60
  )
  select jsonb_build_object(
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'creatorId', v.creator_id,
        'title', v.title,
        'summary', v.summary,
        'status', v.status,
        'visibility', v.visibility,
        'videoUrl', v.video_url,
        'duration', v.video_duration,
        'likes', v.like_count,
        'saves', v.bookmark_count,
        'views', v.view_count,
        'comments', v.comment_count,
        'shownAt', v.shown_at,
        'categories', coalesce((
          select jsonb_agg(cat.name order by cat.sort_order)
          from public.project_categories pc join public.categories cat on cat.id = pc.category_id
          where pc.project_id = v.id
        ), '[]'::jsonb),
        'tools', coalesce((
          select jsonb_agg(s.name order by ps.sort_order)
          from public.project_skills ps join public.skills s on s.id = ps.skill_id
          where ps.project_id = v.id
        ), '[]'::jsonb),
        'coverPath', (
          select m.storage_path from public.project_media m
          where m.project_id = v.id order by m.sort_order, m.created_at limit 1
        ),
        'mediaPaths', coalesce((
          select jsonb_agg(m.storage_path order by m.sort_order, m.created_at)
          from public.project_media m where m.project_id = v.id
        ), '[]'::jsonb)
      ) order by v.shown_at desc)
      from visible v
    ), '[]'::jsonb),
    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'username', c.username, 'name', c.display_name, 'headline', c.headline, 'bio', c.bio,
        'avatarPath', c.avatar_path, 'coverPath', c.cover_path, 'followers', private.follower_count(c.id)
      ))
      from creators c
    ), '[]'::jsonb),
    'likes', coalesce((select jsonb_agg(project_id) from public.project_likes where user_id = auth.uid()), '[]'::jsonb),
    'bookmarks', coalesce((select jsonb_agg(project_id) from public.bookmarks where user_id = auth.uid()), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(following_id) from public.follows where follower_id = auth.uid()), '[]'::jsonb)
  );
$$;
