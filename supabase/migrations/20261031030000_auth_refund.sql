-- Gives back the most recent counted attempt for each key. The PHP API calls it
-- when Supabase refused to send a code email, so a send that never happened
-- doesn't use up anyone's hourly limit. Only one attempt per key is returned,
-- so failures can never wipe out the attempts that did send email.

create function public.auth_refund(keys text[])
returns void language sql volatile security definer set search_path = '' as $$
  delete from private.auth_attempts
  where id in (
    select distinct on (key) id
    from private.auth_attempts
    where key = any (keys)
    order by key, created_at desc, id desc
  );
$$;
comment on function public.auth_refund(text[]) is 'Server only: give back the latest attempt for each key after an email was not sent.';

revoke all on function public.auth_refund(text[]) from public, anon, authenticated;
grant execute on function public.auth_refund(text[]) to service_role;
