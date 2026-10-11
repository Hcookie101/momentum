-- RLS ENABLE FIX.
--
-- Diagnosis: an anonymous (publishable-key) read returned every user's rows,
-- which means RLS was NOT enabled on these tables. The `user_id` column and
-- backfill ran, but "enable row level security" + the owner policies did not
-- persist. This turns RLS ON and (re)creates the owner-only policies.
--
-- Idempotent — safe to run repeatedly.

-- 1. Turn RLS on for every app table.
alter table public.goals enable row level security;
alter table public.subgoals enable row level security;
alter table public.obligations enable row level security;
alter table public.calendar_events enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.browsing_sessions enable row level security;

-- 2. Owner-only policies (recreate in case an older one is missing).
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

drop policy if exists "browsing_sessions_owner_all" on public.browsing_sessions;
create policy "browsing_sessions_owner_all" on public.browsing_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
