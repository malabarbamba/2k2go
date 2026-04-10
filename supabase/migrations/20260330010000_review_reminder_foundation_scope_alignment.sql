create or replace function public.get_review_reminder_dispatch_candidates_v1(
    p_now_utc timestamptz default timezone('utc', now())
)
returns table (
    user_id uuid,
    email text,
    notifications_email boolean,
    scheduler_timezone text,
    scheduler_day_cutoff_hour integer,
    current_streak integer,
    last_review_date date,
    local_date date,
    slot text,
    due_count integer,
    email_enabled boolean,
    web_push_enabled boolean,
    calendar_enabled boolean,
    daily_cap integer,
    streak_risk boolean
)
language sql
security definer
set search_path = public
as $$
with base as (
    select
        prefs.user_id,
        p.email,
        coalesce(p.notifications_email, true) as notifications_email,
        coalesce(nullif(trim(p.scheduler_timezone), ''), 'UTC') as scheduler_timezone,
        coalesce(p.scheduler_day_cutoff_hour, 4) as scheduler_day_cutoff_hour,
        coalesce(progress.current_streak, 0) as current_streak,
        progress.last_review_date,
        prefs.email_enabled,
        prefs.web_push_enabled,
        prefs.calendar_enabled,
        prefs.daily_cap,
        prefs.min_due_count,
        prefs.morning_hour,
        prefs.midday_hour,
        prefs.evening_hour,
        prefs.cadence_slots,
        (p_now_utc at time zone coalesce(nullif(trim(p.scheduler_timezone), ''), 'UTC')) as local_ts
    from public.user_review_reminder_preferences prefs
    join public.profiles p
        on p.user_id = prefs.user_id
    left join public.user_learning_progress progress
        on progress.user_id = prefs.user_id
    where prefs.enabled = true
      and (
          prefs.web_push_enabled = true
          or (
              prefs.email_enabled = true
              and coalesce(p.notifications_email, true) = true
              and p.email is not null
              and btrim(p.email) <> ''
          )
      )
),
slotted as (
    select
        base.*,
        ((base.local_ts - make_interval(hours => greatest(0, least(base.scheduler_day_cutoff_hour, 23))))::date) as local_date,
        extract(hour from base.local_ts)::integer as local_hour,
        case
            when 'morning' = any(base.cadence_slots) and extract(hour from base.local_ts)::integer = base.morning_hour then 'morning'
            when 'midday' = any(base.cadence_slots) and extract(hour from base.local_ts)::integer = base.midday_hour then 'midday'
            when 'evening' = any(base.cadence_slots) and extract(hour from base.local_ts)::integer = base.evening_hour then 'evening'
            else null
        end as slot,
        case
            when extract(hour from base.local_ts)::integer = base.morning_hour then base.min_due_count
            when extract(hour from base.local_ts)::integer = base.midday_hour then greatest(base.min_due_count + 2, 4)
            when extract(hour from base.local_ts)::integer = base.evening_hour then base.min_due_count
            else 9999
        end as due_threshold
    from base
),
with_counts as (
    select
        slotted.*,
        public.get_due_count_for_user_v1(slotted.user_id, 'foundation') as due_count,
        (coalesce(slotted.last_review_date, date '1900-01-01') >= slotted.local_date) as has_reviewed_today,
        coalesce((
            select count(*)::integer
            from public.review_reminder_dispatch_runs runs
            where runs.user_id = slotted.user_id
              and runs.local_date = slotted.local_date
              and runs.status in ('sent', 'partial')
        ), 0) as daily_sent_count
    from slotted
    where slotted.slot is not null
)
select
    with_counts.user_id,
    with_counts.email,
    with_counts.notifications_email,
    with_counts.scheduler_timezone,
    with_counts.scheduler_day_cutoff_hour,
    with_counts.current_streak,
    with_counts.last_review_date,
    with_counts.local_date,
    with_counts.slot,
    with_counts.due_count,
    with_counts.email_enabled,
    with_counts.web_push_enabled,
    with_counts.calendar_enabled,
    with_counts.daily_cap,
    (
        with_counts.slot = 'evening'
        and
        with_counts.current_streak > 0
        and with_counts.has_reviewed_today = false
    ) as streak_risk
from with_counts
where with_counts.daily_sent_count < with_counts.daily_cap
  and with_counts.has_reviewed_today = false
  and with_counts.due_count >= (
      case
          when with_counts.slot = 'evening'
               and with_counts.current_streak > 0
              then least(with_counts.due_threshold, 1)
          else with_counts.due_threshold
      end
  )
  and not exists (
      select 1
      from public.review_reminder_dispatch_runs existing
      where existing.user_id = with_counts.user_id
        and existing.local_date = with_counts.local_date
        and existing.slot = with_counts.slot
  );
$$;
revoke all on function public.get_review_reminder_dispatch_candidates_v1(timestamptz) from public;
grant execute on function public.get_review_reminder_dispatch_candidates_v1(timestamptz) to service_role;
notify pgrst, 'reload schema';
