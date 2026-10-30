-- Community features for the workspace: the project feed, posting and deleting
-- projects, likes, saves and follows. One call each, run as the caller
-- (security invoker), so Row Level Security and column grants still decide
-- what anyone can see or change.

-- Follower totals are public, but follows rows are private to the two people
-- involved, so counting needs to look past Row Level Security.
create function private.follower_count(profile uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.follows where following_id = profile;
$$;
revoke all on function private.follower_count(uuid) from public;
grant execute on function private.follower_count(uuid) to authenticated;

-- Everything Explore needs in one call: visible projects (the caller's own,
-- including drafts, plus published work from public, discoverable creators),
-- those creators, other creators to follow, and the caller's likes, saves and follows.
create function public.workspace_feed()
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
        )
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

-- Publishes a project with its discipline and tools. The cover photo is added
-- afterwards (Storage only accepts uploads into an existing project's folder).
create function public.create_my_project(project jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('project', 20, 86400);
  insert into public.projects (title, summary, status, visibility, video_url, video_duration)
  values (
    project ->> 'title',
    coalesce(project ->> 'summary', ''),
    coalesce(project ->> 'status', 'completed'),
    'published',
    nullif(project ->> 'videoUrl', ''),
    nullif(project ->> 'duration', '')
  )
  returning id into new_id;
  insert into public.project_categories (project_id, category_id)
  select new_id, c.id from public.categories c
  where c.name in (select jsonb_array_elements_text(coalesce(project -> 'categories', '[]'::jsonb)))
  order by c.sort_order limit 3;
  perform public.set_project_skills(new_id, array(select jsonb_array_elements_text(coalesce(project -> 'tools', '[]'::jsonb))));
  return jsonb_build_object('id', new_id);
end;
$$;

-- Deletes the caller's project and returns its photo paths so the API can remove the files.
create function public.delete_my_project(project uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  paths jsonb;
begin
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into paths
  from public.project_media where project_id = project and owner_id = auth.uid();
  delete from public.projects where id = project and creator_id = auth.uid();
  if not found then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;
  return paths;
end;
$$;

-- Like, save and follow switches. Each returns the new state and count.
create function public.toggle_like(project uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  liked boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('react', 300, 900);
  delete from public.project_likes where user_id = auth.uid() and project_id = project;
  liked := not found;
  if liked then
    insert into public.project_likes (project_id) values (project);
  end if;
  return jsonb_build_object('liked', liked, 'likes', (select like_count from public.projects where id = project));
end;
$$;

create function public.toggle_bookmark(project uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  saved boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('react', 300, 900);
  delete from public.bookmarks where user_id = auth.uid() and project_id = project;
  saved := not found;
  if saved then
    insert into public.bookmarks (project_id) values (project);
  end if;
  return jsonb_build_object('saved', saved, 'saves', (select bookmark_count from public.projects where id = project));
end;
$$;

create function public.toggle_follow(creator uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  is_following boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('react', 300, 900);
  delete from public.follows where follower_id = auth.uid() and following_id = creator;
  is_following := not found;
  if is_following then
    insert into public.follows (following_id) values (creator);
  end if;
  return jsonb_build_object('following', is_following, 'followers', private.follower_count(creator));
end;
$$;

comment on function public.workspace_feed() is 'Workspace Explore: visible projects, creators and the caller''s likes, saves and follows.';
comment on function public.create_my_project(jsonb) is 'Workspace: publish a project with its discipline and tools.';
comment on function public.delete_my_project(uuid) is 'Workspace: delete one of the caller''s projects; returns its photo paths.';
comment on function public.toggle_like(uuid) is 'Workspace: like or unlike a public project.';
comment on function public.toggle_bookmark(uuid) is 'Workspace: save or unsave a public project.';
comment on function public.toggle_follow(uuid) is 'Workspace: follow or unfollow a public creator.';

revoke all on function public.workspace_feed(), public.create_my_project(jsonb), public.delete_my_project(uuid),
  public.toggle_like(uuid), public.toggle_bookmark(uuid), public.toggle_follow(uuid) from public, anon, authenticated;
grant execute on function public.workspace_feed(), public.create_my_project(jsonb), public.delete_my_project(uuid),
  public.toggle_like(uuid), public.toggle_bookmark(uuid), public.toggle_follow(uuid) to authenticated;
