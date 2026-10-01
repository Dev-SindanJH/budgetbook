import { useEffect, useMemo, useRef, useState } from 'react'
import { formatKoreanWon, formatWonWithReading } from '../utils/format'

const UNIT = 10000
const COLUMNS = 10
const GAP = 3
const MAX_CELL_HEIGHT = 74
const MIN_CELL_HEIGHT = 24
const PALETTE = [
  { bg: '#ceddff', text: '#294b8a' },
  { bg: '#e0d9f7', text: '#574681' },
  { bg: '#cde9e1', text: '#275e51' },
  { bg: '#d2e7f4', text: '#345a75' },
  { bg: '#f0dce6', text: '#80506c' },
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
    return [
      { row: startRow, startCol, length: endCol - startCol + 1, rowSpan: 1 },
    ]
  }

  const blocks = []
  const fullRowsStart = startCol === 0 ? startRow : startRow + 1
  const fullRowsEnd = endCol === columns - 1 ? endRow : endRow - 1

  if (startCol !== 0) {
    blocks.push({
      row: startRow,
      startCol,
      length: columns - startCol,
      rowSpan: 1,
    })
  }
  if (fullRowsStart <= fullRowsEnd) {
    blocks.push({
      row: fullRowsStart,
      startCol: 0,
      length: columns,
      rowSpan: fullRowsEnd - fullRowsStart + 1,
    })
  }
  if (endCol !== columns - 1) {
    blocks.push({ row: endRow, startCol: 0, length: endCol + 1, rowSpan: 1 })
  }
  return blocks
}

export default function ColoringGrid({ transactions, spent }) {
  const wrapRef = useRef(null)
  const [cellHeight, setCellHeight] = useState(MAX_CELL_HEIGHT)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const compute = () => {
      const colWidth = (el.clientWidth - GAP * (COLUMNS - 1)) / COLUMNS
      setCellHeight(
        Math.max(MIN_CELL_HEIGHT, Math.min(MAX_CELL_HEIGHT, colWidth)),
      )
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [])

  const totalCells = useMemo(() => {
    const limit = Math.max(Math.ceil((spent * 1.2) / UNIT) * UNIT, UNIT * 10)
    return Math.max(Math.ceil(limit / UNIT), 1)
  }, [spent])

  const totalRows = Math.ceil(totalCells / COLUMNS)

  const itemBlocks = useMemo(() => {
    const items = [...transactions]
      .sort((a, b) =>
        a.date === b.date
          ? a.created_at?.localeCompare(b.created_at)
          : a.date < b.date
            ? -1
            : 1,
      )
      .map((t, i) => {
        const categoryName = t.categories?.name || '기타'
        let label
        if (categoryName === '기타') {
          label = t.memo || categoryName
        } else {
          label = t.memo ? `${categoryName}(${t.memo})` : categoryName
        }
        const palette = PALETTE[i % PALETTE.length]
        return {
          id: t.id,
          label,
          amount: Number(t.amount),
          color: palette.bg,
          textColor: palette.text,
        }
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
          label:
            i === labelBlockIndex
              ? `${item.label} ${formatKoreanWon(item.amount)}`
              : null,
          description: `${item.label} ${formatWonWithReading(item.amount)}`,
        })
      })
    }
    return result
  }, [transactions, totalCells])

  const rowTemplate = `repeat(${totalRows}, ${cellHeight}px)`

  return (
    <div className="coloring-grid-wrap" ref={wrapRef}>
      <div
        className="coloring-base-grid"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gridTemplateRows: rowTemplate,
        }}
      >
        {Array.from({ length: totalCells }).map((_, i) => (
          <div key={i} className="coloring-base-cell" />
        ))}
      </div>
      <div
        className="coloring-overlay-grid"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gridTemplateRows: rowTemplate,
        }}
      >
        {itemBlocks.map((b) => (
          <div
            key={b.key}
            className="coloring-run"
            title={b.description}
            style={{
              gridColumn: `${b.startCol + 1} / span ${b.length}`,
              gridRow: `${b.row + 1} / span ${b.rowSpan}`,
              background: b.color,
            }}
          >
            {b.label && (
              <span
                className="coloring-run-label"
                style={{ color: b.textColor }}
              >
                {b.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
