create extension if not exists pgcrypto with schema extensions;
create table if not exists public.preview_session_text_messages (
	id uuid primary key default extensions.gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	vocabulary_card_id uuid null references public.vocabulary_cards(id) on delete cascade,
	foundation_card_id uuid null references public.foundation_deck(id) on delete cascade,
	message_text text not null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint preview_session_text_messages_card_xor_check check (
		num_nonnulls(vocabulary_card_id, foundation_card_id) = 1
	),
	constraint preview_session_text_messages_message_text_check check (
		char_length(btrim(message_text)) > 0
	)
);
create table if not exists public.preview_session_audio_posts (
	id uuid primary key default extensions.gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	vocabulary_card_id uuid null references public.vocabulary_cards(id) on delete cascade,
	foundation_card_id uuid null references public.foundation_deck(id) on delete cascade,
	audio_storage_path text not null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint preview_session_audio_posts_card_xor_check check (
		num_nonnulls(vocabulary_card_id, foundation_card_id) = 1
	),
	constraint preview_session_audio_posts_audio_storage_path_check check (
		char_length(btrim(audio_storage_path)) > 0
	),
	constraint preview_session_audio_posts_owner_path_check check (
		split_part(audio_storage_path, '/', 1) = user_id::text
	),
	constraint preview_session_audio_posts_scope_path_check check (
		audio_storage_path like (user_id::text || '/audio-posts/%')
	)
);
create table if not exists public.preview_session_audio_replies (
	id uuid primary key default extensions.gen_random_uuid(),
	audio_post_id uuid not null references public.preview_session_audio_posts(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	body_text text null,
	audio_storage_path text null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint preview_session_audio_replies_body_or_audio_check check (
		coalesce(char_length(btrim(body_text)), 0) > 0
		or coalesce(char_length(btrim(audio_storage_path)), 0) > 0
	),
	constraint preview_session_audio_replies_owner_path_check check (
		audio_storage_path is null
		or split_part(audio_storage_path, '/', 1) = user_id::text
	),
	constraint preview_session_audio_replies_scope_path_check check (
		audio_storage_path is null
		or audio_storage_path like (user_id::text || '/audio-replies/%')
	)
);
create index if not exists idx_preview_session_text_messages_vocabulary_card_created_at
	on public.preview_session_text_messages (vocabulary_card_id, created_at asc)
	where vocabulary_card_id is not null and foundation_card_id is null;
create index if not exists idx_preview_session_text_messages_foundation_card_created_at
	on public.preview_session_text_messages (foundation_card_id, created_at asc)
	where foundation_card_id is not null and vocabulary_card_id is null;
create unique index if not exists idx_preview_session_audio_posts_user_vocabulary_card_unique
	on public.preview_session_audio_posts (user_id, vocabulary_card_id)
	where vocabulary_card_id is not null and foundation_card_id is null;
create unique index if not exists idx_preview_session_audio_posts_user_foundation_card_unique
	on public.preview_session_audio_posts (user_id, foundation_card_id)
	where foundation_card_id is not null and vocabulary_card_id is null;
create index if not exists idx_preview_session_audio_posts_vocabulary_card_updated_at
	on public.preview_session_audio_posts (vocabulary_card_id, updated_at desc)
	where vocabulary_card_id is not null and foundation_card_id is null;
create index if not exists idx_preview_session_audio_posts_foundation_card_updated_at
	on public.preview_session_audio_posts (foundation_card_id, updated_at desc)
	where foundation_card_id is not null and vocabulary_card_id is null;
create unique index if not exists idx_preview_session_audio_posts_audio_storage_path_unique
	on public.preview_session_audio_posts (audio_storage_path);
create index if not exists idx_preview_session_audio_replies_audio_post_created_at
	on public.preview_session_audio_replies (audio_post_id, created_at asc);
create unique index if not exists idx_preview_session_audio_replies_audio_storage_path_unique
	on public.preview_session_audio_replies (audio_storage_path)
	where audio_storage_path is not null;
create or replace function public.preview_session_discussions_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	new.updated_at = timezone('utc', now());
	return new;
end;
$$;
drop trigger if exists preview_session_text_messages_set_updated_at_tg
	on public.preview_session_text_messages;
create trigger preview_session_text_messages_set_updated_at_tg
	before update on public.preview_session_text_messages
	for each row
	execute function public.preview_session_discussions_set_updated_at();
drop trigger if exists preview_session_audio_posts_set_updated_at_tg
	on public.preview_session_audio_posts;
create trigger preview_session_audio_posts_set_updated_at_tg
	before update on public.preview_session_audio_posts
	for each row
	execute function public.preview_session_discussions_set_updated_at();
drop trigger if exists preview_session_audio_replies_set_updated_at_tg
	on public.preview_session_audio_replies;
create trigger preview_session_audio_replies_set_updated_at_tg
	before update on public.preview_session_audio_replies
	for each row
	execute function public.preview_session_discussions_set_updated_at();
alter table public.preview_session_text_messages enable row level security;
alter table public.preview_session_audio_posts enable row level security;
alter table public.preview_session_audio_replies enable row level security;
drop policy if exists "Preview session text messages read" on public.preview_session_text_messages;
drop policy if exists "Preview session text messages insert" on public.preview_session_text_messages;
create policy "Preview session text messages read"
	on public.preview_session_text_messages
	for select
	to authenticated
	using ((select auth.uid()) is not null);
create policy "Preview session text messages insert"
	on public.preview_session_text_messages
	for insert
	to authenticated
	with check (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
	);
drop policy if exists "Preview session audio posts read" on public.preview_session_audio_posts;
drop policy if exists "Preview session audio posts insert" on public.preview_session_audio_posts;
drop policy if exists "Preview session audio posts update" on public.preview_session_audio_posts;
drop policy if exists "Preview session audio posts delete" on public.preview_session_audio_posts;
create policy "Preview session audio posts read"
	on public.preview_session_audio_posts
	for select
	to authenticated
	using ((select auth.uid()) is not null);
create policy "Preview session audio posts insert"
	on public.preview_session_audio_posts
	for insert
	to authenticated
	with check (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
	);
create policy "Preview session audio posts update"
	on public.preview_session_audio_posts
	for update
	to authenticated
	using (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
	)
	with check (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
	);
create policy "Preview session audio posts delete"
	on public.preview_session_audio_posts
	for delete
	to authenticated
	using (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
	);
drop policy if exists "Preview session audio replies read" on public.preview_session_audio_replies;
drop policy if exists "Preview session audio replies insert" on public.preview_session_audio_replies;
create policy "Preview session audio replies read"
	on public.preview_session_audio_replies
	for select
	to authenticated
	using (
		(select auth.uid()) is not null
		and exists (
			select 1
			from public.preview_session_audio_posts audio_post
			where audio_post.id = preview_session_audio_replies.audio_post_id
				and (
					preview_session_audio_replies.user_id = (select auth.uid())
					or audio_post.user_id = (select auth.uid())
				)
		)
	);
create policy "Preview session audio replies insert"
	on public.preview_session_audio_replies
	for insert
	to authenticated
	with check (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
		and exists (
			select 1
			from public.preview_session_audio_posts audio_post
			where audio_post.id = preview_session_audio_replies.audio_post_id
		)
	);
create or replace function public.enqueue_preview_session_audio_reply_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	audio_post_record public.preview_session_audio_posts%rowtype;
	reply_author_display_name text;
begin
	select *
	into audio_post_record
	from public.preview_session_audio_posts
	where id = new.audio_post_id;

	if audio_post_record.id is null then
		return new;
	end if;

	if audio_post_record.user_id = new.user_id then
		return new;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		)
	into reply_author_display_name
	from public.profiles p
	where p.user_id = new.user_id;

	reply_author_display_name := coalesce(reply_author_display_name, 'Quelqu''un');

	insert into public.user_notifications (
		user_id,
		category,
		notification_type,
		title,
		body,
		payload_json
	)
	values (
		audio_post_record.user_id,
		'for-me',
		'preview_session_audio_reply_received',
		'Nouvelle reponse privee',
		reply_author_display_name || ' a envoye une reponse privee a ton audio.',
		jsonb_build_object(
			'actionLabel', 'Ouvrir la session',
			'actionUrl', '/app/session',
			'actorDisplayName', reply_author_display_name,
			'entityId', new.id,
			'entityType', 'preview_session_audio_reply',
			'replyId', new.id,
			'audioPostId', audio_post_record.id,
			'vocabularyCardId', audio_post_record.vocabulary_card_id,
			'foundationCardId', audio_post_record.foundation_card_id
		)
	);

	return new;
