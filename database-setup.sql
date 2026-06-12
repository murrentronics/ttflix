-- ============================================================
-- TTFlix — Admin & Bank Transfer setup
-- Run this in your Supabase project: SQL Editor → New query → Run
-- ============================================================

-- 1) Add status + subscription expiry to profiles
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles add column if not exists subscription_expires_at timestamptz;

-- 2) Admin check (based on the admin email)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'email') = 'kellymarshall2026@gmail.com', false)
$$;

-- 3) profiles RLS — users manage their own row; admin manages all
alter table public.profiles enable row level security;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles insert" on public.profiles;
create policy "profiles insert" on public.profiles for insert to authenticated
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles delete" on public.profiles;
create policy "profiles delete" on public.profiles for delete to authenticated
  using (public.is_admin());

-- 4) Bank transfer details (single shared row)
create table if not exists public.bank_details (
  id int primary key default 1,
  bank_name text,
  account_name text,
  account_number text,
  account_type text,
  branch text,
  instructions text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

grant select on public.bank_details to anon, authenticated;
grant all on public.bank_details to service_role;

alter table public.bank_details enable row level security;

drop policy if exists "bank read" on public.bank_details;
create policy "bank read" on public.bank_details for select using (true);

drop policy if exists "bank admin write" on public.bank_details;
create policy "bank admin write" on public.bank_details for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.bank_details (id) values (1) on conflict (id) do nothing;

-- 5) Realtime updates for the admin panel
alter publication supabase_realtime add table public.profiles;

-- 6) After you sign up with kellymarshall2026@gmail.com, that account is
--    automatically the admin (recognized by email). Optionally approve it:
update public.profiles set status = 'approved' where email = 'kellymarshall2026@gmail.com';
