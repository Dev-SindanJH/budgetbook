-- 카드 결제 알림 자동 등록 (20261022150000).
-- 휴대폰 자동화 앱이 카드사 알림 원문을 보내면 카드 끝 4자리로 카드를 찾아 지출을 기록합니다.

-- 카드 번호 전체는 저장하지 않고, 알림과 카드를 연결할 끝 4자리만 보관합니다.
-- 자동 등록된 지출이 잔액에 바로 반영되도록 끝 4자리를 쓰는 카드는 출금 보유처가 필요합니다.
alter table public.credit_cards add column if not exists last4 text;
alter table public.credit_cards add column if not exists default_cash_asset_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.credit_cards'::regclass and conname = 'credit_cards_last4_check') then
    alter table public.credit_cards add constraint credit_cards_last4_check
      check (last4 is null or (last4 ~ '^[0-9]{4}$' and default_cash_asset_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.credit_cards'::regclass and conname = 'credit_cards_default_cash_asset_fkey') then
    alter table public.credit_cards add constraint credit_cards_default_cash_asset_fkey
      foreign key (default_cash_asset_id, family_id) references public.cash_assets(id, family_id) on delete restrict;
  end if;
end;
$$;
create unique index if not exists credit_cards_family_last4_key
  on public.credit_cards(family_id, last4) where last4 is not null and active;

-- 구성원마다 연결 키 하나. 원문은 만들 때 한 번만 보여주고 해시만 저장합니다.
create table if not exists public.card_notification_tokens (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.card_notification_tokens enable row level security;
revoke all on public.card_notification_tokens from anon, authenticated;
grant select, delete on public.card_notification_tokens to authenticated;
drop policy if exists "card_notification_tokens_own" on public.card_notification_tokens;
create policy "card_notification_tokens_own" on public.card_notification_tokens
  for all to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

-- 받은 알림과 처리 결과. 승인을 취소 알림과 짝짓고 같은 알림이 두 번 기록되지 않게 합니다.
create table if not exists public.card_notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  raw_text text not null,
  kind text check (kind in ('approval', 'cancel')),
  card_last4 text,
  card_id uuid references public.credit_cards(id) on delete set null,
  amount numeric,
  installment_months integer,
  approved_at timestamp,
  merchant text,
  -- recorded: 지출 기록, canceled: 기록 후 취소됨, cancel_applied: 승인을 취소함,
  -- cancel_unmatched/card_unmatched/unparsed/error: 직접 확인 필요
  status text not null check (status in ('recorded', 'canceled', 'cancel_applied', 'cancel_unmatched', 'card_unmatched', 'unparsed', 'error')),
  message text,
  transaction_id uuid references public.transactions(id) on delete set null,
  installment_id uuid references public.card_installments(id) on delete set null,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists card_notifications_dedupe_key
  on public.card_notifications(family_id, dedupe_key) where dedupe_key is not null;
create index if not exists card_notifications_family_created_idx
  on public.card_notifications(family_id, created_at desc);
alter table public.card_notifications enable row level security;
revoke all on public.card_notifications from anon, authenticated;
grant select on public.card_notifications to authenticated;
drop policy if exists "card_notifications_select_family" on public.card_notifications;
create policy "card_notifications_select_family" on public.card_notifications
  for select to authenticated
  using (family_id = (select public.current_family_id()));

create or replace function public.create_card_notification_token()
returns text language plpgsql security definer set search_path = '' as $$
declare
  fid uuid;
  token text;
begin
  select family_id into fid from public.profiles where id = auth.uid();
  if fid is null then
    raise exception '가계부에 참여한 뒤 연결 키를 만들 수 있어요';
  end if;
  -- 두 개의 v4 UUID(각 122비트 난수)를 이어 붙인 64자 키입니다.
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.card_notification_tokens (member_id, family_id, token_hash)
  values (auth.uid(), fid, encode(sha256(convert_to(token, 'UTF8')), 'hex'))
  on conflict (member_id) do update
    set family_id = excluded.family_id, token_hash = excluded.token_hash,
        created_at = now(), last_used_at = null;
  return token;
end;
$$;
revoke all on function public.create_card_notification_token() from public, anon;
grant execute on function public.create_card_notification_token() to authenticated;

-- 알림 원문을 그대로 받습니다(Content-Type: text/plain). 연결 키는 x-card-token 헤더로 받습니다.
-- 지원 형식(삼성카드 카카오톡·문자):
--   삼성4371승인 김*혁 / 150,000원 일시불 / 10/22 07:03 삼미상사(주)미광 / 누적1,792,113원
--   삼성4371취소 김*혁 / -150,000원 일시불 / 10/22 07:03 삼미상사(주)미광 / 누적1,720,113원
create or replace function public.record_card_notification(text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  raw text := left(coalesce($1, ''), 2000);
  normalized text;
  token text;
  tok public.card_notification_tokens%rowtype;
  v_card public.credit_cards%rowtype;
  head text[];
  money text[];
  stamp text[];
  v_merchant text;
  v_kind text;
  v_amount numeric;
  v_months integer;
  v_approved timestamp;
  local_today date := (now() at time zone 'Asia/Seoul')::date;
  key text;
  v_category uuid;
  new_transaction uuid;
  new_installment uuid;
  v_approval public.card_notifications%rowtype;
  log_id uuid;
begin
  token := nullif(current_setting('request.headers', true), '')::json ->> 'x-card-token';
  if token is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  select * into tok from public.card_notification_tokens
  where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
  if not found or not exists (
    select 1 from public.profiles where id = tok.member_id and family_id = tok.family_id
  ) then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  update public.card_notification_tokens set last_used_at = now() where member_id = tok.member_id;

  normalized := btrim(regexp_replace(raw, '\s+', ' ', 'g'));
  head := regexp_match(normalized, '삼성 ?([0-9]{4}) ?(승인|취소)');
  -- 광고나 다른 알림은 기록하지 않습니다.
  if head is null then
    return jsonb_build_object('status', 'ignored');
  end if;
  v_kind := case head[2] when '승인' then 'approval' else 'cancel' end;
  money := regexp_match(normalized, '(-?[0-9][0-9,]*) ?원 ?(일시불|([0-9]{1,2}) ?개월)');
  stamp := regexp_match(normalized, '([0-9]{1,2})/([0-9]{1,2}) ([0-9]{1,2}):([0-9]{2}) (.+)$');
  if money is null or stamp is null then
    insert into public.card_notifications (family_id, member_id, raw_text, kind, card_last4, status, message)
    values (tok.family_id, tok.member_id, raw, v_kind, head[1], 'unparsed', '알림 형식을 읽지 못했어요');
    return jsonb_build_object('status', 'unparsed');
  end if;
  v_amount := abs(replace(money[1], ',', '')::numeric);
  v_months := coalesce(money[3]::integer, 1);
  v_merchant := left(btrim(regexp_replace(stamp[5], ' ?누적.*$', '')), 80);
  if v_merchant = '' then v_merchant := '카드 결제'; end if;
  begin
    v_approved := make_timestamp(extract(year from local_today)::integer, stamp[1]::integer,
      stamp[2]::integer, stamp[3]::integer, stamp[4]::integer, 0);
  exception when others then
    insert into public.card_notifications (family_id, member_id, raw_text, kind, card_last4, status, message)
    values (tok.family_id, tok.member_id, raw, v_kind, head[1], 'unparsed', '승인 날짜를 읽지 못했어요');
    return jsonb_build_object('status', 'unparsed');
  end;
  -- 알림에는 연도가 없습니다. 1월에 받은 12월 결제는 작년 결제입니다.
  if v_approved::date > local_today + 1 then
    v_approved := v_approved - interval '1 year';
  end if;

  -- 카카오톡과 문자로 같은 알림이 함께 와도 한 번만 처리합니다.
  key := head[1] || '|' || v_kind || '|' || to_char(v_approved, 'YYYY-MM-DD HH24:MI') || '|' || v_amount || '|' || v_months || '|' || v_merchant;
  if exists (select 1 from public.card_notifications where family_id = tok.family_id and dedupe_key = key) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  insert into public.card_notifications (family_id, member_id, raw_text, kind, card_last4, amount,
    installment_months, approved_at, merchant, status, dedupe_key)
  values (tok.family_id, tok.member_id, raw, v_kind, head[1], v_amount, v_months, v_approved, v_merchant, 'error', key)
  returning id into log_id;

  select * into v_card from public.credit_cards
  where family_id = tok.family_id and last4 = head[1] and active
  order by created_at limit 1;
  if not found then
    update public.card_notifications
    set status = 'card_unmatched', message = '끝자리 ' || head[1] || '인 카드를 설정에서 등록해주세요'
    where id = log_id;
    return jsonb_build_object('status', 'card_unmatched');
  end if;
  update public.card_notifications set card_id = v_card.id where id = log_id;

  begin
    if v_kind = 'approval' then
      -- 같은 가맹점에 마지막으로 고른 카테고리를 그대로 씁니다.
      select t.category_id into v_category from public.transactions t
      where t.family_id = tok.family_id and t.type = 'expense' and t.memo = v_merchant and t.category_id is not null
      order by t.created_at desc limit 1;
      if v_months >= 2 then
        insert into public.card_installments (family_id, member_id, card_id, category_id, cash_asset_id, name,
          purchase_date, total_months, first_installment, amount_mode, amount)
        values (tok.family_id, tok.member_id, v_card.id, v_category, v_card.default_cash_asset_id, v_merchant,
          v_approved::date, v_months, 1, 'total', v_amount)
        returning id into new_installment;
      else
        insert into public.transactions (family_id, member_id, date, type, amount, category_id,
          payment_method, card_id, cash_asset_id, cash_balance_included, memo)
        values (tok.family_id, tok.member_id, v_approved::date, 'expense', v_amount, v_category,
          '신용카드', v_card.id, v_card.default_cash_asset_id, true, v_merchant)
        returning id into new_transaction;
      end if;
      update public.card_notifications
      set status = 'recorded', transaction_id = new_transaction, installment_id = new_installment
      where id = log_id;
      return jsonb_build_object('status', 'recorded', 'transaction_id', new_transaction, 'installment_id', new_installment);
    end if;

    -- 취소 알림의 시각은 원래 승인 시각입니다. 같은 시각을 먼저 찾고, 없으면 가장 최근 승인을 취소합니다.
    select * into v_approval from public.card_notifications n
    where n.family_id = tok.family_id and n.kind = 'approval' and n.status = 'recorded'
      and n.card_id = v_card.id and n.amount = v_amount and n.merchant = v_merchant
    order by (n.approved_at = v_approved) desc, n.approved_at desc
    limit 1 for update;
    if not found then
      update public.card_notifications
      set status = 'cancel_unmatched', message = '자동 등록된 승인 내역을 찾지 못했어요. 내역에서 직접 확인해주세요'
      where id = log_id;
      return jsonb_build_object('status', 'cancel_unmatched');
    end if;
    if v_approval.transaction_id is not null then
      delete from public.transactions where id = v_approval.transaction_id;
    end if;
    if v_approval.installment_id is not null then
      delete from public.card_installments where id = v_approval.installment_id;
    end if;
    update public.card_notifications set status = 'canceled' where id = v_approval.id;
    update public.card_notifications set status = 'cancel_applied' where id = log_id;
    return jsonb_build_object('status', 'cancel_applied');
  exception when others then
    update public.card_notifications set status = 'error', message = left(sqlerrm, 200) where id = log_id;
    return jsonb_build_object('status', 'error', 'message', sqlerrm);
  end;
end;
$$;
revoke all on function public.record_card_notification(text) from public;
grant execute on function public.record_card_notification(text) to anon, authenticated;
