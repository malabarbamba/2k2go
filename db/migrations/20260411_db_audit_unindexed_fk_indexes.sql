-- DB architecture quality pass — unindexed foreign keys
--
-- Problem
-- -------
-- Twenty foreign key constraints across `account`, `catalog`, `learning`,
-- `media`, `progress`, `public`, `reminder`, and `social` have no backing
-- index on the referencing columns. PostgreSQL does NOT auto-create an
-- index for the referencing side of a foreign key (unlike some other
-- databases), so every one of these becomes a latent performance landmine:
--
--   * DELETE/UPDATE on the referenced parent row triggers a full sequential
--     scan of the child table to enforce ON DELETE / ON UPDATE semantics.
--   * Join planner loses access to an index-nested-loop path when filtering
--     by the FK column.
--   * ANALYZE has to produce wider histograms to serve ad-hoc lookups.
--
-- Fix
-- ---
-- Create one btree index per unindexed FK. Every index is created with
-- `if not exists` and prefixed with `fk_` so the intent is visible in
-- pg_indexes and cannot collide with any future uniqueness or composite
-- index on the same columns. No index is created `concurrently` because
-- this migration is expected to run inside the Supabase migration
-- transaction alongside other DDL; the referencing tables are small
-- enough (reviewed at migration time) that a regular CREATE INDEX is
-- acceptable. Convert to CONCURRENTLY if data volumes grow.
--
-- Source: live DB audit run on 2026-04-11 via the Management API
-- `pg_constraint` / `pg_index` join that looks for FKs whose referencing
-- columns are not a prefix of any existing index on the referencing table.

begin;

-- account
create index if not exists fk_account_user_roles_granted_by
  on account.user_roles (granted_by);

-- catalog
create index if not exists fk_catalog_daily_video_recommendations_video_id
  on catalog.daily_video_recommendations (video_id);
create index if not exists fk_catalog_user_saved_videos_video_id
  on catalog.user_saved_videos (video_id);

-- learning
create index if not exists fk_learning_review_sessions_source_collection_id
  on learning.review_sessions (source_collection_id);
create index if not exists fk_learning_user_card_events_session_id
  on learning.user_card_events (session_id);
create index if not exists fk_learning_user_cards_card_id
  on learning.user_cards (card_id);
create index if not exists fk_learning_user_cards_source_collection_id
  on learning.user_cards (source_collection_id);

-- media
create index if not exists fk_media_user_card_media_card_id
  on media.user_card_media (card_id);

-- progress
create index if not exists fk_progress_user_milestones_source_event_id
  on progress.user_milestones (source_event_id);

-- public (tables that leaked into public but still need indexing;
-- moving them into proper domain schemas is tracked separately).
create index if not exists fk_public_app_v2_session_unique_visitors_first_seen_user_id
  on public.app_v2_session_unique_visitors (first_seen_user_id);
create index if not exists fk_public_preview_session_audio_replies_user_id
  on public.preview_session_audio_replies (user_id);
create index if not exists fk_public_preview_session_text_messages_user_id
  on public.preview_session_text_messages (user_id);

-- reminder
create index if not exists fk_reminder_calendar_feeds_collection_id
  on reminder.calendar_feeds (collection_id);
create index if not exists fk_reminder_calendar_feeds_rotated_from
  on reminder.calendar_feeds (rotated_from);

-- social
create index if not exists fk_social_collection_access_granted_by_user_id
  on social.collection_access (granted_by_user_id);
create index if not exists fk_social_messages_author_user_id
  on social.messages (author_user_id);
create index if not exists fk_social_messages_reply_to_message_id
  on social.messages (reply_to_message_id);
create index if not exists fk_social_notifications_actor_user_id
  on social.notifications (actor_user_id);
create index if not exists fk_social_relationships_initiator_user_id
  on social.relationships (initiator_user_id);
create index if not exists fk_social_threads_created_by_user_id
  on social.threads (created_by_user_id);

commit;
