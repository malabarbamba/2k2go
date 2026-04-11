drop function if exists public.get_due_cards_v2(integer, uuid);
drop function if exists public.get_due_queue_v1(integer, uuid);

create function public.get_due_queue_v1(
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
  source_collection_id uuid,
  frequency_rank integer,
  image_url text,
  audio_url text,
  sentence_audio_url text
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
    uc.source_collection_id,
    coalesce(c.frequency_rank, ci.position) as frequency_rank,
    c.image_url,
    c.audio_url,
    c.sentence_audio_url
  from learning.user_cards uc
  join catalog.cards c on c.id = uc.card_id
  left join catalog.collection_items ci
    on ci.collection_id = uc.source_collection_id
   and ci.card_id = uc.card_id
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
    case when uc.state = 'new' then coalesce(c.frequency_rank, ci.position) end asc nulls last,
    case when uc.state = 'new' then uc.card_id end asc,
    case when uc.state <> 'new' then uc.due_at end asc nulls last,
    uc.card_id asc
  limit v_limit;
end;
$$;

create function public.get_due_cards_v2(
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
  source_collection_id uuid,
  frequency_rank integer,
  image_url text,
  audio_url text,
  sentence_audio_url text
)
language sql
security invoker
set search_path = public
as $$
  select *
  from public.get_due_queue_v1(
    p_limit => p_limit,
    p_collection_id => p_collection_id
  );
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

  perform greatest(0, coalesce(p_candidate_new_limit, 0));
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
      coalesce(c.frequency_rank, ci.position) as frequency_rank,
      c.image_url,
      c.audio_url,
      c.sentence_audio_url,
      c.theme_key as category,
      o.origin_kind,
      o.source_id as origin_source_id
    from learning.user_cards uc
    join catalog.cards c on c.id = uc.card_id
    left join catalog.collection_items ci
      on ci.collection_id = uc.source_collection_id
     and ci.card_id = uc.card_id
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
      case when uc.state = 'new' then coalesce(c.frequency_rank, ci.position) end asc nulls last,
      case when uc.state = 'new' then uc.card_id end asc,
      case when uc.state <> 'new' then uc.due_at end asc nulls last,
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
            'card_id', dr.card_id,
            'source', case when dr.origin_kind = 'foundation_seed' then 'foundation' else 'vocabulary' end,
            'vocabulary_card_id', case when dr.origin_kind = 'foundation_seed' then null else dr.card_id end,
            'foundation_card_id', case when dr.origin_kind = 'foundation_seed' then coalesce(nullif(dr.origin_source_id, ''), dr.card_id::text) else null end,
            'word_ar', dr.term,
            'word_fr', dr.translation,
            'transliteration', dr.transliteration,
            'example_sentence_ar', dr.example_term,
            'example_sentence_fr', dr.example_translation,
            'image_url', dr.image_url,
            'audio_url', dr.audio_url,
            'sentence_audio_url', dr.sentence_audio_url,
            'category', dr.category,
            'status', dr.state,
            'focus', dr.frequency_rank,
            'frequency_rank', dr.frequency_rank,
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

notify pgrst, 'reload schema';
