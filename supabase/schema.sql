-- ============================================
-- BingeTwin - Schéma de base de données
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Extension pour uuid
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLE: profiles
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  bio text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- ============================================
-- TABLE: favorites
-- ============================================
create table public.favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  media_type text not null check (media_type in ('movie', 'series', 'book')),
  external_id text not null,
  title text not null,
  poster_url text,
  year text,
  rating integer check (rating between 1 and 5),
  created_at timestamptz default now() not null,
  unique(user_id, media_type, external_id)
);

alter table public.favorites enable row level security;

create policy "Favorites are viewable by everyone" on public.favorites
  for select using (true);

create policy "Users can manage their own favorites" on public.favorites
  for all using (auth.uid() = user_id);

-- ============================================
-- TABLE: matches
-- ============================================
create table public.matches (
  id uuid default gen_random_uuid() primary key,
  user1_id uuid references public.profiles(id) on delete cascade not null,
  user2_id uuid references public.profiles(id) on delete cascade not null,
  score integer default 0 not null,
  common_favorites integer default 0 not null,
  created_at timestamptz default now() not null,
  constraint different_users check (user1_id != user2_id),
  constraint ordered_users check (user1_id < user2_id),
  unique(user1_id, user2_id)
);

alter table public.matches enable row level security;

create policy "Users can view their own matches" on public.matches
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

create policy "System can create matches" on public.matches
  for insert with check (true);

create policy "System can update matches" on public.matches
  for update using (true);

-- ============================================
-- TABLE: messages
-- ============================================
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  match_id uuid references public.matches(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  read_at timestamptz,
  created_at timestamptz default now() not null
);

alter table public.messages enable row level security;

create policy "Users can view messages in their matches" on public.messages
  for select using (
    exists (
      select 1 from public.matches
      where id = match_id
      and (user1_id = auth.uid() or user2_id = auth.uid())
    )
  );

create policy "Users can send messages in their matches" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches
      where id = match_id
      and (user1_id = auth.uid() or user2_id = auth.uid())
    )
  );

-- ============================================
-- FUNCTION: handle new user (auto-create profile)
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- FUNCTION: compute_matches
-- Recalcule les matches d'un utilisateur
-- ============================================
create or replace function public.compute_matches(target_user_id uuid)
returns void as $$
declare
  other_user record;
  common_count integer;
  match_score integer;
  u1 uuid;
  u2 uuid;
begin
  for other_user in
    select distinct user_id from public.favorites
    where user_id != target_user_id
  loop
    -- Compter les favoris en commun
    select count(*) into common_count
    from public.favorites f1
    inner join public.favorites f2
      on f1.media_type = f2.media_type
      and f1.external_id = f2.external_id
    where f1.user_id = target_user_id
      and f2.user_id = other_user.user_id;

    if common_count > 0 then
      match_score := common_count * 10;

      -- Garantir l'ordre user1 < user2
      if target_user_id < other_user.user_id then
        u1 := target_user_id; u2 := other_user.user_id;
      else
        u1 := other_user.user_id; u2 := target_user_id;
      end if;

      insert into public.matches (user1_id, user2_id, score, common_favorites)
      values (u1, u2, match_score, common_count)
      on conflict (user1_id, user2_id)
      do update set
        score = excluded.score,
        common_favorites = excluded.common_favorites;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- ============================================
-- REALTIME: activer pour messages et matches
-- ============================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
