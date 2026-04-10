-- Baseline v1: allow authenticated users to delete their own account

drop function if exists public.delete_my_account_v1();
create function public.delete_my_account_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.delete_my_account_v1() from public;
grant execute on function public.delete_my_account_v1() to authenticated;

notify pgrst, 'reload schema';
