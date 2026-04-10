ALTER TABLE public.user_daily_activity
ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.user_learning_path_progress (
	user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	first_visited_at TIMESTAMPTZ,
	step_one_choice TEXT CHECK (
		step_one_choice IS NULL
		OR step_one_choice IN (
			'can-read',
			'needs-alphabet',
			'quiz-can-read',
			'quiz-needs-alphabet'
		)
	),
	step_one_completed_at TIMESTAMPTZ,
	foundation_deck_started_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_learning_path_progress ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_learning_path_progress'
			AND policyname = 'Users can view own learning path progress'
	) THEN
		CREATE POLICY "Users can view own learning path progress"
		ON public.user_learning_path_progress
		FOR SELECT
		USING (auth.uid() = user_id);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_learning_path_progress'
			AND policyname = 'Users can insert own learning path progress'
	) THEN
		CREATE POLICY "Users can insert own learning path progress"
		ON public.user_learning_path_progress
		FOR INSERT
		WITH CHECK (auth.uid() = user_id);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_learning_path_progress'
			AND policyname = 'Users can update own learning path progress'
	) THEN
		CREATE POLICY "Users can update own learning path progress"
		ON public.user_learning_path_progress
		FOR UPDATE
		USING (auth.uid() = user_id)
		WITH CHECK (auth.uid() = user_id);
	END IF;
END
$$;
DROP TRIGGER IF EXISTS update_user_learning_path_progress_updated_at
	ON public.user_learning_path_progress;
CREATE TRIGGER update_user_learning_path_progress_updated_at
	BEFORE UPDATE ON public.user_learning_path_progress
	FOR EACH ROW
	EXECUTE FUNCTION public.update_learning_progress_updated_at();
COMMENT ON TABLE public.user_learning_path_progress IS 'Canonical persisted learning-path milestones used by profile and distinctions.';
WITH ranked AS (
	SELECT
		ctid,
		ROW_NUMBER() OVER (
			PARTITION BY user_id, accomplishment_type
			ORDER BY earned_at ASC, id ASC
		) AS rn
	FROM public.user_accomplishments
)
DELETE FROM public.user_accomplishments ua
USING ranked
WHERE ua.ctid = ranked.ctid
	AND ranked.rn > 1;
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'user_accomplishments_user_type_unique'
			AND connamespace = 'public'::regnamespace
	) THEN
		ALTER TABLE public.user_accomplishments
		ADD CONSTRAINT user_accomplishments_user_type_unique
		UNIQUE (user_id, accomplishment_type);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_accomplishments'
			AND policyname = 'Users can view own accomplishments'
	) THEN
		CREATE POLICY "Users can view own accomplishments"
		ON public.user_accomplishments
		FOR SELECT
		USING (auth.uid() = user_id);
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_accomplishments'
			AND policyname = 'Accomplishments public read'
	) THEN
		DROP POLICY "Accomplishments public read" ON public.user_accomplishments;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_accomplishments'
			AND policyname = 'Users can update own accomplishments'
	) THEN
		CREATE POLICY "Users can update own accomplishments"
		ON public.user_accomplishments
		FOR UPDATE
		USING (auth.uid() = user_id)
		WITH CHECK (auth.uid() = user_id);
	END IF;
END
$$;
CREATE TABLE IF NOT EXISTS public.user_accomplishment_states (
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	accomplishment_type TEXT NOT NULL,
	notified_at TIMESTAMPTZ,
	overlay_version INTEGER NOT NULL DEFAULT 1,
	source_event_ref TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, accomplishment_type)
);
ALTER TABLE public.user_accomplishment_states ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_accomplishment_states'
			AND policyname = 'Users can view own accomplishment states'
	) THEN
		CREATE POLICY "Users can view own accomplishment states"
		ON public.user_accomplishment_states
		FOR SELECT
		USING (auth.uid() = user_id);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_accomplishment_states'
			AND policyname = 'Users can insert own accomplishment states'
	) THEN
		CREATE POLICY "Users can insert own accomplishment states"
		ON public.user_accomplishment_states
		FOR INSERT
		WITH CHECK (auth.uid() = user_id);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'user_accomplishment_states'
			AND policyname = 'Users can update own accomplishment states'
	) THEN
		CREATE POLICY "Users can update own accomplishment states"
		ON public.user_accomplishment_states
		FOR UPDATE
		USING (auth.uid() = user_id)
		WITH CHECK (auth.uid() = user_id);
	END IF;
