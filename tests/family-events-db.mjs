import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { buildOccurrences } from '../src/utils/familyEvents.js'
process.on('uncaughtException', (error) => {
  console.error(
    error.message,
    error.where || '',
    error.stack?.split('\n').slice(1, 3).join('\n'),
  )
  process.exit(1)
})
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const family = id(1),
  member = id(2),
  asset = id(3),
  other = id(4),
  otherMember = id(5),
  eventId = id(6),
  expense = id(7)
const sql = (source, args = []) => db.query(source, args)
await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
const schema = fs
  .readFileSync('supabase/schema.sql', 'utf8')
  .split('-- Family calendar migration')[0]
  .replace('create extension if not exists pgcrypto;', '')
  .replace(
    'alter publication supabase_realtime add table public.transactions;',
    '',
  )
await db.exec(schema)
await db.exec(
  fs.readFileSync(
    'supabase/migrations/20261002032103_family_calendar.sql',
    'utf8',
  ),
)
await db.exec(`insert into public.families(id,name,invite_code) values('${family}','Family','TEST'),('${other}','Other','OTHER');
  insert into auth.users(id,email) values('${member}','test@example.com'),('${otherMember}','other@example.com');
  update public.profiles set family_id='${family}' where id='${member}';
  update public.profiles set family_id='${other}' where id='${otherMember}';
  insert into public.cash_assets(id,family_id,name,amount) values('${asset}','${family}','cash',1000000);
  grant usage on schema public,auth to authenticated,anon;
  grant select,insert,update,delete on public.transactions, public.cash_assets to authenticated;
  grant select on public.profiles,public.categories,public.credit_cards to authenticated;
  set role authenticated; select set_config('request.jwt.claim.sub','${member}',false);`)
const today = (
  await sql("select (now() at time zone 'Asia/Seoul')::date::text d")
).rows[0].d
const year = Number(today.slice(0, 4))
const definition = {
  title: '아버님 생신',
  kind: 'birthday',
  calendar: 'solar',
  month: 12,
  day: 15,
  annual: true,
}
const rows = buildOccurrences(definition, year, {
  planned_amount: 300000,
  event_date: today,
  spend_date: today,
})
await sql('select public.save_family_event($1,$2,$3,$4)', [
  eventId,
  definition,
  JSON.stringify(rows),
  year,
])
const getEvent = async () =>
  (
    await sql(
      'select * from public.family_event_occurrences where event_id=$1 and occurrence_year=$2',
      [eventId, year],
    )
  ).rows[0]
const version = async () =>
  (await sql('select version from public.family_events where id=$1', [eventId]))
    .rows[0].version
const event = await getEvent()
assert.equal(
  (await sql('select count(*)::int n from public.transactions')).rows[0].n,
  0,
)
assert.equal(
  (
    await sql('select amount::int n from public.cash_assets where id=$1', [
      asset,
    ])
  ).rows[0].n,
  1000000,
)
const transaction = {
  member_id: member,
  date: today,
  amount: 200000,
  payment_method: '현금',
  cash_asset_id: asset,
  memo: '용돈',
}
const before = await version()
await sql('select public.record_family_event_expense($1,$2,$3,$4)', [
  event.id,
  transaction,
  expense,
  before,
])
// A retry with the original version returns the original transaction.
await sql('select public.record_family_event_expense($1,$2,$3,$4)', [
  event.id,
  transaction,
  expense,
  before,
])
assert.equal(
  (await sql('select count(*)::int n from public.transactions')).rows[0].n,
  1,
)
await assert.rejects(
  sql('select public.record_family_event_expense($1,$2,$3,$4)', [
    event.id,
    transaction,
    id(8),
    before,
  ]),
  /다른 가족/,
)
assert.equal(
  Number(
    (await sql('select sum(amount) amount from public.transactions')).rows[0]
      .amount,
  ),
  200000,
)
const mark = async (status) =>
  sql('select public.update_family_occurrence($1,$2,$3)', [
    event.id,
    { status },
    await version(),
  ])
await mark('complete')
await sql('update public.transactions set amount=150000 where id=$1', [expense])
assert.equal((await getEvent()).status, 'pending')
await mark('complete')
await sql('delete from public.transactions where id=$1', [expense])
assert.equal((await getEvent()).status, 'pending')
const stable = await version()
await assert.rejects(
  sql('select public.record_family_event_expense($1,$2,$3,$4)', [
    event.id,
    { ...transaction, cash_asset_id: null },
    expense,
    stable,
  ]),
  /보유처/,
)
assert.equal(await version(), stable)
assert.equal(
  (await sql('select count(*)::int n from public.transactions')).rows[0].n,
  0,
)
await assert.rejects(
  sql('select public.update_family_occurrence($1,$2,$3)', [
    event.id,
    { owner_id: otherMember },
    await version(),
  ]),
  /같은 가족/,
)
await sql('select public.record_family_event_expense($1,$2,$3,$4)', [
  event.id,
  transaction,
  expense,
  await version(),
])
const next = (
  await sql(
    'select * from public.family_event_occurrences where event_id=$1 and occurrence_year=$2',
    [eventId, year + 1],
  )
).rows[0]
assert.equal(next.planned_amount, null)
// Series edits update untouched future dates, preserving per-year overrides and history.
await sql('select public.update_family_occurrence($1,$2,$3)', [next.id, { planned_amount: 400000, event_date: `${year+1}-12-22` }, await version()])
await sql(`insert into public.family_event_occurrences(event_id,family_id,occurrence_year,title,kind,event_date,spend_date,status)
  values($1,$2,$3,'지난 생신','birthday',$4,$4,'complete')`, [eventId, family, year-1, `${year-1}-12-15`])
