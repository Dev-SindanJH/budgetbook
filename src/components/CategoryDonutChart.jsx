import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatWon } from '../utils/format'

export default function CategoryDonutChart({ data, showLegend = true, height }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  if (total === 0) {
    return <div className="empty-state">데이터가 없어요</div>
  }

  return (
    <div>
      <div className={'chart-box' + (height ? '' : '')} style={height ? { height } : undefined}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatWon(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {showLegend && (
        <div className="legend-list">
          {data.map((d) => (
            <div className="legend-row" key={d.name}>
              <span className="legend-dot" style={{ background: d.color }} />
              <span className="legend-name">{d.name}</span>
              <span className="hint-text">{Math.round((d.value / total) * 100)}%</span>
              <span className="legend-amount">{formatWon(d.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
