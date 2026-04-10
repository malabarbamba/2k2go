alter table public.user_card_state
	add column if not exists source_video_id uuid references public.videos(id) on delete set null,
	add column if not exists source_video_is_short boolean,
	add column if not exists source_cue_id text,
	add column if not exists source_word_index integer,
	add column if not exists source_word_start_seconds double precision,
	add column if not exists source_word_end_seconds double precision;

alter table public.user_card_state
	drop constraint if exists user_card_state_source_occurrence_consistency;

alter table public.user_card_state
	add constraint user_card_state_source_occurrence_consistency check (
		(
			source_video_id is null
			and source_video_is_short is null
			and source_cue_id is null
			and source_word_index is null
			and source_word_start_seconds is null
			and source_word_end_seconds is null
		)
		or (
			source_video_id is not null
			and source_video_is_short is not null
		)
		);

alter table public.user_card_state
	drop constraint if exists user_card_state_source_word_index_nonnegative;

alter table public.user_card_state
	add constraint user_card_state_source_word_index_nonnegative check (
		source_word_index is null or source_word_index >= 0
	);

alter table public.user_card_state
	drop constraint if exists user_card_state_source_word_time_range;

alter table public.user_card_state
	add constraint user_card_state_source_word_time_range check (
		(source_word_start_seconds is null or source_word_start_seconds >= 0)
		and (
			source_word_end_seconds is null
			or (
				source_word_start_seconds is not null
				and source_word_end_seconds >= source_word_start_seconds
			)
		)
	);

drop function if exists public.collect_subtitle_word_to_personal_deck_v1(
	uuid,
	text,
	text,
	text,
	text,
	text,
	text,
	uuid
);

drop function if exists public.add_card_to_personal_deck_v2(
	uuid,
	uuid,
	text,
	text
);

create function public.add_card_to_personal_deck_v2(
	p_vocabulary_card_id uuid default null,
	p_foundation_card_id uuid default null,
	p_source text default null,
	p_source_type text default null,
	p_source_video_id uuid default null,
	p_source_video_is_short boolean default null,
	p_source_cue_id text default null,
	p_source_word_index integer default null,
	p_source_word_start_seconds double precision default null,
	p_source_word_end_seconds double precision default null
)
returns void
language plpgsql
as $$
declare
	v_user_id uuid := auth.uid();
	v_source_raw text := nullif(btrim(coalesce(p_source, '')), '');
	v_existing_added_to_deck_at timestamp with time zone;
	v_existing_source_type public.deck_source_type;
	v_effective_source_type public.deck_source_type;
	v_target_category text := '';
	v_current_collected_count integer := 0;
	v_collected_limit constant integer := 30;
	v_source_video_id uuid := null;
	v_source_video_is_short boolean := null;
	v_source_cue_id text := nullif(btrim(coalesce(p_source_cue_id, '')), '');
	v_source_word_index integer := null;
	v_source_word_start_seconds double precision := null;
	v_source_word_end_seconds double precision := null;
