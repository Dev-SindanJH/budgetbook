import { isCreditCardExpense } from './creditCards.js'

export function cashEffect(transaction, today) {
  if (!transaction.cash_asset_id || transaction.cash_balance_included !== true) return 0
  const date = isCreditCardExpense(transaction) ? transaction.card_due_date : transaction.date
  if (!date || date > today) return 0
  return Number(transaction.amount) * (transaction.type === 'income' ? 1 : -1)
}

// Explains one balance: the stored baseline, then every linked transaction in the order it hit the account.
export function cashAssetHistory(asset, transactions, today) {
  const applied = []
  const pending = []
  let excludedCount = 0
  for (const transaction of transactions) {
    if (transaction.cash_asset_id !== asset.id) continue
    if (transaction.cash_balance_included !== true) { excludedCount++; continue }
    const date = isCreditCardExpense(transaction) ? transaction.card_due_date : transaction.date
    if (!date) continue
    const entry = { transaction, date, change: Number(transaction.amount) * (transaction.type === 'income' ? 1 : -1) }
    if (date > today) pending.push(entry)
    else applied.push(entry)
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) ||
    String(a.transaction.created_at || '').localeCompare(String(b.transaction.created_at || ''))
  applied.sort(byDate)
  pending.sort(byDate)
  const base = Number(asset.amount)
  let balance = base
  for (const entry of applied) entry.balance = balance += entry.change
  return { base, change: balance - base, balance, entries: applied.reverse(), pending, excludedCount }
}

export function cashAssetBalances(assets, transactions, today) {
  const changes = new Map()
  for (const transaction of transactions) {
    changes.set(transaction.cash_asset_id,
      (changes.get(transaction.cash_asset_id) || 0) + cashEffect(transaction, today))
  }
  return assets.map((asset) => ({
    ...asset,
    balance: Number(asset.amount) + (changes.get(asset.id) || 0),
  }))
}
