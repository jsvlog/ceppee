-- Leaderboard: who earned the most XP today / this week / all-time, per track.
--
-- XP is derived from exam_attempts (one row per finished paper or drill), NOT from
-- anything the browser sends, so a student cannot post their own score. It uses
-- exactly the arithmetic in src/lib/game.ts so the number here matches the level
-- badge on the hub:
--
--     xp = score * 10 + (150 when the paper is a timed exam and score/total >= pass)
--
-- pass = 80% for CSE, 75% for LET (passingPctFor()).
--
-- Day and week boundaries are Asia/Manila, not UTC: a 9pm study session in Manila
-- must count as today, not as tomorrow (UTC would roll it over at 8am).
--
-- Excluded from every board: admins and throwaway test accounts (emails starting
-- with ceppee- or ui-check). Emails are never returned — the caller only sees a
-- display name (first name + last initial).
--
-- Idempotent.

create index if not exists exam_attempts_user_time_idx
  on public.exam_attempts (user_id, completed_at desc);
create index if not exists exam_attempts_track_time_idx
  on public.exam_attempts (track, completed_at desc);

-- ---------------------------------------------------------------------------
-- leaderboard_rows(): the whole ranked board for a track + period.
-- Internal shape shared by leaderboard() and leaderboard_me().
-- ---------------------------------------------------------------------------
drop function if exists public.leaderboard_rows(text, text);
create function public.leaderboard_rows(p_track text, p_period text default 'weekly')
returns table(
  rank int,
  user_id uuid,
  display_name text,
  xp int,
  level int,
  papers int,
  items int,
  first_at timestamptz,
  is_me boolean
) language plpgsql security definer set search_path = public as $$
declare
  v_period text := lower(coalesce(nullif(trim(p_period), ''), 'weekly'));
  v_from timestamptz;
begin
  if v_period not in ('daily', 'weekly', 'all') then
    raise exception 'leaderboard period must be daily, weekly or all (got %)', p_period;
  end if;

  -- Rolling window in Manila local time.
  v_from := case v_period
    when 'daily'  then (date_trunc('day',  now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila'
    when 'weekly' then (date_trunc('week', now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila'
    else null
  end;

  return query
  with scored as (
    select a.user_id,
           sum(
             greatest(0, coalesce(a.score, 0)) * 10
             + case
                 when a.kind = 'exam'
                      and coalesce(a.total, 0) > 0
                      and a.score::numeric / a.total
                          >= case when a.track = 'CSE' then 0.80 else 0.75 end
                 then 150 else 0
               end
           )::int as xp,
           count(*)::int as papers,
           sum(greatest(0, coalesce(a.total, 0)))::int as items,
           min(a.completed_at) as first_at
      from public.exam_attempts a
     where a.track = p_track
       and (v_from is null or a.completed_at >= v_from)
       and coalesce(a.total, 0) > 0
     group by a.user_id
  ), named as (
    select s.*,
           coalesce(nullif(trim(p.full_name), ''), '') as full_name
      from scored s
      join public.profiles p on p.id = s.user_id
     where not p.is_admin
       and p.email not like 'ceppee-%'
       and p.email not like 'ui-check%'
  )
  select (row_number() over (
            order by n.xp desc, n.items desc, n.first_at asc, n.user_id
          ))::int as rank,
         n.user_id,
         case
           when n.full_name = '' then 'Ka-Ceppee #' || left(n.user_id::text, 4)
           when position(' ' in n.full_name) > 0
             then split_part(n.full_name, ' ', 1) || ' '
                  || left(nullif(split_part(n.full_name, ' ', 2), ''), 1) || '.'
           else n.full_name
         end as display_name,
         n.xp,
         (floor(n.xp / 500.0) + 1)::int as level,
         n.papers,
         n.items,
         n.first_at,
         (n.user_id = auth.uid()) as is_me
    from named n
   where n.xp > 0
   order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- leaderboard(track, period, limit) -> the top of the board.
-- ---------------------------------------------------------------------------
drop function if exists public.leaderboard(text, text, int);
create function public.leaderboard(p_track text, p_period text default 'weekly', p_limit int default 20)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  xp int,
  level int,
  papers int,
  items int,
  is_me boolean
) language sql security definer set search_path = public as $$
  select r.rank, r.user_id, r.display_name, r.xp, r.level, r.papers, r.items, r.is_me
    from public.leaderboard_rows(p_track, p_period) r
   order by r.rank
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- ---------------------------------------------------------------------------
-- leaderboard_me(track, period, span) -> my row plus `span` rows each side,
-- with the board meta repeated on every row (players, resets_at, my rank).
-- Returns nothing when the caller has no attempts in the period.
-- ---------------------------------------------------------------------------
drop function if exists public.leaderboard_me(text, text, int);
create function public.leaderboard_me(p_track text, p_period text default 'weekly', p_span int default 2)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  xp int,
  level int,
  papers int,
  items int,
  is_me boolean,
  players int,
  resets_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_period text := lower(coalesce(nullif(trim(p_period), ''), 'weekly'));
  v_span int := greatest(0, least(coalesce(p_span, 2), 10));
  v_me int;
  v_players int;
  v_resets timestamptz;
begin
  select count(*)::int into v_players from public.leaderboard_rows(p_track, v_period);
  select r.rank into v_me from public.leaderboard_rows(p_track, v_period) r where r.is_me;
  if v_me is null then return; end if;

  v_resets := case v_period
    when 'daily'  then (date_trunc('day',  now() at time zone 'Asia/Manila') + interval '1 day')
                          at time zone 'Asia/Manila'
    when 'weekly' then (date_trunc('week', now() at time zone 'Asia/Manila') + interval '1 week')
                          at time zone 'Asia/Manila'
    else null
  end;

  return query
    select r.rank, r.user_id, r.display_name, r.xp, r.level, r.papers, r.items, r.is_me,
           v_players, v_resets
      from public.leaderboard_rows(p_track, v_period) r
     where r.rank between greatest(1, v_me - v_span) and v_me + v_span
     order by r.rank;
end $$;

-- Postgres grants EXECUTE to PUBLIC on a new function, so revoking from anon alone
-- leaves the default grant in place: revoke PUBLIC, then grant back to authenticated.
revoke execute on function public.leaderboard_rows(text, text) from public, anon, authenticated;
revoke execute on function public.leaderboard(text, text, int) from public, anon;
revoke execute on function public.leaderboard_me(text, text, int) from public, anon;
grant execute on function public.leaderboard(text, text, int) to authenticated;
grant execute on function public.leaderboard_me(text, text, int) to authenticated;
