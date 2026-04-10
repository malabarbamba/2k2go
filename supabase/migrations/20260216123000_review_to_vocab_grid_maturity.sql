-- =====================================================
-- Link reviewed cards to vocab grid + FSRS maturity score
-- Date: 2026-02-16
-- =====================================================

CREATE OR REPLACE FUNCTION public.compute_user_card_maturity_score(
  p_last_reviewed_at timestamp with time zone,
  p_interval_days integer,
  p_scheduling_algorithm text,
  p_fsrs_stability numeric,
  p_status text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_interval_basis numeric := 0;
  v_raw_score numeric := 0;
BEGIN
  IF p_last_reviewed_at IS NULL THEN
    RETURN 0;
  END IF;

  v_interval_basis := GREATEST(
    0,
    CASE
      WHEN coalesce(p_scheduling_algorithm, 'fsrs') = 'fsrs' THEN coalesce(p_fsrs_stability, p_interval_days::numeric, 0)
      ELSE coalesce(p_interval_days::numeric, 0)
    END
  );

  v_raw_score := 1 - 1 / power((v_interval_basis / 21.0) + 1, 2);
  v_raw_score := LEAST(1, GREATEST(0, v_raw_score));

  IF coalesce(p_status, 'new') = 'learning' THEN
    RETURN LEAST(v_raw_score, 0.18);
  END IF;

  RETURN v_raw_score;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_user_card_state_first_seen_from_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.first_seen_at IS NULL AND NEW.last_reviewed_at IS NOT NULL THEN
    NEW.first_seen_at := NEW.last_reviewed_at;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_user_card_state_first_seen_from_review ON public.user_card_state;
CREATE TRIGGER trg_sync_user_card_state_first_seen_from_review
  BEFORE INSERT OR UPDATE ON public.user_card_state
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_card_state_first_seen_from_review();
UPDATE public.user_card_state
SET first_seen_at = last_reviewed_at
WHERE first_seen_at IS NULL
  AND last_reviewed_at IS NOT NULL;
DROP FUNCTION IF EXISTS public.search_cards_v2(text, text, integer, integer, text[]);
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
  v_limit integer := LEAST(COALESCE(p_limit, 20), 20);
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
  WITH base AS (
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
  SELECT *
  FROM base
  WHERE score >= 0.18 OR v_q = 'a'
  ORDER BY
    CASE WHEN v_q = 'a' THEN maturity_score ELSE score END DESC NULLS LAST,
    word_ar ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;
