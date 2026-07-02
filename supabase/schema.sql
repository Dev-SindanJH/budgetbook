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
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
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

-- budgets: family_id 기준
drop policy if exists "budgets_all_family" on public.budgets;
create policy "budgets_all_family" on public.budgets
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

-- ------------------------------------------------------------
-- Realtime (선택): 거래 테이블 실시간 구독 활성화
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.transactions;
