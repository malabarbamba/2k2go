CREATE OR REPLACE FUNCTION public.mark_progress_path_visited_v1(
	p_first_visited_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id UUID := auth.uid();
	v_now TIMESTAMPTZ := now();
	v_candidate_first_visited_at TIMESTAMPTZ := COALESCE(p_first_visited_at, v_now);
	v_first_visited_at TIMESTAMPTZ;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	PERFORM 1
	FROM public.user_learning_path_progress
	WHERE user_id = v_user_id
	FOR UPDATE;

	INSERT INTO public.user_learning_path_progress (
		user_id,
		first_visited_at,
		updated_at
	) VALUES (
		v_user_id,
		v_candidate_first_visited_at,
		v_now
	)
	ON CONFLICT (user_id) DO UPDATE
	SET
		first_visited_at = COALESCE(
			LEAST(
				public.user_learning_path_progress.first_visited_at,
				EXCLUDED.first_visited_at
			),
			public.user_learning_path_progress.first_visited_at,
			EXCLUDED.first_visited_at
		),
		updated_at = now()
	RETURNING public.user_learning_path_progress.first_visited_at
	INTO v_first_visited_at;

	RETURN v_first_visited_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_progress_path_visited_v1(TIMESTAMPTZ) TO authenticated;;
