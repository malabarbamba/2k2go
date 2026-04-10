-- =====================================================
-- Canonicalize review preview onboarding source key
-- Date: 2026-02-23
-- =====================================================

CREATE OR REPLACE FUNCTION public.normalize_review_preview_source_raw(p_source_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_source_raw, ''))) IN (
      'app_prepare_terrain_env2',
      'phase1_review_step',
      'phase1-review-step'
    ) THEN 'phase1-review-step'
    ELSE NULLIF(btrim(coalesce(p_source_raw, '')), '')
  END;
$$;
ALTER TABLE public.review_preview_onboarding_sessions
  ALTER COLUMN source SET DEFAULT 'phase1-review-step';
UPDATE public.review_preview_onboarding_sessions
SET source = 'phase1-review-step'
WHERE lower(btrim(coalesce(source, ''))) IN (
  'app_prepare_terrain_env2',
  'phase1_review_step'
);
CREATE OR REPLACE FUNCTION public.start_review_preview_session_v1(
  p_source text DEFAULT 'phase1-review-step'
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
  v_source text := public.normalize_review_preview_source_raw(p_source);
  v_row public.review_preview_onboarding_sessions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_source IS NULL THEN
    v_source := 'phase1-review-step';
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
      'phase1-review-step',
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
