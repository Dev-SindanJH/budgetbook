-- 가족 공유 신용카드와 카드 할부 자동 등록 (20261022120000).

-- 같은 가계부 그룹의 카드는 누구나 결제수단으로 고를 수 있습니다.
-- 할부 회차는 카드가 사용 중지되어도 끝까지 청구되므로 활성 여부를 검사하지 않습니다.
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
    if not found or card_record.family_id <> new.family_id then
      raise exception '가계부에 등록된 신용카드를 선택해주세요';
    end if;
    if not card_record.active and new.installment_id is null then
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

-- 할부는 회차마다 신용카드 지출 한 건으로 기록합니다. k회차는 구매일로부터
-- k-1개월 뒤에 사용한 것으로 보고, 출금일은 일반 카드 지출처럼 다음 달 자동이체일입니다.
create table if not exists public.card_installments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  card_id uuid not null references public.credit_cards(id),
  category_id uuid references public.categories(id) on delete set null,
  cash_asset_id uuid,
  name text not null check (length(trim(name)) between 1 and 80),
  purchase_date date not null,
  total_months integer not null check (total_months between 2 and 60),
  -- 이미 낸 회차가 있으면 남은 첫 회차부터 등록합니다.
  first_installment integer not null,
  -- total: 전체 금액을 개월 수로 나누고 나머지는 1회차에 더합니다. monthly: 매달 같은 금액.
  amount_mode text not null check (amount_mode in ('total', 'monthly')),
  amount numeric not null check (amount > 0 and amount = trunc(amount)),
  created_at timestamptz not null default now(),
  check (first_installment between 1 and total_months),
  check (amount_mode = 'monthly' or amount >= total_months),
  constraint card_installments_cash_asset_family_fkey foreign key (cash_asset_id, family_id)
    references public.cash_assets(id, family_id) on delete restrict
);
create index if not exists card_installments_family_idx on public.card_installments(family_id);

alter table public.transactions
  add column if not exists installment_id uuid references public.card_installments(id) on delete set null;
alter table public.transactions add column if not exists installment_no integer;
create unique index if not exists transactions_installment_no_key
  on public.transactions(installment_id, installment_no) where installment_id is not null;

alter table public.card_installments enable row level security;
-- 할부는 등록과 취소만 지원합니다. 조건을 바꾸려면 취소 후 다시 등록합니다.
grant select, insert, delete on public.card_installments to authenticated;
-- Supabase 기본 권한으로 부여되는 수정 권한은 회수합니다.
revoke update, truncate on public.card_installments from authenticated, anon;
drop policy if exists "card_installments_all_family" on public.card_installments;
create policy "card_installments_all_family" on public.card_installments
  for all to authenticated
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));

create or replace function public.sync_card_installment_transactions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  plan public.card_installments%rowtype;
  card_record public.credit_cards%rowtype;
  current_no integer;
  usage_date date;
  due_month date;
  due_date date;
  installment_amount numeric;
  local_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if tg_op = 'DELETE' then
    -- 이미 출금된 회차는 기록으로 남기고, 앞으로 출금될 회차만 취소합니다.
    delete from public.transactions
    where installment_id = old.id and card_due_date >= local_today;
    return old;
  end if;

  plan := new;
  if not exists (
    select 1 from public.profiles p
    where p.id = plan.member_id and p.family_id = plan.family_id
  ) then
    raise exception '같은 가족의 구성원을 선택해주세요';
  end if;
  select * into card_record from public.credit_cards
  where id = plan.card_id and family_id = plan.family_id;
  if not found then
    raise exception '가계부에 등록된 신용카드를 선택해주세요';
  end if;
  if not card_record.active then
    raise exception '사용 중인 신용카드를 선택해주세요';
  end if;
  if plan.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = plan.category_id and c.family_id = plan.family_id and c.type = 'expense'
  ) then
    raise exception '지출 카테고리를 확인해주세요';
  end if;

  for current_no in plan.first_installment .. plan.total_months loop
    usage_date := (plan.purchase_date + make_interval(months => current_no - 1))::date;
    due_month := (date_trunc('month', usage_date) + interval '1 month')::date;
    due_date := due_month + (
      least(card_record.debit_day, extract(day from (due_month + interval '1 month - 1 day'))::integer) - 1
    );
    if plan.amount_mode = 'monthly' then
      installment_amount := plan.amount;
    else
      installment_amount := floor(plan.amount / plan.total_months);
      if current_no = 1 then
        installment_amount := plan.amount - installment_amount * (plan.total_months - 1);
      end if;
    end if;
    insert into public.transactions
      (family_id, member_id, date, type, amount, category_id, payment_method, card_id,
       cash_asset_id, cash_balance_included, memo, installment_id, installment_no)
    values
      (plan.family_id, plan.member_id, usage_date, 'expense', installment_amount, plan.category_id,
       '신용카드', plan.card_id, plan.cash_asset_id,
       -- 남은 회차라도 출금일이 지났다면 이미 잔액에 반영된 것으로 봅니다.
       plan.cash_asset_id is not null and due_date >= local_today,
       plan.name || ' · 할부 ' || current_no || '/' || plan.total_months || '회차',
       plan.id, current_no);
  end loop;
  return new;
end;
$$;

drop trigger if exists on_card_installment_create_transactions on public.card_installments;
drop trigger if exists on_card_installment_delete_transactions on public.card_installments;
create trigger on_card_installment_create_transactions
  after insert on public.card_installments
  for each row execute function public.sync_card_installment_transactions();
create trigger on_card_installment_delete_transactions
  before delete on public.card_installments
  for each row execute function public.sync_card_installment_transactions();
