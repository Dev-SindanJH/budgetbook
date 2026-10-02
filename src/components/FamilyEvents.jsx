import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import { useFamilyEvents } from '../hooks/useFamilyEvents'
import { useProfiles } from '../hooks/useProfiles'
import { useCategories } from '../hooks/useCategories'
import { useCreditCards } from '../hooks/useCreditCards'
import { useCashAssets } from '../hooks/useCashAssets'
import {
  todayStr,
  monthStr,
  monthRange,
  monthLabel,
  addMonths,
  formatKoreanWon,
} from '../utils/format'
import {
  addDays,
  daysUntil,
  eventAmounts,
  EVENT_KINDS,
  EVENT_STATUS,
  summarizeEvents,
} from '../utils/familyEvents'
import {
  updateFamilyOccurrence,
  stopFamilyEvent,
  recordFamilyEventExpense,
  linkFamilyEventExpense,
} from '../lib/api'
import FamilyEventForm from './FamilyEventForm'
import TransactionForm from './TransactionForm'
import DashboardCalendar from './DashboardCalendar'
import Modal from './Modal'
import Money from './Money'
import Icon from './Icon'

function EventRow({ event, transactions, today, onClick }) {
  const amounts = eventAmounts(event, transactions)
  const days = daysUntil(event.event_date, today)
  return (
    <button
      type="button"
      className={`family-event-row status-${event.status}`}
      onClick={() => onClick(event)}
    >
      <span className="event-date-tile">
        <strong>{Number(event.event_date.slice(8))}</strong>
        <small>{Number(event.event_date.slice(5, 7))}월</small>
      </span>
      <span className="event-row-info">
        <strong>{event.title}</strong>
        <small>
          {EVENT_KINDS[event.kind]} ·{' '}
          {days === 0 ? '오늘' : days > 0 ? `D-${days}` : `${-days}일 지남`}
          {event.status !== 'pending' ? ` · ${EVENT_STATUS[event.status]}` : ''}
        </small>
      </span>
      <span className="event-row-money">
        {event.status !== 'pending'
          ? EVENT_STATUS[event.status]
          : amounts.unknown
            ? '금액 미정'
            : event.planned_amount === 0
              ? '지출 없음'
              : `남은 예정 ${formatKoreanWon(amounts.remaining)}`}
      </span>
    </button>
  )
}

