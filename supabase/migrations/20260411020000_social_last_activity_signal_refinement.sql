create or replace function public.list_my_friends()
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
      coalesce(da.last_event_at, da.created_at) as last_activity_at
    from progress.daily_activity_rollups da
    where da.user_id = f.friend_user_id
    order by coalesce(da.last_event_at, da.created_at) desc
    limit 1
  ) activity on true
  order by coalesce(activity.last_activity_at, f.connected_at) desc;
$$;

revoke all on function public.list_my_friends() from public;
grant execute on function public.list_my_friends() to authenticated;

create or replace function public.get_profile_social_summary_v1(
  p_target_user_id uuid
)
returns table (
  audio_recorded_count integer,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
  with target as (
    select coalesce(p_target_user_id, auth.uid()) as uid
  ), audio as (
    select
      count(
        distinct coalesce(
          'v:' || ap.vocabulary_card_id::text,
          'f:' || ap.foundation_card_id::text
        )
      )::integer as audio_recorded_count
    from public.preview_session_audio_posts ap
    join target t on t.uid = ap.user_id
  ), activity as (
    select max(event_at) as last_activity_at
    from (
      select coalesce(da.last_event_at, da.created_at) as event_at
      from progress.daily_activity_rollups da
      join target t on t.uid = da.user_id
      union all
      select ap.updated_at as event_at
      from public.preview_session_audio_posts ap
      join target t on t.uid = ap.user_id
      union all
      select tm.updated_at as event_at
      from public.preview_session_text_messages tm
      join target t on t.uid = tm.user_id
      union all
      select ar.updated_at as event_at
      from public.preview_session_audio_replies ar
      join target t on t.uid = ar.user_id
    ) events
  )
  select
    coalesce(audio.audio_recorded_count, 0) as audio_recorded_count,
    activity.last_activity_at
  from audio
  cross join activity;
$$;

revoke all on function public.get_profile_social_summary_v1(uuid) from public;
grant execute on function public.get_profile_social_summary_v1(uuid) to authenticated;

notify pgrst, 'reload schema';
