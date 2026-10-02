import { useSyncExternalStore } from 'react'
import {
  fixture as baseFixture,
  rows,
  categories,
  members,
} from './design-fixtures'
import { todayStr } from '../src/utils/format'
import { addDays } from '../src/utils/familyEvents'
const today = todayStr()
const listeners = new Set()
let version = 0
let transactions = [
  ...rows,
  {
    id: 'existing-gift',
    type: 'expense',
    amount: 100000,
    date: today,
    memo: '기존 축의금 송금',
    member_id: 'member-1',
    payment_method: '계좌이체',
    cash_asset_id: 'cash-1',
  },
]
function seed(id, title, kind, amount, days) {
  const date = addDays(today, days)
  const definition = {
    title,
    kind,
    annual: kind === 'birthday',
    calendar: 'solar',
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8)),
    feb29_policy: 'feb28',
  }
  return {
    id,
    event_id: `series-${id}`,
    family_id: 'family-1',
    occurrence_year: Number(date.slice(0, 4)),
    title,
    kind,
    event_date: date,
    spend_date: date,
    planned_amount: amount,
    status: 'pending',
    owner_id: null,
    memo: '',
    location: '',
    event_time: '',
    calendar_note: '양력 · 매년',
    family_events: {
      id: `series-${id}`,
      definition,
      version: 1,
      stopped_after: null,
    },
  }
}
let events = [
  seed('birthday', '민수 아버님 생신', 'birthday', 300000, 3),
  seed('wedding', '지연 결혼식', 'wedding', 100000, 7),
  seed('unknown', '수진 어머님 생신', 'birthday', null, 12),
  seed('overdue', '확인할 지난 행사', 'other', 50000, -2),
]
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const emit = () => {
  version++
  listeners.forEach((listener) => listener())
}
export function fixture(name, args) {
  useSyncExternalStore(subscribe, () => version)
  if (name === 'useFamilyEvents')
    return { events, loading: false, error: null, refresh: async () => emit() }
  if (name === 'useTransactions') {
    const range = args[1] || {}
    return {
      transactions: transactions.filter(
        (t) =>
          (!range.from || t.date >= range.from) &&
          (!range.to || t.date <= range.to),
      ),
      loading: false,
      error: null,
      refresh: async () => emit(),
    }
  }
  return baseFixture(name, args)
}
export async function call(name, args) {
  window.__calls ||= []
  window.__calls.push({ name, args })
  if (window.__failNext) {
    window.__failNext = false
    throw new Error('테스트 저장 실패. 입력값을 확인하고 다시 시도해주세요.')
  }
  const [event, patch] = args
  if (name === 'saveFamilyEvent') {
    const [id, definition, occurrences] = args
    events = [
      ...events.filter((e) => e.event_id !== id),
      ...occurrences.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        event_id: id,
        family_events: { id, definition, version: 1 },
      })),
    ]
  } else if (name === 'updateFamilyOccurrence') {
    events = events.map((e) =>
      e.id === event.id
        ? {
            ...e,
            ...patch,
            family_events: {
              ...e.family_events,
              version: e.family_events.version + 1,
            },
          }
        : e,
    )
  } else if (name === 'recordFamilyEventExpense') {
    transactions = [
      ...transactions,
      {
        ...patch,
        id: args[2],
        family_event_occurrence_id: event.id,
        categories: categories.find((c) => c.id === patch.category_id),
        profiles: members[0],
      },
    ]
  } else if (name === 'linkFamilyEventExpense') {
    transactions = transactions.map((t) =>
      t.id === patch
        ? { ...t, family_event_occurrence_id: args[2] ? null : event.id }
        : t,
    )
    if (args[2])
      events = events.map((e) =>
        e.id === event.id ? { ...e, status: 'pending' } : e,
      )
  } else if (name === 'stopFamilyEvent') {
    events = events.map((e) =>
      e.event_id === event.event_id
        ? {
            ...e,
            family_events: {
              ...e.family_events,
              stopped_after: event.occurrence_year,
            },
          }
        : e,
    )
  }
  events.sort((a, b) => a.event_date.localeCompare(b.event_date))
  emit()
}
