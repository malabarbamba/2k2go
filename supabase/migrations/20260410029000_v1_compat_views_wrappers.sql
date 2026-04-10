-- Baseline v1: compatibility wrappers for legacy RPC names

create or replace function public.search_cards_v2(
  p_query text default null,
  p_collection_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_source_types text[] default null
)
returns table (
  card_id uuid,
  term text,
  translation text,
  transliteration text,
  example_term text,
  example_translation text,
  owner_user_id uuid,
  source_kind catalog.origin_kind,
  score real
)
language sql
security invoker
set search_path = public
as $$
  select *
  from public.search_cards_v1(
    p_query => p_query,
    p_collection_id => p_collection_id,
    p_limit => p_limit,
    p_offset => p_offset
  );
$$;

create or replace function public.add_card_to_personal_deck_v2(
  p_vocabulary_card_id uuid default null,
  p_foundation_card_id uuid default null,
  p_source text default null
)
returns void
language plpgsql
security invoker
set search_path = public, catalog, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_card_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_vocabulary_card_id is not null then
    select o.card_id
    into v_card_id
    from catalog.card_origins o
    where o.source_table = 'vocabulary_cards'
      and o.source_id = p_vocabulary_card_id::text
    limit 1;
  elsif p_foundation_card_id is not null then
    select o.card_id
    into v_card_id
    from catalog.card_origins o
    where o.source_table = 'foundation_deck'
      and o.source_id = p_foundation_card_id::text
    limit 1;
  end if;

  if v_card_id is null then
    v_card_id := p_vocabulary_card_id;
  end if;

  if v_card_id is null then
    raise exception 'Card id not provided or not found';
  end if;

  insert into learning.user_cards (
    user_id,
    card_id,
    state,
    acquired_at,
    due_at,
    metadata
  )
  values (
    v_uid,
    v_card_id,
    'learning'::learning.user_card_state_kind,
    now(),
    now(),
    jsonb_build_object('source', coalesce(p_source, 'add_card_to_personal_deck_v2'))
  )
  on conflict (user_id, card_id) do update
  set
    acquired_at = coalesce(learning.user_cards.acquired_at, excluded.acquired_at),
    state = case when learning.user_cards.state = 'new' then 'learning'::learning.user_card_state_kind else learning.user_cards.state end,
    due_at = coalesce(learning.user_cards.due_at, excluded.due_at),
    metadata = coalesce(learning.user_cards.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  perform public.log_user_card_event_v1(
    p_card_id => v_card_id,
    p_event_type => 'added_to_learning'::learning.user_card_event_type,
    p_payload => jsonb_build_object('source', coalesce(p_source, 'add_card_to_personal_deck_v2'))
  );
end;
$$;

create or replace function public.collect_subtitle_word_to_personal_deck_v1(
  p_video_id uuid,
  p_word_ar text,
  p_word_fr text default null,
  p_lexicon_entry_id uuid default null,
  p_example_sentence_ar text default null,
  p_example_sentence_fr text default null,
  p_source text default null,
  p_transliteration text default null,
  p_source_video_is_short boolean default null,
  p_source_cue_id text default null,
  p_source_word_index integer default null,
  p_source_word_start_seconds double precision default null,
  p_source_word_end_seconds double precision default null
)
returns table (
  card_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_card_id uuid;
begin
  v_card_id := public.collect_subtitle_card_v1(
    p_term => p_word_ar,
    p_translation => p_word_fr,
    p_transliteration => p_transliteration,
    p_example_term => p_example_sentence_ar,
    p_example_translation => p_example_sentence_fr,
    p_video_id => p_video_id,
    p_cue_id => p_source_cue_id,
    p_start_seconds => p_source_word_start_seconds,
    p_end_seconds => p_source_word_end_seconds,
    p_source_payload => jsonb_strip_nulls(
      jsonb_build_object(
        'source', p_source,
        'lexicon_entry_id', p_lexicon_entry_id,
        'source_video_is_short', p_source_video_is_short,
        'source_word_index', p_source_word_index
      )
    )
  );

  return query select v_card_id;
end;
$$;

create or replace function public.get_due_count_v2(
  p_collection_id uuid default null
)
returns integer
language sql
security invoker
set search_path = public
as $$
  select public.get_due_count_v1(p_collection_id => p_collection_id);
$$;

create or replace function public.get_due_cards_v2(
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

create or replace function public.submit_review_fsrs_v2(
  p_session_id uuid,
  p_reviews jsonb
)
returns table (
  processed_count integer,
  last_event_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select *
  from public.submit_review_batch_v1(
    p_session_id => p_session_id,
    p_reviews => p_reviews
  );
$$;

create or replace function public.log_card_flip_v2(
  p_vocabulary_card_id uuid default null,
  p_foundation_card_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, catalog
as $$
declare
  v_card_id uuid;
begin
  if p_vocabulary_card_id is not null then
    select o.card_id
    into v_card_id
    from catalog.card_origins o
    where o.source_table = 'vocabulary_cards'
      and o.source_id = p_vocabulary_card_id::text
    limit 1;
  elsif p_foundation_card_id is not null then
    select o.card_id
    into v_card_id
    from catalog.card_origins o
    where o.source_table = 'foundation_deck'
      and o.source_id = p_foundation_card_id::text
    limit 1;
  end if;

  if v_card_id is null then
    v_card_id := p_vocabulary_card_id;
  end if;

  if v_card_id is null then
    return;
  end if;

  perform public.log_user_card_event_v1(
    p_card_id => v_card_id,
    p_event_type => 'seen'::learning.user_card_event_type,
    p_payload => '{}'::jsonb
  );
end;
$$;

create or replace function public.start_review_preview_session_v1()
returns table (
  session_id uuid,
  lease_token text,
  leased_until timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select *
  from public.start_review_session_v1(
    p_session_kind => 'preview'::learning.review_session_kind,
    p_source_collection_id => null,
    p_lease_minutes => 20
  );
$$;

create or replace function public.complete_review_preview_session_v1(
  p_session_id uuid
)
returns table (
  session_id uuid,
  state learning.review_session_state,
  completed_at timestamptz
)
language sql
security invoker
set search_path = public, learning
as $$
  update learning.review_sessions rs
  set
    state = 'completed',
    completed_at = coalesce(rs.completed_at, now()),
    updated_at = now()
  where rs.id = p_session_id
    and rs.user_id = auth.uid()
  returning rs.id, rs.state, rs.completed_at;
$$;

create or replace function public.get_user_theme_distribution_v1(
  p_user_id uuid
)
returns table (
  category text,
  total_cards bigint,
  learned_cards bigint
)
language sql
security invoker
set search_path = public, learning, catalog
as $$
  select
    coalesce(c.theme_key, 'uncategorized') as category,
    count(*)::bigint as total_cards,
    count(*) filter (where uc.state in ('review', 'relearning'))::bigint as learned_cards
  from learning.user_cards uc
  join catalog.cards c on c.id = uc.card_id
  where uc.user_id = coalesce(p_user_id, auth.uid())
  group by coalesce(c.theme_key, 'uncategorized')
  order by total_cards desc, category asc;
$$;