end;
$$;
drop trigger if exists preview_session_audio_reply_notification_insert_tg
	on public.preview_session_audio_replies;
create trigger preview_session_audio_reply_notification_insert_tg
	after insert on public.preview_session_audio_replies
	for each row
	execute function public.enqueue_preview_session_audio_reply_notification();
insert into storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
values (
	'preview-session-discussion-audio',
	'preview-session-discussion-audio',
	false,
	10485760,
	array[
		'audio/webm',
		'audio/ogg',
		'audio/mpeg',
		'audio/mp3',
		'audio/mp4',
		'audio/x-m4a',
		'audio/aac',
		'audio/wav',
		'audio/x-wav'
	]::text[]
)
on conflict (id) do update
set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Preview session discussion audio read" on storage.objects;
drop policy if exists "Preview session discussion audio upload" on storage.objects;
drop policy if exists "Preview session discussion audio update" on storage.objects;
drop policy if exists "Preview session discussion audio delete" on storage.objects;
create policy "Preview session discussion audio read"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'preview-session-discussion-audio'
		and (select auth.uid()) is not null
		and (
			exists (
				select 1
				from public.preview_session_audio_posts audio_post
				where audio_post.audio_storage_path = storage.objects.name
			)
			or exists (
				select 1
				from public.preview_session_audio_replies audio_reply
				join public.preview_session_audio_posts audio_post
					on audio_post.id = audio_reply.audio_post_id
				where audio_reply.audio_storage_path = storage.objects.name
					and (
						audio_reply.user_id = (select auth.uid())
						or audio_post.user_id = (select auth.uid())
					)
			)
		)
	);
create policy "Preview session discussion audio upload"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'preview-session-discussion-audio'
		and (select auth.uid()) is not null
		and split_part(name, '/', 1) = (select auth.uid())::text
	);
create policy "Preview session discussion audio update"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'preview-session-discussion-audio'
		and (select auth.uid()) is not null
		and split_part(name, '/', 1) = (select auth.uid())::text
	)
	with check (
		bucket_id = 'preview-session-discussion-audio'
		and (select auth.uid()) is not null
		and split_part(name, '/', 1) = (select auth.uid())::text
	);
create policy "Preview session discussion audio delete"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'preview-session-discussion-audio'
		and (select auth.uid()) is not null
		and split_part(name, '/', 1) = (select auth.uid())::text
	);
notify pgrst, 'reload schema';
