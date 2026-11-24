-- Accounting suite: school expense tracking, feeding a per-school P&L
-- (revenue already lives in tuition_payments/tuition_installments; this
-- adds the expense side so admins can see net, not just gross).
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  category text not null default 'other',
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  expense_date date not null default current_date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_school_date on expenses(school_id, expense_date desc);

alter table expenses enable row level security;
drop policy if exists "expenses_all" on expenses;
create policy "expenses_all" on expenses for all using (true) with check (true);
