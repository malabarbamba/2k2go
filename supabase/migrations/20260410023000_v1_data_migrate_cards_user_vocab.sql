-- Baseline v1 data migration: user_vocabulary_cards -> canonical cards

do $$
begin
  if to_regclass('public.user_vocabulary_cards') is null then
    return;
  end if;

  insert into catalog.collections (
    owner_user_id,
    slug,
    title,
    description,
    kind,
    visibility,
    metadata
  )
  select
    u.user_id,
    'user-import-' || replace(u.user_id::text, '-', ''),
    'Imported cards',
    'Auto-migrated user imported cards',
    'user_import'::catalog.collection_kind,
    'private'::catalog.collection_visibility,
    jsonb_build_object('source', 'user_vocabulary_cards')
  from (
    select distinct user_id
    from public.user_vocabulary_cards
    where user_id is not null
  ) u
  where not exists (
    select 1
    from catalog.collections c
    where c.owner_user_id = u.user_id
      and c.kind = 'user_import'::catalog.collection_kind
      and c.visibility = 'private'::catalog.collection_visibility
  );

  insert into catalog.cards (
    owner_user_id,
    card_kind,
    term,
    translation,
    transliteration,
    example_term,
    example_translation,
    metadata,
    created_at,
    updated_at
  )
  select
    uvc.user_id,
    'vocabulary'::catalog.card_kind,
    uvc.word_ar,
    uvc.translation_fr,
    null,
    uvc.example_sentence_ar,
    null,
    jsonb_strip_nulls(
      jsonb_build_object(
        'legacy_source', uvc.source,
        'status', uvc.status::text,
        'visibility', uvc.visibility::text,
        'canonical_vocabulary_card_id', uvc.canonical_vocabulary_card_id
      )
    ),
    coalesce(uvc.created_at, now()),
    coalesce(uvc.updated_at, coalesce(uvc.created_at, now()))
  from (
    select
      uvc.*,
      row_number() over (
        partition by
          uvc.user_id,
          private.normalize_arabic(uvc.word_ar),
          coalesce(private.normalize_text(uvc.translation_fr), '')
        order by uvc.created_at nulls last, uvc.id
      ) as rn
    from public.user_vocabulary_cards uvc
    where uvc.user_id is not null
  ) uvc
  left join catalog.cards c
    on c.owner_user_id = uvc.user_id
   and c.normalized_term = private.normalize_arabic(uvc.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(uvc.translation_fr), '')
   and c.is_active = true
  where c.id is null
    and uvc.rn = 1;

  update catalog.cards c
  set
    example_term = coalesce(c.example_term, uvc.example_sentence_ar),
    metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_strip_nulls(
      jsonb_build_object(
        'legacy_source', uvc.source,
        'status', uvc.status::text,
        'visibility', uvc.visibility::text,
        'canonical_vocabulary_card_id', uvc.canonical_vocabulary_card_id
      )
    ),
    updated_at = now()
  from public.user_vocabulary_cards uvc
  where c.owner_user_id = uvc.user_id
    and c.normalized_term = private.normalize_arabic(uvc.word_ar)
    and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(uvc.translation_fr), '');

  insert into catalog.card_origins (
    card_id,
    origin_kind,
    source_table,
    source_id,
    source_user_id,
    source_payload
  )
  select
    c.id,
    'user_import'::catalog.origin_kind,
    'user_vocabulary_cards',
    uvc.id::text,
    uvc.user_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'legacy_source', uvc.source,
        'status', uvc.status::text,
        'visibility', uvc.visibility::text,
        'canonical_vocabulary_card_id', uvc.canonical_vocabulary_card_id,
        'ready_at', uvc.ready_at
      )
    )
  from public.user_vocabulary_cards uvc
  join catalog.cards c
    on c.owner_user_id = uvc.user_id
   and c.normalized_term = private.normalize_arabic(uvc.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(uvc.translation_fr), '')
  on conflict (origin_kind, source_table, source_id) do nothing;

  insert into catalog.collection_items (
    collection_id,
    card_id,
    position,
    item_metadata
  )
  select
    c2.id,
    c.id,
    row_number() over (partition by uvc.user_id order by coalesce(uvc.created_at, now()), uvc.id),
    jsonb_build_object('source', 'user_vocabulary_cards')
  from public.user_vocabulary_cards uvc
  join catalog.cards c
    on c.owner_user_id = uvc.user_id
   and c.normalized_term = private.normalize_arabic(uvc.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(uvc.translation_fr), '')
  join catalog.collections c2
    on c2.owner_user_id = uvc.user_id
   and c2.kind = 'user_import'::catalog.collection_kind
  on conflict (collection_id, card_id) do nothing;
end
$$;
