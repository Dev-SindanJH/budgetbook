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
