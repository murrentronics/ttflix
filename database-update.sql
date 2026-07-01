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
do $$ begin
  alter publication supabase_realtime add table public.payment_history;
exception when others then null;
end $$;

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

-- 9) Active watches table — tracks who is currently watching (not login sessions)
-- Row inserted when player opens, deleted on exit. Used for screen limit enforcement.
create table if not exists public.active_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  tmdb_id integer,
  media_type text,
  title text,
  started_at timestamptz not null default now(),
  last_ping timestamptz not null default now()
);

create unique index if not exists active_watches_session_unique
  on public.active_watches (user_id, session_id);

create index if not exists active_watches_user
  on public.active_watches (user_id);

alter table public.active_watches enable row level security;
grant select, insert, update, delete on public.active_watches to authenticated;

drop policy if exists "active_watches_own" on public.active_watches;
create policy "active_watches_own" on public.active_watches
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

-- Realtime so admin panel updates live
do $$ begin
  alter publication supabase_realtime add table public.active_watches;
exception when others then null;
end $$;

-- Clean up stale watches (ping > 5 min old = player closed without cleanup)
-- Run this periodically or just let the app handle it
-- delete from public.active_watches where last_ping < now() - interval '5 minutes';

-- 10) Backfill payment_history for approved users who pre-date the table
-- This inserts one record per approved user who has no payment_history row yet.
-- subscription_expires_at is used to back-calculate the period_start (30 days prior).
-- Safe to run multiple times — the WHERE NOT EXISTS guard prevents duplicates.
insert into public.payment_history (user_id, plan, amount, period_start, period_end, approved_at)
select
  p.id                                                        as user_id,
  coalesce(p.plan, 'basic')                                   as plan,
  coalesce(pl.price, 50)                                      as amount,
  coalesce(p.subscription_expires_at, now()) - interval '30 days' as period_start,
  coalesce(p.subscription_expires_at, now())                  as period_end,
  coalesce(p.subscription_expires_at, now()) - interval '30 days' as approved_at
from public.profiles p
left join lateral (
  -- Map plan id → price inline (adjust prices if your PLANS object differs)
  select case p.plan
    when 'basic'          then 60
    when 'premium'        then 125
    when 'basic_annual'   then 550
    when 'premium_annual' then 750
    else 60
  end as price
) pl on true
where p.status = 'approved'
  and p.role is distinct from 'agent'
  and not exists (
    select 1 from public.payment_history h where h.user_id = p.id
  );

-- 11) Allow agents to be stored without a plan (plan column made nullable)
-- Agents don't subscribe so plan/subscription fields should be nullable.
alter table public.profiles alter column plan drop not null;

-- 12) Strip subscription from existing agents (in case any were promoted while subscribed)
update public.profiles
set
  subscription_expires_at = null,
  pending_plan = null,
  plan = null
where role = 'agent';

-- 13) Fix payment_history RLS so admin can always read ALL rows
-- The previous policy relied on a profiles join which can silently drop rows.
-- This explicit policy guarantees admin sees everything.

drop policy if exists "payment_history select" on public.payment_history;
create policy "payment_history select" on public.payment_history for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Also ensure the insert policy allows admin and agents (via service path)
drop policy if exists "payment_history insert" on public.payment_history;
create policy "payment_history insert" on public.payment_history for insert to authenticated
  with check (public.is_admin());

-- 14) Ensure agent_billing_request_id column exists on payment_history
alter table public.payment_history
  add column if not exists agent_billing_request_id uuid references public.agent_billing_requests(id) on delete set null;

create index if not exists idx_payment_history_agent_billing_request_id
  on public.payment_history (agent_billing_request_id)
  where agent_billing_request_id is not null;

-- 15) Fix duplicate payment_history records
-- Two code paths were both inserting records for agent-brokered customers:
-- adminApproveAgentRequest() + setUserStatus() firing for the same user.

-- Step 1: Remove duplicates — keep the earliest record per user+period_start
DELETE FROM public.payment_history
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, period_start) id
  FROM public.payment_history
  ORDER BY user_id, period_start, approved_at ASC
);

-- Step 2: Prevent future duplicates at DB level
CREATE UNIQUE INDEX IF NOT EXISTS payment_history_user_period_unique
  ON public.payment_history (user_id, period_start);
