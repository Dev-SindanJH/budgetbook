import { addMonths } from './format.js'

// All credit card purchases are scheduled for the following month.
export function creditCardDueDate(purchaseDate, debitDay) {
  const month = addMonths(purchaseDate.slice(0, 7), 1)
  const [year, number] = month.split('-').map(Number)
  const day = Math.min(Number(debitDay), new Date(year, number, 0).getDate())
  return `${month}-${String(day).padStart(2, '0')}`
}

export function isCreditCardExpense(transaction) {
  return transaction.type === 'expense' && transaction.payment_method === '신용카드'
}

export function isImmediateExpense(transaction) {
  return transaction.type === 'expense' && transaction.payment_method !== '신용카드'
}

// Same date as the purchase, n months later; Jan 31 + 1 month is Feb 28/29 as in Postgres.
function addMonthsToDate(date, months) {
  const month = addMonths(date.slice(0, 7), months)
  const [year, number] = month.split('-').map(Number)
  const day = Math.min(Number(date.slice(8, 10)), new Date(year, number, 0).getDate())
  return `${month}-${String(day).padStart(2, '0')}`
}

// Purchase date (installment 1) for a plan entered from the date of a later installment.
export function installmentPurchaseDate(installmentDate, installmentNo) {
  return addMonthsToDate(installmentDate, 1 - Number(installmentNo))
}

// Mirrors sync_card_installment_transactions(): installment k is used k-1 months after
// the purchase and, in "total" mode, the remainder of the division is billed first.
export function installmentSchedule({ purchaseDate, totalMonths, firstInstallment = 1, amountMode, amount, debitDay }) {
  const months = Number(totalMonths)
  const value = Number(amount)
  const base = amountMode === 'monthly' ? value : Math.floor(value / months)
  const rows = []
  for (let no = Number(firstInstallment); no <= months; no++) {
    const date = addMonthsToDate(purchaseDate, no - 1)
    rows.push({
      no,
      date,
      dueDate: creditCardDueDate(date, debitDay),
      amount: amountMode === 'total' && no === 1 ? value - base * (months - 1) : base,
    })
  }
  return rows
}
