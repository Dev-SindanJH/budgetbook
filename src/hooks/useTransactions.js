import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

let nextTransactionChannelId = 0

export function useTransactions(familyId, { from, to } = {}) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const refresh = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    const all = []
    let offset = 0
    let error = null
    do {
      let query = supabase
        .from('transactions')
        .select('*, categories(id, name, icon, color, type), profiles(id, name, color)')
        .eq('family_id', familyId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 999)
      if (from) query = query.gte('date', from)
      if (to) query = query.lte('date', to)
      const result = await query
      error = result.error
      if (error) break
      all.push(...(result.data || []))
      offset += result.data?.length || 0
      if ((result.data?.length || 0) < 1000) break
    } while (true)
    setFetchError(error)
    if (!error) setTransactions(all)
    setLoading(false)
  }, [familyId, from, to])

  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!familyId) return
    const channel = supabase
      .channel(`transactions-${familyId}-${++nextTransactionChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `family_id=eq.${familyId}` },
        () => refreshRef.current(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId])

  return { transactions, loading, error: fetchError, refresh }
}