END
$$;
DROP TRIGGER IF EXISTS update_user_accomplishment_states_updated_at
	ON public.user_accomplishment_states;
CREATE TRIGGER update_user_accomplishment_states_updated_at
	BEFORE UPDATE ON public.user_accomplishment_states
	FOR EACH ROW
	EXECUTE FUNCTION public.update_learning_progress_updated_at();
CREATE TABLE IF NOT EXISTS public.ramadan_periods (
	ramadan_year INTEGER PRIMARY KEY,
	starts_on DATE NOT NULL,
	ends_on DATE NOT NULL,
	CHECK (ends_on >= starts_on)
);
INSERT INTO public.ramadan_periods (ramadan_year, starts_on, ends_on)
VALUES
	(2025, DATE '2025-02-28', DATE '2025-03-29'),
	(2026, DATE '2026-02-18', DATE '2026-03-19'),
	(2027, DATE '2027-02-08', DATE '2027-03-09'),
	(2028, DATE '2028-01-28', DATE '2028-02-26'),
	(2029, DATE '2029-01-16', DATE '2029-02-14'),
	(2030, DATE '2030-01-06', DATE '2030-02-04'),
	(2031, DATE '2030-12-27', DATE '2031-01-25'),
	(2032, DATE '2031-12-15', DATE '2032-01-13')
ON CONFLICT (ramadan_year) DO UPDATE
SET starts_on = EXCLUDED.starts_on,
	ends_on = EXCLUDED.ends_on;
