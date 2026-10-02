-- Family schedules are independent of financial transactions.
create table public.family_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  version integer not null default 1,
  stopped_after integer,
  created_at timestamptz not null default now(),
  unique(id, family_id)
);
create table public.family_event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  family_id uuid not null,
  occurrence_year integer not null check (occurrence_year between 1900 and 2100),
  title text not null check (length(trim(title)) between 1 and 120),
  kind text not null check (kind in ('birthday','wedding','other')),
  event_date date not null,
  spend_date date not null,
  planned_amount numeric(15,0) check (planned_amount >= 0),
  status text not null default 'pending' check (status in ('pending','complete','cancelled')),
  owner_id uuid references public.profiles(id) on delete set null,
  memo text not null default '' check (length(memo) <= 2000),
  location text not null default '' check (length(location) <= 200),
  event_time text not null default '' check (event_time = '' or event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  calendar_note text not null default '',
  customized boolean not null default false,
  suppressed boolean not null default false,
  unique(event_id, occurrence_year),
  unique(id, family_id),
  foreign key(event_id, family_id) references public.family_events(id, family_id) on delete cascade
);
create index family_events_family_idx on public.family_events(family_id);
create index family_occurrences_date_idx on public.family_event_occurrences(family_id, event_date);
create index family_occurrences_spend_idx on public.family_event_occurrences(family_id, spend_date);
create index family_occurrences_owner_idx on public.family_event_occurrences(owner_id);
alter table public.transactions add column family_event_occurrence_id uuid;
alter table public.transactions add constraint transactions_family_event_fkey
  foreign key(family_event_occurrence_id, family_id) references public.family_event_occurrences(id, family_id) on delete restrict;
create index transactions_family_event_idx on public.transactions(family_event_occurrence_id, family_id);

alter table public.family_events enable row level security;
alter table public.family_event_occurrences enable row level security;
revoke all on public.family_events, public.family_event_occurrences from anon, authenticated;
grant select, insert, update, delete on public.family_events, public.family_event_occurrences to authenticated;
create policy family_events_family on public.family_events for all to authenticated
  using (family_id = (select public.current_family_id())) with check (family_id = (select public.current_family_id()));
create policy family_occurrences_family on public.family_event_occurrences for all to authenticated
  using (family_id = (select public.current_family_id())) with check (family_id = (select public.current_family_id()));

