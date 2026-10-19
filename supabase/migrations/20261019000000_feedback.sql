-- In-app feedback: a lightweight way for users to send ideas, problems,
-- and other notes from Settings without leaving the app.
--
-- One row per submission. The page column records which app route the user
-- was on (e.g. '/settings') for context — never full URLs or browsing data.
--
-- Idempotent — safe to re-run. Run in the Supabase SQL Editor like the
-- earlier migrations, then refresh the generated types with `npm run gen-types`.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'other'
    check (category in ('idea', 'problem', 'other')),
  message text not null
    check (char_length(trim(message)) between 1 and 2000),
  page text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

drop policy if exists "feedback_owner_all" on public.feedback;
create policy "feedback_owner_all" on public.feedback
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists feedback_user_id_idx
  on public.feedback (user_id);
