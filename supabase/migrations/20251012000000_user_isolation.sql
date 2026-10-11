-- Per-user isolation, part 1: columns + backfill + RLS.
--
-- APPLY IN THE SUPABASE DASHBOARD (project mkxzfanqdfjbrlotxsmk):
-- Dashboard → SQL Editor → New query → paste THIS file, run it,
-- then paste part 2 (extension tokens) and run that.
-- (The repo has no linked migration history, so a local `supabase db push`
-- would fight the remote — the dashboard is the safe path.)
--
-- STEP 0 — your user id: Dashboard → Authentication → Users → copy your
-- UUID, then replace 'PASTE-YOUR-USER-UUID-HERE' in the backfill block.

-- ============ 1. columns ============
alter table public.goals
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.subgoals
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.obligations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.calendar_events
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.focus_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.browsing_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists goals_user_id_idx on public.goals (user_id);
create index if not exists subgoals_user_id_idx on public.subgoals (user_id);
create index if not exists subgoals_goal_id_idx on public.subgoals (goal_id);
create index if not exists obligations_user_id_idx on public.obligations (user_id);
create index if not exists calendar_events_user_id_idx on public.calendar_events (user_id);
create index if not exists focus_sessions_user_id_idx on public.focus_sessions (user_id);
create index if not exists browsing_sessions_user_id_idx on public.browsing_sessions (user_id);

-- ============ 2. backfill YOUR existing rows ============
-- Uncomment, paste your UUID, run. Rows already stamped are left alone.
-- do $$
-- declare me uuid := 'PASTE-YOUR-USER-UUID-HERE';
-- begin
--   update public.goals set user_id = me where user_id is null;
--   update public.subgoals set user_id = me where user_id is null;
--   update public.obligations set user_id = me where user_id is null;
--   update public.calendar_events set user_id = me where user_id is null;
--   update public.focus_sessions set user_id = me where user_id is null;
--   update public.browsing_sessions set user_id = me where user_id is null;
-- end $$;

-- ============ 3. RLS on + owner-only policies ============
alter table public.goals enable row level security;
alter table public.subgoals enable row level security;
alter table public.obligations enable row level security;
alter table public.calendar_events enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.browsing_sessions enable row level security;

drop policy if exists "goals_owner_all" on public.goals;
create policy "goals_owner_all" on public.goals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "subgoals_owner_all" on public.subgoals;
create policy "subgoals_owner_all" on public.subgoals
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
      where g.id = subgoals.goal_id and g.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
      where g.id = subgoals.goal_id and g.user_id = auth.uid()
    )
  );

drop policy if exists "obligations_owner_all" on public.obligations;
create policy "obligations_owner_all" on public.obligations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "calendar_events_owner_all" on public.calendar_events;
create policy "calendar_events_owner_all" on public.calendar_events
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "focus_sessions_owner_all" on public.focus_sessions;
create policy "focus_sessions_owner_all" on public.focus_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- browsing: owner-only for signed-in reads; the extension writes through
-- the RPC in part 2, never direct inserts.
drop policy if exists "browsing_sessions_owner_all" on public.browsing_sessions;
create policy "browsing_sessions_owner_all" on public.browsing_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
