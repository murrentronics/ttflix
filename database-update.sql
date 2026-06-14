-- ============================================================
-- TTFlix — Database Updates
-- Run this in Supabase: SQL Editor → New query → Run
-- ============================================================

-- 1) Add phone number to profiles
alter table public.profiles add column if not exists phone text;

-- 2) Add profile_id to watch_progress (per sub-profile tracking)
alter table public.watch_progress add column if not exists profile_id uuid;

-- Update the unique constraint to include profile_id
alter table public.watch_progress drop constraint if exists watch_progress_unique;
alter table public.watch_progress add constraint watch_progress_unique
  unique (user_id, profile_id, tmdb_id, media_type);

-- 3) Payment history table — one row per approved payment
create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  approved_at timestamptz not null default now(),
  plan text not null,
  amount integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null
);

create index if not exists payment_history_user_approved
  on public.payment_history (user_id, approved_at desc);

create index if not exists payment_history_approved
  on public.payment_history (approved_at desc);

alter table public.payment_history enable row level security;
grant select, insert on public.payment_history to authenticated;

-- Users can see their own history; admin sees all
drop policy if exists "payment_history select" on public.payment_history;
create policy "payment_history select" on public.payment_history for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payment_history insert" on public.payment_history;
create policy "payment_history insert" on public.payment_history for insert to authenticated
  with check (public.is_admin());

-- 4) Realtime for payment_history in admin panel
alter publication supabase_realtime add table public.payment_history;

-- 5) Fix watch_progress upsert for rows with no profile (profile_id IS NULL)
--
-- Postgres unique constraints treat NULL != NULL, so two rows with
-- profile_id=NULL for the same user+tmdb_id+media_type are both allowed,
-- causing duplicate rows instead of upserts.
--
-- Fix: drop the multi-column constraint and replace it with:
--   a) a partial unique index for rows WITH a profile
--   b) a partial unique index for rows WITHOUT a profile (legacy / no profile selected)

alter table public.watch_progress drop constraint if exists watch_progress_unique;

-- Rows that belong to a specific sub-profile
create unique index if not exists watch_progress_profile_unique
  on public.watch_progress (user_id, profile_id, tmdb_id, media_type)
  where profile_id is not null;

-- Legacy / no-profile rows
create unique index if not exists watch_progress_noprofile_unique
  on public.watch_progress (user_id, tmdb_id, media_type)
  where profile_id is null;

-- 6) Clear all stale screen registrations
-- Run this to immediately fix "max screen limit" errors for users who are not logged in anywhere.
-- Safe to run anytime — active sessions re-register on next sign-in.
delete from public.screens where last_active < now() - interval '2 hours';

-- 6b) Migrate screens table from device_id → session_id
--
-- The old design stored a random device_id in localStorage. When a user deletes
-- the app, localStorage is wiped so the screens row is never cleaned up, blocking
-- the next login attempt. The new design uses the Supabase access_token as the
-- session identifier — it is server-issued on every sign-in and is completely
-- independent of local storage. Deleted apps can never heartbeat, so their rows
-- expire after 2 hours automatically.
--
-- Run this ONCE in Supabase SQL Editor:

-- Add session_id column if not already present
alter table public.screens add column if not exists session_id text;

-- Drop old device_id unique constraint / index if any
drop index if exists public.screens_device_id_idx;
alter table public.screens drop constraint if exists screens_user_device_unique;

-- Create unique index on (user_id, session_id)
create unique index if not exists screens_session_unique
  on public.screens (user_id, session_id)
  where session_id is not null;

-- Clear all existing rows — they all have device_ids that are now meaningless.
-- Users will re-register automatically on next sign-in.
truncate public.screens;

-- 6c) Emergency: nuke ALL screen rows so every user can log back in cleanly.
-- Uncomment and run if users are still blocked.
-- truncate public.screens;

-- 7) Definitive watch_progress constraint fix
-- Run this in Supabase SQL Editor to guarantee the upsert works correctly.
-- This replaces all previous constraint changes with one clean setup.

-- Drop everything that might exist
alter table public.watch_progress drop constraint if exists watch_progress_unique;
drop index if exists public.watch_progress_profile_unique;
drop index if exists public.watch_progress_noprofile_unique;

-- Single clean unique constraint covering user+profile+tmdb+type
-- profile_id is now always set (users always have an active profile)
create unique index if not exists watch_progress_unique_idx
  on public.watch_progress (user_id, profile_id, tmdb_id, media_type);

-- 8) Plan upgrade requests
-- Stores the requested plan while user stays on current plan until admin approves
alter table public.profiles add column if not exists pending_plan text;
