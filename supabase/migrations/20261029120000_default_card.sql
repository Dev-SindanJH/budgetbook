-- 구성원별 결제 대표카드 (20261029120000).
-- 지출을 기록할 때 대표카드와 그 카드의 결제대금 출금 보유처(credit_cards.default_cash_asset_id)를 미리 골라둡니다.
-- 가족이 함께 쓰는 카드이므로 다른 구성원이 등록한 카드도 대표카드로 정할 수 있습니다.
alter table public.profiles
  add column if not exists default_card_id uuid references public.credit_cards(id) on delete set null;

create or replace function public.check_profile_default_card()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- 다른 가계부로 옮기면 이전 가계부의 카드는 쓸 수 없으므로 대표카드를 비웁니다.
  if tg_op = 'UPDATE' and new.family_id is distinct from old.family_id
     and new.default_card_id is not distinct from old.default_card_id then
    new.default_card_id := null;
  end if;
  -- 이미 정해둔 카드가 나중에 사용 중지되어도 다른 프로필 수정은 막지 않습니다.
  if new.default_card_id is not null
     and (tg_op = 'INSERT' or new.default_card_id is distinct from old.default_card_id)
     and not exists (
       select 1 from public.credit_cards c
       where c.id = new.default_card_id and c.family_id = new.family_id and c.active
     ) then
    raise exception '가계부에 등록된 사용 중인 신용카드를 대표카드로 선택해주세요';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_check_default_card on public.profiles;
create trigger on_profile_check_default_card
  before insert or update of default_card_id, family_id on public.profiles
  for each row execute function public.check_profile_default_card();
