import { formatKoreanWon, formatWon } from '../utils/format'

export default function Money({ amount }) {
  return (
    <span className="money">
      <span className="money-number">{formatWon(amount)}</span>
      <span className="money-reading">{formatKoreanWon(amount)}</span>
    </span>
  )
}
