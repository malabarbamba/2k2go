alter table if exists public.vocabulary_cards
	add column if not exists image_url text,
	add column if not exists sentence_audio_url text;
alter table if exists public.user_vocabulary_card_media
	add column if not exists hide_image boolean not null default false,
	add column if not exists hide_audio boolean not null default false,
	add column if not exists hide_sentence_audio boolean not null default false;
