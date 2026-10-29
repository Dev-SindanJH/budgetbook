import Money from '../components/Money'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import { useTransactions } from '../hooks/useTransactions'
import { useProfiles } from '../hooks/useProfiles'
import { useCategories } from '../hooks/useCategories'
import { useCreditCards } from '../hooks/useCreditCards'
import { cashAssetBalances } from '../utils/cashAssets'
import { totalSavingsPaid } from '../utils/savings'
import { useSavingsPlans } from '../hooks/useSavingsPlans'
import { useCashAssets } from '../hooks/useCashAssets'
import { useStockHoldings } from '../hooks/useStockHoldings'
import { addCardInstallment, addTransaction } from '../lib/api'
import {
  formatWonWithReading,
  monthStr,
  monthRange,
  monthLabel,
  addMonths,
  todayStr,
} from '../utils/format'
import { getDashboardPrefs } from '../lib/dashboardPrefs'
import {
  isCreditCardExpense,
} from '../utils/creditCards'
import CategoryDonutChart from '../components/CategoryDonutChart'
import FamilyEvents from '../components/FamilyEvents'
import ColoringGrid from '../components/ColoringGrid'
import TransactionForm from '../components/TransactionForm'
import ExpenseBreakdown from '../components/ExpenseBreakdown'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

