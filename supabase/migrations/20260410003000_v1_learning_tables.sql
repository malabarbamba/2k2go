-- Baseline v1: learning tables

create table if not exists learning.scheduler_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  scheduler_key text not null default 'fsrs-v1',
  desired_retention numeric(4,3) not null default 0.900,
  max_daily_new integer not null default 20,
  max_daily_reviews integer not null default 200,
  learning_steps_minutes integer[] not null default array[1, 10],
  relearning_steps_minutes integer[] not null default array[10],
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduler_profiles_retention_range check (desired_retention between 0.700 and 0.990),
  constraint scheduler_profiles_max_daily_new_non_negative check (max_daily_new >= 0),
  constraint scheduler_profiles_max_daily_reviews_non_negative check (max_daily_reviews >= 0)
);

drop trigger if exists trg_scheduler_profiles_set_updated_at on learning.scheduler_profiles;
create trigger trg_scheduler_profiles_set_updated_at
before update on learning.scheduler_profiles
for each row execute function private.set_updated_at();

create table if not exists learning.user_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references catalog.cards(id) on delete cascade,
  state learning.user_card_state_kind not null default 'new',
  due_at timestamptz,
  introduced_at timestamptz,
  first_seen_at timestamptz,
  acquired_at timestamptz,
  last_reviewed_at timestamptz,
  stability numeric(10,4),
  difficulty numeric(6,4),
  elapsed_days integer,
  scheduled_days integer,
  reps integer not null default 0,
  lapses integer not null default 0,
  learning_step_index integer not null default 0,
  scheduler_version text not null default 'fsrs-v1',
  source_collection_id uuid references catalog.collections(id) on delete set null,
  is_buried boolean not null default false,
  suspended_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint user_cards_reps_non_negative check (reps >= 0),
  constraint user_cards_lapses_non_negative check (lapses >= 0),
  constraint user_cards_learning_step_non_negative check (learning_step_index >= 0),
  constraint user_cards_stability_positive check (stability is null or stability > 0),
  constraint user_cards_difficulty_range check (difficulty is null or difficulty between 1 and 10)
);

drop trigger if exists trg_user_cards_set_updated_at on learning.user_cards;
create trigger trg_user_cards_set_updated_at
before update on learning.user_cards
for each row execute function private.set_updated_at();

create table if not exists learning.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_kind learning.review_session_kind not null,
  state learning.review_session_state not null default 'open',
  lease_token text not null unique,
  leased_until timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_collection_id uuid references catalog.collections(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_sessions_completed_timestamp check (state <> 'completed' or completed_at is not null)
);

drop trigger if exists trg_review_sessions_set_updated_at on learning.review_sessions;
create trigger trg_review_sessions_set_updated_at
before update on learning.review_sessions
for each row execute function private.set_updated_at();

create table if not exists learning.user_card_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid not null,
  event_type learning.user_card_event_type not null,
  event_at timestamptz not null default now(),
  session_id uuid references learning.review_sessions(id) on delete set null,
  client_event_id uuid,
  source text,
  source_ref text,
  rating smallint,
  payload jsonb not null default '{}'::jsonb,
  fsrs_before jsonb,
  fsrs_after jsonb,
  created_at timestamptz not null default now(),
  constraint fk_user_card_events_user_card
    foreign key (user_id, card_id)
    references learning.user_cards(user_id, card_id)
    on delete cascade,
  constraint user_card_events_rating_range check (rating is null or rating between 0 and 5),
  constraint user_card_events_review_requires_rating check (
    (event_type = 'reviewed' and rating is not null)
    or (event_type <> 'reviewed' and rating is null)
  ),
  constraint user_card_events_review_requires_fsrs_after check (
    (event_type = 'reviewed' and fsrs_after is not null)
    or event_type <> 'reviewed'
  )
);
