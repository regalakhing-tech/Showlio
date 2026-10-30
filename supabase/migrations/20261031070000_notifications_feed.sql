-- Real notifications for the workspace: comments now notify the project's creator,
-- and my_notifications() returns the latest notifications with who did what, plus
-- the follower count for the activity overview, in one call.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'like', 'bookmark', 'comment', 'collaboration_request', 'collaboration_response', 'report_update', 'system'));

create function private.notify_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  wanted boolean;
begin
  select creator_id into recipient from public.projects where id = new.project_id;
  if recipient is null or recipient = new.author_id then
    return null;
  end if;
  select notify_project_activity into wanted from public.user_preferences where user_id = recipient;
  if coalesce(wanted, true) then
    insert into public.notifications (recipient_id, actor_id, type, project_id, body)
    values (recipient, new.author_id, 'comment', new.project_id, left(new.body, 140));
  end if;
  return null;
end;
$$;
create trigger notify after insert on public.project_comments
  for each row execute function private.notify_comment();

-- The caller's latest 100 notifications, newest first. An actor whose profile is
-- private (or a project that is gone) comes back as null.
create function public.my_notifications()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'type', n.type,
        'title', n.title,
        'body', n.body,
        'createdAt', n.created_at,
        'read', n.read_at is not null,
        'saved', n.is_saved,
        'actor', case when a.id is null then null else jsonb_build_object('id', a.id, 'username', a.username, 'name', a.display_name, 'headline', a.headline, 'avatarPath', a.avatar_path) end,
        'project', case when p.id is null then null else jsonb_build_object('id', p.id, 'title', p.title) end
      ) order by n.created_at desc)
      from (
        select * from public.notifications
        where recipient_id = auth.uid()
        order by created_at desc
        limit 100
      ) n
      left join public.profiles a on a.id = n.actor_id
      left join public.projects p on p.id = n.project_id
    ), '[]'::jsonb),
    'followers', private.follower_count(auth.uid())
  );
$$;
comment on function public.my_notifications() is 'Workspace: the caller''s latest notifications and follower count.';

revoke all on function public.my_notifications() from public, anon, authenticated;
grant execute on function public.my_notifications() to authenticated;
