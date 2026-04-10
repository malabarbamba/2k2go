-- Baseline v1: indexes

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
create index if not exists idx_cards_theme on catalog.cards (theme_key) where theme_key is not null;
create index if not exists idx_cards_term_trgm on catalog.cards using gin (normalized_term gin_trgm_ops);
create index if not exists idx_cards_translation_trgm on catalog.cards using gin (normalized_translation gin_trgm_ops);
create index if not exists idx_cards_translit_trgm on catalog.cards using gin (normalized_transliteration gin_trgm_ops);

create index if not exists idx_card_origins_card_id on catalog.card_origins (card_id);
create index if not exists idx_card_origins_source_user on catalog.card_origins (source_user_id) where source_user_id is not null;

create unique index if not exists uq_collections_slug
  on catalog.collections (lower(slug))
  where slug is not null;

create index if not exists idx_collections_owner on catalog.collections (owner_user_id) where owner_user_id is not null;
create index if not exists idx_collections_visibility_kind on catalog.collections (visibility, kind) where is_archived = false;

create unique index if not exists uq_collection_items_position
  on catalog.collection_items (collection_id, position);

create index if not exists idx_collection_items_card_id on catalog.collection_items (card_id);

create index if not exists idx_user_collection_state_collection
  on catalog.user_collection_state (collection_id, state);

create index if not exists idx_videos_visibility_created
  on catalog.videos (visibility, created_at desc);

create index if not exists idx_videos_owner
  on catalog.videos (owner_user_id)
  where owner_user_id is not null;

create index if not exists idx_video_subtitle_tracks_video_lang
  on catalog.video_subtitle_tracks (video_id, language_code, version desc);

create unique index if not exists uq_card_video_links_key
  on catalog.card_video_links (card_id, video_id, coalesce(cue_id, ''));

create index if not exists idx_card_video_links_video on catalog.card_video_links (video_id);

create index if not exists idx_daily_video_recommendations_date
  on catalog.daily_video_recommendations (recommendation_date desc);

create index if not exists idx_user_cards_due
  on learning.user_cards (user_id, due_at)
  where state in ('learning', 'review', 'relearning') and due_at is not null and is_buried = false;

create index if not exists idx_user_cards_state
  on learning.user_cards (user_id, state);

create index if not exists idx_user_cards_last_reviewed
  on learning.user_cards (user_id, last_reviewed_at desc)
  where last_reviewed_at is not null;

create index if not exists idx_user_cards_collection
  on learning.user_cards (user_id, source_collection_id)
  where source_collection_id is not null;

create unique index if not exists uq_user_card_events_client_id
  on learning.user_card_events (user_id, client_event_id)
  where client_event_id is not null;

create index if not exists idx_user_card_events_user_time
  on learning.user_card_events (user_id, event_at desc);

create index if not exists idx_user_card_events_card_time
  on learning.user_card_events (user_id, card_id, event_at desc);

create index if not exists idx_review_sessions_user_state
  on learning.review_sessions (user_id, state, started_at desc);

create index if not exists idx_review_sessions_lease
  on learning.review_sessions (leased_until)
  where state = 'open' and leased_until is not null;

create index if not exists idx_daily_activity_rollups_recent
  on progress.daily_activity_rollups (activity_date desc);

create index if not exists idx_relationships_low_state
  on social.relationships (user_low_id, state);

create index if not exists idx_relationships_high_state
  on social.relationships (user_high_id, state);

create index if not exists idx_notifications_user_created
  on social.notifications (user_id, created_at desc);

create index if not exists idx_notifications_unread
  on social.notifications (user_id)
  where read_at is null;

create index if not exists idx_collection_access_grantee
  on social.collection_access (grantee_user_id, revoked_at);

create index if not exists idx_threads_subject
  on social.threads (subject_kind, subject_id);

create index if not exists idx_messages_thread_created
  on social.messages (thread_id, created_at);

create index if not exists idx_message_assets_message
  on social.message_assets (message_id);

create index if not exists idx_calendar_feeds_user_active
  on reminder.calendar_feeds (user_id, is_active);

create index if not exists idx_push_subscriptions_user_active
  on reminder.push_subscriptions (user_id, is_active);

create index if not exists idx_user_card_media_user_card
  on media.user_card_media (user_id, card_id);

create index if not exists idx_edge_rate_limits_updated
  on ops.edge_rate_limits (updated_at desc);
