import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  Cell,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useProfiles } from '../hooks/useProfiles'
import {
  formatWon,
  addMonths,
  monthStr,
  monthLabel,
  monthRange,
  todayStr,
} from '../utils/format'
import CategoryDonutChart from '../components/CategoryDonutChart'

const PERIODS = [
  { key: 'thisMonth', label: '이번 달' },
  { key: 'lastMonth', label: '지난 달' },
  { key: 'thisYear', label: '올해' },
  { key: 'custom', label: '사용자 지정' },
]

function computeRange(mode, customFrom, customTo) {
  const now = new Date()
  if (mode === 'thisMonth') {
    const m = monthStr(now)
    return { ...monthRange(m), label: monthLabel(m) }
  }
  if (mode === 'lastMonth') {
    const m = addMonths(monthStr(now), -1)
    return { ...monthRange(m), label: monthLabel(m) }
  }
  if (mode === 'thisYear') {
    return {
      from: `${now.getFullYear()}-01-01`,
      to: `${now.getFullYear()}-12-31`,
      label: `${now.getFullYear()}년`,
    }
  }
  return { from: customFrom, to: customTo, label: '사용자 지정 기간' }
}

export default function Statistics() {
  const { family } = useAuth()
  const [mode, setMode] = useState('thisMonth')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { transactions: allTransactions, loading } = useTransactions(family?.id)
  const { members } = useProfiles(family?.id)

  const range = computeRange(mode, customFrom, customTo)

  const invalidRange =
    mode === 'custom' && (!customFrom || !customTo || customFrom > customTo)
  const periodTx = useMemo(() => {
    if (invalidRange) return []
    return allTransactions.filter((t) => {
      if (range.from && t.date < range.from) return false
      if (range.to && t.date > range.to) return false
      if ((t.savings_plan_id || t.loan_id) && t.date > todayStr()) return false
      return true
    })
  }, [allTransactions, range.from, range.to, invalidRange])

  const donutData = useMemo(() => {
    const byCategory = {}
    for (const t of periodTx) {
      if (t.type !== 'expense') continue
      const key = t.categories?.name || '기타'
      const color = t.categories?.color || '#94a3b8'
      if (!byCategory[key]) byCategory[key] = { name: key, value: 0, color }
      byCategory[key].value += Number(t.amount)
    }
    return Object.values(byCategory).sort((a, b) => b.value - a.value)
  }, [periodTx])

  const rankingData = donutData.map((d) => ({
    name: d.name,
    amount: d.value,
    color: d.color,
  }))

  const trendData = useMemo(() => {
    const thisMonth = monthStr()
    const months = Array.from({ length: 6 }, (_, i) =>
      addMonths(thisMonth, i - 5),
    )
    return months.map((m) => {
      let income = 0
      let expense = 0
      for (const t of allTransactions) {
        if (
          t.date.slice(0, 7) !== m ||
          ((t.savings_plan_id || t.loan_id) && t.date > todayStr())
        )
          continue
        if (t.type === 'income') income += Number(t.amount)
        else expense += Number(t.amount)
      }
      return { month: m.slice(5), 수입: income, 지출: expense }
    })
  }, [allTransactions])

  const memberData = useMemo(() => {
    const byMember = {}
    for (const m of members) byMember[m.id] = { name: m.name, amount: 0 }
    for (const t of periodTx) {
      if (t.type !== 'expense') continue
      if (!byMember[t.member_id])
        byMember[t.member_id] = {
          name: t.profiles?.name || '알 수 없음',
          amount: 0,
        }
      byMember[t.member_id].amount += Number(t.amount)
    }
    return Object.values(byMember).sort((a, b) => b.amount - a.amount)
  }, [members, periodTx])

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">SPENDING INSIGHTS</div>
          <h1 className="page-title">기록 속에서 찾은 흐름</h1>
          <p className="page-description">
            어디에 얼마나 썼는지, 차근차근 살펴봐요.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={'btn btn-sm' + (mode === p.key ? ' btn-primary' : '')}
            onClick={() => setMode(p.key)}
          >
            {p.label}
          </button>
        ))}
        {mode === 'custom' && (
          <>
            <input
              type="date"
              aria-label="조회 시작일"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label="조회 종료일"
              min={customFrom}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </>
        )}
      </div>
      <div className="hint-text" style={{ marginBottom: 16 }}>
        {invalidRange
          ? '시작일과 종료일을 올바르게 선택해주세요.'
          : range.label}
      </div>

      <div className="grid grid-3 analysis-summary">
        <div className="card summary-card">
          <span className="summary-label">선택 기간 지출</span>
          <strong className="summary-value">
            {loading
              ? '확인 중…'
              : formatWon(
                  periodTx
                    .filter((t) => t.type === 'expense')
                    .reduce((s, t) => s + Number(t.amount), 0),
                )}
          </strong>
        </div>
        <div className="card summary-card">
          <span className="summary-label">선택 기간 수입</span>
          <strong className="summary-value income">
            {loading
              ? '확인 중…'
              : formatWon(
                  periodTx
                    .filter((t) => t.type === 'income')
                    .reduce((s, t) => s + Number(t.amount), 0),
                )}
          </strong>
        </div>
        <div className="card summary-card">
          <span className="summary-label">가장 많이 쓴 카테고리</span>
          <strong className="summary-value">
            {loading ? '확인 중…' : donutData[0]?.name || '아직 없어요'}
          </strong>
          <span className="hint-text">
            {!loading && donutData[0]
              ? formatWon(donutData[0].value)
              : '기록이 쌓이면 알려드릴게요'}
          </span>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <div className="section-title">카테고리별 지출 비중</div>
          <CategoryDonutChart data={donutData} height={220} />
        </div>

        <div className="card">
          <div className="section-title">카테고리별 순위</div>
          {rankingData.length === 0 ? (
            <div className="empty-state">데이터가 없어요</div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rankingData}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => (v / 10000).toFixed(0) + '만'}
                  />
                  <YAxis type="category" dataKey="name" width={70} />
                  <Tooltip formatter={(v) => formatWon(v)} />
                  <Bar name="지출" dataKey="amount" radius={[0, 6, 6, 0]}>
                    {rankingData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="statistics-lower-grid">
        <div className="card">
          <div className="section-title">최근 6개월 수입/지출 추이</div>
          <div className="chart-box tall">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                <Tooltip formatter={(v) => formatWon(v)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="수입"
                  stroke="#15816f"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="지출"
                  stroke="#316dfa"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-title">가족 구성원별 지출 비교</div>
          {memberData.every((m) => m.amount === 0) ? (
            <div className="empty-state">데이터가 없어요</div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                  <Tooltip formatter={(v) => formatWon(v)} />
                  <Bar dataKey="amount" fill="#718df2" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