const revised = { ...definition, title: '수정한 생신', month: 11, day: 20 }
await sql('select public.save_family_event($1,$2,$3,$4,$5)', [eventId, revised,
  JSON.stringify(buildOccurrences(revised, year, {planned_amount:350000,event_date:today,spend_date:today})), year, await version()])
assert.equal((await getEvent()).title, '수정한 생신')
assert.equal((await sql('select title from public.family_event_occurrences where event_id=$1 and occurrence_year=$2', [eventId,year-1])).rows[0].title, '지난 생신')
assert.equal(Number((await sql('select planned_amount from public.family_event_occurrences where id=$1',[next.id])).rows[0].planned_amount),400000)
assert.equal((await sql('select event_date::text d from public.family_event_occurrences where id=$1',[next.id])).rows[0].d,`${year+1}-12-22`)
assert.equal((await sql('select event_date::text d from public.family_event_occurrences where event_id=$1 and occurrence_year=$2',[eventId,year+2])).rows[0].d,`${year+2}-11-20`)
await assert.rejects(
  sql('select public.link_family_event_expense($1,$2,false,$3)', [
    next.id,
    expense,
    await version(),
  ]),
  /이미 일정/,
)
await assert.rejects(
  sql('update public.transactions set type=$1 where id=$2', [
    'income',
    expense,
  ]),
  /실제 지급/,
)
await assert.rejects(
  sql('update public.transactions set date=$1 where id=$2', [
    `${year + 1}-01-01`,
    expense,
  ]),
  /실제 지급/,
)
await mark('complete')
await sql('select public.link_family_event_expense($1,$2,true,$3)', [
  event.id,
  expense,
  await version(),
])
assert.equal((await getEvent()).status, 'pending')
assert.equal(
  (await sql('select count(*)::int n from public.transactions')).rows[0].n,
  1,
)
// Early payment for next year's event survives stopping recurrence.
await sql('select public.link_family_event_expense($1,$2,false,$3)', [
  next.id,
  expense,
  await version(),
])
await sql('select public.stop_family_event($1,$2,$3)', [
  eventId,
  year,
  await version(),
])
assert.equal(
  (
    await sql(
      'select status from public.family_event_occurrences where id=$1',
      [next.id],
    )
  ).rows[0].status,
  'pending',
)
assert.equal(
  (
    await sql(
      'select status from public.family_event_occurrences where event_id=$1 and occurrence_year=$2',
      [eventId, year + 2],
    )
  ).rows[0].status,
  'cancelled',
)
// Other families cannot read or modify rows, nor link their payments across families.
await sql("select set_config('request.jwt.claim.sub',$1,false)", [otherMember])
assert.equal(
  (await sql('select count(*)::int n from public.family_events')).rows[0].n,
  0,
)
assert.equal(
  (await sql('select count(*)::int n from public.family_event_occurrences'))
    .rows[0].n,
  0,
)
assert.equal(
  (
    await sql(
      'update public.family_event_occurrences set title=$1 where id=$2 returning id',
      ['forbidden', event.id],
    )
  ).rows.length,
  0,
)
assert.equal(
  (
    await sql('delete from public.family_events where id=$1 returning id', [
      eventId,
    ])
  ).rows.length,
  0,
)
await assert.rejects(
  sql('insert into public.family_events(family_id,definition) values($1,$2)', [
    family,
    definition,
  ]),
  /row-level security/,
)
await assert.rejects(
  sql('select public.update_family_occurrence($1,$2,1)', [
    event.id,
    { status: 'cancelled' },
  ]),
  /찾을 수/,
)
await db.exec('reset role; set role anon;')
await assert.rejects(
  sql('select * from public.family_events'),
  /permission denied/,
)
await assert.rejects(
  sql('select public.stop_family_event($1,$2,1)', [eventId, year]),
  /permission denied/,
)
await db.close()
console.log(
  'PASS: schedule/financial separation, partial payments, retry idempotency, stale writes, atomic failures, unlink/reopen, recurrence stop/history, family RLS and anonymous denial',
)
