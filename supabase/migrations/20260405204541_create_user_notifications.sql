create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_notifications (
	id uuid primary key default extensions.gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	category text not null default 'for-me',
	notification_type text not null default 'generic',
	title text not null,
	body text not null,
	payload_json jsonb not null default '{}'::jsonb,
	read_at timestamptz null,
	dismissed_at timestamptz null,
	archived_at timestamptz null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint user_notifications_category_check check (
		category in ('for-me', 'friends', 'correct')
	),
	constraint user_notifications_title_check check (char_length(btrim(title)) > 0),
	constraint user_notifications_body_check check (char_length(btrim(body)) > 0),
	constraint user_notifications_payload_json_object_check check (
		jsonb_typeof(payload_json) = 'object'
	)
);

create index if not exists idx_user_notifications_user_created_at
	on public.user_notifications (user_id, created_at desc);

create index if not exists idx_user_notifications_user_visible_created_at
	on public.user_notifications (user_id, created_at desc)
	where dismissed_at is null and archived_at is null;

create index if not exists idx_user_notifications_user_unread_created_at
	on public.user_notifications (user_id, created_at desc)
	where read_at is null and dismissed_at is null and archived_at is null;

create or replace function public.user_notifications_set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = timezone('utc', now());
	return new;
end;
$$;

drop trigger if exists user_notifications_set_updated_at_tg
	on public.user_notifications;

create trigger user_notifications_set_updated_at_tg
	before update on public.user_notifications
	for each row
	execute function public.user_notifications_set_updated_at();

alter table public.user_notifications enable row level security;

drop policy if exists "Users can read own notifications"
	on public.user_notifications;
drop policy if exists "Users can insert own notifications"
	on public.user_notifications;
drop policy if exists "Users can update own notifications"
	on public.user_notifications;
drop policy if exists "Users can delete own notifications"
	on public.user_notifications;

create policy "Users can read own notifications"
	on public.user_notifications
	for select
	to authenticated
	using ((select auth.uid()) = user_id);

create policy "Users can insert own notifications"
	on public.user_notifications
	for insert
	to authenticated
	with check ((select auth.uid()) = user_id);

create policy "Users can update own notifications"
	on public.user_notifications
	for update
	to authenticated
	using ((select auth.uid()) = user_id)
	with check ((select auth.uid()) = user_id);

create policy "Users can delete own notifications"
	on public.user_notifications
	for delete
	to authenticated
	using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';;
