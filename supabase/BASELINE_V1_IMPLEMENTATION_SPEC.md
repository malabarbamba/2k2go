# Baseline V1 Implementation Spec

This document is the strict implementation artifact for the database redesign around the stronger kernel:

- one canonical card model (`catalog.cards`)
- one canonical collection model (`catalog.collections` + `catalog.collection_items`)
- one canonical user-card state model (`learning.user_cards`)
- one immutable user-card event model (`learning.user_card_events`)

Analytics and GDPR modules are intentionally excluded from baseline V1.

## 1) Concrete Implementation Checklist

### Phase 0 - Contract lock

- [ ] Freeze enum names, table names, and RPC names from this spec.
- [ ] Freeze event taxonomy (`learning.user_card_event_type`) and payload contracts.
- [ ] Freeze source merge precedence for card migration.
- [ ] Freeze decision: only `public` schema is exposed to Supabase API.
- [ ] Freeze decision: FSRS-only scheduling in V1.

### Phase 1 - Baseline schema creation

- [ ] Apply `supabase/BASELINE_V1_SCHEMA.sql` to the new project.
- [ ] Create `public` API views/RPCs in a dedicated migration stage.
- [ ] Enable RLS on all user-owned tables.
- [ ] Apply grants/default privileges (`public` exposed, internal schemas not exposed).
- [ ] Add baseline seed rows for system collections (`foundation-core`, `alphabet-core`).

### Phase 2 - Data migration: account + cards/catalog

- [ ] Migrate `profiles` -> `account.profiles`.
- [ ] Migrate `user_roles` -> `account.user_roles`.
- [ ] Migrate card sources in strict order:
  1. `foundation_deck`
  2. `vocabulary_cards`
  3. `user_vocabulary_cards`
  4. `user_cards` (legacy)
- [ ] Create `catalog.card_origins` rows for every migrated source row.
- [ ] Migrate `videos` + subtitle payloads + card-video links.

### Phase 3 - Data migration: learning kernel

- [ ] Migrate `user_card_state` + `user_vocabulary_progress` -> `learning.user_cards`.
- [ ] Migrate `user_card_reviews` + `user_reviews` (+ card-related activity logs) -> `learning.user_card_events`.
- [ ] Migrate review leases/sessions -> `learning.review_sessions`.
- [ ] Migrate FSRS user profile -> `learning.scheduler_profiles`.

### Phase 4 - Data migration: progression + reminder + social + media

- [ ] Migrate `user_learning_path_progress` -> `progress.learning_path_progress`.
- [ ] Merge accomplishments/state -> `progress.user_milestones`.
- [ ] Rebuild `progress.daily_activity_rollups` from event history.
- [ ] Migrate reminder settings/feeds/subscriptions -> `reminder.*`.
- [ ] Migrate social graph/discussions/sharing -> `social.*`.
- [ ] Migrate `user_vocabulary_card_media` -> `media.user_card_media`.

### Phase 5 - API and app cutover

- [ ] Implement canonical `public` RPC surface (section 4).
- [ ] Regenerate Supabase TS types.
- [ ] Update frontend/edge functions to new RPC contracts.
- [ ] Run parity checks (due count, review history, progression summary, reminders, social counts).

### Phase 6 - Final cutover and cleanup

- [ ] Freeze writes on deprecated objects.
- [ ] Run final delta sync.
- [ ] Switch all runtime env vars to the new project.
- [ ] Remove compatibility wrappers.
- [ ] Archive/drop deprecated objects (section 5).

## 2) Revised Target Schema By Domain

Authoritative DDL draft: `supabase/BASELINE_V1_SCHEMA.sql`

### `account`

- `profiles`
- `user_roles`

### `catalog`

- `cards`
- `card_origins`
- `collections`
- `collection_items`
- `user_collection_state`
- `videos`
- `video_subtitle_tracks`
- `card_video_links`
- `user_saved_videos`
- `daily_video_recommendations`

### `learning`

- `scheduler_profiles`
- `user_cards`
- `review_sessions`
- `user_card_events`

### `progress`

- `learning_path_progress`
- `user_milestones`
- `daily_activity_rollups`
- derived read model: `public.progress_summary_v1`

### `social`

- `relationships`
- `notifications`
- `collection_access`
- `threads`
- `messages`
- `message_assets`

### `reminder`

- `preferences`
- `calendar_feeds`
- `push_subscriptions`

### `media`

