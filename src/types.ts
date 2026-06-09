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

export interface DashboardSnapshot {
  client: { id: string; name: string; segment: string; siteUrl?: string }
  period: { start: string; end: string; label: string }
  freshness: {
    generatedAt: string
    dataTimezone: string
    sources: Array<{ source: SourceName; status: 'ok' | 'missing' | 'partial'; lastDate?: string }>
  }
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
