export type SourceName = 'Meta Ads' | 'Instagram Insights' | 'Google Ads' | 'GA4'

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

export interface FacebookAdsDaily {
  date: string
  clicks: number
  spend: number
  leads: number
  costPerLead: number
  campaigns: number
  accounts: number
}

export interface InstagramInsightsDaily {
  date: string
  accountsEngaged: number
  followsAndUnfollows: number
  follows: number
  audienceGenderAgeSize: number
  accounts: number
}

export type PeriodKey = '7d' | '15d' | '30d'

export interface DashboardPeriodData {
  key: PeriodKey
  days: number
  period: { start: string; end: string; label: string }
  facebookAds?: DashboardSnapshot['facebookAds']
  instagramInsights?: DashboardSnapshot['instagramInsights']
  totals: DashboardSnapshot['totals']
  socialTotals?: DashboardSnapshot['socialTotals']
  daily: DailyMetric[]
  insights: Insight[]
  freshness?: { sources: Array<{ source: SourceName | 'Instagram Insights'; status: 'ok' | 'missing' | 'partial'; lastDate?: string }> }
}

export interface DashboardSnapshot {
  client: { id: string; name: string; segment: string; siteUrl?: string }
  period: { start: string; end: string; label: string }
  freshness: {
    generatedAt: string
    dataTimezone: string
    sources: Array<{ source: SourceName; status: 'ok' | 'missing' | 'partial'; lastDate?: string }>
  }
  periods?: Partial<Record<PeriodKey, DashboardPeriodData>>
  facebookAds?: {
    totals: {
      clicks: number
      spend: number
      leads: number
      costPerLead: number
      rows: number
      accounts: number
      campaigns: number
    }
    daily: FacebookAdsDaily[]
  }
  instagramInsights?: {
    totals: {
      followersCount: number
      followerCount1d: number
      accountsEngaged: number
      followsAndUnfollows: number
      follows: number
      audienceGenderAgeSize: number
      rows: number
      accounts: number
    }
    daily: InstagramInsightsDaily[]
  }
  totals: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; sessions: number }
  socialTotals?: {
    leads: number
    instagramProfileVisits: number
    instagramMediaLikes: number
    feedShares: number
    rows: number
    accounts: number
    campaigns: number
  }
  daily: DailyMetric[]
  insights: Insight[]
}
