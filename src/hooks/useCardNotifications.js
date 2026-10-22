import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// The member's own connection key (hash only) and the family's recently received card alerts.
export function useCardNotifications(familyId, memberId) {
  const [token, setToken] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!familyId || !memberId) return
    const [tokenResult, listResult] = await Promise.all([
      supabase
        .from('card_notification_tokens')
        .select('created_at, last_used_at')
        .eq('member_id', memberId)
        .maybeSingle(),
      supabase
        .from('card_notifications')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setError(tokenResult.error || listResult.error)
    if (!tokenResult.error) setToken(tokenResult.data)
    if (!listResult.error) setNotifications(listResult.data || [])
  }, [familyId, memberId])

  useEffect(() => { refresh() }, [refresh])

  return { token, notifications, error, refresh }
}
