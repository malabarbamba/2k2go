create or replace function public.enqueue_friend_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	requester_display_name text;
begin
	if new.status <> 'pending' then
		return new;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Quelqu''un'
		)
	into requester_display_name
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
			'actionUrl', '/app/amis'
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
begin
	if old.status is not distinct from new.status or new.status <> 'accepted' then
		return new;
	end if;

	select
		coalesce(
			nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
			nullif(trim(p.username), ''),
			'Cette personne'
		)
	into recipient_display_name
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
			'actionUrl', '/app/amis'
		)
	);

	return new;
end;
$$;

drop trigger if exists friend_request_notifications_insert_tg
	on public.friend_requests;

create trigger friend_request_notifications_insert_tg
	after insert on public.friend_requests
	for each row
	execute function public.enqueue_friend_request_notification();

drop trigger if exists friend_request_notifications_accepted_tg
	on public.friend_requests;

create trigger friend_request_notifications_accepted_tg
	after update of status on public.friend_requests
	for each row
	when (old.status is distinct from new.status)
	execute function public.enqueue_friend_request_accepted_notification();

notify pgrst, 'reload schema';;
