-- Baseline v1: RLS and grants

revoke all on schema private from public;
revoke all on schema account from public;
revoke all on schema catalog from public;
revoke all on schema learning from public;
revoke all on schema progress from public;
revoke all on schema social from public;
revoke all on schema reminder from public;
revoke all on schema media from public;
revoke all on schema ops from public;

grant usage on schema account, catalog, learning, progress, social, reminder, media to authenticated;
grant usage on schema catalog to anon;

alter table account.profiles enable row level security;
alter table account.profiles force row level security;

drop policy if exists p_profiles_select_own on account.profiles;
create policy p_profiles_select_own
on account.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists p_profiles_insert_own on account.profiles;
create policy p_profiles_insert_own
on account.profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists p_profiles_update_own on account.profiles;
create policy p_profiles_update_own
on account.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table account.user_roles enable row level security;
alter table account.user_roles force row level security;

drop policy if exists p_user_roles_select_own on account.user_roles;
create policy p_user_roles_select_own
on account.user_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

alter table catalog.cards enable row level security;
alter table catalog.cards force row level security;

drop policy if exists p_cards_select_anon on catalog.cards;
create policy p_cards_select_anon
on catalog.cards
for select
to anon
using (owner_user_id is null and is_active = true);

drop policy if exists p_cards_select_auth on catalog.cards;
create policy p_cards_select_auth
on catalog.cards
for select
to authenticated
using ((owner_user_id is null and is_active = true) or owner_user_id = (select auth.uid()));

drop policy if exists p_cards_insert_own on catalog.cards;
create policy p_cards_insert_own
on catalog.cards
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

drop policy if exists p_cards_update_own on catalog.cards;
create policy p_cards_update_own
on catalog.cards
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists p_cards_delete_own on catalog.cards;
create policy p_cards_delete_own
on catalog.cards
for delete
to authenticated
using (owner_user_id = (select auth.uid()));

alter table catalog.card_origins enable row level security;
alter table catalog.card_origins force row level security;

drop policy if exists p_card_origins_select_auth on catalog.card_origins;
create policy p_card_origins_select_auth
on catalog.card_origins
for select
to authenticated
using (
  exists (
    select 1
    from catalog.cards c
    where c.id = card_origins.card_id
      and ((c.owner_user_id is null and c.is_active = true) or c.owner_user_id = (select auth.uid()))
  )
);

alter table catalog.collections enable row level security;
alter table catalog.collections force row level security;

drop policy if exists p_collections_select_anon on catalog.collections;
create policy p_collections_select_anon
on catalog.collections
for select
to anon
using (visibility in ('system', 'public') and is_archived = false);

drop policy if exists p_collections_select_auth on catalog.collections;
create policy p_collections_select_auth
on catalog.collections
for select
to authenticated
using (
  (
    visibility in ('system', 'public')
    and is_archived = false
  )
  or owner_user_id = (select auth.uid())
  or exists (
    select 1
    from social.collection_access ca
    where ca.collection_id = collections.id
      and ca.grantee_user_id = (select auth.uid())
      and ca.revoked_at is null
  )
);

drop policy if exists p_collections_insert_own on catalog.collections;
create policy p_collections_insert_own
on catalog.collections
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and kind not in ('system_foundation', 'system_alphabet')
);

drop policy if exists p_collections_update_own on catalog.collections;
create policy p_collections_update_own
on catalog.collections
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists p_collections_delete_own on catalog.collections;
create policy p_collections_delete_own
on catalog.collections
for delete
to authenticated
using (owner_user_id = (select auth.uid()));

alter table catalog.collection_items enable row level security;
alter table catalog.collection_items force row level security;

drop policy if exists p_collection_items_select_anon on catalog.collection_items;
create policy p_collection_items_select_anon
on catalog.collection_items
for select
to anon
using (
  exists (
    select 1 from catalog.collections c
    where c.id = collection_items.collection_id
      and c.visibility in ('system', 'public')
      and c.is_archived = false
  )
);

drop policy if exists p_collection_items_select_auth on catalog.collection_items;
create policy p_collection_items_select_auth
on catalog.collection_items
for select
to authenticated
using (
  exists (
    select 1 from catalog.collections c
    where c.id = collection_items.collection_id
      and (
        (c.visibility in ('system', 'public') and c.is_archived = false)
        or c.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from social.collection_access ca
          where ca.collection_id = c.id
            and ca.grantee_user_id = (select auth.uid())
            and ca.revoked_at is null
        )
      )
  )
);

