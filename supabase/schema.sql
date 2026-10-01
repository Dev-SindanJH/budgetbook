-- ============================================================
-- 우리집 가계부 - Supabase 스키마 및 RLS 정책
-- Supabase 대시보드 > SQL Editor 에서 전체를 실행하세요.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 테이블
-- ------------------------------------------------------------

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  name text not null default '가족',
  color text not null default '#4f8ef7',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  color text not null default '#94a3b8',
  icon text not null default '💸',
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  date date not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  payment_method text,
  memo text,
  created_at timestamptz not null default now()
);

-- 신용카드는 번호 없이 닉네임과 자동이체일만 보관합니다.
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  nickname text not null check (length(trim(nickname)) between 1 and 40),
  debit_day integer not null check (debit_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 기준일 아침의 보유 현금. 이후 거래와 카드 자동이체를 누적해 현재 현금을 계산합니다.
create table if not exists public.cash_settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  opening_date date not null,
  opening_balance numeric not null check (opening_balance >= 0)
);

alter table public.transactions add column if not exists card_id uuid references public.credit_cards(id);
alter table public.transactions add column if not exists card_due_date date;
create index if not exists transactions_card_due_date_idx on public.transactions(card_due_date);

-- 결제 예정일은 구매 다음 달의 등록된 일자입니다. 말일이 짧으면 말일로 조정합니다.
create or replace function public.set_credit_card_due_date()
returns trigger language plpgsql as $$
declare
  card_record public.credit_cards%rowtype;
  next_month date;
  last_day integer;
  recalculate boolean := tg_op = 'INSERT';
begin
  if new.type = 'expense' and new.payment_method = '신용카드' then
    -- 기존 내역은 카드 정보가 없을 수 있습니다. 수정할 때는 반드시 지정합니다.
    if new.card_id is null then
      if tg_op = 'INSERT' then
        raise exception '등록된 신용카드를 선택해주세요';
      elsif old.payment_method is distinct from new.payment_method
         or old.card_id is distinct from new.card_id then
        raise exception '등록된 신용카드를 선택해주세요';
      end if;
      new.card_due_date := null;
      return new;
    end if;
    select * into card_record from public.credit_cards where id = new.card_id;
    if not found or card_record.family_id <> new.family_id or card_record.owner_id <> new.member_id then
      raise exception '작성자에게 등록된 신용카드를 선택해주세요';
    end if;
    if not card_record.active then
      if tg_op = 'INSERT' then
        raise exception '사용 중인 신용카드를 선택해주세요';
      elsif old.card_id is distinct from new.card_id then
        raise exception '사용 중인 신용카드를 선택해주세요';
      end if;
    end if;
    -- 카드 설정 변경이 이미 기록한 내역의 예정일을 바꾸지 않도록 저장된 날짜를 유지합니다.
    if tg_op = 'UPDATE' then
      recalculate := old.date is distinct from new.date
        or old.card_id is distinct from new.card_id
        or old.payment_method is distinct from new.payment_method;
    end if;
    if recalculate then
      next_month := (date_trunc('month', new.date) + interval '1 month')::date;
      last_day := extract(day from (next_month + interval '1 month - 1 day'))::integer;
      new.card_due_date := next_month + (least(card_record.debit_day, last_day) - 1);
    else
      new.card_due_date := old.card_due_date;
    end if;
  else
    new.card_id := null;
    new.card_due_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_transaction_set_card_due_date on public.transactions;
create trigger on_transaction_set_card_due_date before insert or update on public.transactions
  for each row execute function public.set_credit_card_due_date();

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  month text not null, -- 'YYYY-MM', category_id가 null이면 전체 월 예산
  limit_amount numeric not null check (limit_amount >= 0),
  created_at timestamptz not null default now(),
  -- category_id가 null(전체 예산)일 때도 family_id+month 기준으로 유일하도록
  -- null을 구분 불가한 값 취급하는 문제를 피하기 위해 sentinel 값으로 대체한 생성 컬럼을 둔다
  category_key uuid generated always as (coalesce(category_id, '00000000-0000-0000-0000-000000000000')) stored,
  unique (family_id, category_key, month)
);

-- ------------------------------------------------------------
-- 헬퍼 함수: 내 family_id (RLS 재귀 방지를 위해 security definer)
-- ------------------------------------------------------------

create or replace function public.current_family_id()
returns uuid
language sql
security definer
stable
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 신규 가입 시 profiles 행 자동 생성
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 가족 그룹 만들기 / 참여하기 (RPC)
-- ------------------------------------------------------------

create or replace function public.create_family(family_name text)
returns table (id uuid, invite_code text)
language plpgsql
security definer
as $$
declare
  new_id uuid := gen_random_uuid();
  code text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
