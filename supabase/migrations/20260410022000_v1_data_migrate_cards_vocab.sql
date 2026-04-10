-- Baseline v1 data migration: vocabulary_cards + videos

do $$
begin
  if to_regclass('public.videos') is not null then
    insert into catalog.videos (
      id,
      youtube_video_id,
      title,
      description,
      channel_name,
      language_code,
      dialect,
      duration_seconds,
      visibility,
      metadata,
      created_at,
      updated_at
    )
    select
      v.id,
      null,
      coalesce(
        nullif(to_jsonb(v) ->> 'title', ''),
        nullif(to_jsonb(v) ->> 'name', ''),
        left(coalesce(v.description, 'Video ' || v.id::text), 120)
      ),
      v.description,
      v.author,
      'ar',
      v.dialect,
      v.duration,
      case when coalesce(v.is_published, false) then 'public'::catalog.video_visibility else 'private'::catalog.video_visibility end,
      jsonb_build_object(
        'category', v.category,
        'video_url', v.video_url,
        'thumbnail_url', v.thumbnail_url,
        'subtitles_generated', coalesce(v.subtitles_generated, false),
        'cards_generated', coalesce(v.cards_generated, false)
      ),
      coalesce(v.created_at, now()),
      coalesce(v.updated_at, coalesce(v.created_at, now()))
    from public.videos v
    on conflict (id) do update
    set
      title = excluded.title,
      description = excluded.description,
      channel_name = excluded.channel_name,
      dialect = excluded.dialect,
      duration_seconds = excluded.duration_seconds,
      visibility = excluded.visibility,
      metadata = excluded.metadata,
      updated_at = greatest(catalog.videos.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.video_subtitle_payloads') is not null then
    insert into catalog.video_subtitle_tracks (
      video_id,
      language_code,
      provider,
      is_primary,
      cues,
      version,
      created_at,
      updated_at
    )
    select
      vsp.video_id,
      coalesce(to_jsonb(vsp) ->> 'language_code', 'ar'),
      nullif(to_jsonb(vsp) ->> 'provider', ''),
      coalesce((to_jsonb(vsp) ->> 'is_primary')::boolean, false),
      coalesce(to_jsonb(vsp) -> 'payload', '[]'::jsonb),
      coalesce((to_jsonb(vsp) ->> 'version')::integer, 1),
      coalesce(vsp.created_at, now()),
      coalesce(vsp.updated_at, coalesce(vsp.created_at, now()))
    from public.video_subtitle_payloads vsp
    where exists (select 1 from catalog.videos v where v.id = vsp.video_id)
    on conflict (video_id, language_code, version) do update
    set
      provider = excluded.provider,
      is_primary = excluded.is_primary,
      cues = excluded.cues,
      updated_at = greatest(catalog.video_subtitle_tracks.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.vocabulary_cards') is null then
    return;
  end if;

  insert into catalog.cards (
    owner_user_id,
    card_kind,
    term,
    translation,
    transliteration,
    example_term,
    example_translation,
    difficulty,
    theme_key,
    image_url,
    audio_url,
    sentence_audio_url,
    metadata,
    created_at,
    updated_at
  )
  select
    null,
    'vocabulary'::catalog.card_kind,
    vc.word_ar,
    vc.word_fr,
    vc.transliteration,
    vc.example_sentence_ar,
    vc.example_sentence_fr,
    null,
    vc.theme_id::text,
    vc.image_url,
    vc.audio_url,
    vc.sentence_audio_url,
    jsonb_build_object(
      'category', vc.category,
      'difficulty_raw', vc.difficulty,
      'lexicon_entry_id', vc.lexicon_entry_id
    ),
    coalesce(vc.created_at, now()),
    coalesce(vc.created_at, now())
  from (
    select
      vc.*,
      row_number() over (
        partition by
          private.normalize_arabic(vc.word_ar),
          coalesce(private.normalize_text(vc.word_fr), ''),
          coalesce(private.normalize_text(vc.transliteration), '')
        order by vc.created_at nulls last, vc.id
      ) as rn
    from public.vocabulary_cards vc
  ) vc
  left join catalog.cards c
    on c.owner_user_id is null
   and c.normalized_term = private.normalize_arabic(vc.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(vc.word_fr), '')
   and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(vc.transliteration), '')
   and c.is_active = true
  where c.id is null
    and vc.rn = 1;

  update catalog.cards c
  set
    transliteration = coalesce(c.transliteration, vc.transliteration),
    example_term = coalesce(c.example_term, vc.example_sentence_ar),
    example_translation = coalesce(c.example_translation, vc.example_sentence_fr),
    theme_key = coalesce(c.theme_key, vc.theme_id::text),
    image_url = coalesce(c.image_url, vc.image_url),
    audio_url = coalesce(c.audio_url, vc.audio_url),
    sentence_audio_url = coalesce(c.sentence_audio_url, vc.sentence_audio_url),
    metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_strip_nulls(
      jsonb_build_object(
        'category', vc.category,
        'difficulty_raw', vc.difficulty,
        'lexicon_entry_id', vc.lexicon_entry_id
      )
    ),
    updated_at = now()
  from public.vocabulary_cards vc
  where c.owner_user_id is null
    and c.normalized_term = private.normalize_arabic(vc.word_ar)
    and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(vc.word_fr), '')
    and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(vc.transliteration), '');

  insert into catalog.card_origins (
    card_id,
    origin_kind,
    source_table,
    source_id,
    source_payload
  )
  select
    c.id,
    'video_extracted'::catalog.origin_kind,
    'vocabulary_cards',
    vc.id::text,
    jsonb_strip_nulls(
      jsonb_build_object(
        'video_id', vc.video_id,
        'category', vc.category,
        'difficulty_raw', vc.difficulty,
        'theme_id', vc.theme_id,
        'lexicon_entry_id', vc.lexicon_entry_id
      )
    )
  from public.vocabulary_cards vc
  join catalog.cards c
    on c.owner_user_id is null
   and c.normalized_term = private.normalize_arabic(vc.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(vc.word_fr), '')
   and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(vc.transliteration), '')
  on conflict (origin_kind, source_table, source_id) do nothing;

  insert into catalog.card_video_links (
    card_id,
    video_id,
    metadata
  )
  select
    c.id,
    vc.video_id,
    jsonb_build_object('source', 'vocabulary_cards.video_id')
  from public.vocabulary_cards vc
  join catalog.cards c
    on c.owner_user_id is null
   and c.normalized_term = private.normalize_arabic(vc.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(vc.word_fr), '')
   and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(vc.transliteration), '')
  where vc.video_id is not null
    and exists (select 1 from catalog.videos v where v.id = vc.video_id)
  on conflict do nothing;

  if to_regclass('public.vocabulary_card_videos') is not null then
    insert into catalog.card_video_links (
      card_id,
      video_id,
      metadata
    )
    select
      c.id,
      vcv.video_id,
      jsonb_build_object('source', 'vocabulary_card_videos')
    from public.vocabulary_card_videos vcv
    join catalog.card_origins o
      on o.origin_kind = 'video_extracted'::catalog.origin_kind
     and o.source_table = 'vocabulary_cards'
     and o.source_id = vcv.vocabulary_card_id::text
    join catalog.cards c on c.id = o.card_id
    where exists (select 1 from catalog.videos v where v.id = vcv.video_id)
    on conflict do nothing;
  end if;
end
$$;
