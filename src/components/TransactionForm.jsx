import MoneyInput from './MoneyInput'
import { useEffect, useState } from 'react'
import { todayStr, monthLabel } from '../utils/format'
import { creditCardDueDate } from '../utils/creditCards'
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
  defaultType = 'expense',
  onSubmit,
  onClose,
}) {
  const [type, setType] = useState(initial?.type || defaultType)
  const [date, setDate] = useState(initial?.date || todayStr())
  const [amount, setAmount] = useState(
    initial?.amount ? String(initial.amount) : '',
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
  const [memo, setMemo] = useState(initial?.memo || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filteredCategories = categories.filter((c) => c.type === type)
  const availableCards = cards.filter(
    (c) => c.owner_id === memberId && (c.active || c.id === initial?.card_id),
  )
  const selectedCard = availableCards.find((c) => c.id === cardId)
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
    if (type === 'expense' && paymentMethod === '신용카드' && !selectedCard) {
      setError('등록된 신용카드를 선택해주세요')
      return
    }
    if (affectsCash && !cashAssets.some((asset) => asset.id === cashAssetId)) {
      setError('잔액을 반영할 현금 보유처를 선택해주세요')
      return
    }
    setBusy(true)
    try {
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
        <div className="toggle-group" style={{ marginBottom: 14 }}>
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
        </div>

        <div className="field amount-field">
          <label htmlFor="transaction-amount">금액 (원)</label>
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
          <div className="field">
            <label htmlFor="transaction-date">날짜</label>
            <input
              id="transaction-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

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
              onChange={(e) => setPaymentMethod(e.target.value)}
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
                onChange={(e) => setCardId(e.target.value)}
                required
              >
                <option value="">카드를 선택하세요</option>
                {availableCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.nickname}
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

          <div className="field">
            <label htmlFor="transaction-cash-asset">
              {type === 'income' ? '입금할 보유처' : paymentMethod === '신용카드' ? '카드 결제대금 출금 보유처' : '출금할 보유처'}
            </label>
            <select id="transaction-cash-asset" value={cashAssetId}
              onChange={(e) => setCashAssetId(e.target.value)} required={affectsCash}>
              <option value="">보유처를 선택하세요</option>
              {cashAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
            {!cashAssets.length && <span className="hint-text"><Link to="/budget?tab=cash" onClick={onClose}>자산에서 현금 보유처 등록하기</Link></span>}
            {!affectsCash && <span className="hint-text">기존 잔액에 포함된 내역이에요. 수정하거나 삭제해도 현금 잔액을 다시 계산하지 않아요.</span>}
          </div>

          <div className="field">
            <label htmlFor="transaction-member">작성자</label>
            <select
              id="transaction-member"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value)
                setCardId('')
              }}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="transaction-memo">메모</label>
            <input
              id="transaction-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="선택 사항"
            />
          </div>
        </div>

        {type === 'expense' && affectsCash && (
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
            {busy ? '저장 중...' : initial ? '수정 완료' : '기록하기'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
