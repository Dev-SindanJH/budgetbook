import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { installmentSchedule } from '../src/utils/creditCards.js'

const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const family = id(1), owner = id(2), spouse = id(3), asset = id(4), card = id(5),
  category = id(6), otherFamily = id(7), outsider = id(8), outsiderCard = id(9), plan = id(10), oldPlan = id(11)
const sql = (source, args = []) => db.query(source, args)
const count = async (where = 'true', args = []) =>
  (await sql(`select count(*)::int n from public.transactions where ${where}`, args)).rows[0].n

await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
const schema = fs.readFileSync('supabase/schema.sql', 'utf8')
  .split('-- Family calendar migration')[0]
  .replace('create extension if not exists pgcrypto;', '')
  .replace('alter publication supabase_realtime add table public.transactions;', '')
await db.exec(schema)
for (const file of ['20261002032103_family_calendar.sql', '20261002072720_fix_family_lookup_search_path.sql',
  '20261022120000_shared_cards_installments.sql', '20261022120000_shared_cards_installments.sql']) {
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'))
}
await db.exec(`insert into public.families(id,name,invite_code) values('${family}','Family','TEST'),('${otherFamily}','Other','OTHER');
  insert into auth.users(id,email) values('${owner}','a@example.com'),('${spouse}','b@example.com'),('${outsider}','c@example.com');
  update public.profiles set family_id='${family}' where id in ('${owner}','${spouse}');
  update public.profiles set family_id='${otherFamily}' where id='${outsider}';
  insert into public.cash_assets(id,family_id,name,amount) values('${asset}','${family}','통장',1000000);
  insert into public.categories(id,family_id,name,type) values('${category}','${family}','가전','expense');
  insert into public.credit_cards(id,family_id,owner_id,nickname,debit_day) values
    ('${card}','${family}','${owner}','남편 카드',15),('${outsiderCard}','${otherFamily}','${outsider}','남의 카드',1);
  grant usage on schema public,auth to authenticated,anon;
  grant select,insert,update,delete on public.transactions, public.cash_assets to authenticated;
  grant select on public.profiles,public.categories,public.credit_cards to authenticated;
  set role authenticated; select set_config('request.jwt.claim.sub','${spouse}',false);`)
const today = (await sql("select (now() at time zone 'Asia/Seoul')::date::text d")).rows[0].d
// 몇 달 전에 구매한 할부를 만들기 위해 오늘 기준으로 날짜를 옮깁니다.
const monthsAgo = async (months) =>
  (await sql(`select ($1::date - make_interval(months => $2))::date::text d`, [today, months])).rows[0].d

// 배우자가 남편 카드로 결제할 수 있고, 다른 가계부의 카드는 쓸 수 없음
await sql(`insert into public.transactions(family_id,member_id,date,type,amount,payment_method,card_id,cash_asset_id)
  values($1,$2,$3,'expense',5000,'신용카드',$4,$5)`, [family, spouse, today, card, asset])
assert.equal(await count('card_id=$1 and member_id=$2 and card_due_date is not null', [card, spouse]), 1)
await assert.rejects(sql(`insert into public.transactions(family_id,member_id,date,type,amount,payment_method,card_id,cash_asset_id)
  values($1,$2,$3,'expense',5000,'신용카드',$4,$5)`, [family, spouse, today, outsiderCard, asset]), /가계부에 등록된 신용카드/)

// 10개월 중 8회차부터 남은 3회차를 전체 금액 기준으로 등록
const purchaseDate = await monthsAgo(7)
await sql(`insert into public.card_installments(id,family_id,member_id,card_id,category_id,cash_asset_id,name,
  purchase_date,total_months,first_installment,amount_mode,amount) values($1,$2,$3,$4,$5,$6,'냉장고',$7,10,8,'total',1000005)`,
[plan, family, spouse, card, category, asset, purchaseDate])
const rows = (await sql(`select installment_no no, date::text, card_due_date::text due, amount::int, memo, cash_balance_included inc
  from public.transactions where installment_id=$1 order by installment_no`, [plan])).rows
const expected = installmentSchedule({ purchaseDate, totalMonths: 10, firstInstallment: 8, amountMode: 'total', amount: 1000005, debitDay: 15 })
assert.deepEqual(rows.map((r) => [r.no, r.date, r.due, r.amount]), expected.map((r) => [r.no, r.date, r.dueDate, r.amount]))
assert.equal(rows[0].memo, '냉장고 · 할부 8/10회차')
assert.deepEqual(rows.map((r) => r.inc), expected.map((r) => r.dueDate >= today))

// 카드가 사용 중지돼도 이미 등록된 할부 회차는 수정할 수 있음
await db.exec(`reset role; update public.credit_cards set active=false where id='${card}'; set role authenticated`)
await sql('update public.transactions set memo=memo where installment_id=$1', [plan])
await assert.rejects(sql(`insert into public.card_installments(family_id,member_id,card_id,name,purchase_date,total_months,
  first_installment,amount_mode,amount) values($1,$2,$3,'TV',$4,3,1,'monthly',1000)`, [family, spouse, card, today]), /사용 중인 신용카드/)
await db.exec(`reset role; update public.credit_cards set active=true where id='${card}'; set role authenticated`)

// 이미 출금된 회차는 남기고 앞으로 출금될 회차만 취소
const laptopDate = await monthsAgo(2)
await sql(`insert into public.card_installments(id,family_id,member_id,card_id,cash_asset_id,name,
  purchase_date,total_months,first_installment,amount_mode,amount) values($1,$2,$3,$4,$5,'노트북',$6,3,1,'monthly',50000)`,
[oldPlan, family, owner, card, asset, laptopDate])
assert.equal(await count('installment_id=$1', [oldPlan]), 3)
await sql('delete from public.card_installments where id=$1', [oldPlan])
const paid = installmentSchedule({ purchaseDate: laptopDate, totalMonths: 3, amountMode: 'monthly', amount: 50000, debitDay: 15 })
  .filter((r) => r.dueDate < today).length
assert.ok(paid >= 1)
assert.equal(await count("memo like '노트북%'"), paid)
assert.equal(await count("memo like '노트북%' and installment_id is null and card_due_date < $1", [today]), paid)

await assert.rejects(sql(`insert into public.card_installments(family_id,member_id,card_id,name,purchase_date,total_months,
  first_installment,amount_mode,amount) values($1,$2,$3,'x',$4,3,4,'monthly',1000)`, [family, spouse, card, today]))
console.log('card installment DB checks passed')
