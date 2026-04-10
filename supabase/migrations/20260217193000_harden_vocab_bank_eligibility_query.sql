-- =====================================================
-- Harden vocab bank query for eligible-card retrieval
-- Date: 2026-02-17
-- =====================================================

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
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_q text := btrim(coalesce(p_q, ''));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 1000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_is_arabic boolean := false;
  v_q_ar text;
  v_q_lat text;
  v_source_types text[] := ARRAY(
    SELECT lower(btrim(x))
    FROM unnest(coalesce(p_source_types, ARRAY[]::text[])) AS x
    WHERE lower(btrim(x)) IN ('foundation', 'collected', 'sent')
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
      fd.id AS foundation_card_id,
      fd.word_ar,
      fd.word_fr,
      fd.transliteration,
      fd.category,
      CASE WHEN ucs.first_seen_at IS NOT NULL OR ucs.last_reviewed_at IS NOT NULL THEN true ELSE false END AS is_seen,
      CASE WHEN ucs.added_to_deck_at IS NOT NULL THEN true ELSE false END AS is_added,
      CASE
        WHEN v_is_arabic THEN similarity(public.normalize_arabic(fd.word_ar), v_q_ar)
        ELSE GREATEST(
          similarity(public.normalize_latin(fd.word_fr), v_q_lat),
          similarity(public.normalize_latin(fd.transliteration), v_q_lat)
        )
      END AS score,
      public.compute_user_card_maturity_score(
        ucs.last_reviewed_at,
        ucs.interval_days,
        ucs.scheduling_algorithm,
        ucs.fsrs_stability,
        ucs.status
      ) AS maturity_score
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
      coalesce(ucs.source_type::text, 'collected') AS source_type,
      vc.id AS vocabulary_card_id,
      NULL::uuid AS foundation_card_id,
      vc.word_ar,
      vc.word_fr,
      vc.transliteration,
      vc.category,
      CASE WHEN ucs.first_seen_at IS NOT NULL OR ucs.last_reviewed_at IS NOT NULL THEN true ELSE false END AS is_seen,
      CASE WHEN ucs.added_to_deck_at IS NOT NULL THEN true ELSE false END AS is_added,
      CASE
        WHEN v_is_arabic THEN similarity(public.normalize_arabic(vc.word_ar), v_q_ar)
        ELSE GREATEST(
          similarity(public.normalize_latin(vc.word_fr), v_q_lat),
          similarity(public.normalize_latin(vc.transliteration), v_q_lat)
        )
      END AS score,
      public.compute_user_card_maturity_score(
        ucs.last_reviewed_at,
        ucs.interval_days,
        ucs.scheduling_algorithm,
        ucs.fsrs_stability,
        ucs.status
      ) AS maturity_score
    FROM public.vocabulary_cards vc
    LEFT JOIN public.user_card_state ucs
      ON v_user_id IS NOT NULL AND ucs.user_id = v_user_id AND ucs.vocabulary_card_id = vc.id
    WHERE (p_category IS NULL OR vc.category = p_category)
      AND (
        cardinality(v_source_types) = 0
        OR coalesce(ucs.source_type::text, 'collected') = ANY(v_source_types)
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
    base.source,
    base.source_type,
    base.vocabulary_card_id,
    base.foundation_card_id,
    base.word_ar,
    base.word_fr,
    base.transliteration,
    base.category,
    base.is_seen,
    base.is_added,
    base.score,
    base.maturity_score
  FROM base
  WHERE base.score >= 0.18 OR v_q = 'a'
  ORDER BY
    CASE WHEN (base.is_seen OR base.is_added) THEN 1 ELSE 0 END DESC,
    CASE WHEN v_q = 'a' THEN base.maturity_score ELSE base.score END DESC NULLS LAST,
    base.word_ar ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;
