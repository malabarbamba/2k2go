drop function if exists public.list_outgoing_friend_requests();

create function public.list_outgoing_friend_requests()
returns table (
  request_id text,
  requested_at timestamptz,
  recipient_avatar_url text,
  recipient_email text,
  recipient_first_name text,
  recipient_last_name text,
  recipient_user_id uuid,
  recipient_username text
)
language sql
security definer
set search_path = pg_catalog, public, account, social, auth
as $$
  with me as (
    select auth.uid() as uid
  ), requests as (
    select
      r.user_low_id::text || ':' || r.user_high_id::text as request_id,
      r.requested_at,
      case
        when r.user_low_id = me.uid then r.user_high_id
        else r.user_low_id
      end as recipient_user_id
    from social.relationships r
    cross join me
    where me.uid is not null
      and r.state = 'pending'
      and r.initiator_user_id = me.uid
      and (r.user_low_id = me.uid or r.user_high_id = me.uid)
  )
  select
    req.request_id,
    req.requested_at,
    p.avatar_url as recipient_avatar_url,
    null::text as recipient_email,
    nullif(split_part(coalesce(p.display_name, ''), ' ', 1), '') as recipient_first_name,
    nullif(btrim(regexp_replace(coalesce(p.display_name, ''), '^\S+\s*', '')), '') as recipient_last_name,
    req.recipient_user_id,
    p.username as recipient_username
  from requests req
  left join account.profiles p on p.user_id = req.recipient_user_id
  order by req.requested_at desc;
$$;

revoke all on function public.list_outgoing_friend_requests() from public;
grant execute on function public.list_outgoing_friend_requests() to authenticated;

notify pgrst, 'reload schema';
