-- Baseline v1: public read views

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

create or replace view public.my_user_cards_v1 as
select
  uc.user_id,
  uc.card_id,
  uc.state,
  uc.due_at,
  uc.last_reviewed_at,
  uc.reps,
  uc.lapses,
  uc.stability,
  uc.difficulty,
  uc.scheduled_days,
  uc.source_collection_id,
  uc.is_buried,
  uc.created_at,
  uc.updated_at
from learning.user_cards uc
where uc.user_id = auth.uid();

create or replace view public.relationships_v1 as
select
  r.user_low_id,
  r.user_high_id,
  r.initiator_user_id,
  r.state,
  r.requested_at,
  r.responded_at,
  r.accepted_at,
  r.blocked_at,
  r.removed_at,
  r.last_nudge_sent_at,
  r.metadata,
  r.updated_at
from social.relationships r
where auth.uid() in (r.user_low_id, r.user_high_id);

create or replace view public.notifications_v1 as
select
  n.id,
  n.user_id,
  n.actor_user_id,
  n.notification_type,
  n.payload,
  n.read_at,
  n.created_at
from social.notifications n
where n.user_id = auth.uid();

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

grant select on public.cards_v1, public.collections_v1, public.collection_cards_v1, public.videos_v1 to anon, authenticated;
grant select on public.my_user_cards_v1, public.relationships_v1, public.notifications_v1, public.progress_summary_v1 to authenticated;
