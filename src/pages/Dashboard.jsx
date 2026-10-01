import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import { useTransactions } from '../hooks/useTransactions'
import { useBudgets } from '../hooks/useBudgets'
import { useProfiles } from '../hooks/useProfiles'
import { useCategories } from '../hooks/useCategories'
import { useCreditCards } from '../hooks/useCreditCards'
import { useCashSettings } from '../hooks/useCashSettings'
import { useCashAssets } from '../hooks/useCashAssets'
import { useStockHoldings } from '../hooks/useStockHoldings'
import { addTransaction } from '../lib/api'
import {
  formatWon,
  monthStr,
  monthRange,
  monthLabel,
  addMonths,
  todayStr,
} from '../utils/format'
import { getDashboardPrefs } from '../lib/dashboardPrefs'
import {
  isCreditCardExpense,
  isImmediateExpense,
  recordedCashBalance,
} from '../utils/creditCards'
import CategoryDonutChart from '../components/CategoryDonutChart'
import DashboardCalendar from '../components/DashboardCalendar'
import ColoringGrid from '../components/ColoringGrid'
import TransactionForm from '../components/TransactionForm'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

export default function Dashboard() {
  const { profile, family } = useAuth()
  const { notify } = useUI()
  const [month, setMonth] = useState(monthStr())
  const [member, setMember] = useState('all')
  const [formType, setFormType] = useState(null)
  const [showDue, setShowDue] = useState(false)
  const { from, to } = monthRange(month)
  const {
    transactions: allTransactions,
    loading,
    refresh,
  } = useTransactions(family?.id)
  const { budgets, loading: budgetLoading } = useBudgets(family?.id, month)
  const { members } = useProfiles(family?.id)
  const { categories } = useCategories(family?.id)
  const { cards } = useCreditCards(family?.id)
  const { cashSettings, loading: cashSettingsLoading } = useCashSettings(
    family?.id,
  )
  const {
    assets: cashAssets,
    total: cashAssetTotal,
    loading: cashLoading,
    error: cashError,
  } = useCashAssets(family?.id)
  const {
    totalValue: stockValue,
    missingCount,
    loading: stockLoading,
    error: stockError,
  } = useStockHoldings(family?.id)
  const prefs = getDashboardPrefs()
  const today = todayStr()
  const transactions = useMemo(
    () =>
      allTransactions.filter(
        (t) =>
          t.date >= from &&
          t.date <= to &&
          ((!t.savings_plan_id && !t.loan_id) || t.date <= today) &&
          (member === 'all' || t.member_id === member),
      ),
    [allTransactions, from, to, today, member],
  )
  const expenseTransactions = transactions.filter((t) => t.type === 'expense')
  const expense = expenseTransactions.reduce(
    (sum, t) => sum + Number(t.amount),
    0,
  )
  const income = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const limit = budgets
    .filter((b) => b.category_id)
    .reduce((sum, b) => sum + Number(b.limit_amount), 0)
  const hasBudget = limit > 0 && member === 'all'
  const remaining = limit - expense
  const ready = !loading && !budgetLoading
  const currentCash = recordedCashBalance(allTransactions, cashSettings, today)
  const cashValue = cashAssets.length ? cashAssetTotal : currentCash
  const savingsValue = allTransactions
    .filter((t) => t.savings_plan_id && t.date <= today)
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalAssets = (cashValue ?? 0) + savingsValue + stockValue
  const assetsLoading =
    loading || cashLoading || cashSettingsLoading || stockLoading
  const dueGroups = useMemo(() => {
    const map = {}
    const end = monthRange(addMonths(month, 1)).to
    const start = month === monthStr() ? today : from
    for (const t of allTransactions) {
      if (
        !isCreditCardExpense(t) ||
        !t.card_due_date ||
        t.card_due_date < start ||
        t.card_due_date > end ||
        (member !== 'all' && t.member_id !== member)
      )
        continue
      const group = (map[t.card_due_date] ||= {
        date: t.card_due_date,
        amount: 0,
        items: [],
      })
      group.amount += Number(t.amount)
      group.items.push(t)
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [allTransactions, month, from, member, today])
  const cardPayments = allTransactions
    .filter(
      (t) =>
        isCreditCardExpense(t) &&
        t.card_due_date?.slice(0, 7) === month &&
        (member === 'all' || t.member_id === member),
    )
    .reduce((s, t) => s + Number(t.amount), 0)
  const cashFlow =
    income -
    expenseTransactions
      .filter(isImmediateExpense)
      .reduce((s, t) => s + Number(t.amount), 0) -
    cardPayments
  const legacyCards = allTransactions.filter(
    (t) => isCreditCardExpense(t) && !t.card_due_date,
  ).length
  const donutData = Object.values(
    expenseTransactions.reduce((map, t) => {
      const name = t.categories?.name || '기타'
      const item = (map[name] ||= {
        name,
        value: 0,
        color: t.categories?.color || '#8192ae',
      })
      item.value += Number(t.amount)
      return map
    }, {}),
  ).sort((a, b) => b.value - a.value)
  const previousMonth = addMonths(month, -1)
  const previousRange = monthRange(previousMonth)
  const cutoffDay =
    month === monthStr()
      ? Math.min(Number(today.slice(-2)), Number(previousRange.to.slice(-2)))
      : Number(previousRange.to.slice(-2))
  const previousEnd = previousMonth + '-' + String(cutoffDay).padStart(2, '0')
  const previousExpenses = allTransactions.filter(
    (t) =>
      t.type === 'expense' &&
      t.date >= previousRange.from &&
      t.date <= previousEnd &&
      (member === 'all' || t.member_id === member),
  )
  const previousExpense = previousExpenses.reduce(
    (sum, t) => sum + Number(t.amount),
    0,
  )
  const comparableExpense = expenseTransactions
    .filter((t) => month !== monthStr() || t.date <= today)
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const difference = comparableExpense - previousExpense
  const extraPanels =
    prefs.calendar ||
    prefs.categoryDonut ||
    prefs.memberSummary ||
    prefs.coloringGrid
  async function handleAdd(payload) {
    await addTransaction({ ...payload, family_id: family.id })
    await refresh()
    setMonth(payload.date.slice(0, 7))
    if (member !== 'all') setMember(payload.member_id)
    notify('내역을 기록했어요')
  }
  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <div className="eyebrow">OUR MONEY, OUR EVERYDAY</div>
          <h1 className="page-title">우리의 오늘을 한눈에</h1>
          <p className="page-description">
            {profile?.name}님, 우리 집 돈의 흐름을 확인해보세요.
          </p>
        </div>
        <div className="dashboard-controls">
          <div className="month-picker">
            <button
              className="icon-button"
              aria-label="이전 달"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <Icon name="left" size={16} />
            </button>
            <span>{monthLabel(month)}</span>
            <button
              className="icon-button"
              aria-label="다음 달"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <Icon name="right" size={16} />
            </button>
          </div>
          <select
            aria-label="조회할 구성원"
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="all">가족 전체</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="home-grid">
        <section className="hero-card">
          <div className="hero-heading">
            <span className="eyebrow">MONTHLY BUDGET</span>
            <span className="soft-badge">
              {member === 'all'
                ? '가족 전체'
                : members.find((m) => m.id === member)?.name}
            </span>
          </div>
          <div className="hero-label">
            {hasBudget
              ? remaining < 0
                ? '이번 달 예산 초과'
                : '이번 달 남은 예산'
              : '이번 달 지출'}
          </div>
          <div
            className={`hero-amount${hasBudget && remaining < 0 ? ' over' : ''}${Math.abs(hasBudget ? remaining : expense) >= 10000000000 ? ' amount-long' : ''}`}
          >
            {ready
              ? formatWon(hasBudget ? Math.abs(remaining) : expense)
              : '확인 중…'}
          </div>
          <p className="hero-description">
            {!ready
              ? '이번 달 기록을 정리하고 있어요.'
              : hasBudget
                ? remaining < 0
                  ? '예산을 넘겼어요. 지출을 함께 살펴볼까요?'
                  : '우리의 계획 안에서 차근차근 쓰고 있어요.'
                : member !== 'all'
                  ? '선택한 구성원의 지출이에요. 예산은 가족 전체 기준이에요.'
                  : '예산을 정하면 남은 금액을 한눈에 볼 수 있어요.'}
          </p>
          {hasBudget && ready && (
            <div className="hero-progress">
              <div
                className="progress-track"
                role="progressbar"
                aria-label="이번 달 예산 사용률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(
                  100,
                  Math.round((expense / limit) * 100),
                )}
              >
                <div
                  className={`progress-fill${remaining < 0 ? ' over' : ''}`}
                  style={{
                    width: `${Math.min(100, (expense / limit) * 100)}%`,
                  }}
                />
              </div>
              <div className="progress-caption">
                <span>{formatWon(expense)} 사용</span>
                <span>예산 {formatWon(limit)}</span>
              </div>
            </div>
          )}
          <div className="hero-actions">
            <button
              className="btn btn-primary"
              onClick={() => setFormType('expense')}
            >
              <Icon name="plus" />
              지출 기록
            </button>
            <button
              className="btn btn-glass"
              onClick={() => setFormType('income')}
            >
              <Icon name="plus" size={18} />
              수입 기록
            </button>
            <Link
              className="text-link"
              to={`/budget?tab=budget&month=${month}`}
            >
              {hasBudget ? '예산 관리' : '예산 설정'}
              <Icon name="right" size={16} />
            </Link>
          </div>
          {hasBudget && (
            <details className="budget-basis">
              <summary>예산 계산 기준</summary>
              <p>
                카테고리 예산의 합계에서 모든 지출을 뺀 금액이에요. 예산을
                설정하지 않은 카테고리와 미분류 지출도 포함해요. 보유 현금이나
                출금 가능 금액과는 달라요.
              </p>
            </details>
          )}
        </section>
        <aside className="home-side">
          <section
            className={
              'card spending-card' +
              (Math.max(income, expense) >= 100000000 ? ' large-values' : '')
            }
          >
            <div className="section-heading">
              <span className="section-icon">
                <Icon name="chart" />
              </span>
              <h2>이번 달 흐름</h2>
              <Link
                className="icon-button"
                to="/statistics"
                aria-label="소비 분석 보기"
              >
                <Icon name="right" size={16} />
              </Link>
            </div>
            <div className="flow-row">
              <span>지출</span>
              <strong>{loading ? '—' : formatWon(expense)}</strong>
            </div>
            <div className="flow-row">
              <span>수입</span>
              <strong className="income-text">
                {loading ? '—' : formatWon(income)}
              </strong>
            </div>
            <div className="flow-footer">
              {!loading &&
              month <= monthStr() &&
              previousExpenses.length > 0 ? (
                <span>
                  {month === monthStr()
                    ? '지난달 같은 기간보다 '
                    : '지난달보다 '}
                  {difference === 0
                    ? '같은 금액을 썼어요'
                    : formatWon(Math.abs(difference)) +
                      (difference > 0 ? ' 더 썼어요' : ' 덜 썼어요')}
                </span>
              ) : (
                <span>
                  {transactions.length}건의 기록 · {monthLabel(month)}
                </span>
              )}
            </div>
          </section>
          {prefs.cardDue && (
            <button className="card due-card" onClick={() => setShowDue(true)}>
              <span className="section-heading">
                <span className="section-icon lavender">
                  <Icon name="card" />
                </span>
                <strong>카드 결제 일정</strong>
                <Icon name="right" size={16} />
              </span>
              <span className="due-value">
                {loading
                  ? '확인 중…'
                  : dueGroups[0]
                    ? formatWon(dueGroups[0].amount)
                    : '예정된 결제가 없어요'}
              </span>
              <span className="hint-text">
                {dueGroups[0]
                  ? `${dueGroups[0].date} · 등록된 내역 기준`
                  : '카드 사용 내역을 기록하면 확인할 수 있어요.'}
              </span>
            </button>
          )}
        </aside>
        <Link to="/budget" className="card asset-strip">
          <span className="section-icon">
            <Icon name="wallet" />
          </span>
          <span className="asset-strip-label">
            <strong>우리 집 총 보유 자산</strong>
            <span className="hint-text">
              가족 전체 · 현금 + 적금 납입액 + 주식
            </span>
          </span>
          <span className="asset-strip-value">
            {assetsLoading
              ? '확인 중…'
              : cashError || stockError
                ? '일부 조회 실패'
                : formatWon(totalAssets)}
            <Icon name="right" size={18} />
          </span>
          {!assetsLoading && (missingCount > 0 || cashValue === null) && (
            <span className="asset-note hint-text">
              {missingCount > 0 ? `시세 미확인 ${missingCount}종목 제외. ` : ''}
              {cashValue === null ? '현금 기준 미설정.' : ''}
            </span>
          )}
        </Link>
        {prefs.recent && (
          <section className="card recent-card">
            <div className="section-heading">
              <h2>최근 내역</h2>
              <Link className="text-link" to="/transactions">
                전체 보기
                <Icon name="right" size={16} />
              </Link>
            </div>
            {loading ? (
              <div className="empty-state">내역을 불러오고 있어요</div>
            ) : !transactions.length ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name="list" size={26} />
                </span>
                <strong>첫 기록을 남겨보세요</strong>
                <p>작은 기록부터 우리 집 돈의 흐름이 보여요.</p>
                <button className="btn" onClick={() => setFormType('expense')}>
                  지출 기록하기
                </button>
              </div>
            ) : (
              transactions.slice(0, 5).map((t) => (
                <div className="tx-row" key={t.id}>
                  <div className="tx-row-left">
                    <div
                      className="tx-icon"
                      style={{
                        background: `${t.categories?.color || '#8192ae'}18`,
                      }}
                    >
                      {t.categories?.icon || <Icon name="wallet" />}
                    </div>
                    <div className="tx-info">
                      <div className="tx-category">
                        {t.memo || t.categories?.name || '미분류'}
                      </div>
                      <div className="tx-meta">
                        {t.categories?.name || '미분류'} · {t.profiles?.name} ·{' '}
                        {t.date.slice(5).replace('-', '.')}
                      </div>
                    </div>
                  </div>
                  <div className={`tx-amount ${t.type}`}>
                    {t.type === 'income' ? '+' : '−'}
                    {formatWon(t.amount)}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
        <section className="card home-shortcuts">
          <div className="section-heading">
            <h2>더 살펴보기</h2>
          </div>
          <Link to="/transactions?view=calendar">
            <span className="section-icon lavender">
              <Icon name="calendar" />
            </span>
            <span>
              <strong>소비 달력</strong>
              <small>날짜별로 확인하는 돈의 흐름</small>
            </span>
            <Icon name="right" size={16} />
          </Link>
          <Link to={`/budget?tab=budget&month=${month}`}>
            <span className="section-icon">
              <Icon name="chart" />
            </span>
            <span>
              <strong>우리 집 예산</strong>
              <small>카테고리 예산과 색칠 가계부</small>
            </span>
            <Icon name="right" size={16} />
          </Link>
          {prefs.budget && (
            <div className="cash-mini">
              <span>가족 전체 보유 현금</span>
              <strong>
                {cashLoading || cashSettingsLoading
                  ? '확인 중…'
                  : cashError
                    ? '조회 실패'
                    : cashValue === null
                      ? '기준 미설정'
                      : formatWon(cashValue)}
              </strong>
            </div>
          )}
        </section>
      </div>
      {extraPanels && (
        <details className="dashboard-extras">
          <summary>
            나의 추가 패널 <span>달력과 소비 분석 펼쳐보기</span>
          </summary>
          <div className="grid grid-2">
            {prefs.calendar && (
              <section className="card">
                <h2 className="section-title">소비 달력</h2>
                <DashboardCalendar month={month} transactions={transactions} />
              </section>
            )}
            {prefs.categoryDonut && (
              <section className="card">
                <h2 className="section-title">카테고리별 지출</h2>
                <CategoryDonutChart data={donutData} height={220} />
              </section>
            )}
            {prefs.memberSummary && (
              <section className="card">
                <h2 className="section-title">구성원별 지출</h2>
                {members.map((m) => (
                  <div className="flow-row" key={m.id}>
                    <span>{m.name}</span>
                    <strong>
                      {formatWon(
                        expenseTransactions
                          .filter((t) => t.member_id === m.id)
                          .reduce((s, t) => s + Number(t.amount), 0),
                      )}
                    </strong>
                  </div>
                ))}
              </section>
            )}
            {prefs.coloringGrid && (
              <section className="card">
                <h2 className="section-title">색칠 가계부</h2>
                <ColoringGrid
                  transactions={expenseTransactions}
                  overallLimit={member === 'all' ? limit : 0}
                  spent={expense}
                />
              </section>
            )}
          </div>
        </details>
      )}
      {showDue && (
        <Modal
          title="카드 결제 일정"
          description={`${monthLabel(month)}부터 다음 달까지 · ${member === 'all' ? '가족 전체' : members.find((m) => m.id === member)?.name}`}
          onClose={() => setShowDue(false)}
        >
          <div className="payment-explainer">
            사용한 금액은 소비에, 결제 예정 금액은 현금 흐름에 반영해요. 소비로
            두 번 더하지 않아요.
          </div>
          {!dueGroups.length && (
            <div className="empty-state">이 기간에 등록된 결제가 없어요</div>
          )}
          {dueGroups.map((g) => (
            <section className="due-group" key={g.date}>
              <div className="flow-row">
                <strong>{g.date}</strong>
                <strong>{formatWon(g.amount)}</strong>
              </div>
              {g.items.map((t) => (
                <div className="due-item" key={t.id}>
                  <span>
                    {cards.find((c) => c.id === t.card_id)?.nickname ||
                      '신용카드'}
                    <small>
                      {t.memo || t.categories?.name} · {t.profiles?.name}
                    </small>
                  </span>
                  <strong>{formatWon(t.amount)}</strong>
                </div>
              ))}
            </section>
          ))}
          <div className="payment-explainer">
            {monthLabel(month)} 예상 현금 흐름{' '}
            <strong>{formatWon(cashFlow)}</strong>
            <br />
            수입 − 즉시 지출 − 해당 월 카드 결제액. 보유 현금 잔액과는 달라요.
          </div>
          {legacyCards > 0 && (
            <p className="hint-text">
              결제일이 없는 기존 카드 내역 {legacyCards}건은 일정에서
              제외했어요.
            </p>
          )}
          <Link
            className="btn btn-primary btn-block"
            to="/transactions"
            onClick={() => setShowDue(false)}
          >
            카드 내역 확인
          </Link>
        </Modal>
      )}
      {formType && (
        <TransactionForm
          categories={categories}
          cards={cards}
          members={members}
          currentMemberId={profile?.id}
          defaultType={formType}
          onSubmit={handleAdd}
          onClose={() => setFormType(null)}
        />
      )}
    </div>
  )
}
