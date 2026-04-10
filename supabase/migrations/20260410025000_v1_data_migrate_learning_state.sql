-- Baseline v1 data migration: learning state + scheduler profiles

do $$
declare
  v_foundation_collection_id uuid;
begin
  select id into v_foundation_collection_id
  from catalog.collections
  where lower(slug) = 'foundation-core'
  limit 1;

  if to_regclass('public.user_card_state') is not null then
    insert into learning.user_cards (
      user_id,
      card_id,
      state,
      due_at,
      introduced_at,
      first_seen_at,
      acquired_at,
      last_reviewed_at,
      stability,
      difficulty,
      elapsed_days,
      scheduled_days,
      reps,
      lapses,
      learning_step_index,
      scheduler_version,
      source_collection_id,
      suspended_at,
      archived_at,
      metadata,
      created_at,
      updated_at
    )
    select distinct on (ucs.user_id, coalesce(ov.card_id, ofd.card_id))
      ucs.user_id,
      coalesce(ov.card_id, ofd.card_id) as card_id,
      case ucs.status
        when 'new' then 'new'::learning.user_card_state_kind
        when 'learning' then 'learning'::learning.user_card_state_kind
        when 'review' then 'review'::learning.user_card_state_kind
        when 'mastered' then 'review'::learning.user_card_state_kind
        else 'new'::learning.user_card_state_kind
      end as state,
      coalesce(ucs.fsrs_due_at, ucs.next_review_at) as due_at,
      coalesce(ucs.created_at, now()) as introduced_at,
      ucs.first_seen_at,
      ucs.added_to_deck_at,
      coalesce(ucs.fsrs_last_reviewed_at, ucs.last_reviewed_at),
      ucs.fsrs_stability,
      ucs.fsrs_difficulty,
      coalesce(ucs.fsrs_elapsed_days, ucs.interval_days),
      coalesce(ucs.fsrs_scheduled_days, ucs.interval_days),
      coalesce(ucs.repetitions, 0),
      coalesce(ucs.lapses, 0),
      coalesce(ucs.learning_step_index, 0),
      coalesce(nullif(ucs.scheduling_algorithm, ''), 'fsrs-v1'),
      case
        when ucs.source_type::text = 'foundation' then v_foundation_collection_id
        else null
      end as source_collection_id,
      case
        when ucs.status = 'suspended' then coalesce(ucs.updated_at, now())
        else null
      end as suspended_at,
      case
        when ucs.status = 'archived' then coalesce(ucs.updated_at, now())
        else null
      end as archived_at,
      jsonb_strip_nulls(
        jsonb_build_object(
          'source_type', ucs.source_type::text,
          'source_raw', ucs.source_raw,
          'source_video_id', ucs.source_video_id,
          'source_video_is_short', ucs.source_video_is_short,
          'source_cue_id', ucs.source_cue_id,
          'source_word_index', ucs.source_word_index,
          'source_word_start_seconds', ucs.source_word_start_seconds,
          'source_word_end_seconds', ucs.source_word_end_seconds,
          'legacy_user_card_state_id', ucs.id
        )
      ),
      coalesce(ucs.created_at, now()),
      coalesce(ucs.updated_at, coalesce(ucs.created_at, now()))
    from public.user_card_state ucs
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'vocabulary_cards'
        and o.source_id = ucs.vocabulary_card_id::text
      order by o.created_at asc
      limit 1
    ) ov on true
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'foundation_deck'
        and o.source_id = ucs.foundation_card_id::text
      order by o.created_at asc
      limit 1
    ) ofd on true
    where ucs.user_id is not null
      and coalesce(ov.card_id, ofd.card_id) is not null
    order by
      ucs.user_id,
      coalesce(ov.card_id, ofd.card_id),
      coalesce(ucs.updated_at, ucs.created_at, now()) desc,
      ucs.id desc
    on conflict (user_id, card_id) do update
    set
      state = excluded.state,
      due_at = coalesce(excluded.due_at, learning.user_cards.due_at),
      introduced_at = coalesce(learning.user_cards.introduced_at, excluded.introduced_at),
      first_seen_at = coalesce(learning.user_cards.first_seen_at, excluded.first_seen_at),
      acquired_at = coalesce(learning.user_cards.acquired_at, excluded.acquired_at),
      last_reviewed_at = coalesce(excluded.last_reviewed_at, learning.user_cards.last_reviewed_at),
      stability = coalesce(excluded.stability, learning.user_cards.stability),
      difficulty = coalesce(excluded.difficulty, learning.user_cards.difficulty),
      elapsed_days = coalesce(excluded.elapsed_days, learning.user_cards.elapsed_days),
      scheduled_days = coalesce(excluded.scheduled_days, learning.user_cards.scheduled_days),
      reps = greatest(learning.user_cards.reps, excluded.reps),
      lapses = greatest(learning.user_cards.lapses, excluded.lapses),
      learning_step_index = greatest(learning.user_cards.learning_step_index, excluded.learning_step_index),
      scheduler_version = coalesce(excluded.scheduler_version, learning.user_cards.scheduler_version),
      source_collection_id = coalesce(learning.user_cards.source_collection_id, excluded.source_collection_id),
      suspended_at = coalesce(excluded.suspended_at, learning.user_cards.suspended_at),
      archived_at = coalesce(excluded.archived_at, learning.user_cards.archived_at),
      metadata = coalesce(learning.user_cards.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = greatest(learning.user_cards.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_vocabulary_progress') is not null then
    insert into learning.user_cards (
      user_id,
      card_id,
      state,
      due_at,
      last_reviewed_at,
      difficulty,
      scheduled_days,
      reps,
      source_collection_id,
      metadata,
      created_at,
      updated_at
    )
    select distinct on (uvp.user_id, coalesce(ov.card_id, ofd.card_id))
      uvp.user_id,
      coalesce(ov.card_id, ofd.card_id) as card_id,
      case uvp.status
        when 'new' then 'new'::learning.user_card_state_kind
        when 'learning' then 'learning'::learning.user_card_state_kind
        when 'review' then 'review'::learning.user_card_state_kind
        when 'mastered' then 'review'::learning.user_card_state_kind
        else 'new'::learning.user_card_state_kind
      end,
      uvp.next_review_date,
      uvp.last_reviewed_at,
      case when uvp.ease_factor is not null then least(greatest(uvp.ease_factor::numeric, 1), 10) else null end,
      uvp.interval,
      coalesce(uvp.review_count, 0),
      case when uvp.foundation_card_id is not null then v_foundation_collection_id else null end,
      jsonb_strip_nulls(
        jsonb_build_object(
          'legacy_user_vocabulary_progress', true,
          'legacy_card_id', uvp.card_id,
          'legacy_foundation_card_id', uvp.foundation_card_id
        )
      ),
      coalesce(uvp.created_at, now()),
      coalesce(uvp.created_at, now())
    from public.user_vocabulary_progress uvp
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'vocabulary_cards'
        and o.source_id = uvp.card_id::text
      order by o.created_at asc
      limit 1
    ) ov on true
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'foundation_deck'
        and o.source_id = uvp.foundation_card_id::text
      order by o.created_at asc
      limit 1
    ) ofd on true
    where uvp.user_id is not null
      and coalesce(ov.card_id, ofd.card_id) is not null
    order by
      uvp.user_id,
      coalesce(ov.card_id, ofd.card_id),
      coalesce(uvp.next_review_date, uvp.last_reviewed_at, uvp.created_at, now()) desc,
      coalesce(uvp.card_id::text, '') desc
    on conflict (user_id, card_id) do update
    set
      state = excluded.state,
      due_at = coalesce(excluded.due_at, learning.user_cards.due_at),
      last_reviewed_at = coalesce(excluded.last_reviewed_at, learning.user_cards.last_reviewed_at),
      difficulty = coalesce(excluded.difficulty, learning.user_cards.difficulty),
      scheduled_days = coalesce(excluded.scheduled_days, learning.user_cards.scheduled_days),
      reps = greatest(learning.user_cards.reps, excluded.reps),
      source_collection_id = coalesce(learning.user_cards.source_collection_id, excluded.source_collection_id),
      metadata = coalesce(learning.user_cards.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = greatest(learning.user_cards.updated_at, excluded.updated_at);
  end if;

  begin
    if to_regclass('public.user_fsrs_active_weights') is not null then
      insert into learning.scheduler_profiles (
        user_id,
        scheduler_key,
        desired_retention,
        timezone,
        created_at,
        updated_at
      )
      select
        ufaw.user_id,
        'fsrs-v1',
        coalesce(ufaw.desired_retention, 0.90),
        coalesce(ufaw.timezone, 'UTC'),
        coalesce(ufaw.created_at, now()),
        coalesce(ufaw.updated_at, coalesce(ufaw.created_at, now()))
      from public.user_fsrs_active_weights ufaw
      where ufaw.user_id is not null
      on conflict (user_id) do update
      set
        desired_retention = excluded.desired_retention,
        timezone = excluded.timezone,
        updated_at = greatest(learning.scheduler_profiles.updated_at, excluded.updated_at);
    end if;
  exception when undefined_column then
    -- fallback when old table lacks optional columns
    if to_regclass('public.user_fsrs_active_weights') is not null then
      insert into learning.scheduler_profiles (user_id)
      select distinct ufaw.user_id
      from public.user_fsrs_active_weights ufaw
      where ufaw.user_id is not null
      on conflict (user_id) do nothing;
    end if;
  end;
end
$$;
