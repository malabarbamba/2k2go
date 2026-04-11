create extension if not exists pgcrypto with schema extensions;

create table if not exists public.preview_session_text_messages (
	id uuid primary key default extensions.gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	vocabulary_card_id uuid null,
	foundation_card_id uuid null,
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
	vocabulary_card_id uuid null,
	foundation_card_id uuid null,
	audio_storage_path text not null,
	recording_duration_ms integer null,
	share_selected boolean not null default false,
	share_session_key text null,
	share_marked_at timestamptz null,
	share_dispatched_at timestamptz null,
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
	audio_duration_ms integer null,
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

create table if not exists public.preview_session_audio_share_dispatches (
	id uuid primary key default extensions.gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	session_key text not null,
	shared_audio_count integer not null default 0,
	notified_friend_count integer not null default 0,
	dispatched_at timestamptz not null default timezone('utc', now()),
	constraint preview_session_audio_share_dispatches_session_key_check check (
		char_length(btrim(session_key)) > 0
	),
	constraint preview_session_audio_share_dispatches_counts_check check (
		shared_audio_count >= 0 and notified_friend_count >= 0
	),
	constraint preview_session_audio_share_dispatches_user_session_unique unique (
		user_id,
		session_key
	)
);

alter table public.preview_session_audio_posts
	add column if not exists recording_duration_ms integer null,
	add column if not exists share_selected boolean not null default false,
	add column if not exists share_session_key text null,
	add column if not exists share_marked_at timestamptz null,
	add column if not exists share_dispatched_at timestamptz null;

alter table public.preview_session_audio_replies
	add column if not exists audio_duration_ms integer null;

update public.preview_session_audio_posts
set recording_duration_ms = 5000
where recording_duration_ms > 5000;

update public.preview_session_audio_replies
set audio_duration_ms = 5000
where audio_duration_ms > 5000;

alter table public.preview_session_audio_posts
	drop constraint if exists preview_session_audio_posts_recording_duration_ms_check;

alter table public.preview_session_audio_posts
	add constraint preview_session_audio_posts_recording_duration_ms_check check (
		recording_duration_ms is null
		or (recording_duration_ms > 0 and recording_duration_ms <= 5000)
	);

alter table public.preview_session_audio_replies
	drop constraint if exists preview_session_audio_replies_audio_duration_ms_check;

alter table public.preview_session_audio_replies
	add constraint preview_session_audio_replies_audio_duration_ms_check check (
		audio_duration_ms is null
		or (audio_duration_ms > 0 and audio_duration_ms <= 5000)
	);

alter table public.preview_session_audio_replies
	drop constraint if exists preview_session_audio_replies_body_text_length_check;

alter table public.preview_session_audio_replies
	add constraint preview_session_audio_replies_body_text_length_check check (
		body_text is null or char_length(btrim(body_text)) <= 70
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

create index if not exists idx_preview_session_audio_posts_user_share_selected_session
	on public.preview_session_audio_posts (user_id, share_session_key, updated_at desc)
	where share_selected = true;

create index if not exists idx_preview_session_audio_replies_audio_post_created_at
	on public.preview_session_audio_replies (audio_post_id, created_at asc);

create unique index if not exists idx_preview_session_audio_replies_audio_storage_path_unique
	on public.preview_session_audio_replies (audio_storage_path)
	where audio_storage_path is not null;

create unique index if not exists idx_preview_session_audio_replies_audio_post_user_unique
	on public.preview_session_audio_replies (audio_post_id, user_id);

create index if not exists idx_preview_session_audio_share_dispatches_user_dispatched
	on public.preview_session_audio_share_dispatches (user_id, dispatched_at desc);

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
alter table public.preview_session_audio_share_dispatches enable row level security;

drop policy if exists "Preview session text messages read" on public.preview_session_text_messages;
drop policy if exists "Preview session text messages insert" on public.preview_session_text_messages;
drop policy if exists "Preview session text messages update" on public.preview_session_text_messages;
drop policy if exists "Preview session text messages delete" on public.preview_session_text_messages;

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

create policy "Preview session text messages update"
	on public.preview_session_text_messages
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

create policy "Preview session text messages delete"
	on public.preview_session_text_messages
	for delete
	to authenticated
	using (
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
drop policy if exists "Preview session audio replies update" on public.preview_session_audio_replies;
drop policy if exists "Preview session audio replies delete" on public.preview_session_audio_replies;

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

create policy "Preview session audio replies update"
	on public.preview_session_audio_replies
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

create policy "Preview session audio replies delete"
	on public.preview_session_audio_replies
	for delete
	to authenticated
	using (
		(select auth.uid()) is not null
		and (
			preview_session_audio_replies.user_id = (select auth.uid())
			or exists (
				select 1
				from public.preview_session_audio_posts audio_post
				where audio_post.id = preview_session_audio_replies.audio_post_id
					and audio_post.user_id = (select auth.uid())
			)
		)
	);

drop policy if exists "Preview session audio share dispatches read" on public.preview_session_audio_share_dispatches;
drop policy if exists "Preview session audio share dispatches insert" on public.preview_session_audio_share_dispatches;

create policy "Preview session audio share dispatches read"
	on public.preview_session_audio_share_dispatches
	for select
	to authenticated
	using ((select auth.uid()) = user_id);

create policy "Preview session audio share dispatches insert"
	on public.preview_session_audio_share_dispatches
	for insert
	to authenticated
	with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.preview_session_text_messages to authenticated;
grant select, insert, update, delete on table public.preview_session_audio_posts to authenticated;
grant select, insert, update, delete on table public.preview_session_audio_replies to authenticated;
grant select, insert on table public.preview_session_audio_share_dispatches to authenticated;

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
