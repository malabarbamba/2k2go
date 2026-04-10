-- Baseline v1: catalog tables

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
