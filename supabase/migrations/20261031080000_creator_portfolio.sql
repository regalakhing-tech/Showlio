-- A creator's public portfolio in one call: profile, skills, public links,
-- follower count and published projects with their photos. It runs as the
-- caller (guest or signed in), so Row Level Security decides what is visible:
-- guests and other creators see public profiles only; owners also see their own.

grant execute on function private.follower_count(uuid) to anon;

create function public.creator_portfolio(handle text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'name', p.display_name,
      'headline', p.headline,
      'bio', p.bio,
      'location', p.location_region,
      'avatarPath', p.avatar_path,
      'availability', case when p.show_availability then p.availability end,
      'visible', p.visibility = 'public',
      'own', p.id is not distinct from auth.uid(),
      'joinedAt', p.created_at
    ),
    'skills', coalesce((
      select jsonb_agg(s.name order by ps.sort_order)
      from public.profile_skills ps join public.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('kind', l.kind, 'url', l.url) order by l.sort_order)
      from public.social_links l
      where l.profile_id = p.id and l.is_public
    ), '[]'::jsonb),
    'followers', private.follower_count(p.id),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'title', pr.title,
        'summary', pr.summary,
        'likes', pr.like_count,
        'views', pr.view_count,
        'comments', pr.comment_count,
        'shownAt', coalesce(pr.published_at, pr.created_at),
        'categories', coalesce((
          select jsonb_agg(cat.name order by cat.sort_order)
          from public.project_categories pc join public.categories cat on cat.id = pc.category_id
          where pc.project_id = pr.id
        ), '[]'::jsonb),
        'tools', coalesce((
          select jsonb_agg(s.name order by ps.sort_order)
          from public.project_skills ps join public.skills s on s.id = ps.skill_id
          where ps.project_id = pr.id
        ), '[]'::jsonb),
        'mediaPaths', coalesce((
          select jsonb_agg(m.storage_path order by m.sort_order, m.created_at)
          from public.project_media m where m.project_id = pr.id
        ), '[]'::jsonb)
      ) order by coalesce(pr.published_at, pr.created_at) desc)
      from public.projects pr
      where pr.creator_id = p.id and pr.visibility = 'published' and pr.hidden_at is null
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.username = lower(handle);
$$;
comment on function public.creator_portfolio(text) is 'Public portfolio: a creator''s profile and published projects, as the caller may see them.';

revoke all on function public.creator_portfolio(text) from public, anon, authenticated;
grant execute on function public.creator_portfolio(text) to anon, authenticated;
