import { useSearchParams } from 'react-router-dom'
import { useUI } from '../context/UIContext'
import DashboardCalendar from '../components/DashboardCalendar'
import Icon from '../components/Icon'
import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useProfiles } from '../hooks/useProfiles'
import { useCreditCards } from '../hooks/useCreditCards'
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from '../lib/api'
import {
  formatWon,
  todayStr,
  monthStr,
  monthLabel,
  addMonths,
} from '../utils/format'
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
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return {
      from,
      to: `${from.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  if (key === 'prevMonth') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const from = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay = new Date(
      prev.getFullYear(),
      prev.getMonth() + 1,
      0,
    ).getDate()
    const to = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { from, to }
  }
  return {}
}

export default function Transactions() {
  const { family, profile } = useAuth()
  const { confirm, notify } = useUI()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'calendar' ? 'calendar' : 'list'
  const [calendarMonth, setCalendarMonth] = useState(monthStr())
  const [period, setPeriod] = useState('month')
  const range = view === 'calendar' ? {} : periodRange(period)
  const { transactions, loading, refresh } = useTransactions(family?.id, range)
  const { categories } = useCategories(family?.id)
  const { members } = useProfiles(family?.id)
  const { cards } = useCreditCards(family?.id)

  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter)
        return false
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
    notify(editing ? '내역을 수정했어요' : '내역을 기록했어요')
  }

  async function handleDelete(id) {
    if (
      !(await confirm('삭제한 내역은 되돌릴 수 없어요.', {
        title: '이 내역을 삭제할까요?',
      }))
    )
      return
    try {
      await deleteTransaction(id)
      await refresh()
      notify('내역을 삭제했어요')
    } catch (err) {
      notify(err.message || '삭제하지 못했어요', true)
    }
  }

  function openAddForm() {
    setEditing(null)
    setShowForm(true)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">TRANSACTIONS</div>
          <h1 className="page-title">우리의 모든 기록</h1>
          <p className="page-description">
            일상의 지출부터 함께 모은 수입까지.
          </p>
        </div>
        <button
          className="btn btn-primary transactions-desktop-add"
          onClick={openAddForm}
        >
          + 내역 추가
        </button>
      </div>

      <div className="card transaction-filters">
        <div className="filter-heading">
          <div
            className="period-buttons"
            aria-label="조회 기간"
            hidden={view === 'calendar'}
          >
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={
                  'btn btn-sm' + (period === p.key ? ' btn-primary' : '')
                }
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="view-switch" aria-label="내역 보기 방식">
            <button
              className={'btn btn-sm' + (view === 'list' ? ' active' : '')}
              aria-pressed={view === 'list'}
              onClick={() => setSearchParams({})}
            >
              <Icon name="list" size={16} />
              목록
            </button>
            <button
              className={'btn btn-sm' + (view === 'calendar' ? ' active' : '')}
              aria-pressed={view === 'calendar'}
              onClick={() => setSearchParams({ view: 'calendar' })}
            >
              <Icon name="calendar" size={16} />
              달력
            </button>
          </div>
        </div>
        <div className="transaction-filter-fields">
          <select
            aria-label="거래 구분"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">전체</option>
            <option value="income">수입</option>
            <option value="expense">지출</option>
          </select>
          <select
            aria-label="카테고리"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">전체 카테고리</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="작성자"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          >
            <option value="all">전체 작성자</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            aria-label="메모 또는 카테고리 검색"
            placeholder="메모/카테고리 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {view === 'list' && (
        <>
          {!loading && (
            <div className="transaction-result-count">
              내역 {filtered.length}건
            </div>
          )}

          {!loading && groups.length > 0 && (
            <div className="transaction-table-heading" aria-hidden="true">
              <span>내역</span>
              <span>결제수단</span>
              <span>작성자</span>
              <span>금액 · 관리</span>
            </div>
          )}

          <div className="transaction-list">
            {loading ? (
              <div className="empty-state">불러오는 중...</div>
            ) : groups.length === 0 ? (
              <div className="empty-state">조건에 맞는 거래가 없어요</div>
            ) : (
              groups.map(([date, items]) => (
                <div className="tx-date-group" key={date}>
                  <div className="tx-date-header">{date}</div>
                  {items.map((t) => (
                    <div className="tx-row tx-row-list" key={t.id}>
                      <div className="tx-row-left">
                        <div
                          className="tx-icon"
                          style={{
                            background:
                              (t.categories?.color || '#94a3b8') + '22',
                          }}
                        >
                          {t.categories?.icon || '💸'}
                        </div>
                        <div className="tx-info">
                          <div className="tx-category">
                            {t.categories?.name || '미분류'}
                          </div>
                          <div className="tx-memo">
                            {t.memo || t.payment_method}
                            {(t.savings_plan_id || t.loan_id) &&
                              (t.date > todayStr()
                                ? ' · 납입 예정'
                                : ' · 자동 등록')}
                            {t.payment_method === '신용카드' &&
                              t.card_due_date &&
                              ` · ${t.card_due_date} 자동이체`}
                          </div>
                          <div className="tx-meta">{t.profiles?.name}</div>
                        </div>
                      </div>
                      <span className="tx-list-payment">
                        {t.loan_id && t.payment_method === '신용카드'
                          ? '카드 · 대출이자'
                          : t.payment_method === '신용카드'
                            ? `${t.payment_method} · ${cards.find((c) => c.id === t.card_id)?.nickname || '카드 미지정'}`
                            : t.payment_method || '—'}
                      </span>
                      <span className="tx-list-member">
                        {t.profiles?.name || '—'}
                      </span>
                      <div className="tx-row-right">
                        <div className={'tx-amount ' + t.type}>
                          {t.type === 'income' ? '+' : '-'}
                          {formatWon(t.amount)}
                        </div>
                        <div className="tx-actions">
                          {!t.savings_plan_id && !t.loan_id && (
                            <>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setEditing(t)
                                  setShowForm(true)
                                }}
                              >
                                수정
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDelete(t.id)}
                              >
                                삭제
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
      {view === 'calendar' && (
        <section className="card">
          <div className="month-nav">
            <button
              className="icon-button"
              aria-label="이전 달"
              onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
            >
              <Icon name="left" />
            </button>
            <span className="month-nav-label">{monthLabel(calendarMonth)}</span>
            <button
              className="icon-button"
              aria-label="다음 달"
              onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
            >
              <Icon name="right" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state">불러오는 중…</div>
          ) : (
            <DashboardCalendar
              month={calendarMonth}
              transactions={filtered.filter((t) =>
                t.date.startsWith(calendarMonth),
              )}
            />
          )}
        </section>
      )}

      <button
        className="fab transactions-mobile-add"
        aria-label="내역 추가"
        onClick={openAddForm}
      >
        +
      </button>

      {showForm && (
        <TransactionForm
          categories={categories}
          cards={cards}
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
