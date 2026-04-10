create extension if not exists pgcrypto with schema extensions;
create table if not exists public.user_review_reminder_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    enabled boolean not null default false,
    email_enabled boolean not null default false,
    calendar_enabled boolean not null default false,
    web_push_enabled boolean not null default false,
    cadence_slots text[] not null default array['morning', 'midday', 'evening'],
    min_due_count integer not null default 1,
    daily_cap integer not null default 2,
    morning_hour integer not null default 8,
    midday_hour integer not null default 13,
    evening_hour integer not null default 19,
    last_reminder_sent_at timestamptz null,
    last_review_nudge_at timestamptz null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint user_review_reminder_preferences_slots_check check (
        cadence_slots <@ array['morning', 'midday', 'evening']::text[]
        and coalesce(array_length(cadence_slots, 1), 0) > 0
    ),
    constraint user_review_reminder_preferences_min_due_count_check check (min_due_count between 1 and 500),
    constraint user_review_reminder_preferences_daily_cap_check check (daily_cap between 1 and 3),
    constraint user_review_reminder_preferences_morning_hour_check check (morning_hour between 5 and 11),
    constraint user_review_reminder_preferences_midday_hour_check check (midday_hour between 11 and 16),
    constraint user_review_reminder_preferences_evening_hour_check check (evening_hour between 16 and 23)
);
create table if not exists public.user_review_calendar_feeds (
    user_id uuid primary key references auth.users(id) on delete cascade,
    token uuid not null unique default extensions.gen_random_uuid(),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);
create table if not exists public.user_review_web_push_subscriptions (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    expiration_time timestamptz null,
    user_agent text null,
    device_label text null,
    last_sent_at timestamptz null,
    last_error_at timestamptz null,
    last_error_message text null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);
create table if not exists public.review_reminder_dispatch_runs (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    local_date date not null,
    slot text not null,
    due_count integer not null default 0,
    streak_days integer not null default 0,
    channels_sent text[] not null default '{}'::text[],
    status text not null default 'pending',
    provider_payload jsonb not null default '{}'::jsonb,
    error_message text null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint review_reminder_dispatch_runs_slot_check check (slot in ('morning', 'midday', 'evening')),
    constraint review_reminder_dispatch_runs_status_check check (status in ('pending', 'sent', 'partial', 'failed', 'skipped')),
    constraint review_reminder_dispatch_runs_due_count_check check (due_count >= 0),
    constraint review_reminder_dispatch_runs_streak_days_check check (streak_days >= 0),
    constraint review_reminder_dispatch_runs_channels_sent_check check (
        channels_sent <@ array['email', 'web_push']::text[]
    ),
    constraint review_reminder_dispatch_runs_user_slot_unique unique (user_id, local_date, slot)
);
create index if not exists idx_user_review_web_push_subscriptions_user_id
    on public.user_review_web_push_subscriptions(user_id);
create index if not exists idx_review_reminder_dispatch_runs_user_date
    on public.review_reminder_dispatch_runs(user_id, local_date desc);
alter table public.user_review_reminder_preferences enable row level security;
alter table public.user_review_calendar_feeds enable row level security;
alter table public.user_review_web_push_subscriptions enable row level security;
alter table public.review_reminder_dispatch_runs enable row level security;
drop policy if exists "Users can read own review reminder preferences" on public.user_review_reminder_preferences;
create policy "Users can read own review reminder preferences"
    on public.user_review_reminder_preferences
    for select
    to authenticated
    using (auth.uid() = user_id);
drop policy if exists "Users can insert own review reminder preferences" on public.user_review_reminder_preferences;
create policy "Users can insert own review reminder preferences"
    on public.user_review_reminder_preferences
    for insert
    to authenticated
    with check (auth.uid() = user_id);
drop policy if exists "Users can update own review reminder preferences" on public.user_review_reminder_preferences;
create policy "Users can update own review reminder preferences"
    on public.user_review_reminder_preferences
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
drop policy if exists "Users can read own review calendar feeds" on public.user_review_calendar_feeds;
create policy "Users can read own review calendar feeds"
    on public.user_review_calendar_feeds
    for select
    to authenticated
    using (auth.uid() = user_id);
drop policy if exists "Users can insert own review calendar feeds" on public.user_review_calendar_feeds;
create policy "Users can insert own review calendar feeds"
    on public.user_review_calendar_feeds
    for insert
    to authenticated
    with check (auth.uid() = user_id);
