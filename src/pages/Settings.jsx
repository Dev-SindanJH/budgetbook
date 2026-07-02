import { useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useProfiles } from '../hooks/useProfiles'
import { addCategory, updateCategory, deleteCategory, updateOwnProfile, fetchAllFamilyData, importTransactions, resetFamilyData } from '../lib/api'
import { DASHBOARD_PANELS, getDashboardPrefs, setDashboardPrefs } from '../lib/dashboardPrefs'

const COLOR_PRESETS = ['#f97316', '#3b82f6', '#8b5cf6', '#06b6d4', '#ef4444', '#ec4899', '#22c55e', '#eab308', '#64748b', '#94a3b8', '#16a34a', '#0ea5e9']

export default function Settings() {
  const { family, profile, refreshProfile } = useAuth()
  const { categories, refresh: refreshCategories } = useCategories(family?.id)
  const { members, refresh: refreshMembers } = useProfiles(family?.id)

  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState('expense')
  const [newCatIcon, setNewCatIcon] = useState('🧾')
  const [newCatColor, setNewCatColor] = useState(COLOR_PRESETS[0])

  const [myName, setMyName] = useState(profile?.name || '')
  const [myColor, setMyColor] = useState(profile?.color || COLOR_PRESETS[0])
  const [savingProfile, setSavingProfile] = useState(false)

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)

  const [dashboardPrefs, setDashboardPrefsState] = useState(getDashboardPrefs())

  function togglePanel(key) {
    const next = { ...dashboardPrefs, [key]: !dashboardPrefs[key] }
    setDashboardPrefsState(next)
    setDashboardPrefs(next)
  }

  async function handleAddCategory(e) {
    e.preventDefault()
    if (!newCatName.trim()) return
    await addCategory({
      family_id: family.id,
      name: newCatName.trim(),
      type: newCatType,
      color: newCatColor,
      icon: newCatIcon || '🧾',
    })
    setNewCatName('')
    await refreshCategories()
  }

  async function handleDeleteCategory(id) {
    if (!window.confirm('이 카테고리를 삭제할까요? 관련 거래는 미분류로 남습니다.')) return
    await deleteCategory(id)
    await refreshCategories()
  }

  async function handleCategoryColorChange(id, color) {
    await updateCategory(id, { color })
    await refreshCategories()
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await updateOwnProfile(profile.id, { name: myName, color: myColor })
      await Promise.all([refreshProfile(), refreshMembers()])
      setMessage('프로필이 저장되었어요')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleExport() {
    const data = await fetchAllFamilyData(family.id)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `budgetbook-${family.name}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const list = Array.isArray(parsed) ? parsed : parsed.transactions
      if (!Array.isArray(list)) throw new Error('올바른 형식의 파일이 아니에요')
      await importTransactions(family.id, profile.id, list)
      setMessage(`${list.length}건의 거래를 가져왔어요`)
    } catch (err) {
      setMessage(err.message || '가져오기에 실패했어요')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleReset() {
    if (!window.confirm('정말로 모든 거래·예산 데이터를 삭제할까요? 되돌릴 수 없어요.')) return
    if (!window.confirm('한 번 더 확인할게요. 정말 초기화할까요?')) return
    setBusy(true)
    try {
      await resetFamilyData(family.id)
      setMessage('데이터가 초기화되었어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">설정</h1>
      </div>

      <div className="card">
        <div className="section-title">가족 그룹</div>
        <div className="settings-list-item">
          <span>그룹 이름</span>
          <strong>{family?.name}</strong>
        </div>
        <div className="settings-list-item">
          <span>초대 코드</span>
          <strong className="badge">{family?.invite_code}</strong>
        </div>
      </div>

      <div className="card">
        <div className="section-title">대시보드 구성</div>
        <div className="hint-text" style={{ marginBottom: 12 }}>홈 화면에 보여줄 패널을 선택하세요</div>
        {DASHBOARD_PANELS.map((p) => (
          <div className="settings-list-item" key={p.key}>
            <span>{p.label}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={dashboardPrefs[p.key]} onChange={() => togglePanel(p.key)} />
            </label>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">내 프로필</div>
        <form onSubmit={handleSaveProfile}>
          <div className="field">
            <label>이름</label>
            <input value={myName} onChange={(e) => setMyName(e.target.value)} required />
          </div>
          <div className="field">
            <label>색상</label>
            <div className="category-chip-grid">
              {COLOR_PRESETS.map((c) => (
                <div
                  key={c}
                  onClick={() => setMyColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: myColor === c ? '3px solid var(--text)' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
          </div>
          <button className="btn btn-primary" disabled={savingProfile} type="submit">
            저장
          </button>
        </form>
      </div>

      <div className="card">
        <div className="section-title">가족 구성원</div>
        {members.map((m) => (
          <div className="settings-list-item" key={m.id}>
            <span className={'badge member'} style={{ background: m.color }}>
              {m.name}
            </span>
            {m.id === profile?.id && <span className="hint-text">나</span>}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">카테고리 관리</div>
        {['expense', 'income'].map((type) => (
          <div key={type} style={{ marginBottom: 16 }}>
            <div className="hint-text" style={{ marginBottom: 8 }}>{type === 'expense' ? '지출 카테고리' : '수입 카테고리'}</div>
            <div className="category-chip-grid">
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <div key={c.id} className="category-chip" style={{ borderColor: c.color }}>
                    <span>{c.icon}</span>
                    <span>{c.name}</span>
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => handleCategoryColorChange(c.id, e.target.value)}
                      style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none' }}
                    />
                    <span style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => handleDeleteCategory(c.id)}>
                      ✕
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}

        <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={newCatType} onChange={(e) => setNewCatType(e.target.value)}>
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </select>
          <input
            style={{ width: 60, textAlign: 'center' }}
            value={newCatIcon}
            onChange={(e) => setNewCatIcon(e.target.value)}
            placeholder="🧾"
          />
          <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="카테고리 이름" />
          <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} />
          <button className="btn btn-primary btn-sm" type="submit">
            추가
          </button>
        </form>
      </div>

      <div className="card">
        <div className="section-title">데이터 관리</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="btn" onClick={handleExport}>
            JSON으로 내보내기
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            JSON 가져오기
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
          <button className="btn btn-danger" onClick={handleReset} disabled={busy}>
            전체 데이터 초기화
          </button>
        </div>
        {message && <div className="hint-text">{message}</div>}
      </div>
    </div>
  )
}
