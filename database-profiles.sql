-- ============================================================
-- TTFlix — Netflix-style Profiles
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) User profiles table
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  avatar_color text not null default '#E50914',
  is_kids boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_profiles_user_id on public.user_profiles (user_id);

alter table public.user_profiles enable row level security;
grant select, insert, update, delete on public.user_profiles to authenticated;

drop policy if exists "user_profiles own" on public.user_profiles;
create policy "user_profiles own" on public.user_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2) Add profile_id to watch_progress (nullable for backwards compat)
alter table public.watch_progress add column if not exists profile_id uuid references public.user_profiles(id) on delete cascade;

-- Update unique constraint to include profile_id
alter table public.watch_progress drop constraint if exists watch_progress_unique;
alter table public.watch_progress add constraint watch_progress_unique unique (user_id, profile_id, tmdb_id, media_type);

-- 3) Add profile_id to my_list (nullable for backwards compat)
alter table public.my_list add column if not exists profile_id uuid references public.user_profiles(id) on delete cascade;

-- Update unique constraint to include profile_id
alter table public.my_list drop constraint if exists my_list_user_id_tmdb_id_media_type_key;
alter table public.my_list add constraint my_list_unique unique (user_id, profile_id, tmdb_id, media_type);

-- 4) Realtime for profiles
alter publication supabase_realtime add table public.user_profiles;
