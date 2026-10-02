import { useRef, useState } from 'react'
import Modal from './Modal'
import MoneyInput from './MoneyInput'
import { todayStr } from '../utils/format'
import {
  buildOccurrences,
  calendarLabel,
  EVENT_KINDS,
  occurrenceDate,
} from '../utils/familyEvents'
import { saveFamilyEvent, updateFamilyOccurrence } from '../lib/api'

export default function FamilyEventForm({
  event,
  members,
  defaultDate = todayStr(),
  onSaved,
  onClose,
}) {
  const template = event?.family_events?.definition
  const [scope, setScope] = useState(event ? 'single' : 'future')
  const [kind, setKind] = useState(event?.kind || 'birthday')
  const [title, setTitle] = useState(event?.title || '')
  const [calendar, setCalendar] = useState(template?.calendar || 'solar')
  const [annual, setAnnual] = useState(template?.annual ?? true)
  const [year, setYear] = useState(
    event?.occurrence_year || Number(defaultDate.slice(0, 4)),
  )
  const [month, setMonth] = useState(
    template?.month || Number(defaultDate.slice(5, 7)),
  )
  const [day, setDay] = useState(template?.day || Number(defaultDate.slice(8)))
  const [leap, setLeap] = useState(template?.leap_month || false)
  const [leapPolicy, setLeapPolicy] = useState(
    template?.leap_policy || 'regular',
  )
  const [febPolicy, setFebPolicy] = useState(template?.feb29_policy || 'feb28')
  const [eventDate, setEventDate] = useState(event?.event_date || '')
  const [spendDate, setSpendDate] = useState(
    event && event.spend_date !== event.event_date ? event.spend_date : '',
  )
  const [amountMode, setAmountMode] = useState(
    event?.planned_amount == null
      ? 'unknown'
      : Number(event.planned_amount) === 0
        ? 'none'
        : 'amount',
  )
  const [amount, setAmount] = useState(
    event?.planned_amount == null ? '' : String(event.planned_amount),
  )
  const [owner, setOwner] = useState(event?.owner_id || '')
  const [memo, setMemo] = useState(event?.memo || '')
  const [location, setLocation] = useState(event?.location || '')
  const [time, setTime] = useState(event?.event_time || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef(event?.event_id || crypto.randomUUID())
  const originalVersion = useRef(event?.family_events?.version ?? null)
  const definition = {
    title: title.trim(),
    kind,
    calendar,
    annual,
    month: Number(month),
    day: Number(day),
    leap_month: calendar === 'lunar' && leap,
    leap_policy: leapPolicy,
    feb29_policy: febPolicy,
    owner_id: owner || null,
    memo,
    location,
    event_time: time,
  }
  let preview = null,
    dateError = ''
  try {
    preview = occurrenceDate(definition, Number(year))
  } catch (err) {
    dateError = err.message
  }
  const single = event && scope === 'single'

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (!title.trim()) throw new Error('일정 이름을 입력해주세요.')
      const planned =
        amountMode === 'unknown'
          ? null
          : amountMode === 'none'
            ? 0
            : Number(amount)
      if (
        amountMode === 'amount' &&
        (!Number.isSafeInteger(planned) || planned <= 0 || amount === '')
      )
        throw new Error('준비할 금액을 입력해주세요.')
      const actualDate = single ? eventDate : eventDate || preview
      if (!single && dateError) throw new Error(dateError)
      if (event && !single && !preview)
        throw new Error(
          '올해 없는 윤달로 바꾸려면 이번 일정을 취소하고 새 반복 일정을 등록해주세요.',
        )
      if (!actualDate && (planned != null || spendDate))
        throw new Error(
          '선택한 해에 윤달 생신이 없어요. 시작 연도를 변경해주세요.',
        )
      const fields = {
        title: title.trim(),
        planned_amount: planned,
        owner_id: owner || null,
        memo,
        location,
        event_time: time,
        ...(actualDate
          ? { event_date: actualDate, spend_date: spendDate || actualDate }
          : {}),
      }
      if (single) {
        await updateFamilyOccurrence(
          {
            ...event,
            family_events: {
              ...event.family_events,
              version: originalVersion.current,
            },
          },
          fields,
        )
      } else {
        const rows = buildOccurrences(definition, Number(year), fields).map(
          (row) => ({ ...row, calendar_note: calendarLabel(definition) }),
        )
        await saveFamilyEvent(
          requestId.current,
          definition,
          rows,
          Number(year),
          originalVersion.current,
        )
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || '일정을 저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={event ? '가족 일정 수정' : '가족 일정 추가'}
      description="챙길 날짜와 준비할 돈을 함께 기억해요."
      onClose={onClose}
      busy={busy}
      className="family-event-modal"
    >
      <form onSubmit={submit}>
        {event && template?.annual && (
          <div className="field">
            <label htmlFor="event-scope">수정 범위</label>
            <select
              id="event-scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value)
                setEventDate(
                  e.target.value === 'single' ? event.event_date : '',
                )
              }}
            >
              <option value="single">이번 일정만</option>
              {event.occurrence_year >= Number(todayStr().slice(0, 4)) && (
                <option value="future">이번부터 이후 일정</option>
              )}
            </select>
          </div>
        )}
        <div className="event-form-grid">
          <div className="field">
            <label htmlFor="event-kind">종류</label>
            <select
              id="event-kind"
              value={kind}
              disabled={Boolean(event)}
              onChange={(e) => {
                setKind(e.target.value)
                setAnnual(e.target.value === 'birthday')
                setEventDate('')
                if (e.target.value === 'wedding') setAmountMode('amount')
                if (e.target.value !== 'birthday') setCalendar('solar')
              }}
            >
              {Object.entries(EVENT_KINDS).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="event-title">일정 이름</label>
            <input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={
                kind === 'birthday' ? '예: 민수 아버님 생신' : '예: 지연 결혼식'
              }
              required
              data-autofocus
            />
          </div>
        </div>
        {!single && kind !== 'wedding' && (
          <>
            <div className="event-form-grid">
              <div className="field">
                <label htmlFor="event-calendar">날짜 기준</label>
                <select
                  id="event-calendar"
                  value={calendar}
                  onChange={(e) => setCalendar(e.target.value)}
                >
                  <option value="solar">양력</option>
                  <option value="lunar">음력</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="event-repeat">반복</label>
                <select
                  id="event-repeat"
                  value={annual ? 'yearly' : 'once'}
                  onChange={(e) => setAnnual(e.target.value === 'yearly')}
                >
                  <option value="once">반복 없음</option>
                  <option value="yearly">매년</option>
                </select>
              </div>
            </div>
            <div className="event-date-fields">
              <div className="field">
                <label htmlFor="event-year">
                  {annual ? '시작 연도' : '연도'}
                </label>
                <input
                  id="event-year"
                  type="number"
                  min="1900"
                  max={calendar === 'lunar' ? 2049 : 2100}
                  value={year}
                  disabled={Boolean(event)}
                  onChange={(e) => setYear(Number(e.target.value))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="event-month">월</label>
                <input
                  id="event-month"
                  type="number"
                  min="1"
                  max="12"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="event-day">일</label>
                <input
                  id="event-day"
                  type="number"
                  min="1"
                  max={calendar === 'lunar' ? 30 : 31}
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  required
                />
              </div>
            </div>
            {calendar === 'lunar' && (
              <>
                <div className="field">
                  <label htmlFor="event-leap">평달·윤달</label>
                  <select
                    id="event-leap"
                    value={leap ? 'leap' : 'regular'}
                    onChange={(e) => setLeap(e.target.value === 'leap')}
                  >
                    <option value="regular">평달</option>
                    <option value="leap">윤달</option>
                  </select>
                </div>
                {leap && (
                  <div className="field">
                    <label htmlFor="event-leap-policy">
                      윤달이 없는 해에는
                    </label>
                    <select
                      id="event-leap-policy"
                      value={leapPolicy}
                      onChange={(e) => setLeapPolicy(e.target.value)}
                    >
                      <option value="regular">같은 월의 평달에 챙기기</option>
                      <option value="skip">그 해는 건너뛰기</option>
                    </select>
                  </div>
                )}
                <p className="hint-text">
                  음력은 2049년까지 지원해요. 음력 30일이 없는 해에는 해당 월의
                  마지막 날에 표시해요.
                </p>
              </>
            )}
            {calendar === 'solar' &&
              Number(month) === 2 &&
              Number(day) === 29 && (
                <div className="field">
                  <label htmlFor="event-feb-policy">평년의 생신</label>
                  <select
                    id="event-feb-policy"
                    value={febPolicy}
                    onChange={(e) => setFebPolicy(e.target.value)}
                  >
                    <option value="feb28">2월 28일</option>
                    <option value="mar1">3월 1일</option>
                  </select>
                </div>
              )}
            <p className="event-date-preview" role="status">
              {dateError ||
                (preview
                  ? `${year}년 양력 날짜: ${preview}`
                  : '선택한 해에는 윤달이 없어 건너뛰어요.')}
            </p>
            {annual && calendar === 'solar' && (
              <p className="hint-text">양력 반복 일정은 2100년까지 표시해요.</p>
            )}
            {event && (
              <p className="hint-text">
                이후 일정의 기본 날짜와 이름을 바꿔요. 별도로 수정했거나 지출을
                연결한 이후 일정은 유지해요. 예정 금액은 이번 일정에만 적용해요.
              </p>
            )}
          </>
        )}
        <div className="event-form-grid">
          <div className="field">
            <label htmlFor="event-date">
              {single
                ? '이번에 챙길 날짜'
                : kind === 'wedding'
                  ? '행사일'
                  : '이번에 챙길 날짜 변경 (선택)'}
            </label>
            <input
              id="event-date"
              type="date"
              value={!single && kind === 'wedding' ? preview || '' : eventDate}
              onChange={(e) => {
                if (!single && kind === 'wedding') {
                  const [y, m, d] = e.target.value.split('-').map(Number)
                  setYear(y)
                  setMonth(m)
                  setDay(d)
                } else setEventDate(e.target.value)
              }}
              min="1900-01-01"
              max="2100-12-31"
              required={Boolean(single) || kind === 'wedding'}
            />
          </div>
          <div className="field">
            <label htmlFor="event-spend-date">돈을 쓸 날짜 (선택)</label>
            <input
              id="event-spend-date"
              type="date"
              value={spendDate}
              onChange={(e) => setSpendDate(e.target.value)}
            />
            <span className="hint-text">비워두면 챙길 날짜와 같아요.</span>
          </div>
        </div>
        <div className="event-budget-field">
          <div className="field">
            <label htmlFor="event-amount-mode">
              {kind === 'wedding' ? '예정 축의금' : '준비할 돈'}
            </label>
            <select
              id="event-amount-mode"
              value={amountMode}
              onChange={(e) => setAmountMode(e.target.value)}
            >
              <option value="unknown">아직 미정</option>
              <option value="amount">금액 입력</option>
              <option value="none">지출 없음</option>
            </select>
          </div>
          {amountMode === 'amount' && (
            <div className="field">
              <label htmlFor="event-amount">예정 금액 (원)</label>
              <MoneyInput
                id="event-amount"
                value={amount}
                onValueChange={setAmount}
                min={1}
                required
              />
            </div>
          )}
          <p className="hint-text">
            일정을 저장해도 실제 지출이나 현금 잔액은 바뀌지 않아요.
          </p>
        </div>
        <details className="event-options" open={Boolean(event)}>
          <summary>담당자·시간·장소·메모</summary>
          <div className="event-form-grid">
            <div className="field">
              <label htmlFor="event-owner">담당자</label>
              <select
                id="event-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">함께 챙기기</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="event-time">시간</label>
              <input
                id="event-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="event-location">장소</label>
            <input
              id="event-location"
              maxLength={200}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="event-memo">메모</label>
            <textarea
              id="event-memo"
              maxLength={2000}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </details>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="transaction-form-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '저장 중…' : '일정 저장'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
