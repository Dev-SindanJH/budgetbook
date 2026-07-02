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
  const [{ data: categories }, { data: transactions }, { data: budgets }] = await Promise.all([
    supabase.from('categories').select('*').eq('family_id', familyId),
    supabase.from('transactions').select('*').eq('family_id', familyId),
    supabase.from('budgets').select('*').eq('family_id', familyId),
  ])
  return { categories: categories || [], transactions: transactions || [], budgets: budgets || [] }
}

export async function importTransactions(familyId, memberId, transactions) {
  const rows = transactions.map((t) => ({
    family_id: familyId,
    member_id: memberId,
    date: t.date,
    type: t.type,
    amount: t.amount,
    category_id: t.category_id ?? null,
    payment_method: t.payment_method ?? null,
    memo: t.memo ?? null,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('transactions').insert(rows)
  if (error) throw error
}

export async function resetFamilyData(familyId) {
  const { error: e1 } = await supabase.from('transactions').delete().eq('family_id', familyId)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('budgets').delete().eq('family_id', familyId)
  if (e2) throw e2
}
