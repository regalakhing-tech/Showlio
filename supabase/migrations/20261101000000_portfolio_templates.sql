-- Each creator picks the template of their public portfolio page:
-- classic (shown as "Studio"), minimal ("Editorial") or showcase ("Spotlight").

alter table public.profiles add column portfolio_template text not null default 'classic'
  check (portfolio_template in ('classic', 'minimal', 'showcase'));
grant update (portfolio_template) on public.profiles to authenticated;

create function public.set_my_portfolio_template(choice text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('portfolio-template', 60, 900);
  update public.profiles set portfolio_template = choice where id = auth.uid();
  if not found then
    raise exception 'Your profile isn’t ready yet.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('template', choice);
end;
$$;
comment on function public.set_my_portfolio_template(text) is 'Portfolio: choose the public page template.';
revoke all on function public.set_my_portfolio_template(text) from public, anon, authenticated;
grant execute on function public.set_my_portfolio_template(text) to authenticated;

create or replace function public.creator_portfolio(handle text)
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
      'joinedAt', p.created_at,
      'template', p.portfolio_template
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
