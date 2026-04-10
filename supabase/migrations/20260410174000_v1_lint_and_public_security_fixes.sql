-- Resolve remaining DB lint errors and pin legacy public object posture.

create or replace function public.collect_subtitle_card_v1(
  p_term text,
  p_translation text,
  p_transliteration text,
  p_example_term text,
  p_example_translation text,
  p_video_id uuid,
  p_cue_id text,
  p_start_seconds double precision,
  p_end_seconds double precision,
  p_source_payload jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.collect_subtitle_card_v1(
    p_term => p_term,
    p_translation => p_translation,
    p_transliteration => p_transliteration,
    p_example_term => p_example_term,
    p_example_translation => p_example_translation,
    p_video_id => p_video_id,
    p_cue_id => p_cue_id,
    p_start_seconds => p_start_seconds::numeric,
    p_end_seconds => p_end_seconds::numeric,
    p_source_payload => p_source_payload
  );
$$;

create or replace function public.sync_user_milestones_v1()
returns setof progress.user_milestones
language plpgsql
security invoker
set search_path = public, progress, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_review_count integer;
  v_first_review timestamptz;
  v_current_streak integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select count(*), min(event_at)
  into v_review_count, v_first_review
  from learning.user_card_events
  where user_id = v_uid
    and event_type = 'reviewed';

  if v_first_review is not null then
    insert into progress.user_milestones (user_id, milestone_key, earned_at)
    values (v_uid, 'first_review', v_first_review)
    on conflict (user_id, milestone_key) do nothing;
  end if;

  if v_review_count >= 100 then
    insert into progress.user_milestones (user_id, milestone_key, earned_at)
    values (v_uid, 'reviews_100', now())
    on conflict (user_id, milestone_key) do nothing;
  end if;

  with days as (
    select distinct event_at::date as d
    from learning.user_card_events
    where user_id = v_uid
      and event_type = 'reviewed'
  ), ordered as (
    select
      d,
      row_number() over (order by d desc) as rn
    from days
  )
  select coalesce(count(*), 0)::integer
  into v_current_streak
  from ordered
  where d = (current_date - ((rn - 1)::integer));

  if v_current_streak >= 7 then
    insert into progress.user_milestones (user_id, milestone_key, earned_at, metadata)
    values (
      v_uid,
      'streak_7',
      now(),
      jsonb_build_object('streak_days', v_current_streak)
    )
    on conflict (user_id, milestone_key) do update
    set metadata = excluded.metadata;
  end if;

  return query
  select * from progress.user_milestones where user_id = v_uid;
end;
$$;

create or replace function public.rotate_calendar_feed_v1(
  p_scope reminder.feed_scope default 'all_cards',
  p_collection_id uuid default null,
  p_expires_at timestamptz default null
)
returns table (
  feed_id uuid,
  token text,
  scope reminder.feed_scope,
  collection_id uuid,
  is_active boolean,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public, reminder
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_token text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update reminder.calendar_feeds cf
  set is_active = false
  where cf.user_id = v_uid
    and cf.scope = p_scope
    and coalesce(cf.collection_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_collection_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and cf.is_active = true;

  v_token := encode(extensions.gen_random_bytes(20), 'hex');

  insert into reminder.calendar_feeds (
    user_id,
    token,
    scope,
    collection_id,
    is_active,
    expires_at
  )
  values (
    v_uid,
    v_token,
    p_scope,
    p_collection_id,
    true,
    p_expires_at
  )
  returning id into v_id;

  return query
  select cf.id, cf.token, cf.scope, cf.collection_id, cf.is_active, cf.expires_at
  from reminder.calendar_feeds cf
  where cf.id = v_id;
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
      c.theme_key as category,
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

create or replace function private.generate_unique_username_v1()
returns text
language plpgsql
security definer
set search_path = private, account
as $$
declare
  v_candidate text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_candidate := private.generate_username_candidate_v1();

    if v_candidate = 'me' then
      continue;
    end if;

    if not exists (
      select 1
      from account.profiles p
      where lower(p.username) = lower(v_candidate)
    ) then
      return v_candidate;
    end if;

    if v_attempt >= 25 then
      return format('user-%s', substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12));
    end if;
  end loop;

  return null;
end;
$$;

do $$
begin
  if to_regclass('public.community_user_vocabulary_cards_v1') is not null then
    execute 'alter view public.community_user_vocabulary_cards_v1 set (security_invoker = true)';
  end if;

  if to_regclass('public.word_import_signal_daily') is not null then
    execute 'alter table public.word_import_signal_daily enable row level security';
    execute 'alter table public.word_import_signal_daily force row level security';
  end if;
end
$$;

select private.assert_public_schema_guardrails();

notify pgrst, 'reload schema';