drop policy if exists "Users can update own review calendar feeds" on public.user_review_calendar_feeds;
create policy "Users can update own review calendar feeds"
    on public.user_review_calendar_feeds
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
drop policy if exists "Users can read own review web push subscriptions" on public.user_review_web_push_subscriptions;
create policy "Users can read own review web push subscriptions"
    on public.user_review_web_push_subscriptions
    for select
    to authenticated
    using (auth.uid() = user_id);
drop policy if exists "Users can insert own review web push subscriptions" on public.user_review_web_push_subscriptions;
create policy "Users can insert own review web push subscriptions"
    on public.user_review_web_push_subscriptions
    for insert
    to authenticated
    with check (auth.uid() = user_id);
drop policy if exists "Users can update own review web push subscriptions" on public.user_review_web_push_subscriptions;
create policy "Users can update own review web push subscriptions"
    on public.user_review_web_push_subscriptions
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
drop policy if exists "Users can delete own review web push subscriptions" on public.user_review_web_push_subscriptions;
create policy "Users can delete own review web push subscriptions"
    on public.user_review_web_push_subscriptions
    for delete
    to authenticated
    using (auth.uid() = user_id);
drop policy if exists "Users can read own review reminder dispatch runs" on public.review_reminder_dispatch_runs;
create policy "Users can read own review reminder dispatch runs"
    on public.review_reminder_dispatch_runs
    for select
    to authenticated
    using (auth.uid() = user_id);
