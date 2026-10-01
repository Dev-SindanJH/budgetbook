export function formatWon(amount) {
  const n = Number(amount) || 0
  return n.toLocaleString('ko-KR') + '원'
}

export function formatKoreanWon(amount) {
  const n = Number(amount) || 0
  if (!Number.isFinite(n)) return '0원'
  const [integer, fraction] = Math.abs(n).toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 3,
  }).split('.')
  const units = ['', '만', '억', '조', '경', '해']
  const parts = []
  for (let end = integer.length, unit = 0; end > 0; end -= 4, unit++) {
    const group = Number(integer.slice(Math.max(0, end - 4), end))
    if (unit === 0 && fraction) parts.unshift(`${group}.${fraction}`)
    else if (group) parts.unshift(`${group}${units[unit] || ''}`)
  }
  return `${n < 0 ? '-' : ''}${parts.join(' ') || '0'}원`
}

export function formatWonWithReading(amount) {
  return `${formatWon(amount)} (${formatKoreanWon(amount)})`
}

// Keep the editable value as a string so commas never enter saved amounts.
export function formatMoneyInput(value) {
  return String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function monthStr(date = new Date()) {
  return todayStr(date).slice(0, 7)
}

export function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-')
  return `${y}년 ${Number(m)}월`
}

export function isInMonth(dateStr, monthKey) {
  return dateStr.slice(0, 7) === monthKey
}

export function monthRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  const from = `${monthKey}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${monthKey}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

export function formatShortWon(amount) {
  const n = Number(amount) || 0
  if (n >= 10000) {
    const man = Math.round((n / 10000) * 10) / 10
    return `${man}만`
  }
  return n.toLocaleString('ko-KR')
}