- `user_card_media`

### `ops`

- `edge_rate_limits`
- `job_leases`

### `public`

- Versioned views and RPCs only.
- No base product tables.

## 3) Revised Old-To-New Mapping Matrix

### Core card/catalog model

| Old object | New object | Action |
|---|---|---|
| `foundation_deck` | `catalog.cards` + `catalog.collections` + `catalog.collection_items` + `catalog.card_origins` | transform |
| `vocabulary_cards` | `catalog.cards` + `catalog.card_origins` | transform |
| `user_vocabulary_cards` | `catalog.cards` + `catalog.card_origins` + `catalog.collections` + `catalog.collection_items` | transform |
| `user_cards` (legacy) | `catalog.cards` + `catalog.card_origins` + user private collections | transform |
| `vocabulary_card_videos` | `catalog.card_video_links` | transform |
| `videos` | `catalog.videos` | keep |
| `video_subtitle_payloads` | `catalog.video_subtitle_tracks` | transform |

### Learning kernel

| Old object | New object | Action |
|---|---|---|
| `user_card_state` | `learning.user_cards` | transform |
| `user_vocabulary_progress` | `learning.user_cards` | merge |
| `user_card_reviews` | `learning.user_card_events` | transform (`event_type='reviewed'`) |
| `user_reviews` | `learning.user_card_events` | merge (`event_type='reviewed'`) |
| card-related `user_activity_log` | `learning.user_card_events` | transform |
| `review_session_leases` + preview session tables | `learning.review_sessions` | transform |
| `user_fsrs_active_weights` | `learning.scheduler_profiles` | transform |

### Progression

| Old object | New object | Action |
|---|---|---|
| `user_learning_path_progress` | `progress.learning_path_progress` | keep/rename |
| `user_accomplishments` + `user_accomplishment_states` | `progress.user_milestones` | merge |
| `user_daily_activity` | `progress.daily_activity_rollups` | rebuild from events |
| `user_learning_progress` + `user_stats` + `user_dashboard_progress` + `user_stats_full` | derived `public.progress_summary_v1` | remove mutable summary tables |

### Social/sharing/discussion

| Old object | New object | Action |
|---|---|---|
| `friend_requests` + `friendships` + `friend_streak_nudge_guards` | `social.relationships` | merge |
| `user_notifications` | `social.notifications` | keep |
| `user_shared_decks` + recipients + hidden table | `catalog.collections` + `social.collection_access` + `catalog.user_collection_state` | transform |
| preview text/audio discussion tables | `social.threads` + `social.messages` + `social.message_assets` | transform |

### Reminder/media/ops

| Old object | New object | Action |
|---|---|---|
| `user_review_reminder_preferences` | `reminder.preferences` | keep |
| `user_review_calendar_feeds` | `reminder.calendar_feeds` | keep |
| `user_review_web_push_subscriptions` | `reminder.push_subscriptions` | keep |
| `user_vocabulary_card_media` | `media.user_card_media` | keep |
| `edge_rate_limits` | `ops.edge_rate_limits` | keep |

## 4) Revised Canonical RPC Surface

### Account/profile

- `upsert_my_profile_v1`
- `get_my_profile_v1`

### Catalog/collections

- `search_cards_v1`
- `upsert_private_card_v1`
- `collect_subtitle_card_v1`
- `upsert_collection_v1`
- `set_user_collection_state_v1`
- `set_collection_access_v1`
- `list_visible_collections_v1`

### Learning kernel

- `log_user_card_event_v1`
- `get_due_count_v1`
- `get_due_queue_v1`
- `start_review_session_v1`
- `submit_review_batch_v1`

### Progression

- `upsert_learning_path_progress_v1`
- `sync_user_milestones_v1`
- `mark_milestone_notified_v1`
- `get_progress_summary_v1`

### Social/discussion

- `set_relationship_v1`
- `get_profile_connection_context_v1`
- `create_thread_v1`
- `create_message_v1`
- `list_thread_messages_v1`

### Reminder/media

- `upsert_reminder_preferences_v1`
- `rotate_calendar_feed_v1`
- `upsert_push_subscription_v1`
- `delete_push_subscription_v1`
- `upsert_user_card_media_v1`

## 5) Revised Deprecated List

### Drop after cutover

