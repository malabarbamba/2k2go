-- =====================================================
-- Collection day helpers with timezone + cutoff support
-- Date: 2026-02-21
-- Purpose:
--   1) Add deterministic collection-day helper functions
--   2) Apply helpers to foundation "today" computations
-- =====================================================

CREATE OR REPLACE FUNCTION public.collection_day_id(
  now_utc timestamp with time zone,
  tz text,
  cutoff_hour integer
)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_timezone text := COALESCE(NULLIF(btrim(tz), ''), 'UTC');
  v_cutoff_hour integer := LEAST(23, GREATEST(0, COALESCE(cutoff_hour, 4)));
BEGIN
  IF now_utc IS NULL THEN
    RAISE EXCEPTION 'now_utc is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names ptn
    WHERE ptn.name = v_timezone
  ) THEN
    v_timezone := 'UTC';
  END IF;

  RETURN (
    (now_utc AT TIME ZONE v_timezone)
    - make_interval(hours => v_cutoff_hour)
  )::date;
END;
$$;
CREATE OR REPLACE FUNCTION public.collection_day_bounds(
  now_utc timestamp with time zone,
  tz text,
  cutoff_hour integer
)
RETURNS TABLE(
  day_start_utc timestamp with time zone,
  day_end_utc timestamp with time zone
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_timezone text := COALESCE(NULLIF(btrim(tz), ''), 'UTC');
  v_cutoff_hour integer := LEAST(23, GREATEST(0, COALESCE(cutoff_hour, 4)));
  v_day_id date;
  v_day_start_local timestamp without time zone;
BEGIN
  IF now_utc IS NULL THEN
    RAISE EXCEPTION 'now_utc is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names ptn
    WHERE ptn.name = v_timezone
  ) THEN
    v_timezone := 'UTC';
  END IF;

  v_day_id := public.collection_day_id(now_utc, v_timezone, v_cutoff_hour);
  v_day_start_local := v_day_id::timestamp + make_interval(hours => v_cutoff_hour);

  day_start_utc := v_day_start_local AT TIME ZONE v_timezone;
  day_end_utc := (v_day_start_local + INTERVAL '1 day') AT TIME ZONE v_timezone;

  RETURN NEXT;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_cards_v2(
  p_deck_scope text DEFAULT 'personal_and_foundation',
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  source text,
  vocabulary_card_id uuid,
  foundation_card_id uuid,
  word_ar text,
  word_fr text,
  transliteration text,
  example_sentence_ar text,
  example_sentence_fr text,
  audio_url text,
  category text,
  status text,
  next_review_at timestamp with time zone,
  added_to_deck_at timestamp with time zone,
  first_seen_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit integer := LEAST(COALESCE(p_limit, 20), 50);
  v_now_utc timestamp with time zone := now();
  v_collection_day_start_utc timestamp with time zone := NULL;
  v_collection_day_end_utc timestamp with time zone := NULL;
  v_scheduler_timezone text := 'UTC';
  v_scheduler_day_cutoff_hour integer := 4;
  v_daily_new_cap integer := 15;
  v_seeded_today integer := 0;
  v_new_take integer := 0;
  v_foundation_enabled boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT (
    COALESCE(
      (
        SELECT p.foundation_deck_enabled
        FROM public.profiles p
        WHERE p.user_id = v_user_id
      ),
      false
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_card_state existing
      WHERE existing.user_id = v_user_id
        AND existing.foundation_card_id IS NOT NULL
    )
  ) INTO v_foundation_enabled;

  SELECT
    LEAST(200, GREATEST(0, COALESCE(p.new_cards_per_day, 15))),
    COALESCE(NULLIF(btrim(p.scheduler_timezone), ''), 'UTC'),
    LEAST(23, GREATEST(0, COALESCE(p.scheduler_day_cutoff_hour, 4)))
  INTO
    v_daily_new_cap,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  v_daily_new_cap := COALESCE(v_daily_new_cap, 15);
  v_scheduler_timezone := COALESCE(NULLIF(btrim(v_scheduler_timezone), ''), 'UTC');
  v_scheduler_day_cutoff_hour := LEAST(
    23,
    GREATEST(0, COALESCE(v_scheduler_day_cutoff_hour, 4))
  );

  SELECT
    bounds.day_start_utc,
    bounds.day_end_utc
  INTO
    v_collection_day_start_utc,
    v_collection_day_end_utc
  FROM public.collection_day_bounds(
    v_now_utc,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  ) bounds;

  IF v_foundation_enabled
     AND p_deck_scope IN ('personal_and_foundation', 'foundation')
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_card_state ucs
       WHERE ucs.user_id = v_user_id
         AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= now())
         AND (
           p_deck_scope = 'foundation'
           OR (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL)
         )
     ) THEN
    SELECT COUNT(*) INTO v_seeded_today
    FROM public.user_card_state ucs
    WHERE ucs.user_id = v_user_id
      AND ucs.foundation_card_id IS NOT NULL
      AND ucs.created_at >= v_collection_day_start_utc
      AND ucs.created_at < v_collection_day_end_utc;

    v_new_take := GREATEST(0, v_daily_new_cap - v_seeded_today);

    IF v_new_take > 0 THEN
      WITH candidates AS (
        SELECT fd.id
        FROM public.foundation_deck fd
        LEFT JOIN public.user_card_state ucs
          ON ucs.user_id = v_user_id AND ucs.foundation_card_id = fd.id
        WHERE ucs.id IS NULL
        ORDER BY fd.frequency_rank ASC
        LIMIT v_new_take
      )
      INSERT INTO public.user_card_state (user_id, foundation_card_id, status, next_review_at, source_type)
      SELECT v_user_id, c.id, 'new', now(), 'foundation'::public.deck_source_type
      FROM candidates c
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN ucs.foundation_card_id IS NOT NULL THEN 'foundation' ELSE 'vocabulary' END AS source,
    ucs.vocabulary_card_id,
    ucs.foundation_card_id,
    COALESCE(vc.word_ar, fd.word_ar) AS word_ar,
    COALESCE(vc.word_fr, fd.word_fr) AS word_fr,
    COALESCE(vc.transliteration, fd.transliteration) AS transliteration,
    COALESCE(vc.example_sentence_ar, fd.example_sentence_ar) AS example_sentence_ar,
    COALESCE(vc.example_sentence_fr, fd.example_sentence_fr) AS example_sentence_fr,
    vc.audio_url AS audio_url,
    COALESCE(vc.category, fd.category) AS category,
    ucs.status,
    ucs.next_review_at,
    ucs.added_to_deck_at,
    ucs.first_seen_at
  FROM public.user_card_state ucs
  LEFT JOIN public.vocabulary_cards vc ON ucs.vocabulary_card_id = vc.id
  LEFT JOIN public.foundation_deck fd ON ucs.foundation_card_id = fd.id
  WHERE ucs.user_id = v_user_id
    AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= now())
    AND (
      p_deck_scope = 'personal_and_foundation'
      OR (p_deck_scope = 'foundation' AND ucs.foundation_card_id IS NOT NULL)
      OR (
        p_deck_scope = 'personal'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'collected'
        AND coalesce(vc.category, '') <> 'alphabet_arabe'
      )
      OR (
        p_deck_scope = 'personal_sent'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'sent'
      )
      OR (
        p_deck_scope = 'personal_alphabet'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND (
          coalesce(ucs.source_type::text, 'collected') = 'alphabet'
          OR vc.category = 'alphabet_arabe'
        )
      )
    )
    AND (
      ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL
    )
  ORDER BY ucs.next_review_at ASC NULLS FIRST
  LIMIT v_limit;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_count_v2(
  p_deck_scope text DEFAULT 'personal_and_foundation'
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now_utc timestamp with time zone := now();
  v_collection_day_start_utc timestamp with time zone := NULL;
  v_collection_day_end_utc timestamp with time zone := NULL;
  v_scheduler_timezone text := 'UTC';
  v_scheduler_day_cutoff_hour integer := 4;
  v_daily_new_cap integer := 15;
  v_seeded_today integer := 0;
  v_new_take integer := 0;
  v_count integer := 0;
  v_foundation_enabled boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT (
    COALESCE(
      (
        SELECT p.foundation_deck_enabled
        FROM public.profiles p
        WHERE p.user_id = v_user_id
      ),
      false
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_card_state existing
      WHERE existing.user_id = v_user_id
        AND existing.foundation_card_id IS NOT NULL
    )
  ) INTO v_foundation_enabled;

  SELECT
    LEAST(200, GREATEST(0, COALESCE(p.new_cards_per_day, 15))),
    COALESCE(NULLIF(btrim(p.scheduler_timezone), ''), 'UTC'),
    LEAST(23, GREATEST(0, COALESCE(p.scheduler_day_cutoff_hour, 4)))
  INTO
    v_daily_new_cap,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  v_daily_new_cap := COALESCE(v_daily_new_cap, 15);
  v_scheduler_timezone := COALESCE(NULLIF(btrim(v_scheduler_timezone), ''), 'UTC');
  v_scheduler_day_cutoff_hour := LEAST(
    23,
    GREATEST(0, COALESCE(v_scheduler_day_cutoff_hour, 4))
  );

  SELECT
    bounds.day_start_utc,
    bounds.day_end_utc
  INTO
    v_collection_day_start_utc,
    v_collection_day_end_utc
  FROM public.collection_day_bounds(
    v_now_utc,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  ) bounds;

  IF v_foundation_enabled
     AND p_deck_scope IN ('personal_and_foundation', 'foundation')
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_card_state ucs
       WHERE ucs.user_id = v_user_id
         AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= now())
         AND (
           p_deck_scope = 'foundation'
           OR (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL)
         )
     ) THEN
    SELECT COUNT(*) INTO v_seeded_today
    FROM public.user_card_state ucs
    WHERE ucs.user_id = v_user_id
      AND ucs.foundation_card_id IS NOT NULL
      AND ucs.created_at >= v_collection_day_start_utc
      AND ucs.created_at < v_collection_day_end_utc;

    v_new_take := GREATEST(0, v_daily_new_cap - v_seeded_today);

    IF v_new_take > 0 THEN
      WITH candidates AS (
        SELECT fd.id
        FROM public.foundation_deck fd
        LEFT JOIN public.user_card_state ucs
          ON ucs.user_id = v_user_id AND ucs.foundation_card_id = fd.id
        WHERE ucs.id IS NULL
        ORDER BY fd.frequency_rank ASC
        LIMIT v_new_take
      )
      INSERT INTO public.user_card_state (user_id, foundation_card_id, status, next_review_at, source_type)
      SELECT v_user_id, c.id, 'new', now(), 'foundation'::public.deck_source_type
      FROM candidates c
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.user_card_state ucs
  LEFT JOIN public.vocabulary_cards vc
    ON ucs.vocabulary_card_id = vc.id
  WHERE ucs.user_id = v_user_id
    AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= now())
    AND (
      p_deck_scope = 'personal_and_foundation'
      OR (p_deck_scope = 'foundation' AND ucs.foundation_card_id IS NOT NULL)
      OR (
        p_deck_scope = 'personal'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'collected'
        AND coalesce(vc.category, '') <> 'alphabet_arabe'
      )
      OR (
        p_deck_scope = 'personal_sent'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'sent'
      )
      OR (
        p_deck_scope = 'personal_alphabet'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND (
          coalesce(ucs.source_type::text, 'collected') = 'alphabet'
          OR vc.category = 'alphabet_arabe'
        )
      )
    )
    AND (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL);

  RETURN v_count;
