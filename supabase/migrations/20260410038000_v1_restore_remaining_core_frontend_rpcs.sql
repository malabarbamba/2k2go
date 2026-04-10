-- Baseline v1: restore remaining core frontend RPCs expected by the app

create table if not exists public.review_session_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  review_session_id uuid not null,
  lease_expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_session_leases enable row level security;

drop policy if exists review_session_leases_user_read on public.review_session_leases;
create policy review_session_leases_user_read
on public.review_session_leases
for select
to authenticated
using (auth.uid() = user_id);

drop function if exists public.claim_review_session_lease_v1(uuid, integer);
create function public.claim_review_session_lease_v1(
  p_review_session_id uuid,
  p_lease_seconds integer default 90
)
returns table (
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_next_expiry timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_review_session_id is null then
    raise exception 'review_session_id is required';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 15 or p_lease_seconds > 900 then
    raise exception 'p_lease_seconds must be between 15 and 900';
  end if;

  insert into public.review_session_leases (
    user_id,
    review_session_id,
    lease_expires_at,
    heartbeat_at,
    updated_at
  )
  values (
    v_user_id,
    p_review_session_id,
    v_now + make_interval(secs => p_lease_seconds),
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set
    review_session_id = excluded.review_session_id,
    lease_expires_at = excluded.lease_expires_at,
    heartbeat_at = v_now,
    updated_at = v_now
  where
    public.review_session_leases.review_session_id = excluded.review_session_id
    or public.review_session_leases.lease_expires_at <= v_now;

  if not found then
    raise exception 'ACTIVE_REVIEW_SESSION_LOCKED'
      using
        errcode = 'P0001',
        detail = 'Another active review session already holds this account lease.',
        hint = 'Close the active session or wait for lease expiration.';
  end if;

  select rsl.lease_expires_at
  into v_next_expiry
  from public.review_session_leases rsl
  where rsl.user_id = v_user_id
    and rsl.review_session_id = p_review_session_id
  limit 1;

  return query select v_next_expiry;
end;
$$;

drop function if exists public.mark_progress_path_visited_v1(timestamptz);
create function public.mark_progress_path_visited_v1(
  p_first_visited_at timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_first_visited_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into progress.learning_path_progress (
    user_id,
    first_visited_at,
    updated_at
  )
  values (
    v_user_id,
    coalesce(p_first_visited_at, v_now),
    v_now
  )
  on conflict (user_id) do update
  set
    first_visited_at = coalesce(
      least(progress.learning_path_progress.first_visited_at, excluded.first_visited_at),
      progress.learning_path_progress.first_visited_at,
      excluded.first_visited_at
    ),
    updated_at = now()
  returning progress.learning_path_progress.first_visited_at into v_first_visited_at;

  return v_first_visited_at;
end;
$$;

drop function if exists public.mark_progress_path_step_one_completed_v1(text);
create function public.mark_progress_path_step_one_completed_v1(
  p_choice text default null
)
returns table (
  step_one_choice text,
  step_one_completed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_choice progress.path_step_one_choice := nullif(replace(btrim(coalesce(p_choice, '')), '-', '_'), '')::progress.path_step_one_choice;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into progress.learning_path_progress (
    user_id,
    first_visited_at,
    step_one_choice,
    step_one_completed_at,
    updated_at
  )
  values (
    v_user_id,
    v_now,
    v_choice,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set
    first_visited_at = coalesce(progress.learning_path_progress.first_visited_at, excluded.first_visited_at),
    step_one_choice = coalesce(excluded.step_one_choice, progress.learning_path_progress.step_one_choice),
    step_one_completed_at = coalesce(progress.learning_path_progress.step_one_completed_at, excluded.step_one_completed_at),
    updated_at = now();

  insert into progress.user_milestones (
    user_id,
    milestone_key,
    earned_at,
    metadata
  )
  values (
    v_user_id,
    'coup-denvoi',
    v_now,
    jsonb_build_object('source', 'learning_path_step_one')
  )
  on conflict (user_id, milestone_key) do nothing;

  return query
  select
    lpp.step_one_choice::text,
    lpp.step_one_completed_at
  from progress.learning_path_progress lpp
  where lpp.user_id = v_user_id;
end;
$$;

drop function if exists public.mark_foundation_deck_started_v1();
create function public.mark_foundation_deck_started_v1()
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_started_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into progress.learning_path_progress (
    user_id,
    first_visited_at,
    primary_collection_started_at,
    updated_at
  )
  values (
    v_user_id,
    v_now,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set
    first_visited_at = coalesce(progress.learning_path_progress.first_visited_at, excluded.first_visited_at),
    primary_collection_started_at = coalesce(progress.learning_path_progress.primary_collection_started_at, excluded.primary_collection_started_at),
    updated_at = now()
  returning progress.learning_path_progress.primary_collection_started_at into v_started_at;

  return v_started_at;
end;
$$;

drop function if exists public.upsert_my_daily_activity_v1(date, integer, integer, integer, integer);
create function public.upsert_my_daily_activity_v1(
  p_activity_date date default current_date,
  p_reviews_count integer default 0,
  p_new_words integer default 0,
  p_time_spent_minutes integer default 0,
  p_time_spent_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into progress.daily_activity_rollups (
    user_id,
    activity_date,
    review_count,
    new_card_count,
    time_spent_seconds,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    coalesce(p_activity_date, current_date),
    greatest(coalesce(p_reviews_count, 0), 0),
    greatest(coalesce(p_new_words, 0), 0),
    greatest(coalesce(p_time_spent_seconds, p_time_spent_minutes * 60, 0), 0),
    now(),
    now()
  )
  on conflict (user_id, activity_date) do update
  set
    review_count = greatest(excluded.review_count, progress.daily_activity_rollups.review_count),
    new_card_count = greatest(excluded.new_card_count, progress.daily_activity_rollups.new_card_count),
    time_spent_seconds = greatest(excluded.time_spent_seconds, progress.daily_activity_rollups.time_spent_seconds),
    updated_at = now();
end;
$$;

drop function if exists public.sync_user_accomplishments_v1();
create function public.sync_user_accomplishments_v1()
returns table (
  accomplishment_type text,
  earned_at timestamptz,
  notified_at timestamptz,
  overlay_version integer,
  metadata jsonb
)
language sql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
  select
    um.milestone_key as accomplishment_type,
    um.earned_at,
    um.notified_at,
    1 as overlay_version,
    um.metadata
  from progress.user_milestones um
  where um.user_id = auth.uid()
  order by um.earned_at asc nulls last, um.milestone_key asc;
$$;

drop function if exists public.mark_user_accomplishment_notified_v1(text, integer);
create function public.mark_user_accomplishment_notified_v1(
  p_accomplishment_type text,
  p_overlay_version integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update progress.user_milestones
  set
    notified_at = coalesce(notified_at, now()),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('overlay_version', coalesce(p_overlay_version, 1))
  where user_id = v_user_id
    and milestone_key = p_accomplishment_type;

  return found;
end;
$$;

drop function if exists public.send_friend_request_by_username(text);
create function public.send_friend_request_by_username(
  p_recipient_username text
)
returns table (
  friend_request_id text,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, account, social, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_low uuid;
  v_high uuid;
  v_existing social.relationships;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.user_id
  into v_target_user_id
  from account.profiles p
  where lower(p.username) = lower(nullif(btrim(p_recipient_username), ''))
  limit 1;

  if v_target_user_id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_target_user_id = v_user_id then
    raise exception 'CANNOT_ADD_SELF';
  end if;

  v_low := private.user_pair_low(v_user_id, v_target_user_id);
  v_high := private.user_pair_high(v_user_id, v_target_user_id);

  select *
  into v_existing
  from social.relationships r
  where r.user_low_id = v_low
    and r.user_high_id = v_high;

  if found then
    if v_existing.state = 'accepted' then
      return query select v_low::text || ':' || v_high::text, 'already_friends';
      return;
    end if;

    if v_existing.state = 'pending' and v_existing.initiator_user_id = v_user_id then
      return query select v_low::text || ':' || v_high::text, 'already_pending';
      return;
    end if;

    if v_existing.state = 'pending' and v_existing.initiator_user_id = v_target_user_id then
      perform public.set_relationship_v1(v_target_user_id, 'accept');
      return query select v_low::text || ':' || v_high::text, 'accepted_reverse_request';
      return;
    end if;
  end if;

  perform public.set_relationship_v1(v_target_user_id, 'request');
  return query select v_low::text || ':' || v_high::text, 'sent';
end;
$$;

drop function if exists public.list_my_friends();
create function public.list_my_friends()
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
set search_path = pg_catalog, public, account, social, auth
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
    nullif(split_part(coalesce(p.display_name, ''), ' ', 1), '') as first_name,
    f.friend_user_id,
    nullif(btrim(regexp_replace(coalesce(p.display_name, ''), '^\S+\s*', '')), '') as last_name,
    p.username
  from friends f
  left join account.profiles p on p.user_id = f.friend_user_id
  order by f.connected_at desc;
$$;

drop function if exists public.list_incoming_friend_requests();
create function public.list_incoming_friend_requests()
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
set search_path = pg_catalog, public, account, social, auth
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
    nullif(split_part(coalesce(p.display_name, ''), ' ', 1), '') as requester_first_name,
    nullif(btrim(regexp_replace(coalesce(p.display_name, ''), '^\S+\s*', '')), '') as requester_last_name,
    req.requester_user_id,
    p.username as requester_username
  from requests req
  left join account.profiles p on p.user_id = req.requester_user_id
  order by req.requested_at desc;
$$;

drop function if exists public.respond_friend_request(text, text);
create function public.respond_friend_request(
  p_request_id text,
  p_action text
)
returns table (
  friendship_created boolean,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, social, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_target_user_id uuid;
  v_row social.relationships;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_low := nullif(split_part(coalesce(p_request_id, ''), ':', 1), '')::uuid;
  v_high := nullif(split_part(coalesce(p_request_id, ''), ':', 2), '')::uuid;

  if v_low is null or v_high is null or v_user_id not in (v_low, v_high) then
    raise exception 'INVALID_FRIEND_REQUEST_ID';
  end if;

  v_target_user_id := case when v_user_id = v_low then v_high else v_low end;

  select *
  into v_row
  from public.set_relationship_v1(v_target_user_id, p_action);

  return query
  select
    (v_row.state = 'accepted') as friendship_created,
    case
      when v_row.state = 'accepted' then 'accepted'
      when v_row.state = 'declined' then 'declined'
      else v_row.state::text
    end as status;
end;
$$;

revoke all on function public.claim_review_session_lease_v1(uuid, integer) from public;
revoke all on function public.mark_progress_path_visited_v1(timestamptz) from public;
revoke all on function public.mark_progress_path_step_one_completed_v1(text) from public;
revoke all on function public.mark_foundation_deck_started_v1() from public;
revoke all on function public.upsert_my_daily_activity_v1(date, integer, integer, integer, integer) from public;
revoke all on function public.sync_user_accomplishments_v1() from public;
revoke all on function public.mark_user_accomplishment_notified_v1(text, integer) from public;
revoke all on function public.send_friend_request_by_username(text) from public;
revoke all on function public.list_my_friends() from public;
revoke all on function public.list_incoming_friend_requests() from public;
revoke all on function public.respond_friend_request(text, text) from public;

grant execute on function public.claim_review_session_lease_v1(uuid, integer) to authenticated, service_role;
grant execute on function public.mark_progress_path_visited_v1(timestamptz) to authenticated;
grant execute on function public.mark_progress_path_step_one_completed_v1(text) to authenticated;
grant execute on function public.mark_foundation_deck_started_v1() to authenticated;
grant execute on function public.upsert_my_daily_activity_v1(date, integer, integer, integer, integer) to authenticated;
grant execute on function public.sync_user_accomplishments_v1() to authenticated;
grant execute on function public.mark_user_accomplishment_notified_v1(text, integer) to authenticated;
grant execute on function public.send_friend_request_by_username(text) to authenticated;
grant execute on function public.list_my_friends() to authenticated;
grant execute on function public.list_incoming_friend_requests() to authenticated;
grant execute on function public.respond_friend_request(text, text) to authenticated;

notify pgrst, 'reload schema';
