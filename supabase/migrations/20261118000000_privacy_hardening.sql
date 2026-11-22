-- Privacy hardening: token validation, write throttling, retention, and account deletion.

alter table public.extension_tokens
  add column if not exists write_window_started_at timestamptz,
  add column if not exists writes_in_window integer not null default 0;

create or replace function public.create_extension_token(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  h text := encode(sha256(decode(raw, 'hex')), 'hex');
  clean_label text := substring(trim(coalesce(p_label, '')) from 1 for 40);
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if (select count(*) from public.extension_tokens
      where user_id = auth.uid() and revoked_at is null) >= 10 then
    raise exception 'Maximum of 10 active browser links reached';
  end if;
  insert into public.extension_tokens (user_id, label, token_hash)
  values (
    auth.uid(),
    coalesce(nullif(clean_label, ''), 'browser'),
    h
  );
  return raw;
end;
$$;

create or replace function public.log_browsing_session(
  p_token text,
  p_domain text,
  p_duration_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  h text;
  writes integer;
  domain text := lower(trim(coalesce(p_domain, '')));
begin
  if p_token is null or p_token !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'Invalid extension token';
  end if;
  h := encode(sha256(decode(p_token, 'hex')), 'hex');

  if p_duration_seconds is null or p_duration_seconds < 3 then
    return;
  end if;
  if p_duration_seconds > 180 then
    raise exception 'Duration exceeds 180 seconds';
  end if;

  domain := rtrim(domain, '.');
  if length(domain) > 253
     or domain !~ '^[a-z0-9.-]+$'
     or domain !~ '\.'
     or domain ~ '(^-|-$|\.\.|^\.)'
     or domain ~ '(^-|-$)' then
    raise exception 'Invalid domain';
  end if;

  select t.user_id into owner
  from public.extension_tokens t
  where t.token_hash = h
    and t.revoked_at is null;

  if owner is null then
    raise exception 'Unknown or revoked extension token';
  end if;

  update public.extension_tokens
  set
    last_used_at = now(),
    writes_in_window =
      case
        when write_window_started_at is null
          or write_window_started_at < now() - interval '1 minute'
        then 1
        else writes_in_window + 1
      end,
    write_window_started_at =
      case
        when write_window_started_at is null
          or write_window_started_at < now() - interval '1 minute'
        then now()
        else write_window_started_at
      end
  where token_hash = h
  returning writes_in_window into writes;

  if writes > 120 then
    raise exception 'Extension write rate limit exceeded';
  end if;

  insert into public.browsing_sessions (user_id, domain, duration_seconds)
  values (owner, domain, p_duration_seconds);
end;
$$;

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
  h text;
  tz_name text := coalesce(nullif(trim(coalesce(p_tz, '')), ''), 'UTC');
  day_start timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'Invalid extension token';
  end if;
  h := encode(sha256(decode(p_token, 'hex')), 'hex');

  select t.user_id into owner
  from public.extension_tokens t
  where t.token_hash = h
    and t.revoked_at is null;
  if owner is null then
    raise exception 'Unknown or revoked extension token';
  end if;

  begin
    day_start := date_trunc('day', now() at time zone tz_name) at time zone tz_name;
  exception when others then
    day_start := date_trunc('day', now());
  end;

  return query
    select b.domain, b.duration_seconds, b.visited_at
    from public.browsing_sessions b
    where b.user_id = owner
      and b.visited_at >= day_start
    order by b.visited_at asc;
end;
$$;

create or replace function public.purge_browsing_sessions(p_retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'Retention must be between 1 and 365 days';
  end if;
  delete from public.browsing_sessions
  where user_id = auth.uid()
    and visited_at < now() - make_interval(days => p_retention_days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'Not signed in';
  end if;

  delete from public.subgoals where user_id = owner;
  delete from public.goals where user_id = owner;
  delete from public.obligations where user_id = owner;
  delete from public.calendar_events where user_id = owner;
  delete from public.focus_sessions where user_id = owner;
  delete from public.browsing_sessions where user_id = owner;
  delete from public.extension_tokens where user_id = owner;
  delete from public.feedback where user_id = owner;
  delete from public.onboarding where user_id = owner;

  delete from auth.users where id = owner;
end;
$$;

revoke all on function public.purge_browsing_sessions(integer) from public;
grant execute on function public.purge_browsing_sessions(integer) to authenticated;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- Schedule automatic 30-day purge when pg_cron is available. The app's
-- purge RPC remains available for projects that do not expose pg_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (
       select 1 from information_schema.tables
       where table_schema = 'cron' and table_name = 'job'
     )
  then
    if not exists (select 1 from cron.job where jobname = 'momentum-purge-browsing-30d') then
      perform cron.schedule(
        'momentum-purge-browsing-30d',
        '15 3 * * *',
        'delete from public.browsing_sessions where visited_at < now() - interval ''30 days'''
      );
    end if;
  end if;
end $$;
