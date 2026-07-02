import { useMemo } from 'react'
import { formatShortWon } from '../utils/format'

const UNIT = 10000
const COLUMNS = 10
const PASTEL_COLORS = ['#FFD9B3', '#FFF3B0', '#C8E6C9', '#B3E5FC', '#E1BEE7']

export default function ColoringGrid({ transactions, overallLimit, spent }) {
  const totalCells = useMemo(() => {
    const limit = overallLimit > 0 ? overallLimit : Math.max(Math.ceil((spent * 1.5) / UNIT) * UNIT, UNIT * 10)
    return Math.max(Math.ceil(limit / UNIT), 1)
  }, [overallLimit, spent])

  const cells = useMemo(() => {
    const items = [...transactions]
      .sort((a, b) => (a.date === b.date ? a.created_at?.localeCompare(b.created_at) : a.date < b.date ? -1 : 1))
      .map((t, i) => ({
        id: t.id,
        label: t.categories?.name || t.memo || '기타',
        amount: Number(t.amount),
        color: PASTEL_COLORS[i % PASTEL_COLORS.length],
      }))

    let cumulative = 0
    const boundaries = items.map((it) => {
      cumulative += it.amount
      return { ...it, upTo: cumulative }
    })
    const totalSpentAmount = cumulative

    const list = []
    let lastOwnerId = null
    for (let i = 0; i < totalCells; i++) {
      const cellStart = i * UNIT
      let owner = null
      if (cellStart < totalSpentAmount) {
        owner = boundaries.find((b) => b.upTo > cellStart) || null
      }
      const isFirst = !!owner && owner.id !== lastOwnerId
      lastOwnerId = owner ? owner.id : lastOwnerId
      list.push({ owner, isFirst })
    }
    return list
  }, [transactions, totalCells])

  return (
    <div className="coloring-grid" style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}>
      {cells.map((cell, i) => (
        <div key={i} className="coloring-cell" style={cell.owner ? { background: cell.owner.color } : undefined}>
          {cell.isFirst && (
            <span className="coloring-cell-label">
              {cell.owner.label}
              <br />
              {formatShortWon(cell.owner.amount)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
