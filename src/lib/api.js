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

export async function saveCashSettings(payload) {
  const { error } = await supabase.from('cash_settings').upsert(payload, { onConflict: 'family_id' })
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

export async function upsertBudget({ familyId, categoryId, month, limitAmount }) {
  const { error } = await supabase
    .from('budgets')
    .upsert(
      { family_id: familyId, category_id: categoryId ?? null, month, limit_amount: limitAmount },
      { onConflict: 'family_id,category_key,month' },
    )
  if (error) throw error
}

export async function updateOwnProfile(id, payload) {
  const { error } = await supabase.from('profiles').update(payload).eq('id', id)
  if (error) throw error
}

export async function fetchAllFamilyData(familyId) {
  const [{ data: categories }, { data: transactions }, { data: budgets }, { data: creditCards }, { data: cashSettings }, { data: savingsPlans }, { data: stockHoldings }] = await Promise.all([
    supabase.from('categories').select('*').eq('family_id', familyId),
    supabase.from('transactions').select('*').eq('family_id', familyId),
    supabase.from('budgets').select('*').eq('family_id', familyId),
    supabase.from('credit_cards').select('*').eq('family_id', familyId),
    supabase.from('cash_settings').select('*').eq('family_id', familyId),
    supabase.from('savings_plans').select('*').eq('family_id', familyId),
    supabase.from('stock_holdings').select('*').eq('family_id', familyId),
  ])
  return { categories: categories || [], transactions: transactions || [], budgets: budgets || [], creditCards: creditCards || [], cashSettings: cashSettings?.[0] || null, savingsPlans: savingsPlans || [], stockHoldings: stockHoldings || [] }
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
  const { error: e1 } = await supabase.from('transactions').delete().eq('family_id', familyId)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('budgets').delete().eq('family_id', familyId)
  if (e2) throw e2
}
