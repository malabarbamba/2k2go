-- Baseline v1: canonical daily new-card top-up with scheduler profile as single source of truth

create or replace function public.ensure_daily_new_card_availability_v1(
  p_user_id uuid default auth.uid(),
  p_now_utc timestamptz default now()
)
returns table (
  daily_new_cap integer,
  pending_new_count integer,
  introduced_today_count integer,
  inserted_count integer
)
language plpgsql
security invoker
set search_path = public, account, learning, catalog
as $$
declare
  v_user_id uuid := p_user_id;
  v_now_utc timestamptz := coalesce(p_now_utc, now());
  v_timezone text := 'UTC';
  v_cutoff_hour integer := 4;
  v_local_now timestamp;
  v_day_start_local timestamp;
  v_day_start_utc timestamptz;
  v_day_end_utc timestamptz;
  v_max_daily_new integer := 20;
  v_pending_new integer := 0;
  v_introduced_today integer := 0;
  v_remaining_today integer := 0;
  v_capacity_gap integer := 0;
  v_to_insert integer := 0;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from v_user_id then
    raise exception 'Cannot mutate another user';
  end if;

  insert into learning.scheduler_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select
    coalesce(nullif(btrim(sp.timezone), ''), nullif(btrim(p.timezone), ''), 'UTC'),
    least(20, greatest(0, coalesce(sp.max_daily_new, 20)))
  into
    v_timezone,
    v_max_daily_new
  from account.profiles p
  left join learning.scheduler_profiles sp
    on sp.user_id = p.user_id
  where p.user_id = v_user_id
  limit 1;

  v_timezone := coalesce(nullif(btrim(v_timezone), ''), 'UTC');
  v_max_daily_new := least(20, greatest(0, coalesce(v_max_daily_new, 20)));

  v_local_now := timezone(v_timezone, v_now_utc);
  v_day_start_local := date_trunc('day', v_local_now - make_interval(hours => v_cutoff_hour)) + make_interval(hours => v_cutoff_hour);
  v_day_start_utc := v_day_start_local at time zone v_timezone;
  v_day_end_utc := v_day_start_utc + interval '1 day';

  select count(*)::integer
  into v_pending_new
  from learning.user_cards uc
  where uc.user_id = v_user_id
    and uc.state = 'new'
    and uc.archived_at is null
    and uc.suspended_at is null;

  select count(*)::integer
  into v_introduced_today
  from learning.user_cards uc
  where uc.user_id = v_user_id
    and uc.introduced_at is not null
    and uc.introduced_at >= v_day_start_utc
    and uc.introduced_at < v_day_end_utc;

  v_remaining_today := greatest(0, v_max_daily_new - coalesce(v_introduced_today, 0));
  v_capacity_gap := greatest(0, v_max_daily_new - coalesce(v_pending_new, 0));
  v_to_insert := least(v_remaining_today, v_capacity_gap);

  if v_to_insert > 0 then
    with foundation_cards as (
      select
        c.id as card_id,
        min(c.frequency_rank) as frequency_rank
      from catalog.cards c
      join catalog.card_origins o
        on o.card_id = c.id
      where o.origin_kind = 'foundation_seed'
      group by c.id
    ),
    candidates as (
      select fc.card_id
      from foundation_cards fc
      left join learning.user_cards uc
        on uc.user_id = v_user_id
       and uc.card_id = fc.card_id
      where uc.card_id is null
      order by fc.frequency_rank asc nulls last, fc.card_id asc
      limit v_to_insert
    ),
    inserted as (
      insert into learning.user_cards (
        user_id,
        card_id,
        state,
        due_at,
        introduced_at,
        metadata
      )
      select
        v_user_id,
        candidate.card_id,
        'new'::learning.user_card_state_kind,
        v_now_utc,
        v_now_utc,
        jsonb_build_object('source_type', 'foundation')
      from candidates candidate
      on conflict (user_id, card_id) do nothing
      returning 1
    )
    select count(*)::integer
    into v_inserted
    from inserted;
  end if;

  return query
  select
    v_max_daily_new,
    coalesce(v_pending_new, 0) + coalesce(v_inserted, 0),
    coalesce(v_introduced_today, 0) + coalesce(v_inserted, 0),
    coalesce(v_inserted, 0);
end;
$$;

