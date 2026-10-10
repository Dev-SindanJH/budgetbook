import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 아직 확인 안됨
  const [profile, setProfile] = useState(null)
  const [family, setFamily] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  const loadedUserId = useRef(null)

  const loadProfile = useCallback(async (userId) => {
    loadedUserId.current = userId || null
    if (!userId) {
      setProfile(null)
      setFamily(null)
      return
    }
    setLoadingProfile(true)
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('프로필 조회 실패:', error.message)
      loadedUserId.current = null
      setProfile(null)
      setFamily(null)
      setLoadingProfile(false)
      return
    }
    setProfile(profileData)

    if (profileData.family_id) {
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('id', profileData.family_id)
        .single()
      setFamily(familyData || null)
    } else {
      setFamily(null)
    }
    setLoadingProfile(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user?.id)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      // 탭으로 돌아오거나 토큰이 갱신될 때마다 같은 사용자로 이벤트가 다시 옵니다.
      // 이때 프로필을 다시 불러오면 화면 전체가 로딩으로 바뀌어 입력 중인 모달이 사라집니다.
      if ((newSession?.user?.id || null) === loadedUserId.current) return
      loadProfile(newSession?.user?.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(() => {
    return loadProfile(session?.user?.id)
  }, [loadProfile, session])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    family,
    loadingProfile,
    refreshProfile,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
