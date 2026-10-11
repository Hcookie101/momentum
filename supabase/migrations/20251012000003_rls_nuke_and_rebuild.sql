-- RLS: nuke ALL policies, enable RLS, rebuild owner-only policies.
--
-- Why this version: an anon read still returned every row, which means either
-- RLS is off OR a leftover permissive policy (e.g. Supabase's default
-- "Enable read access for all users", using (true)) is reopening access.
-- This drops EVERY policy on the six tables first (so nothing permissive
-- survives), then enables RLS and recreates only the restrictive ones.
--
-- Idempotent — safe to run repeatedly. Run in the Supabase SQL Editor.

-- 1. Drop every existing policy on the app tables (permissive or not).
do $$
declare p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'goals', 'subgoals', 'obligations',
        'calendar_events', 'focus_sessions', 'browsing_sessions'
      )
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Turn RLS on for every app table.
alter table public.goals enable row level security;
alter table public.subgoals enable row level security;
alter table public.obligations enable row level security;
alter table public.calendar_events enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.browsing_sessions enable row level security;

-- 3. Rebuild owner-only policies (restrictive: nothing grants anon/public).
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
