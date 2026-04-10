-- ============================================
-- LEARNING PROGRESS TABLES
-- ============================================
-- Ces tables permettent de tracker la progression d'apprentissage
-- des utilisateurs : cartes, révisions, activité quotidienne

-- Table: user_learning_progress
-- Stocke la progression globale de l'utilisateur
CREATE TABLE IF NOT EXISTS public.user_learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  total_words_learned INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  last_review_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Enable RLS
ALTER TABLE public.user_learning_progress ENABLE ROW LEVEL SECURITY;
-- Users can view their own progress
CREATE POLICY "Users can view own learning progress"
  ON public.user_learning_progress
  FOR SELECT
  USING (auth.uid() = user_id);
-- Users can insert their own progress
CREATE POLICY "Users can insert own learning progress"
  ON public.user_learning_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Users can update their own progress
CREATE POLICY "Users can update own learning progress"
  ON public.user_learning_progress
  FOR UPDATE
  USING (auth.uid() = user_id);
-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION public.update_learning_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_learning_progress_updated_at
  BEFORE UPDATE ON public.user_learning_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_learning_progress_updated_at();
-- Table: user_cards
-- Stocke les cartes flash de l'utilisateur
CREATE TABLE IF NOT EXISTS public.user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vocab_full TEXT NOT NULL,
  vocab_base TEXT NOT NULL,
  sent_full TEXT,
  sent_base TEXT,
  category TEXT,
  subcategory TEXT,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Enable RLS
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
-- Users can view their own cards
CREATE POLICY "Users can view own cards"
  ON public.user_cards
  FOR SELECT
  USING (auth.uid() = user_id);
-- Users can insert their own cards
CREATE POLICY "Users can insert own cards"
  ON public.user_cards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Users can update their own cards
CREATE POLICY "Users can update own cards"
  ON public.user_cards
  FOR UPDATE
  USING (auth.uid() = user_id);
-- Users can delete their own cards
CREATE POLICY "Users can delete own cards"
  ON public.user_cards
  FOR DELETE
  USING (auth.uid() = user_id);
-- Indexes for user_cards
CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON public.user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_category ON public.user_cards(category);
CREATE INDEX IF NOT EXISTS idx_user_cards_created_at ON public.user_cards(created_at DESC);
-- Trigger for updated_at
CREATE TRIGGER update_user_cards_updated_at
  BEFORE UPDATE ON public.user_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_learning_progress_updated_at();
-- Table: user_reviews
-- Stocke les historiques de révision des cartes
CREATE TABLE IF NOT EXISTS public.user_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.user_cards(id) ON DELETE CASCADE,
  vocab_word TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5), -- SM-2 quality: 0-5
  interval INTEGER NOT NULL DEFAULT 0, -- Jours jusqu'à la prochaine révision
  ease_factor NUMERIC(3, 2) DEFAULT 2.50, -- Facteur de facilité SM-2
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Enable RLS
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;
-- Users can view their own reviews
CREATE POLICY "Users can view own reviews"
  ON public.user_reviews
  FOR SELECT
  USING (auth.uid() = user_id);
-- Users can insert their own reviews
CREATE POLICY "Users can insert own reviews"
  ON public.user_reviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Indexes for user_reviews
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id ON public.user_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_review_date ON public.user_reviews(review_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_reviews_card_id ON public.user_reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_vocab_word ON public.user_reviews(vocab_word);
-- Table: user_daily_activity
-- Stocke l'activité quotidienne agrégée (pour la heatmap)
CREATE TABLE IF NOT EXISTS public.user_daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_date DATE NOT NULL,
  reviews_count INTEGER DEFAULT 0,
  new_words INTEGER DEFAULT 0,
  time_spent_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, activity_date)
);
-- Enable RLS
ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;
-- Users can view their own activity
CREATE POLICY "Users can view own daily activity"
  ON public.user_daily_activity
  FOR SELECT
  USING (auth.uid() = user_id);
-- Users can insert their own activity
CREATE POLICY "Users can insert own daily activity"
  ON public.user_daily_activity
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Users can update their own activity
CREATE POLICY "Users can update own daily activity"
  ON public.user_daily_activity
  FOR UPDATE
  USING (auth.uid() = user_id);
-- Indexes for user_daily_activity
CREATE INDEX IF NOT EXISTS idx_user_daily_activity_user_date ON public.user_daily_activity(user_id, activity_date DESC);
-- Trigger for updated_at
CREATE TRIGGER update_user_daily_activity_updated_at
  BEFORE UPDATE ON public.user_daily_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.update_learning_progress_updated_at();
-- Function: upsert_daily_activity
-- Fonction pour mettre à jour ou insérer l'activité quotidienne
CREATE OR REPLACE FUNCTION public.upsert_daily_activity(
  p_user_id UUID,
  p_activity_date DATE,
  p_reviews_count INTEGER DEFAULT 0,
  p_new_words INTEGER DEFAULT 0,
  p_time_spent_minutes INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.user_daily_activity (
    user_id,
    activity_date,
    reviews_count,
    new_words,
    time_spent_minutes
  )
  VALUES (
    p_user_id,
    p_activity_date,
    p_reviews_count,
    p_new_words,
    p_time_spent_minutes
  )
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    reviews_count = user_daily_activity.reviews_count + p_reviews_count,
    new_words = user_daily_activity.new_words + p_new_words,
    time_spent_minutes = user_daily_activity.time_spent_minutes + p_time_spent_minutes,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Function: update_user_progress
-- Fonction pour mettre à jour la progression globale après une review
CREATE OR REPLACE FUNCTION public.update_user_progress(
  p_user_id UUID,
  p_review_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
  v_last_review_date DATE;
  v_current_streak INTEGER;
  v_longest_streak INTEGER;
  v_total_words INTEGER;
BEGIN
  -- Récupérer la dernière date de review
  SELECT last_review_date INTO v_last_review_date
  FROM public.user_learning_progress
  WHERE user_id = p_user_id;

  -- Calculer le streak actuel
  IF v_last_review_date IS NULL THEN
    v_current_streak := 1;
  ELSIF v_last_review_date = p_review_date - INTERVAL '1 day' THEN
    -- Continuité
    v_current_streak := (
      SELECT current_streak
      FROM public.user_learning_progress
      WHERE user_id = p_user_id
    ) + 1;
  ELSIF v_last_review_date = p_review_date THEN
    -- Même jour, pas de changement
    v_current_streak := (
      SELECT current_streak
      FROM public.user_learning_progress
      WHERE user_id = p_user_id
    );
  ELSE
    -- Streak brisé
    v_current_streak := 1;
  END IF;

  -- Calculer le nombre total de mots uniques appris
  SELECT COUNT(DISTINCT vocab_word) INTO v_total_words
  FROM public.user_reviews
  WHERE user_id = p_user_id AND quality >= 3; -- Qualité >= 3 signifie "appris"

  -- Mettre à jour ou insérer la progression
  INSERT INTO public.user_learning_progress (
    user_id,
    total_words_learned,
    current_streak,
    longest_streak,
    last_review_date
  )
  VALUES (
    p_user_id,
    v_total_words,
    v_current_streak,
    v_current_streak,
    p_review_date
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_words_learned = EXCLUDED.total_words_learned,
    current_streak = EXCLUDED.current_streak,
    longest_streak = GREATEST(user_learning_progress.longest_streak, EXCLUDED.current_streak),
    last_review_date = EXCLUDED.last_review_date,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.upsert_daily_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_progress TO authenticated;
