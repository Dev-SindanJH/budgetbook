import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useCardInstallments(familyId) {
  const [installments, setInstallments] = useState([])
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!familyId) return
    const { data, error: fetchError } = await supabase
      .from('card_installments')
      .select('*')
      .eq('family_id', familyId)
      .order('purchase_date', { ascending: false })
    setError(fetchError)
    if (!fetchError) setInstallments(data || [])
  }, [familyId])

  useEffect(() => { refresh() }, [refresh])

  return { installments, error, refresh }
}
