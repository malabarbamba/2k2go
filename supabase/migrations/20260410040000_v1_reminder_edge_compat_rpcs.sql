-- Baseline v1: reminder edge compatibility RPCs on public schema

drop function if exists public.get_review_reminder_config_state_v1(uuid);
create function public.get_review_reminder_config_state_v1(
  p_user_id uuid
)
returns table (
  user_id uuid,
  enabled boolean,
  email_enabled boolean,
  calendar_enabled boolean,
  web_push_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  calendar_token text,
  active_subscription_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, reminder, extensions
as $$
declare
  v_token text;
  v_active_subscription_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  insert into reminder.preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select cf.token
  into v_token
  from reminder.calendar_feeds cf
  where cf.user_id = p_user_id
    and cf.scope = 'all_cards'
    and cf.collection_id is null
    and cf.is_active = true
  order by cf.created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(20), 'hex');

    insert into reminder.calendar_feeds (
      user_id,
      token,
      scope,
      collection_id,
      is_active
    )
    values (
      p_user_id,
      v_token,
      'all_cards',
      null,
      true
    );
  end if;

  select count(*)::integer
  into v_active_subscription_count
  from reminder.push_subscriptions ps
  where ps.user_id = p_user_id
    and ps.is_active = true;

  return query
  select
    rp.user_id,
    rp.enabled,
    rp.email_enabled,
    rp.in_app_enabled as calendar_enabled,
    rp.push_enabled as web_push_enabled,
    rp.created_at,
    rp.updated_at,
    v_token,
    coalesce(v_active_subscription_count, 0)
  from reminder.preferences rp
  where rp.user_id = p_user_id;
end;
$$;

