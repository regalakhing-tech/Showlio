-- Showlio initial schema: tables, constraints, indexes, triggers, RPCs, RLS,
-- table privileges and Storage buckets/policies.
--
-- Access model
--   * Identities live in auth.users; public.profiles is created by a trigger.
--   * Every exposed table has RLS. Clients use the publishable key plus the
--     signed-in user's access token; no elevated key is needed for CRUD.
--   * Table privileges are explicit and column-scoped, so clients can never
--     write moderation fields, counters or timestamps.
--   * Helper functions live in the unexposed `private` schema.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared types
-- ---------------------------------------------------------------------------

create domain public.https_url as text
  check (char_length(value) <= 500 and value ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$');

create domain public.slug as text
  check (char_length(value) <= 80 and value ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.categories (
  id smallint generated always as identity primary key,
  slug public.slug not null unique,
  name text not null unique check (char_length(name) between 1 and 40),
  sort_order smallint not null default 0
);
comment on table public.categories is 'Talent categories used by profiles and projects.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 60 and display_name = btrim(display_name)),
  headline text not null default '' check (char_length(headline) <= 100),
  bio text not null default '' check (char_length(bio) <= 500),
  category_id smallint references public.categories (id) on delete set null,
  location_region text not null default '' check (char_length(location_region) <= 100),
  avatar_path text check (char_length(avatar_path) <= 300 and avatar_path like id::text || '/%'),
  availability text not null default 'available' check (availability in ('available', 'unavailable', 'showcasing')),
  show_availability boolean not null default true,
  visibility text not null default 'draft' check (visibility in ('draft', 'public', 'private')),
  discoverable boolean not null default true,
  published_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 500),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', display_name), 'A') ||
    setweight(to_tsvector('simple', username), 'A') ||
    setweight(to_tsvector('simple', headline), 'B') ||
    setweight(to_tsvector('simple', bio), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Public creator profile, one per auth user. Visible to guests only when visibility = public and not hidden by a moderator.';
comment on column public.profiles.location_region is 'Broad city/province only. Never a street address.';
comment on column public.profiles.hidden_at is 'Set by moderators through moderate_content(); owners cannot change it.';

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  notify_project_activity boolean not null default true,
  notify_messages boolean not null default true,
  notify_community boolean not null default true,
  notify_product boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.user_preferences is 'Private notification preferences. Owner-only.';

create table public.skills (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  created_at timestamptz not null default now()
);
create unique index skills_name_key on public.skills (lower(name));
comment on table public.skills is 'Normalized skill and tool names, unique case-insensitively. Written through set_profile_skills()/set_project_skills().';

create table public.profile_skills (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id bigint not null references public.skills (id) on delete cascade,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);
create index profile_skills_skill_id_idx on public.profile_skills (skill_id);

create table public.social_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('website', 'instagram', 'youtube', 'github', 'linkedin', 'behance', 'dribbble', 'x', 'tiktok', 'other')),
  label text not null default '' check (char_length(label) <= 40),
  url public.https_url not null,
  is_public boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, kind, url)
);
comment on table public.social_links is 'Creator-chosen public contact and work links.';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  slug public.slug not null,
  title text not null check (char_length(title) between 1 and 80 and title = btrim(title)),
  summary text not null default '' check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 5000),
  contribution text not null default '' check (char_length(contribution) <= 300),
  status text not null default 'completed' check (status in ('completed', 'in_progress')),
  visibility text not null default 'draft' check (visibility in ('draft', 'published')),
  project_date date,
  demo_url public.https_url,
  repo_url public.https_url,
  video_url public.https_url,
  video_duration text check (video_duration ~ '^[0-9]{1,2}:[0-5][0-9]$'),
  like_count integer not null default 0 check (like_count >= 0),
  bookmark_count integer not null default 0 check (bookmark_count >= 0),
  view_count bigint not null default 0 check (view_count >= 0),
  published_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 500),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', title), 'A') ||
    setweight(to_tsvector('simple', summary), 'B') ||
    setweight(to_tsvector('simple', contribution), 'C') ||
    setweight(to_tsvector('simple', description), 'D')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, slug)
);
comment on table public.projects is 'Creator work samples. Public only when published, not hidden, and the creator profile is public.';
comment on column public.projects.video_url is 'Externally hosted video link. Showlio does not host video files.';

create table public.project_categories (
  project_id uuid not null references public.projects (id) on delete cascade,
  category_id smallint not null references public.categories (id) on delete cascade,
  primary key (project_id, category_id)
);
create index project_categories_category_id_idx on public.project_categories (category_id);

