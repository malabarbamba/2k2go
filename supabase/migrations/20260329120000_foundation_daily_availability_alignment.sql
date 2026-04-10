-- =====================================================
-- Canonical foundation daily availability alignment
-- Date: 2026-03-29
-- Purpose:
--   1) Centralize collection-day-aware Foundation daily seeding/top-up
--   2) Align due payload, badge counts, reminder counts, and explicit opt-in
--   3) Reuse user_foundation_daily_seed for idempotent, concurrent calls
-- =====================================================

ALTER TABLE public.user_foundation_daily_seed
DROP CONSTRAINT IF EXISTS user_foundation_daily_seed_seeded_count_check;
ALTER TABLE public.user_foundation_daily_seed
ADD CONSTRAINT user_foundation_daily_seed_seeded_count_check
CHECK (seeded_count >= 0 AND seeded_count <= 200);
CREATE OR REPLACE FUNCTION public.ensure_foundation_daily_availability_v1(
  p_user_id uuid,
  p_now_utc timestamp with time zone DEFAULT timezone('utc', now())
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_utc timestamp with time zone := COALESCE(p_now_utc, timezone('utc', now()));
  v_foundation_enabled boolean := false;
  v_daily_new_cap integer := 20;
  v_scheduler_timezone text := 'UTC';
  v_scheduler_day_cutoff_hour integer := 4;
  v_collection_day_id date := NULL;
  v_collection_day_start_utc timestamp with time zone := NULL;
  v_collection_day_end_utc timestamp with time zone := NULL;
  v_assigned_today integer := 0;
  v_remaining_new integer := 0;
  v_inserted integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF auth.role() <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    COALESCE(p.foundation_deck_enabled, false),
    LEAST(20, GREATEST(0, COALESCE(p.new_cards_per_day, 20))),
    COALESCE(NULLIF(btrim(p.scheduler_timezone), ''), 'UTC'),
    LEAST(23, GREATEST(0, COALESCE(p.scheduler_day_cutoff_hour, 4)))
  INTO
    v_foundation_enabled,
    v_daily_new_cap,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  FROM public.profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;

  v_foundation_enabled := COALESCE(v_foundation_enabled, false);
  v_daily_new_cap := LEAST(20, GREATEST(0, COALESCE(v_daily_new_cap, 20)));
  v_scheduler_timezone := COALESCE(NULLIF(btrim(v_scheduler_timezone), ''), 'UTC');
  v_scheduler_day_cutoff_hour := LEAST(
    23,
    GREATEST(0, COALESCE(v_scheduler_day_cutoff_hour, 4))
  );

  IF NOT v_foundation_enabled OR v_daily_new_cap = 0 THEN
    RETURN 0;
  END IF;

  v_collection_day_id := public.collection_day_id(
    v_now_utc,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  );

  SELECT
    bounds.day_start_utc,
    bounds.day_end_utc
  INTO
    v_collection_day_start_utc,
    v_collection_day_end_utc
  FROM public.collection_day_bounds(
    v_now_utc,
    v_scheduler_timezone,
    v_scheduler_day_cutoff_hour
  ) bounds;

  INSERT INTO public.user_foundation_daily_seed (user_id, seed_date, seeded_count)
  VALUES (p_user_id, v_collection_day_id, 0)
  ON CONFLICT (user_id, seed_date) DO NOTHING;

  PERFORM 1
  FROM public.user_foundation_daily_seed seed
  WHERE seed.user_id = p_user_id
    AND seed.seed_date = v_collection_day_id
  FOR UPDATE;

  SELECT COUNT(*)
  INTO v_assigned_today
  FROM public.user_card_state ucs
  WHERE ucs.user_id = p_user_id
    AND ucs.foundation_card_id IS NOT NULL
    AND COALESCE(ucs.added_to_deck_at, ucs.created_at) >= v_collection_day_start_utc
    AND COALESCE(ucs.added_to_deck_at, ucs.created_at) < v_collection_day_end_utc;

  v_remaining_new := GREATEST(0, v_daily_new_cap - v_assigned_today);

  IF v_remaining_new > 0 THEN
    WITH candidates AS (
      SELECT fd.id
      FROM public.foundation_deck fd
      LEFT JOIN public.user_card_state existing
        ON existing.user_id = p_user_id
       AND existing.foundation_card_id = fd.id
      WHERE existing.id IS NULL
      ORDER BY fd.frequency_rank ASC, fd.id ASC
      LIMIT v_remaining_new
    ),
    inserted AS (
      INSERT INTO public.user_card_state (
        user_id,
        foundation_card_id,
        status,
        next_review_at,
        added_to_deck_at,
        source_type
      )
      SELECT
        p_user_id,
        candidate.id,
        'new',
        v_now_utc,
        v_now_utc,
        'foundation'::public.deck_source_type
      FROM candidates candidate
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT COUNT(*)
    INTO v_inserted
    FROM inserted;

    v_assigned_today := v_assigned_today + v_inserted;
  END IF;

  UPDATE public.user_foundation_daily_seed seed
  SET seeded_count = v_assigned_today,
      updated_at = timezone('utc', now())
  WHERE seed.user_id = p_user_id
    AND seed.seed_date = v_collection_day_id
    AND seed.seeded_count IS DISTINCT FROM v_assigned_today;

  RETURN v_assigned_today;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_payload_v3(
  p_due_limit integer DEFAULT 200,
  p_candidate_new_limit integer DEFAULT 200
)
RETURNS TABLE(
  schema_version integer,
  scheduler_timezone text,
  scheduler_day_cutoff_hour integer,
  fsrs_target_retention numeric,
  active_weights_version integer,
  due_items jsonb,
  candidate_new_items jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now_utc timestamp with time zone := now();
  v_due_limit integer := LEAST(500, GREATEST(1, COALESCE(p_due_limit, 200)));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  schema_version := 3;

  SELECT
    COALESCE(NULLIF(btrim(p.scheduler_timezone), ''), 'UTC'),
    LEAST(23, GREATEST(0, COALESCE(p.scheduler_day_cutoff_hour, 4))),
    LEAST(0.97, GREATEST(0.70, COALESCE(p.fsrs_target_retention, 0.90)))
  INTO
    scheduler_timezone,
    scheduler_day_cutoff_hour,
    fsrs_target_retention
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  scheduler_timezone := COALESCE(NULLIF(btrim(scheduler_timezone), ''), 'UTC');
  scheduler_day_cutoff_hour := LEAST(
    23,
    GREATEST(0, COALESCE(scheduler_day_cutoff_hour, 4))
  );
  fsrs_target_retention := LEAST(
    0.97,
    GREATEST(0.70, COALESCE(fsrs_target_retention, 0.90))
  );

  PERFORM public.ensure_foundation_daily_availability_v1(v_user_id, v_now_utc);

  SELECT active.active_weights_version
  INTO active_weights_version
  FROM public.user_fsrs_active_weights active
  WHERE active.user_id = v_user_id
  LIMIT 1;

  active_weights_version := COALESCE(active_weights_version, 1);

  WITH due_rows AS (
    SELECT
      ucs.id AS user_card_state_id,
      'foundation'::text AS source,
      ucs.vocabulary_card_id,
      ucs.foundation_card_id,
      fd.word_ar,
      fd.word_fr,
      fd.transliteration,
      fd.example_sentence_ar,
      fd.example_sentence_fr,
      NULL::text AS audio_url,
      fd.category,
      ucs.status,
      ucs.next_review_at,
      ucs.added_to_deck_at,
      ucs.first_seen_at,
      ucs.source_type::text AS source_type,
      ucs.scheduling_algorithm,
      ucs.interval_days,
      ucs.repetitions,
      ucs.lapses,
      ucs.last_reviewed_at,
      COALESCE(ucs.fsrs_state, 0) AS fsrs_state,
      COALESCE(
        ucs.fsrs_stability,
        (public.fsrs_default_weights_v1())[1]
      ) AS fsrs_stability,
      COALESCE(ucs.fsrs_difficulty, 5) AS fsrs_difficulty,
      COALESCE(ucs.fsrs_elapsed_days, 0) AS fsrs_elapsed_days,
      COALESCE(ucs.fsrs_scheduled_days, COALESCE(ucs.interval_days, 0)) AS fsrs_scheduled_days,
      COALESCE(ucs.fsrs_due_at, ucs.next_review_at) AS fsrs_due_at,
      ucs.fsrs_last_reviewed_at,
      COALESCE(ucs.fsrs_last_reviewed_at, ucs.last_reviewed_at) AS expected_last_reviewed_at
    FROM public.user_card_state ucs
    JOIN public.foundation_deck fd
      ON fd.id = ucs.foundation_card_id
    WHERE ucs.user_id = v_user_id
      AND ucs.foundation_card_id IS NOT NULL
      AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= v_now_utc)
    ORDER BY
      CASE
        WHEN ucs.status = 'new' THEN 0
        ELSE 1
      END ASC,
      ucs.next_review_at ASC NULLS FIRST,
      COALESCE(ucs.source_type::text, '') ASC,
      ucs.status ASC,
      ucs.foundation_card_id ASC,
      ucs.vocabulary_card_id ASC NULLS LAST,
      ucs.id ASC
    LIMIT v_due_limit
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'source', due.source,
          'vocabulary_card_id', due.vocabulary_card_id,
          'foundation_card_id', due.foundation_card_id,
          'word_ar', due.word_ar,
          'word_fr', due.word_fr,
          'transliteration', due.transliteration,
          'example_sentence_ar', due.example_sentence_ar,
          'example_sentence_fr', due.example_sentence_fr,
          'audio_url', due.audio_url,
          'category', due.category,
          'status', due.status,
          'next_review_at', due.next_review_at,
          'added_to_deck_at', due.added_to_deck_at,
          'first_seen_at', due.first_seen_at,
          'source_type', due.source_type,
          'scheduling_algorithm', due.scheduling_algorithm,
          'interval_days', due.interval_days,
          'repetitions', due.repetitions,
          'lapses', due.lapses,
          'last_reviewed_at', due.last_reviewed_at,
          'fsrs_state', due.fsrs_state,
          'fsrs_stability', due.fsrs_stability,
          'fsrs_difficulty', due.fsrs_difficulty,
          'fsrs_elapsed_days', due.fsrs_elapsed_days,
          'fsrs_scheduled_days', due.fsrs_scheduled_days,
          'fsrs_due_at', due.fsrs_due_at,
          'fsrs_last_reviewed_at', due.fsrs_last_reviewed_at,
          'expected_last_reviewed_at', due.expected_last_reviewed_at
        )
        ORDER BY
          CASE
            WHEN due.status = 'new' THEN 0
            ELSE 1
          END ASC,
          due.next_review_at ASC NULLS FIRST,
          COALESCE(due.source_type, '') ASC,
          due.status ASC,
          due.foundation_card_id ASC,
          due.vocabulary_card_id ASC NULLS LAST,
          due.user_card_state_id ASC
      ),
      '[]'::jsonb
    )
  INTO due_items
  FROM due_rows due;

  candidate_new_items := '[]'::jsonb;

  RETURN NEXT;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_due_count_v2(
  p_deck_scope text DEFAULT 'personal_and_foundation'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_cache_ttl interval := interval '30 seconds';
  v_query_version integer := 2;
  v_count integer := NULL;
  v_foundation_enabled boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_deck_scope IS NULL THEN
    RETURN 0;
  END IF;

  IF p_deck_scope IN ('personal_and_foundation', 'foundation') THEN
    PERFORM public.ensure_foundation_daily_availability_v1(v_user_id, v_now);
  END IF;

  SELECT cache.due_count
  INTO v_count
  FROM public.user_due_count_cache cache
  WHERE cache.user_id = v_user_id
    AND cache.deck_scope = p_deck_scope
    AND cache.query_version = v_query_version
    AND cache.expires_at > v_now
  LIMIT 1;

  IF v_count IS NOT NULL THEN
    RETURN v_count;
  END IF;

  SELECT (
    COALESCE(
      (
        SELECT p.foundation_deck_enabled
        FROM public.profiles p
        WHERE p.user_id = v_user_id
      ),
      false
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_card_state existing
      WHERE existing.user_id = v_user_id
        AND existing.foundation_card_id IS NOT NULL
    )
  )
  INTO v_foundation_enabled;

  SELECT COUNT(*) INTO v_count
  FROM public.user_card_state ucs
  LEFT JOIN public.vocabulary_cards vc
    ON ucs.vocabulary_card_id = vc.id
  WHERE ucs.user_id = v_user_id
    AND (ucs.next_review_at IS NULL OR ucs.next_review_at <= v_now)
    AND (
      p_deck_scope = 'personal_and_foundation'
      OR (p_deck_scope = 'foundation' AND ucs.foundation_card_id IS NOT NULL)
      OR (
        p_deck_scope = 'personal'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'collected'
        AND coalesce(vc.category, '') <> 'alphabet_arabe'
      )
      OR (
        p_deck_scope = 'personal_sent'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND coalesce(ucs.source_type::text, 'collected') = 'sent'
      )
      OR (
        p_deck_scope = 'personal_alphabet'
        AND ucs.vocabulary_card_id IS NOT NULL
        AND (
          coalesce(ucs.source_type::text, 'collected') = 'alphabet'
          OR vc.category = 'alphabet_arabe'
        )
      )
    )
    AND (ucs.foundation_card_id IS NOT NULL OR ucs.added_to_deck_at IS NOT NULL)
    AND (ucs.foundation_card_id IS NULL OR v_foundation_enabled);

  INSERT INTO public.user_due_count_cache (
    user_id,
    deck_scope,
    due_count,
    computed_at,
    expires_at,
    query_version
  )
  VALUES (
    v_user_id,
    p_deck_scope,
    v_count,
    v_now,
    v_now + v_cache_ttl,
    v_query_version
  )
  ON CONFLICT (user_id, deck_scope) DO UPDATE
  SET due_count = EXCLUDED.due_count,
      computed_at = EXCLUDED.computed_at,
      expires_at = EXCLUDED.expires_at,
      query_version = EXCLUDED.query_version;

  RETURN v_count;
END;
$$;
CREATE OR REPLACE FUNCTION public.calculate_due_count_for_user_v1(
    p_user_id uuid,
    p_deck_scope text default 'personal_and_foundation'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := now();
    v_cache_ttl interval := interval '30 seconds';
    v_query_version integer := 2;
    v_count integer := null;
    v_foundation_enabled boolean := false;
begin
    if p_user_id is null then
        raise exception 'user_id_required';
    end if;

    if p_deck_scope is null then
        return 0;
    end if;

    if p_deck_scope in ('personal_and_foundation', 'foundation') then
        perform public.ensure_foundation_daily_availability_v1(p_user_id, v_now);
    end if;

    select cache.due_count
    into v_count
    from public.user_due_count_cache as cache
    where cache.user_id = p_user_id
      and cache.deck_scope = p_deck_scope
      and cache.query_version = v_query_version
      and cache.expires_at > v_now
    limit 1;

    if v_count is not null then
        return v_count;
    end if;

    select (
        coalesce(
            (
                select p.foundation_deck_enabled
                from public.profiles as p
                where p.user_id = p_user_id
            ),
            false
        )
        or exists (
            select 1
            from public.user_card_state as existing
            where existing.user_id = p_user_id
              and existing.foundation_card_id is not null
        )
    )
    into v_foundation_enabled;

    select count(*)
    into v_count
    from public.user_card_state as ucs
    left join public.vocabulary_cards as vc
        on ucs.vocabulary_card_id = vc.id
    where ucs.user_id = p_user_id
      and (ucs.next_review_at is null or ucs.next_review_at <= v_now)
      and (
          p_deck_scope = 'personal_and_foundation'
          or (p_deck_scope = 'foundation' and ucs.foundation_card_id is not null)
          or (
              p_deck_scope = 'personal'
              and ucs.vocabulary_card_id is not null
              and coalesce(ucs.source_type::text, 'collected') = 'collected'
              and coalesce(vc.category, '') <> 'alphabet_arabe'
          )
          or (
              p_deck_scope = 'personal_sent'
              and ucs.vocabulary_card_id is not null
              and coalesce(ucs.source_type::text, 'collected') = 'sent'
          )
          or (
              p_deck_scope = 'personal_alphabet'
              and ucs.vocabulary_card_id is not null
              and (
                  coalesce(ucs.source_type::text, 'collected') = 'alphabet'
                  or vc.category = 'alphabet_arabe'
              )
          )
      )
      and (ucs.foundation_card_id is not null or ucs.added_to_deck_at is not null)
      and (ucs.foundation_card_id is null or v_foundation_enabled);

    insert into public.user_due_count_cache (
        user_id,
        deck_scope,
        due_count,
        computed_at,
        expires_at,
        query_version
    )
    values (
        p_user_id,
        p_deck_scope,
        v_count,
        v_now,
        v_now + v_cache_ttl,
        v_query_version
    )
    on conflict (user_id, deck_scope) do update
    set due_count = excluded.due_count,
        computed_at = excluded.computed_at,
        expires_at = excluded.expires_at,
        query_version = excluded.query_version;

    return v_count;
end;
$$;
CREATE OR REPLACE FUNCTION public.add_foundation_deck_to_my_account_v1(
  p_source text DEFAULT 'dashboard_foundation_step'
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
  v_source_raw text := NULLIF(btrim(coalesce(p_source, 'dashboard_foundation_step')), '');
  v_now_utc timestamp with time zone := now();
  v_added integer := 0;
  v_existing_before integer := 0;
  v_assigned_count integer := 0;
  v_total integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COUNT(*) INTO v_existing_before
  FROM public.user_card_state ucs
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id IS NOT NULL;

  INSERT INTO public.profiles (user_id, foundation_deck_enabled)
  VALUES (v_user_id, true)
  ON CONFLICT (user_id) DO UPDATE
  SET foundation_deck_enabled = true;

  PERFORM public.ensure_foundation_daily_availability_v1(v_user_id, v_now_utc);

  UPDATE public.user_card_state ucs
  SET
    added_to_deck_at = COALESCE(ucs.added_to_deck_at, ucs.created_at, v_now_utc),
    source_type = COALESCE(ucs.source_type, 'foundation'::public.deck_source_type)
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id IS NOT NULL;

  SELECT COUNT(*) INTO v_total
  FROM public.foundation_deck;

  SELECT COUNT(*) INTO v_assigned_count
  FROM public.user_card_state ucs
  WHERE ucs.user_id = v_user_id
    AND ucs.foundation_card_id IS NOT NULL;

  v_added := GREATEST(v_assigned_count - v_existing_before, 0);

  INSERT INTO public.user_activity_log (user_id, activity_type, metadata)
  VALUES (
    v_user_id,
    'cards_added',
    jsonb_build_object(
      'source', coalesce(v_source_raw, 'dashboard_foundation_step'),
      'source_type', 'foundation',
      'deck', 'foundation_2000',
      'added_cards', v_added,
      'existing_cards', GREATEST(v_assigned_count - v_added, 0),
      'total_cards', v_total
    )
  );

  RETURN QUERY
  SELECT
    v_added,
    GREATEST(v_assigned_count - v_added, 0),
    v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_foundation_daily_availability_v1(uuid, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_foundation_daily_availability_v1(uuid, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_foundation_daily_availability_v1(uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_foundation_daily_availability_v1(uuid, timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.get_due_count_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_due_payload_v3(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_count_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_count_v2(text) TO service_role;
REVOKE ALL ON FUNCTION public.calculate_due_count_for_user_v1(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_due_count_for_user_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_due_count_for_user_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_foundation_deck_to_my_account_v1(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
