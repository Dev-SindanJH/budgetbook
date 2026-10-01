import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useLoans(familyId) {
  const [loans, setLoans] = useState([])
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!familyId) return
    const { data, error: fetchError } = await supabase
      .from('loans')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    setError(fetchError)
    if (!fetchError) setLoans(data || [])
  }, [familyId])

  useEffect(() => { refresh() }, [refresh])

  return { loans, error, refresh }
}
