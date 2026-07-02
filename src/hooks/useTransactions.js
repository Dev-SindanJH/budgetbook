import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useTransactions(familyId, { from, to } = {}) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, categories(id, name, icon, color, type), profiles(id, name, color)')
      .eq('family_id', familyId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    const { data, error } = await query
    if (!error) setTransactions(data || [])
    setLoading(false)
  }, [familyId, from, to])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!familyId) return
    const channel = supabase
      .channel(`transactions-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `family_id=eq.${familyId}` },
        () => refresh(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId, refresh])

  return { transactions, loading, refresh }
}
