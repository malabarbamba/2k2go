-- =====================================================
-- Enforce Foundation opt-in and read-only due RPCs
-- Date: 2026-02-23
-- Purpose:
--   1) New users start with profile-only bootstrap (no card assignment)
--   2) Foundation assignment happens only through explicit opt-in RPC
--   3) get_due_cards_v2 / get_due_count_v2 are strictly read-only
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
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
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit integer := LEAST(COALESCE(p_limit, 20), 50);
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
  )
  INTO v_foundation_enabled;

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
    AND (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL)
    AND (ucs.foundation_card_id IS NULL OR v_foundation_enabled)
  ORDER BY ucs.next_review_at ASC NULLS FIRST
        , CASE WHEN ucs.status = 'new' THEN 0 ELSE 1 END ASC
         , ucs.id ASC
  LIMIT v_limit;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_count_v2(
  p_deck_scope text DEFAULT 'personal_and_foundation'
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
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
  )
  INTO v_foundation_enabled;

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
    AND (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL)
    AND (ucs.foundation_card_id IS NULL OR v_foundation_enabled);

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_due_cards_v2(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_count_v2(text) TO authenticated;