begin
  insert into public.families (id, name, invite_code) values (new_id, family_name, code);
  update public.profiles set family_id = new_id where profiles.id = auth.uid();

  insert into public.categories (family_id, name, type, color, icon) values
    (new_id, '식비', 'expense', '#f97316', '🍚'),
    (new_id, '교통', 'expense', '#3b82f6', '🚌'),
    (new_id, '주거/관리비', 'expense', '#8b5cf6', '🏠'),
    (new_id, '통신', 'expense', '#06b6d4', '📱'),
    (new_id, '의료/건강', 'expense', '#ef4444', '🏥'),
    (new_id, '문화/여가', 'expense', '#ec4899', '🎬'),
    (new_id, '교육', 'expense', '#22c55e', '📚'),
    (new_id, '의류/미용', 'expense', '#eab308', '👕'),
    (new_id, '경조사', 'expense', '#64748b', '🎁'),
    (new_id, '기타', 'expense', '#94a3b8', '🧾'),
    (new_id, '급여', 'income', '#16a34a', '💰'),
    (new_id, '부수입', 'income', '#0ea5e9', '➕'),
    (new_id, '기타수입', 'income', '#a3a3a3', '💵');

  return query select new_id, code;
end;
$$;

create or replace function public.join_family(code text)
returns uuid
language plpgsql
security definer
as $$
declare
  fam_id uuid;
begin
  select families.id into fam_id from public.families where invite_code = upper(code);
  if fam_id is null then
    raise exception '유효하지 않은 초대 코드입니다';
  end if;
  update public.profiles set family_id = fam_id where profiles.id = auth.uid();
  return fam_id;
end;
$$;

-- ------------------------------------------------------------
-- RLS 활성화
-- ------------------------------------------------------------

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.credit_cards enable row level security;
alter table public.cash_settings enable row level security;
alter table public.budgets enable row level security;

-- families: 내 가족만 조회 가능
drop policy if exists "families_select_own" on public.families;
create policy "families_select_own" on public.families
  for select using (id = public.current_family_id());

-- profiles: 같은 가족 구성원 조회 가능, 본인 행만 수정 가능
drop policy if exists "profiles_select_family" on public.profiles;
create policy "profiles_select_family" on public.profiles
  for select using (id = auth.uid() or family_id = public.current_family_id());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- categories: family_id 기준
drop policy if exists "categories_all_family" on public.categories;
create policy "categories_all_family" on public.categories
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

-- transactions: family_id 기준
drop policy if exists "transactions_all_family" on public.transactions;
create policy "transactions_all_family" on public.transactions
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists "credit_cards_select_family" on public.credit_cards;
create policy "credit_cards_select_family" on public.credit_cards
  for select using (family_id = public.current_family_id());

drop policy if exists "credit_cards_insert_own" on public.credit_cards;
create policy "credit_cards_insert_own" on public.credit_cards
  for insert with check (family_id = public.current_family_id() and owner_id = auth.uid());

drop policy if exists "credit_cards_update_own" on public.credit_cards;
create policy "credit_cards_update_own" on public.credit_cards
  for update using (family_id = public.current_family_id() and owner_id = auth.uid())
  with check (family_id = public.current_family_id() and owner_id = auth.uid());

drop policy if exists "cash_settings_all_family" on public.cash_settings;
create policy "cash_settings_all_family" on public.cash_settings
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

-- budgets: family_id 기준
drop policy if exists "budgets_all_family" on public.budgets;
create policy "budgets_all_family" on public.budgets
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

-- ------------------------------------------------------------
-- Realtime (선택): 거래 테이블 실시간 구독 활성화
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.transactions;

-- ------------------------------------------------------------
-- 예전 임시 컬럼은 사용하지 않습니다. 카드 자동이체일은 card_due_date에 저장합니다.
-- ------------------------------------------------------------
alter table public.transactions drop column if exists due_date;

-- 적금 자동납입
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

-- 보유 주식과 KRX 종가 캐시
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
-- 대출 이자 납입 일정과 자동 지출 거래
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  name text not null check (length(trim(name)) between 1 and 80),
  loan_date date not null,
  repayment_date date not null,
  principal_amount numeric not null check (principal_amount > 0),
  annual_interest_rate numeric not null check (annual_interest_rate >= 0),
  interest_day integer not null check (interest_day between 1 and 31),
  payment_method text not null check (payment_method in ('현금', '신용카드')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (repayment_date >= loan_date)
);

alter table public.transactions
  add column if not exists loan_id uuid references public.loans(id) on delete set null;
create unique index if not exists transactions_loan_date_key
  on public.transactions(loan_id, date) where loan_id is not null;

alter table public.loans enable row level security;
grant select, insert, update, delete on public.loans to authenticated;
drop policy if exists "loans_all_family" on public.loans;
create policy "loans_all_family" on public.loans
  for all to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

