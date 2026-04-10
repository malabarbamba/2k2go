-- Baseline v1 data migration: legacy user_cards -> canonical cards

do $$
begin
  if to_regclass('public.user_cards') is null then
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
    'legacy-user-cards-' || replace(u.user_id::text, '-', ''),
    'Legacy personal cards',
    'Auto-migrated legacy user_cards entries',
    'user_private'::catalog.collection_kind,
    'private'::catalog.collection_visibility,
    jsonb_build_object('source', 'user_cards')
  from (
    select distinct user_id
    from public.user_cards
    where user_id is not null
  ) u
  where not exists (
    select 1
    from catalog.collections c
    where c.owner_user_id = u.user_id
      and c.slug = 'legacy-user-cards-' || replace(u.user_id::text, '-', '')
  );

  insert into catalog.cards (
    owner_user_id,
    card_kind,
    term,
    translation,
    transliteration,
    example_term,
    example_translation,
    difficulty,
    metadata,
    created_at,
    updated_at
  )
  select
    uc.user_id,
    'vocabulary'::catalog.card_kind,
    coalesce(nullif(uc.vocab_base, ''), uc.vocab_full),
    null,
    null,
    coalesce(nullif(uc.sent_base, ''), uc.sent_full),
    null,
    uc.difficulty,
    jsonb_strip_nulls(
      jsonb_build_object(
        'legacy_vocab_full', uc.vocab_full,
        'legacy_sent_full', uc.sent_full,
        'category', uc.category,
        'subcategory', uc.subcategory
      )
    ),
    coalesce(uc.created_at, now()),
    coalesce(uc.updated_at, coalesce(uc.created_at, now()))
  from (
    select
      uc.*,
      row_number() over (
        partition by
          uc.user_id,
          private.normalize_arabic(coalesce(nullif(uc.vocab_base, ''), uc.vocab_full))
        order by uc.created_at nulls last, uc.id
      ) as rn
    from public.user_cards uc
    where uc.user_id is not null
  ) uc
  left join catalog.cards c
    on c.owner_user_id = uc.user_id
   and c.normalized_term = private.normalize_arabic(coalesce(nullif(uc.vocab_base, ''), uc.vocab_full))
   and c.is_active = true
   and c.normalized_translation is null
  where c.id is null
    and uc.rn = 1;

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
    'legacy_user_card'::catalog.origin_kind,
    'user_cards',
    uc.id::text,
    uc.user_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'legacy_vocab_full', uc.vocab_full,
        'legacy_sent_full', uc.sent_full,
        'category', uc.category,
        'subcategory', uc.subcategory,
        'difficulty', uc.difficulty
      )
    )
  from public.user_cards uc
  join catalog.cards c
    on c.owner_user_id = uc.user_id
   and c.normalized_term = private.normalize_arabic(coalesce(nullif(uc.vocab_base, ''), uc.vocab_full))
   and c.normalized_translation is null
  on conflict (origin_kind, source_table, source_id) do nothing;

  insert into catalog.collection_items (
    collection_id,
    card_id,
    position,
    item_metadata
  )
  select
    col.id,
    c.id,
    row_number() over (partition by uc.user_id order by coalesce(uc.created_at, now()), uc.id),
    jsonb_build_object('source', 'user_cards')
  from public.user_cards uc
  join catalog.cards c
    on c.owner_user_id = uc.user_id
   and c.normalized_term = private.normalize_arabic(coalesce(nullif(uc.vocab_base, ''), uc.vocab_full))
   and c.normalized_translation is null
  join catalog.collections col
    on col.owner_user_id = uc.user_id
   and col.slug = 'legacy-user-cards-' || replace(uc.user_id::text, '-', '')
  on conflict (collection_id, card_id) do nothing;
end
$$;
