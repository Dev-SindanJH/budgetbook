-- Allow recurring savings plans without a fixed maturity date.
alter table public.savings_plans alter column maturity_date drop not null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.savings_plans'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%maturity_date%start_month%'
  loop
    execute format('alter table public.savings_plans drop constraint %I', constraint_record.conname);
  end loop;
end;
$$;

alter table public.savings_plans
  add constraint savings_plans_maturity_after_start
  check (maturity_date is null or maturity_date >= start_month);

create or replace function public.sync_savings_plan_transactions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  plan public.savings_plans%rowtype;
  payment_month date;
  payment_date date;
  final_month date;
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

  -- For open-ended plans, materialize a century of monthly installments.
  -- This keeps the existing transaction-based cash-flow model usable without
  -- requiring a separate background scheduler.
  final_month := coalesce(date_trunc('month', plan.maturity_date)::date,
                          date_trunc('month', plan.start_month + interval '100 years')::date);
  for payment_month in
    select generate_series(plan.start_month, final_month, interval '1 month')::date
  loop
    payment_date := payment_month + (
      least(plan.debit_day, extract(day from (payment_month + interval '1 month - 1 day'))::integer) - 1
    );
    if payment_date >= local_today
      and (plan.maturity_date is null or payment_date <= plan.maturity_date) then
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
