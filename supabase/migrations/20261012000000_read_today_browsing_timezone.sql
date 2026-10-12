-- read_today_browsing v2: return the owner's rows for THEIR local day.
-- The old version truncated at UTC midnight (date_trunc('day', now())), so
-- anyone east of UTC lost the hours between local midnight and UTC midnight,
-- and the popup's "today" never matched the Stats page (which uses local
-- midnight via dayRange in app/lib/stats.ts).
--
-- The popup passes its IANA time zone (p_tz). The parameter defaults to
-- 'UTC', so the previous 1-argument call keeps working during a deploy.
-- An invalid/unknown zone silently falls back to UTC instead of erroring.
-- Idempotent — safe to re-run. Run in the Supabase SQL Editor.

create or replace function public.read_today_browsing(
  p_token text,
  p_tz text default 'UTC'
)
returns table (domain text, duration_seconds integer, visited_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  h text := encode(sha256(decode(nullif(trim(coalesce(p_token, '')), ''), 'hex')), 'hex');
  tz_name text := coalesce(nullif(trim(coalesce(p_tz, '')), ''), 'UTC');
  day_start timestamptz;
begin
  select t.user_id into owner
  from public.extension_tokens t
  where t.token_hash = h and t.revoked_at is null;
  if owner is null then
    raise exception 'Unknown or revoked extension token';
  end if;

  -- Local midnight in the caller's zone as a timestamptz: `now() at time
  -- zone tz` is the wall clock there, truncating to the day takes local
  -- midnight, and `at time zone tz` converts that wall time back to the
  -- correct instant (DST-correct, since the zone is IANA).
  begin
    day_start := date_trunc('day', now() at time zone tz_name) at time zone tz_name;
  exception when others then
    day_start := date_trunc('day', now()); -- unknown zone -> previous UTC behavior
  end;

  return query
    select b.domain, b.duration_seconds, b.visited_at
    from public.browsing_sessions b
    where b.user_id = owner
      and b.visited_at >= day_start
    order by b.visited_at asc;
end;
$$;
