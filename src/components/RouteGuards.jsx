import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth({ children }) {
  const { session } = useAuth()
  if (session === undefined) return <div className="center-loading">불러오는 중...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export function RequireFamily({ children }) {
  const { session, profile, loadingProfile } = useAuth()
  if (session === undefined || loadingProfile || (session && !profile)) {
    return <div className="center-loading">불러오는 중...</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (profile && !profile.family_id) return <Navigate to="/family-setup" replace />
  return children
}

export function RedirectIfReady({ children }) {
  const { session, profile } = useAuth()
  if (session && profile?.family_id) return <Navigate to="/" replace />
  return children
}
