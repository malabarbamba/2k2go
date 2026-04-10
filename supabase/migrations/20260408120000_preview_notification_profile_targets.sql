create or replace function public.enqueue_friend_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	requester_display_name text;
	requester_avatar_url text;
	requester_username text;
	target_action_url text;
	target_action_label text;
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
		p.avatar_url,
		nullif(trim(p.username), '')
	into requester_display_name, requester_avatar_url, requester_username
	from public.profiles p
	where p.user_id = new.requester_user_id;

		target_action_url :=
			case
				when requester_username is not null then '/app/profil/' || requester_username
				else '/app/camarades'
			end;
	target_action_label :=
		case
			when requester_username is not null then 'Voir le profil'
			else 'Voir les connexions'
		end;

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
			'targetUserId', new.requester_user_id,
			'targetUsername', requester_username,
			'actorDisplayName', requester_display_name,
			'actorAvatarUrl', requester_avatar_url,
			'actionLabel', target_action_label,
			'actionUrl', target_action_url
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
	recipient_username text;
	target_action_url text;
	target_action_label text;
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
		p.avatar_url,
		nullif(trim(p.username), '')
	into recipient_display_name, recipient_avatar_url, recipient_username
	from public.profiles p
	where p.user_id = new.recipient_user_id;

		target_action_url :=
			case
				when recipient_username is not null then '/app/profil/' || recipient_username
				else '/app/camarades'
			end;
	target_action_label :=
		case
			when recipient_username is not null then 'Voir le profil'
			else 'Voir les connexions'
		end;

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
		recipient_display_name || ' a accepte ta demande de connexion.',
		jsonb_build_object(
			'friendRequestId', new.id,
			'recipientUserId', new.recipient_user_id,
			'targetUserId', new.recipient_user_id,
			'targetUsername', recipient_username,
			'actorDisplayName', recipient_display_name,
			'actorAvatarUrl', recipient_avatar_url,
			'actionLabel', target_action_label,
			'actionUrl', target_action_url
		)
	);

	return new;
end;
$$;

update public.user_notifications un
set payload_json = coalesce(un.payload_json, '{}'::jsonb)
	|| jsonb_build_object(
		'targetUserId', coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'requesterUserId'),
		'targetUsername', (
			select nullif(trim(p.username), '')
			from public.profiles p
			where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'requesterUserId')
			limit 1
		),
		'actionLabel', (
			case
				when exists (
					select 1
					from public.profiles p
					where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'requesterUserId')
					and nullif(trim(p.username), '') is not null
				) then 'Voir le profil'
				else 'Voir les connexions'
			end
		),
		'actionUrl', (
			case
				when exists (
					select 1
					from public.profiles p
					where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'requesterUserId')
					and nullif(trim(p.username), '') is not null
				)
				then '/app/profil/' || (
					select nullif(trim(p.username), '')
					from public.profiles p
					where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'requesterUserId')
					limit 1
				)
				else '/app/camarades'
			end
		)
	)
where un.notification_type = 'friend_request_received';

update public.user_notifications un
set payload_json = coalesce(un.payload_json, '{}'::jsonb)
	|| jsonb_build_object(
		'targetUserId', coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'recipientUserId'),
		'targetUsername', (
			select nullif(trim(p.username), '')
			from public.profiles p
			where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'recipientUserId')
			limit 1
		),
		'actionLabel', (
			case
				when exists (
					select 1
					from public.profiles p
					where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'recipientUserId')
					and nullif(trim(p.username), '') is not null
				) then 'Voir le profil'
				else 'Voir les connexions'
			end
		),
		'actionUrl', (
			case
				when exists (
					select 1
					from public.profiles p
					where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'recipientUserId')
					and nullif(trim(p.username), '') is not null
				)
				then '/app/profil/' || (
					select nullif(trim(p.username), '')
					from public.profiles p
					where p.user_id::text = coalesce(un.payload_json ->> 'targetUserId', un.payload_json ->> 'recipientUserId')
					limit 1
				)
				else '/app/camarades'
			end
		)
	)
where un.notification_type = 'friend_request_accepted';

update public.user_notifications
set payload_json = jsonb_set(
	payload_json,
	'{actionUrl}',
	to_jsonb(
		regexp_replace(payload_json ->> 'actionUrl', '^/app/profile(?=/|$)', '/app/profil')
	)
)
where payload_json ? 'actionUrl'
	and payload_json ->> 'actionUrl' ~ '^/app/profile(?:/|$)';

notify pgrst, 'reload schema';
