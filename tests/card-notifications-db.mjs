import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const family = id(1), owner = id(2), spouse = id(3), asset = id(4), card = id(5), food = id(6),
  otherFamily = id(7), outsider = id(8)
const sql = (source, args = []) => db.query(source, args)
const one = async (source, args) => (await sql(source, args)).rows[0]

await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')
  .split('-- Family calendar migration')[0]
  .replace('create extension if not exists pgcrypto;', '')
  .replace('alter publication supabase_realtime add table public.transactions;', ''))
for (const file of ['20261002032103_family_calendar.sql', '20261002072720_fix_family_lookup_search_path.sql',
  '20261022120000_shared_cards_installments.sql', '20261022150000_card_notifications.sql',
  '20261022150000_card_notifications.sql']) {
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'))
}
await db.exec(`insert into public.families(id,name,invite_code) values('${family}','Family','TEST'),('${otherFamily}','Other','OTHER');
  insert into auth.users(id,email) values('${owner}','a@example.com'),('${spouse}','b@example.com'),('${outsider}','c@example.com');
  update public.profiles set family_id='${family}' where id in ('${owner}','${spouse}');
  update public.profiles set family_id='${otherFamily}' where id='${outsider}';
  insert into public.cash_assets(id,family_id,name,amount) values('${asset}','${family}','통장',1000000);
  insert into public.categories(id,family_id,name,type) values('${food}','${family}','식비','expense');
  grant usage on schema public,auth to authenticated,anon;
  grant select,insert,update,delete on public.transactions, public.cash_assets, public.credit_cards to authenticated;
  grant select on public.profiles,public.categories to authenticated;`)

// 끝 4자리를 쓰는 카드는 출금 보유처가 있어야 함
await assert.rejects(sql(`insert into public.credit_cards(family_id,owner_id,nickname,debit_day,last4) values($1,$2,'삼성',15,'4371')`, [family, owner]))
await sql(`insert into public.credit_cards(id,family_id,owner_id,nickname,debit_day,last4,default_cash_asset_id)
  values($1,$2,$3,'삼성카드',15,'4371',$4)`, [card, family, owner, asset])

// 배우자 휴대폰의 연결 키
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${spouse}',false);`)
const token = (await one('select public.create_card_notification_token() t')).t
assert.match(token, /^[0-9a-f]{64}$/)
assert.equal((await sql('select * from public.card_notification_tokens')).rows.length, 1)
await db.exec('reset role')

const today = (await one("select (now() at time zone 'Asia/Seoul')::date::text d")).d
const [, mm, dd] = today.split('-')
const md = `${mm}/${dd}`
const send = async (text, key = token) => {
  await db.exec(`set role anon; select set_config('request.headers', '${JSON.stringify({ 'x-card-token': key })}', false);`)
  try {
    return (await one('select public.record_card_notification($1) r', [text])).r
  } finally {
    await db.exec('reset role')
  }
}
const kakao = (kind, amount, plan, time, merchant) =>
  `삼성4371${kind} 김*혁\n${amount}원 ${plan}\n${md} ${time} ${merchant}\n누적1,792,113원`
const count = async (where = 'true', args = []) =>
  (await one(`select count(*)::int n from public.transactions where ${where}`, args)).n

assert.equal((await send(kakao('승인', '150,000', '일시불', '07:03', '삼미상사(주)미광'), 'f'.repeat(64))).status, 'unauthorized')
assert.equal((await send('삼성카드 이번 달 혜택을 확인하세요')).status, 'ignored')

// 승인 → 신용카드 지출, 카톡과 문자(줄바꿈 없음)로 같은 알림이 와도 한 번만 기록
const approval = await send(kakao('승인', '150,000', '일시불', '07:03', '삼미상사(주)미광'))
assert.equal(approval.status, 'recorded', JSON.stringify(approval))
assert.equal((await send(`[Web발신] 삼성4371승인 김*혁 150,000원 일시불 ${md} 07:03 삼미상사(주)미광 누적1,792,113원`)).status, 'duplicate')
const tx = await one(`select member_id, date::text, amount::int, payment_method, card_id, cash_asset_id, cash_balance_included, memo, card_due_date
  from public.transactions where id=$1`, [approval.transaction_id])
assert.deepEqual([tx.member_id, tx.date, tx.amount, tx.payment_method, tx.card_id, tx.cash_asset_id, tx.cash_balance_included, tx.memo],
  [spouse, today, 150000, '신용카드', card, asset, true, '삼미상사(주)미광'])
assert.ok(tx.card_due_date)

// 취소 → 자동 등록한 승인 지출 삭제, 이어진 78,000원 승인은 남음
assert.equal((await send(kakao('취소', '-150,000', '일시불', '07:03', '삼미상사(주)미광'))).status, 'cancel_applied')
assert.equal(await count('id=$1', [approval.transaction_id]), 0)
assert.equal((await send(kakao('승인', '78,000', '일시불', '07:04', '삼미상사(주)미광'))).status, 'recorded')
assert.equal(await count("memo='삼미상사(주)미광'"), 1)
assert.equal((await one(`select status from public.card_notifications where kind='approval' and amount=150000`)).status, 'canceled')

// 가맹점별로 마지막에 고른 카테고리를 기억
await sql(`update public.transactions set category_id=$1 where memo='삼미상사(주)미광'`, [food])
const again = await send(kakao('승인', '12,000', '일시불', '12:30', '삼미상사(주)미광'))
assert.equal((await one('select category_id from public.transactions where id=$1', [again.transaction_id])).category_id, food)

// 할부 승인은 할부로 등록하고, 취소하면 회차도 모두 삭제
const installment = await send(kakao('승인', '300,000', '03개월', '18:00', '전자랜드'))
assert.equal(installment.status, 'recorded', JSON.stringify(installment))
assert.equal(await count('installment_id=$1', [installment.installment_id]), 3)
assert.equal((await send(kakao('취소', '-300,000', '03개월', '18:00', '전자랜드'))).status, 'cancel_applied')
assert.equal(await count("memo like '전자랜드%'"), 0)

// 자동 등록 이전 승인의 취소, 모르는 카드, 읽을 수 없는 형식은 기록만 남김
assert.equal((await send(kakao('취소', '-5,000', '일시불', '09:00', '편의점'))).status, 'cancel_unmatched')
assert.equal((await send(kakao('승인', '5,000', '일시불', '09:00', '편의점').replace('4371', '9999'))).status, 'card_unmatched')
assert.equal((await send('삼성4371승인 김*혁 USD 12.00 해외')).status, 'unparsed')

// 다른 가족은 알림 기록과 연결 키를 볼 수 없음
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${outsider}',false);`)
assert.equal((await sql('select * from public.card_notifications')).rows.length, 0)
assert.equal((await sql('select * from public.card_notification_tokens')).rows.length, 0)
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`)
assert.ok((await sql('select * from public.card_notifications')).rows.length >= 8)
await db.exec('reset role')
console.log('card notification DB checks passed')
