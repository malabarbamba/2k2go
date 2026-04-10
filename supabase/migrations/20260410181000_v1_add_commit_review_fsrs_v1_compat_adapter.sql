-- Compatibility adapter for scheduler-review-v1 commit path.
-- The edge function sends a pre-computed FSRS payload and expects a legacy
-- response shape consumed by the frontend.

create or replace function public.commit_review_fsrs_v1(
  p_vocabulary_card_id uuid default null,
  p_foundation_card_id uuid default null,
  p_review_session_id uuid default null,
  p_client_review_id uuid default null,
  p_quality integer default null,
  p_reviewed_at timestamptz default null,
  p_status text default null,
  p_interval_days integer default null,
  p_due_at timestamptz default null,
  p_fsrs_state integer default null,
  p_fsrs_stability numeric default null,
  p_fsrs_difficulty numeric default null,
  p_fsrs_elapsed_days integer default null,
  p_fsrs_scheduled_days integer default null,
  p_fsrs_weights_version integer default null,
  p_expected_last_reviewed_at timestamptz default null
)
returns table (
  status text,
  interval_days integer,
  ease_factor numeric,
  repetitions integer,
  lapses integer,
  next_review_at timestamptz,
  last_reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public, learning, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := coalesce(p_reviewed_at, now());
  v_card_id uuid;
  v_existing_last_reviewed_at timestamptz;
  v_existing_fsrs_last_reviewed_at timestamptz;
  v_existing_client_card_id uuid;
  v_reps integer := 0;
  v_lapses integer := 0;
  v_due_at timestamptz := coalesce(p_due_at, v_now);
  v_legacy_status text;
  v_learning_state learning.user_card_state_kind;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if (p_vocabulary_card_id is null and p_foundation_card_id is null)
     or (p_vocabulary_card_id is not null and p_foundation_card_id is not null) then
    raise exception 'Provide exactly one of p_vocabulary_card_id or p_foundation_card_id';
  end if;

  if p_quality not in (1, 3) then
    raise exception 'Invalid p_quality. Expected fail=1 or pass=3';
  end if;

  if p_status not in ('learning', 'review', 'mastered') then
    raise exception 'Invalid p_status. Expected learning|review|mastered';
  end if;

  if coalesce(p_interval_days, -1) < 0 or coalesce(p_fsrs_scheduled_days, -1) < 0 then
    raise exception 'Invalid interval values. Expected non-negative days';
  end if;

  if p_fsrs_stability is null or p_fsrs_stability < 0 then
    raise exception 'Invalid p_fsrs_stability';
  end if;

  if p_fsrs_difficulty is null or p_fsrs_difficulty < 1 or p_fsrs_difficulty > 10 then
    raise exception 'Invalid p_fsrs_difficulty';
  end if;

  if p_foundation_card_id is not null then
    select co.card_id
    into v_card_id
    from catalog.card_origins co
    where co.source_table = 'foundation_deck'
      and co.source_id = p_foundation_card_id::text
    limit 1;
  else
    select co.card_id
    into v_card_id
    from catalog.card_origins co
    where co.source_table = 'vocabulary_cards'
      and co.source_id = p_vocabulary_card_id::text
    limit 1;
  end if;

  if v_card_id is null then
    raise exception 'CARD_NOT_FOUND_IN_ORIGINS';
  end if;

  if p_client_review_id is not null then
    select e.card_id
    into v_existing_client_card_id
    from learning.user_card_events e
    where e.user_id = v_uid
      and e.client_event_id = p_client_review_id
    limit 1;

    if v_existing_client_card_id is not null and v_existing_client_card_id <> v_card_id then
      raise exception 'CLIENT_REVIEW_ID_CARD_MISMATCH';
    end if;
  end if;

  select
    ucs.last_reviewed_at,
    ucs.fsrs_last_reviewed_at
  into
    v_existing_last_reviewed_at,
    v_existing_fsrs_last_reviewed_at
  from public.user_card_state ucs
  where ucs.user_id = v_uid
    and (
      (p_foundation_card_id is not null and ucs.foundation_card_id = p_foundation_card_id)
      or (p_vocabulary_card_id is not null and ucs.vocabulary_card_id = p_vocabulary_card_id)
    )
  for update;

  if p_expected_last_reviewed_at is not null
     and coalesce(v_existing_fsrs_last_reviewed_at, v_existing_last_reviewed_at) is distinct from p_expected_last_reviewed_at then
    raise exception 'CARD_STATE_STALE';
  end if;

  v_learning_state := case
    when p_status = 'learning' then 'learning'::learning.user_card_state_kind
    else 'review'::learning.user_card_state_kind
  end;

  perform public.log_user_card_event_v1(
    p_card_id => v_card_id,
    p_event_type => 'reviewed'::learning.user_card_event_type,
    p_payload => jsonb_build_object(
      'source', 'commit_review_fsrs_v1',
      'review_session_id', p_review_session_id
    ),
    p_client_event_id => p_client_review_id,
    p_session_id => null,
    p_rating => p_quality::smallint,
    p_fsrs_before => null,
    p_fsrs_after => jsonb_build_object(
      'state', v_learning_state::text,
      'due_at', v_due_at,
      'stability', p_fsrs_stability,
      'difficulty', p_fsrs_difficulty,
      'elapsed_days', p_fsrs_elapsed_days,
      'scheduled_days', p_fsrs_scheduled_days
    ),
    p_event_at => v_now
  );

  select
    uc.reps,
    uc.lapses,
    uc.due_at,
    uc.last_reviewed_at
  into
    v_reps,
    v_lapses,
    v_due_at,
    v_now
  from learning.user_cards uc
  where uc.user_id = v_uid
    and uc.card_id = v_card_id;

  v_legacy_status := case
    when p_status in ('learning', 'review', 'mastered') then p_status
    else 'review'
  end;

  if p_foundation_card_id is not null then
    insert into public.user_card_state (
      user_id,
      foundation_card_id,
      status,
      ease_factor,
      interval_days,
      repetitions,
      lapses,
      next_review_at,
      last_reviewed_at,
      source_type,
      scheduling_algorithm,
      fsrs_state,
      fsrs_stability,
      fsrs_difficulty,
      fsrs_elapsed_days,
      fsrs_scheduled_days,
      fsrs_due_at,
      fsrs_last_reviewed_at,
      fsrs_weights_version
    )
    values (
      v_uid,
      p_foundation_card_id,
      v_legacy_status,
      2.5,
      greatest(coalesce(p_interval_days, 0), 0),
      greatest(coalesce(v_reps, 0), 0),
      greatest(coalesce(v_lapses, 0), 0),
      v_due_at,
      v_now,
      'foundation'::public.deck_source_type,
      'fsrs',
      p_fsrs_state,
      p_fsrs_stability,
      p_fsrs_difficulty,
      greatest(coalesce(p_fsrs_elapsed_days, 0), 0),
      greatest(coalesce(p_fsrs_scheduled_days, 0), 0),
      v_due_at,
      v_now,
      greatest(coalesce(p_fsrs_weights_version, 1), 1)
    )
    on conflict (user_id, foundation_card_id)
    do update set
      status = excluded.status,
      ease_factor = excluded.ease_factor,
      interval_days = excluded.interval_days,
      repetitions = excluded.repetitions,
      lapses = excluded.lapses,
      next_review_at = excluded.next_review_at,
      last_reviewed_at = excluded.last_reviewed_at,
      source_type = excluded.source_type,
      scheduling_algorithm = excluded.scheduling_algorithm,
      fsrs_state = excluded.fsrs_state,
      fsrs_stability = excluded.fsrs_stability,
      fsrs_difficulty = excluded.fsrs_difficulty,
      fsrs_elapsed_days = excluded.fsrs_elapsed_days,
      fsrs_scheduled_days = excluded.fsrs_scheduled_days,
      fsrs_due_at = excluded.fsrs_due_at,
      fsrs_last_reviewed_at = excluded.fsrs_last_reviewed_at,
      fsrs_weights_version = excluded.fsrs_weights_version,
      updated_at = now();
  else
    insert into public.user_card_state (
      user_id,
      vocabulary_card_id,
      status,
      ease_factor,
      interval_days,
      repetitions,
      lapses,
      next_review_at,
      last_reviewed_at,
      source_type,
      scheduling_algorithm,
      fsrs_state,
      fsrs_stability,
      fsrs_difficulty,
      fsrs_elapsed_days,
      fsrs_scheduled_days,
      fsrs_due_at,
      fsrs_last_reviewed_at,
      fsrs_weights_version
    )
    values (
      v_uid,
      p_vocabulary_card_id,
      v_legacy_status,
      2.5,
      greatest(coalesce(p_interval_days, 0), 0),
      greatest(coalesce(v_reps, 0), 0),
      greatest(coalesce(v_lapses, 0), 0),
      v_due_at,
      v_now,
      'collected'::public.deck_source_type,
      'fsrs',
      p_fsrs_state,
      p_fsrs_stability,
      p_fsrs_difficulty,
      greatest(coalesce(p_fsrs_elapsed_days, 0), 0),
      greatest(coalesce(p_fsrs_scheduled_days, 0), 0),
      v_due_at,
      v_now,
      greatest(coalesce(p_fsrs_weights_version, 1), 1)
    )
    on conflict (user_id, vocabulary_card_id)
    do update set
      status = excluded.status,
      ease_factor = excluded.ease_factor,
      interval_days = excluded.interval_days,
      repetitions = excluded.repetitions,
      lapses = excluded.lapses,
      next_review_at = excluded.next_review_at,
      last_reviewed_at = excluded.last_reviewed_at,
      source_type = excluded.source_type,
      scheduling_algorithm = excluded.scheduling_algorithm,
      fsrs_state = excluded.fsrs_state,
      fsrs_stability = excluded.fsrs_stability,
      fsrs_difficulty = excluded.fsrs_difficulty,
      fsrs_elapsed_days = excluded.fsrs_elapsed_days,
      fsrs_scheduled_days = excluded.fsrs_scheduled_days,
      fsrs_due_at = excluded.fsrs_due_at,
      fsrs_last_reviewed_at = excluded.fsrs_last_reviewed_at,
      fsrs_weights_version = excluded.fsrs_weights_version,
      updated_at = now();
  end if;

  return query
  select
    v_legacy_status,
    greatest(coalesce(p_interval_days, 0), 0),
    2.5::numeric,
    greatest(coalesce(v_reps, 0), 0),
    greatest(coalesce(v_lapses, 0), 0),
    v_due_at,
    v_now;
end;
$$;

revoke all on function public.commit_review_fsrs_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  integer,
  timestamptz,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  integer,
  timestamptz
) from public;

grant execute on function public.commit_review_fsrs_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  integer,
  timestamptz,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  integer,
  timestamptz
) to authenticated, service_role;

notify pgrst, 'reload schema';