drop function if exists public.patch_review_reminder_preferences_v1(uuid, boolean, boolean, boolean, boolean);
create function public.patch_review_reminder_preferences_v1(
  p_user_id uuid,
  p_enabled boolean default null,
  p_email_enabled boolean default null,
  p_calendar_enabled boolean default null,
  p_web_push_enabled boolean default null
)
returns table (
  user_id uuid,
  enabled boolean,
  email_enabled boolean,
  calendar_enabled boolean,
  web_push_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, reminder
as $$
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  insert into reminder.preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update reminder.preferences rp
  set
    enabled = coalesce(p_enabled, rp.enabled),
    email_enabled = case
      when coalesce(p_enabled, rp.enabled) = false then false
      else coalesce(p_email_enabled, rp.email_enabled)
    end,
    in_app_enabled = case
      when coalesce(p_enabled, rp.enabled) = false then false
      else coalesce(p_calendar_enabled, rp.in_app_enabled)
    end,
    push_enabled = case
      when coalesce(p_enabled, rp.enabled) = false then false
      else coalesce(p_web_push_enabled, rp.push_enabled)
    end,
    updated_at = now()
  where rp.user_id = p_user_id;

  return query
  select
    rp.user_id,
    rp.enabled,
    rp.email_enabled,
    rp.in_app_enabled as calendar_enabled,
    rp.push_enabled as web_push_enabled,
    rp.created_at,
    rp.updated_at
  from reminder.preferences rp
  where rp.user_id = p_user_id;
end;
$$;

drop function if exists public.rotate_review_reminder_calendar_token_v2(uuid);
create function public.rotate_review_reminder_calendar_token_v2(
  p_user_id uuid
)
returns table (
  calendar_token text
)
language plpgsql
security definer
set search_path = pg_catalog, public, reminder, extensions
as $$
declare
  v_previous_feed_id uuid;
  v_token text;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  select cf.id
  into v_previous_feed_id
  from reminder.calendar_feeds cf
  where cf.user_id = p_user_id
    and cf.scope = 'all_cards'
    and cf.collection_id is null
    and cf.is_active = true
  order by cf.created_at desc
  limit 1;

  if v_previous_feed_id is not null then
    update reminder.calendar_feeds
    set is_active = false
    where id = v_previous_feed_id;
  end if;

  v_token := encode(extensions.gen_random_bytes(20), 'hex');

  insert into reminder.calendar_feeds (
    user_id,
    token,
    scope,
    collection_id,
    is_active,
    rotated_from
  )
  values (
    p_user_id,
    v_token,
    'all_cards',
    null,
    true,
    v_previous_feed_id
  );

  return query
  select v_token;
end;
$$;

drop function if exists public.list_review_reminder_push_subscriptions_v1(uuid);
create function public.list_review_reminder_push_subscriptions_v1(
  p_user_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  expiration_time timestamptz,
  user_agent text,
  device_label text,
  enabled boolean,
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error_status integer,
  last_error_message text,
  failure_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, reminder
as $$
  select
    ps.id,
    ps.user_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth_secret as auth,
    null::timestamptz as expiration_time,
    ps.user_agent,
    null::text as device_label,
    ps.is_active as enabled,
    null::timestamptz as last_sent_at,
    null::timestamptz as last_error_at,
    null::integer as last_error_status,
    null::text as last_error_message,
    0::integer as failure_count,
    ps.created_at,
    ps.updated_at
  from reminder.push_subscriptions ps
  where ps.user_id = p_user_id
  order by ps.created_at asc;
$$;

drop function if exists public.upsert_review_reminder_push_subscription_v1(uuid, text, text, text, text);
create function public.upsert_review_reminder_push_subscription_v1(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns table (
  id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  expiration_time timestamptz,
  user_agent text,
  device_label text,
  enabled boolean,
  last_sent_at timestamptz,
  last_error_at timestamptz,
  last_error_status integer,
  last_error_message text,
  failure_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, reminder
as $$
declare
  v_subscription_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'endpoint is required';
  end if;

  if p_p256dh is null or btrim(p_p256dh) = '' then
    raise exception 'p256dh is required';
  end if;

  if p_auth is null or btrim(p_auth) = '' then
    raise exception 'auth is required';
  end if;

  insert into reminder.preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into reminder.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_secret,
    user_agent,
    is_active,
    last_seen_at
  )
  values (
    p_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    true,
    now()
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent,
    is_active = true,
    last_seen_at = now(),
    updated_at = now()
  returning reminder.push_subscriptions.id into v_subscription_id;

  return query
  select
    ps.id,
    ps.user_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth_secret as auth,
    null::timestamptz as expiration_time,
    ps.user_agent,
    null::text as device_label,
    ps.is_active as enabled,
    null::timestamptz as last_sent_at,
    null::timestamptz as last_error_at,
    null::integer as last_error_status,
    null::text as last_error_message,
    0::integer as failure_count,
    ps.created_at,
    ps.updated_at
  from reminder.push_subscriptions ps
  where ps.id = v_subscription_id;
end;
$$;

drop function if exists public.delete_review_reminder_push_subscription_v1(uuid, uuid, text);
create function public.delete_review_reminder_push_subscription_v1(
  p_user_id uuid,
  p_id uuid default null,
  p_endpoint text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, reminder
as $$
declare
  v_removed integer := 0;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_id is null and (p_endpoint is null or btrim(p_endpoint) = '') then
    raise exception 'id or endpoint is required';
  end if;

  with deleted as (
    delete from reminder.push_subscriptions ps
    where ps.user_id = p_user_id
      and (
        (p_id is not null and ps.id = p_id)
        or (p_id is null and p_endpoint is not null and ps.endpoint = p_endpoint)
      )
    returning 1
  )
  select count(*)::integer
  into v_removed
  from deleted;

  return coalesce(v_removed, 0);
end;
$$;

revoke all on function public.get_review_reminder_config_state_v1(uuid) from public;
revoke all on function public.patch_review_reminder_preferences_v1(uuid, boolean, boolean, boolean, boolean) from public;
revoke all on function public.rotate_review_reminder_calendar_token_v2(uuid) from public;
revoke all on function public.list_review_reminder_push_subscriptions_v1(uuid) from public;
revoke all on function public.upsert_review_reminder_push_subscription_v1(uuid, text, text, text, text) from public;
revoke all on function public.delete_review_reminder_push_subscription_v1(uuid, uuid, text) from public;

grant execute on function public.get_review_reminder_config_state_v1(uuid) to service_role;
grant execute on function public.patch_review_reminder_preferences_v1(uuid, boolean, boolean, boolean, boolean) to service_role;
grant execute on function public.rotate_review_reminder_calendar_token_v2(uuid) to service_role;
grant execute on function public.list_review_reminder_push_subscriptions_v1(uuid) to service_role;
grant execute on function public.upsert_review_reminder_push_subscription_v1(uuid, text, text, text, text) to service_role;
grant execute on function public.delete_review_reminder_push_subscription_v1(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
