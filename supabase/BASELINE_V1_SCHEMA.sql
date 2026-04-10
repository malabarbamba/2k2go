-- Baseline V1 canonical schema draft.
-- This is a strict design artifact for implementation planning.
-- Apply in a clean new project migration chain.

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create schema if not exists private;
create schema if not exists account;
create schema if not exists catalog;
create schema if not exists learning;
create schema if not exists progress;
create schema if not exists social;
create schema if not exists reminder;
create schema if not exists media;
create schema if not exists ops;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.normalize_arabic(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text := coalesce(input, '');
begin
  s := regexp_replace(s, '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g');
  s := replace(s, 'ـ', '');
  s := regexp_replace(s, '[أإآا]', 'ا', 'g');
  s := regexp_replace(s, '[ؤ]', 'و', 'g');
  s := regexp_replace(s, '[ئ]', 'ي', 'g');
  s := regexp_replace(s, '[ىی]', 'ي', 'g');
  s := regexp_replace(s, '[ة]', 'ه', 'g');
  s := regexp_replace(s, '[ء]', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := btrim(lower(s));
  return nullif(s, '');
end;
$$;

create or replace function private.normalize_text(input text)
returns text
language sql
immutable
as $$
  select nullif(btrim(lower(unaccent(regexp_replace(coalesce(input, ''), '\s+', ' ', 'g')))), '');
$$;

do $$ begin
  create type catalog.card_kind as enum ('vocabulary', 'phrase', 'sentence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type catalog.origin_kind as enum (
    'foundation_seed',
    'video_extracted',
    'user_import',
    'legacy_user_card',
    'manual_entry',
    'collection_seed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type catalog.collection_kind as enum (
    'system_foundation',
    'system_alphabet',
    'user_private',
    'user_shared',
    'user_import'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type catalog.collection_visibility as enum ('system', 'private', 'shared', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type catalog.user_collection_state_kind as enum ('active', 'hidden', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type catalog.video_visibility as enum ('private', 'unlisted', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning.user_card_state_kind as enum (
    'new',
    'learning',
    'review',
    'relearning',
    'suspended',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning.user_card_event_type as enum (
    'seeded_from_collection',
    'seen',
    'added_to_learning',
    'reviewed',
    'rescheduled',
    'removed_from_learning',
    'suspended',
    'unsuspended',
    'assessment_submitted',
    'media_attached',
    'media_removed',
    'note_updated'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning.review_session_kind as enum ('review', 'preview');
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning.review_session_state as enum ('open', 'completed', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type progress.path_step_one_choice as enum (
    'can_read',
    'needs_alphabet',
    'quiz_can_read',
    'quiz_needs_alphabet'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type social.relationship_state as enum ('pending', 'accepted', 'declined', 'blocked', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type social.collection_access_role as enum ('viewer', 'contributor', 'editor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type social.thread_kind as enum ('preview_discussion', 'collection_discussion', 'direct');
exception when duplicate_object then null; end $$;

do $$ begin
  create type social.thread_subject_kind as enum ('collection', 'review_session', 'card', 'video', 'relationship');
exception when duplicate_object then null; end $$;

do $$ begin
  create type social.message_kind as enum ('text', 'audio', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type social.asset_kind as enum ('audio', 'image', 'file');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reminder.feed_scope as enum ('all_cards', 'review_only', 'collection');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media.media_kind as enum ('image', 'audio', 'note');
exception when duplicate_object then null; end $$;

create table if not exists account.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  locale text not null default 'fr',
  timezone text not null default 'UTC',
  bio text,
  email_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,32}$')
);

create unique index if not exists uq_profiles_username
  on account.profiles (lower(username))
  where username is not null;

drop trigger if exists trg_profiles_set_updated_at on account.profiles;
create trigger trg_profiles_set_updated_at
before update on account.profiles
for each row execute function private.set_updated_at();

create table if not exists account.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_key),
  constraint user_roles_role_key_check check (role_key in ('member', 'moderator', 'admin'))
);

create table if not exists catalog.cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  card_kind catalog.card_kind not null default 'vocabulary',
  term text not null,
  translation text,
  transliteration text,
  example_term text,
  example_translation text,
  language_code text not null default 'ar',
  translation_language_code text not null default 'fr',
  difficulty smallint,
  frequency_rank integer,
  theme_key text,
  image_url text,
  audio_url text,
  sentence_audio_url text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  normalized_term text generated always as (private.normalize_arabic(term)) stored,
  normalized_translation text generated always as (private.normalize_text(translation)) stored,
  normalized_transliteration text generated always as (private.normalize_text(transliteration)) stored,
  constraint cards_term_required check (btrim(term) <> ''),
  constraint cards_difficulty_range check (difficulty is null or difficulty between 0 and 10),
  constraint cards_frequency_rank_positive check (frequency_rank is null or frequency_rank > 0)
);

create unique index if not exists uq_cards_owner_normkey
  on catalog.cards (
    coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_term,
    coalesce(normalized_translation, ''),
    coalesce(normalized_transliteration, '')
  )
  where is_active;

create index if not exists idx_cards_owner on catalog.cards (owner_user_id);
create index if not exists idx_cards_frequency_rank on catalog.cards (frequency_rank) where frequency_rank is not null;
create index if not exists idx_cards_term_trgm on catalog.cards using gin (normalized_term gin_trgm_ops);
create index if not exists idx_cards_translation_trgm on catalog.cards using gin (normalized_translation gin_trgm_ops);

drop trigger if exists trg_cards_set_updated_at on catalog.cards;
create trigger trg_cards_set_updated_at
before update on catalog.cards
for each row execute function private.set_updated_at();

create table if not exists catalog.card_origins (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references catalog.cards(id) on delete cascade,
  origin_kind catalog.origin_kind not null,
  source_table text not null,
  source_id text not null,
  source_user_id uuid references auth.users(id) on delete set null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_card_origin_source unique (origin_kind, source_table, source_id)
);

create index if not exists idx_card_origins_card_id on catalog.card_origins (card_id);
create index if not exists idx_card_origins_source_user on catalog.card_origins (source_user_id) where source_user_id is not null;

create table if not exists catalog.collections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  slug text,
  title text not null,
  description text,
  kind catalog.collection_kind not null,
  visibility catalog.collection_visibility not null,
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_title_required check (btrim(title) <> ''),
  constraint collections_owner_by_kind check (
    (
      kind in ('system_foundation', 'system_alphabet')
      and owner_user_id is null
      and visibility = 'system'
    )
    or (
      kind not in ('system_foundation', 'system_alphabet')
      and owner_user_id is not null
      and visibility in ('private', 'shared', 'public')
    )
  )
);

create unique index if not exists uq_collections_slug
  on catalog.collections (lower(slug))
  where slug is not null;

create index if not exists idx_collections_owner on catalog.collections (owner_user_id) where owner_user_id is not null;
create index if not exists idx_collections_visibility on catalog.collections (visibility, kind);

drop trigger if exists trg_collections_set_updated_at on catalog.collections;
create trigger trg_collections_set_updated_at
before update on catalog.collections
for each row execute function private.set_updated_at();

create table if not exists catalog.collection_items (
  collection_id uuid not null references catalog.collections(id) on delete cascade,
  card_id uuid not null references catalog.cards(id) on delete cascade,
  position integer not null default 0,
  item_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (collection_id, card_id),
  constraint collection_items_position_non_negative check (position >= 0)
);

create unique index if not exists uq_collection_items_position
  on catalog.collection_items (collection_id, position);

create index if not exists idx_collection_items_card_id on catalog.collection_items (card_id);

create table if not exists catalog.user_collection_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references catalog.collections(id) on delete cascade,
  state catalog.user_collection_state_kind not null default 'active',
  joined_at timestamptz not null default now(),
  hidden_at timestamptz,
  archived_at timestamptz,
  last_opened_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, collection_id),
  constraint user_collection_state_hidden_requires_timestamp check (state <> 'hidden' or hidden_at is not null),
  constraint user_collection_state_archived_requires_timestamp check (state <> 'archived' or archived_at is not null)
);

create index if not exists idx_user_collection_state_collection
  on catalog.user_collection_state (collection_id, state);

drop trigger if exists trg_user_collection_state_set_updated_at on catalog.user_collection_state;
create trigger trg_user_collection_state_set_updated_at
before update on catalog.user_collection_state
for each row execute function private.set_updated_at();

create table if not exists catalog.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  channel_name text,
  language_code text not null default 'ar',
  dialect text,
  duration_seconds integer,
  published_at timestamptz,
  visibility catalog.video_visibility not null default 'public',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_title_required check (btrim(title) <> ''),
  constraint videos_duration_non_negative check (duration_seconds is null or duration_seconds >= 0)
);

create index if not exists idx_videos_visibility_created
  on catalog.videos (visibility, created_at desc);

drop trigger if exists trg_videos_set_updated_at on catalog.videos;
create trigger trg_videos_set_updated_at
before update on catalog.videos
for each row execute function private.set_updated_at();

create table if not exists catalog.video_subtitle_tracks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references catalog.videos(id) on delete cascade,
  language_code text not null,
  provider text,
  is_primary boolean not null default false,
  cues jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_subtitle_tracks_version_positive check (version > 0),
  constraint video_subtitle_tracks_cues_array check (jsonb_typeof(cues) = 'array'),
  constraint uq_video_subtitle_track unique (video_id, language_code, version)
);

create index if not exists idx_video_subtitle_tracks_video_lang
  on catalog.video_subtitle_tracks (video_id, language_code, version desc);

drop trigger if exists trg_video_subtitle_tracks_set_updated_at on catalog.video_subtitle_tracks;
create trigger trg_video_subtitle_tracks_set_updated_at
before update on catalog.video_subtitle_tracks
for each row execute function private.set_updated_at();

create table if not exists catalog.card_video_links (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references catalog.cards(id) on delete cascade,
  video_id uuid not null references catalog.videos(id) on delete cascade,
  cue_id text,
  start_seconds numeric(10,3),
  end_seconds numeric(10,3),
  confidence numeric(5,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint card_video_links_time_bounds check (
    start_seconds is null
    or end_seconds is null
    or (start_seconds >= 0 and end_seconds >= start_seconds)
  ),
  constraint card_video_links_confidence_range check (confidence is null or confidence between 0 and 1)
);

create unique index if not exists uq_card_video_links_key
  on catalog.card_video_links (card_id, video_id, coalesce(cue_id, ''));

create index if not exists idx_card_video_links_video on catalog.card_video_links (video_id);

create table if not exists catalog.user_saved_videos (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references catalog.videos(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table if not exists catalog.daily_video_recommendations (
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_date date not null,
  rank smallint not null,
  video_id uuid not null references catalog.videos(id) on delete cascade,
  source text,
  reason jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, recommendation_date, rank),
  constraint daily_video_recommendations_rank_positive check (rank > 0),
  constraint uq_daily_video_recommendation_video unique (user_id, recommendation_date, video_id)
);

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
  constraint user_cards_difficulty_range check (difficulty is null or difficulty between 1 and 10),
  constraint user_cards_due_for_active_states check (
    (
      state in ('learning', 'review', 'relearning')
      and due_at is not null
    )
    or (
      state in ('new', 'suspended', 'archived')
    )
  )
);

create index if not exists idx_user_cards_due
  on learning.user_cards (user_id, due_at)
  where state in ('learning', 'review', 'relearning') and due_at is not null and is_buried = false;

create index if not exists idx_user_cards_state
  on learning.user_cards (user_id, state);

create index if not exists idx_user_cards_collection
  on learning.user_cards (user_id, source_collection_id)
  where source_collection_id is not null;

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

create index if not exists idx_review_sessions_user_state
  on learning.review_sessions (user_id, state, started_at desc);

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

create unique index if not exists uq_user_card_events_client_id
  on learning.user_card_events (user_id, client_event_id)
  where client_event_id is not null;

create index if not exists idx_user_card_events_user_time
  on learning.user_card_events (user_id, event_at desc);

create index if not exists idx_user_card_events_card_time
  on learning.user_card_events (user_id, card_id, event_at desc);

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

create index if not exists idx_daily_activity_rollups_recent
  on progress.daily_activity_rollups (activity_date desc);

drop trigger if exists trg_daily_activity_rollups_set_updated_at on progress.daily_activity_rollups;
create trigger trg_daily_activity_rollups_set_updated_at
before update on progress.daily_activity_rollups
for each row execute function private.set_updated_at();

create table if not exists social.relationships (
  user_low_id uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  initiator_user_id uuid not null references auth.users(id) on delete cascade,
  state social.relationship_state not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  blocked_at timestamptz,
  removed_at timestamptz,
  last_nudge_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_low_id, user_high_id),
  constraint relationships_distinct_users check (user_low_id <> user_high_id),
  constraint relationships_pair_order check (user_low_id::text < user_high_id::text),
  constraint relationships_initiator_in_pair check (initiator_user_id in (user_low_id, user_high_id))
);

create index if not exists idx_relationships_low_state on social.relationships (user_low_id, state);
create index if not exists idx_relationships_high_state on social.relationships (user_high_id, state);

drop trigger if exists trg_relationships_set_updated_at on social.relationships;
create trigger trg_relationships_set_updated_at
before update on social.relationships
for each row execute function private.set_updated_at();

create table if not exists social.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  notification_type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_required check (btrim(notification_type) <> '')
);

create index if not exists idx_notifications_user_created
  on social.notifications (user_id, created_at desc);

create index if not exists idx_notifications_unread
  on social.notifications (user_id)
  where read_at is null;

create table if not exists social.collection_access (
  collection_id uuid not null references catalog.collections(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  access_role social.collection_access_role not null default 'viewer',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (collection_id, grantee_user_id)
);

create index if not exists idx_collection_access_grantee
  on social.collection_access (grantee_user_id, revoked_at);

create table if not exists social.threads (
  id uuid primary key default gen_random_uuid(),
  thread_kind social.thread_kind not null,
  subject_kind social.thread_subject_kind not null,
  subject_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_threads_subject
  on social.threads (subject_kind, subject_id);

drop trigger if exists trg_threads_set_updated_at on social.threads;
create trigger trg_threads_set_updated_at
before update on social.threads
for each row execute function private.set_updated_at();

create table if not exists social.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references social.threads(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  message_kind social.message_kind not null,
  body_text text,
  reply_to_message_id uuid references social.messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_text_required_for_text_kind check (
    (message_kind <> 'text')
    or (body_text is not null and btrim(body_text) <> '')
  )
);

create index if not exists idx_messages_thread_created
  on social.messages (thread_id, created_at);

create table if not exists social.message_assets (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references social.messages(id) on delete cascade,
  asset_kind social.asset_kind not null,
  asset_url text not null,
  mime_type text,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint message_assets_duration_non_negative check (duration_seconds is null or duration_seconds >= 0)
);

create index if not exists idx_message_assets_message on social.message_assets (message_id);

create table if not exists reminder.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  daily_target integer not null default 20,
  reminder_time_local time,
  timezone text not null default 'UTC',
  quiet_hours_start time,
  quiet_hours_end time,
  week_days smallint[] not null default array[1, 2, 3, 4, 5, 6, 7],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_preferences_daily_target_non_negative check (daily_target >= 0)
);

drop trigger if exists trg_reminder_preferences_set_updated_at on reminder.preferences;
create trigger trg_reminder_preferences_set_updated_at
before update on reminder.preferences
for each row execute function private.set_updated_at();

create table if not exists reminder.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  scope reminder.feed_scope not null default 'all_cards',
  collection_id uuid references catalog.collections(id) on delete cascade,
  is_active boolean not null default true,
  expires_at timestamptz,
  rotated_from uuid references reminder.calendar_feeds(id) on delete set null,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminder_calendar_feeds_collection_for_collection_scope check (
    (scope = 'collection' and collection_id is not null)
    or (scope <> 'collection' and collection_id is null)
  )
);

create index if not exists idx_calendar_feeds_user_active
  on reminder.calendar_feeds (user_id, is_active);

create table if not exists reminder.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_push_subscription_endpoint unique (endpoint)
);

create index if not exists idx_push_subscriptions_user_active
  on reminder.push_subscriptions (user_id, is_active);

drop trigger if exists trg_push_subscriptions_set_updated_at on reminder.push_subscriptions;
create trigger trg_push_subscriptions_set_updated_at
before update on reminder.push_subscriptions
for each row execute function private.set_updated_at();

create table if not exists media.user_card_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references catalog.cards(id) on delete cascade,
  media_kind media.media_kind not null,
  media_url text not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_card_media unique (user_id, card_id, media_kind, media_url)
);