-- 대출 이자를 카드로 납입하는 경우 실제 카드 정보가 없으므로 납입일을 출금 예정일로 사용합니다.
create or replace function public.set_credit_card_due_date()
returns trigger language plpgsql as $$
declare
  card_record public.credit_cards%rowtype;
  next_month date;
  last_day integer;
  recalculate boolean := tg_op = 'INSERT';
begin
  if new.type = 'expense' and new.payment_method = '신용카드' then
    if new.loan_id is not null then
      new.card_id := null;
      new.card_due_date := new.date;
      return new;
    end if;
    if new.card_id is null then
      if tg_op = 'INSERT' then
        raise exception '등록된 신용카드를 선택해주세요';
      elsif old.payment_method is distinct from new.payment_method
         or old.card_id is distinct from new.card_id then
        raise exception '등록된 신용카드를 선택해주세요';
      end if;
      new.card_due_date := null;
      return new;
    end if;
    select * into card_record from public.credit_cards where id = new.card_id;
    if not found or card_record.family_id <> new.family_id or card_record.owner_id <> new.member_id then
      raise exception '작성자에게 등록된 신용카드를 선택해주세요';
    end if;
    if not card_record.active then
      if tg_op = 'INSERT' then
        raise exception '사용 중인 신용카드를 선택해주세요';
      elsif old.card_id is distinct from new.card_id then
        raise exception '사용 중인 신용카드를 선택해주세요';
      end if;
    end if;
    if tg_op = 'UPDATE' then
      recalculate := old.date is distinct from new.date
        or old.card_id is distinct from new.card_id
        or old.payment_method is distinct from new.payment_method;
    end if;
    if recalculate then
      next_month := (date_trunc('month', new.date) + interval '1 month')::date;
      last_day := extract(day from (next_month + interval '1 month - 1 day'))::integer;
      new.card_due_date := next_month + (least(card_record.debit_day, last_day) - 1);
    else
      new.card_due_date := old.card_due_date;
    end if;
  else
    new.card_id := null;
    new.card_due_date := null;
  end if;
  return new;
end;
$$;

create or replace function public.sync_loan_interest_transactions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  loan_record public.loans%rowtype;
  payment_month date;
  payment_date date;
  interest_category_id uuid;
  monthly_interest numeric;
  local_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if tg_op = 'DELETE' then
    loan_record := old;
  else
    loan_record := new;
    if not exists (
      select 1 from public.profiles p
      where p.id = loan_record.member_id and p.family_id = loan_record.family_id
    ) then
      raise exception '같은 가족의 구성원을 선택해주세요';
    end if;
  end if;

  delete from public.transactions
  where loan_id = loan_record.id and date >= local_today;

  if tg_op = 'DELETE' then return old; end if;
  if not loan_record.active or loan_record.annual_interest_rate = 0 then return new; end if;

  select id into interest_category_id from public.categories
  where family_id = loan_record.family_id and type = 'expense' and name = '대출이자'
  order by created_at limit 1;
  if interest_category_id is null then
    insert into public.categories (family_id, name, type, color, icon)
    values (loan_record.family_id, '대출이자', 'expense', '#c084fc', '🏠')
    returning id into interest_category_id;
  end if;

  monthly_interest := round(loan_record.principal_amount * loan_record.annual_interest_rate / 1200);
  if monthly_interest <= 0 then return new; end if;

  for payment_month in
    select generate_series(
      date_trunc('month', loan_record.loan_date)::date,
      date_trunc('month', loan_record.repayment_date)::date,
      interval '1 month'
    )::date
  loop
    payment_date := payment_month + (
      least(loan_record.interest_day, extract(day from (payment_month + interval '1 month - 1 day'))::integer) - 1
    );
    if payment_date >= loan_record.loan_date
      and payment_date >= local_today
      and payment_date <= loan_record.repayment_date then
      insert into public.transactions
        (family_id, member_id, date, type, amount, category_id, payment_method, memo, loan_id)
      values
        (loan_record.family_id, loan_record.member_id, payment_date, 'expense', monthly_interest,
         interest_category_id, loan_record.payment_method, loan_record.name || ' · 대출이자 자동납입', loan_record.id);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_loan_sync_interest_transactions on public.loans;
drop trigger if exists on_loan_delete_interest_transactions on public.loans;
create trigger on_loan_sync_interest_transactions
  after insert or update on public.loans
  for each row execute function public.sync_loan_interest_transactions();
create trigger on_loan_delete_interest_transactions
  before delete on public.loans
  for each row execute function public.sync_loan_interest_transactions();

insert into public.categories (family_id, name, type, color, icon)
select f.id, '대출이자', 'expense', '#c084fc', '🏠'
from public.families f
where not exists (
  select 1 from public.categories c
  where c.family_id = f.id and c.type = 'expense' and c.name = '대출이자'
);

