create or replace function public.list_my_friends()
returns table (
  avatar_url text,
  connected_at timestamptz,
  email text,
  first_name text,
  friend_user_id uuid,
  last_name text,
  username text
)
language sql
security definer
set search_path = pg_catalog, public, social, auth
as $$
  with me as (
    select auth.uid() as uid
  ), friends as (
    select
      case
        when r.user_low_id = me.uid then r.user_high_id
        else r.user_low_id
      end as friend_user_id,
      coalesce(r.accepted_at, r.responded_at, r.updated_at, r.requested_at) as connected_at
    from social.relationships r
    cross join me
    where me.uid is not null
      and r.state = 'accepted'
      and (r.user_low_id = me.uid or r.user_high_id = me.uid)
  )
  select
    p.avatar_url,
    f.connected_at,
    null::text as email,
    p.first_name,
    f.friend_user_id,
    p.last_name,
    p.username
  from friends f
  left join public.profiles p on p.user_id = f.friend_user_id
  order by f.connected_at desc;
$$;

create or replace function public.list_incoming_friend_requests()
returns table (
  request_id text,
  requested_at timestamptz,
  requester_avatar_url text,
  requester_email text,
  requester_first_name text,
  requester_last_name text,
  requester_user_id uuid,
  requester_username text
)
language sql
security definer
set search_path = pg_catalog, public, social, auth
as $$
  with me as (
    select auth.uid() as uid
  ), requests as (
    select
      r.user_low_id::text || ':' || r.user_high_id::text as request_id,
      r.requested_at,
      r.initiator_user_id as requester_user_id
    from social.relationships r
    cross join me
    where me.uid is not null
      and r.state = 'pending'
      and r.initiator_user_id <> me.uid
      and (r.user_low_id = me.uid or r.user_high_id = me.uid)
  )
  select
    req.request_id,
    req.requested_at,
    p.avatar_url as requester_avatar_url,
    null::text as requester_email,
    p.first_name as requester_first_name,
    p.last_name as requester_last_name,
    req.requester_user_id,
    p.username as requester_username
  from requests req
  left join public.profiles p on p.user_id = req.requester_user_id
  order by req.requested_at desc;
$$;

create or replace function public.list_outgoing_friend_requests()
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
set search_path = pg_catalog, public, social, auth
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
    p.first_name as recipient_first_name,
    p.last_name as recipient_last_name,
    req.recipient_user_id,
    p.username as recipient_username
  from requests req
  left join public.profiles p on p.user_id = req.recipient_user_id
  order by req.requested_at desc;
$$;

revoke all on function public.list_my_friends() from public;
revoke all on function public.list_incoming_friend_requests() from public;
revoke all on function public.list_outgoing_friend_requests() from public;

grant execute on function public.list_my_friends() to authenticated;
grant execute on function public.list_incoming_friend_requests() to authenticated;
grant execute on function public.list_outgoing_friend_requests() to authenticated;

notify pgrst, 'reload schema';
