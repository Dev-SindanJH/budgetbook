-- Existing Supabase projects: run this once in SQL Editor before using the new app.
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  nickname text not null check (length(trim(nickname)) between 1 and 40),
  debit_day integer not null check (debit_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  opening_date date not null,
  opening_balance numeric not null check (opening_balance >= 0)
);

alter table public.transactions add column if not exists card_id uuid references public.credit_cards(id);
alter table public.transactions add column if not exists card_due_date date;
create index if not exists transactions_card_due_date_idx on public.transactions(card_due_date);

create or replace function public.set_credit_card_due_date()
returns trigger language plpgsql as $$
declare
  card_record public.credit_cards%rowtype;
  next_month date;
  last_day integer;
  recalculate boolean := tg_op = 'INSERT';
begin
  if new.type = 'expense' and new.payment_method = '신용카드' then
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

drop trigger if exists on_transaction_set_card_due_date on public.transactions;
create trigger on_transaction_set_card_due_date before insert or update on public.transactions
  for each row execute function public.set_credit_card_due_date();

alter table public.credit_cards enable row level security;
alter table public.cash_settings enable row level security;
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
