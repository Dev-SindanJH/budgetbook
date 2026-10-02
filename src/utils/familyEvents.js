import KoreanLunarCalendar from 'korean-lunar-calendar'

export const EVENT_KINDS = {
  birthday: '생신',
  wedding: '결혼식·축의금',
  other: '기타',
}
export const EVENT_STATUS = {
  pending: '준비 중',
  complete: '지출 마무리',
  cancelled: '취소',
}
export const pad = (n) => String(n).padStart(2, '0')
export const dateString = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function daysUntil(date, today) {
  return Math.round(
    (new Date(`${date}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000,
  )
}

// Birthdays retain their original calendar date. Every occurrence has a solar date.
export function occurrenceDate(definition, year) {
  const { calendar, month, day, leap_month, leap_policy, feb29_policy } =
    definition
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  )
    throw new Error('연도·월·일을 확인해주세요.')
  if (calendar === 'lunar') {
    if (year < 1900 || year > 2049)
      throw new Error('음력 반복 일정은 1900~2049년까지 지원해요.')
    const lunar = new KoreanLunarCalendar()
    let leap = Boolean(leap_month)
    if (leap && !lunar.setLunarDate(year, month, 1, true)) {
      if (leap_policy === 'skip') return null
      leap = false
    }
    // Lunar months may have 29 days; celebrate on that month's last day.
    const valid =
      lunar.setLunarDate(year, month, day, leap) ||
      (day === 30 && lunar.setLunarDate(year, month, 29, leap))
    if (!valid) throw new Error('음력 날짜를 확인해주세요.')
    const solar = lunar.getSolarCalendar()
    return dateString(solar.year, solar.month, solar.day)
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (month === 2 && day === 29 && date.getUTCMonth() !== 1) {
    return feb29_policy === 'mar1' ? `${year}-03-01` : `${year}-02-28`
  }
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    throw new Error('존재하지 않는 날짜예요.')
  return dateString(year, month, day)
}

export function buildOccurrences(definition, fromYear, first = {}) {
  const end = definition.annual
    ? definition.calendar === 'lunar'
      ? 2049
      : 2100
    : fromYear
  const rows = []
  for (let year = fromYear; year <= end; year++) {
    const date = occurrenceDate(definition, year)
    if (!date) continue
    rows.push({
      occurrence_year: year,
      event_date: date,
      spend_date: date,
      title: definition.title,
      kind: definition.kind,
      owner_id: definition.owner_id || null,
      memo: definition.memo || '',
      location: definition.location || '',
      event_time: definition.event_time || '',
      planned_amount: null,
      status: 'pending',
      ...(year === fromYear ? first : {}),
    })
  }
  if (!rows.length) throw new Error('선택한 기간에 기념할 날짜가 없어요.')
  return rows
}

export function eventAmounts(event, transactions = []) {
  const linked = transactions.filter(
    (t) => t.family_event_occurrence_id === event.id && t.type === 'expense',
  )
  const actual = linked.reduce((sum, t) => sum + Number(t.amount), 0)
  const unknown = event.planned_amount == null && event.status === 'pending'
  const planned = Number(event.planned_amount || 0)
  const remaining =
    event.status === 'pending' ? Math.max(0, planned - actual) : 0
  return {
    linked,
    actual,
    remaining,
    unknown,
    over: event.planned_amount == null ? 0 : Math.max(0, actual - planned),
  }
}

export function summarizeEvents(events, transactions, from, to) {
  return events.reduce(
    (total, event) => {
      if (
        event.spend_date < from ||
        event.spend_date > to ||
        event.status !== 'pending'
      )
        return total
      const amounts = eventAmounts(event, transactions)
      total.remaining += amounts.remaining
      total.unknown += Number(amounts.unknown)
      return total
    },
    { remaining: 0, unknown: 0 },
  )
}

export function calendarLabel(definition) {
  return `${definition.calendar === 'lunar' ? '음력' : '양력'} ${definition.leap_month ? '윤' : ''}${definition.month}월 ${definition.day}일${definition.annual ? ' · 매년' : ''}`
}
