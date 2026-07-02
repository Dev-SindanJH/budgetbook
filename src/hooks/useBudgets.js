import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useBudgets(familyId, month) {
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId || !month) return
    setLoading(true)
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('family_id', familyId)
      .eq('month', month)
    if (!error) setBudgets(data || [])
    setLoading(false)
  }, [familyId, month])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { budgets, loading, refresh }
}
