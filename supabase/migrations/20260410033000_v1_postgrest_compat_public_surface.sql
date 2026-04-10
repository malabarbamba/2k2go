-- Baseline v1 compatibility: expose legacy public surface for PostgREST clients

create or replace view public.user_roles
with (security_invoker = true)
as
select
  ur.user_id,
  ur.role_key as role,
  ur.granted_by,
  ur.created_at
from account.user_roles ur;

grant select on public.user_roles to authenticated;

create or replace view public.scheduler_profiles
with (security_invoker = true)
as
select
  sp.user_id,
  sp.desired_retention,
  sp.max_daily_new,
  sp.timezone,
  sp.updated_at,
  sp.created_at
from learning.scheduler_profiles sp;

grant select, insert, update on public.scheduler_profiles to authenticated;

create or replace view public.user_daily_activity
with (security_invoker = true)
as
select
  da.user_id,
  da.activity_date,
  da.review_count as reviews_count,
  da.new_card_count as new_words,
  da.time_spent_seconds,
  floor(da.time_spent_seconds / 60.0)::integer as time_spent_minutes,
  da.created_at,
  da.updated_at
from progress.daily_activity_rollups da;

create or replace function public.compat_user_daily_activity_iud_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, progress
as $$
declare
  v_uid uuid := auth.uid();
  v_target_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_target_user_id := old.user_id;
    if v_uid is null or v_target_user_id <> v_uid then
      raise exception 'Cannot delete activity for another user';
    end if;

    delete from progress.daily_activity_rollups
    where user_id = old.user_id
      and activity_date = old.activity_date;
    return old;
  end if;

  v_target_user_id := coalesce(new.user_id, old.user_id);
  if v_uid is null or v_target_user_id <> v_uid then
    raise exception 'Cannot mutate activity for another user';
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
    v_target_user_id,
    coalesce(new.activity_date, old.activity_date, current_date),
    greatest(coalesce(new.reviews_count, old.reviews_count, 0), 0),
    greatest(coalesce(new.new_words, old.new_words, 0), 0),
    greatest(
      coalesce(
        new.time_spent_seconds,
        (coalesce(new.time_spent_minutes, old.time_spent_minutes, 0) * 60),
        old.time_spent_seconds,
        0
      ),
      0
    ),
    coalesce(new.created_at, old.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (user_id, activity_date) do update
  set
    review_count = greatest(excluded.review_count, progress.daily_activity_rollups.review_count),
    new_card_count = greatest(excluded.new_card_count, progress.daily_activity_rollups.new_card_count),
    time_spent_seconds = greatest(excluded.time_spent_seconds, progress.daily_activity_rollups.time_spent_seconds),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_user_daily_activity_compat_iud_v1 on public.user_daily_activity;
create trigger trg_user_daily_activity_compat_iud_v1
instead of insert or update or delete on public.user_daily_activity
for each row execute function public.compat_user_daily_activity_iud_v1();

grant select, insert, update, delete on public.user_daily_activity to authenticated;

create or replace function public.upsert_daily_activity(
  p_user_id uuid,
  p_activity_date date,
  p_reviews_count integer default 0,
  p_new_words integer default 0,
  p_time_spent_minutes integer default 0,
  p_time_spent_seconds integer default null
)
returns void
language plpgsql
security invoker
set search_path = public, progress
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'Cannot upsert activity for another user';
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
    p_user_id,
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

grant execute on function public.upsert_daily_activity(uuid, date, integer, integer, integer, integer) to authenticated;

create or replace function public.get_profile_progression_summary_v1(
  p_target_user_id uuid
)
returns table (
  words_acquired_count integer,
  total_immersion_minutes integer,
  review_streak_days integer,
  longest_streak_days integer,
  connection_streak_record_days integer,
  review_current integer,
  review_target integer,
  review_progress numeric,
  mastered_words integer,
  mastery_progress numeric,
  monthly_review_days_current integer,
  monthly_review_days_target integer,
  monthly_review_days_progress numeric,
  unlocked_distinction_ids text[]
)
language sql
security invoker
set search_path = public, learning, progress
as $$
  with target as (
    select coalesce(p_target_user_id, auth.uid()) as uid
  ), cards as (
    select
      count(*)::integer as words_acquired_count,
      count(*) filter (where uc.state in ('review','relearning'))::integer as mastered_words,
      count(*) filter (
        where uc.state in ('learning','review','relearning')
          and uc.due_at is not null
          and uc.due_at <= now()
          and uc.is_buried = false
      )::integer as due_count
    from learning.user_cards uc
    join target t on t.uid = uc.user_id
  ), immersion as (
    select coalesce(sum(da.time_spent_seconds), 0)::integer as total_seconds
    from progress.daily_activity_rollups da
    join target t on t.uid = da.user_id
  ), review_days as (
    select
      count(*)::integer as monthly_review_days_current,
      coalesce(array_agg(da.activity_date order by da.activity_date), '{}'::date[]) as active_days
    from progress.daily_activity_rollups da
    join target t on t.uid = da.user_id
    where da.review_count > 0
      and da.activity_date >= current_date - 29
      and da.activity_date <= current_date
  ), streak as (
    select
      coalesce((
        select count(*)::integer
        from (
          select
            activity_date,
            row_number() over (order by activity_date desc) as rn
          from progress.daily_activity_rollups da
          join target t on t.uid = da.user_id
          where da.review_count > 0
        ) x
        where x.activity_date = current_date - ((x.rn - 1)::integer)
      ), 0) as review_streak_days,
      coalesce((
        select max(streak_len)::integer
        from (
          select count(*) as streak_len
          from (
            select
              activity_date,
              activity_date - row_number() over (order by activity_date) * interval '1 day' as grp
            from (
              select distinct da.activity_date
              from progress.daily_activity_rollups da
              join target t on t.uid = da.user_id
              where da.review_count > 0
            ) d
          ) grouped
          group by grp
        ) streaks
      ), 0) as longest_streak_days
  )
  select
    cards.words_acquired_count,
    floor(immersion.total_seconds / 60.0)::integer as total_immersion_minutes,
    streak.review_streak_days,
    streak.longest_streak_days,
    streak.longest_streak_days as connection_streak_record_days,
    greatest(cards.words_acquired_count - cards.due_count, 0)::integer as review_current,
    greatest(cards.words_acquired_count, 0)::integer as review_target,
    case
      when cards.words_acquired_count > 0
      then round(((greatest(cards.words_acquired_count - cards.due_count, 0)::numeric / cards.words_acquired_count::numeric) * 100)::numeric, 2)
      else 0
    end as review_progress,
    cards.mastered_words,
    case
      when cards.words_acquired_count > 0
      then round(((cards.mastered_words::numeric / cards.words_acquired_count::numeric) * 100)::numeric, 2)
      else 0
    end as mastery_progress,
    review_days.monthly_review_days_current,
    30::integer as monthly_review_days_target,
    round((review_days.monthly_review_days_current::numeric / 30.0) * 100, 2) as monthly_review_days_progress,
    '{}'::text[] as unlocked_distinction_ids
  from cards, immersion, review_days, streak;
$$;

grant execute on function public.get_profile_progression_summary_v1(uuid) to authenticated;

grant execute on function public.search_cards_v2(text, uuid, integer, integer, text[]) to anon, authenticated;
grant execute on function public.get_due_count_v2(uuid) to authenticated;
grant execute on function public.get_due_cards_v2(integer, uuid) to authenticated;

notify pgrst, 'reload schema';
