do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'learning'
      and tablename = 'user_cards'
  ) then
    alter publication supabase_realtime add table learning.user_cards;
  end if;
end;
$$;
