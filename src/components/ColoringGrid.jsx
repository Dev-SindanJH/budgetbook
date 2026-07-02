import { useMemo } from 'react'
import { formatShortWon } from '../utils/format'

const UNIT = 10000
const COLUMNS = 10
const PASTEL_COLORS = ['#FFD9B3', '#FFF3B0', '#C8E6C9', '#B3E5FC', '#E1BEE7']

function sameOwner(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.id === b.id
}

export default function ColoringGrid({ transactions, overallLimit, spent }) {
  const totalCells = useMemo(() => {
    const limit = overallLimit > 0 ? overallLimit : Math.max(Math.ceil((spent * 1.5) / UNIT) * UNIT, UNIT * 10)
    return Math.max(Math.ceil(limit / UNIT), 1)
  }, [overallLimit, spent])

  const rows = useMemo(() => {
    const items = [...transactions]
      .sort((a, b) => (a.date === b.date ? a.created_at?.localeCompare(b.created_at) : a.date < b.date ? -1 : 1))
      .map((t, i) => {
        const categoryName = t.categories?.name || '기타'
        const label = t.memo ? `${categoryName}(${t.memo})` : categoryName
        return {
          id: t.id,
          label,
          amount: Number(t.amount),
          color: PASTEL_COLORS[i % PASTEL_COLORS.length],
        }
      })

    let cumulative = 0
    const boundaries = items.map((it) => {
      cumulative += it.amount
      return { ...it, upTo: cumulative }
    })
    const totalSpentAmount = cumulative

    const owners = []
    for (let i = 0; i < totalCells; i++) {
      const cellStart = i * UNIT
      let owner = null
      if (cellStart < totalSpentAmount) {
        owner = boundaries.find((b) => b.upTo > cellStart) || null
      }
      owners.push(owner)
    }

    const rowList = []
    for (let r = 0; r < owners.length; r += COLUMNS) {
      const rowOwners = owners.slice(r, r + COLUMNS)
      const segments = []
      let i = 0
      while (i < rowOwners.length) {
        let j = i + 1
        while (j < rowOwners.length && sameOwner(rowOwners[j], rowOwners[i])) j++
        segments.push({ startCol: i, length: j - i, owner: rowOwners[i] })
        i = j
      }
      rowList.push(segments)
    }
    return rowList
  }, [transactions, totalCells])

  return (
    <div className="coloring-grid" style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}>
      {rows.map((segments, rowIndex) =>
        segments.map((seg, segIndex) => (
          <div
            key={`${rowIndex}-${segIndex}`}
            className={seg.owner ? 'coloring-run' : 'coloring-cell-empty'}
            style={{
              gridColumn: `${seg.startCol + 1} / span ${seg.length}`,
              gridRow: rowIndex + 1,
              background: seg.owner ? seg.owner.color : undefined,
            }}
          >
            {seg.owner && (
              <span className="coloring-run-label">
                {seg.owner.label} {formatShortWon(seg.owner.amount)}
              </span>
            )}
          </div>
        )),
      )}
    </div>
  )
}
