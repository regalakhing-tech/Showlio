-- Projects can carry several photos (up to 8 from the workspace). The feed now
-- lists every photo path in order, so Explore can show the whole gallery; the
-- first one stays the cover.

create or replace function public.workspace_feed()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible as (
    select p.id, p.creator_id, p.title, p.summary, p.status, p.visibility, p.video_url, p.video_duration,
      p.like_count, p.bookmark_count, p.view_count, coalesce(p.published_at, p.created_at) as shown_at
    from public.projects p
    join public.profiles c on c.id = p.creator_id
    where p.creator_id = auth.uid()
      or (p.visibility = 'published' and p.hidden_at is null and c.visibility = 'public' and c.hidden_at is null and c.discoverable)
    order by shown_at desc
    limit 200
  ),
  creators as (
    select c.id, c.username, c.display_name, c.headline, c.bio, c.avatar_path
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
        'avatarPath', c.avatar_path, 'followers', private.follower_count(c.id)
      ))
      from creators c
    ), '[]'::jsonb),
    'likes', coalesce((select jsonb_agg(project_id) from public.project_likes where user_id = auth.uid()), '[]'::jsonb),
    'bookmarks', coalesce((select jsonb_agg(project_id) from public.bookmarks where user_id = auth.uid()), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(following_id) from public.follows where follower_id = auth.uid()), '[]'::jsonb)
  );
$$;
