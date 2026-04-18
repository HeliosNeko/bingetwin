-- ============================================================
-- Migration 009 : Préférences de suggestions par utilisateur
-- ============================================================

create table public.suggestion_preferences (
  user_id        uuid references public.profiles(id) on delete cascade primary key,
  genres         integer[] not null default '{}',     -- IDs TMDB, vide = tous
  period         text not null default 'all'
                   check (period in ('year', '5years', '20years', 'all')),
  language_group text not null default 'all'
                   check (language_group in ('en', 'fr', 'european', 'asian', 'all')),
  updated_at     timestamptz default now() not null
);

alter table public.suggestion_preferences enable row level security;

create policy "Users manage own suggestion preferences"
  on public.suggestion_preferences
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
