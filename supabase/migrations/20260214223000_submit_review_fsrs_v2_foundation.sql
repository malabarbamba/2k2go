-- =====================================================
-- Foundation-only FSRS review RPC (V1 deterministic)
-- Date: 2026-02-14
-- =====================================================

CREATE OR REPLACE FUNCTION public.submit_review_fsrs_v2(
  p_vocabulary_card_id uuid DEFAULT NULL,
  p_foundation_card_id uuid DEFAULT NULL,
  p_quality integer DEFAULT NULL,
  p_client_review_id uuid DEFAULT NULL
)
RETURNS TABLE(
  status text,
  interval_days integer,
  ease_factor numeric,
  repetitions integer,
  lapses integer,
  next_review_at timestamp with time zone,
  last_reviewed_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_state public.user_card_state%ROWTYPE;
  v_prev_state smallint := 0;
  v_prev_stability numeric := 0;
  v_prev_difficulty numeric := 5;
  v_prev_elapsed_days integer := 0;
  v_prev_scheduled_days integer := 0;
  v_prev_interval integer := 0;
  v_prev_ease numeric := 2.5;
  v_new_state smallint := 0;
  v_new_stability numeric := 0;
  v_new_difficulty numeric := 5;
  v_new_elapsed_days integer := 0;
  v_new_scheduled_days integer := 0;
  v_new_interval integer := 0;
  v_new_status text := 'learning';
  v_new_next_review_at timestamp with time zone := v_now;
  v_row_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_foundation_card_id IS NULL THEN
    RAISE EXCEPTION 'submit_review_fsrs_v2 requires p_foundation_card_id';
  END IF;

  IF p_vocabulary_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'submit_review_fsrs_v2 supports foundation cards only';
  END IF;

  IF p_quality IS NULL THEN
    RAISE EXCEPTION 'p_quality is required';
  END IF;

  IF p_quality NOT IN (1, 3) THEN
    RAISE EXCEPTION 'FSRS foundation V1 accepts only canonical ratings: fail=1, pass=3';
  END IF;

  IF p_client_review_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || p_client_review_id, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.user_card_reviews ucr
      WHERE ucr.user_id = v_user_id
        AND ucr.client_review_id = p_client_review_id
    ) THEN
      RETURN QUERY
      SELECT
        ucs.status,
        ucs.interval_days,
        ucs.ease_factor,
        ucs.repetitions,
        ucs.lapses,
        ucs.next_review_at,
        ucs.last_reviewed_at
      FROM public.user_card_state ucs
      WHERE ucs.user_id = v_user_id
        AND ucs.foundation_card_id = p_foundation_card_id
        AND ucs.source_type = 'foundation'::public.deck_source_type
      LIMIT 1;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.user_card_state (
    user_id,
    foundation_card_id,
    status,
    next_review_at,
    source_type,
    scheduling_algorithm,
    fsrs_state,
    fsrs_stability,
    fsrs_difficulty,
    fsrs_elapsed_days,
    fsrs_scheduled_days,
    fsrs_due_at
  )
  VALUES (
    v_user_id,
    p_foundation_card_id,
    'new',
    v_now,
    'foundation'::public.deck_source_type,
    'fsrs',
    0,
    0.4,
    5,
    0,
    0,
    v_now
  )
  ON CONFLICT DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.user_card_state ucs
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id = p_foundation_card_id
    AND ucs.source_type = 'foundation'::public.deck_source_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foundation card state not found for user';
  END IF;

  v_prev_state := coalesce(v_state.fsrs_state, 0);
  v_prev_stability := coalesce(v_state.fsrs_stability, 0);
  v_prev_difficulty := coalesce(v_state.fsrs_difficulty, 5);
  v_prev_scheduled_days := coalesce(v_state.fsrs_scheduled_days, v_state.interval_days, 0);
  v_prev_interval := coalesce(v_state.interval_days, 0);
  v_prev_ease := coalesce(v_state.ease_factor, 2.5);

  IF v_state.fsrs_last_reviewed_at IS NULL THEN
    v_prev_elapsed_days := 0;
  ELSE
    v_prev_elapsed_days := greatest(
      0,
      floor(extract(epoch FROM (v_now - v_state.fsrs_last_reviewed_at)) / 86400.0)::integer
    );
  END IF;

  IF p_quality = 1 THEN
    v_new_state := 0;
    v_new_stability := greatest(0.2, (v_prev_stability * 0.65) + 0.15);
    v_new_difficulty := least(10, greatest(1, v_prev_difficulty + 0.35));
    v_new_elapsed_days := v_prev_elapsed_days;
    v_new_scheduled_days := 0;
    v_new_interval := 0;
    v_new_status := 'learning';
    v_new_next_review_at := v_now + interval '10 minutes';
  ELSE
    v_new_state := CASE WHEN v_prev_state = 0 THEN 1 ELSE 2 END;
    v_new_stability := least(
      36500,
      greatest(
        0.5,
        greatest(v_prev_stability, 0.6)
        + greatest(0.25, (11 - v_prev_difficulty) * 0.22)
        + greatest(0, v_prev_elapsed_days) * 0.10
      )
    );
    v_new_difficulty := least(10, greatest(1, v_prev_difficulty - 0.12));
    v_new_elapsed_days := v_prev_elapsed_days;
    v_new_scheduled_days := greatest(1, round(v_new_stability)::integer);
    v_new_interval := v_new_scheduled_days;
    v_new_status := 'review';
    v_new_next_review_at := v_now + make_interval(days => v_new_scheduled_days);
  END IF;

  UPDATE public.user_card_state ucs
  SET
    status = v_new_status,
    interval_days = v_new_interval,
    next_review_at = v_new_next_review_at,
    last_reviewed_at = v_now,
    repetitions = coalesce(ucs.repetitions, 0) + 1,
    lapses = coalesce(ucs.lapses, 0) + CASE WHEN p_quality = 1 THEN 1 ELSE 0 END,
    scheduling_algorithm = 'fsrs',
    fsrs_state = v_new_state,
    fsrs_stability = v_new_stability,
    fsrs_difficulty = v_new_difficulty,
    fsrs_elapsed_days = v_new_elapsed_days,
    fsrs_scheduled_days = v_new_scheduled_days,
    fsrs_due_at = v_new_next_review_at,
    fsrs_last_reviewed_at = v_now,
    updated_at = v_now
  WHERE ucs.id = v_state.id
  RETURNING * INTO v_state;

  INSERT INTO public.user_card_reviews (
    user_id,
    vocabulary_card_id,
    foundation_card_id,
    quality,
    previous_interval_days,
    new_interval_days,
    previous_ease_factor,
    new_ease_factor,
    reviewed_at,
    client_review_id,
    review_algorithm,
    fsrs_rating,
    fsrs_state_before,
    fsrs_state_after,
    fsrs_stability_before,
    fsrs_stability_after,
    fsrs_difficulty_before,
    fsrs_difficulty_after,
    fsrs_elapsed_days_before,
    fsrs_elapsed_days_after,
    fsrs_scheduled_days_before,
    fsrs_scheduled_days_after
  )
  VALUES (
    v_user_id,
    NULL,
    p_foundation_card_id,
    p_quality,
    v_prev_interval,
    v_new_interval,
    v_prev_ease,
    v_prev_ease,
    v_now,
    p_client_review_id,
    'fsrs',
    p_quality,
    v_prev_state,
    v_new_state,
    v_prev_stability,
    v_new_stability,
    v_prev_difficulty,
    v_new_difficulty,
    v_prev_elapsed_days,
    v_new_elapsed_days,
    v_prev_scheduled_days,
    v_new_scheduled_days
  )
  ON CONFLICT (user_id, client_review_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF p_client_review_id IS NOT NULL AND v_row_count = 0 THEN
    RETURN QUERY
    SELECT
      ucs.status,
      ucs.interval_days,
      ucs.ease_factor,
      ucs.repetitions,
      ucs.lapses,
      ucs.next_review_at,
      ucs.last_reviewed_at
    FROM public.user_card_state ucs
    WHERE ucs.user_id = v_user_id
      AND ucs.foundation_card_id = p_foundation_card_id
      AND ucs.source_type = 'foundation'::public.deck_source_type
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_state.status,
    v_state.interval_days,
    v_state.ease_factor,
    v_state.repetitions,
    v_state.lapses,
    v_state.next_review_at,
    v_state.last_reviewed_at;
END;
$$;
