import Money from './Money'
import { useMemo, useState } from 'react'
import { formatKoreanWon, formatWonWithReading, todayStr } from '../utils/format'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function DashboardCalendar({ month, transactions, events = [], onEventClick, onAddEvent }) {
  const [selectedDate, setSelectedDate] = useState(null)

  const byDate = useMemo(() => {
    const map = {}
    for (const t of transactions) {
      if (!map[t.date]) map[t.date] = { income: 0, expense: 0, items: [] }
      if (t.type === 'income') map[t.date].income += Number(t.amount)
      else map[t.date].expense += Number(t.amount)
      map[t.date].items.push(t)
    }
    return map
  }, [transactions])

  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const firstWeekday = new Date(y, m - 1, 1).getDay()
    const daysInMonth = new Date(y, m, 0).getDate()
    const list = []
    for (let i = 0; i < firstWeekday; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(`${month}-${String(d).padStart(2, '0')}`)
    }
    return list
  }, [month])

  const today = todayStr()
  const activeDate = selectedDate?.startsWith(month) ? selectedDate : null
  const dayData = activeDate ? byDate[activeDate] : null

  return (
    <div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((dateStr, i) => {
          if (!dateStr)
            return (
              <div
                key={`blank-${i}`}
                className="calendar-day calendar-day-empty"
              />
            )
          const data = byDate[dateStr]
          const dayEvents = events.filter((event) => event.event_date === dateStr)
          const dayNum = Number(dateStr.slice(-2))
          return (
            <button
              key={dateStr}
              aria-label={`${dateStr}${data ? `, 지출 ${formatWonWithReading(data.expense)}, 수입 ${formatWonWithReading(data.income)}` : ', 거래 없음'}${dayEvents.length ? `, 일정 ${dayEvents.length}건: ${dayEvents.map((event) => event.title).join(', ')}` : ''}`}
              aria-pressed={dateStr === activeDate}
              type="button"
              className={
                'calendar-day' +
                (dateStr === selectedDate ? ' selected' : '') +
                (dateStr === today ? ' today' : '')
              }
              onClick={() =>
                setSelectedDate(dateStr === selectedDate ? null : dateStr)
              }
            >
              <span className="calendar-day-num">{dayNum}</span>
              {dayEvents.length > 0 && <span className="calendar-event-title">{dayEvents[0].title}{dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}</span>}
              {data?.expense > 0 && (
                <span className="calendar-expense">
                  -{formatKoreanWon(data.expense)}
                </span>
              )}
              {data?.income > 0 && (
                <span className="calendar-income">
                  +{formatKoreanWon(data.income)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeDate && (
        <div className="calendar-day-detail">
          <div className="section-title">{activeDate}</div>
          {events.filter((event) => event.event_date === activeDate).map((event) => <button className="calendar-event-detail" type="button" key={event.id} onClick={() => onEventClick?.(event)}>{event.title}<span>{event.status === 'complete' ? '지출 마무리' : event.status === 'cancelled' ? '취소' : event.planned_amount == null ? '금액 미정' : `예정 ${formatKoreanWon(event.planned_amount)}`}</span></button>)}
          {onAddEvent && <button type="button" className="btn btn-sm" onClick={() => onAddEvent(activeDate)}>이 날짜에 일정 추가</button>}
          {!dayData || dayData.items.length === 0 ? (
            <div className="empty-state">이 날의 내역이 없어요</div>
          ) : (
            dayData.items.map((t) => (
              <div key={t.id} className="tx-row">
                <div className="tx-row-left">
                  <div
                    className="tx-icon"
                    style={{
                      background: (t.categories?.color || '#94a3b8') + '22',
                    }}
                  >
                    {t.categories?.icon || '💸'}
                  </div>
                  <div className="tx-info">
                    <div className="tx-category">
                      {t.categories?.name || '미분류'}
                    </div>
                    {t.memo && <div className="tx-memo">{t.memo}</div>}
                    <div className="tx-meta">{t.profiles?.name}</div>
                  </div>
                </div>
                <div className={'tx-amount ' + t.type}>
                  {t.type === 'income' ? '+' : '-'}
                  <Money amount={t.amount} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
