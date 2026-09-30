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

export function recordedCashBalance(transactions, settings, asOfDate) {
  if (!settings || settings.opening_date > asOfDate) return null
  let balance = Number(settings.opening_balance)
  for (const t of transactions) {
    const amount = Number(t.amount)
    if (t.type === 'income' && t.date >= settings.opening_date && t.date <= asOfDate) {
      balance += amount
    } else if (isImmediateExpense(t) && t.date >= settings.opening_date && t.date <= asOfDate) {
      balance -= amount
    } else if (isCreditCardExpense(t) && t.card_due_date >= settings.opening_date && t.card_due_date <= asOfDate) {
      balance -= amount
    }
  }
  return balance
}
