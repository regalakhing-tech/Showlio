-- One round trip each for the workspace profile: read it, save it, flip a
-- settings switch. Saving used to take about ten separate API calls.
--
-- These run as the caller (security invoker), so Row Level Security and the
-- column grants from the initial schema still decide what may change. A save
-- is one transaction: profile, skills and links change together or not at all.

-- Per-creator limit on profile writes, using the same sliding window as sign-in.
-- Raises PT429, which PostgREST turns into HTTP 429 with this message.
create function private.throttle_creator(action text, max_attempts integer, window_seconds integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  wait integer;
begin
  wait := public.auth_attempt(array[action || ':' || auth.uid()::text], array[max_attempts], window_seconds);
  if wait > 0 then
    raise exception 'You’re saving very quickly. Try again in % %.', ceil(wait / 60.0)::integer, case when wait <= 60 then 'minute' else 'minutes' end
      using errcode = 'PT429';
  end if;
end;
$$;

-- The signed-in creator's profile and settings in the workspace's shape, or null.
-- avatarPath is turned into a public URL by the PHP API.
create function public.my_profile()
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
      'productNotifications', coalesce(u.notify_product, false)
    )
  )
  from public.profiles p
  left join public.user_preferences u on u.user_id = p.id
  where p.id = auth.uid();
$$;

-- Saves Settings > Profile, Privacy (public profile) and Social & Links. The PHP
-- API validates first; the table constraints still apply here. avatarPath is
-- only sent after a new photo was uploaded. Returns my_profile() plus the
-- replaced photo's path so the API can delete that file.
create function public.save_my_profile(profile jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  previous_avatar text;
begin
  if uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('profile', 30, 900);
  select avatar_path into previous_avatar from public.profiles where id = uid;
  if not found then
    raise exception 'Your profile isn’t ready yet.' using errcode = 'P0002';
  end if;

  update public.profiles set
    display_name = profile ->> 'name',
    headline = coalesce(profile ->> 'headline', ''),
    bio = coalesce(profile ->> 'bio', ''),
    location_region = coalesce(profile ->> 'location', ''),
    availability = profile ->> 'availability',
    visibility = case when (profile ->> 'visible')::boolean then 'public' else 'private' end,
    avatar_path = case when profile ? 'avatarPath' then profile ->> 'avatarPath' else avatar_path end
  where id = uid;

  perform public.set_profile_skills(array(select jsonb_array_elements_text(coalesce(profile -> 'skills', '[]'::jsonb))));

  delete from public.social_links where profile_id = uid and kind in ('website', 'instagram', 'youtube');
  insert into public.social_links (kind, url, sort_order)
  select kinds.kind, link.url, (row_number() over (order by kinds.position) - 1)::smallint
  from (values ('website', 1), ('instagram', 2), ('youtube', 3)) as kinds (kind, position),
    lateral (select profile -> 'links' ->> kinds.kind as url) as link
  where coalesce(link.url, '') <> '';

  return public.my_profile() || jsonb_build_object(
    'previousAvatarPath', case when profile ? 'avatarPath' and previous_avatar is distinct from profile ->> 'avatarPath' then previous_avatar end
  );
end;
$$;

-- Settings switches that save immediately. Only keys present in changes are touched.
create function public.set_my_preferences(changes jsonb)
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
    notify_product = coalesce((changes ->> 'productNotifications')::boolean, notify_product)
  where user_id = uid and (changes ?| array['projectNotifications', 'messageNotifications', 'communityNotifications', 'productNotifications']);
  return public.my_profile();
end;
$$;

comment on function public.my_profile() is 'Workspace: the signed-in creator''s profile and settings.';
comment on function public.save_my_profile(jsonb) is 'Workspace: save profile, skills and links in one transaction.';
comment on function public.set_my_preferences(jsonb) is 'Workspace: change settings switches.';

revoke all on function private.throttle_creator(text, integer, integer) from public;
grant execute on function private.throttle_creator(text, integer, integer) to authenticated;
revoke all on function public.my_profile(), public.save_my_profile(jsonb), public.set_my_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.my_profile(), public.save_my_profile(jsonb), public.set_my_preferences(jsonb) to authenticated;
