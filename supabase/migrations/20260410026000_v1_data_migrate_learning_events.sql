-- Baseline v1 data migration: review/event history

do $$
begin
  if to_regclass('public.user_card_reviews') is not null then
    insert into learning.user_card_events (
      user_id,
      card_id,
      event_type,
      event_at,
      client_event_id,
      source,
      source_ref,
      rating,
      payload,
      fsrs_before,
      fsrs_after,
      created_at
    )
    select
      ucr.user_id,
      coalesce(ov.card_id, ofd.card_id) as card_id,
      'reviewed'::learning.user_card_event_type,
      ucr.reviewed_at,
      ucr.client_review_id,
      'legacy.user_card_reviews',
      ucr.id::text,
      coalesce(ucr.fsrs_rating, ucr.quality),
      jsonb_strip_nulls(
        jsonb_build_object(
          'review_algorithm', ucr.review_algorithm,
          'quality', ucr.quality,
          'previous_interval_days', ucr.previous_interval_days,
          'new_interval_days', ucr.new_interval_days,
          'fsrs_weights_version', ucr.fsrs_weights_version
        )
      ),
      jsonb_strip_nulls(
        jsonb_build_object(
          'state', ucr.fsrs_state_before,
          'stability', ucr.fsrs_stability_before,
          'difficulty', ucr.fsrs_difficulty_before,
          'elapsed_days', ucr.fsrs_elapsed_days_before,
          'scheduled_days', ucr.fsrs_scheduled_days_before,
          'ease_factor', ucr.previous_ease_factor,
          'interval_days', ucr.previous_interval_days
        )
      ),
      jsonb_strip_nulls(
        jsonb_build_object(
          'state', ucr.fsrs_state_after,
          'stability', ucr.fsrs_stability_after,
          'difficulty', ucr.fsrs_difficulty_after,
          'elapsed_days', ucr.fsrs_elapsed_days_after,
          'scheduled_days', ucr.fsrs_scheduled_days_after,
          'ease_factor', ucr.new_ease_factor,
          'interval_days', ucr.new_interval_days,
          'due_at', null
        )
      ),
      coalesce(ucr.reviewed_at, now())
    from public.user_card_reviews ucr
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'vocabulary_cards'
        and o.source_id = ucr.vocabulary_card_id::text
      order by o.created_at asc
      limit 1
    ) ov on true
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'foundation_deck'
        and o.source_id = ucr.foundation_card_id::text
      order by o.created_at asc
      limit 1
    ) ofd on true
    left join learning.user_card_events existing
      on existing.source = 'legacy.user_card_reviews'
     and existing.source_ref = ucr.id::text
    where ucr.user_id is not null
      and coalesce(ov.card_id, ofd.card_id) is not null
      and existing.id is null;
  end if;

  if to_regclass('public.user_reviews') is not null then
    insert into learning.user_card_events (
      user_id,
      card_id,
      event_type,
      event_at,
      source,
      source_ref,
      rating,
      payload,
      fsrs_after,
      created_at
    )
    select
      ur.user_id,
      coalesce(ouc.card_id, ouv.card_id, ocw.card_id) as card_id,
      'reviewed'::learning.user_card_event_type,
      coalesce(ur.created_at, ur.review_date::timestamptz, now()),
      'legacy.user_reviews',
      ur.id::text,
      ur.quality,
      jsonb_strip_nulls(
        jsonb_build_object(
          'legacy_vocab_word', ur.vocab_word,
          'legacy_review_date', ur.review_date,
          'legacy_interval', ur.interval,
          'legacy_ease_factor', ur.ease_factor
        )
      ),
      jsonb_strip_nulls(
        jsonb_build_object(
          'scheduled_days', ur.interval,
          'difficulty', ur.ease_factor
        )
      ),
      coalesce(ur.created_at, now())
    from public.user_reviews ur
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'user_cards'
        and o.source_id = ur.card_id::text
      limit 1
    ) ouc on true
    left join lateral (
      select c.id as card_id
      from catalog.cards c
      where c.owner_user_id = ur.user_id
        and c.normalized_term = private.normalize_arabic(ur.vocab_word)
      limit 1
    ) ouv on true
    left join lateral (
      select c.id as card_id
      from catalog.cards c
      where c.owner_user_id is null
        and c.normalized_term = private.normalize_arabic(ur.vocab_word)
      limit 1
    ) ocw on true
    left join learning.user_card_events existing
      on existing.source = 'legacy.user_reviews'
     and existing.source_ref = ur.id::text
    where ur.user_id is not null
      and coalesce(ouc.card_id, ouv.card_id, ocw.card_id) is not null
      and existing.id is null;
  end if;

  if to_regclass('public.user_activity_log') is not null then
    -- Cards added events
    insert into learning.user_card_events (
      user_id,
      card_id,
      event_type,
      event_at,
      source,
      source_ref,
      payload,
      created_at
    )
    select
      ual.user_id,
      coalesce(ov.card_id, ofd.card_id) as card_id,
      'added_to_learning'::learning.user_card_event_type,
      ual.created_at,
      'legacy.user_activity_log',
      ual.id::text,
      coalesce(ual.metadata, '{}'::jsonb),
      coalesce(ual.created_at, now())
    from public.user_activity_log ual
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'vocabulary_cards'
        and o.source_id = (ual.metadata ->> 'vocabulary_card_id')
      limit 1
    ) ov on true
    left join lateral (
      select o.card_id
      from catalog.card_origins o
      where o.source_table = 'foundation_deck'
        and o.source_id = (ual.metadata ->> 'foundation_card_id')
      limit 1
    ) ofd on true
    left join learning.user_card_events existing
      on existing.source = 'legacy.user_activity_log'
     and existing.source_ref = ual.id::text
    where ual.user_id is not null
      and ual.activity_type in ('cards_added')
      and coalesce(ov.card_id, ofd.card_id) is not null
      and existing.id is null;
  end if;
end
$$;