begin
	if v_user_id is null then
		raise exception 'Authentication required';
	end if;

	if (p_vocabulary_card_id is null and p_foundation_card_id is null)
		or (p_vocabulary_card_id is not null and p_foundation_card_id is not null) then
		raise exception 'Provide exactly one of p_vocabulary_card_id or p_foundation_card_id';
	end if;

	if p_source_word_index is not null and p_source_word_index < 0 then
		raise exception 'Source word index must be greater than or equal to zero';
	end if;

	if p_source_word_start_seconds is not null and (
		not isfinite(p_source_word_start_seconds)
		or p_source_word_start_seconds < 0
	) then
		raise exception 'Source word start must be a finite non-negative number';
	end if;

	if p_source_word_end_seconds is not null and (
		not isfinite(p_source_word_end_seconds)
		or p_source_word_start_seconds is null
		or p_source_word_end_seconds < p_source_word_start_seconds
	) then
		raise exception 'Source word end must be greater than or equal to source word start';
	end if;

	if p_source_video_id is not null
		and p_source_video_is_short is not null
		and p_source_word_start_seconds is not null then
		v_source_video_id := p_source_video_id;
		v_source_video_is_short := p_source_video_is_short;
		v_source_word_index := p_source_word_index;
		v_source_word_start_seconds := p_source_word_start_seconds;
		v_source_word_end_seconds := p_source_word_end_seconds;
	else
		v_source_cue_id := null;
	end if;

	perform pg_advisory_xact_lock(
		hashtext(concat_ws(':', 'add_card_to_personal_deck_v2', v_user_id::text))
	);

	select ucs.added_to_deck_at, ucs.source_type
	into v_existing_added_to_deck_at, v_existing_source_type
	from public.user_card_state ucs
	where ucs.user_id = v_user_id
		and (
			(p_vocabulary_card_id is not null and ucs.vocabulary_card_id = p_vocabulary_card_id)
			or (p_foundation_card_id is not null and ucs.foundation_card_id = p_foundation_card_id)
		)
	limit 1;

	v_effective_source_type := public.classify_deck_source_type(
		p_foundation_card_id,
		p_source_type,
		v_source_raw,
		v_existing_source_type
	);

	if p_vocabulary_card_id is not null then
		select coalesce(vc.category, '')
		into v_target_category
		from public.vocabulary_cards vc
		where vc.id = p_vocabulary_card_id;
	end if;

	if p_vocabulary_card_id is not null
		and v_effective_source_type = 'collected'::public.deck_source_type
		and v_target_category <> 'alphabet_arabe'
		and (
			v_existing_added_to_deck_at is null
			or coalesce(v_existing_source_type::text, 'collected') <> 'collected'
		) then
		select count(*)::integer
		into v_current_collected_count
		from public.user_card_state ucs
		join public.vocabulary_cards vc
			on vc.id = ucs.vocabulary_card_id
		where ucs.user_id = v_user_id
			and ucs.added_to_deck_at is not null
			and coalesce(ucs.source_type::text, 'collected') = 'collected'
			and coalesce(vc.category, '') <> 'alphabet_arabe';

		if v_current_collected_count >= v_collected_limit then
			raise exception 'Vous avez atteint la limite de 30 mots collectes.';
		end if;
	end if;

	insert into public.user_card_state (
		user_id,
		vocabulary_card_id,
		foundation_card_id,
		added_to_deck_at,
		source_raw,
		source_type,
		source_video_id,
		source_video_is_short,
		source_cue_id,
		source_word_index,
		source_word_start_seconds,
		source_word_end_seconds
	)
	values (
		v_user_id,
		p_vocabulary_card_id,
		p_foundation_card_id,
		now(),
		v_source_raw,
		v_effective_source_type,
		v_source_video_id,
		v_source_video_is_short,
		v_source_cue_id,
		v_source_word_index,
		v_source_word_start_seconds,
		v_source_word_end_seconds
	)
	on conflict do nothing;

	update public.user_card_state ucs
	set
		added_to_deck_at = coalesce(ucs.added_to_deck_at, now()),
		source_raw = coalesce(ucs.source_raw, v_source_raw),
		source_type = public.classify_deck_source_type(
			ucs.foundation_card_id,
			p_source_type,
			coalesce(ucs.source_raw, v_source_raw),
			ucs.source_type
		),
		source_video_id = case
			when ucs.source_video_id is null then v_source_video_id
			else ucs.source_video_id
		end,
		source_video_is_short = case
			when ucs.source_video_id is null then v_source_video_is_short
			else ucs.source_video_is_short
		end,
		source_cue_id = case
			when ucs.source_video_id is null then v_source_cue_id
			else ucs.source_cue_id
		end,
		source_word_index = case
			when ucs.source_video_id is null then v_source_word_index
			else ucs.source_word_index
		end,
		source_word_start_seconds = case
			when ucs.source_video_id is null then v_source_word_start_seconds
			else ucs.source_word_start_seconds
		end,
		source_word_end_seconds = case
			when ucs.source_video_id is null then v_source_word_end_seconds
			else ucs.source_word_end_seconds
		end
	where ucs.user_id = v_user_id
		and (
			(p_vocabulary_card_id is not null and ucs.vocabulary_card_id = p_vocabulary_card_id)
			or (p_foundation_card_id is not null and ucs.foundation_card_id = p_foundation_card_id)
		);

	insert into public.user_activity_log (user_id, activity_type, metadata)
	values (
		v_user_id,
		'cards_added',
		jsonb_build_object(
			'source', coalesce(v_source_raw, 'unknown'),
			'source_type', v_effective_source_type::text,
			'vocabulary_card_id', p_vocabulary_card_id,
			'foundation_card_id', p_foundation_card_id
		)
	);