drop policy if exists p_collection_items_mutate_owner on catalog.collection_items;
create policy p_collection_items_mutate_owner
on catalog.collection_items
for all
to authenticated
using (
  exists (
    select 1 from catalog.collections c
    where c.id = collection_items.collection_id
      and c.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from catalog.collections c
    where c.id = collection_items.collection_id
      and c.owner_user_id = (select auth.uid())
  )
);

alter table catalog.user_collection_state enable row level security;
alter table catalog.user_collection_state force row level security;

drop policy if exists p_user_collection_state_all_own on catalog.user_collection_state;
create policy p_user_collection_state_all_own
on catalog.user_collection_state
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table catalog.videos enable row level security;
alter table catalog.videos force row level security;

drop policy if exists p_videos_select_anon on catalog.videos;
create policy p_videos_select_anon
on catalog.videos
for select
to anon
using (visibility in ('public', 'unlisted'));

drop policy if exists p_videos_select_auth on catalog.videos;
create policy p_videos_select_auth
on catalog.videos
for select
to authenticated
using (visibility in ('public', 'unlisted') or owner_user_id = (select auth.uid()));

drop policy if exists p_videos_mutate_owner on catalog.videos;
create policy p_videos_mutate_owner
on catalog.videos
for all
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

alter table catalog.video_subtitle_tracks enable row level security;
alter table catalog.video_subtitle_tracks force row level security;

drop policy if exists p_subtitle_tracks_select on catalog.video_subtitle_tracks;
create policy p_subtitle_tracks_select
on catalog.video_subtitle_tracks
for select
to anon, authenticated
using (
  exists (
    select 1 from catalog.videos v
    where v.id = video_subtitle_tracks.video_id
      and (
        v.visibility in ('public', 'unlisted')
        or v.owner_user_id = (select auth.uid())
      )
  )
);

drop policy if exists p_subtitle_tracks_mutate_owner on catalog.video_subtitle_tracks;
create policy p_subtitle_tracks_mutate_owner
on catalog.video_subtitle_tracks
for all
to authenticated
using (
  exists (
    select 1 from catalog.videos v
    where v.id = video_subtitle_tracks.video_id
      and v.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from catalog.videos v
    where v.id = video_subtitle_tracks.video_id
      and v.owner_user_id = (select auth.uid())
  )
);

alter table catalog.card_video_links enable row level security;
alter table catalog.card_video_links force row level security;

drop policy if exists p_card_video_links_select on catalog.card_video_links;
create policy p_card_video_links_select
on catalog.card_video_links
for select
to anon, authenticated
using (
  exists (
    select 1 from catalog.cards c
    where c.id = card_video_links.card_id
      and ((c.owner_user_id is null and c.is_active = true) or c.owner_user_id = (select auth.uid()))
  )
);

drop policy if exists p_card_video_links_mutate_owner on catalog.card_video_links;
create policy p_card_video_links_mutate_owner
on catalog.card_video_links
for all
to authenticated
using (
  exists (
    select 1 from catalog.cards c
    where c.id = card_video_links.card_id
      and c.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from catalog.cards c
    where c.id = card_video_links.card_id
      and c.owner_user_id = (select auth.uid())
  )
);

alter table catalog.user_saved_videos enable row level security;
alter table catalog.user_saved_videos force row level security;

drop policy if exists p_user_saved_videos_all_own on catalog.user_saved_videos;
create policy p_user_saved_videos_all_own
on catalog.user_saved_videos
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table catalog.daily_video_recommendations enable row level security;
alter table catalog.daily_video_recommendations force row level security;

drop policy if exists p_daily_video_reco_all_own on catalog.daily_video_recommendations;
create policy p_daily_video_reco_all_own
on catalog.daily_video_recommendations
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table learning.scheduler_profiles enable row level security;
alter table learning.scheduler_profiles force row level security;

drop policy if exists p_scheduler_profiles_all_own on learning.scheduler_profiles;
create policy p_scheduler_profiles_all_own
on learning.scheduler_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table learning.user_cards enable row level security;
alter table learning.user_cards force row level security;

drop policy if exists p_user_cards_all_own on learning.user_cards;
create policy p_user_cards_all_own
on learning.user_cards
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table learning.review_sessions enable row level security;
alter table learning.review_sessions force row level security;

drop policy if exists p_review_sessions_all_own on learning.review_sessions;
create policy p_review_sessions_all_own
on learning.review_sessions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table learning.user_card_events enable row level security;
alter table learning.user_card_events force row level security;

drop policy if exists p_user_card_events_select_own on learning.user_card_events;
create policy p_user_card_events_select_own
on learning.user_card_events
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists p_user_card_events_insert_own on learning.user_card_events;
create policy p_user_card_events_insert_own
on learning.user_card_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

