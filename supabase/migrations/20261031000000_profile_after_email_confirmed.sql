-- Create the profile when the email is confirmed, not at sign-up, so an
-- unverified sign-up (a typo in the email, an abandoned form) never holds a
-- username or appears anywhere. Users created already confirmed (email
-- confirmation off, OAuth, admin invites) still get their profile at insert.

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested text := regexp_replace(lower(coalesce(meta ->> 'username', '')), '[^a-z0-9_]', '', 'g');
  fallback text := left(coalesce(nullif(requested, ''), 'user'), 11) || '_' || left(replace(new.id::text, '-', ''), 8);
  chosen text := fallback;
  name text := btrim(coalesce(nullif(btrim(meta ->> 'full_name'), ''), nullif(btrim(meta ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)));
begin
  if new.email_confirmed_at is null or exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  -- Must never block confirmation, so an invalid or meanwhile-taken username falls back to a generated one.
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

-- on_auth_user_created (after insert) stays; this one catches the code check.
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_new_user();

-- Free usernames held by sign-ups that never confirmed. They cannot sign in,
-- so they have no content; confirming later recreates the profile.
delete from public.profiles p
using auth.users u
where u.id = p.id and u.email_confirmed_at is null;
