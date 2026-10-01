import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useBudgets } from '../hooks/useBudgets'
import { useProfiles } from '../hooks/useProfiles'
import { useCategories } from '../hooks/useCategories'
import { useCreditCards } from '../hooks/useCreditCards'
import { useCashSettings } from '../hooks/useCashSettings'
import { useStockHoldings } from '../hooks/useStockHoldings'
import { addTransaction } from '../lib/api'
import { formatWon, monthStr, monthRange, monthLabel, addMonths, todayStr } from '../utils/format'
import { getDashboardPrefs } from '../lib/dashboardPrefs'
import CategoryDonutChart from '../components/CategoryDonutChart'
import DashboardCalendar from '../components/DashboardCalendar'
import ColoringGrid from '../components/ColoringGrid'
import TransactionForm from '../components/TransactionForm'
import { isCreditCardExpense, isImmediateExpense, recordedCashBalance } from '../utils/creditCards'

export default function Dashboard() {
  const { profile, family } = useAuth()
  const [month, setMonth] = useState(monthStr())
  const [formType, setFormType] = useState(null)
  const { from, to } = monthRange(month)
  const { transactions: allTransactions, loading, refresh } = useTransactions(family?.id)
  const transactions = useMemo(() => allTransactions.filter((t) => t.date >= from && t.date <= to && ((!t.savings_plan_id && !t.loan_id) || t.date <= todayStr())), [allTransactions, from, to])
  const { budgets } = useBudgets(family?.id, month)
  const { members } = useProfiles(family?.id)
  const { categories } = useCategories(family?.id)
  const { cards } = useCreditCards(family?.id)
  const { cashSettings } = useCashSettings(family?.id)
  const { holdings, totalValue: stockValue, missingCount: missingStocks } = useStockHoldings(family?.id)
  const prefs = getDashboardPrefs()

  async function handleAddTransaction(payload) {
    await addTransaction({ ...payload, family_id: family.id })
    const savedMonth = payload.date.slice(0, 7)
    await refresh()
    if (savedMonth !== month) setMonth(savedMonth)
  }

  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    let immediateExpense = 0
    for (const t of transactions) {
      if (t.type === 'income') income += Number(t.amount)
      else {
        expense += Number(t.amount)
        if (isImmediateExpense(t)) immediateExpense += Number(t.amount)
      }
    }
    const cardPayments = allTransactions
      .filter((t) => isCreditCardExpense(t) && t.card_due_date?.slice(0, 7) === month)
      .reduce((sum, t) => sum + Number(t.amount), 0)
    return { income, expense, immediateExpense, cardPayments, cashFlow: income - immediateExpense - cardPayments }
  }, [transactions, allTransactions, month])

  const categoryBudgetTotal = budgets.filter((b) => b.category_id).reduce((s, b) => s + Number(b.limit_amount), 0)
  const effectiveLimit = categoryBudgetTotal

  const donutData = useMemo(() => {
    const byCategory = {}
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const key = t.categories?.name || '기타'
      const color = t.categories?.color || '#94a3b8'
      if (!byCategory[key]) byCategory[key] = { name: key, value: 0, color }
      byCategory[key].value += Number(t.amount)
    }
    return Object.values(byCategory).sort((a, b) => b.value - a.value)
  }, [transactions])

  const expenseTransactions = useMemo(() => transactions.filter((t) => t.type === 'expense'), [transactions])

  const memberSummary = useMemo(() => {
    const byMember = {}
    for (const m of members) byMember[m.id] = { name: m.name, color: m.color, expense: 0 }
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const id = t.member_id
      if (!byMember[id]) byMember[id] = { name: t.profiles?.name || '알 수 없음', color: t.profiles?.color || '#94a3b8', expense: 0 }
      byMember[id].expense += Number(t.amount)
    }
    return Object.values(byMember).sort((a, b) => b.expense - a.expense)
  }, [members, transactions])

  const cardDueGroups = useMemo(() => {
    const byDate = {}
    const nextMonth = addMonths(month, 1)
    for (const t of allTransactions) {
      if (!isCreditCardExpense(t) || !t.card_due_date) continue
      const dueMonth = t.card_due_date.slice(0, 7)
      if (dueMonth !== month && dueMonth !== nextMonth) continue
      if (!byDate[t.card_due_date]) byDate[t.card_due_date] = { date: t.card_due_date, total: 0, items: [] }
      byDate[t.card_due_date].total += Number(t.amount)
      byDate[t.card_due_date].items.push(t)
    }
    return Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [allTransactions, month])
  const cardDueTotal = cardDueGroups.reduce((s, g) => s + g.total, 0)
  const legacyCardCount = allTransactions.filter((t) => isCreditCardExpense(t) && !t.card_due_date).length
  const today = todayStr()
  const currentCash = recordedCashBalance(allTransactions, cashSettings, today)
  const unpaidCredit = allTransactions
    .filter((t) => isCreditCardExpense(t) && t.date <= today && t.card_due_date > today)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const recent = transactions.slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">안녕하세요, {profile?.name}님 👋</h1>
      </div>

      <div className="month-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="이전 달">
          ◀
        </button>
        <span className="month-nav-label">{monthLabel(month)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="다음 달">
          ▶
        </button>
      </div>

      <div className="grid grid-3">
        <div className="card summary-card">
          <div className="summary-card-header">
            <span className="summary-label">총 수입</span>
            <button type="button" className="summary-add-button income" aria-label="수입 추가" onClick={() => setFormType('income')}>
              +
            </button>
          </div>
          <span className="summary-value income">{formatWon(stats.income)}</span>
        </div>
        <div className="card summary-card">
          <div className="summary-card-header">
            <span className="summary-label">총 지출</span>
            <button type="button" className="summary-add-button expense" aria-label="지출 추가" onClick={() => setFormType('expense')}>
              +
            </button>
          </div>
          <span className="summary-value expense">{formatWon(stats.expense)}</span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">이달 예상 현금 흐름</span>
          <span className="summary-value">{formatWon(stats.cashFlow)}</span>
          <span className="hint-text">수입 − 현금·체크카드 등 {formatWon(stats.immediateExpense)} − 이번 달 신용카드 자동이체 {formatWon(stats.cardPayments)}</span>
        </div>
      </div>
      <div className="hint-text cash-flow-note">총 지출은 사용한 달에, 신용카드 자동이체는 돈이 빠지는 달의 예상 현금 흐름에 한 번만 반영해요. 이 금액은 보유 현금 잔액이 아니에요.</div>
      <div className="grid grid-3">
        {prefs.budget && <div className="card summary-card">
          <span className="summary-label">전체 보유 현금</span>
          {currentCash === null
            ? <span className="hint-text"><Link to="/budget">보유 현금 입력하기</Link></span>
            : <span className="summary-value">{formatWon(currentCash)}</span>}
          <span className="hint-text">{today}까지의 수입, 현금 지출, 적금 납입과 카드 자동이체를 반영했어요.</span>
          {legacyCardCount > 0 && <span className="hint-text">카드 미지정 기존 내역 {legacyCardCount}건은 반영되지 않았어요.</span>}
        </div>}
        <div className="card summary-card">
          <span className="summary-label">보유 주식 잔액</span>
          <span className="summary-value">{holdings.length > 0 && missingStocks === holdings.length ? '시세 조회 전' : formatWon(stockValue)}</span>
          <span className="hint-text">KRX 최근 종가 기준 · <Link to="/budget">보유 종목 관리</Link>{missingStocks > 0 && ` · ${missingStocks}종목 시세 없음`}</span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">앞으로 빠질 신용카드값</span>
          <span className="summary-value">{formatWon(unpaidCredit)}</span>
          <span className="hint-text">오늘까지 사용했고 자동이체일이 아직 지나지 않은 금액이에요.</span>
        </div>
      </div>

      {prefs.coloringGrid && (
        <div className="card">
          <div className="section-title">🎨 색칠 가계부</div>
          <ColoringGrid transactions={expenseTransactions} overallLimit={effectiveLimit} spent={stats.expense} />
        </div>
      )}

      <div className="dashboard-wide-grid">
      {prefs.cardDue && (
        <div className="card">
          <div className="page-header" style={{ marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              💳 신용카드 자동이체 · {monthLabel(month)} / {monthLabel(addMonths(month, 1))}
            </div>
            {cardDueTotal > 0 && <span className="hint-text">총 {formatWon(cardDueTotal)}</span>}
          </div>
          {cardDueGroups.length === 0 ? (
            <div className="empty-state">이 기간에 자동이체할 신용카드 내역이 없어요</div>
          ) : (
            cardDueGroups.map((g) => (
              <div key={g.date} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700 }}>{g.date} 자동이체 예정</span>
                  <span style={{ fontWeight: 700 }}>{formatWon(g.total)}</span>
                </div>
                {g.items.map((t) => (
                  <div key={t.id} className="tx-meta" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>
                      {t.categories?.icon || '💸'} {t.categories?.name || '미분류'} · {cards.find((c) => c.id === t.card_id)?.nickname || '신용카드'} · {t.profiles?.name}
                      {t.memo && ` · ${t.memo}`}
                    </span>
                    <span>{formatWon(t.amount)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
          {legacyCardCount > 0 && <div className="hint-text">카드 미지정 기존 내역 {legacyCardCount}건은 자동이체 합계에서 제외됐어요. 내역 수정에서 카드를 선택하면 반영돼요.</div>}
        </div>
      )}

      {prefs.calendar && (
        <div className="card">
          <div className="section-title">달력</div>
          <DashboardCalendar month={month} transactions={transactions} />
        </div>
      )}
      </div>

      {(prefs.categoryDonut || prefs.memberSummary) && (
        <div className="grid grid-2">
          {prefs.categoryDonut && (
            <div className="card">
              <div className="section-title">카테고리별 지출 비중</div>
              {loading ? <div className="empty-state">불러오는 중...</div> : <CategoryDonutChart data={donutData} height={220} />}
            </div>
          )}

          {prefs.memberSummary && (
            <div className="card">
              <div className="section-title">가족 구성원별 지출</div>
              {memberSummary.every((m) => m.expense === 0) ? (
                <div className="empty-state">아직 지출 기록이 없어요</div>
              ) : (
                <div className="legend-list">
                  {memberSummary.map((m) => (
                    <div key={m.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        <span>{formatWon(m.expense)}</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: stats.expense > 0 ? `${(m.expense / stats.expense) * 100}%` : '0%',
                            background: m.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {prefs.recent && (
        <div className="card">
          <div className="page-header" style={{ marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              최근 거래
            </div>
            <Link to="/transactions" className="hint-text">
              전체 보기 →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state">아직 등록된 거래가 없어요</div>
          ) : (
            recent.map((t) => (
              <div className="tx-row" key={t.id}>
                <div className="tx-row-left">
                  <div className="tx-icon" style={{ background: (t.categories?.color || '#94a3b8') + '22' }}>
                    {t.categories?.icon || '💸'}
                  </div>
                  <div className="tx-info">
                    <div className="tx-category">{t.categories?.name || '미분류'}</div>
                    {t.memo && <div className="tx-memo">{t.memo}</div>}
                    <div className="tx-meta">
                      {t.date} · {t.profiles?.name}
                    </div>
                  </div>
                </div>
                <div className={'tx-amount ' + t.type}>
                  {t.type === 'income' ? '+' : '-'}
                  {formatWon(t.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {formType && (
        <TransactionForm
          categories={categories}
          cards={cards}
          members={members}
          currentMemberId={profile?.id}
          defaultType={formType}
          onSubmit={handleAddTransaction}
          onClose={() => setFormType(null)}
        />
      )}
    </div>
  )
}
