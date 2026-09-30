import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useCashSettings(familyId) {
  const [cashSettings, setCashSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setCashSettings(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('cash_settings')
      .select('*')
      .eq('family_id', familyId)
      .maybeSingle()
    if (!error) setCashSettings(data)
    setLoading(false)
  }, [familyId])

  useEffect(() => { refresh() }, [refresh])

  return { cashSettings, loading, refresh }
}