- Legacy card storage: `foundation_deck`, `vocabulary_cards`, `user_vocabulary_cards`, `user_cards`.
- Legacy scheduler state/history: `user_vocabulary_progress`, `user_card_state`, `user_reviews`, `user_card_reviews`.
- Mutable summary tables: `user_learning_progress`, `user_stats`, `user_dashboard_progress`, `user_stats_full`.
- Split social model: `friend_requests`, `friendships`, `friend_streak_nudge_guards`, `profile_follows`.
- Split discussion tables: preview text/audio legacy tables.
- Deck-sharing legacy tables: `user_shared_decks`, `user_shared_deck_recipients`, `user_hidden_shared_decks`.
- Analytics/GDPR/marketing baggage: all excluded in V1 baseline.

### Keep only as migration source (not runtime)

- `review_reminder_dispatch_runs`, `review_reminder_delivery_attempts` (optional archival).
- Any old compatibility views/RPC wrappers used during cutover.

## 6) Enum List

Authoritative enum DDL is in `supabase/BASELINE_V1_SCHEMA.sql`.

- `catalog.card_kind`: `vocabulary`, `phrase`, `sentence`
- `catalog.origin_kind`: `foundation_seed`, `video_extracted`, `user_import`, `legacy_user_card`, `manual_entry`, `collection_seed`
- `catalog.collection_kind`: `system_foundation`, `system_alphabet`, `user_private`, `user_shared`, `user_import`
- `catalog.collection_visibility`: `system`, `private`, `shared`, `public`
- `catalog.user_collection_state_kind`: `active`, `hidden`, `archived`
- `catalog.video_visibility`: `private`, `unlisted`, `public`
- `learning.user_card_state_kind`: `new`, `learning`, `review`, `relearning`, `suspended`, `archived`
- `learning.user_card_event_type`: `seeded_from_collection`, `seen`, `added_to_learning`, `reviewed`, `rescheduled`, `removed_from_learning`, `suspended`, `unsuspended`, `assessment_submitted`, `media_attached`, `media_removed`, `note_updated`
- `learning.review_session_kind`: `review`, `preview`
- `learning.review_session_state`: `open`, `completed`, `expired`, `cancelled`
- `progress.path_step_one_choice`: `can_read`, `needs_alphabet`, `quiz_can_read`, `quiz_needs_alphabet`
- `social.relationship_state`: `pending`, `accepted`, `declined`, `blocked`, `removed`
- `social.collection_access_role`: `viewer`, `contributor`, `editor`
- `social.thread_kind`: `preview_discussion`, `collection_discussion`, `direct`
- `social.thread_subject_kind`: `collection`, `review_session`, `card`, `video`, `relationship`
- `social.message_kind`: `text`, `audio`, `system`
- `social.asset_kind`: `audio`, `image`, `file`
- `reminder.feed_scope`: `all_cards`, `review_only`, `collection`
- `media.media_kind`: `image`, `audio`, `note`

## 7) Event Taxonomy (`learning.user_card_events`)

Event rows are immutable and append-only.

| Event type | Required columns | Required payload keys | State impact |
|---|---|---|---|
| `seeded_from_collection` | `user_id`, `card_id`, `event_at` | `collection_id`, `seed_reason` | creates/initializes `learning.user_cards` row |
| `seen` | `user_id`, `card_id`, `event_at` | `surface`, `context` | sets `first_seen_at` if null |
| `added_to_learning` | `user_id`, `card_id`, `event_at` | `collection_id`, `source` | marks active learning state |
| `reviewed` | `user_id`, `card_id`, `event_at`, `rating`, `fsrs_before`, `fsrs_after` | `review_kind`, `scheduler_version`, `client_review_id` | updates FSRS fields on `learning.user_cards` |
| `rescheduled` | `user_id`, `card_id`, `event_at` | `reason`, `old_due_at`, `new_due_at` | updates `due_at` |
| `removed_from_learning` | `user_id`, `card_id`, `event_at` | `reason` | sets `state='archived'` or removes from active queue |
| `suspended` | `user_id`, `card_id`, `event_at` | `reason` | sets `state='suspended'` |
| `unsuspended` | `user_id`, `card_id`, `event_at` | `reason` | restores previous active state |
| `assessment_submitted` | `user_id`, `card_id`, `event_at` | `assessment_type`, `score` | optional onboarding/path milestone updates |
| `media_attached` | `user_id`, `card_id`, `event_at` | `media_id`, `media_kind` | no FSRS change |
| `media_removed` | `user_id`, `card_id`, `event_at` | `media_id`, `media_kind` | no FSRS change |
| `note_updated` | `user_id`, `card_id`, `event_at` | `note_hash` | no FSRS change |

