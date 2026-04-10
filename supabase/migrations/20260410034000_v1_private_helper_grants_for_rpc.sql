-- Baseline v1 compatibility: allow public RPCs to resolve private helper functions

grant usage on schema private to anon, authenticated;

grant execute on function private.normalize_arabic(text) to anon, authenticated;
grant execute on function private.normalize_text(text) to anon, authenticated;
grant execute on function private.user_pair_low(uuid, uuid) to authenticated;
grant execute on function private.user_pair_high(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
