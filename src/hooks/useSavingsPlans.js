import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useSavingsPlans(familyId) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('savings_plans')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    setError(fetchError)
    if (!fetchError) setPlans(data || [])
    setLoading(false)
  }, [familyId])

  useEffect(() => { refresh() }, [refresh])

  return { plans, loading, error, refresh }
}
