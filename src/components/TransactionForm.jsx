import MoneyInput from './MoneyInput'
import { useEffect, useRef, useState } from 'react'
import { todayStr, monthLabel } from '../utils/format'
import { creditCardDueDate, installmentPurchaseDate, installmentSchedule } from '../utils/creditCards'
import { formatWon } from '../utils/format'
import { Link } from 'react-router-dom'
import Modal from './Modal'

const PAYMENT_METHODS = ['현금', '신용카드', '체크카드', '계좌이체', '기타']

export default function TransactionForm({
  categories,
  members,
  cards = [],
  cashAssets = [],
  currentMemberId,
  initial,
  defaults,
  expenseOnly = false,
  defaultType = 'expense',
  onSubmit,
  onSubmitInstallment,
  onClose,
}) {
  const seed = initial || defaults
  const [type, setType] = useState(seed?.type || defaultType)
  const [date, setDate] = useState(seed?.date || todayStr())
  const [amount, setAmount] = useState(
    seed?.amount ? String(seed.amount) : '',
  )
  const [categoryId, setCategoryId] = useState(initial?.category_id || '')
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.payment_method || PAYMENT_METHODS[0],
  )
  const [memberId, setMemberId] = useState(
    initial?.member_id || currentMemberId || '',
  )
  const [cardId, setCardId] = useState(initial?.card_id || '')
  const [cashAssetId, setCashAssetId] = useState(initial?.cash_asset_id || '')
  const affectsCash = !initial || initial.cash_balance_included === true
  const [memo, setMemo] = useState(seed?.memo || '')
  const [installment, setInstallment] = useState(false)
  const [totalMonths, setTotalMonths] = useState('3')
  const [remainingMonths, setRemainingMonths] = useState('3')
  const [amountMode, setAmountMode] = useState('total')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filteredCategories = categories.filter((c) => c.type === type)
  // Any card in the household can be used, whoever registered it.
  const availableCards = cards.filter(
    (c) => c.active || c.id === initial?.card_id,
  )
  const ownerName = (card) =>
    members.find((m) => m.id === card.owner_id)?.name || '가족'
  const selectedCard = availableCards.find((c) => c.id === cardId)
  // The writer's representative card, with its usual payment account.
  const defaultCard = cards.find(
    (c) => c.active && c.id === members.find((m) => m.id === memberId)?.default_card_id,
  )
  // Defaults never overwrite what the user picked themselves.
  const touched = useRef({ payment: false, card: false, asset: false })

  function pickCard(id) {
    setCardId(id)
    const asset = cards.find((c) => c.id === id)?.default_cash_asset_id
    if (asset) setCashAssetId(asset)
  }
  const isCardExpense = type === 'expense' && paymentMethod === '신용카드'
  const canInstall = Boolean(onSubmitInstallment) && !initial && isCardExpense
  const isInstallment = canInstall && installment
  const months = Number(totalMonths)
  const remaining = Number(remainingMonths)
  const validInstallment =
    Number.isInteger(months) && months >= 2 && months <= 60 &&
    Number.isInteger(remaining) && remaining >= 1 && remaining <= months
  const firstInstallment = validInstallment ? months - remaining + 1 : 1
  // With installments already paid, the date field is the current installment's date.
  const resumesInstallment = isInstallment && firstInstallment > 1
  const purchaseDate = resumesInstallment && date ? installmentPurchaseDate(date, firstInstallment) : date
  const schedule =
    isInstallment && validInstallment && selectedCard && date && Number(amount) > 0
      ? installmentSchedule({
          purchaseDate,
          totalMonths: months,
          firstInstallment,
          amountMode,
          amount,
          debitDay: selectedCard.debit_day,
        })
      : []
  const previewDueDate =
    selectedCard && date
      ? initial?.card_due_date &&
        initial.date === date &&
        initial.card_id === cardId
        ? initial.card_due_date
        : creditCardDueDate(date, selectedCard.debit_day)
      : null

  useEffect(() => {
    if (!filteredCategories.find((c) => c.id === categoryId)) {
      setCategoryId(filteredCategories[0]?.id || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categories])

  // New expenses start on the writer's representative card. Members and cards may
  // arrive after the form opens, and changing the writer switches to their card.
  useEffect(() => {
    if (initial || !defaultCard) return
    const { payment, card, asset } = touched.current
    if (type !== 'expense') {
      // Income goes to whatever account it arrives in, not the card's account.
      if (!payment) setPaymentMethod(PAYMENT_METHODS[0])
      if (!asset) setCashAssetId('')
      return
    }
    if (!payment) setPaymentMethod('신용카드')
    if (!card) setCardId(defaultCard.id)
    if (!asset && defaultCard.default_cash_asset_id) {
      setCashAssetId(defaultCard.default_cash_asset_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCard?.id, type])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('금액을 올바르게 입력해주세요')
      return
    }
    if (!memberId) {
      setError('작성자를 선택해주세요')
      return
    }
    if (isCardExpense && !selectedCard) {
      setError('등록된 신용카드를 선택해주세요')
      return
    }
    if (affectsCash && !cashAssets.some((asset) => asset.id === cashAssetId)) {
      setError('잔액을 반영할 현금 보유처를 선택해주세요')
      return
    }
    if (isInstallment) {
      if (!validInstallment) {
        setError('할부 개월 수는 2~60개월, 남은 회차는 1회차부터 할부 개월 수까지 입력해주세요')
        return
      }
      if (!Number.isInteger(numAmount)) {
        setError('할부 금액은 원 단위 정수로 입력해주세요')
        return
      }
      if (amountMode === 'total' && numAmount < months) {
        setError('전체 금액은 할부 개월 수보다 커야 해요')
        return
      }
    }
    setBusy(true)
    try {
      if (isInstallment) {
        const category = categories.find((c) => c.id === categoryId)
        await onSubmitInstallment({
          member_id: memberId,
          card_id: cardId,
          category_id: categoryId || null,
          cash_asset_id: cashAssetId || null,
          name: memo.trim() || `${category?.name || '카드'} 할부`,
          purchase_date: purchaseDate,
          total_months: months,
          first_installment: firstInstallment,
          amount_mode: amountMode,
          amount: numAmount,
        })
        onClose()
        return
      }
      await onSubmit({
        type,
        date,
        amount: numAmount,
        category_id: categoryId || null,
        payment_method: paymentMethod,
        card_id:
          type === 'expense' && paymentMethod === '신용카드' ? cardId : null,
        member_id: memberId,
        cash_asset_id: cashAssetId || null,
        cash_balance_included: affectsCash,
        memo: memo || null,
      })
      onClose()
    } catch (err) {
      setError(err.message || '저장에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  // In installment mode it comes after the installment fields, whose answers decide its meaning.
  const dateField = (
    <div className="field">
      <label htmlFor="transaction-date">
        {!isInstallment ? '날짜'
          : resumesInstallment ? `이번 회차(${firstInstallment}회차) 사용일` : '구매일 (1회차 사용일)'}
      </label>
      <input
        id="transaction-date"
        type="date"
        max={expenseOnly || initial?.family_event_occurrence_id ? todayStr() : undefined}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      {resumesInstallment && (
        <span className="hint-text">
          {firstInstallment}회차 대금이 다음 달 결제일에 출금돼요. 1회차 구매일은 자동으로 계산해요.
        </span>
      )}
    </div>
  )

  return (
    <Modal
      title={
        initial ? '내역 수정' : type === 'expense' ? '지출 기록' : '수입 기록'
      }
      description="오늘의 기록이 우리 집의 내일을 만들어요."
      onClose={onClose}
      busy={busy}
      className="transaction-modal"
    >
      <form onSubmit={handleSubmit}>
        {!expenseOnly && <div className="toggle-group" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={
              'toggle-option' + (type === 'expense' ? ' active expense' : '')
            }
            aria-pressed={type === 'expense'}
            onClick={() => setType('expense')}
          >
            지출
          </button>
          <button
            type="button"
            className={
              'toggle-option' + (type === 'income' ? ' active income' : '')
            }
            aria-pressed={type === 'income'}
            onClick={() => setType('income')}
          >
            수입
          </button>
        </div>}

        <div className="field amount-field">
          <label htmlFor="transaction-amount">
            {isInstallment
              ? amountMode === 'total' ? '할부 전체 금액 (원)' : '매달 내는 금액 (원)'
              : '금액 (원)'}
          </label>
          <MoneyInput
            id="transaction-amount"
            className="amount-input"
            min="1"
            placeholder="0"
            value={amount}
            onValueChange={setAmount}
            required
            data-autofocus
          />
        </div>
        <div className="transaction-form-grid">
          {!isInstallment && dateField}

          <div className="field">
            <label htmlFor="transaction-category">카테고리</label>
            <select
              id="transaction-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {filteredCategories.length === 0 && (
                <option value="">카테고리 없음</option>
              )}
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="transaction-payment">결제수단</label>
            <select
              id="transaction-payment"
              value={paymentMethod}
              onChange={(e) => {
                touched.current.payment = true
                setPaymentMethod(e.target.value)
                if (e.target.value !== '신용카드') return
                const card = selectedCard || defaultCard
                if (!card) return
                setCardId(card.id)
                if (!touched.current.asset && card.default_cash_asset_id) {
                  setCashAssetId(card.default_cash_asset_id)
                }
              }}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {type === 'expense' && paymentMethod === '신용카드' && (
            <div className="field">
              <label htmlFor="transaction-card">사용한 신용카드</label>
              <select
                id="transaction-card"
                value={cardId}
                onChange={(e) => {
                  touched.current.card = true
                  // A different card is usually paid from its own account.
                  pickCard(e.target.value)
                }}
                required
              >
                <option value="">카드를 선택하세요</option>
                {availableCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.nickname} · {ownerName(card)}
                    {card.active ? '' : ' (사용 중지)'}
                  </option>
                ))}
              </select>
              {availableCards.length === 0 && (
                <span className="hint-text">
                  등록된 카드가 없어요.{' '}
                  <Link to="/settings" onClick={onClose}>
                    설정에서 카드 등록하기
                  </Link>
                </span>
              )}
            </div>
          )}

          {canInstall && (
            <div className="field">
              <span className="field-label" id="transaction-installment-label">결제 방식</span>
              <div className="toggle-group" role="group" aria-labelledby="transaction-installment-label">
                <button type="button" className={'toggle-option' + (!installment ? ' active' : '')}
                  aria-pressed={!installment} onClick={() => setInstallment(false)}>일시불</button>
                <button type="button" className={'toggle-option' + (installment ? ' active' : '')}
                  aria-pressed={installment} onClick={() => setInstallment(true)}>할부</button>
              </div>
            </div>
          )}

          {isInstallment && (
            <>
              <div className="field">
                <label htmlFor="transaction-installment-months">할부 개월 수</label>
                <input id="transaction-installment-months" type="number" min="2" max="60" inputMode="numeric"
                  value={totalMonths} required
                  onChange={(e) => {
                    // Keep "remaining" in step while the user hasn't said some are already paid.
                    if (remainingMonths === totalMonths) setRemainingMonths(e.target.value)
                    setTotalMonths(e.target.value)
                  }} />
              </div>
              <div className="field">
                <label htmlFor="transaction-installment-remaining">남은 회차</label>
                <input id="transaction-installment-remaining" type="number" min="1" max={months || 60} inputMode="numeric"
                  value={remainingMonths} required onChange={(e) => setRemainingMonths(e.target.value)} />
                <span className="hint-text">이미 낸 회차가 있으면 이번 회차를 포함해 남은 회차를 입력하세요. (예: 10개월 중 9회차면 2)</span>
              </div>
              <div className="field">
                <span className="field-label" id="transaction-installment-mode-label">금액 입력 방식</span>
                <div className="toggle-group" role="group" aria-labelledby="transaction-installment-mode-label">
                  <button type="button" className={'toggle-option' + (amountMode === 'total' ? ' active' : '')}
                    aria-pressed={amountMode === 'total'} onClick={() => setAmountMode('total')}>전체 금액</button>
                  <button type="button" className={'toggle-option' + (amountMode === 'monthly' ? ' active' : '')}
                    aria-pressed={amountMode === 'monthly'} onClick={() => setAmountMode('monthly')}>매달 금액</button>
                </div>
              </div>
              {dateField}
            </>
          )}

          <div className="field">
            <label htmlFor="transaction-cash-asset">
              {type === 'income' ? '입금할 보유처' : paymentMethod === '신용카드' ? '카드 결제대금 출금 보유처' : '출금할 보유처'}
            </label>
            <select id="transaction-cash-asset" value={cashAssetId}
              onChange={(e) => {
                touched.current.asset = true
                setCashAssetId(e.target.value)
              }} required={affectsCash}>
              <option value="">보유처를 선택하세요</option>
              {cashAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
            {!cashAssets.length && <span className="hint-text"><Link to="/budget?tab=cash" onClick={onClose}>자산에서 현금 보유처 등록하기</Link></span>}
            {isCardExpense && selectedCard && !selectedCard.default_cash_asset_id && cashAssets.length > 0 && (
              <span className="hint-text">설정에서 이 카드의 출금 보유처를 정해두면 다음부터 자동으로 골라요.</span>
            )}
            {!affectsCash && <span className="hint-text">기존 잔액에 포함된 내역이에요. 수정하거나 삭제해도 현금 잔액을 다시 계산하지 않아요.</span>}
          </div>

          <div className="field">
            <label htmlFor="transaction-member">작성자</label>
            <select
              id="transaction-member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="transaction-memo">{isInstallment ? '할부 항목명' : '메모'}</label>
            <input
              id="transaction-memo"
              value={memo}
              maxLength={isInstallment ? 80 : undefined}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={isInstallment ? '예: 냉장고 (비우면 카테고리 이름)' : '선택 사항'}
            />
          </div>
        </div>

        {isInstallment ? (
          <div className="payment-explainer installment-preview">
            {schedule.length ? (
              <>
                <strong>
                  {schedule[0].no === schedule.at(-1).no
                    ? `${schedule[0].no}회차`
                    : `${schedule[0].no}~${schedule.at(-1).no}회차`}{' '}
                  {schedule.length}건을 자동으로 등록해요
                </strong>
                <ul>
                  {schedule.slice(0, 3).map((row) => (
                    <li key={row.no}>
                      {row.no}회차 · {row.date} 사용분 · {row.dueDate} 출금 · {formatWon(row.amount)}
                    </li>
                  ))}
                  {schedule.length > 3 && (
                    <li>… 마지막 {schedule.at(-1).no}회차 {schedule.at(-1).dueDate} 출금</li>
                  )}
                </ul>
                남은 금액 합계 {formatWon(schedule.reduce((sum, row) => sum + row.amount, 0))}
                {resumesInstallment && <> · 구매일(1회차 사용일) {purchaseDate}</>}
              </>
            ) : (
              '카드, 금액, 할부 개월 수를 입력하면 등록될 회차를 미리 보여드려요.'
            )}
          </div>
        ) : type === 'expense' && affectsCash && (
          <div className="payment-explainer">
            {paymentMethod === '신용카드'
              ? previewDueDate
                ? `이 지출은 ${monthLabel(date.slice(0, 7))} 지출에 포함되고, ${previewDueDate}에 현금에서 빠질 예정이에요.`
                : '신용카드 지출은 사용한 달에 기록하고, 현금은 다음 달 자동이체일에 반영해요.'
              : '현금·체크카드·계좌이체 지출은 사용한 달의 현금 흐름에 바로 반영해요.'}
          </div>
        )}

        {error && (
          <div className="error-text" role="alert">
            {error}
          </div>
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
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? '저장 중...' : initial ? '수정 완료' : isInstallment ? '할부 등록' : '기록하기'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
