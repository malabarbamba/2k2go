-- =====================================================
-- Deck Perso v2 - Canonical user card state + search + video/card relation
-- Date: 2026-02-10
-- =====================================================

-- Extensions for fuzzy search
-- Note: pg_trgm must be installed before we can use gin_trgm_ops
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- =====================================================
-- 1) Video <-> Vocabulary cards (M:N) join table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.vocabulary_card_videos (
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  vocabulary_card_id UUID NOT NULL REFERENCES public.vocabulary_cards(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, vocabulary_card_id)
);
CREATE INDEX IF NOT EXISTS idx_vocabulary_card_videos_card_id
  ON public.vocabulary_card_videos(vocabulary_card_id);
ALTER TABLE public.vocabulary_card_videos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vocabulary_card_videos' AND policyname = 'Vocab card videos public read'
  ) THEN
    CREATE POLICY "Vocab card videos public read" ON public.vocabulary_card_videos FOR SELECT USING (true);
  END IF;
END $$;
-- Backfill from legacy 1:N column (keep vocabulary_cards.video_id as primary video)
INSERT INTO public.vocabulary_card_videos (video_id, vocabulary_card_id)
SELECT vc.video_id, vc.id
FROM public.vocabulary_cards vc
WHERE vc.video_id IS NOT NULL
ON CONFLICT (video_id, vocabulary_card_id) DO NOTHING;
-- =====================================================
-- 2) Optional transliteration fields (may be backfilled later)
-- =====================================================
ALTER TABLE public.vocabulary_cards ADD COLUMN IF NOT EXISTS transliteration TEXT;
ALTER TABLE public.foundation_deck ADD COLUMN IF NOT EXISTS transliteration TEXT;
-- =====================================================
-- 3) Normalization helpers for search (Arabic + Latin)
-- =====================================================
CREATE OR REPLACE FUNCTION public.normalize_arabic(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT := COALESCE(input, '');
BEGIN
  -- Remove Arabic diacritics (tashkeel) and related marks
  s := regexp_replace(s, '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g');
  -- Remove tatweel
  s := replace(s, 'ـ', '');
  -- Normalize common variants
  s := regexp_replace(s, '[أإآا]', 'ا', 'g');
  s := regexp_replace(s, '[ؤ]', 'و', 'g');
  s := regexp_replace(s, '[ئ]', 'ي', 'g');
  s := regexp_replace(s, '[ىی]', 'ي', 'g');
  s := regexp_replace(s, '[ة]', 'ه', 'g');
  -- Remove standalone hamza
  s := regexp_replace(s, '[ء]', '', 'g');
  -- Normalize whitespace
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN btrim(s);
END;
$$;
CREATE OR REPLACE FUNCTION public.normalize_latin(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(lower(public.unaccent(COALESCE(input, ''))));
$$;
-- =====================================================
-- 4) Search indexes (trigram)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_vocabulary_cards_word_ar_trgm
  ON public.vocabulary_cards USING gin (public.normalize_arabic(word_ar) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vocabulary_cards_word_fr_trgm
  ON public.vocabulary_cards USING gin (public.normalize_latin(word_fr) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vocabulary_cards_translit_trgm
  ON public.vocabulary_cards USING gin (public.normalize_latin(transliteration) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_foundation_deck_word_ar_trgm
  ON public.foundation_deck USING gin (public.normalize_arabic(word_ar) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_foundation_deck_word_fr_trgm
  ON public.foundation_deck USING gin (public.normalize_latin(word_fr) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_foundation_deck_translit_trgm
  ON public.foundation_deck USING gin (public.normalize_latin(transliteration) gin_trgm_ops);
-- =====================================================
-- 5) Canonical per-user state for cards (rollup)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_card_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_card_id UUID REFERENCES public.vocabulary_cards(id) ON DELETE CASCADE,
  foundation_card_id UUID REFERENCES public.foundation_deck(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMP WITH TIME ZONE,
  added_to_deck_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'new',
  ease_factor NUMERIC(3, 2) NOT NULL DEFAULT 2.50,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  learning_step_index INTEGER NOT NULL DEFAULT 0,
  lapse_step_index INTEGER,
  next_review_at TIMESTAMP WITH TIME ZONE,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT user_card_state_status_check CHECK (status IN ('new', 'learning', 'review', 'mastered')),
  CONSTRAINT user_card_state_ease_min CHECK (ease_factor >= 1.30),
  CONSTRAINT user_card_state_counts_check CHECK (
    interval_days >= 0 AND
    repetitions >= 0 AND
    lapses >= 0 AND
    learning_step_index >= 0
  ),
  CONSTRAINT user_card_state_one_source CHECK (
    (vocabulary_card_id IS NOT NULL AND foundation_card_id IS NULL) OR
    (vocabulary_card_id IS NULL AND foundation_card_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_card_state_vocab
  ON public.user_card_state(user_id, vocabulary_card_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_card_state_foundation
  ON public.user_card_state(user_id, foundation_card_id);
CREATE INDEX IF NOT EXISTS idx_user_card_state_due
  ON public.user_card_state(user_id, next_review_at)
  WHERE next_review_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_card_state_added
  ON public.user_card_state(user_id, added_to_deck_at)
  WHERE added_to_deck_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_card_state_seen
  ON public.user_card_state(user_id, first_seen_at)
  WHERE first_seen_at IS NOT NULL;
-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_card_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS update_user_card_state_updated_at ON public.user_card_state;
CREATE TRIGGER update_user_card_state_updated_at
  BEFORE UPDATE ON public.user_card_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_card_state_updated_at();
ALTER TABLE public.user_card_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_card_state' AND policyname = 'User card state select own'
  ) THEN
    CREATE POLICY "User card state select own" ON public.user_card_state FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_card_state' AND policyname = 'User card state insert own'
  ) THEN
    CREATE POLICY "User card state insert own" ON public.user_card_state FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_card_state' AND policyname = 'User card state update own'
  ) THEN
    CREATE POLICY "User card state update own" ON public.user_card_state FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_card_state' AND policyname = 'User card state delete own'
  ) THEN
    CREATE POLICY "User card state delete own" ON public.user_card_state FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
-- =====================================================
-- 6) Canonical event log for reviews
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_card_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_card_id UUID REFERENCES public.vocabulary_cards(id) ON DELETE CASCADE,
  foundation_card_id UUID REFERENCES public.foundation_deck(id) ON DELETE CASCADE,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
  previous_interval_days INTEGER NOT NULL DEFAULT 0,
  new_interval_days INTEGER NOT NULL DEFAULT 0,
  previous_ease_factor NUMERIC(3, 2),
  new_ease_factor NUMERIC(3, 2),
  reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  client_review_id UUID,
  CONSTRAINT user_card_reviews_one_source CHECK (
    (vocabulary_card_id IS NOT NULL AND foundation_card_id IS NULL) OR
    (vocabulary_card_id IS NULL AND foundation_card_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_card_reviews_client_review
  ON public.user_card_reviews(user_id, client_review_id);
CREATE INDEX IF NOT EXISTS idx_user_card_reviews_user_time
  ON public.user_card_reviews(user_id, reviewed_at DESC);
ALTER TABLE public.user_card_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_card_reviews' AND policyname = 'User card reviews select own'
  ) THEN
    CREATE POLICY "User card reviews select own" ON public.user_card_reviews FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_card_reviews' AND policyname = 'User card reviews insert own'
  ) THEN
    CREATE POLICY "User card reviews insert own" ON public.user_card_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
-- =====================================================
-- 7) RPC helpers (v2)
-- =====================================================

CREATE OR REPLACE FUNCTION public.log_card_flip_v2(
  p_vocabulary_card_id UUID DEFAULT NULL,
  p_foundation_card_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF (p_vocabulary_card_id IS NULL AND p_foundation_card_id IS NULL) OR (p_vocabulary_card_id IS NOT NULL AND p_foundation_card_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of p_vocabulary_card_id or p_foundation_card_id';
  END IF;

  INSERT INTO public.user_card_state (user_id, vocabulary_card_id, foundation_card_id, first_seen_at)
  VALUES (v_user_id, p_vocabulary_card_id, p_foundation_card_id, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.user_card_state
  SET first_seen_at = COALESCE(first_seen_at, now())
  WHERE user_id = v_user_id
    AND ((p_vocabulary_card_id IS NOT NULL AND vocabulary_card_id = p_vocabulary_card_id)
      OR (p_foundation_card_id IS NOT NULL AND foundation_card_id = p_foundation_card_id));
END;
$$;
CREATE OR REPLACE FUNCTION public.add_card_to_personal_deck_v2(
  p_vocabulary_card_id UUID DEFAULT NULL,
  p_foundation_card_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF (p_vocabulary_card_id IS NULL AND p_foundation_card_id IS NULL) OR (p_vocabulary_card_id IS NOT NULL AND p_foundation_card_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of p_vocabulary_card_id or p_foundation_card_id';
  END IF;

  INSERT INTO public.user_card_state (user_id, vocabulary_card_id, foundation_card_id, added_to_deck_at)
  VALUES (v_user_id, p_vocabulary_card_id, p_foundation_card_id, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.user_card_state
  SET added_to_deck_at = COALESCE(added_to_deck_at, now())
  WHERE user_id = v_user_id
    AND ((p_vocabulary_card_id IS NOT NULL AND vocabulary_card_id = p_vocabulary_card_id)
      OR (p_foundation_card_id IS NOT NULL AND foundation_card_id = p_foundation_card_id));

  -- optional activity log
  INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
  VALUES (v_user_id, 'cards_added', jsonb_build_object(
    'source', COALESCE(p_source, 'unknown'),
    'vocabulary_card_id', p_vocabulary_card_id,
    'foundation_card_id', p_foundation_card_id
  ));
END;
$$;
CREATE OR REPLACE FUNCTION public.add_video_cards_to_personal_deck_v2(
  p_video_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER := 0;
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
    INSERT INTO public.user_card_state (user_id, vocabulary_card_id, added_to_deck_at)
    SELECT v_user_id, c.vocabulary_card_id, now()
    FROM card_ids c
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_cards_v2(
  p_deck_scope TEXT DEFAULT 'personal_and_foundation',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  source TEXT,
  vocabulary_card_id UUID,
  foundation_card_id UUID,
  word_ar TEXT,
  word_fr TEXT,
  transliteration TEXT,
  example_sentence_ar TEXT,
  example_sentence_fr TEXT,
  audio_url TEXT,
  category TEXT,
  status TEXT,
  next_review_at TIMESTAMP WITH TIME ZONE,
  added_to_deck_at TIMESTAMP WITH TIME ZONE,
  first_seen_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER := LEAST(COALESCE(p_limit, 20), 50);
  v_new_take INTEGER := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Lazily seed new foundation cards into state (avoid pre-creating thousands per user)
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
    INSERT INTO public.user_card_state (user_id, foundation_card_id, status, next_review_at)
    SELECT v_user_id, c.id, 'new', now()
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
    AND (
      ucs.next_review_at IS NULL OR ucs.next_review_at <= now()
    )
    AND (
      p_deck_scope = 'personal_and_foundation'
      OR (p_deck_scope = 'foundation' AND ucs.foundation_card_id IS NOT NULL)
      OR (p_deck_scope = 'personal' AND ucs.vocabulary_card_id IS NOT NULL)
    )
    AND (
      ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL
    )
  ORDER BY ucs.next_review_at ASC NULLS FIRST
  LIMIT v_limit;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_count_v2(
  p_deck_scope TEXT DEFAULT 'personal_and_foundation'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new_take INTEGER := 10;
  v_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Seed a small amount of new foundation cards, consistent with get_due_cards_v2
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
    INSERT INTO public.user_card_state (user_id, foundation_card_id, status, next_review_at)
    SELECT v_user_id, c.id, 'new', now()
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
      OR (p_deck_scope = 'personal' AND ucs.vocabulary_card_id IS NOT NULL)
    )
    AND (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL);

  RETURN v_count;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_history_cards_v2(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  source TEXT,
  vocabulary_card_id UUID,
  foundation_card_id UUID,
  word_ar TEXT,
  word_fr TEXT,
  transliteration TEXT,
  example_sentence_ar TEXT,
  example_sentence_fr TEXT,
  audio_url TEXT,
  category TEXT,
  first_seen_at TIMESTAMP WITH TIME ZONE,
  added_to_deck_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER := LEAST(COALESCE(p_limit, 50), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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
    ucs.first_seen_at,
    ucs.added_to_deck_at
  FROM public.user_card_state ucs
  LEFT JOIN public.vocabulary_cards vc ON ucs.vocabulary_card_id = vc.id
  LEFT JOIN public.foundation_deck fd ON ucs.foundation_card_id = fd.id
  WHERE ucs.user_id = v_user_id
    AND ucs.first_seen_at IS NOT NULL
  ORDER BY ucs.first_seen_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;
CREATE OR REPLACE FUNCTION public.submit_review_sm2_v2(
  p_vocabulary_card_id UUID DEFAULT NULL,
  p_foundation_card_id UUID DEFAULT NULL,
  p_quality INTEGER DEFAULT NULL,
  p_client_review_id UUID DEFAULT NULL
)
RETURNS TABLE(
  status TEXT,
  ease_factor NUMERIC(3, 2),
  interval_days INTEGER,
  repetitions INTEGER,
  lapses INTEGER,
  next_review_at TIMESTAMP WITH TIME ZONE,
  last_reviewed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_action TEXT;
  v_state public.user_card_state%ROWTYPE;
  v_prev_interval INTEGER;
  v_prev_ease NUMERIC(3, 2);
  v_new_interval INTEGER;
  v_new_ease NUMERIC(3, 2);
  v_new_repetitions INTEGER;
  v_new_lapses INTEGER;
  v_new_status TEXT;
  v_new_next TIMESTAMP WITH TIME ZONE;
  v_lapse_ratio NUMERIC := 0.55;
  v_hard_multiplier NUMERIC := 1.20;
  v_easy_multiplier NUMERIC := 1.30;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_quality IS NULL OR p_quality < 0 OR p_quality > 5 THEN
    RAISE EXCEPTION 'quality must be between 0 and 5';
  END IF;

  IF (p_vocabulary_card_id IS NULL AND p_foundation_card_id IS NULL) OR (p_vocabulary_card_id IS NOT NULL AND p_foundation_card_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of p_vocabulary_card_id or p_foundation_card_id';
  END IF;

  -- Map quality to Anki-like actions
  IF p_quality <= 2 THEN
    v_action := 'again';
  ELSIF p_quality = 3 THEN
    v_action := 'hard';
  ELSIF p_quality = 4 THEN
    v_action := 'good';
  ELSE
    v_action := 'easy';
  END IF;

  -- Ensure state row exists
  INSERT INTO public.user_card_state (user_id, vocabulary_card_id, foundation_card_id, status, next_review_at)
  VALUES (v_user_id, p_vocabulary_card_id, p_foundation_card_id, 'new', v_now)
  ON CONFLICT DO NOTHING;

  -- Lock current state
  SELECT * INTO v_state
  FROM public.user_card_state
  WHERE user_id = v_user_id
    AND ((p_vocabulary_card_id IS NOT NULL AND vocabulary_card_id = p_vocabulary_card_id)
      OR (p_foundation_card_id IS NOT NULL AND foundation_card_id = p_foundation_card_id))
  FOR UPDATE;

  v_prev_interval := COALESCE(v_state.interval_days, 0);
  v_prev_ease := COALESCE(v_state.ease_factor, 2.50);

  -- Ease factor updates (Anki-style deltas, min 1.3)
  IF v_action = 'again' THEN
    v_new_ease := GREATEST(1.30, v_prev_ease - 0.20);
  ELSIF v_action = 'hard' THEN
    v_new_ease := GREATEST(1.30, v_prev_ease - 0.15);
  ELSIF v_action = 'good' THEN
    v_new_ease := v_prev_ease;
  ELSE
    v_new_ease := v_prev_ease + 0.15;
  END IF;

  -- Scheduling (simple Anki-like behavior: failures come back soon)
  IF v_action = 'again' THEN
    v_new_lapses := v_state.lapses + 1;
    v_new_repetitions := v_state.repetitions + 1;
    v_new_status := 'learning';
    v_new_interval := GREATEST(0, FLOOR(GREATEST(1, v_prev_interval) * v_lapse_ratio)::INTEGER);
    v_new_next := v_now + INTERVAL '10 minutes';
  ELSE
    v_new_lapses := v_state.lapses;
    v_new_repetitions := v_state.repetitions + 1;
    v_new_status := 'review';

    IF v_state.repetitions = 0 THEN
      -- first successful review
      IF v_action = 'hard' THEN
        v_new_interval := 1;
      ELSIF v_action = 'good' THEN
        v_new_interval := 1;
      ELSE
        v_new_interval := 4;
      END IF;
    ELSE
      IF v_action = 'hard' THEN
        v_new_interval := GREATEST(2, ROUND(GREATEST(1, v_prev_interval) * v_hard_multiplier)::INTEGER);
      ELSIF v_action = 'good' THEN
        v_new_interval := GREATEST(2, ROUND(GREATEST(1, v_prev_interval) * v_prev_ease)::INTEGER);
      ELSE
        v_new_interval := GREATEST(2, ROUND(GREATEST(1, v_prev_interval) * v_prev_ease * v_easy_multiplier)::INTEGER);
      END IF;
    END IF;

    v_new_next := v_now + make_interval(days => v_new_interval);
  END IF;

  UPDATE public.user_card_state
  SET
    status = v_new_status,
    ease_factor = v_new_ease,
    interval_days = v_new_interval,
    repetitions = v_new_repetitions,
    lapses = v_new_lapses,
    last_reviewed_at = v_now,
    next_review_at = v_new_next
  WHERE id = v_state.id;

  -- Idempotent event log (client_review_id optional)
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
    client_review_id
  )
  VALUES (
    v_user_id,
    p_vocabulary_card_id,
    p_foundation_card_id,
    p_quality,
    v_prev_interval,
    v_new_interval,
    v_prev_ease,
    v_new_ease,
    v_now,
    p_client_review_id
  )
  ON CONFLICT (user_id, client_review_id) DO NOTHING;

  -- Activity log
  INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
  VALUES (v_user_id, 'card_reviewed', jsonb_build_object(
    'quality', p_quality,
    'action', v_action,
    'vocabulary_card_id', p_vocabulary_card_id,
    'foundation_card_id', p_foundation_card_id
  ));

  RETURN QUERY
  SELECT v_new_status, v_new_ease, v_new_interval, v_new_repetitions, v_new_lapses, v_new_next, v_now;
END;
$$;
-- =====================================================
-- 8) Search RPC (v2)
-- =====================================================
CREATE OR REPLACE FUNCTION public.search_cards_v2(
  p_q TEXT,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  source TEXT,
  vocabulary_card_id UUID,
  foundation_card_id UUID,
  word_ar TEXT,
  word_fr TEXT,
  transliteration TEXT,
  category TEXT,
  is_seen BOOLEAN,
  is_added BOOLEAN,
  score NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_q TEXT := btrim(COALESCE(p_q, ''));
  v_limit INTEGER := LEAST(COALESCE(p_limit, 20), 20);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_is_arabic BOOLEAN := false;
  v_q_ar TEXT;
  v_q_lat TEXT;
BEGIN
  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  v_is_arabic := v_q ~ '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]';
  v_q_ar := public.normalize_arabic(v_q);
  v_q_lat := public.normalize_latin(v_q);  -- This already calls unaccent internally

  -- Prefer a slightly strict threshold to avoid too many results
  PERFORM set_config('pg_trgm.similarity_threshold', '0.28', true);

  RETURN QUERY
  WITH base AS (
    SELECT
      'foundation'::TEXT AS source,
      NULL::UUID AS vocabulary_card_id,
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
        (v_is_arabic AND public.normalize_arabic(fd.word_ar) % v_q_ar)
        OR
        (NOT v_is_arabic AND (
          public.normalize_latin(fd.word_fr) % v_q_lat
          OR public.normalize_latin(fd.transliteration) % v_q_lat
        ))
      )

    UNION ALL

    SELECT
      'vocabulary'::TEXT AS source,
      vc.id AS vocabulary_card_id,
      NULL::UUID AS foundation_card_id,
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