alter table progress.learning_path_progress enable row level security;
alter table progress.learning_path_progress force row level security;

drop policy if exists p_learning_path_all_own on progress.learning_path_progress;
create policy p_learning_path_all_own
on progress.learning_path_progress
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table progress.user_milestones enable row level security;
alter table progress.user_milestones force row level security;

drop policy if exists p_user_milestones_all_own on progress.user_milestones;
create policy p_user_milestones_all_own
on progress.user_milestones
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table progress.daily_activity_rollups enable row level security;
alter table progress.daily_activity_rollups force row level security;

drop policy if exists p_daily_activity_all_own on progress.daily_activity_rollups;
create policy p_daily_activity_all_own
on progress.daily_activity_rollups
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table social.relationships enable row level security;
alter table social.relationships force row level security;

drop policy if exists p_relationships_select_in_pair on social.relationships;
create policy p_relationships_select_in_pair
on social.relationships
for select
to authenticated
using ((select auth.uid()) in (user_low_id, user_high_id));

drop policy if exists p_relationships_insert_in_pair on social.relationships;
create policy p_relationships_insert_in_pair
on social.relationships
for insert
to authenticated
with check (
  (select auth.uid()) in (user_low_id, user_high_id)
  and initiator_user_id = (select auth.uid())
);

drop policy if exists p_relationships_update_in_pair on social.relationships;
create policy p_relationships_update_in_pair
on social.relationships
for update
to authenticated
using ((select auth.uid()) in (user_low_id, user_high_id))
with check ((select auth.uid()) in (user_low_id, user_high_id));

alter table social.notifications enable row level security;
alter table social.notifications force row level security;

drop policy if exists p_notifications_select_own on social.notifications;
create policy p_notifications_select_own
on social.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists p_notifications_update_own on social.notifications;
create policy p_notifications_update_own
on social.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists p_notifications_insert_actor on social.notifications;
create policy p_notifications_insert_actor
on social.notifications
for insert
to authenticated
with check ((select auth.uid()) = actor_user_id);

alter table social.collection_access enable row level security;
alter table social.collection_access force row level security;

drop policy if exists p_collection_access_select on social.collection_access;
create policy p_collection_access_select
on social.collection_access
for select
to authenticated
using (
  grantee_user_id = (select auth.uid())
  or exists (
    select 1 from catalog.collections c
    where c.id = collection_access.collection_id
      and c.owner_user_id = (select auth.uid())
  )
);

drop policy if exists p_collection_access_mutate_owner on social.collection_access;
create policy p_collection_access_mutate_owner
on social.collection_access
for all
to authenticated
using (
  exists (
    select 1 from catalog.collections c
    where c.id = collection_access.collection_id
      and c.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from catalog.collections c
    where c.id = collection_access.collection_id
      and c.owner_user_id = (select auth.uid())
  )
);

alter table social.threads enable row level security;
alter table social.threads force row level security;

drop policy if exists p_threads_select_auth on social.threads;
create policy p_threads_select_auth
on social.threads
for select
to authenticated
using (
  created_by_user_id = (select auth.uid())
  or (
    subject_kind = 'collection'
    and exists (
      select 1
      from catalog.collections c
      left join social.collection_access ca
        on ca.collection_id = c.id
       and ca.grantee_user_id = (select auth.uid())
       and ca.revoked_at is null
      where c.id = threads.subject_id
        and (
          c.owner_user_id = (select auth.uid())
          or c.visibility in ('public', 'system')
          or ca.grantee_user_id is not null
        )
    )
  )
  or (
    subject_kind = 'review_session'
    and exists (
      select 1 from learning.review_sessions rs
      where rs.id = threads.subject_id
        and rs.user_id = (select auth.uid())
    )
  )
);

drop policy if exists p_threads_insert_auth on social.threads;
create policy p_threads_insert_auth
on social.threads
for insert
to authenticated
with check (created_by_user_id = (select auth.uid()));

drop policy if exists p_threads_update_owner on social.threads;
create policy p_threads_update_owner
on social.threads
for update
to authenticated
using (created_by_user_id = (select auth.uid()))
with check (created_by_user_id = (select auth.uid()));

alter table social.messages enable row level security;
alter table social.messages force row level security;

drop policy if exists p_messages_select_auth on social.messages;
create policy p_messages_select_auth
on social.messages
for select
to authenticated
using (
  exists (
    select 1 from social.threads t
    where t.id = messages.thread_id
      and (
        t.created_by_user_id = (select auth.uid())
        or (
          t.subject_kind = 'collection'
          and exists (
            select 1
            from catalog.collections c
            left join social.collection_access ca
              on ca.collection_id = c.id
             and ca.grantee_user_id = (select auth.uid())
             and ca.revoked_at is null
            where c.id = t.subject_id
              and (
                c.owner_user_id = (select auth.uid())
                or c.visibility in ('public', 'system')
                or ca.grantee_user_id is not null
              )
          )
        )
      )
  )
);

