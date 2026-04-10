-- =====================================================
-- One-time review preview onboarding session lifecycle
-- Date: 2026-02-21
-- =====================================================

CREATE TABLE IF NOT EXISTS public.review_preview_onboarding_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preview_session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'app_prepare_terrain_env2',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  completion_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.review_preview_onboarding_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_preview_onboarding_sessions_user_read
  ON public.review_preview_onboarding_sessions;
CREATE POLICY review_preview_onboarding_sessions_user_read
ON public.review_preview_onboarding_sessions
FOR SELECT
USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.start_review_preview_session_v1(
  p_source text DEFAULT 'app_prepare_terrain_env2'
)
RETURNS TABLE(
  preview_session_id uuid,
  status text,
  should_show_preview boolean,
  completed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_source text := NULLIF(btrim(coalesce(p_source, 'app_prepare_terrain_env2')), '');
  v_row public.review_preview_onboarding_sessions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_source IS NULL THEN
    v_source := 'app_prepare_terrain_env2';
  END IF;

  INSERT INTO public.review_preview_onboarding_sessions (
    user_id,
    source,
    status,
    started_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_source,
    'active',
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    updated_at = v_now,
    source = CASE
      WHEN public.review_preview_onboarding_sessions.status = 'completed'
        THEN public.review_preview_onboarding_sessions.source
      ELSE EXCLUDED.source
    END
  RETURNING * INTO v_row;

  IF v_row.status = 'completed' THEN
    RETURN QUERY
    SELECT
      v_row.preview_session_id,
      v_row.status,
      false,
      v_row.completed_at;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_row.preview_session_id,
    'active'::text,
    true,
    NULL::timestamp with time zone;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_review_preview_session_v1(
  p_preview_session_id uuid DEFAULT NULL,
  p_completion_reason text DEFAULT 'cards_completed'
)
RETURNS TABLE(
  preview_session_id uuid,
  status text,
  should_show_preview boolean,
  completed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_reason text := NULLIF(btrim(coalesce(p_completion_reason, 'cards_completed')), '');
  v_row public.review_preview_onboarding_sessions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_reason IS NULL THEN
    v_reason := 'cards_completed';
  END IF;

  SELECT *
  INTO v_row
  FROM public.review_preview_onboarding_sessions
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.review_preview_onboarding_sessions (
      user_id,
      preview_session_id,
      source,
      status,
      started_at,
      completed_at,
      completion_reason,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      coalesce(p_preview_session_id, gen_random_uuid()),
      'app_prepare_terrain_env2',
      'completed',
      v_now,
      v_now,
      v_reason,
      v_now,
      v_now
    )
    RETURNING * INTO v_row;
  ELSIF v_row.status <> 'completed' THEN
    UPDATE public.review_preview_onboarding_sessions
    SET
      status = 'completed',
      preview_session_id = coalesce(p_preview_session_id, v_row.preview_session_id),
      completed_at = coalesce(v_row.completed_at, v_now),
      completion_reason = v_reason,
      updated_at = v_now
    WHERE user_id = v_user_id
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY
  SELECT
    v_row.preview_session_id,
    'completed'::text,
    false,
    v_row.completed_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_review_preview_session_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_review_preview_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_review_preview_session_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_review_preview_session_v1(uuid, text) TO service_role;
