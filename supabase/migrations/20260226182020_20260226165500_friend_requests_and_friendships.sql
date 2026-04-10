CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT friend_requests_not_self CHECK (requester_user_id <> recipient_user_id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_not_self CHECK (user_a_id <> user_b_id),
  CONSTRAINT friendships_canonical_order CHECK (user_a_id < user_b_id),
  CONSTRAINT friendships_unique_pair UNIQUE (user_a_id, user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_unique_direction
  ON public.friend_requests (requester_user_id, recipient_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient_pending
  ON public.friend_requests (recipient_user_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friend_requests_requester_pending
  ON public.friend_requests (requester_user_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friendships_user_a
  ON public.friendships (user_a_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_friendships_user_b
  ON public.friendships (user_b_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'friend_requests'
      AND policyname = 'Participants can read friend requests'
  ) THEN
    CREATE POLICY "Participants can read friend requests"
      ON public.friend_requests
      FOR SELECT
      USING ((SELECT auth.uid()) IN (requester_user_id, recipient_user_id));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'friendships'
      AND policyname = 'Participants can read friendships'
  ) THEN
    CREATE POLICY "Participants can read friendships"
      ON public.friendships
      FOR SELECT
      USING ((SELECT auth.uid()) IN (user_a_id, user_b_id));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request_by_username(
  p_recipient_username TEXT
)
RETURNS TABLE (
  status TEXT,
  friend_request_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id UUID;
  v_recipient_user_id UUID;
  v_normalized_username TEXT;
  v_friend_request_id UUID;
  v_user_a UUID;
  v_user_b UUID;
BEGIN
  v_actor_user_id := auth.uid();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  v_normalized_username := lower(trim(both from replace(coalesce(p_recipient_username, ''), '@', '')));

  IF v_normalized_username = '' THEN
    RAISE EXCEPTION 'USERNAME_REQUIRED';
  END IF;

  SELECT p.user_id
  INTO v_recipient_user_id
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND lower(p.username) = v_normalized_username
  LIMIT 1;

  IF v_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF v_recipient_user_id = v_actor_user_id THEN
    RAISE EXCEPTION 'CANNOT_ADD_SELF';
  END IF;

  v_user_a := LEAST(v_actor_user_id, v_recipient_user_id);
  v_user_b := GREATEST(v_actor_user_id, v_recipient_user_id);

  IF EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.user_a_id = v_user_a
      AND f.user_b_id = v_user_b
  ) THEN
    RETURN QUERY SELECT 'already_friends'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT fr.id
  INTO v_friend_request_id
  FROM public.friend_requests fr
  WHERE fr.requester_user_id = v_recipient_user_id
    AND fr.recipient_user_id = v_actor_user_id
    AND fr.status = 'pending'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.friend_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = v_friend_request_id;

    INSERT INTO public.friendships (user_a_id, user_b_id)
    VALUES (v_user_a, v_user_b)
    ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

    RETURN QUERY SELECT 'accepted_reverse_request'::TEXT, v_friend_request_id;
    RETURN;
  END IF;

  SELECT fr.id
  INTO v_friend_request_id
  FROM public.friend_requests fr
  WHERE fr.requester_user_id = v_actor_user_id
    AND fr.recipient_user_id = v_recipient_user_id
    AND fr.status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 'already_pending'::TEXT, v_friend_request_id;
    RETURN;
  END IF;

  INSERT INTO public.friend_requests (
    requester_user_id,
    recipient_user_id,
    status
  )
  VALUES (
    v_actor_user_id,
    v_recipient_user_id,
    'pending'
  )
  RETURNING id INTO v_friend_request_id;

  RETURN QUERY SELECT 'sent'::TEXT, v_friend_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(
  p_request_id UUID,
  p_action TEXT
)
RETURNS TABLE (
  status TEXT,
  friendship_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id UUID;
  v_action TEXT;
  v_request RECORD;
  v_user_a UUID;
  v_user_b UUID;
  v_inserted_count INTEGER;
BEGIN
  v_actor_user_id := auth.uid();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;

  v_action := lower(trim(coalesce(p_action, '')));

  IF v_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;

  SELECT
    fr.id,
    fr.requester_user_id,
    fr.recipient_user_id
  INTO v_request
  FROM public.friend_requests fr
  WHERE fr.id = p_request_id
    AND fr.recipient_user_id = v_actor_user_id
    AND fr.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  IF v_action = 'decline' THEN
    UPDATE public.friend_requests
    SET status = 'declined', responded_at = now()
    WHERE id = v_request.id;

    RETURN QUERY SELECT 'declined'::TEXT, FALSE;
    RETURN;
  END IF;

  UPDATE public.friend_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = v_request.id;

  v_user_a := LEAST(v_request.requester_user_id, v_request.recipient_user_id);
  v_user_b := GREATEST(v_request.requester_user_id, v_request.recipient_user_id);

  INSERT INTO public.friendships (user_a_id, user_b_id)
  VALUES (v_user_a, v_user_b)
  ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN QUERY SELECT 'accepted'::TEXT, (v_inserted_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_friends()
RETURNS TABLE (
  friend_user_id UUID,
  username TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  connected_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN f.user_a_id = auth.uid() THEN f.user_b_id
      ELSE f.user_a_id
    END AS friend_user_id,
    p.username,
    p.email,
    p.first_name,
    p.last_name,
    p.avatar_url,
    f.created_at AS connected_at
  FROM public.friendships f
  JOIN public.profiles p
    ON p.user_id = CASE
      WHEN f.user_a_id = auth.uid() THEN f.user_b_id
      ELSE f.user_a_id
    END
  WHERE auth.uid() IS NOT NULL
    AND (f.user_a_id = auth.uid() OR f.user_b_id = auth.uid())
  ORDER BY f.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_incoming_friend_requests()
RETURNS TABLE (
  request_id UUID,
  requester_user_id UUID,
  requester_username TEXT,
  requester_email TEXT,
  requester_first_name TEXT,
  requester_last_name TEXT,
  requester_avatar_url TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fr.id AS request_id,
    fr.requester_user_id,
    p.username AS requester_username,
    p.email AS requester_email,
    p.first_name AS requester_first_name,
    p.last_name AS requester_last_name,
    p.avatar_url AS requester_avatar_url,
    fr.created_at AS requested_at
  FROM public.friend_requests fr
  JOIN public.profiles p
    ON p.user_id = fr.requester_user_id
  WHERE auth.uid() IS NOT NULL
    AND fr.recipient_user_id = auth.uid()
    AND fr.status = 'pending'
  ORDER BY fr.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.send_friend_request_by_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_friend_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_friends() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_incoming_friend_requests() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_friend_request_by_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_incoming_friend_requests() TO authenticated;;
