-- Baseline v1: enums

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