export default function Dashboard() {
  const { profile, family } = useAuth()
  const { notify } = useUI()
  const [month, setMonth] = useState(monthStr())
  const [member, setMember] = useState('all')
  const [formType, setFormType] = useState(null)
  const [showDue, setShowDue] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const { from, to } = monthRange(month)
  const {
    transactions: allTransactions,
    loading,
    error: transactionsError,
    refresh,
  } = useTransactions(family?.id)
  const { members } = useProfiles(family?.id)
  const { categories } = useCategories(family?.id)
  const { cards } = useCreditCards(family?.id)
  const {
    assets: cashAssets,
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
  const ready = !loading
  const memberLabel =
    member === 'all' ? '가족 전체' : members.find((m) => m.id === member)?.name
  const { plans, loading: plansLoading, error: plansError } = useSavingsPlans(family?.id)
  const cashValue = cashAssetBalances(cashAssets, allTransactions, today).reduce((sum, asset) => sum + asset.balance, 0)
  const savingsValue = totalSavingsPaid(plans, today)
  const totalAssets = cashValue + savingsValue + stockValue
  const assetsLoading = loading || cashLoading || plansLoading || stockLoading
  // The card bill panel shows what was charged this month, billed next month.
  const cardBills = expenseTransactions.filter(isCreditCardExpense)
  const cardSpending = cardBills.reduce((s, t) => s + Number(t.amount), 0)
  const cardGroups = Object.values(
    cardBills.reduce((map, t) => {
      // Loan interest paid by card has no card row; it is billed on its own date.
      const key = t.card_id || 'loan'
      const group = (map[key] ||= {
        key,
        card: cards.find((c) => c.id === t.card_id),
        amount: 0,
        dates: new Set(),
        items: [],
      })
      group.amount += Number(t.amount)
      if (t.card_due_date) group.dates.add(t.card_due_date)
      group.items.push(t)
      return map
    }, {}),
  ).sort((a, b) => b.amount - a.amount)
  const cardMonthLabel = month === monthStr() ? '이번 달' : monthLabel(month)
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
  async function handleAddInstallment(payload) {
    await addCardInstallment({ ...payload, family_id: family.id })
    await refresh()
    notify('할부를 등록했어요')
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
        <section
          className="hero-card hero-card-clickable"
          // The whole card opens the breakdown; its own buttons keep their actions.
          onClick={(e) => {
            if (ready && !e.target.closest('.hero-actions')) setShowExpense(true)
          }}
        >
          <div className="hero-heading">
            <span className="eyebrow">MONTHLY SPENDING</span>
            <span className="soft-badge">{memberLabel}</span>
          </div>
          <button type="button" className="hero-breakdown-button" disabled={!ready}>
            <span className="hero-label">
              이번 달 지출
              <Icon name="right" size={16} />
            </span>
            <span className={`hero-amount${expense >= 10000000000 ? ' amount-long' : ''}`}>
              {ready ? <Money amount={expense} /> : '확인 중…'}
            </span>
          </button>
          <p className="hero-description">{!ready ? '이번 달 기록을 정리하고 있어요.' : member !== 'all' ? '선택한 구성원의 지출이에요. 눌러서 자세히 확인해보세요.' : '눌러서 어디에 얼마나 썼는지 확인해보세요.'}</p>
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
          </div>
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
              <strong>{loading ? '—' : <Money amount={expense} />}</strong>
            </div>
            <div className="flow-row">
              <span>수입</span>
              <strong className="income-text">
                {loading ? '—' : <Money amount={income} />}
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
                    : formatWonWithReading(Math.abs(difference)) +
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
                <strong>{cardMonthLabel} 카드값</strong>
                <Icon name="right" size={16} />
              </span>
              <span className="due-value">
                {loading
                  ? '확인 중…'
                  : cardGroups.length
                    ? <Money amount={cardSpending} />
                    : '사용한 카드값이 없어요'}
              </span>
              <span className="hint-text">
                {Number(month.slice(5))}월 사용분 · {Number(addMonths(month, 1).slice(5))}월 출금
                {cardGroups.length > 0 && ` · 카드 ${cardGroups.length}장`}
              </span>
            </button>
          )}
        </aside>
        <FamilyEvents mode="home" transactions={allTransactions} transactionsLoading={loading} transactionsError={transactionsError} onTransactionsChanged={refresh} />
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
              : transactionsError || cashError || plansError || stockError
                ? '일부 조회 실패'
                : <Money amount={totalAssets} />}
            <Icon name="right" size={18} />
          </span>
          {!assetsLoading && missingCount > 0 && (
            <span className="asset-note hint-text">
              {missingCount > 0 ? `시세 미확인 ${missingCount}종목 제외. ` : ''}
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
                    <Money amount={t.amount} />
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
              <strong>가족 캘린더</strong>
              <small>챙길 일정과 준비할 돈을 함께</small>
            </span>
            <Icon name="right" size={16} />
          </Link>
          {prefs.budget && (
            <div className="cash-mini">
              <span>가족 전체 보유 현금</span>
              <strong>
                {cashLoading || loading
                  ? '확인 중…'
                  : cashError || transactionsError
                    ? '조회 실패'
                    : <Money amount={cashValue} />}
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
              <FamilyEvents month={month} transactions={allTransactions} transactionsLoading={loading} transactionsError={transactionsError} calendarTransactions={transactions} onTransactionsChanged={refresh} />
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
                      <Money amount={expenseTransactions
                          .filter((t) => t.member_id === m.id)
                          .reduce((s, t) => s + Number(t.amount), 0)} />
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
                  spent={expense}
                />
              </section>
            )}
          </div>
        </details>
      )}
      {showDue && (
        <Modal
          title={`${cardMonthLabel} 카드값`}
          description={`${monthLabel(month)}에 사용해서 ${monthLabel(addMonths(month, 1))}에 출금 · ${memberLabel}`}
          onClose={() => setShowDue(false)}
        >
          <div className="breakdown-total">
            <span>합계</span>
            <strong><Money amount={cardSpending} /></strong>
          </div>
          <div className="payment-explainer">
            이 달에 신용카드로 쓴 금액이에요. 카드마다 다음 달 결제일에 출금돼요.
          </div>
          {!cardGroups.length && (
            <div className="empty-state">이 달에 사용한 카드값이 없어요</div>
          )}
          {cardGroups.map((g) => (
            <details className="card-bill" key={g.key}>
              <summary>
                <span>
                  <strong>{g.card?.nickname || (g.key === 'loan' ? '대출이자 (카드 납입)' : '신용카드')}</strong>
                  <small>
                    {g.dates.size
                      ? [...g.dates].sort().map((d) => d.slice(5).replace('-', '/')).join(', ') + ' 출금'
                      : '출금일 미정'}{' '}
                    · {g.items.length}건
                  </small>
                </span>
                <strong><Money amount={g.amount} /></strong>
              </summary>
              {[...g.items].sort((a, b) => a.date.localeCompare(b.date)).map((t) => (
                <div className="due-item" key={t.id}>
                  <span>
                    {t.memo || t.categories?.name || '미분류'}
                    <small>
                      {t.date.slice(5).replace('-', '.')} 사용 · {t.categories?.name || '미분류'} · {t.profiles?.name}
                    </small>
                  </span>
                  <strong><Money amount={t.amount} /></strong>
                </div>
              ))}
            </details>
          ))}
          <Link
            className="btn btn-primary btn-block"
            to="/transactions"
            onClick={() => setShowDue(false)}
          >
            카드 내역 확인
          </Link>
        </Modal>
      )}
      {showExpense && (
        <ExpenseBreakdown
          month={month}
          memberLabel={memberLabel}
          expenses={expenseTransactions}
          cards={cards}
          members={members}
          showMembers={member === 'all'}
          onClose={() => setShowExpense(false)}
        />
      )}
      {formType && (
        <TransactionForm
          categories={categories}
          cards={cards}
          cashAssets={cashAssets}
          members={members}
          currentMemberId={profile?.id}
          defaultType={formType}
          onSubmit={handleAdd}
          onSubmitInstallment={handleAddInstallment}
          onClose={() => setFormType(null)}
        />
      )}
    </div>
  )
}
