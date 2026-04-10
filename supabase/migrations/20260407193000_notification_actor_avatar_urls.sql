create or replace function public.enqueue_friend_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	requester_display_name text;
	requester_avatar_url text;
begin
	if new.status <> 'pending' then
		return new;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		),
		p.avatar_url
	into requester_display_name, requester_avatar_url
	from public.profiles p
	where p.user_id = new.requester_user_id;

	insert into public.user_notifications (
		user_id,
		category,
		notification_type,
		title,
		body,
		payload_json
	)
	values (
		new.recipient_user_id,
		'for-me',
		'friend_request_received',
		'Nouvelle demande de connexion',
		requester_display_name || ' veut se connecter avec toi.',
		jsonb_build_object(
			'friendRequestId', new.id,
			'requesterUserId', new.requester_user_id,
			'actorDisplayName', requester_display_name,
			'actorAvatarUrl', requester_avatar_url,
			'actionUrl', '/profil/amis'
		)
	);

	return new;
end;
$$;
create or replace function public.enqueue_friend_request_accepted_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	recipient_display_name text;
	recipient_avatar_url text;
begin
	if old.status is not distinct from new.status or new.status <> 'accepted' then
		return new;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Cette personne'
		),
		p.avatar_url
	into recipient_display_name, recipient_avatar_url
	from public.profiles p
	where p.user_id = new.recipient_user_id;

	insert into public.user_notifications (
		user_id,
		category,
		notification_type,
		title,
		body,
		payload_json
	)
	values (
		new.requester_user_id,
		'for-me',
		'friend_request_accepted',
		'Connexion acceptée',
		recipient_display_name || ' a accepté ta demande de connexion.',
		jsonb_build_object(
			'friendRequestId', new.id,
			'recipientUserId', new.recipient_user_id,
			'actorDisplayName', recipient_display_name,
			'actorAvatarUrl', recipient_avatar_url,
			'actionUrl', '/profil/amis'
		)
	);

	return new;
end;
$$;
create or replace function public.enqueue_preview_session_audio_reply_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	audio_post_record public.preview_session_audio_posts%rowtype;
	reply_author_display_name text;
	reply_author_avatar_url text;
begin
	select *
	into audio_post_record
	from public.preview_session_audio_posts
	where id = new.audio_post_id;

	if audio_post_record.id is null or audio_post_record.user_id = new.user_id then
		return new;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		),
		p.avatar_url
	into reply_author_display_name, reply_author_avatar_url
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
			'actorAvatarUrl', reply_author_avatar_url,
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
update public.user_notifications un
set payload_json = coalesce(un.payload_json, '{}'::jsonb)
	|| jsonb_build_object(
		'actorDisplayName',
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		),
		'actorAvatarUrl',
		p.avatar_url
	)
from public.profiles p
where un.notification_type = 'friend_request_received'
	and p.user_id::text = un.payload_json ->> 'requesterUserId';
update public.user_notifications un
set payload_json = coalesce(un.payload_json, '{}'::jsonb)
	|| jsonb_build_object(
		'actorDisplayName',
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Cette personne'
		),
		'actorAvatarUrl',
		p.avatar_url
	)
from public.profiles p
where un.notification_type = 'friend_request_accepted'
	and p.user_id::text = un.payload_json ->> 'recipientUserId';
update public.user_notifications un
set payload_json = coalesce(un.payload_json, '{}'::jsonb)
	|| jsonb_build_object(
		'actorDisplayName',
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		),
		'actorAvatarUrl',
		p.avatar_url
	)
from public.preview_session_audio_replies replies
join public.profiles p on p.user_id = replies.user_id
where un.notification_type = 'preview_session_audio_reply_received'
	and replies.id::text = coalesce(un.payload_json ->> 'replyId', un.payload_json ->> 'entityId');
notify pgrst, 'reload schema';
