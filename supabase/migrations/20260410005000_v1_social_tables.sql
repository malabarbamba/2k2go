-- Baseline v1: social tables

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

create table if not exists social.collection_access (
  collection_id uuid not null references catalog.collections(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  access_role social.collection_access_role not null default 'viewer',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (collection_id, grantee_user_id)
);

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