create table public.project_skills (
  project_id uuid not null references public.projects (id) on delete cascade,
  skill_id bigint not null references public.skills (id) on delete cascade,
  sort_order smallint not null default 0,
  primary key (project_id, skill_id)
);
create index project_skills_skill_id_idx on public.project_skills (skill_id);

create table public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300 and storage_path like owner_id::text || '/' || project_id::text || '/%'),
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  width integer check (width > 0),
  height integer check (height > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index project_media_project_id_idx on public.project_media (project_id, sort_order);
create index project_media_owner_id_idx on public.project_media (owner_id);
comment on table public.project_media is 'Image metadata. Bytes live in the private project-media bucket at {owner_id}/{project_id}/{file}.';

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_id_idx on public.follows (following_id);

create table public.project_likes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index project_likes_project_id_idx on public.project_likes (project_id);

create table public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index bookmarks_project_id_idx on public.bookmarks (project_id);
comment on table public.bookmarks is 'Private saved projects. Only the saver can read them.';

create table public.collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  project_title text not null check (char_length(project_title) between 1 and 120),
  message text not null default '' check (char_length(message) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 5 and char_length(array_to_string(tags, '')) <= 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index collaboration_requests_one_pending_idx on public.collaboration_requests (sender_id, recipient_id) where status = 'pending';
create index collaboration_requests_recipient_idx on public.collaboration_requests (recipient_id, created_at desc);
create index collaboration_requests_sender_idx on public.collaboration_requests (sender_id, created_at desc);
comment on table public.collaboration_requests is 'Opt-in collaboration invitations. Only sender and recipient can read them; recipients must be open to collaborate.';

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'project', 'portfolio')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'impersonation', 'inappropriate', 'harassment', 'intellectual_property', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text check (char_length(resolution_note) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index content_reports_one_open_idx on public.content_reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');
create index content_reports_queue_idx on public.content_reports (status, created_at);
create index content_reports_target_idx on public.content_reports (target_type, target_id);
create index content_reports_resolved_by_idx on public.content_reports (resolved_by);
comment on column public.content_reports.target_id is 'profiles.id, projects.id, or published_portfolios.owner_id depending on target_type.';

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('profile', 'project', 'portfolio')),
  target_id uuid not null,
  action text not null check (action in ('hide', 'unhide')),
  reason text not null default '' check (char_length(reason) <= 500),
  report_id uuid references public.content_reports (id) on delete set null,
  created_at timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at desc);
create index moderation_actions_moderator_id_idx on public.moderation_actions (moderator_id);
create index moderation_actions_report_id_idx on public.moderation_actions (report_id);
comment on table public.moderation_actions is 'Audit log written only by moderate_content().';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in ('follow', 'like', 'bookmark', 'collaboration_request', 'collaboration_response', 'report_update', 'system')),
  project_id uuid references public.projects (id) on delete cascade,
  request_id uuid references public.collaboration_requests (id) on delete cascade,
  report_id uuid references public.content_reports (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 500),
  is_saved boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_actor_id_idx on public.notifications (actor_id);
create index notifications_project_id_idx on public.notifications (project_id);
create index notifications_request_id_idx on public.notifications (request_id);
create index notifications_report_id_idx on public.notifications (report_id);
comment on table public.notifications is 'Written by triggers only. Recipients can read, mark read/saved and delete.';

create table public.ai_imports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source_url public.https_url not null,
  ownership_confirmed boolean not null check (ownership_confirmed),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  suggested_fields jsonb check (jsonb_typeof(suggested_fields) = 'object' and pg_column_size(suggested_fields) <= 65536),
  error_code text check (char_length(error_code) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index ai_imports_profile_idx on public.ai_imports (profile_id, created_at desc);
create index ai_imports_expires_at_idx on public.ai_imports (expires_at);
comment on table public.ai_imports is 'Owner-only website import suggestions. Never auto-published; purged after expires_at.';

create table public.portfolio_drafts (
  owner_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  content jsonb not null default '{}' check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 262144),
  updated_at timestamptz not null default now()
);
comment on table public.portfolio_drafts is 'Unpublished portfolio builder state. Owner-only.';

create table public.published_portfolios (
  owner_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  slug public.slug not null unique,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 262144),
  media_paths text[] not null default '{}' check (cardinality(media_paths) <= 60),
  published_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 500),
  updated_at timestamptz not null default now()
);
comment on table public.published_portfolios is 'Public portfolio snapshot served at /portfolio/view/?slug. media_paths lists the portfolio-media objects guests may read.';

create table private.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  created_at timestamptz not null default now()
);
alter table private.user_roles enable row level security;
comment on table private.user_roles is 'Internal staff roles. Grant with SQL only; never exposed through the Data API.';

