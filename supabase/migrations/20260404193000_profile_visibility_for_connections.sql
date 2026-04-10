
alter policy "Profiles select access"
on public.profiles
using (
	coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false)
	or auth.uid() = user_id
	or is_public = true
	or auth.uid() is not null
);

alter policy "User daily activity select access"
on public.user_daily_activity
using (
	coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false)
	or auth.uid() = user_id
	or exists (
		select 1
		from public.profiles p
		where p.user_id = user_daily_activity.user_id
			and p.is_public = true
	)
	or auth.uid() is not null
);

alter policy "Activity can read own or public profiles"
on public.user_activity_log
using (
	coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false)
	or auth.uid() = user_id
	or exists (
		select 1
		from public.profiles p
		where p.user_id = user_activity_log.user_id
			and p.is_public = true
	)
	or auth.uid() is not null
);

create or replace function public.get_profile_connection_context_v1(
	p_target_user_id uuid,
	p_limit integer default 8
)
returns table (
	relationship_state text,
	connection_count integer,
	connections jsonb,
	incoming_request_count integer,
	incoming_requests jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
	v_actor_id uuid := auth.uid();
	v_is_authenticated boolean := v_actor_id is not null;
	v_is_admin boolean := coalesce(
		public.has_role(auth.uid(), 'admin'::public.app_role),
		false
	);
	v_is_public boolean := false;
	v_is_self boolean := false;
	v_safe_limit integer := greatest(1, least(coalesce(p_limit, 8), 200));
begin
	if p_target_user_id is null then
		raise exception 'TARGET_USER_REQUIRED';
	end if;

	select p.is_public
	into v_is_public
	from public.profiles p
	where p.user_id = p_target_user_id;

	if not found then
		raise exception 'PROFILE_NOT_FOUND';
	end if;

	v_is_self := v_actor_id is not null and v_actor_id = p_target_user_id;

	if not (v_is_admin or v_is_self or v_is_public or v_is_authenticated) then
		raise exception 'PROFILE_NOT_VISIBLE';
	end if;

	return query
	with relationship as (
		select case
			when v_is_self then 'self'
			when v_actor_id is null then 'none'
			when exists (
				select 1
				from public.friendships f
				where (f.user_a_id = v_actor_id and f.user_b_id = p_target_user_id)
					or (f.user_b_id = v_actor_id and f.user_a_id = p_target_user_id)
			) then 'connected'
			when exists (
				select 1
				from public.friend_requests fr
				where fr.requester_user_id = v_actor_id
					and fr.recipient_user_id = p_target_user_id
					and fr.status = 'pending'
			) then 'outgoing_pending'
			when exists (
				select 1
				from public.friend_requests fr
				where fr.requester_user_id = p_target_user_id
					and fr.recipient_user_id = v_actor_id
					and fr.status = 'pending'
			) then 'incoming_pending'
			else 'none'
		end as value
	),
	connections_base as (
		select
			case
				when f.user_a_id = p_target_user_id then f.user_b_id
				else f.user_a_id
			end as connection_user_id,
			f.created_at as connected_at
		from public.friendships f
		where f.user_a_id = p_target_user_id
			or f.user_b_id = p_target_user_id
	),
	limited_connections as (
		select *
		from connections_base
		order by connected_at desc
		limit v_safe_limit
	),
	incoming_base as (
		select
			fr.id as request_id,
			fr.requester_user_id,
			fr.created_at as requested_at,
			p.username,
			p.first_name,
			p.last_name,
			p.avatar_url
		from public.friend_requests fr
		join public.profiles p on p.user_id = fr.requester_user_id
		where v_is_self
			and fr.recipient_user_id = p_target_user_id
			and fr.status = 'pending'
		order by fr.created_at desc
	)
	select
		(select value from relationship) as relationship_state,
		coalesce((select count(*)::integer from connections_base), 0) as connection_count,
		coalesce((
			select jsonb_agg(
				jsonb_build_object(
					'user_id', p.user_id,
					'username', p.username,
					'first_name', p.first_name,
					'last_name', p.last_name,
					'avatar_url', p.avatar_url,
					'connected_at', lc.connected_at
				)
				order by lc.connected_at desc
			)
			from limited_connections lc
			join public.profiles p on p.user_id = lc.connection_user_id
		), '[]'::jsonb) as connections,
		case
			when v_is_self then coalesce((select count(*)::integer from incoming_base), 0)
			else 0
		end as incoming_request_count,
		case
			when v_is_self then coalesce((
				select jsonb_agg(
					jsonb_build_object(
						'request_id', ib.request_id,
						'requester_user_id', ib.requester_user_id,
						'username', ib.username,
						'first_name', ib.first_name,
						'last_name', ib.last_name,
						'avatar_url', ib.avatar_url,
						'requested_at', ib.requested_at
					)
					order by ib.requested_at desc
				)
				from incoming_base ib
			), '[]'::jsonb)
			else '[]'::jsonb
		end as incoming_requests;
end;
$$;

grant execute on function public.get_profile_connection_context_v1(uuid, integer) to anon;
grant execute on function public.get_profile_connection_context_v1(uuid, integer) to authenticated;
grant execute on function public.get_profile_connection_context_v1(uuid, integer) to service_role;

create or replace function public.get_profile_progression_summary_v1(
	p_target_user_id uuid
)
returns table (
	words_acquired_count integer,
	total_immersion_minutes integer,
	review_streak_days integer,
	review_current integer,
	review_target integer,
	review_progress integer,
	mastered_words integer,
	mastery_progress integer,
	unlocked_distinction_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
	v_actor_id uuid := auth.uid();
	v_is_authenticated boolean := v_actor_id is not null;
	v_is_admin boolean := coalesce(
		public.has_role(auth.uid(), 'admin'::public.app_role),
		false
	);
	v_is_public boolean := false;
	v_is_self boolean := false;
	v_words_acquired_count integer := 0;
	v_total_immersion_minutes integer := 0;
	v_review_streak_days integer := 0;
	v_review_current integer := 0;
	v_review_target integer := 0;
	v_review_progress integer := 0;
	v_mastered_words integer := 0;
	v_mastery_progress integer := 0;
	v_unlocked_distinction_ids text[] := '{}'::text[];
begin
	if p_target_user_id is null then
		raise exception 'TARGET_USER_REQUIRED';
	end if;

	select p.is_public
	into v_is_public
	from public.profiles p
	where p.user_id = p_target_user_id;

	if not found then
		raise exception 'PROFILE_NOT_FOUND';
	end if;

	v_is_self := v_actor_id is not null and v_actor_id = p_target_user_id;

	if not (v_is_admin or v_is_self or v_is_public or v_is_authenticated) then
		raise exception 'PROFILE_NOT_VISIBLE';
	end if;

	select count(*)::integer
	into v_words_acquired_count
	from (
		select distinct public.normalize_arabic(source_words.word_ar) as normalized_word
		from (
			select fd.word_ar
			from public.user_card_state ucs
			join public.foundation_deck fd on fd.id = ucs.foundation_card_id
			where ucs.user_id = p_target_user_id
				and ucs.last_reviewed_at is not null

			union all

			select vc.word_ar
			from public.user_card_state ucs
			join public.vocabulary_cards vc on vc.id = ucs.vocabulary_card_id
			where ucs.user_id = p_target_user_id
				and ucs.last_reviewed_at is not null
				and coalesce(ucs.source_type::text, 'collected') in ('collected', 'sent')
		) source_words
		where nullif(public.normalize_arabic(source_words.word_ar), '') is not null
	) normalized_words;

	select coalesce(
		sum(
			greatest(
				coalesce(uda.time_spent_minutes, 0),
				floor(coalesce(uda.time_spent_seconds, 0)::numeric / 60)::integer
			)
		)::integer,
		0
	)
	into v_total_immersion_minutes
	from public.user_daily_activity uda
	where uda.user_id = p_target_user_id;

	v_review_streak_days := coalesce(
		public.get_review_streak_days_v1(p_target_user_id),
		0
	);

	select count(*)::integer
	into v_review_current
	from public.user_card_reviews ucr
	where ucr.user_id = p_target_user_id
		and ucr.reviewed_at >= date_trunc('day', now())
		and ucr.reviewed_at < date_trunc('day', now()) + interval '1 day';

	v_review_target := v_review_current + coalesce(
		public.calculate_due_count_for_user_v1(
			p_target_user_id,
			'personal_and_foundation'
		),
		0
	);

	v_review_progress := case
		when v_review_target > 0 then least(
			100,
			round((v_review_current::numeric / v_review_target::numeric) * 100)::integer
		)
		when v_review_current > 0 then 100
		else 0
	end;

	select count(*)::integer
	into v_mastered_words
	from public.user_card_state ucs
	where ucs.user_id = p_target_user_id
		and ucs.foundation_card_id is not null
		and ucs.last_reviewed_at is not null;

	v_mastery_progress := least(
		100,
		round((v_mastered_words::numeric / 2000::numeric) * 100)::integer
	);

	perform public.sync_user_accomplishments_internal_v1(p_target_user_id);

	select coalesce(
		array_agg(ua.accomplishment_type order by ua.accomplishment_type),
		'{}'::text[]
	)
	into v_unlocked_distinction_ids
	from public.user_accomplishments ua
	where ua.user_id = p_target_user_id;

	return query
	select
		v_words_acquired_count,
		v_total_immersion_minutes,
		v_review_streak_days,
		v_review_current,
		v_review_target,
		v_review_progress,
		v_mastered_words,
		v_mastery_progress,
		v_unlocked_distinction_ids;
end;
$$;

grant execute on function public.get_profile_progression_summary_v1(uuid) to anon;
grant execute on function public.get_profile_progression_summary_v1(uuid) to authenticated;
grant execute on function public.get_profile_progression_summary_v1(uuid) to service_role;
;
