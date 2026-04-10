-- Track unique visitors for /app-v2/session and expose admin-only total.

CREATE TABLE IF NOT EXISTS public.app_v2_session_unique_visitors (
  visitor_id text PRIMARY KEY,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  first_seen_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  source_path text NOT NULL DEFAULT '/app-v2/session',
  CONSTRAINT app_v2_session_unique_visitors_source_path_check
    CHECK (source_path = '/app-v2/session')
);

ALTER TABLE public.app_v2_session_unique_visitors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_v2_session_unique_visitors FROM PUBLIC;
REVOKE ALL ON TABLE public.app_v2_session_unique_visitors FROM anon;
REVOKE ALL ON TABLE public.app_v2_session_unique_visitors FROM authenticated;
GRANT ALL ON TABLE public.app_v2_session_unique_visitors TO service_role;

CREATE OR REPLACE FUNCTION public.track_app_v2_session_unique_visitor(
  p_visitor_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_id text;
  v_actor_user_id uuid;
BEGIN
  v_visitor_id := lower(btrim(coalesce(p_visitor_id, '')));

  IF v_visitor_id = '' OR char_length(v_visitor_id) > 128 THEN
    RAISE EXCEPTION 'invalid visitor id';
  END IF;

  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    v_actor_user_id := p_user_id;
  END IF;

  INSERT INTO public.app_v2_session_unique_visitors (
    visitor_id,
    first_seen_user_id
  )
  VALUES (
    v_visitor_id,
    v_actor_user_id
  )
  ON CONFLICT (visitor_id) DO UPDATE
  SET first_seen_user_id = coalesce(
    public.app_v2_session_unique_visitors.first_seen_user_id,
    EXCLUDED.first_seen_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.track_app_v2_session_unique_visitor(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_app_v2_session_unique_visitor(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.track_app_v2_session_unique_visitor(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.track_app_v2_session_unique_visitor(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.track_app_v2_session_unique_visitor(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_app_v2_session_unique_visitor(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_app_v2_session_unique_visitors_total()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
  v_total bigint;
BEGIN
  v_actor_user_id := auth.uid();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_actor_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT count(*)
  INTO v_total
  FROM public.app_v2_session_unique_visitors;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.get_app_v2_session_unique_visitors_total() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_v2_session_unique_visitors_total() FROM anon;
REVOKE ALL ON FUNCTION public.get_app_v2_session_unique_visitors_total() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_v2_session_unique_visitors_total() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_v2_session_unique_visitors_total() TO service_role;
