-- ============================================================
-- TTFlix — Agent Role Feature
-- Run this in Supabase: SQL Editor → New query → Run
-- ============================================================

-- 1) Add role column to profiles (null = regular user, 'agent' = agent)
alter table public.profiles add column if not exists role text;

-- 2) agent_customers table — links customers to their signing agent
create table if not exists public.agent_customers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint agent_customers_unique unique (agent_id, customer_id)
);

create index if not exists agent_customers_agent on public.agent_customers (agent_id);
create index if not exists agent_customers_customer on public.agent_customers (customer_id);

alter table public.agent_customers enable row level security;
grant select, insert on public.agent_customers to authenticated;

drop policy if exists "agent_customers select" on public.agent_customers;
create policy "agent_customers select" on public.agent_customers for select to authenticated
  using (agent_id = auth.uid() or public.is_admin());

drop policy if exists "agent_customers insert" on public.agent_customers;
create policy "agent_customers insert" on public.agent_customers for insert to authenticated
  with check (agent_id = auth.uid() or public.is_admin());

-- 3) agent_billing_requests
create table if not exists public.agent_billing_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null,
  amount integer not null,
  agent_commission integer not null,
  admin_amount integer not null,
  request_type text not null check (request_type in ('new_subscription', 'renewal', 'plan_change')),
  status text not null default 'pending_agent' check (status in ('pending_agent', 'pending_admin', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  agent_approved_at timestamptz,
  admin_approved_at timestamptz,
  notes text
);

create index if not exists agent_billing_requests_agent on public.agent_billing_requests (agent_id, created_at desc);
create index if not exists agent_billing_requests_customer on public.agent_billing_requests (customer_id);
create index if not exists agent_billing_requests_status on public.agent_billing_requests (status);

alter table public.agent_billing_requests enable row level security;
grant select, insert, update on public.agent_billing_requests to authenticated;

drop policy if exists "agent_billing_requests select" on public.agent_billing_requests;
create policy "agent_billing_requests select" on public.agent_billing_requests for select to authenticated
  using (agent_id = auth.uid() or public.is_admin());

drop policy if exists "agent_billing_requests insert" on public.agent_billing_requests;
create policy "agent_billing_requests insert" on public.agent_billing_requests for insert to authenticated
  with check (agent_id = auth.uid() or public.is_admin());

drop policy if exists "agent_billing_requests update" on public.agent_billing_requests;
create policy "agent_billing_requests update" on public.agent_billing_requests for update to authenticated
  using (agent_id = auth.uid() or public.is_admin())
  with check (agent_id = auth.uid() or public.is_admin());

-- 4) agent_payments — tracks each cash payment from agent to admin
create table if not exists public.agent_payments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  notes text,
  recorded_at timestamptz not null default now()
);

create index if not exists agent_payments_agent on public.agent_payments (agent_id, recorded_at desc);

alter table public.agent_payments enable row level security;
grant select, insert on public.agent_payments to authenticated;

drop policy if exists "agent_payments select" on public.agent_payments;
create policy "agent_payments select" on public.agent_payments for select to authenticated
  using (agent_id = auth.uid() or public.is_admin());

drop policy if exists "agent_payments insert" on public.agent_payments;
create policy "agent_payments insert" on public.agent_payments for insert to authenticated
  with check (public.is_admin());

-- 5) Realtime
do $$ begin
  alter publication supabase_realtime add table public.agent_billing_requests;
exception when others then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.agent_customers;
exception when others then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.agent_payments;
exception when others then null;
end $$;

-- 6) Allow agents to read their customers' profiles
drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.agent_customers ac
      where ac.agent_id = auth.uid() and ac.customer_id = public.profiles.id
    )
  );

-- 7) payment_history agent columns
alter table public.payment_history add column if not exists agent_id uuid references public.profiles(id) on delete set null;
alter table public.payment_history add column if not exists agent_commission integer;
alter table public.payment_history add column if not exists admin_amount integer;
