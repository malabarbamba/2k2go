-- Baseline v1: reminder + media + ops tables

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
