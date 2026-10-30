-- Comments on projects: anyone who can see a project can read its comments; signed-in
-- members can comment on public projects (and their own); authors and the project's
-- creator can delete a comment. The project keeps a comment_count for the cards.

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body = btrim(body)),
  created_at timestamptz not null default now()
);
create index project_comments_project_idx on public.project_comments (project_id, created_at);
create index project_comments_author_idx on public.project_comments (author_id);
comment on table public.project_comments is 'Comments on projects. Written through add_project_comment().';

alter table public.projects add column comment_count integer not null default 0 check (comment_count >= 0);

create function private.bump_comment_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.projects
  set comment_count = greatest(comment_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
  where id = case when tg_op = 'INSERT' then new.project_id else old.project_id end;
  return null;
end;
$$;
create trigger bump_comment_count after insert or delete on public.project_comments
  for each row execute function private.bump_comment_count();

alter table public.project_comments enable row level security;
create policy "Comments of visible projects" on public.project_comments
  for select to anon, authenticated
  using (private.project_is_public(project_id) or private.owns_project(project_id) or author_id = (select auth.uid()));
create policy "Members comment on public projects" on public.project_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (private.project_is_public(project_id) or private.owns_project(project_id)));
create policy "Authors and creators delete comments" on public.project_comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or private.owns_project(project_id));

grant select on public.project_comments to anon, authenticated;
grant insert (project_id, body), delete on public.project_comments to authenticated;

-- A project's comments with their authors, oldest first. A private author shows as a member.
create function public.project_comments_list(project uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'body', c.body,
    'createdAt', c.created_at,
    'authorId', c.author_id,
    'username', a.username,
    'name', coalesce(a.display_name, 'Showlio member'),
    'avatarPath', a.avatar_path,
    'mine', c.author_id = auth.uid(),
    'canDelete', c.author_id = auth.uid() or private.owns_project(c.project_id)
  ) order by c.created_at), '[]'::jsonb)
  from public.project_comments c
  left join public.profiles a on a.id = c.author_id
  where c.project_id = project;
$$;

create function public.add_project_comment(project uuid, body text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('comment', 60, 900);
  insert into public.project_comments (project_id, body) values (project, btrim(body)) returning id into new_id;
  return (select item from jsonb_array_elements(public.project_comments_list(project)) as item where item ->> 'id' = new_id::text);
end;
$$;

create function public.delete_project_comment(comment uuid)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  delete from public.project_comments where id = comment;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.project_comments_list(uuid), public.add_project_comment(uuid, text), public.delete_project_comment(uuid) from public, anon, authenticated;
grant execute on function public.project_comments_list(uuid), public.add_project_comment(uuid, text), public.delete_project_comment(uuid) to authenticated;

-- The feed now carries each project's comment count.
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
        'avatarPath', c.avatar_path, 'followers', private.follower_count(c.id)
      ))
      from creators c
    ), '[]'::jsonb),
    'likes', coalesce((select jsonb_agg(project_id) from public.project_likes where user_id = auth.uid()), '[]'::jsonb),
    'bookmarks', coalesce((select jsonb_agg(project_id) from public.bookmarks where user_id = auth.uid()), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(following_id) from public.follows where follower_id = auth.uid()), '[]'::jsonb)
  );
$$;
