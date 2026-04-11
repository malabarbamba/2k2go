drop function if exists public.list_my_friends();

create function public.list_my_friends()
returns table (
  avatar_url text,
  connected_at timestamptz,
  email text,
  first_name text,
  friend_user_id uuid,
  last_activity_at timestamptz,
  last_name text,
  username text
)
language sql
security definer
set search_path = pg_catalog, public, social, progress, auth
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
    activity.last_activity_at,
    p.last_name,
    p.username
  from friends f
  left join public.profiles p on p.user_id = f.friend_user_id
  left join lateral (
    select
      coalesce(da.last_event_at, da.updated_at, da.created_at) as last_activity_at
    from progress.daily_activity_rollups da
    where da.user_id = f.friend_user_id
    order by coalesce(da.last_event_at, da.updated_at, da.created_at) desc
    limit 1
  ) activity on true
  order by coalesce(activity.last_activity_at, f.connected_at) desc;
$$;

revoke all on function public.list_my_friends() from public;
grant execute on function public.list_my_friends() to authenticated;

notify pgrst, 'reload schema';
