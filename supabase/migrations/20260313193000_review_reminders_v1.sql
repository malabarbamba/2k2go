-- Review reminders V1 runtime helpers.
-- Extends the base reminder schema with delivery attempt tracking,
-- web-push lifecycle fields, and service-role helpers used by edge functions.

alter table if exists public.user_review_web_push_subscriptions
    add column if not exists enabled boolean not null default true;
alter table if exists public.user_review_web_push_subscriptions
    add column if not exists failure_count integer not null default 0;
alter table if exists public.user_review_web_push_subscriptions
    add column if not exists last_error_status integer null;
alter table if exists public.user_review_web_push_subscriptions
    drop constraint if exists user_review_web_push_subscriptions_failure_count_check;
alter table if exists public.user_review_web_push_subscriptions
    add constraint user_review_web_push_subscriptions_failure_count_check
        check (failure_count >= 0);
alter table if exists public.user_review_web_push_subscriptions
    drop constraint if exists user_review_web_push_subscriptions_last_error_status_check;
alter table if exists public.user_review_web_push_subscriptions
    add constraint user_review_web_push_subscriptions_last_error_status_check
        check (
            last_error_status is null
            or (last_error_status between 100 and 599)
        );
create index if not exists idx_user_review_web_push_subscriptions_user_enabled
    on public.user_review_web_push_subscriptions(user_id, enabled);
create table if not exists public.review_reminder_delivery_attempts (
    id uuid primary key default extensions.gen_random_uuid(),
    run_id uuid not null references public.review_reminder_dispatch_runs(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    channel text not null,
    subscription_id uuid null references public.user_review_web_push_subscriptions(id) on delete set null,
    status text not null,
    response_status integer null,
    provider_message_id text null,
    error_message text null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint review_reminder_delivery_attempts_channel_check
        check (channel in ('email', 'web_push')),
    constraint review_reminder_delivery_attempts_status_check
        check (status in ('sent', 'failed', 'skipped')),
    constraint review_reminder_delivery_attempts_response_status_check
        check (
            response_status is null
            or (response_status between 100 and 599)
        )
);
create index if not exists idx_review_reminder_delivery_attempts_run_id
    on public.review_reminder_delivery_attempts(run_id);
create index if not exists idx_review_reminder_delivery_attempts_user_created_at
    on public.review_reminder_delivery_attempts(user_id, created_at desc);
alter table public.review_reminder_delivery_attempts enable row level security;
drop policy if exists "Users can read own review reminder delivery attempts"
    on public.review_reminder_delivery_attempts;
create policy "Users can read own review reminder delivery attempts"
    on public.review_reminder_delivery_attempts
    for select
    to authenticated
    using (auth.uid() = user_id);
drop trigger if exists trg_user_review_reminder_preferences_set_updated_at
    on public.user_review_reminder_preferences;
create trigger trg_user_review_reminder_preferences_set_updated_at
    before update on public.user_review_reminder_preferences
    for each row
    execute function public.update_updated_at_column();
drop trigger if exists trg_user_review_calendar_feeds_set_updated_at
    on public.user_review_calendar_feeds;
create trigger trg_user_review_calendar_feeds_set_updated_at
    before update on public.user_review_calendar_feeds
    for each row
    execute function public.update_updated_at_column();
drop trigger if exists trg_user_review_web_push_subscriptions_set_updated_at
    on public.user_review_web_push_subscriptions;
create trigger trg_user_review_web_push_subscriptions_set_updated_at
    before update on public.user_review_web_push_subscriptions
    for each row
    execute function public.update_updated_at_column();
drop trigger if exists trg_review_reminder_dispatch_runs_set_updated_at
    on public.review_reminder_dispatch_runs;
create trigger trg_review_reminder_dispatch_runs_set_updated_at
    before update on public.review_reminder_dispatch_runs
    for each row
    execute function public.update_updated_at_column();
create or replace function public.claim_review_reminder_dispatch_run_v1(
    p_user_id uuid,
    p_local_date date,
    p_slot text,
    p_due_count integer default 0,
    p_streak_days integer default 0,
    p_provider_payload jsonb default '{}'::jsonb
)
returns public.review_reminder_dispatch_runs
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.review_reminder_dispatch_runs;
begin
    if p_user_id is null then
        raise exception 'user_id_required';
    end if;

    if p_local_date is null then
        raise exception 'local_date_required';
    end if;

    if p_slot not in ('morning', 'midday', 'evening') then
        raise exception 'invalid_slot';
    end if;

    insert into public.review_reminder_dispatch_runs as runs (
        user_id,
        local_date,
        slot,
        due_count,
        streak_days,
        channels_sent,
        status,
        provider_payload,
        error_message
    )
    values (
        p_user_id,
        p_local_date,
        p_slot,
        greatest(coalesce(p_due_count, 0), 0),
        greatest(coalesce(p_streak_days, 0), 0),
        '{}'::text[],
        'pending',
        coalesce(p_provider_payload, '{}'::jsonb),
        null
    )
    on conflict (user_id, local_date, slot) do nothing
    returning runs.* into v_row;

    return v_row;
end;
$$;
revoke all on function public.claim_review_reminder_dispatch_run_v1(uuid, date, text, integer, integer, jsonb) from public;
grant execute on function public.claim_review_reminder_dispatch_run_v1(uuid, date, text, integer, integer, jsonb) to service_role;
