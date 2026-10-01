import Icon from '../components/Icon'
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
        setNotice(
          '가입 완료! 이메일 확인이 켜져 있다면 받은편지함에서 인증 후 로그인해주세요.',
        )
        setMode('signin')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
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
      <section className="auth-story">
        <div className="eyebrow">A LITTLE EVERY DAY</div>
        <h1>
          함께 기록하고,
          <br />더 나은 내일로.
        </h1>
        <p>
          우리 집의 모든 돈 이야기,
          <br />
          이제 한곳에서 가볍게 시작해요.
        </p>
        <div className="auth-visual">
          <div className="section-heading">
            <span className="section-icon">
              <Icon name="wallet" />
            </span>
            <h2>우리의 일상을 위한 가계부</h2>
          </div>
          <div className="flow-row">
            <span>오늘의 기록</span>
            <Icon name="check" />
          </div>
          <div className="flow-row">
            <span>이번 달의 계획</span>
            <Icon name="check" />
          </div>
          <div className="flow-row">
            <span>함께 모으는 내일</span>
            <Icon name="check" />
          </div>
        </div>
      </section>
      <div className="auth-card">
        <div className="auth-title">
          <img src="./favicon.svg" alt="" className="brand-icon-lg" />
          우리집 가계부
        </div>
        <div className="auth-subtitle">가족과 함께 쓰는 가계부</div>

        <div className="auth-tabs">
          <button
            type="button"
            className={'auth-tab' + (mode === 'signin' ? ' active' : '')}
            onClick={() => setMode('signin')}
          >
            로그인
          </button>
          <button
            type="button"
            className={'auth-tab' + (mode === 'signup' ? ' active' : '')}
            onClick={() => setMode('signup')}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="auth-name">이름</label>
              <input
                id="auth-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="가족들에게 보일 이름"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="auth-email">이메일</label>
            <input
              id="auth-email"
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="auth-password">비밀번호</label>
            <input
              id="auth-password"
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
            />
          </div>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="hint-text" style={{ marginBottom: 12 }}>
              {notice}
            </div>
          )}
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            type="submit"
          >
            {busy ? '처리 중...' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
        </form>
        <p className="auth-footer">
          <Icon name="shield" size={16} />
          가족과 함께 만드는 건강한 돈 습관
        </p>
      </div>
    </div>
  )
}
