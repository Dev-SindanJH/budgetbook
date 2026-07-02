import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function FamilySetup() {
  const { refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('create') // 'create' | 'join'
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { data, error: rpcError } = await supabase.rpc('create_family', { family_name: familyName })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    setCreatedCode(row.invite_code)
    await refreshProfile()
  }

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('join_family', { code: inviteCode.trim() })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await refreshProfile()
    navigate('/', { replace: true })
  }

  async function handleStart() {
    await refreshProfile()
    navigate('/', { replace: true })
  }

  if (createdCode) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-title">그룹이 만들어졌어요!</div>
          <div className="auth-subtitle">아래 초대 코드를 가족에게 공유해주세요</div>
          <div className="invite-code-box">
            <div className="hint-text">초대 코드</div>
            <div className="invite-code-value">{createdCode}</div>
          </div>
          <button className="btn btn-primary btn-block" onClick={handleStart}>
            시작하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">가족 그룹 설정</div>
        <div className="auth-subtitle">그룹을 새로 만들거나 초대 코드로 참여하세요</div>

        <div className="auth-tabs">
          <div className={'auth-tab' + (mode === 'create' ? ' active' : '')} onClick={() => setMode('create')}>
            그룹 만들기
          </div>
          <div className={'auth-tab' + (mode === 'join' ? ' active' : '')} onClick={() => setMode('join')}>
            초대 코드로 참여
          </div>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>그룹 이름</label>
              <input
                required
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="예: 김씨네 가족"
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? '만드는 중...' : '그룹 만들기'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <div className="field">
              <label>초대 코드</label>
              <input
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="예: A1B2C3"
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? '참여하는 중...' : '참여하기'}
            </button>
          </form>
        )}

        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={signOut}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
