-- Rate limits for the PHP sign-in API (api/index.php -> /api/auth/*).
--
-- Only the server's secret key (service_role) may call these functions. The
-- attempts table lives in the unexposed private schema; keys are SHA-256
-- hashes built by the API, so it never stores raw emails or IP addresses.

create table private.auth_attempts (
  id bigint generated always as identity primary key,
  key text not null check (char_length(key) <= 200),
  created_at timestamptz not null default now()
);
create index auth_attempts_key_idx on private.auth_attempts (key, created_at desc);
alter table private.auth_attempts enable row level security;
comment on table private.auth_attempts is 'One row per counted sign-in or account-email attempt. Written only by auth_attempt(); purged after a day.';

-- Sliding-window limit. Records one attempt for every key unless any key has
-- already reached its limit inside the window. Returns 0 when the attempt is
-- allowed, otherwise the seconds until the next attempt will be.
create function public.auth_attempt(keys text[], limits integer[], window_seconds integer)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  span interval := make_interval(secs => window_seconds);
  wait integer := 0;
  limit_reached_at timestamptz;
begin
  if coalesce(cardinality(keys), 0) = 0 or cardinality(keys) <> coalesce(cardinality(limits), 0)
     or window_seconds is null or window_seconds not between 1 and 86400
     or exists (select 1 from unnest(limits) as l where l is null or l < 1) then
    raise exception 'Invalid rate limit request.' using errcode = '22023';
  end if;
  -- Serialize requests for the same keys (in a fixed order, so no deadlocks)
  -- so a burst of parallel attempts cannot slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended(k, 0)) from (select distinct k from unnest(keys) as k order by k) ordered;
  for i in 1 .. cardinality(keys) loop
    -- The limit-th most recent attempt: once it leaves the window, one more is allowed.
    select a.created_at into limit_reached_at from private.auth_attempts a
    where a.key = keys[i] and a.created_at > now() - span
    order by a.created_at desc offset limits[i] - 1 limit 1;
    if found then
      wait := greatest(wait, ceil(extract(epoch from limit_reached_at + span - now()))::integer);
    end if;
  end loop;
  if wait > 0 then
    return wait;
  end if;
  insert into private.auth_attempts (key) select unnest(keys);
  return 0;
end;
$$;
comment on function public.auth_attempt(text[], integer[], integer) is 'Server only: count an auth attempt per key, or return the seconds to wait.';

-- Called after a successful sign-in or code check, so old mistakes stop counting.
create function public.auth_clear(keys text[])
returns void language sql volatile security definer set search_path = '' as $$
  delete from private.auth_attempts where key = any (keys);
$$;
comment on function public.auth_clear(text[]) is 'Server only: forget the attempts recorded for these keys.';

revoke all on function public.auth_attempt(text[], integer[], integer), public.auth_clear(text[]) from public, anon, authenticated;
grant execute on function public.auth_attempt(text[], integer[], integer), public.auth_clear(text[]) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-auth-attempts', '23 * * * *', 'delete from private.auth_attempts where created_at < now() - interval ''1 day''');
  end if;
end;
$$;
