-- Harden public schema posture and prevent security drift.

create schema if not exists private;

create or replace function private.enforce_public_schema_guardrails()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  obj record;
begin
  for obj in
    select n.nspname as schema_name, c.relname as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    execute format(
      'alter view %I.%I set (security_invoker = true)',
      obj.schema_name,
      obj.object_name
    );
  end loop;

  for obj in
    select n.nspname as schema_name, c.relname as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    execute format(
      'alter table %I.%I enable row level security',
      obj.schema_name,
      obj.object_name
    );
    execute format(
      'alter table %I.%I force row level security',
      obj.schema_name,
      obj.object_name
    );
  end loop;
end;
$$;

create or replace function private.assert_public_schema_guardrails()
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  insecure_views integer;
  non_rls_tables integer;
begin
  select count(*)
  into insecure_views
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not exists (
      select 1
      from pg_depend d
      where d.classid = 'pg_class'::regclass
        and d.objid = c.oid
        and d.deptype = 'e'
    )
    and not exists (
      select 1
      from unnest(coalesce(c.reloptions, '{}'::text[])) as opt
      where opt in ('security_invoker=true', 'security_invoker=on')
    );

  if insecure_views > 0 then
    raise exception 'public schema contains % view(s) without security_invoker=true', insecure_views;
  end if;

  select count(*)
  into non_rls_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not exists (
      select 1
      from pg_depend d
      where d.classid = 'pg_class'::regclass
        and d.objid = c.oid
        and d.deptype = 'e'
    )
    and (c.relrowsecurity = false or c.relforcerowsecurity = false);

  if non_rls_tables > 0 then
    raise exception 'public schema contains % table(s) without forced row level security', non_rls_tables;
  end if;
end;
$$;

select private.enforce_public_schema_guardrails();
select private.assert_public_schema_guardrails();
