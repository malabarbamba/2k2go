-- Admin-only metric: total number of real accounts.

drop function if exists public.get_total_accounts_count_v1();
create function public.get_total_accounts_count_v1()
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
  from auth.users u
  where coalesce(u.email, '') <> ''
    and u.email not ilike 'legacy+%@migrated.local';

  return v_total;
end;
$$;

revoke all on function public.get_total_accounts_count_v1() from public;
revoke all on function public.get_total_accounts_count_v1() from anon;
revoke all on function public.get_total_accounts_count_v1() from authenticated;

grant execute on function public.get_total_accounts_count_v1() to authenticated;
grant execute on function public.get_total_accounts_count_v1() to service_role;

notify pgrst, 'reload schema';
