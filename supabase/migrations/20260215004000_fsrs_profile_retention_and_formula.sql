-- =====================================================
-- FSRS retention profile setting + FSRS-5 scheduling formula alignment
-- Date: 2026-02-15
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fsrs_target_retention numeric(4,2) NOT NULL DEFAULT 0.85;
UPDATE public.profiles
SET fsrs_target_retention = 0.85
WHERE fsrs_target_retention IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_fsrs_target_retention_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_fsrs_target_retention_check
      CHECK (fsrs_target_retention IN (0.85, 0.90, 0.95));
  END IF;
END
$$;
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
  v_prev_retrievability numeric := 1;

  v_new_state smallint := 0;
  v_new_stability numeric := 0;
  v_new_difficulty numeric := 5;
  v_new_elapsed_days integer := 0;
  v_new_scheduled_days integer := 0;
  v_new_interval integer := 0;
  v_new_status text := 'learning';
  v_new_next_review_at timestamp with time zone := v_now;

  v_row_count integer := 0;
  v_is_first_review boolean := false;

  v_target_retention numeric := 0.85;
  v_maximum_interval integer := 36500;
  v_relearning_step interval := interval '10 minutes';

  -- FSRS-5 parameters from anki_deck_options_raw.yaml (parametres_fsrs)
  -- Zero-based mapping: w[0]..w[18] -> PostgreSQL array indexes [1]..[19]
  v_w numeric[] := ARRAY[
    0.4026, 1.1839, 3.1730, 15.6910, 7.1949,
    0.5345, 1.4604, 0.0046, 1.5458, 0.1192,
    1.0193, 1.9395, 0.1100, 0.2961, 2.2698,
    0.2315, 2.9898, 0.5166, 0.6621
  ];

  -- FSRS-4.5 forgetting curve constants used by FSRS-5
  v_decay numeric := -0.5;
  v_factor numeric := (19.0 / 81.0);

  v_rating integer := 0;
  v_d0_easy numeric := 5;
  v_delta_d numeric := 0;
  v_d_prime numeric := 5;
  v_interval_raw numeric := 1;
  v_s_min numeric := 0.1;
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
    RAISE EXCEPTION 'FSRS foundation accepts canonical ratings only: fail=1, pass=3';
  END IF;

  SELECT coalesce(p.fsrs_target_retention, 0.85)
  INTO v_target_retention
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF v_target_retention NOT IN (0.85, 0.90, 0.95) THEN
    v_target_retention := 0.85;
  END IF;

  v_rating := p_quality;

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
    0.4026,
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
  v_prev_stability := greatest(0.1, coalesce(v_state.fsrs_stability, 0.4026));
  v_prev_difficulty := least(10, greatest(1, coalesce(v_state.fsrs_difficulty, 5)));
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

  v_is_first_review := (coalesce(v_state.repetitions, 0) = 0) OR v_state.fsrs_last_reviewed_at IS NULL;

  IF v_prev_elapsed_days <= 0 THEN
    v_prev_retrievability := 1;
  ELSE
    v_prev_retrievability := power(
      1 + v_factor * (v_prev_elapsed_days::numeric / greatest(v_prev_stability, 0.1)),
      v_decay
    );
  END IF;

  v_prev_retrievability := least(1, greatest(0.0001, v_prev_retrievability));

  -- D0(4): target for mean reversion in FSRS-5
  v_d0_easy := least(10, greatest(1, v_w[5] - exp(v_w[6] * (4 - 1)) + 1));

  -- Difficulty update: delta + linear damping + mean reversion
  v_delta_d := -v_w[7] * (v_rating - 3);
  v_d_prime := v_prev_difficulty + v_delta_d * (10 - v_prev_difficulty) / 9;
  v_new_difficulty := least(
    10,
    greatest(1, v_w[8] * v_d0_easy + (1 - v_w[8]) * v_d_prime)
  );

  IF v_rating = 1 THEN
    IF v_is_first_review THEN
      v_new_stability := greatest(0.1, v_w[1]);
      v_new_difficulty := least(10, greatest(1, v_w[5] - exp(v_w[6] * (1 - 1)) + 1));
    ELSE
      v_s_min := v_prev_stability / exp(v_w[18] * v_w[19]);
      v_new_stability := least(
        v_w[12]
        * power(v_new_difficulty, -v_w[13])
        * (power(v_prev_stability + 1, v_w[14]) - 1)
        * exp((1 - v_prev_retrievability) * v_w[15]),
        v_s_min
      );
      v_new_stability := greatest(0.1, v_new_stability);
    END IF;

    v_new_state := 0;
    v_new_elapsed_days := v_prev_elapsed_days;
    v_new_scheduled_days := 0;
    v_new_interval := 0;
    v_new_status := 'learning';
    v_new_next_review_at := v_now + v_relearning_step;
  ELSE
    IF v_is_first_review THEN
      v_new_stability := greatest(0.1, v_w[3]);
      v_new_difficulty := least(10, greatest(1, v_w[5] - exp(v_w[6] * (3 - 1)) + 1));
    ELSIF v_prev_elapsed_days <= 0 THEN
      v_new_stability := v_prev_stability * exp(v_w[18] * (v_rating - 3 + v_w[19]));
    ELSE
      v_new_stability := v_prev_stability
        * (
          1
          + exp(v_w[9])
            * (11 - v_new_difficulty)
            * power(v_prev_stability, -v_w[10])
            * (exp((1 - v_prev_retrievability) * v_w[11]) - 1)
        );
    END IF;

    v_new_stability := least(v_maximum_interval::numeric, greatest(0.1, v_new_stability));

    v_interval_raw := (v_new_stability / v_factor)
      * (power(v_target_retention, (1 / v_decay)) - 1);
    v_new_interval := least(
      v_maximum_interval,
      greatest(1, round(v_interval_raw)::integer)
    );

    v_new_state := CASE WHEN v_prev_state = 0 THEN 1 ELSE 2 END;
    v_new_elapsed_days := v_prev_elapsed_days;
    v_new_scheduled_days := v_new_interval;
    v_new_status := 'review';
    v_new_next_review_at := v_now + make_interval(days => v_new_interval);
  END IF;

  UPDATE public.user_card_state ucs
  SET
    status = v_new_status,
    interval_days = v_new_interval,
    next_review_at = v_new_next_review_at,
    last_reviewed_at = v_now,
    repetitions = coalesce(ucs.repetitions, 0) + 1,
    lapses = coalesce(ucs.lapses, 0) + CASE WHEN v_rating = 1 THEN 1 ELSE 0 END,
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
    v_rating,
    v_prev_interval,
    v_new_interval,
    v_prev_ease,
    v_prev_ease,
    v_now,
    p_client_review_id,
    'fsrs',
    v_rating,
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