Rules:

- `client_event_id` must be unique per `user_id` for idempotency.
- `reviewed` events must include `rating` in `[0..5]`.
- `reviewed` events must include both `fsrs_before` and `fsrs_after` snapshots.

## 8) Exact Old-To-New Card Merge Rules

### Shared normalization functions

- `norm_ar(text)`: remove Arabic diacritics/tatweel, normalize alif/hamza variants, trim spaces.
- `norm_text(text)`: lowercase + unaccent + trim + collapse whitespace.

### Fingerprints

- `system_fingerprint = sha256(norm_ar(term) || '|' || coalesce(norm_text(translation), '') || '|' || coalesce(norm_text(transliteration), ''))`
- `user_fingerprint = sha256(user_id || '|' || norm_ar(term) || '|' || coalesce(norm_text(translation), '') || '|' || coalesce(norm_text(transliteration), ''))`

### Merge precedence (strict)

1. `foundation_deck`
2. `vocabulary_cards`
3. `user_vocabulary_cards`
4. `user_cards` (legacy)

### Source-specific mapping

#### A) `foundation_deck`

- Owner: `owner_user_id = NULL` (system card).
- Field mapping:
  - `term <- word_ar`
  - `translation <- word_fr`
  - `transliteration <- transliteration`
  - `example_term <- example_sentence_ar`
  - `example_translation <- example_sentence_fr`
  - `frequency_rank <- frequency_rank`
  - `metadata.category <- category`
- Insert into system collection `foundation-core` with `position = frequency_rank`.
- Always add origin row with:
  - `origin_kind='foundation_seed'`
  - `source_table='foundation_deck'`
  - `source_id=<foundation_deck.id>`

#### B) `vocabulary_cards`

- Owner: `owner_user_id = NULL`.
- Match by `system_fingerprint`; create if no match.
- Fill-null strategy only (do not erase existing populated fields from higher-priority source):
  - fill `transliteration`, examples, theme/media metadata when target is null.
- Add origin row:
  - `origin_kind='video_extracted'`
  - `source_table='vocabulary_cards'`
  - `source_id=<vocabulary_cards.id>`
- If `video_id` exists, add row in `catalog.card_video_links`.

#### C) `user_vocabulary_cards`

- If `visibility='private'`: always create/merge user-owned card using `user_fingerprint`.
- Else if `canonical_vocabulary_card_id` resolves to migrated system card and no user override fields are present, reuse system card.
- User override is true if any of the following differ from resolved system card:
  - `translation_fr`
  - `example_sentence_ar`
  - `word_ar`
- If override=true, create/merge user-owned card using `user_fingerprint`.
- Add origin row:
  - `origin_kind='user_import'`
  - `source_table='user_vocabulary_cards'`
  - `source_id=<user_vocabulary_cards.id>`
- Ensure source card is included in the user import collection for that user.

#### D) `user_cards` (legacy)

- Always migrate into user-owned cards (`owner_user_id = user_id`).
- Mapping:
  - `term <- coalesce(nullif(vocab_base,''), vocab_full)`
  - `translation <- NULL`
  - `transliteration <- NULL`
  - `example_term <- coalesce(nullif(sent_base,''), sent_full)`
  - `metadata.legacy.vocab_full <- vocab_full`
  - `metadata.legacy.sent_full <- sent_full`
  - `metadata.category <- category`
  - `metadata.subcategory <- subcategory`
  - `metadata.difficulty <- difficulty`
- Merge key: `user_fingerprint` with `translation=''` fallback.
- Add origin row:
  - `origin_kind='legacy_user_card'`
  - `source_table='user_cards'`
  - `source_id=<user_cards.id>`
- Insert into per-user legacy collection (`legacy-user-cards-{user_id}`).

### Conflict resolution within a merged card

- `created_at`: keep earliest timestamp.
- `term`: keep value from highest-priority source.
- `translation`: keep first non-null by priority.
- `transliteration`: keep first non-null by priority.
- Examples: keep first non-null by priority.
- `frequency_rank`: keep minimum positive value.
- Keep all origin rows even when merged into one canonical card.

## 9) Migration SQL Order

Recommended migration file order (new project, clean baseline):

