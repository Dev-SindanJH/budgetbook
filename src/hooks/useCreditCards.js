import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useCreditCards(familyId) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setCards([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at')
    setError(fetchError)
    if (!fetchError) setCards(data || [])
    setLoading(false)
  }, [familyId])

  useEffect(() => { refresh() }, [refresh])

  return { cards, loading, error, refresh }
}
