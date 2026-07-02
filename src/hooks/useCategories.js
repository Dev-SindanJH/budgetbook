import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useCategories(familyId) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('family_id', familyId)
      .order('type')
      .order('name')
    if (!error) {
      const sorted = [...(data || [])].sort((a, b) => {
        if (a.type !== b.type) return a.type < b.type ? -1 : 1
        const aEtc = a.name.startsWith('기타')
        const bEtc = b.name.startsWith('기타')
        if (aEtc !== bEtc) return aEtc ? -1 : 1
        return a.name.localeCompare(b.name, 'ko')
      })
      setCategories(sorted)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { categories, loading, refresh }
}
