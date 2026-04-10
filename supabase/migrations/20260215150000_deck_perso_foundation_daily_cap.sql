-- =====================================================
-- Deck Perso: cap daily foundation seeding to 21 cards
-- Date: 2026-02-15
-- =====================================================

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
  v_day_start timestamp with time zone := date_trunc('day', now());
  v_daily_new_cap integer := 21;
  v_seeded_today integer := 0;
  v_new_take integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_deck_scope IN ('personal_and_foundation', 'foundation')
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
      AND ucs.created_at >= v_day_start
      AND ucs.created_at < v_day_start + INTERVAL '1 day';

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
  v_day_start timestamp with time zone := date_trunc('day', now());
  v_daily_new_cap integer := 21;
  v_seeded_today integer := 0;
  v_new_take integer := 0;
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_deck_scope IN ('personal_and_foundation', 'foundation')
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
      AND ucs.created_at >= v_day_start
      AND ucs.created_at < v_day_start + INTERVAL '1 day';

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
