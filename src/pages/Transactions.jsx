import Money from '../components/Money'
import { Link, useSearchParams } from 'react-router-dom'
import { useUI } from '../context/UIContext'
import FamilyEvents from '../components/FamilyEvents'
import Icon from '../components/Icon'
import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useProfiles } from '../hooks/useProfiles'
import { useCreditCards } from '../hooks/useCreditCards'
import { useCashAssets } from '../hooks/useCashAssets'
import { useCardInstallments } from '../hooks/useCardInstallments'
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addCardInstallment,
  deleteCardInstallment,
} from '../lib/api'
import {
  formatWon,
  todayStr,
} from '../utils/format'
import { installmentSchedule, isCreditCardExpense } from '../utils/creditCards'
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
  const [period, setPeriod] = useState('month')
  const range = view === 'calendar' ? {} : periodRange(period)
  const { transactions, loading, error: transactionsError, refresh } = useTransactions(family?.id, range)
  const { categories } = useCategories(family?.id)
  const { members } = useProfiles(family?.id)
  const { cards } = useCreditCards(family?.id)
  const { assets: cashAssets } = useCashAssets(family?.id)
  const { installments, refresh: refreshInstallments } = useCardInstallments(family?.id)

  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [cardFilter, setCardFilter] = useState('all')
  const [groupBy, setGroupBy] = useState('date')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter)
        return false
      if (memberFilter !== 'all' && t.member_id !== memberFilter) return false
      if (groupBy === 'card' && !isCreditCardExpense(t)) return false
      if (cardFilter !== 'all' && t.card_id !== cardFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${t.memo || ''} ${t.categories?.name || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [transactions, typeFilter, categoryFilter, memberFilter, cardFilter, groupBy, search])

  const cardLabel = (card) =>
    `${card.nickname} · ${members.find((m) => m.id === card.owner_id)?.name || '가족'}`

  const groups = useMemo(() => {
    const map = new Map()
    if (groupBy === 'card') {
      // Registration order keeps each card in a stable place; card-less rows (loan interest) go last.
      for (const card of cards) map.set(card.id, [])
      map.set(null, [])
    }
    for (const t of filtered) {
      const key = groupBy === 'card' ? t.card_id || null : t.date
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return Array.from(map.entries()).filter(([, items]) => items.length > 0)
  }, [filtered, groupBy, cards])

  const today = todayStr()
  const activeInstallments = useMemo(() => installments
    .filter((plan) => cardFilter === 'all' || plan.card_id === cardFilter)
    .map((plan) => {
      const card = cards.find((c) => c.id === plan.card_id)
      const upcoming = card ? installmentSchedule({
        purchaseDate: plan.purchase_date,
        totalMonths: plan.total_months,
        firstInstallment: plan.first_installment,
        amountMode: plan.amount_mode,
        amount: plan.amount,
        debitDay: card.debit_day,
      }).filter((row) => row.dueDate >= today) : []
      return { plan, card, upcoming }
    })
    .filter(({ upcoming }) => upcoming.length > 0), [installments, cards, cardFilter, today])

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

  async function handleAddInstallment(payload) {
    await addCardInstallment({ ...payload, family_id: family.id })
    await Promise.all([refresh(), refreshInstallments()])
    notify('할부를 등록했어요')
  }

  async function handleCancelInstallment(plan, upcoming) {
    if (
      !(await confirm(
        `앞으로 출금될 ${upcoming.length}회차 내역을 삭제해요. 이미 출금된 회차는 기록으로 남아요.`,
        { title: `'${plan.name}' 할부를 취소할까요?` },
      ))
    )
      return
    try {
      await deleteCardInstallment(plan.id)
      await Promise.all([refresh(), refreshInstallments()])
      notify('할부를 취소했어요')
    } catch (err) {
      notify(err.message || '할부를 취소하지 못했어요', true)
    }
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
          {view === 'list' && (
            <div className="view-switch" aria-label="모아보기 기준">
              <button
                className={'btn btn-sm' + (groupBy === 'date' ? ' active' : '')}
                aria-pressed={groupBy === 'date'}
                onClick={() => setGroupBy('date')}
              >
                날짜별
              </button>
              <button
                className={'btn btn-sm' + (groupBy === 'card' ? ' active' : '')}
                aria-pressed={groupBy === 'card'}
                onClick={() => setGroupBy('card')}
              >
                <Icon name="card" size={16} />
                카드별
              </button>
            </div>
          )}
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
          <select
            aria-label="신용카드"
            value={cardFilter}
            onChange={(e) => setCardFilter(e.target.value)}
          >
            <option value="all">전체 카드</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {cardLabel(card)}
                {card.active ? '' : ' (사용 중지)'}
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
          {groupBy === 'card' && activeInstallments.length > 0 && (
            <div className="card installment-summary">
              <div className="section-title">진행 중인 할부</div>
              {activeInstallments.map(({ plan, card, upcoming }) => (
                <div className="settings-list-item installment-item" key={plan.id}>
                  <span>
                    <strong>{plan.name}</strong> · {card ? cardLabel(card) : '카드'}
                    <span className="tx-meta">
                      {plan.total_months}개월 중 남은 {upcoming.length}회 ·{' '}
                      {formatWon(upcoming.reduce((sum, row) => sum + row.amount, 0))} ·
                      다음 출금 {upcoming[0].dueDate}
                    </span>
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleCancelInstallment(plan, upcoming)}
                  >
                    할부 취소
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className="transaction-result-count">
              {groupBy === 'card' ? '신용카드 내역' : '내역'} {filtered.length}건
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
              groups.map(([key, items]) => (
                <div className="tx-date-group" key={key ?? 'none'}>
                  {groupBy === 'card' ? (
                    <div className="tx-date-header tx-card-header">
                      <span>
                        {(() => {
                          const card = cards.find((c) => c.id === key)
                          return card ? cardLabel(card) : '카드 미지정'
                        })()}{' '}
                        · {items.length}건
                      </span>
                      <Money amount={items.reduce((sum, t) => sum + Number(t.amount), 0)} />
                    </div>
                  ) : (
                    <div className="tx-date-header">{key}</div>
                  )}
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
                          {/* The memo names the entry, as in the home recent list. */}
                          <div className="tx-category">
                            {t.memo || t.categories?.name || '미분류'}
                          </div>
                          <div className="tx-memo">
                            {groupBy === 'card' && `${t.date} · `}
                            {t.memo ? t.categories?.name || '미분류' : t.payment_method}
                            {(t.savings_plan_id || t.loan_id) &&
                              (t.date > todayStr()
                                ? ' · 납입 예정'
                                : ' · 자동 등록')}
                            {t.payment_method === '신용카드' &&
                              t.card_due_date &&
                              ` · ${t.card_due_date} 자동이체`}
                          </div>
                          <div className="tx-meta">
                            {t.profiles?.name} · {cashAssets.find((asset) => asset.id === t.cash_asset_id)?.name || '보유처 미지정'}
                            {t.cash_balance_included === false && ' · 기존 잔액에 포함'}
                            {t.family_event_occurrence_id && <> · <Link className="event-transaction-link" to={`/transactions?view=calendar&event=${t.family_event_occurrence_id}`}>연결된 가족 일정</Link></>}
                          </div>
                        </div>
                      </div>
                      <span className="tx-list-payment">
                        {t.loan_id && t.payment_method === '신용카드'
                          ? '카드 · 대출이자'
                          : t.payment_method === '신용카드'
                            ? `${t.installment_id ? '할부' : t.payment_method} · ${cards.find((c) => c.id === t.card_id)?.nickname || '카드 미지정'}`
                            : t.payment_method || '—'}
                      </span>
                      <span className="tx-list-member">
                        {t.profiles?.name || '—'}
                      </span>
                      <div className="tx-row-right">
                        <div className={'tx-amount ' + t.type}>
                          {t.type === 'income' ? '+' : '-'}
                          <Money amount={t.amount} />
                        </div>
                        <div className="tx-actions">
                          {!t.savings_plan_id && !t.loan_id && !t.installment_id && (
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
        loading ? <div className="empty-state">불러오는 중…</div> :
          <FamilyEvents transactions={transactions} transactionsError={transactionsError} calendarTransactions={filtered} onTransactionsChanged={refresh} />
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
          cashAssets={cashAssets}
          members={members}
          currentMemberId={profile?.id}
          initial={editing}
          expenseOnly={Boolean(editing?.family_event_occurrence_id)}
          onSubmit={handleSubmit}
          onSubmitInstallment={handleAddInstallment}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