1. `20260410000100_v1_schemas_extensions.sql`
2. `20260410000200_v1_enums.sql`
3. `20260410000300_v1_private_helpers.sql`
4. `20260410001000_v1_account_tables.sql`
5. `20260410002000_v1_catalog_tables.sql`
6. `20260410003000_v1_learning_tables.sql`
7. `20260410004000_v1_progress_tables.sql`
8. `20260410005000_v1_social_tables.sql`
9. `20260410006000_v1_reminder_media_ops_tables.sql`
10. `20260410007000_v1_indexes.sql`
11. `20260410008000_v1_rls_and_grants.sql`
12. `20260410009000_v1_public_views.sql`
13. `20260410010000_v1_public_rpcs.sql`
14. `20260410020000_v1_data_migrate_account.sql`
15. `20260410021000_v1_data_migrate_cards_foundation.sql`
16. `20260410022000_v1_data_migrate_cards_vocab.sql`
17. `20260410023000_v1_data_migrate_cards_user_vocab.sql`
18. `20260410024000_v1_data_migrate_cards_legacy_user_cards.sql`
19. `20260410025000_v1_data_migrate_learning_state.sql`
20. `20260410026000_v1_data_migrate_learning_events.sql`
21. `20260410027000_v1_data_migrate_progress_reminder_social_media.sql`
22. `20260410028000_v1_rebuild_projections.sql`
23. `20260410029000_v1_compat_views_wrappers.sql` (temporary)
24. `20260410030000_v1_deprecations_freeze.sql` (after cutover)

## 10) Cutover Checklist

### Pre-cutover

- [ ] Export old project schema snapshot.
- [ ] Export old project row counts by table.
- [ ] Run migration dry-run in staging with production-like snapshot.
- [ ] Generate parity report for 100+ sampled users.

### Cutover execution

- [ ] Pause scheduled writes on old project.
- [ ] Run final delta sync migrations.
- [ ] Deploy new edge functions and `public` RPC layer.
- [ ] Switch app env to new Supabase URL + anon key.
- [ ] Regenerate frontend DB types and redeploy frontend.

### Post-cutover validation

- [ ] Authentication and profile bootstrap success.
- [ ] Card search returns expected counts.
- [ ] Due queue and due count parity within accepted threshold.
- [ ] Review submission writes both `learning.user_cards` and `learning.user_card_events` correctly.
- [ ] Reminder settings and calendar feed links functional.
- [ ] Social requests/friendships/discussions visible and writable.
- [ ] No critical error spikes in edge function logs.

### Cleanup

- [ ] Freeze old legacy tables to read-only.
- [ ] Remove temporary compatibility wrappers.
- [ ] Archive then drop deprecated objects.
- [ ] Update architecture docs and contributor docs with new model.

## 11) Full Old-Table Inventory Mapping (table-by-table)

Legend for action:

- `transform`: migrate data into new canonical model
- `derive`: replace by view/read model
- `drop`: do not migrate into baseline V1

