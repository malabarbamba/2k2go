-- Baseline v1 data migration: account domain

do $$
declare
  v_role_col text;
  v_source record;
begin
  -- Seed placeholder auth.users rows for legacy staged user ids so FK-backed
  -- account/social inserts can succeed even when auth records were not copied.
  create temporary table tmp_legacy_user_ids (
    user_id uuid primary key
  ) on commit drop;

  for v_source in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and udt_name = 'uuid'
      and column_name ~ '(^user_id$|_user_id$|^user_a_id$|^user_b_id$)'
  loop
    execute format(
      'insert into tmp_legacy_user_ids(user_id) select distinct %1$I from public.%2$I where %1$I is not null on conflict do nothing',
      v_source.column_name,
      v_source.table_name
    );
  end loop;

  insert into auth.users (
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  select
    t.user_id,
    'authenticated',
    'authenticated',
    'legacy+' || replace(t.user_id::text, '-', '') || '@migrated.local',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  from tmp_legacy_user_ids t
  on conflict (id) do nothing;

  if to_regclass('public.profiles') is not null then
    insert into account.profiles (
      user_id,
      created_at,
      updated_at
    )
    select
      p.user_id,
      coalesce(p.created_at, now()),
      coalesce(p.updated_at, coalesce(p.created_at, now()))
    from public.profiles p
    where p.user_id is not null
    on conflict (user_id) do update
    set
      updated_at = greatest(account.profiles.updated_at, excluded.updated_at);

    begin
      update account.profiles ap
      set display_name = nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
      from public.profiles p
      where p.user_id = ap.user_id
        and ap.display_name is null;
    exception when undefined_column then
      null;
    end;

    begin
      update account.profiles ap
      set username = p.username
      from public.profiles p
      where p.user_id = ap.user_id
        and p.username is not null
        and p.username ~ '^[a-z0-9_]{3,32}$'
        and ap.username is distinct from p.username;
    exception when undefined_column then
      null;
    end;

    begin
      update account.profiles ap
      set locale = coalesce(nullif(p.preferred_locale, ''), ap.locale)
      from public.profiles p
      where p.user_id = ap.user_id;
    exception when undefined_column then
      null;
    end;

    begin
      update account.profiles ap
      set timezone = coalesce(nullif(p.timezone, ''), ap.timezone)
      from public.profiles p
      where p.user_id = ap.user_id;
    exception when undefined_column then
      null;
    end;

    begin
      update account.profiles ap
      set avatar_url = p.avatar_url
      from public.profiles p
      where p.user_id = ap.user_id
        and p.avatar_url is not null;
    exception when undefined_column then
      null;
    end;

    begin
      update account.profiles ap
      set email_notifications_enabled = p.notifications_email
      from public.profiles p
      where p.user_id = ap.user_id
        and p.notifications_email is not null;
    exception when undefined_column then
      null;
    end;
  end if;

  if to_regclass('public.user_roles') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_roles'
        and column_name = 'role_key'
    ) then
      v_role_col := 'role_key';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_roles'
        and column_name = 'role'
    ) then
      v_role_col := 'role';
    else
      v_role_col := null;
    end if;

    if v_role_col is not null then
      execute format(
        $sql$
        insert into account.user_roles (user_id, role_key, created_at)
        select
          ur.user_id,
          case
            when %1$I::text in ('admin', 'moderator', 'member') then %1$I::text
            else 'member'
          end as role_key,
          coalesce(ur.created_at, now())
        from public.user_roles ur
        where ur.user_id is not null
        on conflict (user_id, role_key) do nothing
        $sql$,
        v_role_col
      );
    end if;
  end if;

  insert into account.user_roles (user_id, role_key)
  select p.user_id, 'member'
  from account.profiles p
  on conflict (user_id, role_key) do nothing;
end
$$;
