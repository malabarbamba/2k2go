-- Baseline v1: private helper functions

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.normalize_arabic(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text := coalesce(input, '');
begin
  s := regexp_replace(s, '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g');
  s := replace(s, 'ـ', '');
  s := regexp_replace(s, '[أإآا]', 'ا', 'g');
  s := regexp_replace(s, '[ؤ]', 'و', 'g');
  s := regexp_replace(s, '[ئ]', 'ي', 'g');
  s := regexp_replace(s, '[ىی]', 'ي', 'g');
  s := regexp_replace(s, '[ة]', 'ه', 'g');
  s := regexp_replace(s, '[ء]', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := btrim(lower(s));
  return nullif(s, '');
end;
$$;

create or replace function private.normalize_text(input text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(lower(unaccent(regexp_replace(coalesce(input, ''), '\s+', ' ', 'g')))),
    ''
  );
$$;

create or replace function private.user_pair_low(a uuid, b uuid)
returns uuid
language sql
immutable
as $$
  select case when a::text < b::text then a else b end;
$$;

create or replace function private.user_pair_high(a uuid, b uuid)
returns uuid
language sql
immutable
as $$
  select case when a::text < b::text then b else a end;
$$;

create or replace function private.current_uid()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;
