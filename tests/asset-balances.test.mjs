import test from 'node:test'
import assert from 'node:assert/strict'
import { cashAssetBalances } from '../src/utils/cashAssets.js'
import { savingsAmounts, totalSavingsPaid } from '../src/utils/savings.js'

const today = '2026-10-01'
const assets = [{ id: 'a', amount: 1000000 }, { id: 'b', amount: 200000 }]
const expense = { id: 'new', cash_asset_id: 'a', cash_balance_included: true, type: 'expense', payment_method: '현금', date: today, amount: 600000 }
const balances = (rows) => cashAssetBalances(assets, rows, today).map((a) => a.balance)
test('100만원에서 새 지출 60만원은 선택한 보유처만 40만원으로 변경', () => {
  assert.deepEqual(balances([expense]), [400000, 200000])
})
test('기존 지출과 수입은 다시 반영하지 않음', () => {
  assert.deepEqual(balances([{ ...expense, cash_balance_included: false }, { ...expense, type: 'income', cash_balance_included: false }]), [1000000, 200000])
})
test('새 수입, 금액 수정, 보유처 변경, 삭제는 잔액에 한 번만 반영', () => {
  assert.deepEqual(balances([expense, { ...expense, type: 'income', amount: 100000 }]), [500000, 200000])
  assert.deepEqual(balances([{ ...expense, amount: 100000 }]), [900000, 200000])
  assert.deepEqual(balances([{ ...expense, cash_asset_id: 'b' }]), [1000000, -400000])
  assert.deepEqual(balances([]), [1000000, 200000])
})
test('카드는 결제일에만 차감하고 미래 현금 지출은 제외', () => {
  assert.deepEqual(balances([{ ...expense, date: '2026-10-02' }]), [1000000, 200000])
  assert.deepEqual(balances([{ ...expense, payment_method: '신용카드', card_due_date: '2026-10-02' }]), [1000000, 200000])
  assert.deepEqual(balances([{ ...expense, payment_method: '신용카드', card_due_date: today }]), [400000, 200000])
})
test('총 적금은 상세의 현재까지 납입액 합계와 일치하며 과거 납입 포함', () => {
  const plans = [
    { start_month: '2026-01-01', debit_day: 1, monthly_amount: 100000, maturity_date: null },
    { start_month: '2026-01-01', debit_day: 31, monthly_amount: 200000, maturity_date: '2026-02-28' },
    { start_month: '2026-12-01', debit_day: 1, monthly_amount: 300000, maturity_date: null },
  ]
  assert.equal(totalSavingsPaid(plans, today), 1400000)
  assert.equal(totalSavingsPaid(plans, today), plans.reduce((sum, plan) => sum + savingsAmounts(plan, today).paid, 0))
  assert.equal(savingsAmounts(plans[1], '2026-02-27').paid, 200000)
  assert.equal(savingsAmounts(plans[1], '2026-02-28').paid, 400000)
})
