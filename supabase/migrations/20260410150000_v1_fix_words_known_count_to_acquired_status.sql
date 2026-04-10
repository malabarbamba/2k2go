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
      count(*) filter (where uc.state = 'review')::integer as words_acquired_count,
      count(*) filter (where uc.state = 'review')::integer as mastered_words,
      count(*) filter (
        where uc.state = 'review'
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
