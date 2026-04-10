-- Security hardening: central rate limits table + explicit SECURITY DEFINER grants

create table if not exists public.edge_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (bucket, key_hash)
);
alter table public.edge_rate_limits enable row level security;
alter table public.edge_rate_limits force row level security;
drop policy if exists edge_rate_limits_service_role_manage on public.edge_rate_limits;
create policy edge_rate_limits_service_role_manage
on public.edge_rate_limits
for all
to service_role
using (true)
with check (true);
create index if not exists idx_edge_rate_limits_bucket_window
  on public.edge_rate_limits (bucket, window_start desc);
-- Explicit SECURITY DEFINER privilege posture
revoke all on function public.upsert_daily_activity(uuid, date, integer, integer, integer) from public;
grant execute on function public.upsert_daily_activity(uuid, date, integer, integer, integer) to authenticated;
grant execute on function public.upsert_daily_activity(uuid, date, integer, integer, integer) to service_role;
revoke all on function public.update_user_progress(uuid, date) from public;
grant execute on function public.update_user_progress(uuid, date) to authenticated;
grant execute on function public.update_user_progress(uuid, date) to service_role;
revoke all on function public.has_pro_access(text) from public;
grant execute on function public.has_pro_access(text) to authenticated;
grant execute on function public.has_pro_access(text) to service_role;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;
revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to service_role;
revoke all on function public.claim_review_session_lease_v1(uuid, integer) from public;
grant execute on function public.claim_review_session_lease_v1(uuid, integer) to authenticated;
grant execute on function public.claim_review_session_lease_v1(uuid, integer) to service_role;
