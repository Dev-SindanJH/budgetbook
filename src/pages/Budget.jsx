import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useTransactions } from '../hooks/useTransactions'
import { useBudgets } from '../hooks/useBudgets'
import { upsertBudget } from '../lib/api'
import { formatWon, monthStr, monthRange, monthLabel, addMonths } from '../utils/format'
import BudgetProgressBar from '../components/BudgetProgressBar'
import ColoringGrid from '../components/ColoringGrid'

export default function Budget() {
  const { family } = useAuth()
  const [month, setMonth] = useState(monthStr())
  const { from, to } = monthRange(month)

  const { categories } = useCategories(family?.id)
  const { transactions } = useTransactions(family?.id, { from, to })
  const { budgets, refresh } = useBudgets(family?.id, month)

  const [drafts, setDrafts] = useState({})
  const [savingKey, setSavingKey] = useState(null)

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  const spentByCategory = useMemo(() => {
    const map = {}
    let total = 0
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      total += Number(t.amount)
      if (!t.category_id) continue
      map[t.category_id] = (map[t.category_id] || 0) + Number(t.amount)
    }
    return { map, total }
  }, [transactions])

  const overallBudget = budgets.find((b) => !b.category_id)
  const categoryBudget = (categoryId) => budgets.find((b) => b.category_id === categoryId)

  const categoryTotals = useMemo(() => {
    return expenseCategories
      .map((c) => ({ name: c.name, color: c.color, amount: spentByCategory.map[c.id] || 0 }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [expenseCategories, spentByCategory])

  function draftValue(key, fallback) {
    return drafts[key] !== undefined ? drafts[key] : fallback ?? ''
  }

  async function handleSave(categoryId, key) {
    const raw = drafts[key]
    const amount = Number(raw)
    if (!raw || amount < 0) return
    setSavingKey(key)
    try {
      await upsertBudget({ familyId: family.id, categoryId, month, limitAmount: amount })
      await refresh()
    } finally {
      setSavingKey(null)
    }
  }

  const overRows = expenseCategories
    .map((c) => {
      const b = categoryBudget(c.id)
      const spent = spentByCategory.map[c.id] || 0
      return { c, limit: b ? Number(b.limit_amount) : 0, spent }
    })
    .filter((r) => r.limit > 0 && r.spent > r.limit)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">예산 관리</h1>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
            ← 이전 달
          </button>
          <span className="hint-text" style={{ alignSelf: 'center' }}>{monthLabel(month)}</span>
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>
            다음 달 →
          </button>
        </div>
      </div>

      {overRows.length > 0 && (
        <div className="card" style={{ borderColor: '#fecaca' }}>
          <div className="section-title" style={{ color: 'var(--danger)' }}>
            ⚠ 예산 초과 카테고리
          </div>
          {overRows.map(({ c, limit, spent }) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <BudgetProgressBar spent={spent} limit={limit} label={`${c.icon} ${c.name}`} />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="section-title">전체 월 예산</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="number"
            min="0"
            placeholder="전체 예산 금액"
            style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}
            value={draftValue('overall', overallBudget?.limit_amount)}
            onChange={(e) => setDrafts((d) => ({ ...d, overall: e.target.value }))}
          />
          <button
            className="btn btn-primary"
            disabled={savingKey === 'overall'}
            onClick={() => handleSave(null, 'overall')}
          >
            저장
          </button>
        </div>
        {overallBudget && (
          <BudgetProgressBar spent={spentByCategory.total} limit={Number(overallBudget.limit_amount)} label="이번 달 전체 지출" />
        )}
      </div>

      <div className="card">
        <div className="section-title">🎨 색칠 가계부</div>
        <ColoringGrid
          categoryTotals={categoryTotals}
          overallLimit={overallBudget ? Number(overallBudget.limit_amount) : 0}
          spent={spentByCategory.total}
        />
      </div>

      <div className="card">
        <div className="section-title">카테고리별 예산</div>
        {expenseCategories.map((c) => {
          const b = categoryBudget(c.id)
          const spent = spentByCategory.map[c.id] || 0
          const key = c.id
          return (
            <div key={c.id} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>
                  {c.icon} {c.name}
                </span>
                <div style={{ display: 'flex', gap: 8, flex: '1 1 200px', maxWidth: 260 }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="예산 금액"
                    style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}
                    value={draftValue(key, b?.limit_amount)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  />
                  <button className="btn btn-sm btn-primary" disabled={savingKey === key} onClick={() => handleSave(c.id, key)}>
                    저장
                  </button>
                </div>
              </div>
              {b ? (
                <BudgetProgressBar spent={spent} limit={Number(b.limit_amount)} label="" sub={`${formatWon(spent)} / ${formatWon(b.limit_amount)}`} />
              ) : (
                spent > 0 && <div className="hint-text">{formatWon(spent)} 지출 (예산 미설정)</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
