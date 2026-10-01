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
