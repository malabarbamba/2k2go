-- =====================================================
-- Enforce single active review session per account (lease-based)
-- Date: 2026-02-15
-- =====================================================

CREATE TABLE IF NOT EXISTS public.review_session_leases (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  review_session_id uuid NOT NULL,
  lease_expires_at timestamp with time zone NOT NULL,
  heartbeat_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.review_session_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_session_leases_user_read
ON public.review_session_leases
FOR SELECT
USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.claim_review_session_lease_v1(
  p_review_session_id uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE(
  lease_expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_next_expiry timestamp with time zone;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_review_session_id IS NULL THEN
    RAISE EXCEPTION 'review_session_id is required';
  END IF;

  IF p_lease_seconds IS NULL OR p_lease_seconds < 15 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'p_lease_seconds must be between 15 and 900';
  END IF;

  INSERT INTO public.review_session_leases (
    user_id,
    review_session_id,
    lease_expires_at,
    heartbeat_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_review_session_id,
    v_now + make_interval(secs => p_lease_seconds),
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    review_session_id = EXCLUDED.review_session_id,
    lease_expires_at = EXCLUDED.lease_expires_at,
    heartbeat_at = v_now,
    updated_at = v_now
  WHERE
    public.review_session_leases.review_session_id = EXCLUDED.review_session_id
    OR public.review_session_leases.lease_expires_at <= v_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVE_REVIEW_SESSION_LOCKED'
      USING
        ERRCODE = 'P0001',
        DETAIL = 'Another active review session already holds this account lease.',
        HINT = 'Close the active session or wait for lease expiration.';
  END IF;

  SELECT rsl.lease_expires_at
  INTO v_next_expiry
  FROM public.review_session_leases rsl
  WHERE rsl.user_id = v_user_id
    AND rsl.review_session_id = p_review_session_id
  LIMIT 1;

  RETURN QUERY SELECT v_next_expiry;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_review_session_lease_v1(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_review_session_lease_v1(uuid, integer) TO service_role;
