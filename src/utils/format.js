export function formatWon(amount) {
  const n = Number(amount) || 0
  return n.toLocaleString('ko-KR') + '원'
}

export function todayStr() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export function monthStr(date = new Date()) {
  return date.toISOString().slice(0, 7) // YYYY-MM
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