create or replace function public.get_due_count_v1(
  p_collection_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.ensure_daily_new_card_availability_v1(v_uid, now());

  select count(*)::integer
  into v_count
  from learning.user_cards uc
  where uc.user_id = v_uid
    and uc.state in ('new', 'learning', 'review', 'relearning')
    and uc.due_at is not null
    and uc.due_at <= now()
    and uc.is_buried = false
    and uc.suspended_at is null
    and uc.archived_at is null
    and (
      p_collection_id is null
      or uc.source_collection_id = p_collection_id
    );

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.get_due_queue_v1(
  p_limit integer default 50,
  p_collection_id uuid default null
)
returns table (
  card_id uuid,
  state learning.user_card_state_kind,
  due_at timestamptz,
  reps integer,
  lapses integer,
  term text,
  translation text,
  transliteration text,
  example_term text,
  example_translation text,
  source_collection_id uuid
)
language plpgsql
security invoker
set search_path = public, learning, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.ensure_daily_new_card_availability_v1(v_uid, now());

  return query
  select
    uc.card_id,
    uc.state,
    uc.due_at,
    uc.reps,
    uc.lapses,
    c.term,
    c.translation,
    c.transliteration,
    c.example_term,
    c.example_translation,
    uc.source_collection_id
  from learning.user_cards uc
  join catalog.cards c on c.id = uc.card_id
  where uc.user_id = v_uid
    and uc.state in ('new', 'learning', 'review', 'relearning')
    and uc.due_at is not null
    and uc.due_at <= now()
    and uc.is_buried = false
    and uc.suspended_at is null
    and uc.archived_at is null
    and (
      p_collection_id is null
      or uc.source_collection_id = p_collection_id
    )
  order by
    case when uc.state = 'new' then 0 else 1 end asc,
    uc.due_at asc,
    uc.card_id asc
  limit v_limit;
end;
$$;

create or replace function public.get_due_payload_v3(
  p_due_limit integer default 200,
  p_candidate_new_limit integer default 200
)
returns table(
  schema_version integer,
  scheduler_timezone text,
  scheduler_day_cutoff_hour integer,
  fsrs_target_retention numeric,
  active_weights_version integer,
  due_items jsonb,
  candidate_new_items jsonb
)
language plpgsql
security invoker
set search_path = public, account, learning, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_due_limit integer := greatest(1, least(coalesce(p_due_limit, 200), 500));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.ensure_daily_new_card_availability_v1(v_uid, now());

  return query
  with scheduler as (
    select
      coalesce(nullif(btrim(sp.timezone), ''), nullif(btrim(p.timezone), ''), 'UTC') as tz,
      4::integer as cutoff_hour,
      least(0.97, greatest(0.70, coalesce(sp.desired_retention, 0.90)))::numeric as target_retention,
      1::integer as weights_version
    from account.profiles p
    left join learning.scheduler_profiles sp
      on sp.user_id = p.user_id
    where p.user_id = v_uid
    limit 1
  ),
  due_rows as (
    select
      uc.card_id,
      uc.state,
      uc.due_at,
      uc.reps,
      uc.lapses,
      uc.stability,
      uc.difficulty,
      uc.elapsed_days,
      uc.scheduled_days,
      uc.last_reviewed_at,
      uc.metadata,
      c.term,
      c.translation,
      c.transliteration,
      c.example_term,
      c.example_translation,
      c.category,
      o.origin_kind,
      o.source_id as origin_source_id
    from learning.user_cards uc
    join catalog.cards c on c.id = uc.card_id
    left join lateral (
      select co.origin_kind, co.source_id
      from catalog.card_origins co
      where co.card_id = uc.card_id
      order by
        case when co.origin_kind = 'foundation_seed' then 0 else 1 end asc,
        co.created_at asc
      limit 1
    ) o on true
    where uc.user_id = v_uid
      and uc.state in ('new', 'learning', 'review', 'relearning')
      and uc.due_at is not null
      and uc.due_at <= now()
      and uc.is_buried = false
      and uc.suspended_at is null
      and uc.archived_at is null
    order by
      case when uc.state = 'new' then 0 else 1 end asc,
      uc.due_at asc,
      uc.card_id asc
    limit v_due_limit
  )
  select
    3 as schema_version,
    coalesce((select tz from scheduler), 'UTC') as scheduler_timezone,
    coalesce((select cutoff_hour from scheduler), 4) as scheduler_day_cutoff_hour,
    coalesce((select target_retention from scheduler), 0.90::numeric) as fsrs_target_retention,
    coalesce((select weights_version from scheduler), 1) as active_weights_version,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'source', case when dr.origin_kind = 'foundation_seed' then 'foundation' else 'vocabulary' end,
            'vocabulary_card_id', case when dr.origin_kind = 'foundation_seed' then null else dr.card_id end,
            'foundation_card_id', case when dr.origin_kind = 'foundation_seed' then coalesce(nullif(dr.origin_source_id, ''), dr.card_id::text) else null end,
            'word_ar', dr.term,
            'word_fr', dr.translation,
            'transliteration', dr.transliteration,
            'example_sentence_ar', dr.example_term,
            'example_sentence_fr', dr.example_translation,
            'audio_url', null,
            'category', dr.category,
            'status', dr.state,
            'next_review_at', dr.due_at,
            'source_type', case when dr.origin_kind = 'foundation_seed' then 'foundation' else coalesce(nullif(dr.metadata->>'source_type', ''), 'collected') end,
            'scheduling_algorithm', 'fsrs',
            'interval_days', coalesce(dr.scheduled_days, 0),
            'repetitions', coalesce(dr.reps, 0),
            'lapses', coalesce(dr.lapses, 0),
            'last_reviewed_at', dr.last_reviewed_at,
            'fsrs_state', case when dr.state = 'new' then 0 when dr.state in ('learning', 'relearning') then 1 else 2 end,
            'fsrs_stability', coalesce(dr.stability, 0.4026),
            'fsrs_difficulty', coalesce(dr.difficulty, 5),
            'fsrs_elapsed_days', coalesce(dr.elapsed_days, 0),
            'fsrs_scheduled_days', coalesce(dr.scheduled_days, 0),
            'fsrs_due_at', dr.due_at,
            'fsrs_last_reviewed_at', dr.last_reviewed_at,
            'expected_last_reviewed_at', dr.last_reviewed_at
          )
        )
        from due_rows dr
      ),
      '[]'::jsonb
    ) as due_items,
    '[]'::jsonb as candidate_new_items;
end;
$$;

grant execute on function public.ensure_daily_new_card_availability_v1(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
