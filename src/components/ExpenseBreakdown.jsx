import { Link } from 'react-router-dom'
import Modal from './Modal'
import Money from './Money'
import { monthLabel } from '../utils/format'
import { isCreditCardExpense } from '../utils/creditCards'

// Loans are checked before cards: loan interest paid by card has no card row.
const KINDS = [
  { key: 'immediate', label: '현금·체크카드·계좌이체', hint: '사용한 날 바로 빠진 돈' },
  { key: 'card', label: '신용카드 사용', hint: '사용한 달에 포함하고, 다음 달 결제일에 출금돼요' },
  { key: 'savings', label: '적금 자동납입', hint: '오늘까지 납입한 회차만 포함해요' },
  { key: 'loan', label: '대출이자 자동납입', hint: '오늘까지 납입한 회차만 포함해요' },
]

function expenseKind(t) {
  if (t.savings_plan_id) return 'savings'
  if (t.loan_id) return 'loan'
  if (isCreditCardExpense(t)) return 'card'
  return 'immediate'
}

const sum = (items) => items.reduce((total, t) => total + Number(t.amount), 0)

function groupBy(items, keyOf) {
  const map = new Map()
  for (const t of items) {
    const key = keyOf(t)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(t)
  }
  return [...map.entries()]
    .map(([key, rows]) => ({ key, rows, amount: sum(rows) }))
    .sort((a, b) => b.amount - a.amount)
}

export default function ExpenseBreakdown({ month, memberLabel, expenses, cards, members, showMembers, onClose }) {
  const total = sum(expenses)
  const share = (amount) => (total > 0 ? Math.round((amount / total) * 100) : 0)
  const kinds = KINDS.map((kind) => {
    const rows = expenses.filter((t) => expenseKind(t) === kind.key)
    return { ...kind, rows, amount: sum(rows) }
  }).filter((kind) => kind.rows.length > 0)
  const byCard = groupBy(expenses.filter((t) => expenseKind(t) === 'card'), (t) => t.card_id)
  const byCategory = groupBy(expenses, (t) => t.categories?.name || '미분류')
  const byMember = groupBy(expenses, (t) => t.member_id)
  const largest = [...expenses].sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))

  return (
    <Modal
      title={`${monthLabel(month)} 지출 내역`}
      description={`${memberLabel} · ${expenses.length}건`}
      onClose={onClose}
      className="expense-breakdown-modal"
    >
      <div className="breakdown-total">
        <span>합계</span>
        <strong><Money amount={total} /></strong>
      </div>
      <div className="payment-explainer">
        사용한 날짜 기준으로 모았어요. 신용카드는 결제일이 아니라 사용한 달에 포함하고,
        아직 납입일이 오지 않은 적금·대출이자는 빼요.
      </div>

      {expenses.length === 0 ? (
        <div className="empty-state">이 달에 기록된 지출이 없어요</div>
      ) : (
        <>
          <section className="breakdown-section">
            <h3>어디서 나갔나요</h3>
            {kinds.map((kind) => (
              <div key={kind.key}>
                <div className="breakdown-row">
                  <span>
                    {kind.label} · {kind.rows.length}건
                    <small>{kind.hint}</small>
                  </span>
                  <strong><Money amount={kind.amount} /></strong>
                </div>
                {kind.key === 'card' && byCard.map((group) => (
                  <div className="breakdown-row breakdown-sub" key={group.key ?? 'none'}>
                    <span>{cards.find((c) => c.id === group.key)?.nickname || '카드 미지정'} · {group.rows.length}건</span>
                    <strong><Money amount={group.amount} /></strong>
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="breakdown-section">
            <h3>카테고리별</h3>
            {byCategory.map((group) => (
              <div className="breakdown-row breakdown-bar-row" key={group.key}>
                <span>
                  {group.rows[0].categories?.icon} {group.key} · {share(group.amount)}%
                  <span className="breakdown-bar">
                    <span style={{
                      width: `${share(group.amount)}%`,
                      background: group.rows[0].categories?.color || '#8192ae',
                    }} />
                  </span>
                </span>
                <strong><Money amount={group.amount} /></strong>
              </div>
            ))}
          </section>

          {showMembers && byMember.length > 1 && (
            <section className="breakdown-section">
              <h3>구성원별</h3>
              {byMember.map((group) => (
                <div className="breakdown-row" key={group.key}>
                  <span>{members.find((m) => m.id === group.key)?.name || '가족'} · {group.rows.length}건</span>
                  <strong><Money amount={group.amount} /></strong>
                </div>
              ))}
            </section>
          )}

          <section className="breakdown-section">
            <h3>금액 큰 순서</h3>
            {largest.map((t) => (
              <div className="due-item" key={t.id}>
                <span>
                  {t.memo || t.categories?.name || '미분류'}
                  <small>
                    {t.date.slice(5).replace('-', '.')} · {t.categories?.name || '미분류'} ·{' '}
                    {isCreditCardExpense(t) && !t.loan_id
                      ? cards.find((c) => c.id === t.card_id)?.nickname || '신용카드'
                      : t.payment_method || '기타'}
                    {showMembers && ` · ${t.profiles?.name || '가족'}`}
                  </small>
                </span>
                <strong><Money amount={t.amount} /></strong>
              </div>
            ))}
          </section>
        </>
      )}

      <Link className="btn btn-primary btn-block" to="/transactions" onClick={onClose}>
        내역 화면에서 보기
      </Link>
    </Modal>
  )
}
