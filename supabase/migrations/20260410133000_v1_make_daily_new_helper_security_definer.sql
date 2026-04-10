-- Baseline v1: allow daily-new helper to read scheduler/profile single source

create or replace function public.ensure_daily_new_card_availability_v1(
  p_user_id uuid default auth.uid(),
  p_now_utc timestamptz default now()
)
returns table (
  daily_new_cap integer,
  pending_new_count integer,
  introduced_today_count integer,
  inserted_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, account, learning, catalog, auth
as $$
declare
  v_user_id uuid := p_user_id;
  v_now_utc timestamptz := coalesce(p_now_utc, now());
  v_timezone text := 'UTC';
  v_cutoff_hour integer := 4;
  v_local_now timestamp;
  v_day_start_local timestamp;
  v_day_start_utc timestamptz;
  v_day_end_utc timestamptz;
  v_max_daily_new integer := 20;
  v_pending_new integer := 0;
  v_introduced_today integer := 0;
  v_remaining_today integer := 0;
  v_capacity_gap integer := 0;
  v_to_insert integer := 0;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from v_user_id then
    raise exception 'Cannot mutate another user';
  end if;

  insert into learning.scheduler_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select
    coalesce(nullif(btrim(sp.timezone), ''), nullif(btrim(p.timezone), ''), 'UTC'),
    least(20, greatest(0, coalesce(sp.max_daily_new, 20)))
  into
    v_timezone,
    v_max_daily_new
  from account.profiles p
  left join learning.scheduler_profiles sp
    on sp.user_id = p.user_id
  where p.user_id = v_user_id
  limit 1;

  v_timezone := coalesce(nullif(btrim(v_timezone), ''), 'UTC');
  v_max_daily_new := least(20, greatest(0, coalesce(v_max_daily_new, 20)));

  v_local_now := timezone(v_timezone, v_now_utc);
  v_day_start_local := date_trunc('day', v_local_now - make_interval(hours => v_cutoff_hour)) + make_interval(hours => v_cutoff_hour);
  v_day_start_utc := v_day_start_local at time zone v_timezone;
  v_day_end_utc := v_day_start_utc + interval '1 day';

  select count(*)::integer
  into v_pending_new
  from learning.user_cards uc
  where uc.user_id = v_user_id
    and uc.state = 'new'
    and uc.archived_at is null
    and uc.suspended_at is null;

  select count(*)::integer
  into v_introduced_today
  from learning.user_cards uc
  where uc.user_id = v_user_id
    and uc.introduced_at is not null
    and uc.introduced_at >= v_day_start_utc
    and uc.introduced_at < v_day_end_utc;

  v_remaining_today := greatest(0, v_max_daily_new - coalesce(v_introduced_today, 0));
  v_capacity_gap := greatest(0, v_max_daily_new - coalesce(v_pending_new, 0));
  v_to_insert := least(v_remaining_today, v_capacity_gap);

  if v_to_insert > 0 then
    with foundation_cards as (
      select
        c.id as card_id,
        min(c.frequency_rank) as frequency_rank
      from catalog.cards c
      join catalog.card_origins o
        on o.card_id = c.id
      where o.origin_kind = 'foundation_seed'
      group by c.id
    ),
    candidates as (
      select fc.card_id
      from foundation_cards fc
      left join learning.user_cards uc
        on uc.user_id = v_user_id
       and uc.card_id = fc.card_id
      where uc.card_id is null
      order by fc.frequency_rank asc nulls last, fc.card_id asc
      limit v_to_insert
    ),
    inserted as (
      insert into learning.user_cards (
        user_id,
        card_id,
        state,
        due_at,
        introduced_at,
        metadata
      )
      select
        v_user_id,
        candidate.card_id,
        'new'::learning.user_card_state_kind,
        v_now_utc,
        v_now_utc,
        jsonb_build_object('source_type', 'foundation')
      from candidates candidate
      on conflict (user_id, card_id) do nothing
      returning 1
    )
    select count(*)::integer
    into v_inserted
    from inserted;
  end if;

  return query
  select
    v_max_daily_new,
    coalesce(v_pending_new, 0) + coalesce(v_inserted, 0),
    coalesce(v_introduced_today, 0) + coalesce(v_inserted, 0),
    coalesce(v_inserted, 0);
end;
$$;

revoke all on function public.ensure_daily_new_card_availability_v1(uuid, timestamptz) from public;
grant execute on function public.ensure_daily_new_card_availability_v1(uuid, timestamptz) to authenticated;
grant execute on function public.ensure_daily_new_card_availability_v1(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
