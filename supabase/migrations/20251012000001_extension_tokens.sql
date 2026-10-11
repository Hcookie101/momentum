-- Per-user isolation, part 2: extension token linking.
-- Run AFTER part 1 in the dashboard SQL editor. Idempotent — safe to re-run.
--
-- One row per linked browser. Only the sha256 hash is stored — the raw
-- token is shown once at creation and never again.
--
-- Uses only built-in Postgres functions (gen_random_uuid + sha256), so it
-- doesn't depend on the pgcrypto extension or its schema location.

create table if not exists public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'browser',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.extension_tokens enable row level security;

drop policy if exists "extension_tokens_owner_all" on public.extension_tokens;
create policy "extension_tokens_owner_all" on public.extension_tokens
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists extension_tokens_user_id_idx
  on public.extension_tokens (user_id);
create index if not exists extension_tokens_hash_idx
  on public.extension_tokens (token_hash);

-- Mint a token for the signed-in caller. Returns the RAW token once —
-- the table keeps only its hash, so this is the only moment it exists.
create or replace function public.create_extension_token(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Two v4 UUIDs = 244 bits of randomness, hex-encoded into a 64-char token.
  raw text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  h text := encode(sha256(decode(raw, 'hex')), 'hex');
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.extension_tokens (user_id, label, token_hash)
  values (auth.uid(), coalesce(nullif(trim(coalesce(p_label, '')), ''), 'browser'), h);
  return raw;
end;
$$;

-- The extension's write path: validates the token, stamps the owner's
-- user_id, inserts one browsing row. Revoked/unknown tokens rejected.
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
  h text := encode(sha256(decode(nullif(trim(coalesce(p_token, '')), ''), 'hex')), 'hex');
begin
  if p_domain is null or trim(p_domain) = '' then
    raise exception 'Missing domain';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 3 then
    return;
  end if;
  select t.user_id into owner
  from public.extension_tokens t
  where t.token_hash = h and t.revoked_at is null;
  if owner is null then
    raise exception 'Unknown or revoked extension token';
  end if;
  update public.extension_tokens set last_used_at = now() where token_hash = h;
  insert into public.browsing_sessions (user_id, domain, duration_seconds)
  values (owner, trim(p_domain), least(p_duration_seconds, 180));
end;
$$;

-- The extension popup's read path: same token check, returns only that
-- owner's rows since midnight — never anyone else's.
create or replace function public.read_today_browsing(p_token text)
returns table (domain text, duration_seconds integer, visited_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  h text := encode(sha256(decode(nullif(trim(coalesce(p_token, '')), ''), 'hex')), 'hex');
begin
  select t.user_id into owner
  from public.extension_tokens t
  where t.token_hash = h and t.revoked_at is null;
  if owner is null then
    raise exception 'Unknown or revoked extension token';
  end if;
  return query
    select b.domain, b.duration_seconds, b.visited_at
    from public.browsing_sessions b
    where b.user_id = owner
      and b.visited_at >= date_trunc('day', now())
    order by b.visited_at asc;
end;
$$;