end;
$$;

create function public.collect_subtitle_word_to_personal_deck_v1(
	p_video_id uuid,
	p_word_ar text,
	p_word_fr text,
	p_example_sentence_ar text default null,
	p_example_sentence_fr text default null,
	p_source text default 'subtitle_word_popover',
	p_transliteration text default null,
	p_lexicon_entry_id uuid default null,
	p_source_video_is_short boolean default null,
	p_source_cue_id text default null,
	p_source_word_index integer default null,
	p_source_word_start_seconds double precision default null,
	p_source_word_end_seconds double precision default null
)
returns table (vocabulary_card_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
	v_user_id uuid := auth.uid();
	v_word_ar text := nullif(trim(coalesce(p_word_ar, '')), '');
	v_word_fr text := nullif(trim(coalesce(p_word_fr, '')), '');
	v_example_sentence_ar text := nullif(trim(coalesce(p_example_sentence_ar, '')), '');
	v_example_sentence_fr text := nullif(trim(coalesce(p_example_sentence_fr, '')), '');
	v_transliteration text := nullif(trim(coalesce(p_transliteration, '')), '');
	v_source text := nullif(trim(coalesce(p_source, '')), '');
	v_lexicon_entry_id uuid := p_lexicon_entry_id;
	v_normalized_word_ar text;
	v_word_fr_lower text;
	v_card_id uuid;
	v_card_created boolean := false;
	v_current_collected_count integer := 0;
	v_collected_limit constant integer := 30;
begin
	if v_user_id is null then
		raise exception 'Authentication required';
	end if;

	if p_video_id is null then
		raise exception 'A source video is required';
	end if;

	if not exists (
		select 1
		from public.videos
		where id = p_video_id
	) then
		raise exception 'Source video not found';
	end if;

	if v_lexicon_entry_id is not null and not exists (
		select 1
		from public.lexicon_entries le
		where le.id = v_lexicon_entry_id
	) then
		raise exception 'Lexicon entry not found';
	end if;

	if v_word_ar is null then
		raise exception 'Arabic subtitle word is required';
	end if;

	if v_word_fr is null then
		raise exception 'French translation is required';
	end if;

	v_source := coalesce(v_source, 'subtitle_word_popover');
	v_normalized_word_ar := public.normalize_arabic(v_word_ar);
	v_word_fr_lower := lower(v_word_fr);

	perform pg_advisory_xact_lock(
		hashtext(concat_ws(':', 'add_card_to_personal_deck_v2', v_user_id::text))
	);

	if v_lexicon_entry_id is not null then
		perform pg_advisory_xact_lock(hashtext(concat_ws(':', 'subtitle_word_lexicon', v_lexicon_entry_id::text)));

		select vc.id
		into v_card_id
		from public.vocabulary_cards vc
		where vc.lexicon_entry_id = v_lexicon_entry_id
		order by vc.created_at asc, vc.id asc
		limit 1;
	end if;

	if v_card_id is null then
		perform pg_advisory_xact_lock(
			hashtext(
				concat_ws(':', 'subtitle_word', p_video_id::text, v_normalized_word_ar, v_word_fr_lower)
			)
		);

		select existing_card.id
		into v_card_id
		from (
			select distinct vc.id, vc.created_at
			from public.vocabulary_cards vc
			left join public.vocabulary_card_videos vcv
				on vcv.vocabulary_card_id = vc.id
			where (vc.video_id = p_video_id or vcv.video_id = p_video_id)
				and public.normalize_arabic(vc.word_ar) = v_normalized_word_ar
				and lower(trim(vc.word_fr)) = v_word_fr_lower
		) as existing_card
		order by existing_card.created_at asc, existing_card.id asc
		limit 1;
	end if;

	if v_card_id is null then
		select existing_card.id
		into v_card_id
		from (
			select distinct vc.id, vc.created_at
			from public.vocabulary_cards vc
			left join public.vocabulary_card_videos vcv
				on vcv.vocabulary_card_id = vc.id
			where (vc.video_id = p_video_id or vcv.video_id = p_video_id)
				and public.normalize_arabic(vc.word_ar) = v_normalized_word_ar
		) as existing_card
		order by existing_card.created_at asc, existing_card.id asc
		limit 1;
	end if;

	if v_card_id is null then
		select count(*)::integer
		into v_current_collected_count
		from public.user_card_state ucs
		join public.vocabulary_cards vc
			on vc.id = ucs.vocabulary_card_id
		where ucs.user_id = v_user_id
			and ucs.added_to_deck_at is not null
			and coalesce(ucs.source_type::text, 'collected') = 'collected'
			and coalesce(vc.category, '') <> 'alphabet_arabe';

		if v_current_collected_count >= v_collected_limit then
			raise exception 'Vous avez atteint la limite de 30 mots collectes.';
		end if;

		insert into public.vocabulary_cards (
			video_id,
			lexicon_entry_id,
			word_ar,
			word_fr,
			example_sentence_ar,
			example_sentence_fr,
			category,
			difficulty,
			transliteration
		)
		values (
			null,
			v_lexicon_entry_id,
			v_word_ar,
			v_word_fr,
			v_example_sentence_ar,
			v_example_sentence_fr,
			'subtitle_mined',
			'subtitle_word',
			v_transliteration
		)
		returning id into v_card_id;

		v_card_created := true;
	elsif v_lexicon_entry_id is not null then
		update public.vocabulary_cards
		set lexicon_entry_id = v_lexicon_entry_id
		where id = v_card_id
			and lexicon_entry_id is distinct from v_lexicon_entry_id;
	end if;

	insert into public.vocabulary_card_videos (video_id, vocabulary_card_id)
	values (p_video_id, v_card_id)
	on conflict on constraint vocabulary_card_videos_pkey do nothing;

	perform public.add_card_to_personal_deck_v2(
		p_vocabulary_card_id => v_card_id,
		p_source => v_source,
		p_source_type => null,
		p_source_video_id => p_video_id,
		p_source_video_is_short => p_source_video_is_short,
		p_source_cue_id => p_source_cue_id,
		p_source_word_index => p_source_word_index,
		p_source_word_start_seconds => p_source_word_start_seconds,
		p_source_word_end_seconds => p_source_word_end_seconds
	);

	return query
	select v_card_id, v_card_created;
end;
$$;

revoke all on function public.collect_subtitle_word_to_personal_deck_v1(
	uuid,
	text,
	text,
	text,
	text,
	text,
	text,
	uuid,
	boolean,
	text,
	integer,
	double precision,
	double precision
) from public;

revoke all on function public.collect_subtitle_word_to_personal_deck_v1(
	uuid,
	text,
	text,
	text,
	text,
	text,
	text,
	uuid,
	boolean,
	text,
	integer,
	double precision,
	double precision
) from anon;

revoke all on function public.collect_subtitle_word_to_personal_deck_v1(
	uuid,
	text,
	text,
	text,
	text,
	text,
	text,
	uuid,
	boolean,
	text,
	integer,
	double precision,
	double precision
) from authenticated;

grant execute on function public.collect_subtitle_word_to_personal_deck_v1(
	uuid,
	text,
	text,
	text,
	text,
	text,
	text,
	uuid,
	boolean,
	text,
	integer,
	double precision,
	double precision
) to authenticated;;
