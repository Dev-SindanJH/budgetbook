import test from 'node:test'
import assert from 'node:assert/strict'
import { installmentPurchaseDate, installmentSchedule } from '../src/utils/creditCards.js'

const plan = { purchaseDate: '2026-10-05', totalMonths: 3, amountMode: 'total', amount: 100000, debitDay: 15 }

test('전체 금액은 개월 수로 나누고 나머지는 1회차에 더함', () => {
  assert.deepEqual(installmentSchedule(plan), [
    { no: 1, date: '2026-10-05', dueDate: '2026-11-15', amount: 33334 },
    { no: 2, date: '2026-11-05', dueDate: '2026-12-15', amount: 33333 },
    { no: 3, date: '2026-12-05', dueDate: '2027-01-15', amount: 33333 },
  ])
})

test('이미 낸 회차는 건너뛰고 남은 회차만 등록', () => {
  const rows = installmentSchedule({ ...plan, totalMonths: 10, firstInstallment: 8, purchaseDate: '2026-03-05' })
  assert.deepEqual(rows.map((r) => [r.no, r.date, r.amount]),
    [[8, '2026-10-05', 10000], [9, '2026-11-05', 10000], [10, '2026-12-05', 10000]])
})

test('매달 금액 방식은 모든 회차가 같은 금액', () => {
  const rows = installmentSchedule({ ...plan, amountMode: 'monthly', amount: 52000 })
  assert.deepEqual(rows.map((r) => r.amount), [52000, 52000, 52000])
})

test('월말 구매와 짧은 달의 자동이체일은 그 달 마지막 날로 맞춤', () => {
  const rows = installmentSchedule({ ...plan, purchaseDate: '2027-01-31', debitDay: 31 })
  assert.deepEqual(rows.map((r) => [r.date, r.dueDate]),
    [['2027-01-31', '2027-02-28'], ['2027-02-28', '2027-03-31'], ['2027-03-31', '2027-04-30']])
})

test('이번 회차 사용일에서 1회차 구매일을 거꾸로 계산', () => {
  assert.equal(installmentPurchaseDate('2026-10-22', 9), '2026-02-22')
  assert.equal(installmentPurchaseDate('2026-10-22', 1), '2026-10-22')
  const rows = installmentSchedule({ ...plan, totalMonths: 10, firstInstallment: 9, amountMode: 'monthly',
    amount: 504200, debitDay: 13, purchaseDate: installmentPurchaseDate('2026-10-22', 9) })
  assert.deepEqual(rows.map((r) => [r.no, r.date, r.dueDate]),
    [[9, '2026-10-22', '2026-11-13'], [10, '2026-11-22', '2026-12-13']])
})
