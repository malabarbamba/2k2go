-- =====================================================
-- Daily immersion recommendations persistence
-- Date: 2026-04-06
-- Purpose:
--   - persist one recommendation set per user/day
--   - reuse the same set across devices during that day
--   - keep lightweight 7-day rolling video exclusion metadata
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_daily_immersion_recommendations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_day date NOT NULL,
  known_words_count integer NOT NULL DEFAULT 0,
  completed_reviews_count integer NOT NULL DEFAULT 0,
  recommended_video_ids text[] NOT NULL DEFAULT '{}'::text[],
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_daily_immersion_recommendations_pkey PRIMARY KEY (user_id, recommendation_day),
  CONSTRAINT user_daily_immersion_recommendations_known_words_check CHECK (known_words_count >= 0),
  CONSTRAINT user_daily_immersion_recommendations_completed_reviews_check CHECK (completed_reviews_count >= 0),
  CONSTRAINT user_daily_immersion_recommendations_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT user_daily_immersion_recommendations_video_ids_limit_check CHECK (coalesce(array_length(recommended_video_ids, 1), 0) <= 3)
);
ALTER TABLE public.user_daily_immersion_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own daily immersion recommendations"
  ON public.user_daily_immersion_recommendations;
CREATE POLICY "Users can read own daily immersion recommendations"
ON public.user_daily_immersion_recommendations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_user_daily_immersion_recommendations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_user_daily_immersion_recommendations_updated_at
  ON public.user_daily_immersion_recommendations;
CREATE TRIGGER trg_touch_user_daily_immersion_recommendations_updated_at
BEFORE UPDATE ON public.user_daily_immersion_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_daily_immersion_recommendations_updated_at();
