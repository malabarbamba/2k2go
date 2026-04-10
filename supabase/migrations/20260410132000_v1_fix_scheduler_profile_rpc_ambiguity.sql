-- Baseline v1: fix scheduler profile RPC variable/column ambiguity

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
#variable_conflict use_column
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

notify pgrst, 'reload schema';