-- Locking the shared parent serializes both spouses' edits. Stale UI writes fail.
create function public.lock_family_event(p_id uuid, p_version integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  select version into v from public.family_events where id=p_id and family_id=public.current_family_id() for update;
  if not found then raise exception '일정을 찾을 수 없어요. 새로고침해주세요.'; end if;
  if p_version is null or v <> p_version then raise exception '다른 가족이 일정을 변경했어요. 새로고침 후 다시 확인해주세요.'; end if;
end $$;

create function public.validate_family_occurrence() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op <> 'DELETE' then
    if new.owner_id is not null and not exists(select 1 from public.profiles where id=new.owner_id and family_id=new.family_id) then
      raise exception '같은 가족의 담당자를 선택해주세요.';
    end if;
    if tg_op='UPDATE' and (new.event_id<>old.event_id or new.family_id<>old.family_id or new.occurrence_year<>old.occurrence_year) then
      raise exception '일정의 소속과 반복 연도는 변경할 수 없어요.';
    end if;
    update public.family_events set version=version+1 where id=new.event_id;
    return new;
  end if;
  update public.family_events set version=version+1 where id=old.event_id;
  return old;
end $$;
create trigger family_occurrence_validate before insert or update or delete on public.family_event_occurrences
  for each row execute function public.validate_family_occurrence();

create function public.save_family_event(p_id uuid, p_definition jsonb, p_rows jsonb, p_from_year integer, p_version integer default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare fid uuid := public.current_family_id(); r jsonb; eid uuid := p_id;
begin
  if fid is null then raise exception '가족 로그인이 필요해요.'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 201 then raise exception '일정 날짜를 확인해주세요.'; end if;
  if exists(select 1 from public.family_events where id=eid) then
    perform public.lock_family_event(eid,p_version);
    if p_from_year < extract(year from (now() at time zone 'Asia/Seoul')) then raise exception '지난 연도는 이번 일정만 수정해주세요.'; end if;
    update public.family_events set definition=p_definition, version=version+1, stopped_after=null where id=eid;
  else
    if p_version is not null then raise exception '일정을 찾을 수 없어요.'; end if;
    insert into public.family_events(id,family_id,definition) values(eid,fid,p_definition);
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if (r->>'occurrence_year')::integer < p_from_year then raise exception '반복 시작 연도를 확인해주세요.'; end if;
    insert into public.family_event_occurrences(event_id,family_id,occurrence_year,title,kind,event_date,spend_date,planned_amount,owner_id,memo,location,event_time,calendar_note,customized)
    values(eid,fid,(r->>'occurrence_year')::integer,r->>'title',r->>'kind',(r->>'event_date')::date,(r->>'spend_date')::date,
      (r->>'planned_amount')::numeric,nullif(r->>'owner_id','')::uuid,coalesce(r->>'memo',''),coalesce(r->>'location',''),coalesce(r->>'event_time',''),coalesce(r->>'calendar_note',''),(r->>'occurrence_year')::integer=p_from_year)
    on conflict(event_id,occurrence_year) do update set
      title=excluded.title,kind=excluded.kind,event_date=excluded.event_date,spend_date=excluded.spend_date,
      planned_amount=case when excluded.occurrence_year=p_from_year then excluded.planned_amount else public.family_event_occurrences.planned_amount end,
      owner_id=excluded.owner_id,memo=excluded.memo,location=excluded.location,event_time=excluded.event_time,
      calendar_note=excluded.calendar_note,customized=excluded.customized,suppressed=false,
      status=case when not public.family_event_occurrences.customized and public.family_event_occurrences.status='cancelled' then 'pending' else public.family_event_occurrences.status end
    where public.family_event_occurrences.occurrence_year=p_from_year or
      (not public.family_event_occurrences.customized and public.family_event_occurrences.status in ('pending','cancelled')
       and not exists(select 1 from public.transactions t where t.family_event_occurrence_id=public.family_event_occurrences.id));
  end loop;
  -- A new recurrence rule may omit years (e.g. leap-month-only birthdays).
  update public.family_event_occurrences o set status='cancelled',suppressed=true
    where event_id=eid and occurrence_year>=p_from_year and not customized and status='pending'
    and not exists(select 1 from jsonb_array_elements(p_rows) as items(value) where (items.value->>'occurrence_year')::integer=o.occurrence_year)
    and not exists(select 1 from public.transactions t where t.family_event_occurrence_id=o.id);
  return eid;
end $$;

create function public.update_family_occurrence(p_id uuid, p_patch jsonb, p_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare eid uuid;
begin
  select event_id into eid from public.family_event_occurrences where id=p_id;
  perform public.lock_family_event(eid,p_version);
  update public.family_event_occurrences set
    title=coalesce(p_patch->>'title',title),event_date=coalesce((p_patch->>'event_date')::date,event_date),
    spend_date=coalesce((p_patch->>'spend_date')::date,spend_date),
    planned_amount=case when p_patch ? 'planned_amount' then (p_patch->>'planned_amount')::numeric else planned_amount end,
    owner_id=case when p_patch ? 'owner_id' then nullif(p_patch->>'owner_id','')::uuid else owner_id end,
    memo=coalesce(p_patch->>'memo',memo),location=coalesce(p_patch->>'location',location),event_time=coalesce(p_patch->>'event_time',event_time),
    status=coalesce(p_patch->>'status',status),customized=true where id=p_id;
end $$;

create function public.stop_family_event(p_id uuid, p_after_year integer, p_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lock_family_event(p_id,p_version);
  update public.family_events set stopped_after=p_after_year,version=version+1 where id=p_id;
  -- Keep actual payments and historical occurrences, even when stopping a series.
  update public.family_event_occurrences o set status='cancelled',suppressed=true where event_id=p_id
    and occurrence_year>p_after_year and event_date>=(now() at time zone 'Asia/Seoul')::date
    and status='pending' and not exists(select 1 from public.transactions t where t.family_event_occurrence_id=o.id);
end $$;

-- Direct transaction edits/deletes also update the plan. Linked expenses must be actual, not scheduled.
create function public.check_family_event_transaction() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare oid uuid; eid uuid;
begin
  if tg_op <> 'DELETE' and new.family_event_occurrence_id is not null then
    if new.type<>'expense' or new.date>(now() at time zone 'Asia/Seoul')::date or new.savings_plan_id is not null or new.loan_id is not null then
      raise exception '일정에는 실제 지급한 일반 지출만 연결할 수 있어요.';
    end if;
    if not exists(select 1 from public.family_event_occurrences where id=new.family_event_occurrence_id and family_id=new.family_id) then
      raise exception '같은 가족의 일정만 연결할 수 있어요.';
    end if;
  end if;
  for oid in select distinct x from unnest(array[
    case when tg_op<>'INSERT' then old.family_event_occurrence_id end,
    case when tg_op<>'DELETE' then new.family_event_occurrence_id end]) x where x is not null order by x loop
    select event_id into eid from public.family_event_occurrences where id=oid;
    update public.family_events set version=version+1 where id=eid;
    if tg_op='DELETE' or (tg_op='UPDATE' and (new.amount<old.amount or new.family_event_occurrence_id is distinct from old.family_event_occurrence_id)) then
      update public.family_event_occurrences set status='pending',customized=true where id=oid and status='complete';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger family_event_transaction_check before insert or update or delete on public.transactions
  for each row execute function public.check_family_event_transaction();

create function public.record_family_event_expense(p_occurrence_id uuid,p_transaction jsonb,p_request_id uuid,p_version integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare eid uuid; fid uuid; existing uuid;
begin
  select event_id,family_id into eid,fid from public.family_event_occurrences where id=p_occurrence_id;
  -- Retrying the same request after a lost response must not create a second payment.
  select id into existing from public.transactions where id=p_request_id and family_event_occurrence_id=p_occurrence_id;
  if existing is not null then return existing; end if;
  perform public.lock_family_event(eid,p_version);
  if not exists(select 1 from public.family_event_occurrences where id=p_occurrence_id and status='pending') then raise exception '준비 중인 일정에 지출을 기록해주세요.'; end if;
  if (p_transaction->>'amount')::numeric is null or (p_transaction->>'amount')::numeric<=0 or (p_transaction->>'amount')::numeric<>trunc((p_transaction->>'amount')::numeric) then raise exception '지출 금액은 1원 이상의 정수로 입력해주세요.'; end if;
  if not exists(select 1 from public.profiles where id=(p_transaction->>'member_id')::uuid and family_id=fid) then raise exception '같은 가족의 작성자를 선택해주세요.'; end if;
  if nullif(p_transaction->>'category_id','') is not null and not exists(select 1 from public.categories where id=(p_transaction->>'category_id')::uuid and family_id=fid and type='expense') then raise exception '지출 카테고리를 확인해주세요.'; end if;
  insert into public.transactions(id,family_id,member_id,date,type,amount,category_id,payment_method,card_id,cash_asset_id,cash_balance_included,memo,family_event_occurrence_id)
  values(p_request_id,fid,(p_transaction->>'member_id')::uuid,(p_transaction->>'date')::date,'expense',(p_transaction->>'amount')::numeric,
    nullif(p_transaction->>'category_id','')::uuid,p_transaction->>'payment_method',nullif(p_transaction->>'card_id','')::uuid,
    nullif(p_transaction->>'cash_asset_id','')::uuid,true,p_transaction->>'memo',p_occurrence_id);
  return p_request_id;
end $$;

create function public.link_family_event_expense(p_occurrence_id uuid,p_transaction_id uuid,p_unlink boolean,p_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare eid uuid; linked uuid; fid uuid;
begin
  select event_id,family_id into eid,fid from public.family_event_occurrences where id=p_occurrence_id;
  perform public.lock_family_event(eid,p_version);
  select family_event_occurrence_id into linked from public.transactions where id=p_transaction_id and family_id=fid for update;
  if not found then raise exception '지출을 찾을 수 없어요.'; end if;
  if p_unlink then
    if linked is distinct from p_occurrence_id then raise exception '이미 연결 상태가 바뀌었어요.'; end if;
  else
    if linked is not null then raise exception '이미 일정에 연결된 지출이에요.'; end if;
    if not exists(select 1 from public.family_event_occurrences where id=p_occurrence_id and status='pending') then raise exception '준비 중인 일정에 연결해주세요.'; end if;
  end if;
  update public.transactions set family_event_occurrence_id=case when p_unlink then null else p_occurrence_id end where id=p_transaction_id;
end $$;

revoke all on function public.lock_family_event(uuid,integer), public.validate_family_occurrence(),
  public.save_family_event(uuid,jsonb,jsonb,integer,integer), public.update_family_occurrence(uuid,jsonb,integer),
  public.stop_family_event(uuid,integer,integer), public.check_family_event_transaction(),
  public.record_family_event_expense(uuid,jsonb,uuid,integer), public.link_family_event_expense(uuid,uuid,boolean,integer) from public, anon;
grant execute on function public.lock_family_event(uuid,integer), public.validate_family_occurrence(),
  public.save_family_event(uuid,jsonb,jsonb,integer,integer), public.update_family_occurrence(uuid,jsonb,integer),
  public.stop_family_event(uuid,integer,integer), public.check_family_event_transaction(),
  public.record_family_event_expense(uuid,jsonb,uuid,integer), public.link_family_event_expense(uuid,uuid,boolean,integer) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.family_events,public.family_event_occurrences;
  end if;
end $$;
