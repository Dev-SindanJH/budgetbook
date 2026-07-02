import { useMemo } from 'react'
import { formatShortWon } from '../utils/format'

const UNIT = 10000
const COLUMNS = 10
const PALETTE = [
  { bg: 'rgba(255, 190, 130, 0.68)', text: '#8a4a12' },
  { bg: 'rgba(255, 226, 110, 0.68)', text: '#7a6300' },
  { bg: 'rgba(150, 210, 155, 0.68)', text: '#1f5c2a' },
  { bg: 'rgba(120, 190, 235, 0.68)', text: '#0b4a73' },
  { bg: 'rgba(210, 160, 225, 0.68)', text: '#5c1f70' },
]

// Decompose a contiguous cell-index range into the fewest axis-aligned
// rectangles on a fixed-width grid (partial first row, merged full rows, partial last row).
function decomposeRange(startIndex, endIndex, columns) {
  if (startIndex >= endIndex) return []
  const startRow = Math.floor(startIndex / columns)
  const startCol = startIndex % columns
  const lastIndex = endIndex - 1
  const endRow = Math.floor(lastIndex / columns)
  const endCol = lastIndex % columns

  if (startRow === endRow) {
    return [{ row: startRow, startCol, length: endCol - startCol + 1, rowSpan: 1 }]
  }

  const blocks = []
  const fullRowsStart = startCol === 0 ? startRow : startRow + 1
  const fullRowsEnd = endCol === columns - 1 ? endRow : endRow - 1

  if (startCol !== 0) {
    blocks.push({ row: startRow, startCol, length: columns - startCol, rowSpan: 1 })
  }
  if (fullRowsStart <= fullRowsEnd) {
    blocks.push({ row: fullRowsStart, startCol: 0, length: columns, rowSpan: fullRowsEnd - fullRowsStart + 1 })
  }
  if (endCol !== columns - 1) {
    blocks.push({ row: endRow, startCol: 0, length: endCol + 1, rowSpan: 1 })
  }
  return blocks
}

export default function ColoringGrid({ transactions, overallLimit, spent }) {
  const totalCells = useMemo(() => {
    const limit = overallLimit > 0 ? overallLimit : Math.max(Math.ceil((spent * 1.2) / UNIT) * UNIT, UNIT * 10)
    return Math.max(Math.ceil(limit / UNIT), 1)
  }, [overallLimit, spent])

  const totalRows = Math.ceil(totalCells / COLUMNS)

  const itemBlocks = useMemo(() => {
    const items = [...transactions]
      .sort((a, b) => (a.date === b.date ? a.created_at?.localeCompare(b.created_at) : a.date < b.date ? -1 : 1))
      .map((t, i) => {
        const categoryName = t.categories?.name || '기타'
        let label
        if (categoryName === '기타') {
          label = t.memo || categoryName
        } else {
          label = t.memo ? `${categoryName}(${t.memo})` : categoryName
        }
        const palette = PALETTE[i % PALETTE.length]
        return { id: t.id, label, amount: Number(t.amount), color: palette.bg, textColor: palette.text }
      })

    let cumulative = 0
    const result = []
    for (const item of items) {
      const prevUpTo = cumulative
      cumulative += item.amount
      const startIndex = Math.min(Math.ceil(prevUpTo / UNIT), totalCells)
      const endIndex = Math.min(Math.ceil(cumulative / UNIT), totalCells)
      const blocks = decomposeRange(startIndex, endIndex, COLUMNS)
      if (blocks.length === 0) continue
      let labelBlockIndex = 0
      let bestArea = -1
      blocks.forEach((b, i) => {
        const area = b.length * b.rowSpan
        if (area > bestArea) {
          bestArea = area
          labelBlockIndex = i
        }
      })
      blocks.forEach((b, i) => {
        result.push({
          key: `${item.id}-${i}`,
          row: b.row,
          startCol: b.startCol,
          length: b.length,
          rowSpan: b.rowSpan,
          color: item.color,
          textColor: item.textColor,
          label: i === labelBlockIndex ? `${item.label} ${formatShortWon(item.amount)}` : null,
        })
      })
    }
    return result
  }, [transactions, totalCells])

  return (
    <div className="coloring-grid-wrap">
      <div
        className="coloring-base-grid"
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${totalRows}, var(--coloring-cell-h))` }}
      >
        {Array.from({ length: totalCells }).map((_, i) => (
          <div key={i} className="coloring-base-cell" />
        ))}
      </div>
      <div
        className="coloring-overlay-grid"
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${totalRows}, var(--coloring-cell-h))` }}
      >
        {itemBlocks.map((b) => (
          <div
            key={b.key}
            className="coloring-run"
            style={{
              gridColumn: `${b.startCol + 1} / span ${b.length}`,
              gridRow: `${b.row + 1} / span ${b.rowSpan}`,
              background: b.color,
            }}
          >
            {b.label && (
              <span className="coloring-run-label" style={{ color: b.textColor }}>
                {b.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
