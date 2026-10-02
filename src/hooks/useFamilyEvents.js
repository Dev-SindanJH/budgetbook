import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

let channelNumber = 0
export function useFamilyEvents(familyId) {
  const [state, setState] = useState({ events: [], loading: true, error: null })
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current
    if (!familyId) {
      setState({ events: [], loading: false, error: null })
      return
    }
    try {
      const events = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from('family_event_occurrences')
          .select('*, family_events(*)')
          .eq('family_id', familyId)
          .eq('suppressed', false)
          .order('event_date')
          .order('id')
          .range(offset, offset + 999)
        if (error) throw error
        events.push(...data)
        if (data.length < 1000) break
      }
      if (ticket === sequence.current)
        setState({ events, loading: false, error: null })
    } catch (error) {
      if (ticket === sequence.current)
        setState((previous) => ({ ...previous, loading: false, error }))
    }
  }, [familyId])
  useEffect(() => {
    setState({ events: [], loading: true, error: null })
    refresh()
    if (!familyId) return
    let refreshTimer
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(refresh, 180)
    }
    const channel = supabase.channel(`family-events-${++channelNumber}`)
    for (const table of [
      'family_events',
      'family_event_occurrences',
      'transactions',
    ]) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `family_id=eq.${familyId}`,
        },
        scheduleRefresh,
      )
    }
    channel.subscribe()
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      sequence.current++
      clearTimeout(refreshTimer)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [familyId, refresh])
  return { ...state, refresh }
}
