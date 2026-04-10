-- Baseline v1: progress tables

create table if not exists progress.learning_path_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_visited_at timestamptz,
  step_one_choice progress.path_step_one_choice,
  step_one_completed_at timestamptz,
  primary_collection_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_learning_path_progress_set_updated_at on progress.learning_path_progress;
create trigger trg_learning_path_progress_set_updated_at
before update on progress.learning_path_progress
for each row execute function private.set_updated_at();

create table if not exists progress.user_milestones (
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_key text not null,
  earned_at timestamptz,
  notified_at timestamptz,
  source_event_id uuid references learning.user_card_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, milestone_key),
  constraint user_milestones_key_required check (btrim(milestone_key) <> '')
);

drop trigger if exists trg_user_milestones_set_updated_at on progress.user_milestones;
create trigger trg_user_milestones_set_updated_at
before update on progress.user_milestones
for each row execute function private.set_updated_at();

create table if not exists progress.daily_activity_rollups (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  review_count integer not null default 0,
  new_card_count integer not null default 0,
  time_spent_seconds integer not null default 0,
  first_event_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date),
  constraint daily_activity_rollups_review_non_negative check (review_count >= 0),
  constraint daily_activity_rollups_new_cards_non_negative check (new_card_count >= 0),
  constraint daily_activity_rollups_time_non_negative check (time_spent_seconds >= 0)
);

drop trigger if exists trg_daily_activity_rollups_set_updated_at on progress.daily_activity_rollups;
create trigger trg_daily_activity_rollups_set_updated_at
before update on progress.daily_activity_rollups
for each row execute function private.set_updated_at();
