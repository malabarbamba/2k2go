create or replace function public.calculate_due_count_for_user_v1(
    p_user_id uuid,
    p_deck_scope text default 'personal_and_foundation'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := now();
    v_cache_ttl interval := interval '30 seconds';
    v_query_version integer := 1;
    v_count integer := null;
    v_foundation_enabled boolean := false;
begin
    if p_user_id is null then
        raise exception 'user_id_required';
    end if;

    if p_deck_scope is null then
        return 0;
    end if;

    select cache.due_count
    into v_count
    from public.user_due_count_cache as cache
    where cache.user_id = p_user_id
      and cache.deck_scope = p_deck_scope
      and cache.query_version = v_query_version
      and cache.expires_at > v_now
    limit 1;

    if v_count is not null then
        return v_count;
    end if;

    select (
        coalesce(
            (
                select p.foundation_deck_enabled
                from public.profiles as p
                where p.user_id = p_user_id
            ),
            false
        )
        or exists (
            select 1
            from public.user_card_state as existing
            where existing.user_id = p_user_id
              and existing.foundation_card_id is not null
        )
    )
    into v_foundation_enabled;

    select count(*)
    into v_count
    from public.user_card_state as ucs
    left join public.vocabulary_cards as vc
        on ucs.vocabulary_card_id = vc.id
    where ucs.user_id = p_user_id
      and (ucs.next_review_at is null or ucs.next_review_at <= v_now)
      and (
          p_deck_scope = 'personal_and_foundation'
          or (p_deck_scope = 'foundation' and ucs.foundation_card_id is not null)
          or (
              p_deck_scope = 'personal'
              and ucs.vocabulary_card_id is not null
              and coalesce(ucs.source_type::text, 'collected') = 'collected'
              and coalesce(vc.category, '') <> 'alphabet_arabe'
          )
          or (
              p_deck_scope = 'personal_sent'
              and ucs.vocabulary_card_id is not null
              and coalesce(ucs.source_type::text, 'collected') = 'sent'
          )
          or (
              p_deck_scope = 'personal_alphabet'
              and ucs.vocabulary_card_id is not null
              and (
                  coalesce(ucs.source_type::text, 'collected') = 'alphabet'
                  or vc.category = 'alphabet_arabe'
              )
          )
      )
      and (ucs.foundation_card_id is not null or ucs.added_to_deck_at is not null)
      and (ucs.foundation_card_id is null or v_foundation_enabled);

    insert into public.user_due_count_cache (
        user_id,
        deck_scope,
        due_count,
        computed_at,
        expires_at,
        query_version
    )
    values (
        p_user_id,
        p_deck_scope,
        v_count,
        v_now,
        v_now + v_cache_ttl,
        v_query_version
    )
    on conflict (user_id, deck_scope) do update
    set due_count = excluded.due_count,
        computed_at = excluded.computed_at,
        expires_at = excluded.expires_at,
        query_version = excluded.query_version;

    return v_count;
end;
$$;
revoke all on function public.calculate_due_count_for_user_v1(uuid, text) from public;
grant execute on function public.calculate_due_count_for_user_v1(uuid, text) to service_role;
create or replace function public.get_due_count_for_user_v1(
    p_user_id uuid,
    p_deck_scope text default 'personal_and_foundation'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
    return public.calculate_due_count_for_user_v1(p_user_id, p_deck_scope);
end;
$$;
revoke all on function public.get_due_count_for_user_v1(uuid, text) from public;
grant execute on function public.get_due_count_for_user_v1(uuid, text) to service_role;
create or replace function public.complete_review_reminder_dispatch_run_v1(
    p_run_id uuid,
    p_status text,
    p_channels_sent text[] default '{}'::text[],
    p_provider_payload jsonb default '{}'::jsonb,
    p_error_message text default null
)
returns public.review_reminder_dispatch_runs
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.review_reminder_dispatch_runs;
begin
    if p_run_id is null then
        raise exception 'run_id_required';
    end if;

    if p_status not in ('pending', 'sent', 'partial', 'failed', 'skipped') then
        raise exception 'invalid_status';
    end if;

    p_channels_sent := coalesce(p_channels_sent, '{}'::text[]);

    if not (p_channels_sent <@ array['email', 'web_push']::text[]) then
        raise exception 'invalid_channels_sent';
    end if;

    update public.review_reminder_dispatch_runs as runs
    set status = p_status,
        channels_sent = p_channels_sent,
        provider_payload = coalesce(runs.provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
        error_message = case
            when p_error_message is null or btrim(p_error_message) = '' then null
            else left(btrim(p_error_message), 1000)
        end,
        updated_at = timezone('utc', now())
    where runs.id = p_run_id
    returning runs.* into v_row;

    if v_row.id is null then
        raise exception 'run_not_found';
    end if;

    return v_row;
end;
$$;
revoke all on function public.complete_review_reminder_dispatch_run_v1(uuid, text, text[], jsonb, text) from public;
grant execute on function public.complete_review_reminder_dispatch_run_v1(uuid, text, text[], jsonb, text) to service_role;
create or replace function public.get_review_reminder_calendar_feed_by_token_v1(
    p_token uuid
)
returns table (
    user_id uuid,
    scheduler_timezone text,
    enabled boolean,
    calendar_enabled boolean,
    cadence_slots text[],
    morning_hour integer,
    midday_hour integer,
    evening_hour integer,
    updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select
        feeds.user_id,
        coalesce(nullif(trim(profiles.scheduler_timezone), ''), 'UTC') as scheduler_timezone,
        prefs.enabled,
        prefs.calendar_enabled,
        prefs.cadence_slots,
        prefs.morning_hour,
        prefs.midday_hour,
        prefs.evening_hour,
        greatest(
            coalesce(prefs.updated_at, timezone('utc', now())),
            coalesce(feeds.updated_at, timezone('utc', now()))
        ) as updated_at
    from public.user_review_calendar_feeds as feeds
    join public.user_review_reminder_preferences as prefs
        on prefs.user_id = feeds.user_id
    join public.profiles
        on profiles.user_id = feeds.user_id
    where feeds.token = p_token
    limit 1;
$$;
revoke all on function public.get_review_reminder_calendar_feed_by_token_v1(uuid) from public;
grant execute on function public.get_review_reminder_calendar_feed_by_token_v1(uuid) to service_role;
