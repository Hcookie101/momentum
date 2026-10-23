-- Onboarding state: one row per user that remembers whether they have seen
-- (and dismissed) the getting-started card on /schedule.
--
-- The card itself derives its four steps from live data (goals, obligations,
-- calendar events, the locally saved AI key) — this table only stores the two
-- durable facts the app can't infer:
--   dismissed_at  — the user closed the card and asked not to see it again
--   completed_at  — every step was done, so the card stays gone for good
--
-- Idempotent — safe to re-run. Run in the Supabase SQL Editor like the
-- earlier migrations, then refresh the generated types with `npm run gen-types`.

create table if not exists public.onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.onboarding enable row level security;

drop policy if exists "onboarding_owner_all" on public.onboarding;
create policy "onboarding_owner_all" on public.onboarding
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists onboarding_user_id_idx
  on public.onboarding (user_id);
