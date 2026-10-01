import { useId, useLayoutEffect, useRef } from 'react'
import { formatKoreanWon, formatMoneyInput } from '../utils/format'

export default function MoneyInput({ value, onValueChange, min, allowNegative = false, ...props }) {
  const hintId = useId()
  const inputRef = useRef(null)
  const selectionRef = useRef(null)
  const raw = String(value ?? '')
  const valid = raw !== '' && raw !== '-' && Number.isSafeInteger(Number(raw))

  useLayoutEffect(() => {
    const input = inputRef.current
    input.setCustomValidity(
      raw === '' ? '' : !valid ? '금액을 원 단위의 정수로 입력해주세요.'
        : min != null && Number(raw) < Number(min) ? `${formatKoreanWon(min)} 이상 입력해주세요.` : '',
    )
    if (selectionRef.current !== null) {
      input.setSelectionRange(selectionRef.current, selectionRef.current)
      selectionRef.current = null
    }
  })

  function update(text, caret) {
    const cleaned = text.replace(/,/g, '')
    if (!(allowNegative ? /^-?\d*$/ : /^\d*$/).test(cleaned)) return
    const next = cleaned.replace(/^(-?)0+(?=\d)/, '$1')
    const remaining = text.slice(caret).replace(/,/g, '').length
    const formatted = formatMoneyInput(next)
    let position = formatted.length
    for (let count = 0; position > 0 && count < remaining;) {
      position--
      if (formatted[position] !== ',') count++
    }
    if (formatted[position - 1] === ',') position--
    inputRef.current.value = formatted
    inputRef.current.setSelectionRange(position, position)
    selectionRef.current = position
    onValueChange(next)
  }

  return (
    <>
      <input
        {...props}
        ref={inputRef}
        type="text"
        inputMode={allowNegative ? 'text' : 'numeric'}
        aria-describedby={[props['aria-describedby'], hintId].filter(Boolean).join(' ')}
        value={formatMoneyInput(raw)}
        onChange={(event) => update(event.target.value, event.target.selectionStart)}
        onKeyDown={(event) => {
          const input = event.currentTarget
          const cursor = input.selectionStart
          if (cursor !== input.selectionEnd) return
          // Deleting at a separator should remove a digit, not reinsert the comma.
          if (event.key === 'Backspace' && input.value[cursor - 1] === ',') {
            event.preventDefault()
            update(input.value.slice(0, cursor - 2) + input.value.slice(cursor), cursor - 2)
          } else if (event.key === 'Delete' && input.value[cursor] === ',') {
            event.preventDefault()
            update(input.value.slice(0, cursor) + input.value.slice(cursor + 2), cursor)
          }
        }}
      />
      <span id={hintId} className="money-input-reading" aria-live="polite" aria-atomic="true">
        {valid ? formatKoreanWon(raw) : raw === '' || raw === '-' ? '0원' : '금액을 확인해주세요'}
      </span>
    </>
  )
}
