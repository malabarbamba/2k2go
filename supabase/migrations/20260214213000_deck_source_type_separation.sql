-- =====================================================
-- Deck source-type normalization for robust segmentation
-- Date: 2026-02-14
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'deck_source_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.deck_source_type AS ENUM ('foundation', 'collected', 'sent');
  END IF;
END
$$;
ALTER TABLE public.user_card_state
  ADD COLUMN IF NOT EXISTS source_type public.deck_source_type,
  ADD COLUMN IF NOT EXISTS source_raw text;
CREATE INDEX IF NOT EXISTS idx_user_card_state_source_type
  ON public.user_card_state(user_id, source_type);
CREATE OR REPLACE FUNCTION public.normalize_deck_source_raw(p_source_raw text)
RETURNS public.deck_source_type
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_source_raw, ''))) IN
      ('prof_cards_panel', 'teacher_cards_panel', 'personal_sent', 'sent_by_prof', 'sent', 'prof', 'teacher')
      THEN 'sent'::public.deck_source_type
    WHEN lower(btrim(coalesce(p_source_raw, ''))) IN
      ('video_cards_panel', 'cards_panel', 'apprendre', 'mined', 'collected')
      THEN 'collected'::public.deck_source_type
    ELSE NULL
  END;
$$;
CREATE OR REPLACE FUNCTION public.classify_deck_source_type(
  p_foundation_card_id uuid,
  p_explicit_source_type text,
  p_source_raw text,
  p_existing_source_type public.deck_source_type
)
RETURNS public.deck_source_type
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_foundation_card_id IS NOT NULL THEN 'foundation'::public.deck_source_type
    WHEN lower(btrim(coalesce(p_explicit_source_type, ''))) = 'sent' THEN 'sent'::public.deck_source_type
    WHEN lower(btrim(coalesce(p_explicit_source_type, ''))) = 'collected' THEN 'collected'::public.deck_source_type
    WHEN public.normalize_deck_source_raw(p_source_raw) IS NOT NULL THEN public.normalize_deck_source_raw(p_source_raw)
    WHEN p_existing_source_type IS NOT NULL THEN p_existing_source_type
    ELSE 'collected'::public.deck_source_type
  END;
$$;
CREATE OR REPLACE FUNCTION public.sync_user_card_state_source_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing public.deck_source_type;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_existing := OLD.source_type;
  ELSE
    v_existing := NULL;
  END IF;

  NEW.source_raw := NULLIF(btrim(coalesce(NEW.source_raw, '')), '');
  NEW.source_type := public.classify_deck_source_type(
    NEW.foundation_card_id,
    NEW.source_type::text,
    NEW.source_raw,
    v_existing
  );

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_user_card_state_source_type ON public.user_card_state;
CREATE TRIGGER trg_sync_user_card_state_source_type
  BEFORE INSERT OR UPDATE ON public.user_card_state
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_card_state_source_type();
WITH latest_cards_added AS (
  SELECT
    ual.user_id,
    NULLIF(ual.metadata ->> 'vocabulary_card_id', '') AS vocabulary_card_id_txt,
    NULLIF(ual.metadata ->> 'foundation_card_id', '') AS foundation_card_id_txt,
    NULLIF(btrim(ual.metadata ->> 'source'), '') AS source_raw,
    row_number() OVER (
      PARTITION BY ual.user_id,
      coalesce(NULLIF(ual.metadata ->> 'vocabulary_card_id', ''), NULLIF(ual.metadata ->> 'foundation_card_id', ''))
      ORDER BY ual.created_at DESC NULLS LAST, ual.id DESC
    ) AS rn
  FROM public.user_activity_log ual
  WHERE ual.activity_type = 'cards_added'
)
UPDATE public.user_card_state ucs
SET source_raw = coalesce(ucs.source_raw, lca.source_raw)
FROM latest_cards_added lca
WHERE lca.rn = 1
  AND lca.user_id = ucs.user_id
  AND (
    (lca.vocabulary_card_id_txt IS NOT NULL AND lca.vocabulary_card_id_txt = ucs.vocabulary_card_id::text)
    OR
    (lca.foundation_card_id_txt IS NOT NULL AND lca.foundation_card_id_txt = ucs.foundation_card_id::text)
  );
UPDATE public.user_card_state ucs
SET source_type = public.classify_deck_source_type(
  ucs.foundation_card_id,
  NULL,
  ucs.source_raw,
  ucs.source_type
)
WHERE ucs.source_type IS NULL;
ALTER TABLE public.user_card_state
  ALTER COLUMN source_type SET DEFAULT 'collected'::public.deck_source_type;
ALTER TABLE public.user_card_state
  ALTER COLUMN source_type SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_card_state_source_type_consistency'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.user_card_state
      ADD CONSTRAINT user_card_state_source_type_consistency CHECK (
        (foundation_card_id IS NOT NULL AND source_type = 'foundation')
        OR
        (foundation_card_id IS NULL AND source_type IN ('collected', 'sent'))
      );
  END IF;