-- ---------------------------------------------------------------------------
-- Helper functions (private, used by policies and triggers)
-- ---------------------------------------------------------------------------

create function private.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.user_roles where user_id = auth.uid());
$$;

create function private.profile_is_public(profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = profile_id and visibility = 'public' and hidden_at is null
  );
$$;

create function private.project_is_public(project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    join public.profiles c on c.id = p.creator_id
    where p.id = project_id and p.visibility = 'published' and p.hidden_at is null
      and c.visibility = 'public' and c.hidden_at is null
  );
$$;

create function private.owns_project(project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects where id = project_id and creator_id = auth.uid());
$$;

create function private.accepts_collaboration(profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = profile_id and visibility = 'public' and hidden_at is null and availability = 'available'
  );
$$;

create function private.report_target_exists(target_type text, target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case target_type
    when 'profile' then private.profile_is_public(target_id)
    when 'project' then private.project_is_public(target_id)
    when 'portfolio' then exists (select 1 from public.published_portfolios where owner_id = target_id and hidden_at is null)
    else false
  end;
$$;

-- Storage paths: project-media/{owner}/{project}/{file}, portfolio-media/{owner}/{file}.
create function private.owns_project_folder(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := storage.foldername(object_name);
begin
  if coalesce(array_length(parts, 1), 0) <> 2 or parts[1] is distinct from auth.uid()::text
     or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (select 1 from public.projects where id = parts[2]::uuid and creator_id = auth.uid());
end;
$$;

create function private.can_read_project_media(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_media m
    where m.storage_path = object_name and private.project_is_public(m.project_id)
  );
$$;

create function private.can_read_portfolio_media(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.published_portfolios p
    where p.owner_id::text = (storage.foldername(object_name))[1]
      and object_name = any (p.media_paths) and p.hidden_at is null
  );
$$;

create function private.slugify(value text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from left(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), 60)), ''), 'project');
$$;

