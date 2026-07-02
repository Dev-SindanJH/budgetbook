import { useEffect, useState } from 'react'
import { todayStr } from '../utils/format'

const PAYMENT_METHODS = ['현금', '신용카드', '체크카드', '계좌이체', '기타']

export default function TransactionForm({ categories, members, currentMemberId, initial, onSubmit, onClose }) {
  const [type, setType] = useState(initial?.type || 'expense')
  const [date, setDate] = useState(initial?.date || todayStr())
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState(initial?.category_id || '')
  const [paymentMethod, setPaymentMethod] = useState(initial?.payment_method || PAYMENT_METHODS[0])
  const [memberId, setMemberId] = useState(initial?.member_id || currentMemberId || '')
  const [memo, setMemo] = useState(initial?.memo || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filteredCategories = categories.filter((c) => c.type === type)

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
    if (!numAmount || numAmount <= 0) {
      setError('금액을 올바르게 입력해주세요')
      return
    }
    if (!memberId) {
      setError('작성자를 선택해주세요')
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
        member_id: memberId,
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? '거래 수정' : '거래 추가'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="toggle-group" style={{ marginBottom: 14 }}>
            <div
              className={'toggle-option' + (type === 'expense' ? ' active expense' : '')}
              onClick={() => setType('expense')}
            >
              지출
            </div>
            <div
              className={'toggle-option' + (type === 'income' ? ' active income' : '')}
              onClick={() => setType('income')}
            >
              수입
            </div>
          </div>

          <div className="field">
            <label>날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="field">
            <label>금액</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>카테고리</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {filteredCategories.length === 0 && <option value="">카테고리 없음</option>}
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>결제수단</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>작성자</label>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>메모</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택 사항" />
          </div>

          {error && <div className="error-text">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? '저장 중...' : '저장'}
          </button>
        </form>
      </div>
    </div>
  )
}
