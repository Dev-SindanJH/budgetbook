import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useBudgets } from '../hooks/useBudgets'
import { useProfiles } from '../hooks/useProfiles'
import { formatWon, monthStr, monthRange, monthLabel } from '../utils/format'
import BudgetProgressBar from '../components/BudgetProgressBar'
import CategoryDonutChart from '../components/CategoryDonutChart'

export default function Dashboard() {
  const { profile, family } = useAuth()
  const month = monthStr()
  const { from, to } = monthRange(month)
  const { transactions, loading } = useTransactions(family?.id, { from, to })
  const { budgets } = useBudgets(family?.id, month)
  const { members } = useProfiles(family?.id)

  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of transactions) {
      if (t.type === 'income') income += Number(t.amount)
      else expense += Number(t.amount)
    }
    return { income, expense, balance: income - expense }
  }, [transactions])

  const overallBudget = budgets.find((b) => !b.category_id)
  const categoryBudgetTotal = budgets.filter((b) => b.category_id).reduce((s, b) => s + Number(b.limit_amount), 0)
  const effectiveLimit = overallBudget ? Number(overallBudget.limit_amount) : categoryBudgetTotal

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

  const recent = transactions.slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">안녕하세요, {profile?.name}님 👋</h1>
        <span className="hint-text">{monthLabel(month)}</span>
      </div>

      <div className="grid grid-3">
        <div className="card summary-card">
          <span className="summary-label">총 수입</span>
          <span className="summary-value income">{formatWon(stats.income)}</span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">총 지출</span>
          <span className="summary-value expense">{formatWon(stats.expense)}</span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">잔액</span>
          <span className="summary-value">{formatWon(stats.balance)}</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">이번 달 전체 예산</div>
        {effectiveLimit > 0 ? (
          <BudgetProgressBar spent={stats.expense} limit={effectiveLimit} label="전체 지출" />
        ) : (
          <div className="empty-state">
            설정된 예산이 없어요. <Link to="/budget">예산 설정하러 가기</Link>
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-title">카테고리별 지출 비중</div>
          {loading ? <div className="empty-state">불러오는 중...</div> : <CategoryDonutChart data={donutData} height={220} />}
        </div>

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
      </div>

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
    </div>
  )
}
