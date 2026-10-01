import { supabase } from './supabaseClient'

export async function addTransaction(payload) {
  const { error } = await supabase.from('transactions').insert(payload)
  if (error) throw error
}

export async function updateTransaction(id, payload) {
  const { error } = await supabase.from('transactions').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}

export async function addCreditCard(payload) {
  const { error } = await supabase.from('credit_cards').insert(payload)
  if (error) throw error
}

export async function updateCreditCard(id, payload) {
  const { error } = await supabase.from('credit_cards').update(payload).eq('id', id)
  if (error) throw error
}

export async function saveCashAsset({ id, family_id, name, amount }) {
  const query = id
    ? supabase.from('cash_assets').update({ name, amount }).eq('id', id)
    : supabase.from('cash_assets').insert({ family_id, name, amount })
  const { error } = await query
  if (error) throw error
}

export async function deleteCashAsset(id) {
  const { error } = await supabase.from('cash_assets').delete().eq('id', id)
  if (error?.code === '23503') throw new Error('거래나 자동납입에 연결된 보유처는 삭제할 수 없어요. 연결된 보유처를 먼저 변경해주세요.')
  if (error) throw error
}

export async function addSavingsPlan(payload) {
  const { error } = await supabase.from('savings_plans').insert(payload)
  if (error) throw error
}

export async function updateSavingsPlan(id, payload) {
  const { error } = await supabase.from('savings_plans').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteSavingsPlan(id) {
  const { error } = await supabase.from('savings_plans').delete().eq('id', id)
  if (error) throw error
}

export async function addLoan(payload) {
  const { error } = await supabase.from('loans').insert(payload)
  if (error) throw error
}

export async function updateLoan(id, payload) {
  const { error } = await supabase.from('loans').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteLoan(id) {
  const { error } = await supabase.from('loans').delete().eq('id', id)
  if (error) throw error
}

export async function saveStockHolding({ familyId, symbol, market, quantity }) {
  const { error } = await supabase.from('stock_holdings').upsert(
    { family_id: familyId, symbol, market, quantity },
    { onConflict: 'family_id,symbol' },
  )
  if (error) throw error
}

export async function deleteStockHolding(id) {
  const { error } = await supabase.from('stock_holdings').delete().eq('id', id)
  if (error) throw error
}

export async function addCategory(payload) {
  const { error } = await supabase.from('categories').insert(payload)
  if (error) throw error
}

export async function updateCategory(id, payload) {
  const { error } = await supabase.from('categories').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export async function updateOwnProfile(id, payload) {
  const { error } = await supabase.from('profiles').update(payload).eq('id', id)
  if (error) throw error
}

export async function fetchAllFamilyData(familyId) {
  const [{ data: categories }, { data: transactions }, { data: cashAssets }, { data: creditCards }, { data: cashSettings }, { data: savingsPlans }, { data: loans }, { data: stockHoldings }] = await Promise.all([
    supabase.from('categories').select('*').eq('family_id', familyId),
    supabase.from('transactions').select('*').eq('family_id', familyId),
    supabase.from('cash_assets').select('*').eq('family_id', familyId),
    supabase.from('credit_cards').select('*').eq('family_id', familyId),
    supabase.from('cash_settings').select('*').eq('family_id', familyId),
    supabase.from('savings_plans').select('*').eq('family_id', familyId),
    supabase.from('loans').select('*').eq('family_id', familyId),
    supabase.from('stock_holdings').select('*').eq('family_id', familyId),
  ])
  return { categories: categories || [], transactions: transactions || [], cashAssets: cashAssets || [], creditCards: creditCards || [], cashSettings: cashSettings?.[0] || null, savingsPlans: savingsPlans || [], loans: loans || [], stockHoldings: stockHoldings || [] }
}

export async function importTransactions(familyId, memberId, transactions) {
  const { data: cards, error: cardsError } = await supabase
    .from('credit_cards')
    .select('id, owner_id')
    .eq('family_id', familyId)
  if (cardsError) throw cardsError
  const cardOwners = new Map((cards || []).map((card) => [card.id, card.owner_id]))
  if (transactions.some((t) => t.type === 'expense' && t.payment_method === '신용카드' && !cardOwners.has(t.card_id))) {
    throw new Error('가져올 신용카드 내역의 카드 정보가 현재 가계부와 일치하지 않아요. 원래 가계부의 백업 파일인지 확인해주세요.')
  }
  const rows = transactions.map((t) => ({
    family_id: familyId,
    member_id: t.type === 'expense' && t.payment_method === '신용카드' ? cardOwners.get(t.card_id) : memberId,
    date: t.date,
    type: t.type,
    amount: t.amount,
    category_id: t.category_id ?? null,
    payment_method: t.payment_method ?? null,
    card_id: t.card_id ?? null,
    memo: t.memo ?? null,
    cash_asset_id: t.cash_asset_id ?? null,
    // A backup is historical data, not a new cash movement.
    cash_balance_included: false,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('transactions').insert(rows)
  if (error) throw error
}

export async function resetFamilyData(familyId) {
  const { error: stockError } = await supabase.from('stock_holdings').delete().eq('family_id', familyId)
  if (stockError) throw stockError
  const { error: e0 } = await supabase.from('savings_plans').delete().eq('family_id', familyId)
  if (e0) throw e0
  const { error: loanError } = await supabase.from('loans').delete().eq('family_id', familyId)
  if (loanError) throw loanError
  const { error: e1 } = await supabase.from('transactions').delete().eq('family_id', familyId)
  if (e1) throw e1
  const { error: cashAssetError } = await supabase.from('cash_assets').delete().eq('family_id', familyId)
  if (cashAssetError) throw cashAssetError
}
