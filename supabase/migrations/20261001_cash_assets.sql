create table if not exists public.cash_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.cash_assets enable row level security;
drop policy if exists "cash_assets_all_family" on public.cash_assets;
create policy "cash_assets_all_family" on public.cash_assets
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
