-- Baseline v1 account hardening: generated unique usernames + one-time username change + avatar bucket

alter table account.profiles
  add column if not exists username_change_count integer not null default 0,
  add column if not exists username_changed_at timestamptz;

alter table account.profiles
  drop constraint if exists profiles_username_format;

alter table account.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_](?:[a-z0-9_-]{1,30}[a-z0-9_])?$');

create or replace function private.generate_username_candidate_v1()
returns text
language plpgsql
security definer
set search_path = private
as $$
declare
  v_adjectives text[] := array[
    'brave','calm','clever','curious','daring','eager','gentle','happy','kind','lively',
    'mellow','nimble','noble','quiet','rapid','royal','sharp','sunny','swift','wise'
  ];
  v_nouns text[] := array[
    'falcon','otter','panda','lynx','eagle','wolf','tiger','fox','dolphin','sparrow',
    'cedar','maple','river','ocean','comet','planet','harbor','summit','meadow','forest'
  ];
  v_adj text;
  v_noun text;
  v_num integer;
begin
  v_adj := v_adjectives[1 + floor(random() * array_length(v_adjectives, 1))::integer];
  v_noun := v_nouns[1 + floor(random() * array_length(v_nouns, 1))::integer];
  v_num := 100 + floor(random() * 9900)::integer;

  return format('%s-%s-%s', v_adj, v_noun, v_num);
end;
$$;

create or replace function private.generate_unique_username_v1()
returns text
language plpgsql
security definer
set search_path = private, account
as $$
declare
  v_candidate text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_candidate := private.generate_username_candidate_v1();

    if v_candidate = 'me' then
      continue;
    end if;

    if not exists (
      select 1
      from account.profiles p
      where lower(p.username) = lower(v_candidate)
    ) then
      return v_candidate;
    end if;

    if v_attempt >= 25 then
      return format('user-%s', substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12));
    end if;
  end loop;
end;
$$;

update account.profiles p
set
  username = private.generate_unique_username_v1(),
  username_change_count = 0,
  username_changed_at = null,
  updated_at = now()
where p.username is null
   or btrim(p.username) = '';

create or replace function private.apply_profile_username_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = private, account
as $$
begin
  if new.username is not null then
    new.username := lower(btrim(new.username));
  end if;

  if tg_op = 'UPDATE' and new.username is distinct from old.username then
    if old.username_change_count >= 1 then
      raise exception 'Username can only be changed once';
    end if;

    if new.username is null or btrim(new.username) = '' then
      raise exception 'Username cannot be empty';
    end if;

    if new.username = 'me' then
      raise exception 'Username is reserved';
    end if;

    new.username_change_count := old.username_change_count + 1;
    new.username_changed_at := coalesce(new.username_changed_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_username_policy_v1 on account.profiles;
create trigger trg_profiles_username_policy_v1
before update on account.profiles
for each row execute function private.apply_profile_username_policy_v1();

create or replace function account.handle_new_auth_user_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = account, public, private
as $$
begin
  insert into account.profiles (user_id, username)
  values (new.id, private.generate_unique_username_v1())
  on conflict (user_id) do nothing;

  insert into account.user_roles (user_id, role_key)
  values (new.id, 'member')
  on conflict (user_id, role_key) do nothing;

  return new;
end;
$$;

create or replace function public.change_my_username_v1(
  p_username text
)
returns account.profiles
language plpgsql
security invoker
set search_path = public, account
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_profile account.profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_username = '' then
    raise exception 'Username is required';
  end if;

  if v_username = 'me' then
    raise exception 'Username is reserved';
  end if;

  if v_username !~ '^[a-z0-9_](?:[a-z0-9_-]{1,30}[a-z0-9_])?$' then
    raise exception 'Username must be 3-32 chars and use only lowercase letters, numbers, dash, underscore';
  end if;

  update account.profiles p
  set
    username = v_username,
    updated_at = now()
  where p.user_id = v_uid
  returning p.* into v_profile;

  if v_profile.user_id is null then
    raise exception 'Profile not found';
  end if;

  return v_profile;
exception
  when unique_violation then
    raise exception 'Username is already taken';
end;
$$;

grant execute on function public.change_my_username_v1(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile avatars read" on storage.objects;
drop policy if exists "Profile avatars upload own" on storage.objects;
drop policy if exists "Profile avatars update own" on storage.objects;
drop policy if exists "Profile avatars delete own" on storage.objects;

create policy "Profile avatars read"
  on storage.objects
  for select
  using (bucket_id = 'profile-avatars');

create policy "Profile avatars upload own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Profile avatars update own"
  on storage.objects
  for update
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Profile avatars delete own"
  on storage.objects
  for delete
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