| Old table | New target | Action |
|---|---|---|
| `admin_2fa_codes` | none | drop |
| `admin_action_audit_log` | none | drop |
| `alphabet_quiz_attempts` | `learning.user_card_events` (`assessment_submitted`) | transform |
| `alphabet_quiz_word_bank` | `catalog.collections` + `catalog.collection_items` | transform |
| `alphabet_task_overrides` | `catalog.collection_items.item_metadata` | transform |
| `analytics_events` | none | drop |
| `analytics_ingestion_health` | none | drop |
| `app_v2_session_unique_visitors` | none | drop |
| `click_events` | none | drop |
| `cohorts` | none | drop |
| `community_user_vocabulary_cards_v1` | `public.cards_v1`/shared collection read model | derive |
| `deck_download_rate_limits` | none | drop |
| `deck_downloads` | none | drop |
| `development_plan_items` | none | drop |
| `edge_rate_limits` | `ops.edge_rate_limits` | transform |
| `foundation_deck` | `catalog.cards` + `catalog.collections` + `catalog.collection_items` + `catalog.card_origins` | transform |
| `friend_requests` | `social.relationships` | transform |
| `friend_streak_nudge_guards` | `social.relationships.metadata` | transform |
| `friendships` | `social.relationships` | transform |
| `fsrs_optimizer_trigger_leases` | none | drop |
| `gdpr_cleanup_runs` | none | drop |
| `gdpr_deletion_log` | none | drop |
| `gdpr_export_requests` | none | drop |
| `home_hero_cta_variants` | none | drop |
| `lexicon_entries` | none (future optional module) | drop |
| `page_views` | none | drop |
| `preview_session_audio_posts` | `social.threads` + `social.messages` + `social.message_assets` | transform |
| `preview_session_audio_replies` | `social.threads` + `social.messages` + `social.message_assets` | transform |
| `preview_session_audio_share_dispatches` | none | drop |
| `preview_session_text_messages` | `social.threads` + `social.messages` | transform |
| `pro_capacity` | none | drop |
| `pro_requests` | none | drop |
| `pro_waitlist` | none | drop |
| `profile_follows` | none | drop |
| `profiles` | `account.profiles` | transform |
| `published_videos_with_cards` | `public.videos_v1` | derive |
| `ramadan_periods` | none | drop |
| `review_preview_onboarding_sessions` | `learning.review_sessions` (`session_kind='preview'`) | transform |
| `review_reminder_delivery_attempts` | none | drop |
| `review_reminder_dispatch_runs` | none | drop |
| `review_session_leases` | `learning.review_sessions` (`session_kind='review'`) | transform |
| `scheduler_shadow_diff_events` | none | drop |
| `scheduler_shadow_diff_flags` | none | drop |
| `short_comments` | none | drop |
| `short_reactions` | none | drop |
| `signup_otp_codes` | none | drop |
| `subtitle_word_occurrences` | none (future optional module) | drop |
| `suggestions` | none | drop |
| `user_accomplishment_states` | `progress.user_milestones` | transform |
| `user_accomplishments` | `progress.user_milestones` | transform |
| `user_activity_log` | `learning.user_card_events` + `progress.daily_activity_rollups` | transform |
| `user_card_reviews` | `learning.user_card_events` (`reviewed`) | transform |
| `user_card_state` | `learning.user_cards` | transform |
| `user_cards` | `catalog.cards` + `catalog.card_origins` + user private collections | transform |
| `user_daily_activity` | `progress.daily_activity_rollups` | transform |
| `user_daily_immersion_recommendations` | `catalog.daily_video_recommendations` | transform |
| `user_dashboard_progress` | `public.progress_summary_v1` | derive |
| `user_due_count_cache` | none | drop |
| `user_foundation_daily_seed` | none | drop |
| `user_fsrs_active_weights` | `learning.scheduler_profiles` | transform |
| `user_fsrs_optimizer_jobs` | none | drop |
| `user_fsrs_optimizer_schedules` | none | drop |
| `user_fsrs_weight_versions` | none | drop |
| `user_hidden_shared_decks` | `catalog.user_collection_state` | transform |
| `user_learning_path_progress` | `progress.learning_path_progress` | transform |
| `user_learning_progress` | `public.progress_summary_v1` | derive |
| `user_notifications` | `social.notifications` | transform |
| `user_objectives` | none | drop |
| `user_personal_immersion_videos` | `catalog.user_saved_videos` | transform |
| `user_professors` | none | drop |
| `user_review_calendar_feeds` | `reminder.calendar_feeds` | transform |
| `user_review_reminder_preferences` | `reminder.preferences` | transform |
| `user_review_web_push_subscriptions` | `reminder.push_subscriptions` | transform |
| `user_reviews` | `learning.user_card_events` (`reviewed`) | transform |
| `user_roles` | `account.user_roles` | transform |
| `user_shared_deck_recipients` | `social.collection_access` | transform |
| `user_shared_decks` | `catalog.collections` | transform |
| `user_stats` | `public.progress_summary_v1` | derive |
| `user_stats_full` | `public.progress_summary_v1` | derive |
| `user_type_audit_log` | none | drop |
| `user_vocabulary_card_media` | `media.user_card_media` | transform |
| `user_vocabulary_cards` | `catalog.cards` + `catalog.card_origins` + user import collections | transform |
| `user_vocabulary_progress` | `learning.user_cards` | transform |
| `video_subtitle_payloads` | `catalog.video_subtitle_tracks` | transform |
| `videos` | `catalog.videos` | transform |
| `videos_list` | `public.videos_v1` | derive |
| `visitor_sessions` | none | drop |
| `vocabulary_card_videos` | `catalog.card_video_links` | transform |
| `vocabulary_cards` | `catalog.cards` + `catalog.card_origins` | transform |
| `vocabulary_themes` | `catalog.cards.theme_key` + metadata | transform |
| `word_import_signal_daily` | none | drop |
| `word_import_signals` | none | drop |
