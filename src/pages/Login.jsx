import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name || email.split('@')[0] } },
        })
        if (signUpError) throw signUpError
        setNotice('가입 완료! 이메일 확인이 켜져 있다면 받은편지함에서 인증 후 로그인해주세요.')
        setMode('signin')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
    } catch (err) {
      setError(err.message || '오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">💰 우리집 가계부</div>
        <div className="auth-subtitle">가족과 함께 쓰는 가계부</div>

        <div className="auth-tabs">
          <div
            className={'auth-tab' + (mode === 'signin' ? ' active' : '')}
            onClick={() => setMode('signin')}
          >
            로그인
          </div>
          <div
            className={'auth-tab' + (mode === 'signup' ? ' active' : '')}
            onClick={() => setMode('signup')}
          >
            회원가입
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field">
              <label>이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="가족들에게 보일 이름" />
            </div>
          )}
          <div className="field">
            <label>이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          {notice && <div className="hint-text" style={{ marginBottom: 12 }}>{notice}</div>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? '처리 중...' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
