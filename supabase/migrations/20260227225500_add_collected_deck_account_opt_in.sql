-- =====================================================
-- Persist collected deck assignment at account level
-- Date: 2026-02-27
-- Purpose:
--   1) Allow adding Deck Cartes collectees even when empty.
--   2) Persist this assignment across refresh/device changes.
--   3) Keep remove_deck_from_my_account_v1 in sync by clearing the flag.
-- =====================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS collected_deck_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.add_collected_deck_to_my_account_v1(
	p_source text DEFAULT 'dashboard_collected_step'
)
RETURNS TABLE(
	added_cards integer,
	existing_cards integer,
	total_cards integer
)
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_source_raw text := NULLIF(btrim(coalesce(p_source, 'dashboard_collected_step')), '');
	v_existing integer := 0;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	INSERT INTO public.profiles (user_id, collected_deck_enabled)
	VALUES (v_user_id, true)
	ON CONFLICT (user_id) DO UPDATE
	SET collected_deck_enabled = true;

	SELECT COUNT(*)::integer
	INTO v_existing
	FROM public.user_card_state ucs
	JOIN public.vocabulary_cards vc
		ON vc.id = ucs.vocabulary_card_id
	WHERE ucs.user_id = v_user_id
		AND coalesce(ucs.source_type::text, 'collected') = 'collected'
		AND coalesce(vc.category, '') <> 'alphabet_arabe';

	INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
	VALUES (
		v_user_id,
		'cards_added',
		jsonb_build_object(
			'source', coalesce(v_source_raw, 'dashboard_collected_step'),
			'source_type', 'collected',
			'deck', 'collected',
			'added_cards', 0,
			'existing_cards', v_existing,
			'total_cards', v_existing,
			'deck_enabled', true
		)
	);

	RETURN QUERY
	SELECT 0, v_existing, v_existing;
END;
$$;
CREATE OR REPLACE FUNCTION public.has_collected_deck_in_account_v1()
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_flag boolean := false;
	v_has_cards boolean := false;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	SELECT coalesce(p.collected_deck_enabled, false)
	INTO v_flag
	FROM public.profiles p
	WHERE p.user_id = v_user_id
	LIMIT 1;

	SELECT EXISTS (
		SELECT 1
		FROM public.user_card_state ucs
		JOIN public.vocabulary_cards vc
			ON vc.id = ucs.vocabulary_card_id
		WHERE ucs.user_id = v_user_id
			AND coalesce(ucs.source_type::text, 'collected') = 'collected'
			AND coalesce(vc.category, '') <> 'alphabet_arabe'
	)
	INTO v_has_cards;

	RETURN coalesce(v_flag, false) OR v_has_cards;
END;
$$;
CREATE OR REPLACE FUNCTION public.remove_deck_from_my_account_v1(
	p_deck_source_type text
)
RETURNS TABLE(
	removed_cards integer
)
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_target text := lower(btrim(coalesce(p_deck_source_type, '')));
	v_removed integer := 0;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required';
	END IF;

	IF v_target NOT IN ('foundation', 'collected', 'sent', 'alphabet') THEN
		RAISE EXCEPTION 'Invalid deck source type: %', p_deck_source_type;
	END IF;

	IF v_target = 'foundation' THEN
		WITH deleted AS (
			DELETE FROM public.user_card_state ucs
			WHERE ucs.user_id = v_user_id
				AND ucs.foundation_card_id IS NOT NULL
			RETURNING 1
		)
		SELECT COUNT(*)::integer INTO v_removed FROM deleted;

		UPDATE public.profiles p
		SET foundation_deck_enabled = false
		WHERE p.user_id = v_user_id;
	ELSIF v_target = 'sent' THEN
		WITH deleted AS (
			DELETE FROM public.user_card_state ucs
			USING public.vocabulary_cards vc
			WHERE ucs.user_id = v_user_id
				AND ucs.vocabulary_card_id = vc.id
				AND coalesce(ucs.source_type::text, 'collected') = 'sent'
			RETURNING 1
		)
		SELECT COUNT(*)::integer INTO v_removed FROM deleted;
	ELSIF v_target = 'collected' THEN
		WITH deleted AS (
			DELETE FROM public.user_card_state ucs
			USING public.vocabulary_cards vc
			WHERE ucs.user_id = v_user_id
				AND ucs.vocabulary_card_id = vc.id
				AND coalesce(ucs.source_type::text, 'collected') = 'collected'
				AND coalesce(vc.category, '') <> 'alphabet_arabe'
			RETURNING 1
		)
		SELECT COUNT(*)::integer INTO v_removed FROM deleted;

		UPDATE public.profiles p
		SET collected_deck_enabled = false
		WHERE p.user_id = v_user_id;
	ELSE
		WITH deleted AS (
			DELETE FROM public.user_card_state ucs
			USING public.vocabulary_cards vc
			WHERE ucs.user_id = v_user_id
				AND ucs.vocabulary_card_id = vc.id
				AND (
					coalesce(ucs.source_type::text, 'collected') = 'alphabet'
					OR vc.category = 'alphabet_arabe'
				)
			RETURNING 1
		)
		SELECT COUNT(*)::integer INTO v_removed FROM deleted;
	END IF;

	INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
	VALUES (
		v_user_id,
		'cards_removed',
		jsonb_build_object(
			'deck_source_type', v_target,
			'removed_cards', v_removed
		)
	);

	RETURN QUERY SELECT v_removed;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_collected_deck_to_my_account_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_collected_deck_in_account_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_deck_from_my_account_v1(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
