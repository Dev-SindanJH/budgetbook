import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useTransactions } from '../hooks/useTransactions'
import { useBudgets } from '../hooks/useBudgets'
import { useCashSettings } from '../hooks/useCashSettings'
import { useCashAssets } from '../hooks/useCashAssets'
import { useSavingsPlans } from '../hooks/useSavingsPlans'
import { useLoans } from '../hooks/useLoans'
import { useStockHoldings } from '../hooks/useStockHoldings'
import { upsertBudget, saveCashSettings, saveCashAsset, deleteCashAsset, addSavingsPlan, updateSavingsPlan, addLoan, updateLoan, saveStockHolding, deleteStockHolding } from '../lib/api'
import { formatWon, monthStr, monthRange, monthLabel, addMonths, todayStr } from '../utils/format'
import { recordedCashBalance } from '../utils/creditCards'
import { savingsAmounts } from '../utils/savings'
import BudgetProgressBar from '../components/BudgetProgressBar'
import ColoringGrid from '../components/ColoringGrid'

export default function Budget() {
  const { family, profile } = useAuth()
  const [month, setMonth] = useState(monthStr())
  const { from, to } = monthRange(month)

  const { categories } = useCategories(family?.id)
  const { transactions: monthTransactions } = useTransactions(family?.id, { from, to })
  const transactions = useMemo(() => monthTransactions.filter((t) => ((!t.savings_plan_id && !t.loan_id) || t.date <= todayStr())), [monthTransactions])
  const { transactions: allTransactions, refresh: refreshTransactions } = useTransactions(family?.id)
  const { budgets, refresh } = useBudgets(family?.id, month)
  const { cashSettings, refresh: refreshCashSettings } = useCashSettings(family?.id)
  const { assets: cashAssets, total: cashAssetTotal, refresh: refreshCashAssets, error: cashAssetsError } = useCashAssets(family?.id)
  const { plans, error: plansError, refresh: refreshPlans } = useSavingsPlans(family?.id)
  const { loans, error: loansError, refresh: refreshLoans } = useLoans(family?.id)
  const { holdings, error: stocksError, quoteError, refreshingPrices, totalValue: stockValue, missingCount, refresh: refreshStocks } = useStockHoldings(family?.id)

  const [openingDate, setOpeningDate] = useState(todayStr())
  const [openingBalance, setOpeningBalance] = useState('')
  const [cashMessage, setCashMessage] = useState('')
  const [savingCash, setSavingCash] = useState(false)
  const [cashAssetName, setCashAssetName] = useState('')
  const [cashAssetAmount, setCashAssetAmount] = useState('')
  const [editingCashAssetId, setEditingCashAssetId] = useState(null)
  const [cashAssetMessage, setCashAssetMessage] = useState('')
  const [savingCashAsset, setSavingCashAsset] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planAmount, setPlanAmount] = useState('')
  const [planDay, setPlanDay] = useState('1')
  const [planStartMonth, setPlanStartMonth] = useState(monthStr())
  const [planMaturity, setPlanMaturity] = useState('')
  const [planMessage, setPlanMessage] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [loanName, setLoanName] = useState('')
  const [loanDate, setLoanDate] = useState(todayStr())
  const [loanRepaymentDate, setLoanRepaymentDate] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [loanRate, setLoanRate] = useState('')
  const [loanDay, setLoanDay] = useState('1')
  const [loanMethod, setLoanMethod] = useState('현금')
  const [loanMessage, setLoanMessage] = useState('')
  const [savingLoan, setSavingLoan] = useState(false)
  const [stockSymbol, setStockSymbol] = useState('')
  const [stockMarket, setStockMarket] = useState('KOSPI')
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockMessage, setStockMessage] = useState('')
  const [savingStock, setSavingStock] = useState(false)

  useEffect(() => {
    if (cashSettings) {
      setOpeningDate(cashSettings.opening_date)
      setOpeningBalance(String(cashSettings.opening_balance))
    }
  }, [cashSettings])

  const currentCash = recordedCashBalance(allTransactions, cashSettings, todayStr())

  async function handleSaveCashAsset(e) {
    e.preventDefault()
    const amount = Number(cashAssetAmount)
    if (!cashAssetName.trim() || !Number.isFinite(amount) || amount < 0) {
      setCashAssetMessage('보유처 이름과 0원 이상의 금액을 입력해주세요')
      return
    }
    setSavingCashAsset(true)
    setCashAssetMessage('')
    try {
      await saveCashAsset({ id: editingCashAssetId, family_id: family.id, name: cashAssetName.trim(), amount })
      await refreshCashAssets()
      setCashAssetName('')
      setCashAssetAmount('')
      setEditingCashAssetId(null)
      setCashAssetMessage('현금 항목을 저장했어요')
    } catch (err) {
      setCashAssetMessage(err.message || '현금 항목을 저장하지 못했어요. 데이터베이스 마이그레이션을 확인해주세요.')
    } finally { setSavingCashAsset(false) }
  }

  async function handleDeleteCashAsset(asset) {
    if (!window.confirm(`'${asset.name}' 항목을 삭제할까요?`)) return
    try { await deleteCashAsset(asset.id); await refreshCashAssets(); setCashAssetMessage('현금 항목을 삭제했어요') }
    catch (err) { setCashAssetMessage(err.message || '현금 항목을 삭제하지 못했어요') }
  }

  async function handleSaveCash(e) {
    e.preventDefault()
    const amount = Number(openingBalance)
    if (!openingDate || openingDate > todayStr() || openingBalance === '' || !Number.isFinite(amount) || amount < 0) {
      setCashMessage('오늘 또는 이전의 기준일과 0원 이상의 보유 현금을 입력해주세요')
      return
    }
    setSavingCash(true)
    setCashMessage('')
    try {
      await saveCashSettings({ family_id: family.id, opening_date: openingDate, opening_balance: amount })
      await refreshCashSettings()
      setCashMessage('보유 현금 기준값을 저장했어요')
    } catch (err) {
      setCashMessage(err.message || '보유 현금을 저장하지 못했어요')
    } finally {
      setSavingCash(false)
    }
  }

  async function handleAddPlan(e) {
    e.preventDefault()
    const amount = Number(planAmount)
    const day = Number(planDay)
    if (!planName.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(day) || day < 1 || day > 31 || !planStartMonth || !planMaturity || planMaturity < `${planStartMonth}-01`) {
      setPlanMessage('적금 이름, 월 납입액, 납입일, 첫 납입월과 만기를 확인해주세요')
      return
    }
    setSavingPlan(true)
    setPlanMessage('')
    try {
      await addSavingsPlan({ family_id: family.id, member_id: profile.id, name: planName.trim(), monthly_amount: amount, debit_day: day, start_month: `${planStartMonth}-01`, maturity_date: planMaturity })
      await Promise.all([refreshPlans(), refreshTransactions()])
      setPlanName('')
      setPlanAmount('')
      setPlanMessage('적금과 납입 예정 지출을 등록했어요')
    } catch (err) {
      setPlanMessage(err.message || '적금을 등록하지 못했어요. 데이터베이스 마이그레이션을 확인해주세요.')
    } finally {
      setSavingPlan(false)
    }
  }

  async function handleTogglePlan(plan) {
    try {
      await updateSavingsPlan(plan.id, { active: !plan.active })
      await Promise.all([refreshPlans(), refreshTransactions()])
      setPlanMessage(plan.active ? '앞으로 예정된 납입을 중지했어요' : '납입 일정을 다시 등록했어요')
    } catch (err) {
      setPlanMessage(err.message || '적금 상태를 변경하지 못했어요')
    }
  }

  async function handleAddLoan(e) {
    e.preventDefault()
    const amount = Number(loanAmount)
    const rate = Number(loanRate)
    const day = Number(loanDay)
    if (!loanName.trim() || !loanDate || !loanRepaymentDate || loanRepaymentDate < loanDate || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(day) || day < 1 || day > 31) {
      setLoanMessage('대출 이름, 대출일, 상환일, 대출금액, 연이율과 이자 납입일을 확인해주세요')
      return
    }
    setSavingLoan(true)
    setLoanMessage('')
    try {
      await addLoan({ family_id: family.id, member_id: profile.id, name: loanName.trim(), loan_date: loanDate, repayment_date: loanRepaymentDate, principal_amount: amount, annual_interest_rate: rate, interest_day: day, payment_method: loanMethod })
      await Promise.all([refreshLoans(), refreshTransactions()])
      setLoanName('')
      setLoanAmount('')
      setLoanRate('')
      setLoanMessage('대출과 월 이자 지출을 등록했어요')
    } catch (err) {
      setLoanMessage(err.message || '대출을 등록하지 못했어요. 데이터베이스 마이그레이션을 확인해주세요.')
    } finally {
      setSavingLoan(false)
    }
  }

  async function handleToggleLoan(loan) {
    try {
      await updateLoan(loan.id, { active: !loan.active })
      await Promise.all([refreshLoans(), refreshTransactions()])
      setLoanMessage(loan.active ? '앞으로 예정된 이자 지출을 중지했어요' : '이자 납입 일정을 다시 등록했어요')
    } catch (err) {
      setLoanMessage(err.message || '대출 상태를 변경하지 못했어요')
    }
  }

  async function handleSaveStock(e) {
    e.preventDefault()
    const symbol = stockSymbol.trim()
    const quantity = Number(stockQuantity)
    if (!/^\d{6}$/.test(symbol) || !Number.isSafeInteger(quantity) || quantity <= 0) {
      setStockMessage('6자리 종목코드와 1주 이상의 보유 수량을 입력해주세요')
      return
    }
    setSavingStock(true)
    setStockMessage('')
    try {
      await saveStockHolding({ familyId: family.id, symbol, market: stockMarket, quantity })
      await refreshStocks()
      setStockSymbol('')
      setStockQuantity('')
      setStockMessage('보유 수량을 저장했어요')
    } catch (err) {
      setStockMessage(err.message || '보유 주식을 저장하지 못했어요')
    } finally {
      setSavingStock(false)
    }
  }

  async function handleDeleteStock(stock) {
    if (!window.confirm(`${stock.quote?.name || stock.symbol} 보유 내역을 삭제할까요?`)) return
    try {
      await deleteStockHolding(stock.id)
      await refreshStocks({ updatePrices: false })
      setStockMessage('보유 내역을 삭제했어요')
    } catch (err) {
      setStockMessage(err.message || '보유 내역을 삭제하지 못했어요')
    }
  }

  const [drafts, setDrafts] = useState({})
  const [savingKey, setSavingKey] = useState(null)

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  const spentByCategory = useMemo(() => {
    const map = {}
    let total = 0
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      total += Number(t.amount)
      if (!t.category_id) continue
      map[t.category_id] = (map[t.category_id] || 0) + Number(t.amount)
    }
    return { map, total }
  }, [transactions])

  const categoryBudgetTotal = budgets.filter((b) => b.category_id).reduce((sum, b) => sum + Number(b.limit_amount), 0)
  const categoryBudget = (categoryId) => budgets.find((b) => b.category_id === categoryId)

  const expenseTransactions = useMemo(() => transactions.filter((t) => t.type === 'expense'), [transactions])

  function draftValue(key, fallback) {
    return drafts[key] !== undefined ? drafts[key] : fallback ?? ''
  }

  async function handleSave(categoryId, key) {
    const raw = drafts[key]
    const amount = Number(raw)
    if (!raw || amount < 0) return
    setSavingKey(key)
    try {
      await upsertBudget({ familyId: family.id, categoryId, month, limitAmount: amount })
      await refresh()
    } finally {
      setSavingKey(null)
    }
  }

  const overRows = expenseCategories
    .map((c) => {
      const b = categoryBudget(c.id)
      const spent = spentByCategory.map[c.id] || 0
      return { c, limit: b ? Number(b.limit_amount) : 0, spent }
    })
    .filter((r) => r.limit > 0 && r.spent > r.limit)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">자산 관리</h1>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
            ← 이전 달
          </button>
          <span className="hint-text" style={{ alignSelf: 'center' }}>{monthLabel(month)}</span>
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>
            다음 달 →
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">보유 현금 항목</div>
        <div className="summary-value" style={{ marginBottom: 8 }}>{formatWon(cashAssetTotal)}</div>
        <div className="hint-text" style={{ marginBottom: 12 }}>전세금, 통장 잔액처럼 보유 현금을 항목별로 등록해요. 홈에는 항목의 합계가 표시돼요.</div>
        {cashAssetsError && <div className="error-text">현금 항목을 불러오지 못했어요. 데이터베이스 마이그레이션을 확인해주세요.</div>}
        {cashAssets.map((asset) => <div className="settings-list-item" key={asset.id}>
          <div><strong>{asset.name}</strong><div className="hint-text">{formatWon(asset.amount)}</div></div>
          <div className="stock-holding-actions">
            <button type="button" className="btn btn-sm" onClick={() => { setEditingCashAssetId(asset.id); setCashAssetName(asset.name); setCashAssetAmount(String(asset.amount)); setCashAssetMessage('') }}>수정</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteCashAsset(asset)}>삭제</button>
          </div>
        </div>)}
        {cashAssets.length === 0 && <div className="empty-state" style={{ marginBottom: 12 }}>등록된 현금 항목이 없어요</div>}
        <form className="credit-card-form" onSubmit={handleSaveCashAsset}>
          <div className="field"><label htmlFor="cash-asset-name">보유처</label><input id="cash-asset-name" value={cashAssetName} onChange={(e) => setCashAssetName(e.target.value)} placeholder="예: 전세금, 농협통장" maxLength={60} required /></div>
          <div className="field"><label htmlFor="cash-asset-amount">금액 (원)</label><input id="cash-asset-amount" type="number" min="0" value={cashAssetAmount} onChange={(e) => setCashAssetAmount(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={savingCashAsset}>{savingCashAsset ? '저장 중...' : editingCashAssetId ? '항목 수정' : '항목 추가'}</button>
          {editingCashAssetId && <button className="btn" type="button" onClick={() => { setEditingCashAssetId(null); setCashAssetName(''); setCashAssetAmount('') }}>취소</button>}
        </form>
        {cashAssetMessage && <div className="hint-text" role="status">{cashAssetMessage}</div>}
      </div>

      <div className="card">
        <div className="section-title">거래 기준 현금 잔액</div>
        <div className="summary-value" style={{ marginBottom: 8 }}>{currentCash === null ? '기준 금액을 입력해주세요' : formatWon(currentCash)}</div>
        <div className="hint-text" style={{ marginBottom: 12 }}>기준일 아침의 현금을 입력하면 이후 수입, 현금 지출, 적금 납입, 신용카드 자동이체를 날짜에 맞춰 더하고 빼요.</div>
        <form className="credit-card-form" onSubmit={handleSaveCash}>
          <div className="field"><label htmlFor="asset-opening-date">기준일</label><input id="asset-opening-date" type="date" max={todayStr()} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} required /></div>
          <div className="field"><label htmlFor="asset-opening-balance">그날 아침 보유 현금</label><input id="asset-opening-balance" type="number" min="0" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={savingCash}>{savingCash ? '저장 중...' : '현금 저장'}</button>
        </form>
        {cashMessage && <div className="hint-text" role="status">{cashMessage}</div>}
      </div>

      <div className="card">
        <div className="section-title">보유 주식 잔액</div>
        <div className="summary-value" style={{ marginBottom: 8 }}>{holdings.length === 0 ? formatWon(0) : missingCount === holdings.length ? '시세 조회 전' : formatWon(stockValue)}</div>
        <div className="hint-text" style={{ marginBottom: 12 }}>KRX의 최근 제공 종가 × 보유 수량으로 평가해요. 현금 잔액에는 합산하지 않아요.</div>
        {missingCount > 0 && <div className="hint-text" style={{ marginBottom: 12 }}>시세가 없는 {missingCount}종목은 표시 금액에서 제외했어요.</div>}
        {stocksError && <div className="error-text">보유 주식을 불러오지 못했어요: {stocksError}</div>}
        {quoteError && <div className="error-text">시세 조회: {quoteError}</div>}
        {holdings.map((stock) => {
          const quote = stock.quote?.market === stock.market ? stock.quote : null
          return <div className="settings-list-item stock-holding-item" key={stock.id}>
            <div>
              <strong>{quote?.name || stock.symbol}</strong> <span className="hint-text">{stock.symbol} · {stock.market}</span>
              <div className="hint-text">{Number(stock.quantity).toLocaleString('ko-KR')}주{quote ? ` × ${formatWon(quote.closing_price)} · ${quote.price_date} 종가` : ' · 시세 없음'}</div>
            </div>
            <div className="stock-holding-actions">
              <strong>{quote ? formatWon(Number(stock.quantity) * Number(quote.closing_price)) : '—'}</strong>
              <button type="button" className="btn btn-sm" onClick={() => { setStockSymbol(stock.symbol); setStockMarket(stock.market); setStockQuantity(String(stock.quantity)) }}>수량 변경</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteStock(stock)}>삭제</button>
            </div>
          </div>
        })}
        <form className="stock-form" onSubmit={handleSaveStock}>
          <div className="field"><label htmlFor="stock-symbol">종목코드</label><input id="stock-symbol" value={stockSymbol} onChange={(e) => setStockSymbol(e.target.value)} placeholder="예: 005930" inputMode="numeric" maxLength={6} required /></div>
          <div className="field"><label htmlFor="stock-market">시장</label><select id="stock-market" value={stockMarket} onChange={(e) => setStockMarket(e.target.value)}><option value="KOSPI">코스피</option><option value="KOSDAQ">코스닥</option></select></div>
          <div className="field"><label htmlFor="stock-quantity">총 보유 수량</label><input id="stock-quantity" type="number" min="1" step="1" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={savingStock}>{savingStock ? '저장 중...' : '주식 저장'}</button>
          <button className="btn" type="button" disabled={refreshingPrices || holdings.length === 0} onClick={() => refreshStocks({ forcePrices: true })}>{refreshingPrices ? '조회 중...' : '시세 새로고침'}</button>
        </form>
        {stockMessage && <div className="hint-text" role="status">{stockMessage}</div>}
      </div>

      <div className="card">
        <div className="section-title">적금</div>
        <div className="hint-text" style={{ marginBottom: 12 }}>오늘 이후의 납입일에 계좌이체 지출이 자동 등록돼요. 31일 등 말일이 없는 달에는 그 달의 마지막 날에 납입해요. 아래 금액은 이자 없이 납입 일정으로 계산하며 과거 미납이나 중지 기간은 반영하지 않아요.</div>
        {plansError && <div className="error-text">적금 목록을 불러오지 못했어요. 데이터베이스 마이그레이션을 확인해주세요.</div>}
        {plans.length === 0 && <div className="hint-text" style={{ marginBottom: 12 }}>등록한 적금이 없어요.</div>}
        {plans.map((plan) => {
          const { total, paid, remaining } = savingsAmounts(plan, todayStr())
          return <div className="settings-list-item savings-plan-item" key={plan.id}>
            <div>
              <div><strong>{plan.name}</strong> · 매달 {plan.debit_day}일 {formatWon(plan.monthly_amount)} · 만기 {plan.maturity_date}{!plan.active && ' · 중지'}</div>
              <div className="savings-amounts">
                <span>총 납입 금액 <strong>{formatWon(total)}</strong></span>
                <span>현재까지 납입된 금액 <strong>{formatWon(paid)}</strong></span>
                <span>남은 납입 금액 <strong>{formatWon(remaining)}</strong></span>
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleTogglePlan(plan)}>{plan.active ? '중지' : '다시 시작'}</button>
          </div>
        })}
        <form className="savings-form" onSubmit={handleAddPlan}>
          <div className="field"><label htmlFor="savings-name">적금 이름</label><input id="savings-name" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="예: 여행 적금" maxLength={80} required /></div>
          <div className="field"><label htmlFor="savings-amount">매달 납입액</label><input id="savings-amount" type="number" min="1" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} required /></div>
          <div className="field"><label htmlFor="savings-day">매달 납입일</label><input id="savings-day" type="number" min="1" max="31" value={planDay} onChange={(e) => setPlanDay(e.target.value)} required /></div>
          <div className="field"><label htmlFor="savings-start">첫 납입월</label><input id="savings-start" type="month" value={planStartMonth} onChange={(e) => setPlanStartMonth(e.target.value)} required /></div>
          <div className="field"><label htmlFor="savings-maturity">만기일</label><input id="savings-maturity" type="date" min={`${planStartMonth}-01`} value={planMaturity} onChange={(e) => setPlanMaturity(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={savingPlan}>{savingPlan ? '등록 중...' : '적금 추가'}</button>
        </form>
        {planMessage && <div className="hint-text" role="status">{planMessage}</div>}
      </div>

      <div className="card">
        <div className="section-title">대출</div>
        <div className="hint-text" style={{ marginBottom: 12 }}>연이율 기준으로 월 이자를 계산해 납입일에 지출로 자동 등록해요. 대출일이 포함된 달은 대출일 이후의 납입일부터 계산해요.</div>
        {loansError && <div className="error-text">대출 목록을 불러오지 못했어요. 데이터베이스 마이그레이션을 확인해주세요.</div>}
        {loans.length === 0 && <div className="hint-text" style={{ marginBottom: 12 }}>등록한 대출이 없어요.</div>}
        {loans.map((loan) => (
          <div className="settings-list-item" key={loan.id}>
            <span><strong>{loan.name}</strong> · {formatWon(loan.principal_amount)} · 연 {Number(loan.annual_interest_rate)}% · 매달 {loan.interest_day}일 {loan.payment_method === '현금' ? '현금' : '카드'} · 상환 {loan.repayment_date}{!loan.active && ' · 중지'}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleToggleLoan(loan)}>{loan.active ? '중지' : '다시 시작'}</button>
          </div>
        ))}
        <form className="loan-form" onSubmit={handleAddLoan}>
          <div className="field"><label htmlFor="loan-name">대출 이름</label><input id="loan-name" value={loanName} onChange={(e) => setLoanName(e.target.value)} placeholder="예: 전세자금대출" maxLength={80} required /></div>
          <div className="field"><label htmlFor="loan-date">대출일</label><input id="loan-date" type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} required /></div>
          <div className="field"><label htmlFor="loan-repayment">상환일</label><input id="loan-repayment" type="date" min={loanDate} value={loanRepaymentDate} onChange={(e) => setLoanRepaymentDate(e.target.value)} required /></div>
          <div className="field"><label htmlFor="loan-amount">대출금액</label><input id="loan-amount" type="number" min="1" step="1" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} required /></div>
          <div className="field"><label htmlFor="loan-rate">연이율 (%)</label><input id="loan-rate" type="number" min="0" step="0.01" value={loanRate} onChange={(e) => setLoanRate(e.target.value)} required /></div>
          <div className="field"><label htmlFor="loan-day">매달 이자 납입일</label><input id="loan-day" type="number" min="1" max="31" value={loanDay} onChange={(e) => setLoanDay(e.target.value)} required /></div>
          <div className="field"><label htmlFor="loan-method">이자 납입 방식</label><select id="loan-method" value={loanMethod} onChange={(e) => setLoanMethod(e.target.value)}><option value="현금">현금</option><option value="신용카드">카드</option></select></div>
          <button className="btn btn-primary" type="submit" disabled={savingLoan}>{savingLoan ? '등록 중...' : '대출 추가'}</button>
        </form>
        {loanMessage && <div className="hint-text" role="status">{loanMessage}</div>}
      </div>

      {overRows.length > 0 && (
        <div className="card" style={{ borderColor: '#fecaca' }}>
          <div className="section-title" style={{ color: 'var(--danger)' }}>
            ⚠ 예산 초과 카테고리
          </div>
          {overRows.map(({ c, limit, spent }) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <BudgetProgressBar spent={spent} limit={limit} label={`${c.icon} ${c.name}`} />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="section-title">🎨 색칠 가계부</div>
        <ColoringGrid
          transactions={expenseTransactions}
          overallLimit={categoryBudgetTotal}
          spent={spentByCategory.total}
        />
      </div>

      <div className="card">
        <div className="section-title">카테고리별 월 예산</div>
        <div className="budget-category-grid">
        {expenseCategories.map((c) => {
          const b = categoryBudget(c.id)
          const spent = spentByCategory.map[c.id] || 0
          const key = c.id
          return (
            <div key={c.id} className="budget-category-item">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>
                  {c.icon} {c.name}
                </span>
                <div style={{ display: 'flex', gap: 8, flex: '1 1 200px', maxWidth: 260 }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="예산 금액"
                    style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}
                    value={draftValue(key, b?.limit_amount)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  />
                  <button className="btn btn-sm btn-primary" disabled={savingKey === key} onClick={() => handleSave(c.id, key)}>
                    저장
                  </button>
                </div>
              </div>
              {b ? (
                <BudgetProgressBar spent={spent} limit={Number(b.limit_amount)} label="" sub={`${formatWon(spent)} / ${formatWon(b.limit_amount)}`} />
              ) : (
                spent > 0 && <div className="hint-text">{formatWon(spent)} 지출 (예산 미설정)</div>
              )}
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
