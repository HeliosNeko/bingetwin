-- ============================================
-- Migration 007 : Sessions d'import temporaires
-- Stocke la liste de titres reconnus après un
-- import CSV, par source et par utilisateur.
-- La session est supprimée après validation.
-- ============================================

create table public.import_sessions (
  user_id     uuid references public.profiles(id) on delete cascade not null,
  source      text not null check (source in ('netflix', 'letterboxd', 'imdb', 'goodreads')),
  items       jsonb not null default '[]',
  total_parsed integer not null default 0,
  not_found   jsonb not null default '[]',
  saved_at    timestamptz default now() not null,
  primary key (user_id, source)
);

alter table public.import_sessions enable row level security;

create policy "Users manage own import sessions"
  on public.import_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
