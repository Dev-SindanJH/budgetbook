-- Korean listed shares and the last closing price fetched by the server.
create table if not exists public.stock_holdings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  symbol text not null check (symbol ~ '^[0-9]{6}$'),
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  quantity numeric(20, 0) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (family_id, symbol)
);

create table if not exists public.stock_quotes (
  symbol text primary key check (symbol ~ '^[0-9]{6}$'),
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  name text not null,
  closing_price numeric not null check (closing_price > 0),
  price_date date not null,
  fetched_at timestamptz not null default now()
);

alter table public.stock_holdings enable row level security;
alter table public.stock_quotes enable row level security;
grant select, insert, update, delete on public.stock_holdings to authenticated;
grant select on public.stock_quotes to authenticated;
grant select, insert, update, delete on public.stock_quotes to service_role;

drop policy if exists "stock_holdings_all_family" on public.stock_holdings;
create policy "stock_holdings_all_family" on public.stock_holdings
  for all to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

drop policy if exists "stock_quotes_read_authenticated" on public.stock_quotes;
create policy "stock_quotes_read_authenticated" on public.stock_quotes
  for select to authenticated using (true);

