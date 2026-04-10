-- Baseline v1: public RPC surface

create or replace function public.get_my_profile_v1()
returns account.profiles
language plpgsql
security invoker
set search_path = public, account
as $$
declare
  v_uid uuid := auth.uid();
  v_profile account.profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select p.*
  into v_profile
  from account.profiles p
  where p.user_id = v_uid;

  return v_profile;
end;
$$;

create or replace function public.upsert_my_profile_v1(
  p_username text default null,
  p_display_name text default null,
  p_avatar_url text default null,
  p_locale text default null,
  p_timezone text default null,
  p_bio text default null,
  p_email_notifications_enabled boolean default null
)
returns account.profiles
language plpgsql
security invoker
set search_path = public, account
as $$
declare
  v_uid uuid := auth.uid();
  v_profile account.profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into account.profiles (
    user_id,
    username,
    display_name,
    avatar_url,
    locale,
    timezone,
    bio,
    email_notifications_enabled
  )
  values (
    v_uid,
    p_username,
    p_display_name,
    p_avatar_url,
    coalesce(p_locale, 'fr'),
    coalesce(p_timezone, 'UTC'),
    p_bio,
    coalesce(p_email_notifications_enabled, true)
  )
  on conflict (user_id) do update
  set
    username = coalesce(excluded.username, account.profiles.username),
    display_name = coalesce(excluded.display_name, account.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, account.profiles.avatar_url),
    locale = coalesce(excluded.locale, account.profiles.locale),
    timezone = coalesce(excluded.timezone, account.profiles.timezone),
    bio = coalesce(excluded.bio, account.profiles.bio),
    email_notifications_enabled = coalesce(excluded.email_notifications_enabled, account.profiles.email_notifications_enabled),
    updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.search_cards_v1(
  p_query text default null,
  p_collection_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
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
set search_path = public, catalog, private
as $$
  with q as (
    select
      private.normalize_arabic(p_query) as q_ar,
      private.normalize_text(p_query) as q_txt,
      auth.uid() as uid
  )
  select
    c.id as card_id,
    c.term,
    c.translation,
    c.transliteration,
    c.example_term,
    c.example_translation,
    c.owner_user_id,
    co.origin_kind as source_kind,
    greatest(
      coalesce(similarity(c.normalized_term, q.q_ar), 0),
      coalesce(similarity(c.normalized_translation, q.q_txt), 0),
      coalesce(similarity(c.normalized_transliteration, q.q_txt), 0)
    )::real as score
  from catalog.cards c
  cross join q
  left join lateral (
    select co2.origin_kind
    from catalog.card_origins co2
    where co2.card_id = c.id
    order by co2.created_at asc
    limit 1
  ) co on true
  where c.is_active = true
    and (
      (q.uid is null and c.owner_user_id is null)
      or (q.uid is not null and (c.owner_user_id is null or c.owner_user_id = q.uid))
    )
    and (
      p_collection_id is null
      or exists (
        select 1
        from catalog.collection_items ci
        where ci.collection_id = p_collection_id
          and ci.card_id = c.id
      )
    )
    and (
      p_query is null
      or btrim(p_query) = ''
      or c.normalized_term % q.q_ar
      or c.normalized_translation % q.q_txt
      or c.normalized_transliteration % q.q_txt
    )
  order by
    score desc,
    c.frequency_rank asc nulls last,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.upsert_private_card_v1(
  p_term text,
  p_translation text default null,
  p_transliteration text default null,
  p_example_term text default null,
  p_example_translation text default null,
  p_theme_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_card_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, catalog, private
as $$
declare
  v_uid uuid := auth.uid();
  v_card_id uuid;
  v_norm_term text;
  v_norm_translation text;
  v_norm_translit text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_term is null or btrim(p_term) = '' then
    raise exception 'term is required';
  end if;

  if p_card_id is not null then
    update catalog.cards
    set
      term = p_term,
      translation = p_translation,
      transliteration = p_transliteration,
      example_term = p_example_term,
      example_translation = p_example_translation,
      theme_key = p_theme_key,
      metadata = coalesce(catalog.cards.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = p_card_id
      and owner_user_id = v_uid
    returning id into v_card_id;

    if v_card_id is null then
      raise exception 'Card not found or not owned by user';
    end if;

    return v_card_id;
  end if;

  v_norm_term := private.normalize_arabic(p_term);
  v_norm_translation := private.normalize_text(p_translation);
  v_norm_translit := private.normalize_text(p_transliteration);

  select c.id
  into v_card_id
  from catalog.cards c
  where c.owner_user_id = v_uid
    and c.normalized_term = v_norm_term
    and coalesce(c.normalized_translation, '') = coalesce(v_norm_translation, '')
    and coalesce(c.normalized_transliteration, '') = coalesce(v_norm_translit, '')
    and c.is_active = true
  limit 1;

  if v_card_id is not null then
    update catalog.cards
    set
      term = p_term,
      translation = coalesce(p_translation, catalog.cards.translation),
      transliteration = coalesce(p_transliteration, catalog.cards.transliteration),
      example_term = coalesce(p_example_term, catalog.cards.example_term),
      example_translation = coalesce(p_example_translation, catalog.cards.example_translation),
      theme_key = coalesce(p_theme_key, catalog.cards.theme_key),
      metadata = coalesce(catalog.cards.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = v_card_id;

    return v_card_id;
  end if;

  insert into catalog.cards (
    owner_user_id,
    card_kind,
    term,
    translation,
    transliteration,
    example_term,
    example_translation,
    theme_key,
    metadata
  )
  values (
    v_uid,
    'vocabulary',
    p_term,
    p_translation,
    p_transliteration,
    p_example_term,
    p_example_translation,
    p_theme_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_card_id;

  insert into catalog.card_origins (
    card_id,
    origin_kind,
    source_table,
    source_id,
    source_user_id,
    source_payload
  )
  values (
    v_card_id,
    'manual_entry',
    'rpc.upsert_private_card_v1',
    v_card_id::text,
    v_uid,
    '{}'::jsonb
  )
  on conflict do nothing;

  return v_card_id;
end;
$$;

create or replace function public.collect_subtitle_card_v1(
  p_term text,
  p_translation text default null,
  p_transliteration text default null,
  p_example_term text default null,
  p_example_translation text default null,
  p_video_id uuid default null,
  p_cue_id text default null,
  p_start_seconds numeric default null,
  p_end_seconds numeric default null,
  p_source_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_card_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_card_id := public.upsert_private_card_v1(
    p_term => p_term,
    p_translation => p_translation,
    p_transliteration => p_transliteration,
    p_example_term => p_example_term,
    p_example_translation => p_example_translation,
    p_theme_key => null,
    p_metadata => p_source_payload,
    p_card_id => null
  );

  if p_video_id is not null then
    insert into catalog.card_video_links (
      card_id,
      video_id,
      cue_id,
      start_seconds,
      end_seconds,
      metadata
    )
    values (
      v_card_id,
      p_video_id,
      p_cue_id,
      p_start_seconds,
      p_end_seconds,
      coalesce(p_source_payload, '{}'::jsonb)
    )
    on conflict do nothing;
  end if;

  insert into catalog.card_origins (
    card_id,
    origin_kind,
    source_table,
    source_id,
    source_user_id,
    source_payload
  )
  values (
    v_card_id,
    'video_extracted',
    'rpc.collect_subtitle_card_v1',
    coalesce(p_cue_id, v_card_id::text),
    v_uid,
    coalesce(p_source_payload, '{}'::jsonb)
  )
  on conflict do nothing;

  return v_card_id;
end;
$$;

create or replace function public.upsert_collection_v1(
  p_title text,
  p_description text default null,
  p_slug text default null,
  p_visibility catalog.collection_visibility default 'private',
  p_kind catalog.collection_kind default 'user_private',
  p_metadata jsonb default '{}'::jsonb,
  p_collection_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'title is required';
  end if;

  if p_kind in ('system_foundation', 'system_alphabet') then
    raise exception 'system collection kind cannot be created by user';
  end if;

  if p_collection_id is null then
    insert into catalog.collections (
      owner_user_id,
      slug,
      title,
      description,
      kind,
      visibility,
      metadata
    )
    values (
      v_uid,
      p_slug,
      p_title,
      p_description,
      p_kind,
      p_visibility,
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update catalog.collections
    set
      slug = coalesce(p_slug, catalog.collections.slug),
      title = p_title,
      description = coalesce(p_description, catalog.collections.description),
      kind = p_kind,
      visibility = p_visibility,
      metadata = coalesce(catalog.collections.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = p_collection_id
      and owner_user_id = v_uid
    returning id into v_id;

    if v_id is null then
      raise exception 'Collection not found or not owned by user';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_user_collection_state_v1(
  p_collection_id uuid,
  p_state catalog.user_collection_state_kind,
  p_last_opened_at timestamptz default null
)
returns catalog.user_collection_state
language plpgsql
security invoker
set search_path = public, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_row catalog.user_collection_state;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into catalog.user_collection_state (
    user_id,
    collection_id,
    state,
    hidden_at,
    archived_at,
    last_opened_at
  )
  values (
    v_uid,
    p_collection_id,
    p_state,
    case when p_state = 'hidden' then now() else null end,
    case when p_state = 'archived' then now() else null end,
    p_last_opened_at
  )
  on conflict (user_id, collection_id) do update
  set
    state = excluded.state,
    hidden_at = case when excluded.state = 'hidden' then coalesce(catalog.user_collection_state.hidden_at, now()) else null end,
    archived_at = case when excluded.state = 'archived' then coalesce(catalog.user_collection_state.archived_at, now()) else null end,
    last_opened_at = coalesce(excluded.last_opened_at, catalog.user_collection_state.last_opened_at),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_collection_access_v1(
  p_collection_id uuid,
  p_grantee_user_id uuid,
  p_access_role social.collection_access_role default 'viewer',
  p_revoke boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public, social, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select c.owner_user_id into v_owner
  from catalog.collections c
  where c.id = p_collection_id;

  if v_owner is null or v_owner <> v_uid then
    raise exception 'Only collection owner can manage access';
  end if;

  if p_revoke then
    update social.collection_access
    set revoked_at = now()
    where collection_id = p_collection_id
      and grantee_user_id = p_grantee_user_id;
    return;
  end if;

  insert into social.collection_access (
    collection_id,
    grantee_user_id,
    granted_by_user_id,
    access_role,
    revoked_at
  )
  values (
    p_collection_id,
    p_grantee_user_id,
    v_uid,
    p_access_role,
    null
  )
  on conflict (collection_id, grantee_user_id) do update
  set
    granted_by_user_id = excluded.granted_by_user_id,
    access_role = excluded.access_role,
    revoked_at = null;
end;
$$;

create or replace function public.list_visible_collections_v1(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  collection_id uuid,
  owner_user_id uuid,
  slug text,
  title text,
  description text,
  kind catalog.collection_kind,
  visibility catalog.collection_visibility,
  card_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = public, catalog, social
as $$
  with vis as (
    select c.*
    from catalog.collections c
    where c.is_archived = false
      and (
        c.visibility in ('system', 'public')
        or c.owner_user_id = auth.uid()
        or exists (
          select 1
          from social.collection_access ca
          where ca.collection_id = c.id
            and ca.grantee_user_id = auth.uid()
            and ca.revoked_at is null
        )
      )
  )
  select
    v.id as collection_id,
    v.owner_user_id,
    v.slug,
    v.title,
    v.description,
    v.kind,
    v.visibility,
    coalesce((select count(*) from catalog.collection_items ci where ci.collection_id = v.id), 0) as card_count,
    v.created_at,
    v.updated_at
  from vis v
  order by v.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.log_user_card_event_v1(
  p_card_id uuid,
  p_event_type learning.user_card_event_type,
  p_payload jsonb default '{}'::jsonb,
  p_client_event_id uuid default null,
  p_session_id uuid default null,
  p_rating smallint default null,
  p_fsrs_before jsonb default null,
  p_fsrs_after jsonb default null,
  p_event_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, learning, catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
  v_event_at timestamptz := coalesce(p_event_at, now());
  v_state learning.user_card_state_kind;
  v_due_at timestamptz;
  v_stability numeric;
  v_difficulty numeric;
  v_elapsed integer;
  v_scheduled integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into learning.user_cards (user_id, card_id)
  values (v_uid, p_card_id)
  on conflict (user_id, card_id) do nothing;

  if p_client_event_id is not null then
    select e.id
    into v_event_id
    from learning.user_card_events e
    where e.user_id = v_uid
      and e.client_event_id = p_client_event_id
    limit 1;

    if v_event_id is not null then
      return v_event_id;
    end if;
  end if;

  if p_event_type = 'reviewed' and p_fsrs_after is not null then
    v_state := coalesce((p_fsrs_after ->> 'state')::learning.user_card_state_kind, 'review');
    v_due_at := (p_fsrs_after ->> 'due_at')::timestamptz;
    v_stability := (p_fsrs_after ->> 'stability')::numeric;
    v_difficulty := (p_fsrs_after ->> 'difficulty')::numeric;
    v_elapsed := (p_fsrs_after ->> 'elapsed_days')::integer;
    v_scheduled := (p_fsrs_after ->> 'scheduled_days')::integer;

    update learning.user_cards
    set
      state = v_state,
      due_at = v_due_at,
      last_reviewed_at = v_event_at,
      stability = v_stability,
      difficulty = v_difficulty,
      elapsed_days = v_elapsed,
      scheduled_days = v_scheduled,
      reps = learning.user_cards.reps + 1,
      lapses = learning.user_cards.lapses + case when coalesce(p_rating, 5) < 3 then 1 else 0 end,
      updated_at = now()
    where user_id = v_uid
      and card_id = p_card_id;
  elsif p_event_type = 'seen' then
    update learning.user_cards
    set first_seen_at = coalesce(first_seen_at, v_event_at),
        updated_at = now()
    where user_id = v_uid
      and card_id = p_card_id;
  elsif p_event_type = 'added_to_learning' then
    update learning.user_cards
    set acquired_at = coalesce(acquired_at, v_event_at),
        state = case when state = 'new' then 'learning' else state end,
        due_at = coalesce(due_at, v_event_at),
        updated_at = now()
    where user_id = v_uid
      and card_id = p_card_id;
  elsif p_event_type = 'suspended' then
    update learning.user_cards
    set state = 'suspended',
        suspended_at = coalesce(suspended_at, v_event_at),
        updated_at = now()
    where user_id = v_uid
      and card_id = p_card_id;
  elsif p_event_type = 'unsuspended' then
    update learning.user_cards
    set state = case when state = 'suspended' then 'review' else state end,
        suspended_at = null,
        updated_at = now()
    where user_id = v_uid
      and card_id = p_card_id;
  elsif p_event_type = 'removed_from_learning' then
    update learning.user_cards
    set state = 'archived',
        archived_at = coalesce(archived_at, v_event_at),
        updated_at = now()
    where user_id = v_uid
      and card_id = p_card_id;
  end if;

  insert into learning.user_card_events (
    user_id,
    card_id,
    event_type,
    event_at,
    session_id,
    client_event_id,
    rating,
    payload,
    fsrs_before,
    fsrs_after
  )
  values (
    v_uid,
    p_card_id,
    p_event_type,
    v_event_at,
    p_session_id,
    p_client_event_id,
    p_rating,
    coalesce(p_payload, '{}'::jsonb),
    p_fsrs_before,
    p_fsrs_after
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.get_due_count_v1(
  p_collection_id uuid default null
)
returns integer
language sql
security invoker
set search_path = public, learning
as $$
  select count(*)::integer
  from learning.user_cards uc
  where uc.user_id = auth.uid()
    and uc.state in ('learning', 'review', 'relearning')
    and uc.due_at is not null
    and uc.due_at <= now()
    and uc.is_buried = false
    and (
      p_collection_id is null
      or uc.source_collection_id = p_collection_id
    );
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
language sql
security invoker
set search_path = public, learning, catalog
as $$
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
  where uc.user_id = auth.uid()
    and uc.state in ('learning', 'review', 'relearning')
    and uc.due_at is not null
    and uc.due_at <= now()
    and uc.is_buried = false
    and (
      p_collection_id is null
      or uc.source_collection_id = p_collection_id
    )
  order by uc.due_at asc, uc.card_id
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.start_review_session_v1(
  p_session_kind learning.review_session_kind default 'review',
  p_source_collection_id uuid default null,
  p_lease_minutes integer default 20
)
returns table (
  session_id uuid,
  lease_token text,
  leased_until timestamptz
)
language plpgsql
security invoker
set search_path = public, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_token text;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_until := now() + make_interval(mins => greatest(1, least(coalesce(p_lease_minutes, 20), 180)));

  insert into learning.review_sessions (
    user_id,
    session_kind,
    state,
    lease_token,
    leased_until,
    source_collection_id
  )
  values (
    v_uid,
    p_session_kind,
    'open',
    v_token,
    v_until,
    p_source_collection_id
  )
  returning id into v_id;

  return query select v_id, v_token, v_until;
end;
$$;

create or replace function public.submit_review_batch_v1(
  p_session_id uuid,
  p_reviews jsonb
)
returns table (
  processed_count integer,
  last_event_at timestamptz
)
language plpgsql
security invoker
set search_path = public, learning
as $$
declare
  v_uid uuid := auth.uid();
  v_processed integer := 0;
  v_last timestamptz := null;
  r record;
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
    perform public.log_user_card_event_v1(
      r.card_id,
      'reviewed'::learning.user_card_event_type,
      coalesce(r.payload, '{}'::jsonb),
      r.client_event_id,
      p_session_id,
      r.rating,
      r.fsrs_before,
      r.fsrs_after,
      coalesce(r.event_at, now())
    );
    v_processed := v_processed + 1;
    v_last := greatest(coalesce(v_last, '-infinity'::timestamptz), coalesce(r.event_at, now()));
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
$$;

create or replace function public.upsert_learning_path_progress_v1(
  p_first_visited_at timestamptz default null,
  p_step_one_choice progress.path_step_one_choice default null,
  p_step_one_completed_at timestamptz default null,
  p_primary_collection_started_at timestamptz default null
)
returns progress.learning_path_progress
language plpgsql
security invoker
set search_path = public, progress
as $$
declare
  v_uid uuid := auth.uid();
  v_row progress.learning_path_progress;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into progress.learning_path_progress (
    user_id,
    first_visited_at,
    step_one_choice,
    step_one_completed_at,
    primary_collection_started_at
  )
  values (
    v_uid,
    p_first_visited_at,
    p_step_one_choice,
    p_step_one_completed_at,
    p_primary_collection_started_at
  )
  on conflict (user_id) do update
  set
    first_visited_at = coalesce(progress.learning_path_progress.first_visited_at, excluded.first_visited_at),
    step_one_choice = coalesce(excluded.step_one_choice, progress.learning_path_progress.step_one_choice),
    step_one_completed_at = coalesce(excluded.step_one_completed_at, progress.learning_path_progress.step_one_completed_at),
    primary_collection_started_at = coalesce(excluded.primary_collection_started_at, progress.learning_path_progress.primary_collection_started_at),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
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
  where d = (current_date - (rn - 1));

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

create or replace function public.mark_milestone_notified_v1(
  p_milestone_key text
)
returns void
language plpgsql
security invoker
set search_path = public, progress
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update progress.user_milestones
  set notified_at = now(), updated_at = now()
  where user_id = v_uid
    and milestone_key = p_milestone_key;
end;
$$;

create or replace function public.get_progress_summary_v1(
  p_user_id uuid default null
)
returns table (
  user_id uuid,
  active_cards integer,
  due_cards integer,
  last_reviewed_at timestamptz,
  reviews_last_7d integer,
  new_cards_last_7d integer,
  time_spent_seconds_last_7d integer
)
language sql
security invoker
set search_path = public
as $$
  select
    ps.user_id,
    ps.active_cards,
    ps.due_cards,
    ps.last_reviewed_at,
    ps.reviews_last_7d,
    ps.new_cards_last_7d,
    ps.time_spent_seconds_last_7d
  from public.progress_summary_v1 ps
  where ps.user_id = coalesce(p_user_id, auth.uid());
$$;

create or replace function public.set_relationship_v1(
  p_target_user_id uuid,
  p_action text
)
returns social.relationships
language plpgsql
security invoker
set search_path = public, social, private
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_row social.relationships;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid target user';
  end if;

  v_low := private.user_pair_low(v_uid, p_target_user_id);
  v_high := private.user_pair_high(v_uid, p_target_user_id);

  if p_action = 'request' then
    insert into social.relationships (
      user_low_id,
      user_high_id,
      initiator_user_id,
      state,
      requested_at
    )
    values (v_low, v_high, v_uid, 'pending', now())
    on conflict (user_low_id, user_high_id) do update
    set
      initiator_user_id = excluded.initiator_user_id,
      state = 'pending',
      requested_at = now(),
      responded_at = null,
      accepted_at = null,
      blocked_at = null,
      removed_at = null,
      updated_at = now();
  elsif p_action = 'accept' then
    update social.relationships
    set
      state = 'accepted',
      responded_at = now(),
      accepted_at = now(),
      blocked_at = null,
      removed_at = null,
      updated_at = now()
    where user_low_id = v_low
      and user_high_id = v_high
      and state = 'pending'
      and initiator_user_id = p_target_user_id;
  elsif p_action = 'decline' then
    update social.relationships
    set
      state = 'declined',
      responded_at = now(),
      updated_at = now()
    where user_low_id = v_low
      and user_high_id = v_high
      and state = 'pending'
      and initiator_user_id = p_target_user_id;
  elsif p_action = 'block' then
    insert into social.relationships (
      user_low_id,
      user_high_id,
      initiator_user_id,
      state,
      requested_at,
      blocked_at
    )
    values (v_low, v_high, v_uid, 'blocked', now(), now())
    on conflict (user_low_id, user_high_id) do update
    set
      state = 'blocked',
      blocked_at = now(),
      updated_at = now();
  elsif p_action = 'remove' then
    update social.relationships
    set
      state = 'removed',
      removed_at = now(),
      updated_at = now()
    where user_low_id = v_low
      and user_high_id = v_high;
  else
    raise exception 'Unsupported relationship action: %', p_action;
  end if;

  select *
  into v_row
  from social.relationships
  where user_low_id = v_low
    and user_high_id = v_high;

  return v_row;
end;
$$;

create or replace function public.get_profile_connection_context_v1(
  p_profile_user_id uuid
)
returns table (
  is_self boolean,
  relationship_state social.relationship_state,
  initiator_user_id uuid
)
language sql
security invoker
set search_path = public, social, private
as $$
  with me as (
    select auth.uid() as uid
  ), pair as (
    select
      private.user_pair_low((select uid from me), p_profile_user_id) as low_id,
      private.user_pair_high((select uid from me), p_profile_user_id) as high_id
  )
  select
    ((select uid from me) = p_profile_user_id) as is_self,
    r.state as relationship_state,
    r.initiator_user_id
  from pair
  left join social.relationships r
    on r.user_low_id = pair.low_id
   and r.user_high_id = pair.high_id;
$$;

create or replace function public.create_thread_v1(
  p_thread_kind social.thread_kind,
  p_subject_kind social.thread_subject_kind,
  p_subject_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, social
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into social.threads (
    thread_kind,
    subject_kind,
    subject_id,
    created_by_user_id,
    metadata
  )
  values (
    p_thread_kind,
    p_subject_kind,
    p_subject_id,
    v_uid,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_message_v1(
  p_thread_id uuid,
  p_message_kind social.message_kind default 'text',
  p_body_text text default null,
  p_reply_to_message_id uuid default null,
  p_asset_kind social.asset_kind default null,
  p_asset_url text default null,
  p_asset_mime_type text default null,
  p_asset_duration_seconds integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, social
as $$
declare
  v_uid uuid := auth.uid();
  v_message_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into social.messages (
    thread_id,
    author_user_id,
    message_kind,
    body_text,
    reply_to_message_id,
    metadata
  )
  values (
    p_thread_id,
    v_uid,
    p_message_kind,
    p_body_text,
    p_reply_to_message_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_message_id;

  if p_asset_kind is not null and p_asset_url is not null then
    insert into social.message_assets (
      message_id,
      asset_kind,
      asset_url,
      mime_type,
      duration_seconds
    )
    values (
      v_message_id,
      p_asset_kind,
      p_asset_url,
      p_asset_mime_type,
      p_asset_duration_seconds
    );
  end if;

  return v_message_id;
end;
$$;

create or replace function public.list_thread_messages_v1(
  p_thread_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  message_id uuid,
  author_user_id uuid,
  message_kind social.message_kind,
  body_text text,
  reply_to_message_id uuid,
  metadata jsonb,
  created_at timestamptz,
  assets jsonb
)
language sql
security invoker
set search_path = public, social
as $$
  select
    m.id as message_id,
    m.author_user_id,
    m.message_kind,
    m.body_text,
    m.reply_to_message_id,
    m.metadata,
    m.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'asset_kind', a.asset_kind,
            'asset_url', a.asset_url,
            'mime_type', a.mime_type,
            'duration_seconds', a.duration_seconds
          )
        )
        from social.message_assets a
        where a.message_id = m.id
      ),
      '[]'::jsonb
    ) as assets
  from social.messages m
  where m.thread_id = p_thread_id
    and m.deleted_at is null
  order by m.created_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.upsert_reminder_preferences_v1(
  p_enabled boolean default null,
  p_email_enabled boolean default null,
  p_push_enabled boolean default null,
  p_in_app_enabled boolean default null,
  p_daily_target integer default null,
  p_reminder_time_local time default null,
  p_timezone text default null,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null,
  p_week_days smallint[] default null
)
returns reminder.preferences
language plpgsql
security invoker
set search_path = public, reminder
as $$
declare
  v_uid uuid := auth.uid();
  v_row reminder.preferences;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into reminder.preferences (
    user_id,
    enabled,
    email_enabled,
    push_enabled,
    in_app_enabled,
    daily_target,
    reminder_time_local,
    timezone,
    quiet_hours_start,
    quiet_hours_end,
    week_days
  )
  values (
    v_uid,
    coalesce(p_enabled, true),
    coalesce(p_email_enabled, true),
    coalesce(p_push_enabled, true),
    coalesce(p_in_app_enabled, true),
    coalesce(p_daily_target, 20),
    p_reminder_time_local,
    coalesce(p_timezone, 'UTC'),
    p_quiet_hours_start,
    p_quiet_hours_end,
    coalesce(p_week_days, array[1,2,3,4,5,6,7])
  )
  on conflict (user_id) do update
  set
    enabled = coalesce(excluded.enabled, reminder.preferences.enabled),
    email_enabled = coalesce(excluded.email_enabled, reminder.preferences.email_enabled),
    push_enabled = coalesce(excluded.push_enabled, reminder.preferences.push_enabled),
    in_app_enabled = coalesce(excluded.in_app_enabled, reminder.preferences.in_app_enabled),
    daily_target = coalesce(excluded.daily_target, reminder.preferences.daily_target),
    reminder_time_local = coalesce(excluded.reminder_time_local, reminder.preferences.reminder_time_local),
    timezone = coalesce(excluded.timezone, reminder.preferences.timezone),
    quiet_hours_start = coalesce(excluded.quiet_hours_start, reminder.preferences.quiet_hours_start),
    quiet_hours_end = coalesce(excluded.quiet_hours_end, reminder.preferences.quiet_hours_end),
    week_days = coalesce(excluded.week_days, reminder.preferences.week_days),
    updated_at = now()
  returning * into v_row;

  return v_row;
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

  update reminder.calendar_feeds
  set is_active = false
  where user_id = v_uid
    and scope = p_scope
    and coalesce(collection_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_collection_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and is_active = true;

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

create or replace function public.upsert_push_subscription_v1(
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, reminder
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into reminder.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_secret,
    user_agent,
    is_active,
    last_seen_at
  )
  values (
    v_uid,
    p_endpoint,
    p_p256dh,
    p_auth_secret,
    p_user_agent,
    true,
    now()
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent,
    is_active = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.delete_push_subscription_v1(
  p_endpoint text
)
returns boolean
language plpgsql
security invoker
set search_path = public, reminder
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update reminder.push_subscriptions
  set is_active = false,
      updated_at = now()
  where endpoint = p_endpoint
    and user_id = v_uid;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.upsert_user_card_media_v1(
  p_card_id uuid,
  p_media_kind media.media_kind,
  p_media_url text,
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, media
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into media.user_card_media (
    user_id,
    card_id,
    media_kind,
    media_url,
    source,
    metadata
  )
  values (
    v_uid,
    p_card_id,
    p_media_kind,
    p_media_url,
    p_source,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, card_id, media_kind, media_url) do update
  set
    source = coalesce(excluded.source, media.user_card_media.source),
    metadata = media.user_card_media.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_id;

  perform public.log_user_card_event_v1(
    p_card_id,
    'media_attached'::learning.user_card_event_type,
    jsonb_build_object('media_id', v_id, 'media_kind', p_media_kind::text, 'media_url', p_media_url),
    null,
    null,
    null,
    null,
    null,
    now()
  );

  return v_id;
end;
$$;
