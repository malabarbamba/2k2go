begin;

create table if not exists public.deck_download_events (
  id uuid primary key default gen_random_uuid(),
  click_id text not null,
  created_at timestamp with time zone not null default timezone('utc', now()),
  deck_key text not null,
  source_name text not null,
  page_path text not null,
  referrer text,
  locale text,
  user_id uuid,
  visitor_id text,
  country text,
  browser text,
  user_agent text,
  ip_hash text
);

alter table public.deck_download_events enable row level security;

revoke all on table public.deck_download_events from public;
revoke all on table public.deck_download_events from anon;
revoke all on table public.deck_download_events from authenticated;
grant select, insert, update, delete on table public.deck_download_events to service_role;

create unique index if not exists deck_download_events_click_id_key
  on public.deck_download_events (click_id);

create index if not exists deck_download_events_created_at_idx
  on public.deck_download_events (created_at desc);

create index if not exists deck_download_events_deck_key_created_at_idx
  on public.deck_download_events (deck_key, created_at desc);

create index if not exists deck_download_events_source_name_created_at_idx
  on public.deck_download_events (source_name, created_at desc);

create index if not exists deck_download_events_country_created_at_idx
  on public.deck_download_events (country, created_at desc)
  where country is not null;

create index if not exists deck_download_events_user_id_created_at_idx
  on public.deck_download_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists deck_download_events_visitor_id_created_at_idx
  on public.deck_download_events (visitor_id, created_at desc)
  where visitor_id is not null;

create or replace function public.get_app_admin_overview_v1()
returns table (
  unique_visitors_total bigint,
  accounts_total bigint,
  deck_downloads_total bigint
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'account', 'auth'
as $function$
declare
  v_actor_user_id uuid;
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

  return query
  select
    (
      select count(*)::bigint
      from public.app_v2_session_unique_visitors
    ) as unique_visitors_total,
    (
      select count(*)::bigint
      from auth.users u
      where coalesce(u.email, '') <> ''
        and u.email not ilike 'legacy+%@migrated.local'
    ) as accounts_total,
    (
      select count(*)::bigint
      from public.deck_download_events dde
      where dde.deck_key = 'enki_deck'
    ) as deck_downloads_total;
end;
$function$;

revoke all on function public.get_app_admin_overview_v1() from public;
grant execute on function public.get_app_admin_overview_v1() to authenticated;
grant execute on function public.get_app_admin_overview_v1() to service_role;

commit;