END;
$$;
CREATE OR REPLACE FUNCTION public.add_foundation_deck_to_my_account_v1(
  p_source text DEFAULT 'dashboard_foundation_step'
)
RETURNS TABLE(
  added_cards integer,
  existing_cards integer,
  total_cards integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source_raw text := NULLIF(btrim(coalesce(p_source, 'dashboard_foundation_step')), '');
  v_now_utc timestamp with time zone := now();
  v_collection_day_start_utc timestamp with time zone := NULL;
  v_collection_day_end_utc timestamp with time zone := NULL;
  v_scheduler_timezone text := 'UTC';
  v_scheduler_day_cutoff_hour integer := 4;
  v_daily_new_cap integer := 15;
  v_seeded_today integer := 0;
  v_new_take integer := 0;
  v_added integer := 0;
  v_assigned_count integer := 0;
  v_total integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.profiles (user_id, foundation_deck_enabled)
  VALUES (v_user_id, true)
  ON CONFLICT (user_id) DO UPDATE
  SET foundation_deck_enabled = true;

  SELECT
    LEAST(200, GREATEST(0, COALESCE(p.new_cards_per_day, 15))),
    COALESCE(NULLIF(btrim(p.scheduler_timezone), ''), 'UTC'),
    LEAST(23, GREATEST(0, COALESCE(p.scheduler_day_cutoff_hour, 4)))
  INTO
    v_daily_new_cap,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  v_daily_new_cap := COALESCE(v_daily_new_cap, 15);
  v_scheduler_timezone := COALESCE(NULLIF(btrim(v_scheduler_timezone), ''), 'UTC');
  v_scheduler_day_cutoff_hour := LEAST(
    23,
    GREATEST(0, COALESCE(v_scheduler_day_cutoff_hour, 4))
  );

  SELECT
    bounds.day_start_utc,
    bounds.day_end_utc
  INTO
    v_collection_day_start_utc,
    v_collection_day_end_utc
  FROM public.collection_day_bounds(
    v_now_utc,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  ) bounds;

  SELECT COUNT(*) INTO v_total
  FROM public.foundation_deck;

  SELECT COUNT(*) INTO v_seeded_today
  FROM public.user_card_state ucs
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id IS NOT NULL
    AND ucs.created_at >= v_collection_day_start_utc
    AND ucs.created_at < v_collection_day_end_utc;

  v_new_take := GREATEST(0, v_daily_new_cap - v_seeded_today);

  IF v_new_take > 0 THEN
    WITH candidates AS (
      SELECT fd.id
      FROM public.foundation_deck fd
      LEFT JOIN public.user_card_state ucs
        ON ucs.user_id = v_user_id AND ucs.foundation_card_id = fd.id
      WHERE ucs.id IS NULL
      ORDER BY fd.frequency_rank ASC
      LIMIT v_new_take
    ),
    inserted AS (
      INSERT INTO public.user_card_state (
        user_id,
        foundation_card_id,
        status,
        next_review_at,
        source_type
      )
      SELECT
        v_user_id,
        c.id,
        'new',
        now(),
        'foundation'::public.deck_source_type
      FROM candidates c
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT COUNT(*)
    INTO v_added
    FROM inserted;
  END IF;

  SELECT COUNT(*) INTO v_assigned_count
  FROM public.user_card_state ucs
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id IS NOT NULL;

  INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
  VALUES (
    v_user_id,
    'cards_added',
    jsonb_build_object(
      'source', coalesce(v_source_raw, 'dashboard_foundation_step'),
      'source_type', 'foundation',
      'deck', 'foundation_2000',
      'added_cards', v_added,
      'existing_cards', GREATEST(v_assigned_count - v_added, 0),
      'total_cards', v_total
    )
  );

  RETURN QUERY
  SELECT
    v_added,
    GREATEST(v_assigned_count - v_added, 0),
    v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.collection_day_id(timestamp with time zone, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collection_day_bounds(timestamp with time zone, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_cards_v2(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_count_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_foundation_deck_to_my_account_v1(text) TO authenticated;
