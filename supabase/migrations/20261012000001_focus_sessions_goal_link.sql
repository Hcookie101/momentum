-- Focus sessions can now be attributed to a goal, so the app can show how
-- much focused time went into each one.
--
-- goal_id is nullable (a session may be logged with no goal) and uses
-- on delete set null so deleting a goal keeps the session history intact.
-- The owner policy is rebuilt so it also verifies that any attached goal
-- belongs to the same user (mirrors the subgoals policy pattern).
-- Idempotent — safe to re-run. Run in the Supabase SQL Editor.

alter table public.focus_sessions
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create index if not exists focus_sessions_goal_id_idx
  on public.focus_sessions (goal_id);

drop policy if exists "focus_sessions_owner_all" on public.focus_sessions;
create policy "focus_sessions_owner_all" on public.focus_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      goal_id is null
      or exists (
        select 1 from public.goals g
        where g.id = focus_sessions.goal_id and g.user_id = auth.uid()
      )
    )
  );