END
$$;
CREATE OR REPLACE FUNCTION public.add_card_to_personal_deck_v2(
  p_vocabulary_card_id uuid DEFAULT NULL,
  p_foundation_card_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_source_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source_raw text := NULLIF(btrim(coalesce(p_source, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF (p_vocabulary_card_id IS NULL AND p_foundation_card_id IS NULL)
    OR (p_vocabulary_card_id IS NOT NULL AND p_foundation_card_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of p_vocabulary_card_id or p_foundation_card_id';
  END IF;

  INSERT INTO public.user_card_state (
    user_id,
    vocabulary_card_id,
    foundation_card_id,
    added_to_deck_at,
    source_raw,
    source_type
  )
  VALUES (
    v_user_id,
    p_vocabulary_card_id,
    p_foundation_card_id,
    now(),
    v_source_raw,
    public.classify_deck_source_type(p_foundation_card_id, p_source_type, v_source_raw, NULL)
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.user_card_state ucs
  SET
    added_to_deck_at = coalesce(ucs.added_to_deck_at, now()),
    source_raw = coalesce(ucs.source_raw, v_source_raw),
    source_type = public.classify_deck_source_type(
      ucs.foundation_card_id,
      p_source_type,
      coalesce(ucs.source_raw, v_source_raw),
      ucs.source_type
    )
  WHERE ucs.user_id = v_user_id
    AND (
      (p_vocabulary_card_id IS NOT NULL AND ucs.vocabulary_card_id = p_vocabulary_card_id)
      OR
      (p_foundation_card_id IS NOT NULL AND ucs.foundation_card_id = p_foundation_card_id)
    );

  INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
  VALUES (
    v_user_id,
    'cards_added',
    jsonb_build_object(
      'source', coalesce(v_source_raw, 'unknown'),
      'source_type', public.classify_deck_source_type(p_foundation_card_id, p_source_type, v_source_raw, NULL)::text,
      'vocabulary_card_id', p_vocabulary_card_id,
      'foundation_card_id', p_foundation_card_id
    )
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.add_video_cards_to_personal_deck_v2(
  p_video_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  WITH card_ids AS (
    SELECT vcv.vocabulary_card_id
    FROM public.vocabulary_card_videos vcv
    WHERE vcv.video_id = p_video_id
    UNION
    SELECT vc.id
    FROM public.vocabulary_cards vc
    WHERE vc.video_id = p_video_id
  ), ins AS (
    INSERT INTO public.user_card_state (
      user_id,
      vocabulary_card_id,
      added_to_deck_at,
      source_raw,
      source_type
    )
    SELECT
      v_user_id,
      c.vocabulary_card_id,
      now(),
      'video_cards_panel',
      'collected'::public.deck_source_type
    FROM card_ids c
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;

  RETURN v_count;
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
  v_new_take integer := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_deck_scope IN ('personal_and_foundation', 'foundation') THEN
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
      )
      OR (
        p_deck_scope = 'personal_sent'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'sent'
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
  v_new_take integer := 10;
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_deck_scope IN ('personal_and_foundation', 'foundation') THEN
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

  SELECT COUNT(*) INTO v_count
  FROM public.user_card_state ucs
  WHERE ucs.user_id = v_user_id
    AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= now())
    AND (
      p_deck_scope = 'personal_and_foundation'
      OR (p_deck_scope = 'foundation' AND ucs.foundation_card_id IS NOT NULL)
      OR (
        p_deck_scope = 'personal'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'collected'
      )
      OR (
        p_deck_scope = 'personal_sent'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'sent'
      )
    )
    AND (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL);

  RETURN v_count;
END;
$$;
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
  score numeric
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
  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  v_is_arabic := v_q ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';
  v_q_ar := public.normalize_arabic(v_q);
  v_q_lat := public.normalize_latin(v_q);

  PERFORM set_config('pg_trgm.similarity_threshold', '0.28', true);

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
      CASE WHEN ucs.first_seen_at IS NOT NULL THEN true ELSE false END AS is_seen,
      CASE WHEN ucs.added_to_deck_at IS NOT NULL THEN true ELSE false END AS is_added,
      CASE
        WHEN v_is_arabic THEN similarity(public.normalize_arabic(fd.word_ar), v_q_ar)
        ELSE GREATEST(
          similarity(public.normalize_latin(fd.word_fr), v_q_lat),
          similarity(public.normalize_latin(fd.transliteration), v_q_lat)
        )
      END AS score
    FROM public.foundation_deck fd
    LEFT JOIN public.user_card_state ucs
      ON v_user_id IS NOT NULL AND ucs.user_id = v_user_id AND ucs.foundation_card_id = fd.id
    WHERE (p_category IS NULL OR fd.category = p_category)
      AND (
        cardinality(v_source_types) = 0
        OR 'foundation' = ANY(v_source_types)
      )
      AND (
        (v_is_arabic AND public.normalize_arabic(fd.word_ar) % v_q_ar)
        OR
        (NOT v_is_arabic AND (
          public.normalize_latin(fd.word_fr) % v_q_lat
          OR public.normalize_latin(fd.transliteration) % v_q_lat
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
      CASE WHEN ucs.first_seen_at IS NOT NULL THEN true ELSE false END AS is_seen,
      CASE WHEN ucs.added_to_deck_at IS NOT NULL THEN true ELSE false END AS is_added,
      CASE
        WHEN v_is_arabic THEN similarity(public.normalize_arabic(vc.word_ar), v_q_ar)
        ELSE GREATEST(
          similarity(public.normalize_latin(vc.word_fr), v_q_lat),
          similarity(public.normalize_latin(vc.transliteration), v_q_lat)
        )
      END AS score
    FROM public.vocabulary_cards vc
    LEFT JOIN public.user_card_state ucs
      ON v_user_id IS NOT NULL AND ucs.user_id = v_user_id AND ucs.vocabulary_card_id = vc.id
    WHERE (p_category IS NULL OR vc.category = p_category)
      AND (
        cardinality(v_source_types) = 0
        OR coalesce(ucs.source_type::text, 'collected') = ANY(v_source_types)
      )
      AND (
        (v_is_arabic AND public.normalize_arabic(vc.word_ar) % v_q_ar)
        OR
        (NOT v_is_arabic AND (
          public.normalize_latin(vc.word_fr) % v_q_lat
          OR public.normalize_latin(vc.transliteration) % v_q_lat
        ))
      )
  )
  SELECT *
  FROM base
  WHERE score >= 0.28
  ORDER BY score DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;
