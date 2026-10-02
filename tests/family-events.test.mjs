import test from 'node:test'
import assert from 'node:assert/strict'
import {
  occurrenceDate,
  buildOccurrences,
  eventAmounts,
  summarizeEvents,
  addDays,
} from '../src/utils/familyEvents.js'

const solar = {
  title: '아버님 생신',
  kind: 'birthday',
  calendar: 'solar',
  month: 10,
  day: 18,
  annual: true,
}
test('양력 반복은 해마다 금액과 완료 상태를 새로 준비한다', () => {
  const rows = buildOccurrences(solar, 2026, { planned_amount: 300000 })
  assert.equal(rows[0].event_date, '2026-10-18')
  assert.equal(rows[0].planned_amount, 300000)
  assert.equal(rows[1].event_date, '2027-10-18')
  assert.equal(rows[1].planned_amount, null)
  assert.equal(rows[1].status, 'pending')
})
test('한국 음력 변환과 윤달 없는 해의 선택을 반영한다', () => {
  const lunar = { ...solar, calendar: 'lunar', month: 1, day: 1 }
  assert.equal(occurrenceDate(lunar, 2026), '2026-02-17')
  assert.equal(occurrenceDate(lunar, 2027), '2027-02-07')
  assert.equal(
    occurrenceDate(
      { ...lunar, month: 5, leap_month: true, leap_policy: 'skip' },
      2017,
    ),
    '2017-06-24',
  )
  assert.equal(
    occurrenceDate(
      { ...lunar, month: 5, leap_month: true, leap_policy: 'skip' },
      2018,
    ),
    null,
  )
  assert.equal(
    occurrenceDate(
      { ...lunar, month: 5, leap_month: true, leap_policy: 'regular' },
      2018,
    ),
    occurrenceDate({ ...lunar, month: 5 }, 2018),
  )
  assert.throws(() => occurrenceDate(lunar, 2050), /2049/)
})
test('2월 29일과 음력 30일의 짧은 달을 처리한다', () => {
  assert.equal(
    occurrenceDate(
      { ...solar, month: 2, day: 29, feb29_policy: 'feb28' },
      2027,
    ),
    '2027-02-28',
  )
  assert.equal(
    occurrenceDate({ ...solar, month: 2, day: 29, feb29_policy: 'mar1' }, 2027),
    '2027-03-01',
  )
  assert.equal(
    occurrenceDate({ ...solar, month: 2, day: 29 }, 2028),
    '2028-02-29',
  )
  assert.throws(
    () => occurrenceDate({ ...solar, month: 4, day: 31 }, 2026),
    /존재하지/,
  )
  const lunar = { ...solar, calendar: 'lunar', month: 2, day: 30 }
  assert.match(occurrenceDate(lunar, 2026), /^2026-/)
})
test('부분 지급, 초과, 미정, 취소와 마무리를 구분한다', () => {
  const event = { id: 'a', planned_amount: 300000, status: 'pending' }
  const transactions = [
    { type: 'expense', family_event_occurrence_id: 'a', amount: 200000 },
  ]
  assert.equal(eventAmounts(event, transactions).remaining, 100000)
  assert.equal(
    eventAmounts({ ...event, status: 'complete' }, transactions).remaining,
    0,
  )
  assert.equal(
    eventAmounts({ ...event, status: 'cancelled' }, transactions).actual,
    200000,
  )
  assert.equal(
    eventAmounts({ ...event, planned_amount: null }, transactions).unknown,
    true,
  )
  assert.equal(eventAmounts({ ...event, planned_amount: 0 }, []).unknown, false)
  assert.equal(
    eventAmounts(event, [
      ...transactions,
      { ...transactions[0], amount: 120000 },
    ]).over,
    20000,
  )
})
test('행사월과 지급월이 달라도 예정액은 돈을 쓸 날짜에만 합산한다', () => {
  const events = [
    {
      id: 'a',
      status: 'pending',
      event_date: '2026-11-02',
      spend_date: '2026-10-30',
      planned_amount: 100000,
    },
    {
      id: 'b',
      status: 'pending',
      event_date: '2026-10-31',
      spend_date: '2026-10-31',
      planned_amount: null,
    },
  ]
  assert.deepEqual(summarizeEvents(events, [], '2026-10-01', '2026-10-31'), {
    remaining: 100000,
    unknown: 1,
  })
  assert.deepEqual(summarizeEvents(events, [], '2026-11-01', '2026-11-30'), {
    remaining: 0,
    unknown: 0,
  })
  assert.deepEqual(
    summarizeEvents(
      events,
      [{ type: 'expense', amount: 100000, family_event_occurrence_id: 'a' }],
      '2026-10-01',
      '2026-10-31',
    ),
    { remaining: 0, unknown: 1 },
  )
  assert.equal(addDays('2026-12-20', 29), '2027-01-18')
})