create or replace function public.ensure_user_review_reminder_preferences_v1(
    p_user_id uuid default auth.uid()
)
returns public.user_review_reminder_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_row public.user_review_reminder_preferences;
begin
    v_user_id := coalesce(p_user_id, auth.uid());

    if v_user_id is null then
        raise exception 'not_authenticated';
    end if;

    insert into public.user_review_reminder_preferences as prefs (user_id)
    values (v_user_id)
    on conflict (user_id) do update
        set updated_at = timezone('utc', now())
    returning prefs.* into v_row;

    insert into public.user_review_calendar_feeds as feeds (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    return v_row;
end;
$$;
grant execute on function public.ensure_user_review_reminder_preferences_v1(uuid) to authenticated;
create or replace function public.get_due_count_for_user_v1(
    p_user_id uuid,
    p_deck_scope text default 'personal_and_foundation'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamp with time zone := now();
    v_count integer := 0;
    v_foundation_enabled boolean := false;
begin
    if p_user_id is null then
        raise exception 'user_id_required';
    end if;

    if p_deck_scope is null then
        return 0;
    end if;

    select (
        coalesce(
            (
                select p.foundation_deck_enabled
                from public.profiles p
                where p.user_id = p_user_id
            ),
            false
        )
        or exists (
            select 1
            from public.user_card_state existing
            where existing.user_id = p_user_id
              and existing.foundation_card_id is not null
        )
    )
    into v_foundation_enabled;

    select count(*) into v_count
    from public.user_card_state ucs
    left join public.vocabulary_cards vc
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

    return coalesce(v_count, 0);
end;
$$;
revoke all on function public.get_due_count_for_user_v1(uuid, text) from public;
grant execute on function public.get_due_count_for_user_v1(uuid, text) to service_role;
create or replace function public.rotate_review_calendar_feed_token_v1(
    p_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_token uuid;
begin
    v_user_id := coalesce(p_user_id, auth.uid());

    if v_user_id is null then
        raise exception 'not_authenticated';
    end if;

    insert into public.user_review_calendar_feeds as feeds (user_id, token, updated_at)
    values (v_user_id, extensions.gen_random_uuid(), timezone('utc', now()))
    on conflict (user_id) do update
        set token = extensions.gen_random_uuid(),
            updated_at = timezone('utc', now())
    returning feeds.token into v_token;

    return v_token;
end;
$$;
revoke all on function public.rotate_review_calendar_feed_token_v1(uuid) from public;
grant execute on function public.rotate_review_calendar_feed_token_v1(uuid) to authenticated;
create or replace function public.get_review_reminder_dispatch_candidates_v1(
    p_now_utc timestamptz default timezone('utc', now())
)
returns table (
    user_id uuid,
    email text,
    notifications_email boolean,
    scheduler_timezone text,
    scheduler_day_cutoff_hour integer,
    current_streak integer,
    last_review_date date,
    local_date date,
    slot text,
    due_count integer,
    email_enabled boolean,
    web_push_enabled boolean,
    calendar_enabled boolean,
    daily_cap integer,
    streak_risk boolean
)
language sql
security definer
set search_path = public
as $$
with base as (
    select
        prefs.user_id,
        p.email,
        coalesce(p.notifications_email, true) as notifications_email,
        coalesce(nullif(trim(p.scheduler_timezone), ''), 'UTC') as scheduler_timezone,
        coalesce(p.scheduler_day_cutoff_hour, 4) as scheduler_day_cutoff_hour,
        coalesce(progress.current_streak, 0) as current_streak,
        progress.last_review_date,
        prefs.email_enabled,
        prefs.web_push_enabled,
        prefs.calendar_enabled,
        prefs.daily_cap,
        prefs.min_due_count,
        prefs.morning_hour,
        prefs.midday_hour,
        prefs.evening_hour,
        prefs.cadence_slots,
        (p_now_utc at time zone coalesce(nullif(trim(p.scheduler_timezone), ''), 'UTC')) as local_ts
    from public.user_review_reminder_preferences prefs
    join public.profiles p
        on p.user_id = prefs.user_id
    left join public.user_learning_progress progress
        on progress.user_id = prefs.user_id
    where prefs.enabled = true
      and (
          prefs.web_push_enabled = true
          or (
              prefs.email_enabled = true
              and coalesce(p.notifications_email, true) = true
              and p.email is not null
              and btrim(p.email) <> ''
          )
      )
),
slotted as (
    select
        base.*,
        ((base.local_ts - make_interval(hours => greatest(0, least(base.scheduler_day_cutoff_hour, 23))))::date) as local_date,
        extract(hour from base.local_ts)::integer as local_hour,
        case
            when 'morning' = any(base.cadence_slots) and extract(hour from base.local_ts)::integer = base.morning_hour then 'morning'
            when 'midday' = any(base.cadence_slots) and extract(hour from base.local_ts)::integer = base.midday_hour then 'midday'
            when 'evening' = any(base.cadence_slots) and extract(hour from base.local_ts)::integer = base.evening_hour then 'evening'
            else null
        end as slot,
        case
            when extract(hour from base.local_ts)::integer = base.morning_hour then base.min_due_count
            when extract(hour from base.local_ts)::integer = base.midday_hour then greatest(base.min_due_count + 2, 4)
            when extract(hour from base.local_ts)::integer = base.evening_hour then base.min_due_count
            else 9999
        end as due_threshold
    from base
),
with_counts as (
    select
        slotted.*,
        public.get_due_count_for_user_v1(slotted.user_id, 'personal_and_foundation') as due_count,
        (coalesce(slotted.last_review_date, date '1900-01-01') >= slotted.local_date) as has_reviewed_today,
        coalesce((
            select count(*)::integer
            from public.review_reminder_dispatch_runs runs
            where runs.user_id = slotted.user_id
              and runs.local_date = slotted.local_date
              and runs.status in ('sent', 'partial')
        ), 0) as daily_sent_count
    from slotted
    where slotted.slot is not null
)
select
    with_counts.user_id,
    with_counts.email,
    with_counts.notifications_email,
    with_counts.scheduler_timezone,
    with_counts.scheduler_day_cutoff_hour,
    with_counts.current_streak,
    with_counts.last_review_date,
    with_counts.local_date,
    with_counts.slot,
    with_counts.due_count,
    with_counts.email_enabled,
    with_counts.web_push_enabled,
    with_counts.calendar_enabled,
    with_counts.daily_cap,
    (
        with_counts.slot = 'evening'
        and
        with_counts.current_streak > 0
        and with_counts.has_reviewed_today = false
    ) as streak_risk
from with_counts
where with_counts.daily_sent_count < with_counts.daily_cap
  and with_counts.has_reviewed_today = false
  and with_counts.due_count >= (
      case
          when with_counts.slot = 'evening'
               and with_counts.current_streak > 0
              then least(with_counts.due_threshold, 1)
          else with_counts.due_threshold
      end
  )
  and not exists (
      select 1
      from public.review_reminder_dispatch_runs existing
      where existing.user_id = with_counts.user_id
        and existing.local_date = with_counts.local_date
        and existing.slot = with_counts.slot
  );
$$;
revoke all on function public.get_review_reminder_dispatch_candidates_v1(timestamptz) from public;
grant execute on function public.get_review_reminder_dispatch_candidates_v1(timestamptz) to service_role;
