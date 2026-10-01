// Used only by the isolated Vite server in design-smoke.mjs, never by the app build.
const today = new Date()
const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const date = `${month}-${String(today.getDate()).padStart(2, '0')}`
const next = new Date(today.getFullYear(), today.getMonth() + 1, 15)
const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-15`
export const members = [
  { id: 'member-1', family_id: 'family-1', name: '지민', color: '#6485e5' },
  { id: 'member-2', family_id: 'family-1', name: '서준', color: '#9c84d3' },
]
export const categories = [
  { id: 'food', name: '식비', type: 'expense', icon: '🍽️', color: '#6c92e8' },
  { id: 'life', name: '생활', type: 'expense', icon: '🛍️', color: '#a08bd7' },
  { id: 'pay', name: '급여', type: 'income', icon: '💼', color: '#43a796' },
]
export const cards = [
  {
    id: 'card-1',
    owner_id: 'member-1',
    nickname: '우리 집 생활비',
    debit_day: 15,
    active: true,
  },
]
export const rows = [
  {
    id: 'tx1',
    type: 'expense',
    amount: 58000,
    category_id: 'food',
    memo: '가족과 함께한 저녁',
    member_id: 'member-1',
    date,
    payment_method: '신용카드',
    card_id: 'card-1',
    card_due_date: nextDate,
  },
  {
    id: 'tx2',
    type: 'expense',
    amount: 124000,
    category_id: 'life',
    memo: '한 주의 장보기',
    member_id: 'member-2',
    date,
    payment_method: '체크카드',
  },
  {
    id: 'tx3',
    type: 'expense',
    amount: 468000,
    category_id: 'life',
    memo: '우리 집 생활비',
    member_id: 'member-1',
    date: `${month}-01`,
    payment_method: '계좌이체',
  },
  {
    id: 'tx4',
    type: 'income',
    amount: 4200000,
    category_id: 'pay',
    memo: '이번 달 급여',
    member_id: 'member-1',
    date: `${month}-01`,
    payment_method: '계좌이체',
  },
].map((row) => ({
  ...row,
  categories: categories.find((c) => c.id === row.category_id),
  profiles: members.find((m) => m.id === row.member_id),
  created_at: `${row.date}T10:00:00`,
}))
export function fixture(name, args) {
  const empty = window.__scenario === 'empty'
  const base = {
    loading: window.__scenario === 'loading',
    error: '',
    refresh: async () => {},
  }
  if (name === 'useAuth')
    return {
      session:
        window.__authMode === 'login' ? null : { user: { id: 'member-1' } },
      profile: {
        ...members[0],
        family_id: window.__authMode === 'family' ? null : 'family-1',
      },
      family: { id: 'family-1', name: '우리의 작은 집', invite_code: 'FAMILY' },
      refreshProfile: async () => {},
      signOut: async () => {},
    }
  if (name === 'useTransactions') {
    const range = args[1] || {}
    let transactions = empty ? [] : rows
    if (window.__scenario === 'long')
      transactions = rows.map((r) => ({
        ...r,
        amount: 999999999999,
        memo: '아주 긴 이름의 거래 내역으로 작은 화면에서도 정보가 넘치지 않는지 확인합니다',
      }))
    return {
      ...base,
      transactions: transactions.filter(
        (r) =>
          (!range.from || r.date >= range.from) &&
          (!range.to || r.date <= range.to),
      ),
    }
  }
  if (name === 'useCategories') return { ...base, categories }
  if (name === 'useProfiles') return { ...base, members }
  if (name === 'useCreditCards') return { ...base, cards: empty ? [] : cards }
  if (name === 'useBudgets')
    return {
      ...base,
      budgets: empty
        ? []
        : [
            {
              category_id: 'food',
              limit_amount: window.__scenario === 'over' ? 100000 : 1200000,
            },
            {
              category_id: 'life',
              limit_amount: window.__scenario === 'over' ? 100000 : 800000,
            },
          ],
    }
  if (name === 'useCashSettings')
    return {
      ...base,
      cashSettings: empty
        ? null
        : { opening_date: `${month}-01`, opening_balance: 1500000 },
    }
  if (name === 'useCashAssets')
    return {
      ...base,
      assets: empty
        ? []
        : [{ id: 'cash-1', name: '생활비 통장', amount: 6250000 }],
      total: empty ? 0 : 6250000,
    }
  if (name === 'useStockHoldings')
    return {
      ...base,
      holdings: empty
        ? []
        : [
            {
              id: 'stock-1',
              symbol: '005930',
              market: 'KOSPI',
              quantity: 20,
              quote: {
                name: '삼성전자',
                market: 'KOSPI',
                closing_price: 78000,
                price_date: date,
              },
            },
          ],
      totalValue: empty ? 0 : 1560000,
      missingCount: 0,
      refreshingPrices: false,
    }
  if (name === 'useSavingsPlans')
    return {
      ...base,
      plans: empty
        ? []
        : [
            {
              id: 'plan-1',
              name: '다음 여행을 위한 적금',
              monthly_amount: 200000,
              debit_day: 1,
              start_month: `${today.getFullYear()}-01-01`,
              maturity_date: null,
              active: true,
            },
          ],
    }
  if (name === 'useLoans')
    return {
      ...base,
      loans: empty
        ? []
        : [
            {
              id: 'loan-1',
              name: '우리 집 대출',
              principal_amount: 10000000,
              loan_date: `${month}-01`,
              repayment_date: `${today.getFullYear() + 1}-12-31`,
              annual_interest_rate: 3.5,
              interest_day: 20,
              payment_method: '현금',
              active: true,
            },
          ],
    }
  throw new Error(`Unknown fixture ${name}`)
}
export async function call(name, args) {
  window.__calls ||= []
  window.__calls.push({ name, args })
  if (window.__failSave)
    throw new Error('테스트: 저장에 실패했어요. 다시 시도해주세요.')
  if (window.__slowSave)
    await new Promise((resolve) => setTimeout(resolve, 500))
  return {}
}
