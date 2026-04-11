do $$
begin
	if to_regclass('public.preview_session_audio_posts') is not null then
		execute 'alter table public.preview_session_audio_posts
			drop constraint if exists preview_session_audio_posts_recording_duration_ms_check';

		execute 'alter table public.preview_session_audio_posts
			add constraint preview_session_audio_posts_recording_duration_ms_check check (
				recording_duration_ms is null
				or (recording_duration_ms > 0 and recording_duration_ms <= 5000)
			)';
	end if;

	if to_regclass('public.preview_session_audio_replies') is not null then
		execute 'alter table public.preview_session_audio_replies
			drop constraint if exists preview_session_audio_replies_audio_duration_ms_check';

		execute 'alter table public.preview_session_audio_replies
			add constraint preview_session_audio_replies_audio_duration_ms_check check (
				audio_duration_ms is null
				or (audio_duration_ms > 0 and audio_duration_ms <= 5000)
			)';
	end if;
end
$$;