ALTER TABLE public.user_activity_log
DROP CONSTRAINT IF EXISTS user_activity_log_activity_type_check;
ALTER TABLE public.user_activity_log
ADD CONSTRAINT user_activity_log_activity_type_check
CHECK (
	activity_type = ANY (
		ARRAY[
			'video_watched'::text,
			'card_reviewed'::text,
			'login'::text,
			'deck_completed'::text,
			'streak_milestone'::text,
			'grade_unlocked'::text,
			'cards_added'::text,
			'admin_seed_deck_perso_v2'::text,
			'cards_removed'::text,
			'progress_path_step_one_completed'::text,
			'foundation_deck_started'::text
		]
	)
);
CREATE OR REPLACE FUNCTION public.get_review_streak_days_v1(
	p_user_id UUID,
	p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
	WITH review_days AS (
		SELECT DISTINCT (ucr.reviewed_at AT TIME ZONE 'UTC')::date AS review_date
		FROM public.user_card_reviews ucr
		WHERE ucr.user_id = p_user_id
			AND (ucr.reviewed_at AT TIME ZONE 'UTC')::date <= p_reference_date
	),
	anchor AS (
		SELECT CASE
			WHEN EXISTS (
				SELECT 1 FROM review_days WHERE review_date = p_reference_date
			) THEN p_reference_date
			WHEN EXISTS (
				SELECT 1 FROM review_days WHERE review_date = (p_reference_date - 1)
			) THEN (p_reference_date - 1)
			ELSE NULL::date
		END AS anchor_date
	),
	ordered AS (
		SELECT
			rd.review_date,
			ROW_NUMBER() OVER (ORDER BY rd.review_date DESC) AS rn,
			a.anchor_date
		FROM review_days rd
		CROSS JOIN anchor a
		WHERE a.anchor_date IS NOT NULL
			AND rd.review_date <= a.anchor_date
	)
	SELECT COALESCE(COUNT(*), 0)::integer
	FROM ordered
	WHERE review_date = (anchor_date - ((rn - 1)::integer));
$$;
CREATE OR REPLACE FUNCTION public.upsert_my_daily_activity_v1(
	p_activity_date DATE DEFAULT CURRENT_DATE,
	p_reviews_count INTEGER DEFAULT 0,
	p_new_words INTEGER DEFAULT 0,
	p_time_spent_minutes INTEGER DEFAULT 0,
	p_time_spent_seconds INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id UUID := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	INSERT INTO public.user_daily_activity (
		user_id,
		activity_date,
		reviews_count,
		new_words,
		time_spent_minutes,
		time_spent_seconds
	)
	VALUES (
		v_user_id,
		COALESCE(p_activity_date, CURRENT_DATE),
		GREATEST(COALESCE(p_reviews_count, 0), 0),
		GREATEST(COALESCE(p_new_words, 0), 0),
		GREATEST(COALESCE(p_time_spent_minutes, 0), 0),
		GREATEST(COALESCE(p_time_spent_seconds, 0), 0)
	)
	ON CONFLICT (user_id, activity_date) DO UPDATE SET
		reviews_count = public.user_daily_activity.reviews_count + EXCLUDED.reviews_count,
		new_words = public.user_daily_activity.new_words + EXCLUDED.new_words,
		time_spent_minutes = GREATEST(public.user_daily_activity.time_spent_minutes, EXCLUDED.time_spent_minutes),
		time_spent_seconds = GREATEST(public.user_daily_activity.time_spent_seconds, EXCLUDED.time_spent_seconds),
		updated_at = now();
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_user_accomplishments_internal_v1(
	p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_target_user_id UUID := p_user_id;
	v_step_one_completed_at TIMESTAMPTZ;
	v_review_streak INTEGER := 0;
	v_collecteur_cards INTEGER := 0;
	v_has_ramadan_review BOOLEAN := FALSE;
BEGIN
	IF v_target_user_id IS NULL THEN
		RAISE EXCEPTION 'sync_user_accomplishments_internal_v1 requires p_user_id';
	END IF;

	SELECT ulpp.step_one_completed_at
	INTO v_step_one_completed_at
	FROM public.user_learning_path_progress ulpp
	WHERE ulpp.user_id = v_target_user_id;

	v_review_streak := public.get_review_streak_days_v1(v_target_user_id);

	SELECT COUNT(DISTINCT ucr.vocabulary_card_id)::integer
	INTO v_collecteur_cards
	FROM public.user_card_reviews ucr
	JOIN public.user_card_state ucs
		ON ucs.user_id = ucr.user_id
		AND ucs.vocabulary_card_id = ucr.vocabulary_card_id
	WHERE ucr.user_id = v_target_user_id
		AND ucr.vocabulary_card_id IS NOT NULL
		AND ucs.source_type = 'collected'::public.deck_source_type;

	SELECT EXISTS (
		SELECT 1
		FROM public.user_card_reviews ucr
		JOIN public.ramadan_periods rp
			ON (ucr.reviewed_at AT TIME ZONE 'UTC')::date BETWEEN rp.starts_on AND rp.ends_on
		WHERE ucr.user_id = v_target_user_id
	)
	INTO v_has_ramadan_review;

	IF v_step_one_completed_at IS NOT NULL THEN
		INSERT INTO public.user_accomplishments (
			user_id,
			accomplishment_type,
			metadata,
			earned_at
		)
		VALUES (
			v_target_user_id,
			'coup-denvoi',
			jsonb_build_object('source', 'learning_path_step_one'),
			v_step_one_completed_at
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;

		INSERT INTO public.user_accomplishment_states (
			user_id,
			accomplishment_type,
			source_event_ref
		)
		VALUES (
			v_target_user_id,
			'coup-denvoi',
			'learning_path_step_one'
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;
	END IF;

	IF v_review_streak >= 10 THEN
		INSERT INTO public.user_accomplishments (
			user_id,
			accomplishment_type,
			metadata
		)
		VALUES (
			v_target_user_id,
			'chaud-chipotle',
			jsonb_build_object('review_streak_days', v_review_streak)
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;

		INSERT INTO public.user_accomplishment_states (
			user_id,
			accomplishment_type,
			source_event_ref
		)
		VALUES (
			v_target_user_id,
			'chaud-chipotle',
			'review_streak'
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;
	END IF;

	IF v_collecteur_cards >= 10 THEN
		INSERT INTO public.user_accomplishments (
			user_id,
			accomplishment_type,
			metadata
		)
		VALUES (
			v_target_user_id,
			'collecteur',
			jsonb_build_object('reviewed_collected_cards', v_collecteur_cards)
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;

		INSERT INTO public.user_accomplishment_states (
			user_id,
			accomplishment_type,
			source_event_ref
		)
		VALUES (
			v_target_user_id,
			'collecteur',
			'collected_reviews'
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;
	END IF;

	IF v_has_ramadan_review THEN
		INSERT INTO public.user_accomplishments (
			user_id,
			accomplishment_type,
			metadata
		)
		VALUES (
			v_target_user_id,
			'ramadan-player',
			jsonb_build_object('source', 'ramadan_review')
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;

		INSERT INTO public.user_accomplishment_states (
			user_id,
			accomplishment_type,
			source_event_ref
		)
		VALUES (
			v_target_user_id,
			'ramadan-player',
			'ramadan_review'
		)
		ON CONFLICT (user_id, accomplishment_type) DO NOTHING;
	END IF;
	RETURN;
	END;
	$$;
CREATE OR REPLACE FUNCTION public.sync_user_accomplishments_v1()
RETURNS TABLE (
	accomplishment_type TEXT,
	earned_at TIMESTAMPTZ,
	notified_at TIMESTAMPTZ,
	overlay_version INTEGER,
	metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id UUID := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	PERFORM public.sync_user_accomplishments_internal_v1(v_user_id);

	RETURN QUERY
	SELECT
		ua.accomplishment_type,
		ua.earned_at,
		uas.notified_at,
		COALESCE(uas.overlay_version, 1) AS overlay_version,
		ua.metadata
	FROM public.user_accomplishments ua
	LEFT JOIN public.user_accomplishment_states uas
		ON uas.user_id = ua.user_id
		AND uas.accomplishment_type = ua.accomplishment_type
	WHERE ua.user_id = v_user_id
	ORDER BY ua.earned_at ASC, ua.accomplishment_type ASC;
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_progress_path_step_one_completed_v1(
	p_choice TEXT DEFAULT NULL
)
RETURNS TABLE (
	step_one_choice TEXT,
	step_one_completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id UUID := auth.uid();
	v_existing_completed_at TIMESTAMPTZ;
	v_now TIMESTAMPTZ := now();
	v_choice TEXT := NULLIF(BTRIM(COALESCE(p_choice, '')), '');
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	IF v_choice IS NOT NULL AND v_choice NOT IN (
		'can-read',
		'needs-alphabet',
		'quiz-can-read',
		'quiz-needs-alphabet'
	) THEN
		RAISE EXCEPTION 'Unsupported step one choice: %', v_choice;
	END IF;

	SELECT ulpp.step_one_completed_at
	INTO v_existing_completed_at
	FROM public.user_learning_path_progress ulpp
	WHERE ulpp.user_id = v_user_id
	FOR UPDATE;

	INSERT INTO public.user_learning_path_progress (
		user_id,
		first_visited_at,
		step_one_choice,
		step_one_completed_at
	)
	VALUES (
		v_user_id,
		v_now,
		v_choice,
		v_now
	)
	ON CONFLICT (user_id) DO UPDATE SET
		first_visited_at = COALESCE(public.user_learning_path_progress.first_visited_at, EXCLUDED.first_visited_at),
		step_one_choice = COALESCE(EXCLUDED.step_one_choice, public.user_learning_path_progress.step_one_choice),
		step_one_completed_at = COALESCE(public.user_learning_path_progress.step_one_completed_at, EXCLUDED.step_one_completed_at),
		updated_at = now();

	IF v_existing_completed_at IS NULL THEN
		INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
		VALUES (
			v_user_id,
			'progress_path_step_one_completed',
			jsonb_build_object('choice', v_choice)
		);
	END IF;

	PERFORM public.sync_user_accomplishments_internal_v1(v_user_id);

	RETURN QUERY
	SELECT ulpp.step_one_choice, ulpp.step_one_completed_at
	FROM public.user_learning_path_progress ulpp
	WHERE ulpp.user_id = v_user_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_foundation_deck_started_v1()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id UUID := auth.uid();
	v_existing_started_at TIMESTAMPTZ;
	v_now TIMESTAMPTZ := now();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	SELECT ulpp.foundation_deck_started_at
	INTO v_existing_started_at
	FROM public.user_learning_path_progress ulpp
	WHERE ulpp.user_id = v_user_id
	FOR UPDATE;

	INSERT INTO public.user_learning_path_progress (
		user_id,
		first_visited_at,
		foundation_deck_started_at
	)
	VALUES (
		v_user_id,
		v_now,
		v_now
	)
	ON CONFLICT (user_id) DO UPDATE SET
		first_visited_at = COALESCE(public.user_learning_path_progress.first_visited_at, EXCLUDED.first_visited_at),
		foundation_deck_started_at = COALESCE(public.user_learning_path_progress.foundation_deck_started_at, EXCLUDED.foundation_deck_started_at),
		updated_at = now();

	IF v_existing_started_at IS NULL THEN
		INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
		VALUES (
			v_user_id,
			'foundation_deck_started',
			'{}'::jsonb
		);
	END IF;

	RETURN (
		SELECT ulpp.foundation_deck_started_at
		FROM public.user_learning_path_progress ulpp
		WHERE ulpp.user_id = v_user_id
	);
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_user_accomplishment_notified_v1(
	p_accomplishment_type TEXT,
	p_overlay_version INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id UUID := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	INSERT INTO public.user_accomplishment_states (
		user_id,
		accomplishment_type,
		notified_at,
		overlay_version
	)
	VALUES (
		v_user_id,
		p_accomplishment_type,
		now(),
		GREATEST(1, COALESCE(p_overlay_version, 1))
	)
	ON CONFLICT (user_id, accomplishment_type) DO UPDATE SET
		notified_at = EXCLUDED.notified_at,
		overlay_version = EXCLUDED.overlay_version,
		updated_at = now();

	RETURN TRUE;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_user_review_projections_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_review_date DATE := (COALESCE(NEW.reviewed_at, now()) AT TIME ZONE 'UTC')::date;
	v_last_review_date DATE;
	v_total_reviews INTEGER := 0;
	v_current_streak INTEGER := 0;
	v_longest_streak INTEGER := 0;
BEGIN
	PERFORM public.upsert_daily_activity(NEW.user_id, v_review_date, 1, 0, 0);

	SELECT ulp.last_review_date, COALESCE(ulp.longest_streak, 0)
	INTO v_last_review_date, v_longest_streak
	FROM public.user_learning_progress ulp
	WHERE ulp.user_id = NEW.user_id
	FOR UPDATE;

	SELECT COUNT(*)::integer
	INTO v_total_reviews
	FROM public.user_card_reviews ucr
	WHERE ucr.user_id = NEW.user_id;

	v_current_streak := public.get_review_streak_days_v1(NEW.user_id, v_review_date);

	INSERT INTO public.user_learning_progress (
		user_id,
		total_words_learned,
		current_streak,
		longest_streak,
		total_reviews,
		last_review_date
	)
	VALUES (
		NEW.user_id,
		0,
		GREATEST(v_current_streak, 0),
		GREATEST(v_current_streak, 0),
		v_total_reviews,
		v_review_date
	)
	ON CONFLICT (user_id) DO UPDATE SET
		total_words_learned = public.user_learning_progress.total_words_learned,
		current_streak = EXCLUDED.current_streak,
		longest_streak = GREATEST(public.user_learning_progress.longest_streak, EXCLUDED.current_streak),
		total_reviews = EXCLUDED.total_reviews,
		last_review_date = GREATEST(COALESCE(public.user_learning_progress.last_review_date, EXCLUDED.last_review_date), EXCLUDED.last_review_date),
		updated_at = now();

	PERFORM public.sync_user_accomplishments_internal_v1(NEW.user_id);
	RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_user_review_projections_v1
	ON public.user_card_reviews;
CREATE TRIGGER trg_sync_user_review_projections_v1
	AFTER INSERT ON public.user_card_reviews
	FOR EACH ROW
	EXECUTE FUNCTION public.sync_user_review_projections_v1();
GRANT EXECUTE ON FUNCTION public.get_review_streak_days_v1(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_daily_activity_v1(DATE, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_accomplishments_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_progress_path_step_one_completed_v1(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_foundation_deck_started_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_user_accomplishment_notified_v1(TEXT, INTEGER) TO authenticated;
NOTIFY pgrst, 'reload schema';
