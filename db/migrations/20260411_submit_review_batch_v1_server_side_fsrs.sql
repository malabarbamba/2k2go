-- Structural fix for submit_review_fsrs_v2 / submit_review_batch_v1
--
-- Problem
-- -------
-- The check constraint `user_card_events_review_requires_fsrs_after`
-- mandates that every row inserted into `learning.user_card_events` with
-- `event_type = 'reviewed'` carries a non-null `fsrs_after` jsonb payload.
--
-- The previous version of `public.submit_review_batch_v1` simply forwarded
-- the per-review jsonb fields (including `fsrs_after`) straight to
-- `public.log_user_card_event_v1`. The Web client only sends
-- `{ card_id, rating, client_event_id, event_at }` because the FSRS state
-- was supposed to be computed by the runtime edge function
-- (`scheduler-review-v1`). When the runtime path is unavailable
-- (notably for any non-foundation card, where the runtime path is skipped
-- altogether), the legacy SQL fallback hits the constraint and returns
-- `400 Bad Request`, which the UI surfaces as
-- "The review scheduler returned an outdated response. Please try again
--  in a moment.".
--
-- Fix
-- ---
-- Make the database the single source of truth for review scheduling.
-- `submit_review_batch_v1` now computes a deterministic FSRS-style
-- `fsrs_after` jsonb payload server-side whenever the caller does not
-- supply one, using the prior `learning.user_cards` state as the input.
-- The algorithm is a conservative SM-2 variant that:
--   * pass (rating >= 3): difficulty -= 0.15, stability *= ~1.6
--   * fail (rating < 3): difficulty += 0.5, stability *= 0.5
--   * scheduled_days = ceil(stability), clamped to >= 1
--   * due_at = event_at + scheduled_days
--   * state transitions: new -> learning|review, fail -> relearning,
--     pass -> review
--
-- Clients that DO compute their own FSRS state continue to work
-- unchanged: any provided `fsrs_after` payload is preserved verbatim.
--
-- This eliminates the dual-source-of-truth between the runtime edge
-- function and the SQL path, removes the fragile fallback coupling, and
-- preserves the integrity constraint without forcing every caller to
-- ship a full FSRS payload.

create or replace function public.submit_review_batch_v1(
  p_session_id uuid,
  p_reviews jsonb
)
returns table(processed_count integer, last_event_at timestamp with time zone)
language plpgsql
set search_path to 'public', 'learning'
as $function$
declare
  v_uid uuid := auth.uid();
  v_processed integer := 0;
  v_last timestamptz := null;
  r record;
  v_event_at timestamptz;
  v_fsrs_after jsonb;
  v_prev_stability numeric;
  v_prev_difficulty numeric;
  v_prev_state learning.user_card_state_kind;
  v_prev_last_reviewed_at timestamptz;
  v_new_stability numeric;
  v_new_difficulty numeric;
  v_new_state learning.user_card_state_kind;
  v_elapsed_days integer;
  v_scheduled_days integer;
  v_due_at timestamptz;
  v_is_pass boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from learning.review_sessions rs
    where rs.id = p_session_id
      and rs.user_id = v_uid
      and rs.state = 'open'
  ) then
    raise exception 'Review session not found or not open';
  end if;

  for r in
    select *
    from jsonb_to_recordset(coalesce(p_reviews, '[]'::jsonb)) as x(
      card_id uuid,
      rating smallint,
      client_event_id uuid,
      event_at timestamptz,
      payload jsonb,
      fsrs_before jsonb,
      fsrs_after jsonb
    )
  loop
    v_event_at := coalesce(r.event_at, now());
    v_fsrs_after := r.fsrs_after;

    -- If the client didn't supply fsrs_after, compute it server-side
    -- from the existing user_cards row using a deterministic SM-2-style
    -- scheduler. This is the structural fix: the database owns the
    -- scheduling contract so that every legacy and runtime caller
    -- produces a constraint-compatible event row.
    if v_fsrs_after is null then
      select
        uc.stability,
        uc.difficulty,
        uc.state,
        uc.last_reviewed_at
      into
        v_prev_stability,
        v_prev_difficulty,
        v_prev_state,
        v_prev_last_reviewed_at
      from learning.user_cards uc
      where uc.user_id = v_uid
        and uc.card_id = r.card_id;

      -- Defaults for brand-new cards (no prior FSRS state).
      v_prev_stability := coalesce(v_prev_stability, 1.0);
      v_prev_difficulty := coalesce(v_prev_difficulty, 5.0);

      -- Treat any rating >= 3 as a pass (matches the binary
      -- pass/fail rating contract used by the Web client).
      v_is_pass := coalesce(r.rating, 3) >= 3;

      v_elapsed_days := greatest(
        0,
        case
          when v_prev_last_reviewed_at is null then 0
          else floor(extract(epoch from (v_event_at - v_prev_last_reviewed_at)) / 86400)::integer
        end
      );

      if v_is_pass then
        v_new_difficulty := greatest(1.0, v_prev_difficulty - 0.15);
        v_new_stability := greatest(
          v_prev_stability + 1.0,
          v_prev_stability * (1.3 + (10.0 - v_new_difficulty) * 0.05)
        );
        v_new_state := case
          when v_prev_state in ('new', 'learning', 'relearning') then 'review'::learning.user_card_state_kind
          else coalesce(v_prev_state, 'review'::learning.user_card_state_kind)
        end;
      else
        v_new_difficulty := least(10.0, v_prev_difficulty + 0.5);
        v_new_stability := greatest(0.5, v_prev_stability * 0.5);
        v_new_state := 'relearning'::learning.user_card_state_kind;
      end if;

      -- Clamp to integer days, minimum 1 day.
      v_scheduled_days := greatest(1, ceil(v_new_stability)::integer);
      v_due_at := v_event_at + make_interval(days => v_scheduled_days);

      v_fsrs_after := jsonb_build_object(
        'state', v_new_state::text,
        'due_at', v_due_at,
        'stability', v_new_stability,
        'difficulty', v_new_difficulty,
        'elapsed_days', v_elapsed_days,
        'scheduled_days', v_scheduled_days,
        'computed_by', 'submit_review_batch_v1'
      );
    end if;

    perform public.log_user_card_event_v1(
      r.card_id,
      'reviewed'::learning.user_card_event_type,
      coalesce(r.payload, '{}'::jsonb),
      r.client_event_id,
      p_session_id,
      r.rating,
      r.fsrs_before,
      v_fsrs_after,
      v_event_at
    );

    v_processed := v_processed + 1;
    v_last := greatest(coalesce(v_last, '-infinity'::timestamptz), v_event_at);
  end loop;

  update learning.review_sessions
  set
    state = 'completed',
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where id = p_session_id
    and user_id = v_uid
    and state = 'open';

  return query select v_processed, v_last;
end;
$function$;
