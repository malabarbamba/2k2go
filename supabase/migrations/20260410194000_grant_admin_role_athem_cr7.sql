-- Grant admin role to the requested account if it exists.

do $$
declare
  v_target_email constant text := 'athem.cr7@gmail.com';
  v_target_user_id uuid;
begin
  select u.id
  into v_target_user_id
  from auth.users u
  where lower(u.email) = lower(v_target_email)
  order by u.created_at asc
  limit 1;

  if v_target_user_id is null then
    raise notice 'No auth.users row found for %, skipping admin grant.', v_target_email;
    return;
  end if;

  insert into account.profiles (user_id)
  values (v_target_user_id)
  on conflict (user_id) do nothing;

  insert into account.user_roles (user_id, role_key, granted_by)
  values (v_target_user_id, 'admin', v_target_user_id)
  on conflict (user_id, role_key) do update
  set granted_by = excluded.granted_by;
end
$$;
