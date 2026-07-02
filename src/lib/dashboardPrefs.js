export const DASHBOARD_PANELS = [
  { key: 'budget', label: '전체 예산' },
  { key: 'cardDue', label: '카드 결제 예정' },
  { key: 'calendar', label: '달력' },
  { key: 'categoryDonut', label: '카테고리별 지출 비중' },
  { key: 'memberSummary', label: '가족 구성원별 지출' },
  { key: 'recent', label: '최근 거래' },
]

const STORAGE_KEY = 'budgetbook_dashboard_prefs'

const DEFAULTS = Object.fromEntries(DASHBOARD_PANELS.map((p) => [p.key, true]))

export function getDashboardPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setDashboardPrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}
