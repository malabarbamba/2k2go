alter table public.preview_session_audio_posts
	add column if not exists recording_duration_ms integer null,
	add column if not exists share_selected boolean not null default false,
	add column if not exists share_session_key text null,
	add column if not exists share_marked_at timestamptz null,
	add column if not exists share_dispatched_at timestamptz null;

alter table public.preview_session_audio_posts
	drop constraint if exists preview_session_audio_posts_recording_duration_ms_check;

alter table public.preview_session_audio_posts
	add constraint preview_session_audio_posts_recording_duration_ms_check check (
		recording_duration_ms is null
		or (recording_duration_ms > 0 and recording_duration_ms <= 7000)
	);

create index if not exists idx_preview_session_audio_posts_user_share_selected_session
	on public.preview_session_audio_posts (user_id, share_session_key, updated_at desc)
	where share_selected = true;

alter table public.preview_session_audio_replies
	add column if not exists audio_duration_ms integer null;

alter table public.preview_session_audio_replies
	drop constraint if exists preview_session_audio_replies_audio_duration_ms_check;

alter table public.preview_session_audio_replies
	add constraint preview_session_audio_replies_audio_duration_ms_check check (
		audio_duration_ms is null
		or (audio_duration_ms > 0 and audio_duration_ms <= 7000)
	);

alter table public.preview_session_audio_replies
	drop constraint if exists preview_session_audio_replies_body_text_length_check;

alter table public.preview_session_audio_replies
	add constraint preview_session_audio_replies_body_text_length_check check (
		body_text is null or char_length(btrim(body_text)) <= 70
	);

create unique index if not exists idx_preview_session_audio_replies_audio_post_user_unique
	on public.preview_session_audio_replies (audio_post_id, user_id);

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

create index if not exists idx_preview_session_audio_share_dispatches_user_dispatched
	on public.preview_session_audio_share_dispatches (user_id, dispatched_at desc);

alter table public.preview_session_audio_share_dispatches enable row level security;

drop policy if exists "Preview session audio share dispatches read" on public.preview_session_audio_share_dispatches;

create policy "Preview session audio share dispatches read"
	on public.preview_session_audio_share_dispatches
	for select
	to authenticated
	using ((select auth.uid()) = user_id);

drop policy if exists "Preview session audio share dispatches insert" on public.preview_session_audio_share_dispatches;

create policy "Preview session audio share dispatches insert"
	on public.preview_session_audio_share_dispatches
	for insert
	to authenticated
	with check ((select auth.uid()) = user_id);

create or replace function public.dispatch_preview_session_audio_share_batch(
	p_session_key text
)
returns table (
	shared_audio_count integer,
	notified_friend_count integer,
	already_dispatched boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
	v_actor_user_id uuid;
	v_normalized_session_key text;
	v_shared_audio_count integer := 0;
	v_notified_friend_count integer := 0;
	v_actor_display_name text;
	v_actor_avatar_url text;
	v_dispatch_id uuid;
	v_title text;
	v_body text;
begin
	v_actor_user_id := auth.uid();

	if v_actor_user_id is null then
		raise exception 'AUTH_REQUIRED';
	end if;

	v_normalized_session_key := nullif(btrim(coalesce(p_session_key, '')), '');
	if v_normalized_session_key is null then
		raise exception 'SESSION_KEY_REQUIRED';
	end if;

	select count(*)::integer
	into v_shared_audio_count
	from public.preview_session_audio_posts post
	where post.user_id = v_actor_user_id
		and post.share_selected = true
		and post.share_session_key = v_normalized_session_key;

	if v_shared_audio_count = 0 then
		return query select 0::integer, 0::integer, false;
		return;
	end if;

	insert into public.preview_session_audio_share_dispatches (
		user_id,
		session_key,
		shared_audio_count,
		notified_friend_count
	)
	values (
		v_actor_user_id,
		v_normalized_session_key,
		v_shared_audio_count,
		0
	)
	on conflict (user_id, session_key) do nothing
	returning id into v_dispatch_id;

	if v_dispatch_id is null then
		return query
		select v_shared_audio_count, 0::integer, true;
		return;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		),
		p.avatar_url
	into v_actor_display_name, v_actor_avatar_url
	from public.profiles p
	where p.user_id = v_actor_user_id;

	v_actor_display_name := coalesce(v_actor_display_name, 'Quelqu''un');
	v_title := 'Nouvelle prononciation de ' || v_actor_display_name;
	v_body :=
		v_actor_display_name
		|| ' a partage '
		|| v_shared_audio_count
		|| ' prononciation'
		|| case when v_shared_audio_count > 1 then 's' else '' end
		|| ' pendant sa session.';

	with friend_targets as (
		select distinct
			case
				when f.user_a_id = v_actor_user_id then f.user_b_id
				else f.user_a_id
			end as friend_user_id
		from public.friendships f
		where f.user_a_id = v_actor_user_id or f.user_b_id = v_actor_user_id
	),
	inserted as (
		insert into public.user_notifications (
			user_id,
			category,
			notification_type,
			title,
			body,
			payload_json
		)
		select
			target.friend_user_id,
			'friends',
			'preview_session_audio_batch_shared',
			v_title,
			v_body,
			jsonb_build_object(
				'actionLabel', 'Ecouter',
				'actionUrl', '/app/session',
				'actorDisplayName', v_actor_display_name,
				'actorAvatarUrl', v_actor_avatar_url,
				'senderUserId', v_actor_user_id,
				'sessionKey', v_normalized_session_key,
				'sharedAudioCount', v_shared_audio_count,
				'entityType', 'preview_session_audio_batch'
			)
		from friend_targets target
		returning id
	)
	select count(*)::integer
	into v_notified_friend_count
	from inserted;

	update public.preview_session_audio_posts
	set
		share_selected = false,
		share_dispatched_at = timezone('utc', now())
	where user_id = v_actor_user_id
		and share_selected = true
		and share_session_key = v_normalized_session_key;

	update public.preview_session_audio_share_dispatches
	set
		shared_audio_count = v_shared_audio_count,
		notified_friend_count = v_notified_friend_count
	where id = v_dispatch_id;

	return query
	select v_shared_audio_count, v_notified_friend_count, false;
end;
$$;

notify pgrst, 'reload schema';
