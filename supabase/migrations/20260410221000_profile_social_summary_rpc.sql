create or replace function public.get_profile_social_summary_v1(
	p_target_user_id uuid
)
returns table (
	audio_recorded_count integer,
	last_activity_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, progress, auth
as $$
	with target as (
		select coalesce(p_target_user_id, auth.uid()) as uid
	), audio as (
		select
			count(
				distinct coalesce(
					'v:' || ap.vocabulary_card_id::text,
					'f:' || ap.foundation_card_id::text
				)
			)::integer as audio_recorded_count
		from public.preview_session_audio_posts ap
		join target t on t.uid = ap.user_id
	), activity as (
		select max(event_at) as last_activity_at
		from (
			select coalesce(da.last_event_at, da.updated_at, da.created_at) as event_at
			from progress.daily_activity_rollups da
			join target t on t.uid = da.user_id
			union all
			select ap.updated_at as event_at
			from public.preview_session_audio_posts ap
			join target t on t.uid = ap.user_id
			union all
			select tm.updated_at as event_at
			from public.preview_session_text_messages tm
			join target t on t.uid = tm.user_id
			union all
			select ar.updated_at as event_at
			from public.preview_session_audio_replies ar
			join target t on t.uid = ar.user_id
		) events
	)
	select
		coalesce(audio.audio_recorded_count, 0) as audio_recorded_count,
		activity.last_activity_at
	from audio
	cross join activity;
$$;

revoke all on function public.get_profile_social_summary_v1(uuid) from public;
grant execute on function public.get_profile_social_summary_v1(uuid) to authenticated;

notify pgrst, 'reload schema';
