-- Remembers that a creator reached 100% profile completion. The workspace then
-- celebrates once and hides the completion meter for good, even if something is
-- removed later. One-way on purpose: set_my_preferences never clears it.

alter table public.user_preferences add column profile_completed boolean not null default false;
grant update (profile_completed) on public.user_preferences to authenticated;

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
      'profileCompleted', coalesce(u.profile_completed, false)
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
    profile_completed = profile_completed or coalesce((changes ->> 'profileCompleted')::boolean, false)
  where user_id = uid and (changes ?| array['projectNotifications', 'messageNotifications', 'communityNotifications', 'productNotifications', 'profileCompleted']);
  return public.my_profile();
end;
$$;
