-- Baseline v1: rebuild derived projections

truncate table progress.daily_activity_rollups;

insert into progress.daily_activity_rollups (
  user_id,
  activity_date,
  review_count,
  new_card_count,
  time_spent_seconds,
  first_event_at,
  last_event_at,
  created_at,
  updated_at
)
select
  e.user_id,
  (e.event_at at time zone 'UTC')::date as activity_date,
  count(*) filter (where e.event_type = 'reviewed')::integer as review_count,
  count(*) filter (where e.event_type in ('added_to_learning', 'seeded_from_collection'))::integer as new_card_count,
  coalesce(sum((e.payload ->> 'duration_seconds')::integer), 0)::integer as time_spent_seconds,
  min(e.event_at) as first_event_at,
  max(e.event_at) as last_event_at,
  now() as created_at,
  now() as updated_at
from learning.user_card_events e
group by e.user_id, (e.event_at at time zone 'UTC')::date;

-- Ensure every user with profile has a scheduler profile row.
insert into learning.scheduler_profiles (user_id)
select p.user_id
from account.profiles p
on conflict (user_id) do nothing;
