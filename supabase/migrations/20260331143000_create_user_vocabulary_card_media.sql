create table if not exists public.user_vocabulary_card_media (
	user_id uuid not null references auth.users(id) on delete cascade,
	vocabulary_card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
	image_url text null,
	audio_url text null,
	sentence_audio_url text null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, vocabulary_card_id)
);
create index if not exists idx_user_vocabulary_card_media_vocabulary_card_id
	on public.user_vocabulary_card_media (vocabulary_card_id);
create or replace function public.user_vocabulary_card_media_set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;
drop trigger if exists user_vocabulary_card_media_set_updated_at_tg
	on public.user_vocabulary_card_media;
create trigger user_vocabulary_card_media_set_updated_at_tg
	before update on public.user_vocabulary_card_media
	for each row
	execute function public.user_vocabulary_card_media_set_updated_at();
alter table public.user_vocabulary_card_media enable row level security;
drop policy if exists "User vocabulary card media owner admin read"
	on public.user_vocabulary_card_media;
drop policy if exists "User vocabulary card media owner insert"
	on public.user_vocabulary_card_media;
drop policy if exists "User vocabulary card media owner admin update"
	on public.user_vocabulary_card_media;
drop policy if exists "User vocabulary card media owner admin delete"
	on public.user_vocabulary_card_media;
create policy "User vocabulary card media owner admin read"
	on public.user_vocabulary_card_media
	for select
	using (
		(select auth.uid()) is not null
		and (
			user_id = (select auth.uid())
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	);
create policy "User vocabulary card media owner insert"
	on public.user_vocabulary_card_media
	for insert
	with check (
		(select auth.uid()) is not null
		and user_id = (select auth.uid())
	);
create policy "User vocabulary card media owner admin update"
	on public.user_vocabulary_card_media
	for update
	using (
		(select auth.uid()) is not null
		and (
			user_id = (select auth.uid())
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	)
	with check (
		(select auth.uid()) is not null
		and (
			user_id = (select auth.uid())
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	);
create policy "User vocabulary card media owner admin delete"
	on public.user_vocabulary_card_media
	for delete
	using (
		(select auth.uid()) is not null
		and (
			user_id = (select auth.uid())
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	);
insert into storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
values (
	'collected-card-media',
	'collected-card-media',
	false,
	10485760,
	array['image/webp', 'audio/webm', 'audio/wav', 'audio/x-wav']::text[]
)
on conflict (id) do update
set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Collected card media owner admin read" on storage.objects;
drop policy if exists "Collected card media owner upload" on storage.objects;
drop policy if exists "Collected card media owner admin update" on storage.objects;
drop policy if exists "Collected card media owner admin delete" on storage.objects;
create policy "Collected card media owner admin read"
	on storage.objects
	for select
	using (
		bucket_id = 'collected-card-media'
		and (select auth.uid()) is not null
		and (
			split_part(name, '/', 1) = (select auth.uid())::text
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	);
create policy "Collected card media owner upload"
	on storage.objects
	for insert
	with check (
		bucket_id = 'collected-card-media'
		and (select auth.uid()) is not null
		and split_part(name, '/', 1) = (select auth.uid())::text
	);
create policy "Collected card media owner admin update"
	on storage.objects
	for update
	using (
		bucket_id = 'collected-card-media'
		and (select auth.uid()) is not null
		and (
			split_part(name, '/', 1) = (select auth.uid())::text
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	)
	with check (
		bucket_id = 'collected-card-media'
		and (select auth.uid()) is not null
		and (
			split_part(name, '/', 1) = (select auth.uid())::text
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	);
create policy "Collected card media owner admin delete"
	on storage.objects
	for delete
	using (
		bucket_id = 'collected-card-media'
		and (select auth.uid()) is not null
		and (
			split_part(name, '/', 1) = (select auth.uid())::text
			or public.has_role((select auth.uid()), 'admin'::public.app_role)
		)
	);