-- ---------------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- New auth user -> profile + preferences. Must never block sign-up, so an
-- invalid or taken username falls back to a unique generated one.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested text := regexp_replace(lower(coalesce(meta ->> 'username', '')), '[^a-z0-9_]', '', 'g');
  fallback text := left(coalesce(nullif(requested, ''), 'user'), 11) || '_' || left(replace(new.id::text, '-', ''), 8);
  chosen text := fallback;
  name text := btrim(coalesce(nullif(btrim(meta ->> 'full_name'), ''), nullif(btrim(meta ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)));
begin
  if requested ~ '^[a-z0-9_]{3,20}$' and not exists (select 1 from public.profiles where username = requested) then
    chosen := requested;
  end if;
  name := btrim(left(coalesce(nullif(name, ''), chosen), 60));
  begin
    insert into public.profiles (id, username, display_name) values (new.id, chosen, name);
  exception when unique_violation then
    insert into public.profiles (id, username, display_name) values (new.id, fallback, name);
  end;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create function private.profiles_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.visibility = 'public' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create function private.projects_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if tg_op = 'INSERT' and new.slug is null then
    base := private.slugify(new.title);
    candidate := base;
    while exists (select 1 from public.projects where creator_id = new.creator_id and slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    new.slug := candidate;
  end if;
  if new.visibility = 'published' and (tg_op = 'INSERT' or old.visibility <> 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create function private.published_portfolios_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.content is distinct from old.content or new.slug is distinct from old.slug then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Per-parent row caps: tg_argv = (parent column, maximum rows).
create function private.enforce_child_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  existing integer;
begin
  execute format('select count(*) from %I.%I where %I = $1', tg_table_schema, tg_table_name, tg_argv[0])
    into existing using parent_id;
  if existing >= tg_argv[1]::integer then
    raise exception 'Limit reached: at most % % per item.', tg_argv[1], replace(tg_table_name, '_', ' ')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Rolling 24-hour caps per user: tg_argv = (owner column, maximum rows).
create function private.enforce_daily_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  recent integer;
begin
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - interval ''1 day''',
    tg_table_schema, tg_table_name, tg_argv[0]) into recent using owner_id;
  if recent >= tg_argv[1]::integer then
    raise exception 'Daily limit reached. Please try again tomorrow.' using errcode = '54000';
  end if;
  return new;
end;
$$;

create function private.bump_project_counter()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  target uuid := case when tg_op = 'INSERT' then new.project_id else old.project_id end;
begin
  if tg_table_name = 'project_likes' then
    update public.projects set like_count = greatest(like_count + delta, 0) where id = target;
  else
    update public.projects set bookmark_count = greatest(bookmark_count + delta, 0) where id = target;
  end if;
  return null;
end;
$$;

create function private.notify_on_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  actor uuid;
  kind text;
  project uuid;
  wanted boolean;
begin
  if tg_table_name = 'follows' then
    recipient := new.following_id; actor := new.follower_id; kind := 'follow';
  else
    select creator_id into recipient from public.projects where id = new.project_id;
    actor := new.user_id; project := new.project_id;
    kind := case tg_table_name when 'project_likes' then 'like' else 'bookmark' end;
  end if;
  if recipient is null or recipient = actor then
    return null;
  end if;
  select case when kind = 'follow' then notify_community else notify_project_activity end
    into wanted from public.user_preferences where user_id = recipient;
  -- Skip repeats from quick unlike/like toggles.
  if coalesce(wanted, true) and not exists (
    select 1 from public.notifications
    where recipient_id = recipient and actor_id = actor and type = kind
      and project_id is not distinct from project and created_at > now() - interval '1 day'
  ) then
    insert into public.notifications (recipient_id, actor_id, type, project_id) values (recipient, actor, kind, project);
  end if;
  return null;
end;
$$;

create function private.collaboration_before_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'This request has already been answered.' using errcode = '22023';
    end if;
    if uid is not null and new.status in ('accepted', 'declined') and uid <> old.recipient_id then
      raise exception 'Only the recipient can answer this request.' using errcode = '42501';
    end if;
    if uid is not null and new.status = 'withdrawn' and uid <> old.sender_id then
      raise exception 'Only the sender can withdraw this request.' using errcode = '42501';
    end if;
    new.responded_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function private.notify_collaboration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  wanted boolean;
begin
  if tg_op = 'INSERT' then
    select notify_messages into wanted from public.user_preferences where user_id = new.recipient_id;
    if coalesce(wanted, true) then
      insert into public.notifications (recipient_id, actor_id, type, request_id, title)
      values (new.recipient_id, new.sender_id, 'collaboration_request', new.id, left(new.project_title, 120));
    end if;
  elsif new.status in ('accepted', 'declined') and old.status = 'pending' then
    select notify_messages into wanted from public.user_preferences where user_id = new.sender_id;
    if coalesce(wanted, true) then
      insert into public.notifications (recipient_id, actor_id, type, request_id, title, body)
      values (new.sender_id, new.recipient_id, 'collaboration_response', new.id, left(new.project_title, 120), new.status);
    end if;
  end if;
  return null;
end;
$$;

create function private.content_reports_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    new.resolved_at := now();
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function private.notify_report_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    insert into public.notifications (recipient_id, type, report_id, title, body)
    values (
      new.reporter_id, 'report_update', new.id, 'Your report was reviewed',
      case new.status
        when 'resolved' then 'Thanks for reporting. We reviewed the content and took action.'
        else 'Thanks for reporting. We reviewed the content and found no policy violation.'
      end
    );
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger profiles_before_update before update on public.profiles
  for each row execute function private.profiles_before_update();
create trigger set_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();
create trigger projects_before_write before insert or update on public.projects
  for each row execute function private.projects_before_write();
-- Listed columns only, so counter updates from likes/views keep updated_at.
create trigger set_updated_at
  before update of slug, title, summary, description, contribution, status, visibility, project_date,
    demo_url, repo_url, video_url, video_duration, hidden_at
  on public.projects
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.ai_imports
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.portfolio_drafts
  for each row execute function private.set_updated_at();
create trigger published_portfolios_before_update before update on public.published_portfolios
  for each row execute function private.published_portfolios_before_update();
create trigger collaboration_before_update before update on public.collaboration_requests
  for each row execute function private.collaboration_before_update();
create trigger content_reports_before_update before update on public.content_reports
  for each row execute function private.content_reports_before_update();

create trigger enforce_limit before insert on public.project_categories
  for each row execute function private.enforce_child_limit('project_id', '3');
create trigger enforce_limit before insert on public.project_media
  for each row execute function private.enforce_child_limit('project_id', '10');
create trigger enforce_limit before insert on public.social_links
  for each row execute function private.enforce_child_limit('profile_id', '10');
create trigger enforce_limit before insert on public.projects
  for each row execute function private.enforce_child_limit('creator_id', '100');

create trigger enforce_daily_limit before insert on public.collaboration_requests
  for each row execute function private.enforce_daily_limit('sender_id', '20');
create trigger enforce_daily_limit before insert on public.content_reports
  for each row execute function private.enforce_daily_limit('reporter_id', '20');
create trigger enforce_daily_limit before insert on public.ai_imports
  for each row execute function private.enforce_daily_limit('profile_id', '10');

create trigger bump_counter after insert or delete on public.project_likes
  for each row execute function private.bump_project_counter();
create trigger bump_counter after insert or delete on public.bookmarks
  for each row execute function private.bump_project_counter();

create trigger notify after insert on public.follows
  for each row execute function private.notify_on_activity();
create trigger notify after insert on public.project_likes
  for each row execute function private.notify_on_activity();
create trigger notify after insert on public.bookmarks
  for each row execute function private.notify_on_activity();
create trigger notify after insert or update of status on public.collaboration_requests
  for each row execute function private.notify_collaboration();
create trigger notify after update of status on public.content_reports
  for each row execute function private.notify_report_update();

-- ---------------------------------------------------------------------------
-- RPCs (public, callable through /rest/v1/rpc)
-- ---------------------------------------------------------------------------

create function public.username_available(candidate text)
returns boolean language sql stable security definer set search_path = '' as $$
  select candidate ~ '^[a-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles where username = candidate);
$$;
comment on function public.username_available(text) is 'Sign-up helper: true when the username is valid and unused.';

create function private.upsert_skills(names text[])
returns table (skill_id bigint, sort_order integer) language plpgsql security definer set search_path = '' as $$
declare
  cleaned text[];
begin
  select coalesce(array_agg(name order by first_position), '{}') into cleaned
  from (
    select distinct on (lower(btrim(n))) btrim(n) as name, ord as first_position
    from unnest(coalesce(names, '{}')) with ordinality as t (n, ord)
    where btrim(n) <> ''
    order by lower(btrim(n)), ord
  ) unique_names;
  if cardinality(cleaned) > 15 then
    raise exception 'Use up to 15 skills.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(cleaned) as n where char_length(n) > 40) then
    raise exception 'Each skill must be 40 characters or fewer.' using errcode = '22023';
  end if;
  insert into public.skills (name) select n from unnest(cleaned) as n
  on conflict ((lower(name))) do nothing;
  return query
    select s.id, t.ord::integer
    from unnest(cleaned) with ordinality as t (n, ord)
    join public.skills s on lower(s.name) = lower(t.n);
end;
$$;

create function public.set_profile_skills(skill_names text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to edit skills.' using errcode = '42501';
  end if;
  delete from public.profile_skills where profile_id = uid;
  insert into public.profile_skills (profile_id, skill_id, sort_order)
  select uid, u.skill_id, u.sort_order from private.upsert_skills(skill_names) u;
end;
$$;
comment on function public.set_profile_skills(text[]) is 'Replace the signed-in creator''s skills (max 15, 40 chars each), keeping order.';

create function public.set_project_skills(project_id uuid, skill_names text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_project(project_id) then
    raise exception 'You can only edit your own projects.' using errcode = '42501';
  end if;
  delete from public.project_skills ps where ps.project_id = set_project_skills.project_id;
  insert into public.project_skills (project_id, skill_id, sort_order)
  select set_project_skills.project_id, u.skill_id, u.sort_order from private.upsert_skills(skill_names) u;
end;
$$;
comment on function public.set_project_skills(uuid, text[]) is 'Replace a project''s skills/tools (owner only, max 15).';

create function public.record_project_view(project_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.projects p set view_count = p.view_count + 1
  where p.id = record_project_view.project_id and private.project_is_public(p.id);
$$;
comment on function public.record_project_view(uuid) is 'Increment the public view counter. Not de-duplicated; display only.';

create function public.moderate_content(target_type text, target_id uuid, action text, reason text default '', report_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  hide boolean := action = 'hide';
begin
  if not private.is_moderator() then
    raise exception 'Moderator access required.' using errcode = '42501';
  end if;
  if action not in ('hide', 'unhide') then
    raise exception 'Unknown action.' using errcode = '22023';
  end if;
  if target_type = 'profile' then
    update public.profiles set hidden_at = case when hide then now() end, hidden_reason = case when hide then left(moderate_content.reason, 500) end
    where id = target_id;
  elsif target_type = 'project' then
    update public.projects set hidden_at = case when hide then now() end, hidden_reason = case when hide then left(moderate_content.reason, 500) end
    where id = target_id;
  elsif target_type = 'portfolio' then
    update public.published_portfolios set hidden_at = case when hide then now() end, hidden_reason = case when hide then left(moderate_content.reason, 500) end
    where owner_id = target_id;
  else
    raise exception 'Unknown target type.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Content not found.' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (moderator_id, target_type, target_id, action, reason, report_id)
  values (auth.uid(), target_type, target_id, action, left(coalesce(reason, ''), 500), report_id);
  if report_id is not null then
    update public.content_reports r set status = 'resolved', resolution_note = left(moderate_content.reason, 1000)
    where r.id = moderate_content.report_id and r.status in ('open', 'reviewing');
  end if;
end;
$$;
comment on function public.moderate_content(text, uuid, text, text, uuid) is 'Moderators: hide or unhide a profile, project or portfolio, log it, and resolve the linked report.';

-- ---------------------------------------------------------------------------
-- Discovery views (security_invoker: callers'' RLS applies)
-- ---------------------------------------------------------------------------

create view public.creator_cards with (security_invoker = true) as
select
  p.id, p.username, p.display_name, p.headline, p.bio, p.location_region, p.avatar_path,
  c.slug as category_slug, c.name as category_name,
  p.availability, p.show_availability,
  coalesce(s.skills, '{}') as skills,
  coalesce(s.skill_keys, '{}') as skill_keys,
  coalesce(pc.public_project_count, 0) as public_project_count,
  p.published_at, p.search_vector
from public.profiles p
left join public.categories c on c.id = p.category_id
left join lateral (
  select array_agg(sk.name order by ps.sort_order) as skills, array_agg(lower(sk.name) order by ps.sort_order) as skill_keys
  from public.profile_skills ps join public.skills sk on sk.id = ps.skill_id
  where ps.profile_id = p.id
) s on true
left join lateral (
  select count(*)::integer as public_project_count from public.projects pr
  where pr.creator_id = p.id and pr.visibility = 'published' and pr.hidden_at is null
) pc on true
where p.visibility = 'public' and p.hidden_at is null and p.discoverable;
comment on view public.creator_cards is 'Discover page cards: public, discoverable creators with skills and public project count.';

create view public.project_cards with (security_invoker = true) as
select
  pr.id, pr.slug, pr.title, pr.summary, pr.status, pr.project_date, pr.video_url, pr.video_duration,
  pr.like_count, pr.bookmark_count, pr.view_count, pr.published_at,
  pr.creator_id, p.username as creator_username, p.display_name as creator_name, p.avatar_path as creator_avatar_path,
  coalesce(cat.categories, '{}') as categories,
  coalesce(cat.category_slugs, '{}') as category_slugs,
  coalesce(sk.skills, '{}') as skills,
  coalesce(sk.skill_keys, '{}') as skill_keys,
  m.storage_path as cover_path, m.alt_text as cover_alt,
  pr.search_vector
from public.projects pr
join public.profiles p on p.id = pr.creator_id
left join lateral (
  select array_agg(c.name order by c.sort_order) as categories, array_agg(c.slug::text order by c.sort_order) as category_slugs
  from public.project_categories pc join public.categories c on c.id = pc.category_id
  where pc.project_id = pr.id
) cat on true
left join lateral (
  select array_agg(s.name order by ps.sort_order) as skills, array_agg(lower(s.name) order by ps.sort_order) as skill_keys
  from public.project_skills ps join public.skills s on s.id = ps.skill_id
  where ps.project_id = pr.id
) sk on true
left join lateral (
  select pm.storage_path, pm.alt_text from public.project_media pm
  where pm.project_id = pr.id order by pm.sort_order, pm.created_at limit 1
) m on true
where pr.visibility = 'published' and pr.hidden_at is null
  and p.visibility = 'public' and p.hidden_at is null and p.discoverable;
comment on view public.project_cards is 'Explore feed cards: public projects with creator, categories, skills and cover image path.';

create index profiles_discovery_idx on public.profiles (published_at desc) where visibility = 'public' and hidden_at is null;
create index profiles_category_id_idx on public.profiles (category_id);
create index profiles_search_idx on public.profiles using gin (search_vector);
create index projects_feed_idx on public.projects (published_at desc) where visibility = 'published' and hidden_at is null;
create index projects_popular_idx on public.projects (like_count desc) where visibility = 'published' and hidden_at is null;
create index projects_search_idx on public.projects using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.skills enable row level security;
alter table public.profile_skills enable row level security;
alter table public.social_links enable row level security;
alter table public.projects enable row level security;
alter table public.project_categories enable row level security;
alter table public.project_skills enable row level security;
alter table public.project_media enable row level security;
alter table public.follows enable row level security;
alter table public.project_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.collaboration_requests enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_imports enable row level security;
alter table public.portfolio_drafts enable row level security;
alter table public.published_portfolios enable row level security;

create policy "Categories are public" on public.categories
  for select to anon, authenticated using (true);
create policy "Skills are public" on public.skills
  for select to anon, authenticated using (true);

create policy "Public profiles, own profile and moderators" on public.profiles
  for select to anon, authenticated
  using ((visibility = 'public' and hidden_at is null) or id = (select auth.uid()) or (select private.is_moderator()));
create policy "Owners update their profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Owners read their preferences" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners update their preferences" on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Skills of visible profiles" on public.profile_skills
  for select to anon, authenticated
  using (private.profile_is_public(profile_id) or profile_id = (select auth.uid()) or (select private.is_moderator()));

create policy "Public links of visible profiles" on public.social_links
  for select to anon, authenticated
  using ((is_public and private.profile_is_public(profile_id)) or profile_id = (select auth.uid()) or (select private.is_moderator()));
create policy "Owners add links" on public.social_links
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "Owners update links" on public.social_links
  for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "Owners delete links" on public.social_links
  for delete to authenticated using (profile_id = (select auth.uid()));

create policy "Public projects, own projects and moderators" on public.projects
  for select to anon, authenticated
  using (
    (visibility = 'published' and hidden_at is null and private.profile_is_public(creator_id))
    or creator_id = (select auth.uid()) or (select private.is_moderator())
  );
create policy "Creators add projects" on public.projects
  for insert to authenticated with check (creator_id = (select auth.uid()));
create policy "Creators update projects" on public.projects
  for update to authenticated
  using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));
create policy "Creators delete projects" on public.projects
  for delete to authenticated using (creator_id = (select auth.uid()));

create policy "Categories of visible projects" on public.project_categories
  for select to anon, authenticated
  using (private.project_is_public(project_id) or private.owns_project(project_id) or (select private.is_moderator()));
create policy "Creators add project categories" on public.project_categories
  for insert to authenticated with check (private.owns_project(project_id));
create policy "Creators remove project categories" on public.project_categories
  for delete to authenticated using (private.owns_project(project_id));

create policy "Skills of visible projects" on public.project_skills
  for select to anon, authenticated
  using (private.project_is_public(project_id) or private.owns_project(project_id) or (select private.is_moderator()));

create policy "Media of visible projects" on public.project_media
  for select to anon, authenticated
  using (private.project_is_public(project_id) or owner_id = (select auth.uid()) or (select private.is_moderator()));
create policy "Creators add project media" on public.project_media
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.owns_project(project_id));
create policy "Creators update project media" on public.project_media
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Creators delete project media" on public.project_media
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Users see their own follows and followers" on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));
create policy "Users follow public creators" on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()) and private.profile_is_public(following_id));
create policy "Users unfollow" on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

create policy "Users see their likes" on public.project_likes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users like public projects" on public.project_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.project_is_public(project_id));
create policy "Users remove likes" on public.project_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Users see their bookmarks" on public.bookmarks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users bookmark public projects" on public.bookmarks
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.project_is_public(project_id));
create policy "Users remove bookmarks" on public.bookmarks
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Participants read requests" on public.collaboration_requests
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "Users invite creators open to collaborate" on public.collaboration_requests
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and status = 'pending' and private.accepts_collaboration(recipient_id));
create policy "Participants answer or withdraw requests" on public.collaboration_requests
  for update to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy "Reporters and moderators read reports" on public.content_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_moderator()));
create policy "Users report visible content" on public.content_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and private.report_target_exists(target_type, target_id));
create policy "Moderators update reports" on public.content_reports
  for update to authenticated
  using ((select private.is_moderator())) with check ((select private.is_moderator()));

create policy "Moderators read the moderation log" on public.moderation_actions
  for select to authenticated using ((select private.is_moderator()));

create policy "Recipients read notifications" on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy "Recipients mark notifications" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "Recipients delete notifications" on public.notifications
  for delete to authenticated using (recipient_id = (select auth.uid()));

create policy "Owners read unexpired imports" on public.ai_imports
  for select to authenticated using (profile_id = (select auth.uid()) and expires_at > now());
create policy "Owners start imports" on public.ai_imports
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "Owners update imports" on public.ai_imports
  for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "Owners delete imports" on public.ai_imports
  for delete to authenticated using (profile_id = (select auth.uid()));

create policy "Owners read their portfolio draft" on public.portfolio_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners create their portfolio draft" on public.portfolio_drafts
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners update their portfolio draft" on public.portfolio_drafts
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete their portfolio draft" on public.portfolio_drafts
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Published portfolios are public unless hidden" on public.published_portfolios
  for select to anon, authenticated
  using (hidden_at is null or owner_id = (select auth.uid()) or (select private.is_moderator()));
create policy "Owners publish their portfolio" on public.published_portfolios
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners republish their portfolio" on public.published_portfolios
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners unpublish their portfolio" on public.published_portfolios
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges: explicit and column-scoped (RLS decides which rows)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.categories, public.skills, public.profiles, public.profile_skills, public.social_links,
  public.projects, public.project_categories, public.project_skills, public.project_media,
  public.published_portfolios, public.creator_cards, public.project_cards
  to anon, authenticated;

grant update (username, display_name, headline, bio, category_id, location_region, avatar_path,
  availability, show_availability, visibility, discoverable) on public.profiles to authenticated;

grant select on public.user_preferences to authenticated;
grant update (notify_project_activity, notify_messages, notify_community, notify_product) on public.user_preferences to authenticated;

grant insert (kind, label, url, is_public, sort_order), update (kind, label, url, is_public, sort_order), delete
  on public.social_links to authenticated;

grant insert (slug, title, summary, description, contribution, status, visibility, project_date, demo_url, repo_url, video_url, video_duration),
  update (slug, title, summary, description, contribution, status, visibility, project_date, demo_url, repo_url, video_url, video_duration),
  delete on public.projects to authenticated;

grant insert (project_id, category_id), delete on public.project_categories to authenticated;

grant insert (project_id, storage_path, alt_text, width, height, sort_order), update (alt_text, sort_order, width, height), delete
  on public.project_media to authenticated;

grant select, insert (following_id), delete on public.follows to authenticated;
grant select, insert (project_id), delete on public.project_likes to authenticated;
grant select, insert (project_id), delete on public.bookmarks to authenticated;

grant select, insert (recipient_id, project_title, message, tags), update (status) on public.collaboration_requests to authenticated;

grant select, insert (target_type, target_id, reason, details), update (status, resolution_note) on public.content_reports to authenticated;

grant select on public.moderation_actions to authenticated;

grant select, update (read_at, is_saved), delete on public.notifications to authenticated;

grant select, insert (source_url, ownership_confirmed), update (status, suggested_fields, error_code), delete
  on public.ai_imports to authenticated;

grant select, insert (content), update (content), delete on public.portfolio_drafts to authenticated;

grant insert (slug, content, media_paths), update (slug, content, media_paths), delete on public.published_portfolios to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text), public.record_project_view(uuid) to anon, authenticated;
grant execute on function public.set_profile_skills(text[]), public.set_project_skills(uuid, text[]),
  public.moderate_content(text, uuid, text, text, uuid) to authenticated;

revoke all on all functions in schema private from public;
grant execute on function private.is_moderator(), private.profile_is_public(uuid), private.project_is_public(uuid),
  private.owns_project(uuid), private.accepts_collaboration(uuid), private.report_target_exists(text, uuid),
  private.owns_project_folder(text), private.can_read_project_media(text), private.can_read_portfolio_media(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.categories (slug, name, sort_order) values
  ('development', 'Development', 1),
  ('ai-automation', 'AI Automation', 2),
  ('design', 'Design', 3),
  ('ui-ux', 'UI/UX', 4),
  ('video', 'Video', 5),
  ('photography', 'Photography', 6),
  ('illustration', 'Illustration', 7),
  ('digital-art', 'Digital Art', 8),
  ('writing', 'Writing', 9),
  ('music-audio', 'Music & Audio', 10),
  ('other', 'Other', 11);

-- ---------------------------------------------------------------------------
-- Storage: buckets and object policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('project-media', 'project-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('portfolio-media', 'portfolio-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- avatars: public URLs; writes only inside {uid}/.
create policy "Avatar owners read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Avatar owners upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Avatar owners replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Avatar owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- project-media: private; guests read images of public projects via signed URLs.
create policy "Project media readable when public or owned" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'project-media' and ((storage.foldername(name))[1] = (select auth.uid()::text) or private.can_read_project_media(name)));
create policy "Project owners upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-media' and private.owns_project_folder(name));
create policy "Project owners replace media" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-media' and private.owns_project_folder(name))
  with check (bucket_id = 'project-media' and private.owns_project_folder(name));
create policy "Project owners delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- portfolio-media: private; guests read files listed in a visible published portfolio.
create policy "Portfolio media readable when published or owned" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'portfolio-media' and ((storage.foldername(name))[1] = (select auth.uid()::text) or private.can_read_portfolio_media(name)));
create policy "Portfolio owners upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Portfolio owners replace media" on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Portfolio owners delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Retention: purge expired AI import suggestions daily (pg_cron when available)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-expired-ai-imports', '17 3 * * *', 'delete from public.ai_imports where expires_at < now()');
  end if;
end;
$$;
