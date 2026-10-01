-- Existing amounts are current balances. Never replay historical transactions.
alter table public.transactions add column if not exists cash_balance_included boolean not null default false;
alter table public.transactions alter column cash_balance_included set default true;
alter table public.transactions add column if not exists cash_asset_id uuid;
alter table public.savings_plans add column if not exists cash_asset_id uuid;
alter table public.loans add column if not exists cash_asset_id uuid;
-- Regenerating an old plan must not debit today's already-accounted payment.
alter table public.savings_plans add column if not exists cash_apply_from date not null default ((now() at time zone 'Asia/Seoul')::date + 1);
alter table public.loans add column if not exists cash_apply_from date not null default ((now() at time zone 'Asia/Seoul')::date + 1);
alter table public.savings_plans alter column cash_apply_from set default ((now() at time zone 'Asia/Seoul')::date);
alter table public.loans alter column cash_apply_from set default ((now() at time zone 'Asia/Seoul')::date);

-- A baseline may be negative after reconciling an account that has income.
alter table public.cash_assets drop constraint if exists cash_assets_amount_check;
do $$
declare table_name text;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.cash_assets'::regclass and conname = 'cash_assets_id_family_key') then
    alter table public.cash_assets add constraint cash_assets_id_family_key unique (id, family_id);
  end if;
  foreach table_name in array array['transactions', 'savings_plans', 'loans'] loop
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || table_name)::regclass and conname = table_name || '_cash_asset_family_fkey') then
      execute format('alter table public.%I add constraint %I foreign key (cash_asset_id, family_id) references public.cash_assets(id, family_id) on delete restrict', table_name, table_name || '_cash_asset_family_fkey');
    end if;
    execute format('create index if not exists %I on public.%I(cash_asset_id, family_id)', table_name || '_cash_asset_idx', table_name);
  end loop;
end;
$$;

-- If a family only used the old single cash balance, preserve its last displayed
-- value as one cash asset. Never add this on top of existing named cash assets.
insert into public.cash_assets (family_id, name, amount)
select s.family_id, '기존 보유 현금', s.opening_balance + coalesce((
  select sum(case when t.type = 'income' then t.amount else -t.amount end)
  from public.transactions t
  where t.family_id = s.family_id
    and (case when t.type = 'expense' and t.payment_method = '신용카드' then t.card_due_date else t.date end)
      between s.opening_date and (now() at time zone 'Asia/Seoul')::date
), 0)
from public.cash_settings s
where not exists (select 1 from public.cash_assets a where a.family_id = s.family_id);

create or replace function public.set_transaction_cash_asset()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare source_id uuid; apply_from date;
begin
  if tg_op = 'INSERT' then
    if new.savings_plan_id is not null then
      select cash_asset_id, cash_apply_from into source_id, apply_from
      from public.savings_plans where id = new.savings_plan_id and family_id = new.family_id;
      new.cash_asset_id := source_id;
      new.cash_balance_included := source_id is not null and new.date >= apply_from;
    elsif new.loan_id is not null then
      select cash_asset_id, cash_apply_from into source_id, apply_from
      from public.loans where id = new.loan_id and family_id = new.family_id;
      new.cash_asset_id := source_id;
      new.cash_balance_included := source_id is not null and new.date >= apply_from;
    end if;
  end if;
  if new.cash_balance_included and new.cash_asset_id is null then
    raise exception '잔액을 반영할 현금 보유처를 선택해주세요';
  end if;
  return new;
end;
$$;
revoke all on function public.set_transaction_cash_asset() from public, anon;
grant execute on function public.set_transaction_cash_asset() to authenticated;
drop trigger if exists on_transaction_cash_asset on public.transactions;
create trigger on_transaction_cash_asset before insert or update on public.transactions
for each row execute function public.set_transaction_cash_asset();

-- Existing cash_assets/transactions/plans/loans family RLS policies still apply.
-- Old budget and cash_settings records are retained for recovery; the UI no longer uses them.
