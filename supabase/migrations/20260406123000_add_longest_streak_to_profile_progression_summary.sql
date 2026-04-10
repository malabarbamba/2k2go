drop function if exists public.get_profile_progression_summary_v1(uuid);

create function public.get_profile_progression_summary_v1(
	p_target_user_id uuid
)
returns table (
	words_acquired_count integer,
	total_immersion_minutes integer,
	review_streak_days integer,
	longest_streak_days integer,
	review_current integer,
	review_target integer,
	review_progress integer,
	mastered_words integer,
	mastery_progress integer,
	monthly_review_days_current integer,
	monthly_review_days_target integer,
	monthly_review_days_progress integer,
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
	v_now timestamptz := now();
	v_profile_timezone text := 'UTC';
	v_words_acquired_count integer := 0;
	v_total_immersion_minutes integer := 0;
	v_review_streak_days integer := 0;
	v_longest_streak_days integer := 0;
	v_review_current integer := 0;
	v_due_review_count integer := 0;
	v_review_target integer := 0;
	v_review_progress integer := 0;
	v_mastered_words integer := 0;
	v_mastery_progress integer := 0;
	v_month_start date := null;
	v_next_month_start date := null;
	v_monthly_review_days_current integer := 0;
	v_monthly_review_days_target integer := 0;
	v_monthly_review_days_progress integer := 0;
	v_unlocked_distinction_ids text[] := '{}'::text[];
	v_foundation_enabled boolean := false;
begin
	if p_target_user_id is null then
		raise exception 'TARGET_USER_REQUIRED';
	end if;

	select
		p.is_public,
		coalesce(nullif(p.scheduler_timezone, ''), 'UTC')
	into v_is_public, v_profile_timezone
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

	select coalesce(ulp.longest_streak, 0)
	into v_longest_streak_days
	from public.user_learning_progress ulp
	where ulp.user_id = p_target_user_id;

	v_longest_streak_days := coalesce(v_longest_streak_days, 0);

	select count(*)::integer
	into v_review_current
	from public.user_card_reviews ucr
	where ucr.user_id = p_target_user_id
		and ucr.reviewed_at >= date_trunc('day', v_now)
		and ucr.reviewed_at < date_trunc('day', v_now) + interval '1 day';

	select (
		coalesce(
			(
				select p.foundation_deck_enabled
				from public.profiles p
				where p.user_id = p_target_user_id
			),
			false
		)
		or exists (
			select 1
			from public.user_card_state existing
			where existing.user_id = p_target_user_id
				and existing.foundation_card_id is not null
		)
	)
	into v_foundation_enabled;

	select count(*)::integer
	into v_due_review_count
	from public.user_card_state ucs
	where ucs.user_id = p_target_user_id
		and (ucs.next_review_at is null or ucs.next_review_at <= v_now)
		and (ucs.foundation_card_id is not null or ucs.added_to_deck_at is not null)
		and (ucs.foundation_card_id is null or v_foundation_enabled);

	v_review_target := v_review_current + coalesce(v_due_review_count, 0);

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
		round((v_words_acquired_count::numeric / 2000::numeric) * 100)::integer
	);

	v_month_start := date_trunc('month', timezone(v_profile_timezone, v_now))::date;
	v_next_month_start := (v_month_start + interval '1 month')::date;
	v_monthly_review_days_target := extract(
		day from ((v_next_month_start)::timestamp - interval '1 day')
	)::integer;

	select count(
		distinct timezone(v_profile_timezone, ucr.reviewed_at)::date
	)::integer
	into v_monthly_review_days_current
	from public.user_card_reviews ucr
	where ucr.user_id = p_target_user_id
		and timezone(v_profile_timezone, ucr.reviewed_at)::date >= v_month_start
		and timezone(v_profile_timezone, ucr.reviewed_at)::date < v_next_month_start;

	v_monthly_review_days_progress := case
		when v_monthly_review_days_target > 0 then least(
			100,
			round(
				(
					v_monthly_review_days_current::numeric /
					v_monthly_review_days_target::numeric
				) * 100
			)::integer
		)
		else 0
	end;

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
		v_longest_streak_days,
		v_review_current,
		v_review_target,
		v_review_progress,
		v_mastered_words,
		v_mastery_progress,
		v_monthly_review_days_current,
		v_monthly_review_days_target,
		v_monthly_review_days_progress,
		v_unlocked_distinction_ids;
end;
$$;

grant execute on function public.get_profile_progression_summary_v1(uuid) to anon;
grant execute on function public.get_profile_progression_summary_v1(uuid) to authenticated;
grant execute on function public.get_profile_progression_summary_v1(uuid) to service_role;

notify pgrst, 'reload schema';
