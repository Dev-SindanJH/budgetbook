import { useMemo } from 'react'
import { formatWon } from '../utils/format'

const UNIT = 10000
const COLUMNS = 20

export default function ColoringGrid({ categoryTotals, overallLimit, spent }) {
  const totalCells = useMemo(() => {
    const limit = overallLimit > 0 ? overallLimit : Math.max(Math.ceil((spent * 1.5) / UNIT) * UNIT, UNIT * 10)
    return Math.max(Math.ceil(limit / UNIT), 1)
  }, [overallLimit, spent])

  const cells = useMemo(() => {
    let cumulative = 0
    const boundaries = categoryTotals.map((c) => {
      cumulative += c.amount
      return { color: c.color, upTo: cumulative }
    })
    const list = []
    for (let i = 0; i < totalCells; i++) {
      const cellStart = i * UNIT
      let color = null
      if (cellStart < cumulative) {
        const b = boundaries.find((b) => b.upTo > cellStart)
        color = b?.color || null
      }
      list.push(color)
    }
    return list
  }, [categoryTotals, totalCells])

  const filledCells = Math.min(Math.ceil(spent / UNIT), totalCells)

  return (
    <div>
      <div className="coloring-grid" style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}>
        {cells.map((color, i) => (
          <div key={i} className="coloring-cell" style={color ? { background: color } : undefined} />
        ))}
      </div>
      <div className="hint-text" style={{ marginTop: 8 }}>
        칸 1개 = 1만원 · 총 {totalCells}칸 중 {filledCells}칸 색칠됨
      </div>
      {categoryTotals.length > 0 && (
        <div className="legend-list" style={{ marginTop: 10 }}>
          {categoryTotals.map((c) => (
            <div className="legend-row" key={c.name}>
              <span className="legend-dot" style={{ background: c.color }} />
              <span className="legend-name">{c.name}</span>
              <span className="legend-amount">{formatWon(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
