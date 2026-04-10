-- Baseline v1: canonical profile/scheduler read RPCs for frontend compatibility

drop function if exists public.get_profile_by_user_id_v1(uuid);
drop function if exists public.get_profile_by_username_v1(text);
drop function if exists public.list_profiles_by_user_ids_v1(uuid[]);
drop function if exists public.get_my_scheduler_profile_v1();
drop function if exists public.upsert_my_scheduler_profile_v1(double precision, integer, text);

create or replace function public.get_profile_by_user_id_v1(
  p_target_user_id uuid
)
returns account.profiles
language plpgsql
security invoker
set search_path = public, account
as $$
declare
  v_profile account.profiles;
begin
  if p_target_user_id is null then
    return null;
  end if;

  select p.*
  into v_profile
  from account.profiles p
  where p.user_id = p_target_user_id
  limit 1;

  return v_profile;
end;
$$;

create or replace function public.get_profile_by_username_v1(
  p_username text
)
returns account.profiles
language plpgsql
security invoker
set search_path = public, account
as $$
declare
  v_profile account.profiles;
  v_username text := lower(nullif(btrim(p_username), ''));
begin
  if v_username is null then
    return null;
  end if;

  select p.*
  into v_profile
  from account.profiles p
  where lower(p.username) = v_username
  limit 1;

  return v_profile;
end;
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
security invoker
set search_path = public, account
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
returns learning.scheduler_profiles
language plpgsql
security invoker
set search_path = public, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_profile learning.scheduler_profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select sp.*
  into v_profile
  from learning.scheduler_profiles sp
  where sp.user_id = v_uid;

  if v_profile.user_id is null then
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
    )
    returning * into v_profile;
  end if;

  return v_profile;
end;
$$;

create or replace function public.upsert_my_scheduler_profile_v1(
  p_desired_retention double precision default null,
  p_max_daily_new integer default null,
  p_timezone text default null
)
returns learning.scheduler_profiles
language plpgsql
security invoker
set search_path = public, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_profile learning.scheduler_profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

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
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.get_profile_by_user_id_v1(uuid) to anon, authenticated;
grant execute on function public.get_profile_by_username_v1(text) to anon, authenticated;
grant execute on function public.list_profiles_by_user_ids_v1(uuid[]) to anon, authenticated;
grant execute on function public.get_my_scheduler_profile_v1() to authenticated;
grant execute on function public.upsert_my_scheduler_profile_v1(double precision, integer, text) to authenticated;