create index if not exists idx_user_card_media_user_card
  on media.user_card_media (user_id, card_id);

drop trigger if exists trg_user_card_media_set_updated_at on media.user_card_media;
create trigger trg_user_card_media_set_updated_at
before update on media.user_card_media
for each row execute function private.set_updated_at();

create table if not exists ops.edge_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (key, window_start),
  constraint edge_rate_limits_hits_non_negative check (hits >= 0)
);

create table if not exists ops.job_leases (
  lease_key text primary key,
  holder text,
  lease_until timestamptz not null,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_job_leases_set_updated_at on ops.job_leases;
create trigger trg_job_leases_set_updated_at
before update on ops.job_leases
for each row execute function private.set_updated_at();

create or replace view public.cards_v1 as
select
  c.id,
  c.card_kind,
  c.term,
  c.translation,
  c.transliteration,
  c.example_term,
  c.example_translation,
  c.language_code,
  c.translation_language_code,
  c.difficulty,
  c.frequency_rank,
  c.theme_key,
  c.image_url,
  c.audio_url,
  c.sentence_audio_url,
  c.is_active,
  c.created_at
from catalog.cards c
where c.is_active = true;

create or replace view public.collections_v1 as
select
  co.id,
  co.owner_user_id,
  co.slug,
  co.title,
  co.description,
  co.kind,
  co.visibility,
  co.is_archived,
  co.created_at
from catalog.collections co
where co.is_archived = false;

create or replace view public.collection_cards_v1 as
select
  ci.collection_id,
  ci.card_id,
  ci.position,
  ci.item_metadata
from catalog.collection_items ci;

create or replace view public.videos_v1 as
select
  v.id,
  v.youtube_video_id,
  v.title,
  v.description,
  v.channel_name,
  v.language_code,
  v.dialect,
  v.duration_seconds,
  v.published_at,
  v.visibility,
  v.created_at
from catalog.videos v
where v.visibility in ('public', 'unlisted');

create or replace view public.progress_summary_v1 as
with profile_users as (
  select p.user_id from account.profiles p
),
card_stats as (
  select
    uc.user_id,
    count(*) filter (where uc.state in ('learning', 'review', 'relearning'))::integer as active_cards,
    count(*) filter (
      where uc.state in ('learning', 'review', 'relearning')
        and uc.due_at is not null
        and uc.due_at <= now()
        and uc.is_buried = false
    )::integer as due_cards,
    max(uc.last_reviewed_at) as last_reviewed_at
  from learning.user_cards uc
  group by uc.user_id
),
activity_7d as (
  select
    da.user_id,
    coalesce(sum(da.review_count), 0)::integer as reviews_last_7d,
    coalesce(sum(da.new_card_count), 0)::integer as new_cards_last_7d,
    coalesce(sum(da.time_spent_seconds), 0)::integer as time_spent_seconds_last_7d
  from progress.daily_activity_rollups da
  where da.activity_date >= current_date - 6
  group by da.user_id
)
select
  pu.user_id,
  coalesce(cs.active_cards, 0) as active_cards,
  coalesce(cs.due_cards, 0) as due_cards,
  cs.last_reviewed_at,
  coalesce(a7.reviews_last_7d, 0) as reviews_last_7d,
  coalesce(a7.new_cards_last_7d, 0) as new_cards_last_7d,
  coalesce(a7.time_spent_seconds_last_7d, 0) as time_spent_seconds_last_7d
from profile_users pu
left join card_stats cs on cs.user_id = pu.user_id
left join activity_7d a7 on a7.user_id = pu.user_id;
