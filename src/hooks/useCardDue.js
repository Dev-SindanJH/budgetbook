import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useCardDue(familyId, { from, to } = {}) {
  const [dueTransactions, setDueTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId || !from || !to) return
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*, categories(id, name, icon, color), profiles(id, name, color)')
      .eq('family_id', familyId)
      .eq('type', 'expense')
      .not('due_date', 'is', null)
      .gte('due_date', from)
      .lte('due_date', to)
      .order('due_date')
    if (!error) setDueTransactions(data || [])
    setLoading(false)
  }, [familyId, from, to])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { dueTransactions, loading, refresh }
}
