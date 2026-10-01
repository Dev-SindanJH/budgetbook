create table if not exists public.cash_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.cash_assets enable row level security;
grant select, insert, update, delete on public.cash_assets to authenticated;
drop policy if exists "cash_assets_all_family" on public.cash_assets;
create policy "cash_assets_all_family" on public.cash_assets
  for all to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

-- Preserve the cash amount shown on the home screen for families that used
-- the older opening-balance workflow before cash items existed.
with legacy_balances as (
  select
    settings.family_id,
    settings.opening_balance + coalesce(sum(
      case
        when transactions.type = 'income'
          and transactions.date between settings.opening_date and (now() at time zone 'Asia/Seoul')::date
          then transactions.amount
        when transactions.type = 'expense'
          and transactions.payment_method is distinct from '신용카드'
          and transactions.date between settings.opening_date and (now() at time zone 'Asia/Seoul')::date
          then -transactions.amount
        when transactions.type = 'expense'
          and transactions.payment_method = '신용카드'
          and transactions.card_due_date between settings.opening_date and (now() at time zone 'Asia/Seoul')::date
          then -transactions.amount
        else 0
      end
    ), 0) as amount
  from public.cash_settings settings
  left join public.transactions transactions on transactions.family_id = settings.family_id
  where settings.opening_date <= (now() at time zone 'Asia/Seoul')::date
  group by settings.family_id, settings.opening_date, settings.opening_balance
)
insert into public.cash_assets (family_id, name, amount)
select family_id, '기존 보유 현금', amount
from legacy_balances
where amount >= 0
  and not exists (
    select 1 from public.cash_assets existing where existing.family_id = legacy_balances.family_id
  );
