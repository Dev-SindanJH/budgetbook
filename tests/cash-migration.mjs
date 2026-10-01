// PGLITE_MODULE_PATH can point to a separately installed @electric-sql/pglite.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')
const db = new PGlite()
const migration = fs.readFileSync('supabase/migrations/20261001114150_cash_asset_transactions.sql', 'utf8')
const schema = fs.readFileSync('supabase/schema.sql', 'utf8').split('-- Cash accounts and transactions')[0]
  .replace('create extension if not exists pgcrypto;', '')
  .replace('alter publication supabase_realtime add table public.transactions;', '')
await db.exec(`create role authenticated; create role anon; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;`)
await db.exec(schema)
await db.exec(fs.readFileSync('supabase/migrations/20261002_savings_no_maturity.sql','utf8'))
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const family = id(1), member = id(2), asset = id(3), other = id(4), otherAsset = id(5), plan = id(6)
await db.exec(`insert into public.families(id,name,invite_code) values ('${family}','test','TEST'),('${other}','other','OTHER');
  insert into auth.users(id,email) values('${member}','test@example.com');
  update public.profiles set family_id='${family}' where id='${member}';
  insert into public.cash_assets(id,family_id,name,amount) values('${asset}','${family}','cash',1000000),('${otherAsset}','${other}','other',123);
  insert into public.cash_settings values('${family}',current_date,1000000);
  insert into public.transactions(family_id,member_id,date,type,amount,payment_method) values('${family}','${member}',current_date,'expense',600000,'현금');
  insert into public.savings_plans(id,family_id,member_id,name,monthly_amount,debit_day,start_month,maturity_date)
    values('${plan}','${family}','${member}','old',100000,1,date_trunc('month',current_date),null);`)
await db.exec(migration)
assert.equal((await db.query(`select amount from public.cash_assets where id='${asset}'`)).rows[0].amount, '1000000')
assert.equal((await db.query('select count(*)::int n from public.transactions where cash_balance_included')).rows[0].n, 0)
await db.exec(migration) // Safe to rerun; no duplicated fallback balance.
assert.equal((await db.query('select count(*)::int n from public.cash_assets')).rows[0].n, 2)
await db.exec(`insert into public.transactions(family_id,member_id,date,type,amount,payment_method,cash_asset_id) values('${family}','${member}',current_date,'expense',600000,'현금','${asset}')`)
const balance = async () => Number((await db.query(`select a.amount + coalesce((select sum(case when t.type='income' then t.amount else -t.amount end) from public.transactions t where t.cash_asset_id=a.id and t.cash_balance_included and t.date<=current_date),0) balance from public.cash_assets a where id='${asset}'`)).rows[0].balance)
assert.equal(await balance(), 400000)
await assert.rejects(db.exec(`insert into public.transactions(family_id,member_id,date,type,amount,payment_method,cash_asset_id) values('${family}','${member}',current_date,'expense',100,'현금','${otherAsset}')`), /foreign key/)
await assert.rejects(db.exec(`insert into public.transactions(family_id,member_id,date,type,amount,payment_method) values('${family}','${member}',current_date,'expense',100,'현금')`), /보유처/)
await assert.rejects(db.exec(`delete from public.cash_assets where id='${asset}'`), /foreign key/)
await db.exec(`update public.savings_plans set cash_asset_id='${asset}' where id='${plan}'`)
assert.equal((await db.query(`select count(*)::int n from public.transactions where savings_plan_id='${plan}' and cash_asset_id is null`)).rows[0].n, 0)
assert.equal((await db.query(`select count(*)::int n from public.transactions where savings_plan_id='${plan}' and date <= (now() at time zone 'Asia/Seoul')::date and cash_balance_included`)).rows[0].n, 0)
await db.exec(`grant usage on schema public, auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;
  set role authenticated; select set_config('request.jwt.claim.sub','${member}',false);`)
assert.equal((await db.query('select count(*)::int n from public.cash_assets')).rows[0].n, 1)
await assert.rejects(db.exec(`insert into public.cash_assets(family_id,name,amount) values('${other}','forbidden',0)`), /row-level security/)
await db.exec('reset role')
await db.close()
console.log('PASS: legacy preservation, 100만원→40만원, repeated migration, source required, cross-family FK/RLS, deletion guard, scheduled payment inheritance')
