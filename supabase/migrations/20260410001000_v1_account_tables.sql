-- Baseline v1: account tables

create table if not exists account.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  locale text not null default 'fr',
  timezone text not null default 'UTC',
  bio text,
  email_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,32}$')
);

create unique index if not exists uq_profiles_username
  on account.profiles (lower(username))
  where username is not null;

drop trigger if exists trg_profiles_set_updated_at on account.profiles;
create trigger trg_profiles_set_updated_at
before update on account.profiles
for each row execute function private.set_updated_at();

create table if not exists account.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_key),
  constraint user_roles_role_key_check check (role_key in ('member', 'moderator', 'admin'))
);

create or replace function account.handle_new_auth_user_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = account, public
as $$
begin
  insert into account.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into account.user_roles (user_id, role_key)
  values (new.id, 'member')
  on conflict (user_id, role_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auth_user_created_v1 on auth.users;
create trigger trg_auth_user_created_v1
after insert on auth.users
for each row
execute function account.handle_new_auth_user_profile_v1();
