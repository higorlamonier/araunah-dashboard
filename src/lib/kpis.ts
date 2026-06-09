import type { DashboardSnapshot, DailyMetric, SourceName } from '../types'

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
export const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
export const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 })

export function safeDiv(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator
}

export function computeKpis(snapshot: DashboardSnapshot) {
  const { spend, impressions, clicks, conversions, revenue, sessions } = snapshot.totals
  return {
    spend,
    revenue,
    roas: safeDiv(revenue, spend),
    ctr: safeDiv(clicks, impressions),
    cpc: safeDiv(spend, clicks),
    cpm: safeDiv(spend * 1000, impressions),
    cpa: safeDiv(spend, conversions),
    conversionRate: safeDiv(conversions, clicks),
    sessions,
  }
}

export function groupBySource(rows: DailyMetric[]) {
  return rows.reduce<Record<SourceName, { spend: number; revenue: number; conversions: number; clicks: number; impressions: number }>>(
    (acc, row) => {
      acc[row.source].spend += row.spend
      acc[row.source].revenue += row.revenue
      acc[row.source].conversions += row.conversions
      acc[row.source].clicks += row.clicks
      acc[row.source].impressions += row.impressions
      return acc
    },
    {
      'Meta Ads': { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 },
      'Google Ads': { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 },
      GA4: { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 },
    },
  )
}

export function trendPoints(rows: DailyMetric[]) {
  const byDate = rows.reduce<Record<string, { spend: number; revenue: number; conversions: number }>>((acc, row) => {
    acc[row.date] ||= { spend: 0, revenue: 0, conversions: 0 }
    acc[row.date].spend += row.spend
    acc[row.date].revenue += row.revenue
    acc[row.date].conversions += row.conversions
    return acc
  }, {})

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, ...value }))
}
