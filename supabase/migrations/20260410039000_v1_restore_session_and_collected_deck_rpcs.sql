-- Baseline v1: restore missing session tracking + collected deck compatibility RPCs

create table if not exists public.app_v2_session_unique_visitors (
  visitor_id text primary key,
  first_seen_at timestamptz not null default now(),
  first_seen_user_id uuid null references auth.users(id) on delete set null,
  source_path text not null default '/app/session',
  constraint app_v2_session_unique_visitors_source_path_check
    check (source_path in ('/app-v2/session', '/app/session'))
);

alter table public.app_v2_session_unique_visitors enable row level security;

drop function if exists public.track_app_v2_session_unique_visitor(text, uuid);
create function public.track_app_v2_session_unique_visitor(
  p_visitor_id text,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_visitor_id text;
  v_actor_user_id uuid;
begin
  v_visitor_id := lower(btrim(coalesce(p_visitor_id, '')));

  if v_visitor_id = '' or char_length(v_visitor_id) > 128 then
    raise exception 'invalid visitor id';
  end if;

  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    v_actor_user_id := p_user_id;
  end if;

  insert into public.app_v2_session_unique_visitors (
    visitor_id,
    first_seen_user_id
  )
  values (
    v_visitor_id,
    v_actor_user_id
  )
  on conflict (visitor_id) do update
  set first_seen_user_id = coalesce(
    public.app_v2_session_unique_visitors.first_seen_user_id,
    excluded.first_seen_user_id
  );
end;
$$;

drop function if exists public.get_app_v2_session_unique_visitors_total();
create function public.get_app_v2_session_unique_visitors_total()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, account, auth
as $$
declare
  v_actor_user_id uuid;
  v_total bigint;
begin
  v_actor_user_id := auth.uid();

  if v_actor_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from account.user_roles ur
    where ur.user_id = v_actor_user_id
      and ur.role_key = 'admin'
  ) then
    raise exception 'admin access required';
  end if;

  select count(*)::bigint
  into v_total
  from public.app_v2_session_unique_visitors;

  return v_total;
end;
$$;

drop function if exists public.has_collected_deck_in_account_v1();
create function public.has_collected_deck_in_account_v1()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, learning, catalog, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  return (
    exists (
      select 1
      from learning.user_cards uc
      where uc.user_id = v_user_id
        and coalesce(uc.metadata->>'source_type', '') = 'collected'
    )
    or exists (
      select 1
      from learning.user_cards uc
      join catalog.card_origins co
        on co.card_id = uc.card_id
      where uc.user_id = v_user_id
        and co.origin_kind = 'video_extracted'
    )
  );
end;
$$;

revoke all on table public.app_v2_session_unique_visitors from public;
revoke all on table public.app_v2_session_unique_visitors from anon;
revoke all on table public.app_v2_session_unique_visitors from authenticated;
grant all on table public.app_v2_session_unique_visitors to service_role;

revoke all on function public.track_app_v2_session_unique_visitor(text, uuid) from public;
revoke all on function public.track_app_v2_session_unique_visitor(text, uuid) from anon;
revoke all on function public.track_app_v2_session_unique_visitor(text, uuid) from authenticated;

revoke all on function public.get_app_v2_session_unique_visitors_total() from public;
revoke all on function public.get_app_v2_session_unique_visitors_total() from anon;
revoke all on function public.get_app_v2_session_unique_visitors_total() from authenticated;

revoke all on function public.has_collected_deck_in_account_v1() from public;

grant execute on function public.track_app_v2_session_unique_visitor(text, uuid) to anon;
grant execute on function public.track_app_v2_session_unique_visitor(text, uuid) to authenticated;
grant execute on function public.track_app_v2_session_unique_visitor(text, uuid) to service_role;

grant execute on function public.get_app_v2_session_unique_visitors_total() to authenticated;
grant execute on function public.get_app_v2_session_unique_visitors_total() to service_role;

grant execute on function public.has_collected_deck_in_account_v1() to authenticated;
grant execute on function public.has_collected_deck_in_account_v1() to service_role;

notify pgrst, 'reload schema';
