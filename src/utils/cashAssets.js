import { isCreditCardExpense } from './creditCards.js'

export function cashEffect(transaction, today) {
  if (!transaction.cash_asset_id || transaction.cash_balance_included !== true) return 0
  const date = isCreditCardExpense(transaction) ? transaction.card_due_date : transaction.date
  if (!date || date > today) return 0
  return Number(transaction.amount) * (transaction.type === 'income' ? 1 : -1)
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
