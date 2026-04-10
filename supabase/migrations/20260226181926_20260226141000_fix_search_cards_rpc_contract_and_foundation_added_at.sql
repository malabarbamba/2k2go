DO $$
BEGIN
  IF to_regprocedure('public.unaccent(text)') IS NULL THEN
    IF to_regprocedure('extensions.unaccent(text)') IS NOT NULL THEN
      EXECUTE 'CREATE FUNCTION public.unaccent(input text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS ''SELECT extensions.unaccent($1);''';
    ELSIF to_regprocedure('unaccent(text)') IS NOT NULL THEN
      EXECUTE 'CREATE FUNCTION public.unaccent(input text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS ''SELECT unaccent($1);''';
    ELSE
      RAISE EXCEPTION 'unaccent(text) is unavailable in this database';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_latin(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $$
  SELECT btrim(lower(public.unaccent(COALESCE(input, ''))));
$$;

DROP FUNCTION IF EXISTS public.search_cards_v2(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_cards_v2(
  p_q text,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_source_types text[] DEFAULT NULL
)
RETURNS TABLE(
  source text,
  source_type text,
  vocabulary_card_id uuid,
  foundation_card_id uuid,
  word_ar text,
  word_fr text,
  transliteration text,
  category text,
  is_seen boolean,
  is_added boolean,
  score numeric,
  maturity_score numeric
)
LANGUAGE plpgsql
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_q text := btrim(coalesce(p_q, ''));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 1000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_is_arabic boolean := false;
  v_q_ar text;
  v_q_lat text;
  v_source_types text[] := ARRAY(
    SELECT lower(btrim(x))
    FROM unnest(coalesce(p_source_types, ARRAY[]::text[])) AS x
    WHERE lower(btrim(x)) IN ('foundation', 'collected', 'sent', 'alphabet')
  );
BEGIN
  IF length(v_q) < 1 THEN
    v_q := 'a';
  END IF;

  v_is_arabic := v_q ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';
  v_q_ar := public.normalize_arabic(v_q);
  v_q_lat := public.normalize_latin(v_q);

  PERFORM set_config('pg_trgm.similarity_threshold', '0.18', true);

  RETURN QUERY
  WITH base (
    source,
    source_type,
    vocabulary_card_id,
    foundation_card_id,
    word_ar,
    word_fr,
    transliteration,
    category,
    is_seen,
    is_added,
    score,
    maturity_score
  ) AS (
    SELECT
      'foundation'::text AS source,
      'foundation'::text AS source_type,
      NULL::uuid AS vocabulary_card_id,
      fd.id::uuid AS foundation_card_id,
      fd.word_ar::text,
      fd.word_fr::text,
      fd.transliteration::text,
      fd.category::text,
      (ucs.last_reviewed_at IS NOT NULL) AS is_seen,
      (
        ucs.added_to_deck_at IS NOT NULL
        OR ucs.foundation_card_id IS NOT NULL
      ) AS is_added,
      (
        CASE
          WHEN v_is_arabic THEN similarity(public.normalize_arabic(fd.word_ar), v_q_ar)
          ELSE GREATEST(
            similarity(public.normalize_latin(fd.word_fr), v_q_lat),
            similarity(public.normalize_latin(fd.transliteration), v_q_lat)
          )
        END
      )::numeric AS score,
      public.compute_user_card_maturity_score(
        ucs.last_reviewed_at,
        ucs.interval_days,
        ucs.scheduling_algorithm,
        ucs.fsrs_stability,
        ucs.status
      )::numeric AS maturity_score
    FROM public.foundation_deck fd
    LEFT JOIN public.user_card_state ucs
      ON v_user_id IS NOT NULL AND ucs.user_id = v_user_id AND ucs.foundation_card_id = fd.id
    WHERE (p_category IS NULL OR fd.category = p_category)
      AND (
        cardinality(v_source_types) = 0
        OR 'foundation' = ANY(v_source_types)
      )
      AND (
        (v_is_arabic AND (
          public.normalize_arabic(fd.word_ar) % v_q_ar
          OR v_q = 'a'
        ))
        OR
        (NOT v_is_arabic AND (
          public.normalize_latin(fd.word_fr) % v_q_lat
          OR public.normalize_latin(fd.transliteration) % v_q_lat
          OR v_q = 'a'
        ))
      )

    UNION ALL

    SELECT
      'vocabulary'::text AS source,
      coalesce(ucs.source_type::text, 'collected'::text)::text AS source_type,
      vc.id::uuid AS vocabulary_card_id,
      NULL::uuid AS foundation_card_id,
      vc.word_ar::text,
      vc.word_fr::text,
      vc.transliteration::text,
      vc.category::text,
      (ucs.last_reviewed_at IS NOT NULL) AS is_seen,
      (ucs.added_to_deck_at IS NOT NULL) AS is_added,
      (
        CASE
          WHEN v_is_arabic THEN similarity(public.normalize_arabic(vc.word_ar), v_q_ar)
          ELSE GREATEST(
            similarity(public.normalize_latin(vc.word_fr), v_q_lat),
            similarity(public.normalize_latin(vc.transliteration), v_q_lat)
          )
        END
      )::numeric AS score,
      public.compute_user_card_maturity_score(
        ucs.last_reviewed_at,
        ucs.interval_days,
        ucs.scheduling_algorithm,
        ucs.fsrs_stability,
        ucs.status
      )::numeric AS maturity_score
    FROM public.vocabulary_cards vc
    LEFT JOIN public.user_card_state ucs
      ON v_user_id IS NOT NULL AND ucs.user_id = v_user_id AND ucs.vocabulary_card_id = vc.id
    WHERE (p_category IS NULL OR vc.category = p_category)
      AND (
        cardinality(v_source_types) = 0
        OR coalesce(ucs.source_type::text, 'collected'::text)::text = ANY(v_source_types)
      )
      AND (
        (v_is_arabic AND (
          public.normalize_arabic(vc.word_ar) % v_q_ar
          OR v_q = 'a'
        ))
        OR
        (NOT v_is_arabic AND (
          public.normalize_latin(vc.word_fr) % v_q_lat
          OR public.normalize_latin(vc.transliteration) % v_q_lat
          OR v_q = 'a'
        ))
      )
  )
  SELECT
    base.source::text,
    base.source_type::text,
    base.vocabulary_card_id::uuid,
    base.foundation_card_id::uuid,
    base.word_ar::text,
    base.word_fr::text,
    base.transliteration::text,
    base.category::text,
    base.is_seen::boolean,
    base.is_added::boolean,
    base.score::numeric,
    base.maturity_score::numeric
  FROM base
  WHERE base.score >= 0.18 OR v_q = 'a'
  ORDER BY
    CASE WHEN base.is_seen THEN 1 ELSE 0 END DESC,
    CASE WHEN v_q = 'a' THEN base.maturity_score ELSE base.score END DESC NULLS LAST,
    base.word_ar ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

UPDATE public.user_card_state
SET added_to_deck_at = COALESCE(added_to_deck_at, created_at, now())
WHERE foundation_card_id IS NOT NULL
  AND added_to_deck_at IS NULL;

CREATE OR REPLACE FUNCTION public.add_foundation_deck_to_my_account_v1(
  p_source text DEFAULT 'dashboard_foundation_step'
)
RETURNS TABLE(
  added_cards integer,
  existing_cards integer,
  total_cards integer
)
LANGUAGE plpgsql
SET search_path TO public, pg_temp
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
        added_to_deck_at,
        source_type
      )
      SELECT
        v_user_id,
        c.id,
        'new',
        now(),
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

  UPDATE public.user_card_state ucs
  SET
    added_to_deck_at = COALESCE(ucs.added_to_deck_at, ucs.created_at, now()),
    source_type = COALESCE(ucs.source_type, 'foundation'::public.deck_source_type)
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id IS NOT NULL;

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

GRANT EXECUTE ON FUNCTION public.search_cards_v2(text, text, integer, integer, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_foundation_deck_to_my_account_v1(text) TO authenticated;

NOTIFY pgrst, 'reload schema';;
