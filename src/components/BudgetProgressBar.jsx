import { formatWon } from '../utils/format'

export default function BudgetProgressBar({ spent, limit, label, sub }) {
  const ratio = limit > 0 ? spent / limit : 0
  const pct = Math.min(ratio, 1) * 100
  const state = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''
  const remaining = limit - spent

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="hint-text">
          {sub || (limit > 0 ? `${formatWon(spent)} / ${formatWon(limit)}` : formatWon(spent))}
        </span>
      </div>
      <div className="progress-track">
        <div className={'progress-fill' + (state ? ` ${state}` : '')} style={{ width: `${pct}%` }} />
      </div>
      {limit > 0 && (
        <div className="hint-text" style={{ marginTop: 4 }}>
          {remaining >= 0 ? `${formatWon(remaining)} 남음` : `${formatWon(-remaining)} 초과`}
        </div>
      )}
    </div>
  )
}
