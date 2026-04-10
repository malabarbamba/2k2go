-- Baseline v1 data migration: foundation_deck -> canonical cards

do $$
declare
  v_collection_id uuid;
begin
  insert into catalog.collections (
    slug,
    title,
    description,
    kind,
    visibility,
    owner_user_id,
    metadata
  )
  select
    'foundation-core',
    'Foundation Core',
    'System foundation vocabulary deck',
    'system_foundation'::catalog.collection_kind,
    'system'::catalog.collection_visibility,
    null,
    jsonb_build_object('system_key', 'foundation-core')
  where not exists (
    select 1 from catalog.collections c where lower(c.slug) = 'foundation-core'
  );

  select c.id
  into v_collection_id
  from catalog.collections c
  where lower(c.slug) = 'foundation-core'
  limit 1;

  if to_regclass('public.foundation_deck') is null then
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
    frequency_rank,
    theme_key,
    metadata,
    created_at,
    updated_at
  )
  select
    null,
    'vocabulary'::catalog.card_kind,
    fd.word_ar,
    fd.word_fr,
    fd.transliteration,
    fd.example_sentence_ar,
    fd.example_sentence_fr,
    fd.frequency_rank,
    fd.category,
    jsonb_build_object('category', fd.category),
    coalesce(fd.created_at, now()),
    coalesce(fd.created_at, now())
  from (
    select
      fd.*,
      row_number() over (
        partition by
          private.normalize_arabic(fd.word_ar),
          coalesce(private.normalize_text(fd.word_fr), ''),
          coalesce(private.normalize_text(fd.transliteration), '')
        order by fd.created_at nulls last, fd.id
      ) as rn
    from public.foundation_deck fd
  ) fd
  left join catalog.cards c
    on c.owner_user_id is null
   and c.normalized_term = private.normalize_arabic(fd.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(fd.word_fr), '')
   and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(fd.transliteration), '')
   and c.is_active = true
  where c.id is null
    and fd.rn = 1;

  insert into catalog.card_origins (
    card_id,
    origin_kind,
    source_table,
    source_id,
    source_payload
  )
  select
    c.id,
    'foundation_seed'::catalog.origin_kind,
    'foundation_deck',
    fd.id::text,
    jsonb_build_object(
      'frequency_rank', fd.frequency_rank,
      'category', fd.category
    )
  from public.foundation_deck fd
  join catalog.cards c
    on c.owner_user_id is null
   and c.normalized_term = private.normalize_arabic(fd.word_ar)
   and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(fd.word_fr), '')
   and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(fd.transliteration), '')
  on conflict (origin_kind, source_table, source_id) do nothing;

  insert into catalog.collection_items (
    collection_id,
    card_id,
    position,
    item_metadata
  )
  select
    v_collection_id,
    x.card_id,
    x.position,
    x.item_metadata
  from (
    select distinct on (c.id)
      c.id as card_id,
      coalesce(fd.frequency_rank, 999999) as position,
      jsonb_build_object(
        'frequency_rank', fd.frequency_rank,
        'category', fd.category
      ) as item_metadata
    from public.foundation_deck fd
    join catalog.cards c
      on c.owner_user_id is null
     and c.normalized_term = private.normalize_arabic(fd.word_ar)
     and coalesce(c.normalized_translation, '') = coalesce(private.normalize_text(fd.word_fr), '')
     and coalesce(c.normalized_transliteration, '') = coalesce(private.normalize_text(fd.transliteration), '')
    order by c.id, coalesce(fd.frequency_rank, 999999), fd.id
  ) x
  on conflict (collection_id, card_id) do update
  set
    position = excluded.position,
    item_metadata = excluded.item_metadata;
end
$$;
