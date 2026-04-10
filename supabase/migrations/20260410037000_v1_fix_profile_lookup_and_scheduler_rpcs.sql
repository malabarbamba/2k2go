-- Baseline v1: fix public profile lookup + scheduler RPCs for PostgREST clients

drop function if exists public.get_profile_by_user_id_v1(uuid);
drop function if exists public.get_profile_by_username_v1(text);
drop function if exists public.list_profiles_by_user_ids_v1(uuid[]);
drop function if exists public.get_my_scheduler_profile_v1();
drop function if exists public.upsert_my_scheduler_profile_v1(double precision, integer, text);

create or replace function public.get_profile_by_user_id_v1(
  p_target_user_id uuid
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz,
  username_change_count integer,
  username_changed_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, account
as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.created_at,
    p.updated_at,
    coalesce(p.username_change_count, 0) as username_change_count,
    p.username_changed_at
  from account.profiles p
  where p.user_id = p_target_user_id
  limit 1;
$$;

create or replace function public.get_profile_by_username_v1(
  p_username text
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz,
  username_change_count integer,
  username_changed_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, account
as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.created_at,
    p.updated_at,
    coalesce(p.username_change_count, 0) as username_change_count,
    p.username_changed_at
  from account.profiles p
  where lower(p.username) = lower(nullif(btrim(p_username), ''))
  limit 1;
$$;

create or replace function public.list_profiles_by_user_ids_v1(
  p_user_ids uuid[]
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text
)
language sql
security definer
set search_path = pg_catalog, public, account
as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio
  from account.profiles p
  where p.user_id = any(coalesce(p_user_ids, array[]::uuid[]));
$$;

create or replace function public.get_my_scheduler_profile_v1()
returns table (
  user_id uuid,
  desired_retention double precision,
  max_daily_new integer,
  timezone text,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, learning, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from learning.scheduler_profiles sp
    where sp.user_id = v_uid
  ) then
    insert into learning.scheduler_profiles (
      user_id,
      desired_retention,
      max_daily_new,
      timezone
    )
    values (
      v_uid,
      0.9,
      20,
      'UTC'
    );
  end if;

  return query
  select
    sp.user_id,
    sp.desired_retention::double precision,
    sp.max_daily_new,
    sp.timezone,
    sp.updated_at,
    sp.created_at
  from learning.scheduler_profiles sp
  where sp.user_id = v_uid
  limit 1;
end;
$$;

create or replace function public.upsert_my_scheduler_profile_v1(
  p_desired_retention double precision default null,
  p_max_daily_new integer default null,
  p_timezone text default null
)
returns table (
  user_id uuid,
  desired_retention double precision,
  max_daily_new integer,
  timezone text,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, learning, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  insert into learning.scheduler_profiles (
    user_id,
    desired_retention,
    max_daily_new,
    timezone
  )
  values (
    v_uid,
    coalesce(p_desired_retention, 0.9),
    coalesce(p_max_daily_new, 20),
    coalesce(nullif(btrim(p_timezone), ''), 'UTC')
  )
  on conflict (user_id) do update
  set
    desired_retention = coalesce(excluded.desired_retention, learning.scheduler_profiles.desired_retention),
    max_daily_new = coalesce(excluded.max_daily_new, learning.scheduler_profiles.max_daily_new),
    timezone = coalesce(nullif(btrim(excluded.timezone), ''), learning.scheduler_profiles.timezone),
    updated_at = now()
  returning
    learning.scheduler_profiles.user_id,
    learning.scheduler_profiles.desired_retention::double precision,
    learning.scheduler_profiles.max_daily_new,
    learning.scheduler_profiles.timezone,
    learning.scheduler_profiles.updated_at,
    learning.scheduler_profiles.created_at;
end;
$$;

revoke all on function public.get_profile_by_user_id_v1(uuid) from public;
revoke all on function public.get_profile_by_username_v1(text) from public;
revoke all on function public.list_profiles_by_user_ids_v1(uuid[]) from public;
revoke all on function public.get_my_scheduler_profile_v1() from public;
revoke all on function public.upsert_my_scheduler_profile_v1(double precision, integer, text) from public;

grant execute on function public.get_profile_by_user_id_v1(uuid) to anon, authenticated;
grant execute on function public.get_profile_by_username_v1(text) to anon, authenticated;
grant execute on function public.list_profiles_by_user_ids_v1(uuid[]) to anon, authenticated;
grant execute on function public.get_my_scheduler_profile_v1() to authenticated;
grant execute on function public.upsert_my_scheduler_profile_v1(double precision, integer, text) to authenticated;

notify pgrst, 'reload schema';
