-- Baseline v1 compatibility hotfix: restore legacy public.profiles API surface

create or replace view public.profiles
with (security_invoker = true)
as
select
  p.user_id as id,
  p.user_id,
  p.username,
  split_part(coalesce(p.display_name, ''), ' ', 1) as first_name,
  nullif(btrim(regexp_replace(coalesce(p.display_name, ''), '^\S+\s*', '')), '') as last_name,
  p.avatar_url,
  p.bio,
  null::text as motto,
  null::text as location,
  0::integer as followers_count,
  0::integer as following_count,
  true::boolean as is_public,
  p.email_notifications_enabled as notifications_email,
  null::text as email,
  coalesce(sp.desired_retention, 0.900)::double precision as fsrs_target_retention,
  coalesce(sp.max_daily_new, 20)::integer as new_cards_per_day,
  coalesce(nullif(sp.timezone, ''), nullif(p.timezone, ''), 'UTC') as scheduler_timezone,
  4::integer as scheduler_day_cutoff_hour,
  null::text as plan,
  null::text as pro_status,
  null::boolean as admin_override_pro,
  null::timestamptz as admin_override_expires_at,
  p.created_at,
  p.updated_at
from account.profiles p
left join learning.scheduler_profiles sp
  on sp.user_id = p.user_id;

create or replace function public.compat_profiles_iud_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, account, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_target_user_id uuid;
  v_username text;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_avatar_url text;
  v_bio text;
  v_notifications_email boolean;
  v_scheduler_timezone text;
  v_fsrs_target_retention numeric(4,3);
  v_new_cards_per_day integer;
begin
  if tg_op = 'DELETE' then
    if v_uid is null then
      raise exception 'Authentication required';
    end if;

    if old.user_id is null or old.user_id <> v_uid then
      raise exception 'Cannot delete another user profile';
    end if;

    delete from learning.scheduler_profiles where user_id = old.user_id;
    delete from account.profiles where user_id = old.user_id;
    return old;
  end if;

  v_target_user_id := coalesce(new.user_id, new.id, old.user_id, old.id);

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_target_user_id is null or v_target_user_id <> v_uid then
    raise exception 'Cannot mutate another user profile';
  end if;

  v_username := coalesce(new.username, old.username);
  v_first_name := nullif(btrim(coalesce(new.first_name, old.first_name)), '');
  v_last_name := nullif(btrim(coalesce(new.last_name, old.last_name)), '');
  v_display_name := nullif(btrim(concat_ws(' ', v_first_name, v_last_name)), '');
  v_avatar_url := coalesce(new.avatar_url, old.avatar_url);
  v_bio := coalesce(new.bio, old.bio);
  v_notifications_email := coalesce(new.notifications_email, old.notifications_email, true);
  v_scheduler_timezone := coalesce(
    nullif(new.scheduler_timezone, ''),
    nullif(old.scheduler_timezone, ''),
    'UTC'
  );
  v_fsrs_target_retention := least(
    greatest(coalesce(new.fsrs_target_retention, old.fsrs_target_retention, 0.900)::numeric, 0.700),
    0.990
  );
  v_new_cards_per_day := greatest(coalesce(new.new_cards_per_day, old.new_cards_per_day, 20), 0);

  insert into account.profiles (
    user_id,
    username,
    display_name,
    avatar_url,
    timezone,
    bio,
    email_notifications_enabled,
    created_at,
    updated_at
  )
  values (
    v_target_user_id,
    v_username,
    v_display_name,
    v_avatar_url,
    v_scheduler_timezone,
    v_bio,
    v_notifications_email,
    coalesce(new.created_at, old.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (user_id) do update
  set
    username = coalesce(excluded.username, account.profiles.username),
    display_name = coalesce(excluded.display_name, account.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, account.profiles.avatar_url),
    timezone = coalesce(excluded.timezone, account.profiles.timezone),
    bio = coalesce(excluded.bio, account.profiles.bio),
    email_notifications_enabled = coalesce(excluded.email_notifications_enabled, account.profiles.email_notifications_enabled),
    updated_at = coalesce(excluded.updated_at, now());

  insert into learning.scheduler_profiles (
    user_id,
    desired_retention,
    max_daily_new,
    timezone,
    updated_at
  )
  values (
    v_target_user_id,
    v_fsrs_target_retention,
    v_new_cards_per_day,
    v_scheduler_timezone,
    coalesce(new.updated_at, now())
  )
  on conflict (user_id) do update
  set
    desired_retention = excluded.desired_retention,
    max_daily_new = excluded.max_daily_new,
    timezone = excluded.timezone,
    updated_at = coalesce(excluded.updated_at, now());

  select p.*
  into new
  from public.profiles p
  where p.user_id = v_target_user_id;

  return new;
end;
$$;

drop trigger if exists trg_profiles_compat_iud_v1 on public.profiles;
create trigger trg_profiles_compat_iud_v1
instead of insert or update or delete on public.profiles
for each row execute function public.compat_profiles_iud_v1();

grant select, insert, update, delete on public.profiles to authenticated;

notify pgrst, 'reload schema';
