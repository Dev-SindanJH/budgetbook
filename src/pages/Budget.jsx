import MoneyInput from '../components/MoneyInput'
import Money from '../components/Money'
import { useSearchParams } from 'react-router-dom'
import { useUI } from '../context/UIContext'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCashAssets } from '../hooks/useCashAssets'
import { useSavingsPlans } from '../hooks/useSavingsPlans'
import { useLoans } from '../hooks/useLoans'
import { useStockHoldings } from '../hooks/useStockHoldings'
import {
  saveCashAsset,
  deleteCashAsset,
  addSavingsPlan,
  updateSavingsPlan,
  deleteSavingsPlan,
  addLoan,
  updateLoan,
  deleteLoan,
  saveStockHolding,
  deleteStockHolding,
} from '../lib/api'
import {
  formatWonWithReading,
  monthStr,
  todayStr,
} from '../utils/format'
import { cashAssetBalances } from '../utils/cashAssets'
import { savingsAmounts, totalSavingsPaid } from '../utils/savings'

export default function Budget() {
  const { family, profile } = useAuth()
  const { confirm, notify } = useUI()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = [
    { key: 'cash', label: '현금', icon: 'wallet' },
    { key: 'savings', label: '적금', icon: 'down' },
    { key: 'stocks', label: '주식', icon: 'chart' },
    { key: 'loans', label: '대출', icon: 'card' },
  ]
  const tab = tabs.some((t) => t.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'cash'
  const [assetForm, setAssetForm] = useState(null)
  const {
    transactions: allTransactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions(family?.id)
  const {
    assets: storedCashAssets,
    loading: cashAssetsLoading,
    refresh: refreshCashAssets,
    error: cashAssetsError,
  } = useCashAssets(family?.id)
  const {
    plans,
    loading: plansLoading,
    error: plansError,
    refresh: refreshPlans,
  } = useSavingsPlans(family?.id)
  const {
    loans,
    error: loansError,
    refresh: refreshLoans,
  } = useLoans(family?.id)
  const {
    holdings,
    loading: stocksLoading,
    error: stocksError,
    quoteError,
    refreshingPrices,
    totalValue: stockValue,
    missingCount,
    refresh: refreshStocks,
  } = useStockHoldings(family?.id)

  const [cashAssetName, setCashAssetName] = useState('')
  const [cashAssetAmount, setCashAssetAmount] = useState('')
  const [editingCashAssetId, setEditingCashAssetId] = useState(null)
  const [cashAssetMessage, setCashAssetMessage] = useState('')
  const [savingCashAsset, setSavingCashAsset] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planAmount, setPlanAmount] = useState('')
  const [planDay, setPlanDay] = useState('1')
  const [planCashAssetId, setPlanCashAssetId] = useState('')
  const [planStartMonth, setPlanStartMonth] = useState(monthStr())
  const [planMaturity, setPlanMaturity] = useState('')
  const [editingPlanId, setEditingPlanId] = useState(null)
  const [planMessage, setPlanMessage] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [loanName, setLoanName] = useState('')
  const [loanDate, setLoanDate] = useState(todayStr())
  const [loanRepaymentDate, setLoanRepaymentDate] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [loanRate, setLoanRate] = useState('')
  const [loanDay, setLoanDay] = useState('1')
  const [loanMethod, setLoanMethod] = useState('현금')
  const [loanCashAssetId, setLoanCashAssetId] = useState('')
  const [editingLoanId, setEditingLoanId] = useState(null)
  const [loanMessage, setLoanMessage] = useState('')
  const [savingLoan, setSavingLoan] = useState(false)
  const [stockSymbol, setStockSymbol] = useState('')
  const [stockMarket, setStockMarket] = useState('KOSPI')
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockMessage, setStockMessage] = useState('')
  const [savingStock, setSavingStock] = useState(false)

  const cashAssets = cashAssetBalances(storedCashAssets, allTransactions, todayStr())
  const cashAssetTotal = cashAssets.reduce((sum, asset) => sum + asset.balance, 0)

  async function handleSaveCashAsset(e) {
    e.preventDefault()
    const amount = Number(cashAssetAmount)
    if (!cashAssetName.trim() || !Number.isFinite(amount) || cashAssetAmount === '') {
      setCashAssetMessage('보유처 이름과 금액을 입력해주세요')
      return
    }
    setSavingCashAsset(true)
    setCashAssetMessage('')
    try {
      const existing = cashAssets.find((asset) => asset.id === editingCashAssetId)
      const transactionChange = existing ? existing.balance - Number(existing.amount) : 0
      await saveCashAsset({
        id: editingCashAssetId,
        family_id: family.id,
        name: cashAssetName.trim(),
        amount: amount - transactionChange,
      })
      await refreshCashAssets()
      setCashAssetName('')
      setCashAssetAmount('')
      setEditingCashAssetId(null)
      setCashAssetMessage('현금 항목을 저장했어요')
      setAssetForm(null)
      notify('현금 항목을 저장했어요')
    } catch (err) {
      setCashAssetMessage(
        err.message ||
          '현금 항목을 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
      )
    } finally {
      setSavingCashAsset(false)
    }
  }

  async function handleDeleteCashAsset(asset) {
    if (!(await confirm(`'${asset.name}' 항목을 삭제할까요?`))) return
    try {
      await deleteCashAsset(asset.id)
      await refreshCashAssets()
      setCashAssetMessage('현금 항목을 삭제했어요')
    } catch (err) {
      setCashAssetMessage(err.message || '현금 항목을 삭제하지 못했어요')
    }
  }

  async function handleSavePlan(e) {
    e.preventDefault()
    const amount = Number(planAmount)
    const day = Number(planDay)
    if (
      !planName.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      !planStartMonth ||
      (planMaturity && planMaturity < `${planStartMonth}-01`)
    ) {
      setPlanMessage('적금 이름, 월 납입액, 납입일과 첫 납입월을 확인해주세요')
      return
    }
    setSavingPlan(true)
    setPlanMessage('')
    try {
      const payload = {
        family_id: family.id,
        member_id: profile.id,
        name: planName.trim(),
        monthly_amount: amount,
        debit_day: day,
        start_month: `${planStartMonth}-01`,
        maturity_date: planMaturity || null,
        cash_asset_id: planCashAssetId || null,
      }
      if (editingPlanId) await updateSavingsPlan(editingPlanId, payload)
      else await addSavingsPlan(payload)
      await Promise.all([refreshPlans(), refreshTransactions()])
      setPlanName('')
      setPlanAmount('')
      setPlanMaturity('')
      setEditingPlanId(null)
      setPlanMessage(
        editingPlanId
          ? '적금 정보를 수정했어요'
          : '적금과 납입 예정 지출을 등록했어요',
      )
      setAssetForm(null)
      notify('적금을 저장했어요')
    } catch (err) {
      setPlanMessage(
        err.message || '적금을 등록하지 못했어요. 잠시 후 다시 시도해주세요.',
      )
    } finally {
      setSavingPlan(false)
    }
  }

  function handleEditPlan(plan) {
    setAssetForm('savings')
    setEditingPlanId(plan.id)
    setPlanName(plan.name)
    setPlanCashAssetId(plan.cash_asset_id || '')
    setPlanAmount(String(plan.monthly_amount))
    setPlanDay(String(plan.debit_day))
    setPlanStartMonth(plan.start_month.slice(0, 7))
    setPlanMaturity(plan.maturity_date || '')
    setPlanMessage('')
  }

  async function handleDeletePlan(plan) {
    if (
      !(await confirm(`'${plan.name}' 적금과 앞으로 예정된 납입을 삭제할까요?`))
    )
      return
    try {
      await deleteSavingsPlan(plan.id)
      await Promise.all([refreshPlans(), refreshTransactions()])
      if (editingPlanId === plan.id) setEditingPlanId(null)
      setPlanMessage('적금과 앞으로 예정된 납입을 삭제했어요')
    } catch (err) {
      setPlanMessage(err.message || '적금을 삭제하지 못했어요')
    }
  }

  async function handleTogglePlan(plan) {
    if (!plan.active && !plan.cash_asset_id) {
      handleEditPlan(plan)
      setPlanMessage('납입할 보유처를 지정한 뒤 다시 시작해주세요.')
      return
    }
    try {
      await updateSavingsPlan(plan.id, { active: !plan.active })
      await Promise.all([refreshPlans(), refreshTransactions()])
      setPlanMessage(
        plan.active
          ? '앞으로 예정된 납입을 중지했어요'
          : '납입 일정을 다시 등록했어요',
      )
    } catch (err) {
      setPlanMessage(err.message || '적금 상태를 변경하지 못했어요')
    }
  }

  async function handleSaveLoan(e) {
    e.preventDefault()
    const amount = Number(loanAmount)
    const rate = Number(loanRate)
    const day = Number(loanDay)
    if (
      !loanName.trim() ||
      !loanDate ||
      !loanRepaymentDate ||
      loanRepaymentDate < loanDate ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31
    ) {
      setLoanMessage(
        '대출 이름, 대출일, 상환일, 대출금액, 연이율과 이자 납입일을 확인해주세요',
      )
      return
    }
    setSavingLoan(true)
    setLoanMessage('')
    try {
      const payload = {
        family_id: family.id,
        member_id: profile.id,
        name: loanName.trim(),
        loan_date: loanDate,
        repayment_date: loanRepaymentDate,
        principal_amount: amount,
        annual_interest_rate: rate,
        interest_day: day,
        payment_method: loanMethod,
        cash_asset_id: loanCashAssetId || null,
      }
      if (editingLoanId) await updateLoan(editingLoanId, payload)
      else await addLoan(payload)
      await Promise.all([refreshLoans(), refreshTransactions()])
      setLoanName('')
      setLoanAmount('')
      setLoanRate('')
      setEditingLoanId(null)
      setLoanMessage(
        editingLoanId
          ? '대출 정보를 수정했어요'
          : '대출과 월 이자 지출을 등록했어요',
      )
      setAssetForm(null)
      notify('대출을 저장했어요')
    } catch (err) {
      setLoanMessage(
        err.message || '대출을 등록하지 못했어요. 잠시 후 다시 시도해주세요.',
      )
    } finally {
      setSavingLoan(false)
    }
  }

  function handleEditLoan(loan) {
    setAssetForm('loans')
    setEditingLoanId(loan.id)
    setLoanName(loan.name)
    setLoanCashAssetId(loan.cash_asset_id || '')
    setLoanDate(loan.loan_date)
    setLoanRepaymentDate(loan.repayment_date)
    setLoanAmount(String(loan.principal_amount))
    setLoanRate(String(loan.annual_interest_rate))
    setLoanDay(String(loan.interest_day))
    setLoanMethod(loan.payment_method)
    setLoanMessage('')
  }

  async function handleDeleteLoan(loan) {
    if (
      !(await confirm(
        `'${loan.name}' 대출과 앞으로 예정된 이자 지출을 삭제할까요?`,
      ))
    )
      return
    try {
      await deleteLoan(loan.id)
      await Promise.all([refreshLoans(), refreshTransactions()])
      if (editingLoanId === loan.id) setEditingLoanId(null)
      setLoanMessage('대출과 앞으로 예정된 이자 지출을 삭제했어요')
    } catch (err) {
      setLoanMessage(err.message || '대출을 삭제하지 못했어요')
    }
  }

  async function handleToggleLoan(loan) {
    if (!loan.active && !loan.cash_asset_id) {
      handleEditLoan(loan)
      setLoanMessage('이자 출금 보유처를 지정한 뒤 다시 시작해주세요.')
      return
    }
    try {
      await updateLoan(loan.id, { active: !loan.active })
      await Promise.all([refreshLoans(), refreshTransactions()])
      setLoanMessage(
        loan.active
          ? '앞으로 예정된 이자 지출을 중지했어요'
          : '이자 납입 일정을 다시 등록했어요',
      )
    } catch (err) {
      setLoanMessage(err.message || '대출 상태를 변경하지 못했어요')
    }
  }

  async function handleSaveStock(e) {
    e.preventDefault()
    const symbol = stockSymbol.trim()
    const quantity = Number(stockQuantity)
    if (
      !/^\d{6}$/.test(symbol) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      setStockMessage('6자리 종목코드와 1주 이상의 보유 수량을 입력해주세요')
      return
    }
    setSavingStock(true)
    setStockMessage('')
    try {
      await saveStockHolding({
        familyId: family.id,
        symbol,
        market: stockMarket,
        quantity,
      })
      await refreshStocks()
      setStockSymbol('')
      setStockQuantity('')
      setStockMessage('보유 수량을 저장했어요')
      setAssetForm(null)
      notify('보유 주식을 저장했어요')
    } catch (err) {
      setStockMessage(err.message || '보유 주식을 저장하지 못했어요')
    } finally {
      setSavingStock(false)
    }
  }

  async function handleDeleteStock(stock) {
    if (
      !(await confirm(
        `${stock.quote?.name || stock.symbol} 보유 내역을 삭제할까요?`,
      ))
    )
      return
    try {
      await deleteStockHolding(stock.id)
      await refreshStocks({ updatePrices: false })
      setStockMessage('보유 내역을 삭제했어요')
    } catch (err) {
      setStockMessage(err.message || '보유 내역을 삭제하지 못했어요')
    }
  }

  const savingsValue = totalSavingsPaid(plans, todayStr())
  const assetsLoading = transactionsLoading || cashAssetsLoading || plansLoading || stocksLoading
  const totalAssets = cashAssetTotal + savingsValue + stockValue
  function openAssetForm(kind) {
    if (kind === 'cash') {
      setEditingCashAssetId(null)
      setCashAssetName('')
      setCashAssetAmount('')
      setCashAssetMessage('')
    }
    if (kind === 'savings') {
      setPlanCashAssetId('')
      setEditingPlanId(null)
      setPlanName('')
      setPlanAmount('')
      setPlanMaturity('')
      setPlanMessage('')
    }
    if (kind === 'loans') {
      setLoanCashAssetId('')
      setEditingLoanId(null)
      setLoanName('')
      setLoanAmount('')
      setLoanRate('')
      setLoanMessage('')
    }
    if (kind === 'stocks') {
      setStockSymbol('')
      setStockQuantity('')
      setStockMessage('')
    }
    setAssetForm(kind)
  }
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">GROW TOGETHER</div>
          <h1 className="page-title">차곡차곡, 우리 집 자산</h1>
          <p className="page-description">
            현금, 적금, 주식과 대출을 한곳에서 관리해요.
          </p>
        </div>
      </div>

      <section className="asset-overview">
        <div>
          <span className="summary-label">가족 전체 · 총 보유 자산</span>
          <div className="summary-value">
            {assetsLoading ? '확인 중…' : transactionsError || cashAssetsError || plansError || stocksError ? '일부 조회 실패' : <Money amount={totalAssets} />}
          </div>
          <span className="hint-text">
            현금 + 적금 납입액 + 확인된 주식 평가액
          </span>
          {(missingCount > 0 || cashAssetsError || plansError || stocksError) && (
            <p className="hint-text">
              일부 정보를 확인하지 못해 합계에서 제외했어요.
            </p>
          )}
        </div>
        <div className="asset-overview-detail">
          <div>
            <span>현금</span>
            <strong>
              <Money amount={cashAssetTotal} />
            </strong>
          </div>
          <div>
            <span>적금 납입액</span>
            <strong><Money amount={savingsValue} /></strong>
          </div>
          <div>
            <span>주식 평가액</span>
            <strong>
              {missingCount && missingCount === holdings.length
                ? '시세 미확인'
                : <Money amount={stockValue} />}
            </strong>
          </div>
          <div>
            <span>등록 대출 원금 · 자산과 별도</span>
            <strong>
              <Money amount={loans.reduce(
                  (sum, loan) => sum + Number(loan.principal_amount),
                  0,
                )} />
            </strong>
          </div>
        </div>
      </section>
      <nav className="asset-tabs" aria-label="자산 분류">
        {tabs.map((item) => (
          <button
            className={'btn' + (tab === item.key ? ' active' : '')}
            key={item.key}
            aria-pressed={tab === item.key}
            onClick={() => setSearchParams({ tab: item.key })}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="asset-tab-content" hidden={tab !== 'cash'}>
        <div className="card">
          <div className="section-title">보유 현금 항목</div>
          <div className="summary-value" style={{ marginBottom: 8 }}>
            <Money amount={cashAssetTotal} />
          </div>
          <div className="hint-text" style={{ marginBottom: 12 }}>
            통장과 현금을 보유처별로 등록해요. 새 수입·지출은 선택한 보유처에 반영돼요. 기존 거래는 현재 잔액에 포함되어 다시 반영하지 않아요.
          </div>
          {(cashAssetsError || transactionsError) && (
            <div className="error-text">
              현금 항목을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
            </div>
          )}
          {cashAssets.map((asset) => (
            <div className="settings-list-item" key={asset.id}>
              <div>
                <strong>{asset.name}</strong>
                <div className="hint-text"><Money amount={asset.balance} /></div>
              </div>
              <div className="stock-holding-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setAssetForm('cash')
                    setEditingCashAssetId(asset.id)
                    setCashAssetName(asset.name)
                    setCashAssetAmount(String(asset.balance))
                    setCashAssetMessage('')
                  }}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleDeleteCashAsset(asset)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          {cashAssets.length === 0 && (
            <div className="empty-state" style={{ marginBottom: 12 }}>
              등록된 현금 항목이 없어요
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => openAssetForm('cash')}
          >
            <Icon name="plus" size={18} />
            현금 항목 추가
          </button>
          {assetForm === 'cash' && (
            <Modal
              title="현금 항목 등록·수정"
              onClose={() => setAssetForm(null)}
              busy={savingCashAsset}
              className="transaction-modal"
            >
              <form className="asset-form" onSubmit={handleSaveCashAsset}>
                <div className="field">
                  <label htmlFor="cash-asset-name">보유처</label>
                  <input
                    data-autofocus
                    id="cash-asset-name"
                    value={cashAssetName}
                    onChange={(e) => setCashAssetName(e.target.value)}
                    placeholder="예: 전세금, 농협통장"
                    maxLength={60}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cash-asset-amount">금액 (원)</label>
                  <span className="hint-text">현재 잔액을 입력해주세요. 이전 거래를 다시 더하거나 빼지 않아요.</span>
                  <MoneyInput
                    id="cash-asset-amount"
                    value={cashAssetAmount}
                    onValueChange={setCashAssetAmount}
                    allowNegative
                    required
                  />
                </div>
                {cashAssetMessage && (
                  <div className="hint-text" role="status">
                    {cashAssetMessage}
                  </div>
                )}
                <div className="asset-form-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={savingCashAsset}
                    onClick={() => setAssetForm(null)}
                  >
                    취소
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingCashAsset}
                  >
                    {savingCashAsset
                      ? '저장 중...'
                      : editingCashAssetId
                        ? '항목 수정'
                        : '항목 추가'}
                  </button>
                </div>
              </form>
            </Modal>
          )}
          {cashAssetMessage && (
            <div className="hint-text" role="status">
              {cashAssetMessage}
            </div>
          )}
        </div>

      </div>
      <div className="asset-tab-content" hidden={tab !== 'stocks'}>
        <div className="card">
          <div className="section-heading">
            <h2>보유 주식 잔액</h2>
            <button
              className="btn btn-sm"
              disabled={refreshingPrices || holdings.length === 0}
              onClick={() => refreshStocks({ forcePrices: true })}
            >
              {refreshingPrices ? '조회 중…' : '시세 새로고침'}
            </button>
          </div>
          <div className="summary-value" style={{ marginBottom: 8 }}>
            {holdings.length === 0
              ? <Money amount={0} />
              : missingCount === holdings.length
                ? '시세 조회 전'
                : <Money amount={stockValue} />}
          </div>
          <div className="hint-text" style={{ marginBottom: 12 }}>
            KRX의 최근 제공 종가 × 보유 수량으로 평가해요. 현금 잔액에는
            합산하지 않아요.
          </div>
          {missingCount > 0 && (
            <div className="hint-text" style={{ marginBottom: 12 }}>
              시세가 없는 {missingCount}종목은 표시 금액에서 제외했어요.
            </div>
          )}
          {stocksError && (
            <div className="error-text">
              보유 주식을 불러오지 못했어요: {stocksError}
            </div>
          )}
          {quoteError && (
            <div className="error-text">시세 조회: {quoteError}</div>
          )}
          {holdings.map((stock) => {
            const quote =
              stock.quote?.market === stock.market ? stock.quote : null
            return (
              <div
                className="settings-list-item stock-holding-item"
                key={stock.id}
              >
                <div>
                  <strong>{quote?.name || stock.symbol}</strong>{' '}
                  <span className="hint-text">
                    {stock.symbol} · {stock.market}
                  </span>
                  <div className="hint-text">
                    {Number(stock.quantity).toLocaleString('ko-KR')}주
                    {quote
                      ? ` × ${formatWonWithReading(quote.closing_price)} · ${quote.price_date} 종가`
                      : ' · 시세 없음'}
                  </div>
                </div>
                <div className="stock-holding-actions">
                  <strong>
                    {quote
                      ? <Money amount={Number(stock.quantity) * Number(quote.closing_price)} />
                      : '—'}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setAssetForm('stocks')
                      setStockMessage('')
                      setStockSymbol(stock.symbol)
                      setStockMarket(stock.market)
                      setStockQuantity(String(stock.quantity))
                    }}
                  >
                    수량 변경
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleDeleteStock(stock)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => openAssetForm('stocks')}
          >
            <Icon name="plus" size={18} />
            보유 주식 추가
          </button>
          {assetForm === 'stocks' && (
            <Modal
              title="보유 주식 등록·수정"
              onClose={() => setAssetForm(null)}
              busy={savingStock}
              className="transaction-modal"
            >
              <form className="asset-form" onSubmit={handleSaveStock}>
                <div className="field">
                  <label htmlFor="stock-symbol">종목코드</label>
                  <input
                    data-autofocus
                    id="stock-symbol"
                    value={stockSymbol}
                    onChange={(e) => setStockSymbol(e.target.value)}
                    placeholder="예: 005930"
                    inputMode="numeric"
                    maxLength={6}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="stock-market">시장</label>
                  <select
                    id="stock-market"
                    value={stockMarket}
                    onChange={(e) => setStockMarket(e.target.value)}
                  >
                    <option value="KOSPI">코스피</option>
                    <option value="KOSDAQ">코스닥</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="stock-quantity">총 보유 수량</label>
                  <input
                    id="stock-quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    required
                  />
                </div>
                {stockMessage && (
                  <div className="hint-text" role="status">
                    {stockMessage}
                  </div>
                )}
                <div className="asset-form-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={savingStock}
                    onClick={() => setAssetForm(null)}
                  >
                    취소
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingStock}
                  >
                    {savingStock ? '저장 중...' : '주식 저장'}
                  </button>
                </div>
              </form>
            </Modal>
          )}
          {stockMessage && (
            <div className="hint-text" role="status">
              {stockMessage}
            </div>
          )}
        </div>
      </div>
      <div className="asset-tab-content" hidden={tab !== 'savings'}>
        <div className="card">
          <div className="section-title">적금</div>
          <div className="hint-text" style={{ marginBottom: 12 }}>
            오늘 이후의 납입일에 계좌이체 지출이 자동 등록돼요. 31일 등 말일이
            없는 달에는 그 달의 마지막 날에 납입해요. 아래 금액은 이자 없이 납입
            일정으로 계산하며 과거 미납이나 중지 기간은 반영하지 않아요.
          </div>
          {plansError && (
            <div className="error-text">
              적금 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
            </div>
          )}
          {plans.length === 0 && (
            <div className="hint-text" style={{ marginBottom: 12 }}>
              등록한 적금이 없어요.
            </div>
          )}
          {plans.map((plan) => {
            const { total, paid, remaining } = savingsAmounts(plan, todayStr())
            return (
              <div
                className="settings-list-item savings-plan-item"
                key={plan.id}
              >
                <div>
                  <div>
                    <strong>{plan.name}</strong> · 매달 {plan.debit_day}일{' '}
                    <Money amount={plan.monthly_amount} /> ·{' '}
                    {plan.maturity_date
                      ? `만기 ${plan.maturity_date}`
                      : '만기 없음'}
                    {!plan.active && ' · 중지'}
                    <div className="hint-text">{cashAssets.find((asset) => asset.id === plan.cash_asset_id)?.name || '보유처 미지정 · 수정에서 납입할 보유처를 선택해주세요'}</div>
                  </div>
                  <div className="savings-amounts">
                    <span>
                      {plan.maturity_date
                        ? '총 납입 금액'
                        : '만기까지 납입 예정'}{' '}
                      <strong>
                        {total === null ? '미정' : <Money amount={total} />}
                      </strong>
                    </span>
                    <span>
                      현재까지 납입된 금액 <strong><Money amount={paid} /></strong>
                    </span>
                    {remaining !== null && (
                      <span>
                        남은 납입 금액 <strong><Money amount={remaining} /></strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="stock-holding-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleEditPlan(plan)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleTogglePlan(plan)}
                  >
                    {plan.active ? '중지' : '다시 시작'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => handleDeletePlan(plan)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => openAssetForm('savings')}
          >
            <Icon name="plus" size={18} />
            적금 추가
          </button>
          {assetForm === 'savings' && (
            <Modal
              title="적금 등록·수정"
              onClose={() => setAssetForm(null)}
              busy={savingPlan}
              className="transaction-modal"
            >
              <form className="asset-form" onSubmit={handleSavePlan}>
                <div className="field">
                  <label htmlFor="savings-cash-asset">납입할 보유처</label>
                  <select id="savings-cash-asset" value={planCashAssetId} onChange={(e) => setPlanCashAssetId(e.target.value)} required>
                    <option value="">보유처를 선택하세요</option>
                    {cashAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                  <span className="hint-text">새로 생성하는 납입부터 반영해요. 기존 내역은 다시 차감하지 않아요.</span>
                </div>
                <div className="field">
                  <label htmlFor="savings-name">적금 이름</label>
                  <input
                    data-autofocus
                    id="savings-name"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="예: 여행 적금"
                    maxLength={80}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="savings-amount">매달 납입액</label>
                  <MoneyInput
                    id="savings-amount"
                    min="1"
                    value={planAmount}
                    onValueChange={setPlanAmount}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="savings-day">매달 납입일</label>
                  <input
                    id="savings-day"
                    type="number"
                    min="1"
                    max="31"
                    value={planDay}
                    onChange={(e) => setPlanDay(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="savings-start">첫 납입월</label>
                  <input
                    id="savings-start"
                    type="month"
                    value={planStartMonth}
                    onChange={(e) => setPlanStartMonth(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="savings-maturity">만기일 (선택)</label>
                  <input
                    id="savings-maturity"
                    type="date"
                    min={`${planStartMonth}-01`}
                    value={planMaturity}
                    onChange={(e) => setPlanMaturity(e.target.value)}
                  />
                </div>
                {planMessage && (
                  <div className="hint-text" role="status">
                    {planMessage}
                  </div>
                )}
                <div className="asset-form-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={savingPlan}
                    onClick={() => setAssetForm(null)}
                  >
                    취소
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingPlan}
                  >
                    {savingPlan
                      ? '저장 중...'
                      : editingPlanId
                        ? '적금 수정'
                        : '적금 추가'}
                  </button>
                </div>
              </form>
            </Modal>
          )}
          {planMessage && (
            <div className="hint-text" role="status">
              {planMessage}
            </div>
          )}
        </div>
      </div>
      <div className="asset-tab-content" hidden={tab !== 'loans'}>
        <div className="card">
          <div className="section-title">대출</div>
          <div className="hint-text" style={{ marginBottom: 12 }}>
            연이율 기준으로 월 이자를 계산해 납입일에 지출로 자동 등록해요.
            대출일이 포함된 달은 대출일 이후의 납입일부터 계산해요.
          </div>
          {loansError && (
            <div className="error-text">
              대출 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
            </div>
          )}
          {loans.length === 0 && (
            <div className="hint-text" style={{ marginBottom: 12 }}>
              등록한 대출이 없어요.
            </div>
          )}
          {loans.map((loan) => (
            <div className="settings-list-item" key={loan.id}>
              <span>
                <strong>{loan.name}</strong> ·{' '}
                <Money amount={loan.principal_amount} /> · 연{' '}
                {Number(loan.annual_interest_rate)}% · 매달 {loan.interest_day}
                일 {loan.payment_method === '현금' ? '현금' : '카드'} · 상환{' '}
                {loan.repayment_date}
                {!loan.active && ' · 중지'}
                <span className="hint-text" style={{ display: 'block' }}>{cashAssets.find((asset) => asset.id === loan.cash_asset_id)?.name || '보유처 미지정 · 수정에서 이자 출금 보유처를 선택해주세요'}</span>
              </span>
              <div className="stock-holding-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleEditLoan(loan)}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleToggleLoan(loan)}
                >
                  {loan.active ? '중지' : '다시 시작'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleDeleteLoan(loan)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => openAssetForm('loans')}
          >
            <Icon name="plus" size={18} />
            대출 추가
          </button>
          {assetForm === 'loans' && (
            <Modal
              title="대출 등록·수정"
              onClose={() => setAssetForm(null)}
              busy={savingLoan}
              className="transaction-modal"
            >
              <form className="asset-form" onSubmit={handleSaveLoan}>
                <div className="field">
                  <label htmlFor="loan-cash-asset">이자 출금 보유처</label>
                  <select id="loan-cash-asset" value={loanCashAssetId} onChange={(e) => setLoanCashAssetId(e.target.value)} required>
                    <option value="">보유처를 선택하세요</option>
                    {cashAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="loan-name">대출 이름</label>
                  <input
                    data-autofocus
                    id="loan-name"
                    value={loanName}
                    onChange={(e) => setLoanName(e.target.value)}
                    placeholder="예: 전세자금대출"
                    maxLength={80}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="loan-date">대출일</label>
                  <input
                    id="loan-date"
                    type="date"
                    value={loanDate}
                    onChange={(e) => setLoanDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="loan-repayment">상환일</label>
                  <input
                    id="loan-repayment"
                    type="date"
                    min={loanDate}
                    value={loanRepaymentDate}
                    onChange={(e) => setLoanRepaymentDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="loan-amount">대출금액</label>
                  <MoneyInput
                    id="loan-amount"
                    min="1"
                    value={loanAmount}
                    onValueChange={setLoanAmount}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="loan-rate">연이율 (%)</label>
                  <input
                    id="loan-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanRate}
                    onChange={(e) => setLoanRate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="loan-day">매달 이자 납입일</label>
                  <input
                    id="loan-day"
                    type="number"
                    min="1"
                    max="31"
                    value={loanDay}
                    onChange={(e) => setLoanDay(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="loan-method">이자 납입 방식</label>
                  <select
                    id="loan-method"
                    value={loanMethod}
                    onChange={(e) => setLoanMethod(e.target.value)}
                  >
                    <option value="현금">현금</option>
                    <option value="신용카드">카드</option>
                  </select>
                </div>
                {loanMessage && (
                  <div className="hint-text" role="status">
                    {loanMessage}
                  </div>
                )}
                <div className="asset-form-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={savingLoan}
                    onClick={() => setAssetForm(null)}
                  >
                    취소
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingLoan}
                  >
                    {savingLoan
                      ? '저장 중...'
                      : editingLoanId
                        ? '대출 수정'
                        : '대출 추가'}
                  </button>
                </div>
              </form>
            </Modal>
          )}
          {loanMessage && (
            <div className="hint-text" role="status">
              {loanMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
