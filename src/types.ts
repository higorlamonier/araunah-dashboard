export type SourceName = 'Meta Ads' | 'Google Ads' | 'GA4'

export interface DailyMetric {
  date: string
  source: SourceName
  campaign: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  sessions?: number
}

export interface Insight {
  severity: 'positive' | 'warning' | 'neutral'
  title: string
  detail: string
}

export interface DashboardSnapshot {
  client: { id: string; name: string; segment: string; siteUrl?: string }
  period: { start: string; end: string; label: string }
  freshness: {
    generatedAt: string
    dataTimezone: string
    sources: Array<{ source: SourceName; status: 'ok' | 'missing' | 'partial'; lastDate?: string }>
  }
  totals: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; sessions: number }
  daily: DailyMetric[]
  insights: Insight[]
}
