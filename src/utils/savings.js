function installmentsThrough(plan, date) {
  const endDate = !plan.maturity_date || date < plan.maturity_date ? date : plan.maturity_date
  if (endDate < plan.start_month) return 0

  const [startYear, startMonth] = plan.start_month.slice(0, 7).split('-').map(Number)
  const [endYear, endMonth] = endDate.slice(0, 7).split('-').map(Number)
  const months = (endYear - startYear) * 12 + endMonth - startMonth + 1
  const lastDay = new Date(endYear, endMonth, 0).getDate()
  const paymentDate = `${endDate.slice(0, 7)}-${String(Math.min(plan.debit_day, lastDay)).padStart(2, '0')}`
  return Math.max(0, months - Number(paymentDate > endDate))
}

export function savingsAmounts(plan, today) {
  const monthlyAmount = Number(plan.monthly_amount)
  const total = plan.maturity_date ? installmentsThrough(plan, plan.maturity_date) * monthlyAmount : null
  const paid = installmentsThrough(plan, today) * monthlyAmount
  return { total, paid, remaining: total === null ? null : total - paid }
}