// Both home and the transaction calendar use the same data and editing flow.
export default function FamilyEvents({
  mode = 'calendar',
  transactions = [],
  transactionsError,
  transactionsLoading = false,
  calendarTransactions,
  onTransactionsChanged,
  month: fixedMonth,
}) {
  const { family } = useAuth()
  const { events, loading, error, refresh } = useFamilyEvents(family?.id)
  const { confirm, notify } = useUI()
  const [params, setParams] = useSearchParams()
  const [month, setMonth] = useState(monthStr())
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [editor, setEditor] = useState(null)
  const [operation, setOperation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const today = todayStr()
  const activeMonth = fixedMonth || month
  const selected = events.find((event) => event.id === selectedId)
  const monthly = events.filter((event) =>
    event.event_date.startsWith(activeMonth),
  )
  const upcoming = events.filter(
    (event) =>
      event.status !== 'cancelled' &&
      event.event_date >= today &&
      event.event_date <= addDays(today, 29),
  )
  const overdue = events.filter(
    (event) => event.status === 'pending' && event.event_date < today,
  )
  const range =
    mode === 'home'
      ? { from: today, to: addDays(today, 29) }
      : monthRange(activeMonth)
  const summary = summarizeEvents(events, transactions, range.from, range.to)
  const spendingElsewhere = events.filter(
    (event) =>
      event.spend_date >= range.from &&
      event.spend_date <= range.to &&
      (event.event_date < range.from || event.event_date > range.to) &&
      event.status === 'pending',
  )

  useEffect(() => {
    if (mode === 'home' || loading) return
    const target = events.find((event) => event.id === params.get('event'))
    if (target) {
      setSelectedId(target.id)
      setMonth(target.event_date.slice(0, 7))
    }
  }, [events, params, loading, mode])

  async function saved() {
    await Promise.all([refresh(), onTransactionsChanged?.()])
    notify('일정을 저장했어요')
  }
  function select(event) {
    setSelectedId(event.id)
    setActionError('')
    setSearch('')
    setOperation(null)
  }
  function closeDetail() {
    setSelectedId(null)
    setOperation(null)
    if (params.has('event')) {
      const next = new URLSearchParams(params)
      next.delete('event')
      setParams(next, { replace: true })
    }
  }
  async function run(action) {
    if (busy) return
    setBusy(true)
    setActionError('')
    try {
      await action()
      await saved()
      setOperation(null)
    } catch (err) {
      setActionError(err.message || '저장하지 못했어요. 다시 시도해주세요.')
    } finally {
      setBusy(false)
    }
  }
  function add(date = today) {
    setEditor({ date })
    closeDetail()
  }
  const linked = selected ? eventAmounts(selected, transactions) : null
  const available = transactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.family_event_occurrence_id &&
        !t.savings_plan_id &&
        !t.loan_id &&
        t.date <= today &&
        `${t.memo || ''} ${t.date} ${t.amount}`.includes(search),
    )
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <section className={`card family-events family-events-${mode}`}>
      <div className="section-heading">
        <h2>{mode === 'home' ? '앞으로 챙길 일' : '가족 캘린더'}</h2>
        {mode === 'home' ? (
          <Link to="/transactions?view=calendar">
            전체 보기 <span aria-hidden="true">›</span>
          </Link>
        ) : (
          !fixedMonth && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setMonth(monthStr())
                setFilter('all')
              }}
            >
              오늘
            </button>
          )
        )}
      </div>
      <p className="hint-text">
        가족 모두의 일정 · 예정 금액은 실제 지출과 별도로 관리해요.
      </p>
      {error || transactionsError ? (
        <div className="error-text" role="alert">
          일정과 연결된 지출을 불러오지 못했어요.{' '}
          <button className="btn btn-sm" onClick={saved}>
            다시 불러오기
          </button>
        </div>
      ) : loading || transactionsLoading ? (
        <p role="status">가족 일정을 불러오는 중…</p>
      ) : (
        <>
          {mode !== 'home' && (
            <>
              {!fixedMonth && (
                <div className="month-nav">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="이전 달"
                    onClick={() => setMonth(addMonths(month, -1))}
                  >
                    <Icon name="left" />
                  </button>
                  <strong>{monthLabel(activeMonth)}</strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="다음 달"
                    onClick={() => setMonth(addMonths(month, 1))}
                  >
                    <Icon name="right" />
                  </button>
                </div>
              )}
              <div className="event-toolbar">
                <div className="toggle-group">
                  {[
                    ['all', '전체'],
                    ['events', '일정'],
                    ['transactions', '거래'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`toggle-option${filter === key ? ' active' : ''}`}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    add(
                      `${activeMonth}-${today.startsWith(activeMonth) ? today.slice(8) : '01'}`,
                    )
                  }
                >
                  + 일정 추가
                </button>
              </div>
              <DashboardCalendar
                month={activeMonth}
                events={filter === 'transactions' ? [] : monthly}
                transactions={
                  filter === 'events'
                    ? []
                    : (calendarTransactions || transactions).filter((t) =>
                        t.date.startsWith(activeMonth),
                      )
                }
                onEventClick={select}
                onAddEvent={add}
              />
            </>
          )}
          {filter !== 'transactions' && (
            <>
              <div className="event-summary">
                <span>
                  {mode === 'home'
                    ? '앞으로 30일 준비할 돈'
                    : '이번 달 남은 예정액'}
                </span>
                <strong>
                  <Money amount={summary.remaining} />
                </strong>
                <small>금액 미정 {summary.unknown}건 · 돈을 쓸 날짜 기준</small>
              </div>
              {mode !== 'home' && (
                <h3 className="section-title">이번 달 일정</h3>
              )}
              {(mode === 'home' ? upcoming.slice(0, 3) : monthly).map(
                (event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    transactions={transactions}
                    today={today}
                    onClick={select}
                  />
                ),
              )}
              {(mode === 'home' ? upcoming : monthly).length === 0 && (
                <p className="empty-state">
                  {mode === 'home'
                    ? '부모님 생신이나 결혼식을 미리 적어두세요.'
                    : '이번 달에는 등록된 일정이 없어요.'}
                </p>
              )}
              {spendingElsewhere.length > 0 && (
                <details className="event-options">
                  <summary>
                    다른 기간 행사를 위해 준비할 돈 · {spendingElsewhere.length}
                    건
                  </summary>
                  {spendingElsewhere.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      transactions={transactions}
                      today={today}
                      onClick={select}
                    />
                  ))}
                </details>
              )}
              {overdue.length > 0 && (
                <details className="event-options overdue-events">
                  <summary>확인할 지난 일정 {overdue.length}건</summary>
                  {overdue.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      transactions={transactions}
                      today={today}
                      onClick={select}
                    />
                  ))}
                </details>
              )}
            </>
          )}
        </>
      )}
      {mode === 'home' && (
        <button
          type="button"
          className="btn event-home-add"
          onClick={() => add()}
        >
          + 일정 추가
        </button>
      )}
      {editor && (
        <EventFormWithMembers
          event={editor.event}
          defaultDate={editor.date}
          onSaved={saved}
          onClose={() => setEditor(null)}
        />
      )}
      {selected && !editor && operation?.type !== 'expense' && (
        <Modal
          title={selected.title}
          description={`${selected.event_date}${selected.event_time ? ` ${selected.event_time}` : ''} · ${EVENT_KINDS[selected.kind]}`}
          onClose={closeDetail}
          busy={busy}
          className="family-event-modal"
        >
          <p className="hint-text">
            {selected.calendar_note} · {EVENT_STATUS[selected.status]}
          </p>
          <EventOwner ownerId={selected.owner_id} />
          {selected.location && <p>{selected.location}</p>}
          {selected.memo && <p className="event-memo">{selected.memo}</p>}
          <div className="event-money-grid">
            <div>
              <small>예정 금액</small>
              <strong>
                {selected.planned_amount == null ? (
                  '미정'
                ) : (
                  <Money amount={selected.planned_amount} />
                )}
              </strong>
            </div>
            <div>
              <small>실제 지출</small>
              <strong>
                <Money amount={linked.actual} />
              </strong>
            </div>
            <div>
              <small>남은 예정액</small>
              <strong>
                {linked.unknown ? '미정' : <Money amount={linked.remaining} />}
              </strong>
            </div>
          </div>
          <p className="hint-text">
            돈을 쓸 날짜: {selected.spend_date}
            {linked.over > 0
              ? ` · 예정 대비 ${formatKoreanWon(linked.over)} 초과`
              : ''}
          </p>
          <div className="event-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setEditor({ event: structuredClone(selected) })}
            >
              일정 수정
            </button>
            {selected.status === 'pending' ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    setOperation({
                      type: 'expense',
                      event: structuredClone(selected),
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  이 일정에 지출 기록
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setOperation({ type: 'link' })}
                >
                  기존 지출 연결
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        '더 준비할 돈이 없으면 남은 예정액을 0원으로 정리해요. 실제 지출은 그대로 유지돼요.',
                        {
                          title: '지출을 마무리할까요?',
                          confirmLabel: '마무리',
                          danger: false,
                        },
                      )
                    )
                      run(() =>
                        updateFamilyOccurrence(selected, {
                          status: 'complete',
                        }),
                      )
                  }}
                >
                  지출 마무리
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        '이번 일정의 예정액을 제외해요. 이미 기록한 실제 지출은 남아요.',
                        {
                          title: '이번 일정을 취소할까요?',
                          confirmLabel: '일정 취소',
                          danger: false,
                        },
                      )
                    )
                      run(() =>
                        updateFamilyOccurrence(selected, {
                          status: 'cancelled',
                        }),
                      )
                  }}
                >
                  이번 일정 취소
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    updateFamilyOccurrence(selected, { status: 'pending' }),
                  )
                }
              >
                다시 준비하기
              </button>
            )}
            {selected.family_events.definition.annual &&
              selected.family_events.stopped_after == null && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        '이번 일정은 남기고 다음 해부터 반복을 중지해요. 지출이 연결된 일정과 지난 기록은 유지돼요.',
                        {
                          title: '이후 반복을 중지할까요?',
                          confirmLabel: '반복 중지',
                          danger: false,
                        },
                      )
                    )
                      run(() => stopFamilyEvent(selected))
                  }}
                >
                  이후 반복 중지
                </button>
              )}
          </div>
          {operation?.type === 'link' && (
            <div className="event-link-picker">
              <div className="field">
                <label htmlFor="event-transaction-search">
                  연결할 지출 검색
                </label>
                <input
                  id="event-transaction-search"
                  value={search}
                  placeholder="메모·날짜·금액"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <p className="hint-text">
                다른 일정에 연결하지 않은 실제 지출만 표시해요.
              </p>
              {available.length === 0 ? (
                <p>연결할 지출이 없어요.</p>
              ) : (
                available.slice(0, 50).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="calendar-event-detail"
                    disabled={busy}
                    onClick={() =>
                      run(() => linkFamilyEventExpense(selected, t.id))
                    }
                  >
                    <span>
                      {t.date} · {t.memo || t.categories?.name || '지출'}
                    </span>
                    <Money amount={t.amount} />
                  </button>
                ))
              )}
              {available.length > 50 && (
                <p className="hint-text">
                  최근 50건을 보여줘요. 검색으로 범위를 좁혀주세요.
                </p>
              )}
            </div>
          )}
          <h3 className="section-title">
            연결된 실제 지출 {linked.linked.length}건
          </h3>
          {linked.linked.map((t) => (
            <div key={t.id} className="event-linked-row">
              <span>
                {t.date} · {t.memo || t.categories?.name || '지출'}
                <strong>
                  <Money amount={t.amount} />
                </strong>
              </span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm(
                      '실제 거래는 그대로 두고 일정과의 연결만 해제해요. 마무리한 지출은 다시 확인할 상태가 돼요.',
                      {
                        title: '지출 연결을 해제할까요?',
                        confirmLabel: '연결 해제',
                        danger: false,
                      },
                    )
                  )
                    run(() => linkFamilyEventExpense(selected, t.id, true))
                }}
              >
                연결 해제
              </button>
            </div>
          ))}
          {actionError && (
            <p role="alert" className="error-text">
              {actionError}
            </p>
          )}
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={async () => {
              await saved()
              setActionError('')
            }}
          >
            최신 상태 불러오기
          </button>
        </Modal>
      )}
      {operation?.type === 'expense' && (
        <EventExpenseForm
          event={operation.event}
          requestId={operation.requestId}
          transactions={transactions}
          onSaved={saved}
          onClose={() => setOperation(null)}
        />
      )}
    </section>
  )
}

function EventFormWithMembers(props) {
  const { family } = useAuth()
  const { members } = useProfiles(family?.id)
  return <FamilyEventForm {...props} members={members} />
}
function EventOwner({ ownerId }) {
  const { family } = useAuth()
  const { members } = useProfiles(family?.id)
  return (
    <p className="hint-text">
      담당: {members.find((m) => m.id === ownerId)?.name || '함께 챙기기'}
    </p>
  )
}
function EventExpenseForm({
  event,
  requestId,
  transactions,
  onSaved,
  onClose,
}) {
  const { family, profile } = useAuth()
  const { members } = useProfiles(family?.id)
  const { categories } = useCategories(family?.id)
  const { cards } = useCreditCards(family?.id)
  const { assets } = useCashAssets(family?.id)
  const amount = eventAmounts(event, transactions).remaining
  return (
    <TransactionForm
      categories={categories}
      members={members}
      cards={cards}
      cashAssets={assets}
      currentMemberId={profile?.id}
      expenseOnly
      defaults={{ amount, date: todayStr(), memo: event.title }}
      onClose={onClose}
      onSubmit={async (payload) => {
        await recordFamilyEventExpense(event, payload, requestId)
        await onSaved()
      }}
    />
  )
}
