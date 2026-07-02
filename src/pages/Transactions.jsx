import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useProfiles } from '../hooks/useProfiles'
import { addTransaction, updateTransaction, deleteTransaction } from '../lib/api'
import { formatWon } from '../utils/format'
import TransactionForm from '../components/TransactionForm'

const PERIODS = [
  { key: 'all', label: '전체 기간' },
  { key: 'month', label: '이번 달' },
  { key: 'prevMonth', label: '지난 달' },
]

function periodRange(key) {
  const now = new Date()
  if (key === 'month') {
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return { from, to: undefined }
  }
  if (key === 'prevMonth') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const from = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()
    const to = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { from, to }
  }
  return {}
}

export default function Transactions() {
  const { family, profile } = useAuth()
  const [period, setPeriod] = useState('month')
  const range = periodRange(period)
  const { transactions, loading, refresh } = useTransactions(family?.id, range)
  const { categories } = useCategories(family?.id)
  const { members } = useProfiles(family?.id)

  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false
      if (memberFilter !== 'all' && t.member_id !== memberFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${t.memo || ''} ${t.categories?.name || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [transactions, typeFilter, categoryFilter, memberFilter, search])

  const groups = useMemo(() => {
    const map = new Map()
    for (const t of filtered) {
      if (!map.has(t.date)) map.set(t.date, [])
      map.get(t.date).push(t)
    }
    return Array.from(map.entries())
  }, [filtered])

  async function handleSubmit(payload) {
    if (editing) {
      await updateTransaction(editing.id, payload)
    } else {
      await addTransaction({ ...payload, family_id: family.id })
    }
    setEditing(null)
    await refresh()
  }

  async function handleDelete(id) {
    if (!window.confirm('이 거래를 삭제할까요?')) return
    await deleteTransaction(id)
    await refresh()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">내역 관리</h1>
      </div>

      <div className="filter-bar">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={'btn btn-sm' + (period === p.key ? ' btn-primary' : '')}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">전체</option>
          <option value="income">수입</option>
          <option value="expense">지출</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
          <option value="all">전체 작성자</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input placeholder="메모/카테고리 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="empty-state">불러오는 중...</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">조건에 맞는 거래가 없어요</div>
      ) : (
        groups.map(([date, items]) => (
          <div className="tx-date-group" key={date}>
            <div className="tx-date-header">{date}</div>
            {items.map((t) => (
              <div className="tx-row" key={t.id}>
                <div className="tx-row-left">
                  <div className="tx-icon" style={{ background: (t.categories?.color || '#94a3b8') + '22' }}>
                    {t.categories?.icon || '💸'}
                  </div>
                  <div className="tx-info">
                    <div className="tx-category">{t.categories?.name || '미분류'}</div>
                    <div className="tx-memo">{t.memo || t.payment_method}</div>
                    <div className="tx-meta">{t.profiles?.name}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={'tx-amount ' + t.type}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatWon(t.amount)}
                  </div>
                  <div className="tx-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditing(t)
                        setShowForm(true)
                      }}
                    >
                      수정
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <button
        className="fab"
        onClick={() => {
          setEditing(null)
          setShowForm(true)
        }}
      >
        +
      </button>

      {showForm && (
        <TransactionForm
          categories={categories}
          members={members}
          currentMemberId={profile?.id}
          initial={editing}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
