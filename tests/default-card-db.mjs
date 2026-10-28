import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const family = id(1), owner = id(2), spouse = id(3), asset = id(4), card = id(5), spouseCard = id(6),
  otherFamily = id(7), otherCard = id(8), outsider = id(9)
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
  '20261029120000_default_card.sql']) {
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'))
}
await db.exec(`insert into public.families(id,name,invite_code) values('${family}','Family','TEST'),('${otherFamily}','Other','OTHER');
  insert into auth.users(id,email) values('${owner}','a@example.com'),('${spouse}','b@example.com'),('${outsider}','c@example.com');
  update public.profiles set family_id='${family}' where id in ('${owner}','${spouse}');
  update public.profiles set family_id='${otherFamily}' where id='${outsider}';
  insert into public.cash_assets(id,family_id,name,amount) values('${asset}','${family}','통장',1000000);
  insert into public.credit_cards(id,family_id,owner_id,nickname,debit_day,default_cash_asset_id) values
    ('${card}','${family}','${owner}','생활비',15,'${asset}'),
    ('${spouseCard}','${family}','${spouse}','배우자 카드',25,null),
    ('${otherCard}','${otherFamily}','${outsider}','남의 카드',1,null);
  grant usage on schema public,auth to authenticated,anon;
  grant select,update on public.profiles to authenticated;
  grant select on public.credit_cards to authenticated;`)

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`)
const defaultCard = async (who) => (await one('select default_card_id from public.profiles where id=$1', [who])).default_card_id

// 내 카드와 가족이 등록한 카드 모두 대표카드로 정할 수 있음
await sql('update public.profiles set default_card_id=$1 where id=$2', [card, owner])
assert.equal(await defaultCard(owner), card)
await sql('update public.profiles set default_card_id=$1 where id=$2', [spouseCard, owner])
assert.equal(await defaultCard(owner), spouseCard)

// 다른 가계부의 카드는 고를 수 없음
await assert.rejects(sql('update public.profiles set default_card_id=$1 where id=$2', [otherCard, owner]), /대표카드/)

// 다른 구성원의 대표카드는 바꿀 수 없음(본인 행만 수정)
await sql('update public.profiles set default_card_id=$1 where id=$2', [card, spouse])
assert.equal(await defaultCard(spouse), null)

// 사용 중지된 카드는 새로 고를 수 없지만, 이미 정해둔 뒤 중지되어도 다른 프로필 수정은 막지 않음
await db.exec('reset role')
await sql('update public.credit_cards set active=false where id=$1', [spouseCard])
await db.exec('set role authenticated')
await sql(`update public.profiles set name='나', default_card_id=default_card_id where id=$1`, [owner])
assert.equal(await defaultCard(owner), spouseCard)
await sql(`select set_config('request.jwt.claim.sub','${spouse}',false)`)
await assert.rejects(sql('update public.profiles set default_card_id=$1 where id=$2', [spouseCard, spouse]), /대표카드/)

// 다른 가계부로 옮기면 대표카드를 비움
await db.exec('reset role')
await sql('update public.profiles set default_card_id=$1 where id=$2', [card, owner])
await sql('update public.profiles set family_id=$1 where id=$2', [otherFamily, owner])
assert.equal(await defaultCard(owner), null)

console.log('default card db tests passed')