drop policy if exists p_messages_insert_auth on social.messages;
create policy p_messages_insert_auth
on social.messages
for insert
to authenticated
with check (
  author_user_id = (select auth.uid())
  and exists (
    select 1 from social.threads t
    where t.id = messages.thread_id
  )
);

drop policy if exists p_messages_update_owner on social.messages;
create policy p_messages_update_owner
on social.messages
for update
to authenticated
using (author_user_id = (select auth.uid()))
with check (author_user_id = (select auth.uid()));

drop policy if exists p_messages_delete_owner on social.messages;
create policy p_messages_delete_owner
on social.messages
for delete
to authenticated
using (author_user_id = (select auth.uid()));

alter table social.message_assets enable row level security;
alter table social.message_assets force row level security;

drop policy if exists p_message_assets_select_auth on social.message_assets;
create policy p_message_assets_select_auth
on social.message_assets
for select
to authenticated
using (
  exists (
    select 1
    from social.messages m
    where m.id = message_assets.message_id
      and (
        m.author_user_id = (select auth.uid())
        or exists (
          select 1 from social.threads t
          where t.id = m.thread_id
            and t.created_by_user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists p_message_assets_insert_owner on social.message_assets;
create policy p_message_assets_insert_owner
on social.message_assets
for insert
to authenticated
with check (
  exists (
    select 1
    from social.messages m
    where m.id = message_assets.message_id
      and m.author_user_id = (select auth.uid())
  )
);

drop policy if exists p_message_assets_delete_owner on social.message_assets;
create policy p_message_assets_delete_owner
on social.message_assets
for delete
to authenticated
using (
  exists (
    select 1
    from social.messages m
    where m.id = message_assets.message_id
      and m.author_user_id = (select auth.uid())
  )
);

alter table reminder.preferences enable row level security;
alter table reminder.preferences force row level security;

drop policy if exists p_reminder_preferences_all_own on reminder.preferences;
create policy p_reminder_preferences_all_own
on reminder.preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table reminder.calendar_feeds enable row level security;
alter table reminder.calendar_feeds force row level security;

drop policy if exists p_calendar_feeds_all_own on reminder.calendar_feeds;
create policy p_calendar_feeds_all_own
on reminder.calendar_feeds
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table reminder.push_subscriptions enable row level security;
alter table reminder.push_subscriptions force row level security;

drop policy if exists p_push_subscriptions_all_own on reminder.push_subscriptions;
create policy p_push_subscriptions_all_own
on reminder.push_subscriptions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table media.user_card_media enable row level security;
alter table media.user_card_media force row level security;

drop policy if exists p_user_card_media_all_own on media.user_card_media;
create policy p_user_card_media_all_own
on media.user_card_media
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from learning.user_cards uc
    where uc.user_id = (select auth.uid())
      and uc.card_id = user_card_media.card_id
  )
);

alter table ops.edge_rate_limits enable row level security;
alter table ops.job_leases enable row level security;

grant select, insert, update on account.profiles to authenticated;
grant select on account.user_roles to authenticated;

grant select on catalog.cards, catalog.collections, catalog.collection_items, catalog.videos, catalog.video_subtitle_tracks, catalog.card_video_links to anon;

grant select, insert, update, delete on catalog.cards to authenticated;
grant select on catalog.card_origins to authenticated;
grant select, insert, update, delete on catalog.collections, catalog.collection_items, catalog.user_collection_state to authenticated;
grant select, insert, update, delete on catalog.videos, catalog.video_subtitle_tracks, catalog.card_video_links to authenticated;
grant select, insert, update, delete on catalog.user_saved_videos, catalog.daily_video_recommendations to authenticated;

grant select, insert, update on learning.scheduler_profiles, learning.user_cards, learning.review_sessions to authenticated;
grant select, insert on learning.user_card_events to authenticated;

grant select, insert, update on progress.learning_path_progress, progress.user_milestones, progress.daily_activity_rollups to authenticated;

grant select, insert, update on social.relationships, social.notifications, social.collection_access, social.threads, social.messages, social.message_assets to authenticated;
grant delete on social.messages, social.message_assets, social.collection_access to authenticated;

grant select, insert, update, delete on reminder.preferences, reminder.calendar_feeds, reminder.push_subscriptions to authenticated;
grant select, insert, update, delete on media.user_card_media to authenticated;
