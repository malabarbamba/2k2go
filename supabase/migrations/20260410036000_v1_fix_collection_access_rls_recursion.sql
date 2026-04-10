-- Baseline v1: break catalog.collections <-> social.collection_access RLS recursion

create or replace function private.is_collection_owner_v1(
  p_collection_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, catalog, auth
as $$
  select exists (
    select 1
    from catalog.collections c
    where c.id = p_collection_id
      and c.owner_user_id = auth.uid()
  );
$$;

revoke all on function private.is_collection_owner_v1(uuid) from public;
grant execute on function private.is_collection_owner_v1(uuid) to authenticated;

drop policy if exists p_collection_access_select on social.collection_access;
create policy p_collection_access_select
on social.collection_access
for select
to authenticated
using (
  grantee_user_id = (select auth.uid())
  or private.is_collection_owner_v1(collection_access.collection_id)
);

drop policy if exists p_collection_access_mutate_owner on social.collection_access;
create policy p_collection_access_mutate_owner
on social.collection_access
for all
to authenticated
using (private.is_collection_owner_v1(collection_access.collection_id))
with check (private.is_collection_owner_v1(collection_access.collection_id));
