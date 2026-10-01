import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useCashAssets(familyId) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!familyId) { setAssets([]); setLoading(false); return }
    setLoading(true)
    const { data, error: loadError } = await supabase.from('cash_assets').select('*').eq('family_id', familyId).order('created_at')
    setError(loadError?.message || '')
    setAssets(data || [])
    setLoading(false)
  }, [familyId])
  useEffect(() => { refresh() }, [refresh])
  const total = useMemo(() => assets.reduce((sum, asset) => sum + Number(asset.amount), 0), [assets])
  return { assets, total, loading, error, refresh }
}
