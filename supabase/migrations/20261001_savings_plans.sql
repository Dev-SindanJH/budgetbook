-- Apply to existing projects in the Supabase SQL Editor.
create table if not exists public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  name text not null check (length(trim(name)) between 1 and 80),
  monthly_amount numeric not null check (monthly_amount > 0),
  debit_day integer not null check (debit_day between 1 and 31),
  start_month date not null check (extract(day from start_month) = 1),
  maturity_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (maturity_date >= start_month)
);

alter table public.transactions
  add column if not exists savings_plan_id uuid references public.savings_plans(id) on delete set null;
create unique index if not exists transactions_savings_plan_date_key
  on public.transactions(savings_plan_id, date) where savings_plan_id is not null;

alter table public.savings_plans enable row level security;
grant select, insert, update, delete on public.savings_plans to authenticated;
drop policy if exists "savings_plans_all_family" on public.savings_plans;
create policy "savings_plans_all_family" on public.savings_plans
  for all to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

-- One transaction is materialized for each scheduled payment. Future dates do
-- not affect today's cash balance; changing or stopping a plan keeps its past.
create or replace function public.sync_savings_plan_transactions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  plan public.savings_plans%rowtype;
  payment_month date;
  payment_date date;
  savings_category_id uuid;
  local_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if tg_op = 'DELETE' then
    plan := old;
  else
    plan := new;
    if not exists (
      select 1 from public.profiles p
      where p.id = plan.member_id and p.family_id = plan.family_id
    ) then
      raise exception '같은 가족의 구성원을 선택해주세요';
    end if;
  end if;

  delete from public.transactions
  where savings_plan_id = plan.id and date >= local_today;

  if tg_op = 'DELETE' then return old; end if;
  if not plan.active then return new; end if;

  select id into savings_category_id from public.categories
  where family_id = plan.family_id and type = 'expense' and name = '적금'
  order by created_at limit 1;
  if savings_category_id is null then
    insert into public.categories (family_id, name, type, color, icon)
    values (plan.family_id, '적금', 'expense', '#14b8a6', '🏦')
    returning id into savings_category_id;
  end if;

  for payment_month in
    select generate_series(
      plan.start_month,
      date_trunc('month', plan.maturity_date)::date,
      interval '1 month'
    )::date
  loop
    payment_date := payment_month + (
      least(plan.debit_day, extract(day from (payment_month + interval '1 month - 1 day'))::integer) - 1
    );
    if payment_date >= local_today and payment_date <= plan.maturity_date then
      insert into public.transactions
        (family_id, member_id, date, type, amount, category_id, payment_method, memo, savings_plan_id)
      values
        (plan.family_id, plan.member_id, payment_date, 'expense', plan.monthly_amount,
         savings_category_id, '계좌이체', plan.name || ' · 적금 자동납입', plan.id);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_savings_plan_sync_transactions on public.savings_plans;
drop trigger if exists on_savings_plan_delete_transactions on public.savings_plans;
create trigger on_savings_plan_sync_transactions
  after insert or update on public.savings_plans
  for each row execute function public.sync_savings_plan_transactions();
create trigger on_savings_plan_delete_transactions
  before delete on public.savings_plans
  for each row execute function public.sync_savings_plan_transactions();

-- Existing families receive a category; new families are covered by the trigger.
insert into public.categories (family_id, name, type, color, icon)
select f.id, '적금', 'expense', '#14b8a6', '🏦'
from public.families f
where not exists (
  select 1 from public.categories c
  where c.family_id = f.id and c.type = 'expense' and c.name = '적금'
);
