import fs from 'node:fs'

const PERIODS = {
  '7d': { label: 'Últimos 7 dias', datePreset: 'last_7dT', days: 7 },
  '15d': { label: 'Últimos 15 dias', datePreset: 'last_15dT', days: 15 },
  '30d': { label: 'Últimos 30 dias', datePreset: 'last_30dT', days: 30 },
}

const SOURCES = {
  facebook: {
    displayName: 'Meta Ads',
    connector: 'facebook',
    sourceValue: 'facebook',
    fields: 'date,datasource,account_name,source,campaign,clicks,spend,actions_lead,cost_per_action_type_lead',
  },
  instagram: {
    displayName: 'Instagram Insights',
    connector: 'instagram',
    sourceValue: 'instagram',
    fields: 'date,account_name,source,followers_count,audience_gender_age_size,accounts_engaged,follows_and_unfollows,follows_count,follower_count_1d',
  },
}

const CONNECTOR_BASE_URL = 'https://connectors.windsor.ai'
const SOURCE_TIMEOUT_MS = 10_000

let fallbackSnapshotCache = null
function getFallbackSnapshot() {
  if (fallbackSnapshotCache) return fallbackSnapshotCache
  try {
    const fileUrl = new URL('../../data/social/latest.json', import.meta.url)
    const content = fs.readFileSync(fileUrl, 'utf-8')
    fallbackSnapshotCache = JSON.parse(content)
  } catch (err) {
    console.warn('Fallback snapshot read failed:', err?.message)
  }
  return fallbackSnapshotCache
}

function json(body, status = 200, requestId) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  })
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function rowsFrom(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(rows)) {
    throw new Error('A fonte retornou uma resposta sem formato válido.')
  }
  return rows
}

function latestDate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const dates = rows.map((row) => row.date).filter(Boolean).sort()
  return dates.length > 0 ? dates.at(-1) : null
}

function normalizeFacebook(rows) {
  const byDate = new Map()
  const accounts = new Set()
  const campaigns = new Set()

  for (const row of rows) {
    const date = row.date
    if (!date) continue
    const account = row.account_name || 'Conta sem nome'
    const campaign = row.campaign || 'Sem campanha'
    const bucket = byDate.get(date) ?? { clicks: 0, spend: 0, leads: 0, campaigns: new Set(), accounts: new Set() }
    bucket.clicks += number(row.clicks)
    bucket.spend += number(row.spend)
    bucket.leads += number(row.actions_lead)
    bucket.campaigns.add(campaign)
    bucket.accounts.add(account)
    byDate.set(date, bucket)
    accounts.add(account)
    campaigns.add(campaign)
  }

  const daily = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({
    date,
    clicks: Math.round(values.clicks),
    spend: round(values.spend),
    leads: Math.round(values.leads),
    costPerLead: values.leads ? round(values.spend / values.leads) : 0,
    campaigns: values.campaigns.size,
    accounts: values.accounts.size,
  }))
  const totals = daily.reduce((total, day) => ({
    clicks: total.clicks + day.clicks,
    spend: total.spend + day.spend,
    leads: total.leads + day.leads,
  }), { clicks: 0, spend: 0, leads: 0 })

  return {
    totals: {
      ...totals,
      spend: round(totals.spend),
      costPerLead: totals.leads ? round(totals.spend / totals.leads) : 0,
      rows: rows.length,
      accounts: accounts.size,
      campaigns: campaigns.size,
    },
    daily,
  }
}

function normalizeInstagram(rows) {
  const byDate = new Map()
  const accounts = new Set()

  for (const row of rows) {
    const date = row.date
    if (!date) continue
    const account = row.account_name || 'Conta sem nome'
    const bucket = byDate.get(date) ?? { accountsEngaged: 0, followsAndUnfollows: 0, follows: 0, audienceGenderAgeSize: 0, accounts: new Set() }
    bucket.accountsEngaged += number(row.accounts_engaged)
    bucket.followsAndUnfollows += number(row.follows_and_unfollows)
    bucket.follows += number(row.follows_count)
    bucket.audienceGenderAgeSize += number(row.audience_gender_age_size)
    bucket.accounts.add(account)
    byDate.set(date, bucket)
    accounts.add(account)
  }

  const daily = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({
    date,
    accountsEngaged: Math.round(values.accountsEngaged),
    followsAndUnfollows: Math.round(values.followsAndUnfollows),
    follows: Math.round(values.follows),
    audienceGenderAgeSize: Math.round(values.audienceGenderAgeSize),
    accounts: values.accounts.size,
  }))
  const mostRecent = [...rows].filter((row) => row.date).sort((left, right) => String(left.date).localeCompare(String(right.date))).at(-1) ?? {}

  return {
    totals: {
      followersCount: Math.round(number(mostRecent.followers_count)),
      followerCount1d: Math.round(number(mostRecent.follower_count_1d)),
      accountsEngaged: daily.reduce((total, day) => total + day.accountsEngaged, 0),
      followsAndUnfollows: daily.reduce((total, day) => total + day.followsAndUnfollows, 0),
      follows: daily.reduce((total, day) => total + day.follows, 0),
      audienceGenderAgeSize: daily.reduce((total, day) => total + day.audienceGenderAgeSize, 0),
      rows: rows.length,
      accounts: accounts.size,
    },
    daily,
  }
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

async function fetchOneSource(sourceKey, datePreset, apiKey) {
  const source = SOURCES[sourceKey]
  const url = new URL(`${CONNECTOR_BASE_URL}/${source.connector}`)
  url.search = new URLSearchParams({
    api_key: apiKey,
    date_preset: datePreset,
    fields: source.fields,
  }).toString()
  const overallStartedAt = Date.now()
  let lastError

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) })
      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Windsor.ai respondeu HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 100)}` : '.'}`)
      }
      const rows = rowsFrom(await response.json())
      return { rows, diagnostics: { source: source.displayName, status: rows.length ? 'ok' : 'partial', attempts: attempt, durationMs: Date.now() - startedAt, lastDate: latestDate(rows) } }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Falha desconhecida na fonte.')
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }

  return {
    rows: [],
    diagnostics: {
      source: source.displayName,
      status: 'error',
      attempts: 2,
      durationMs: Date.now() - overallStartedAt,
      lastDate: null,
      error: lastError?.message ?? 'falha na consulta.',
    },
  }
}

async function fetchSources(datePreset, apiKey) {
  const results = await Promise.all(Object.keys(SOURCES).map((sourceKey) => fetchOneSource(sourceKey, datePreset, apiKey)))
  return {
    facebook: results[0].rows,
    instagram: results[1].rows,
    hasLiveRows: results.some((result) => result.rows.length > 0),
    diagnostics: results.map((result) => result.diagnostics),
  }
}

function statusFor(lastDate, expectedLastDate) {
  if (!lastDate) return 'partial'
  return lastDate === expectedLastDate ? 'ok' : 'partial'
}

function snapshotForPeriod(periodKey, config, facebookRows, instagramRows, requestId, diagnostics = []) {
  const facebook = normalizeFacebook(facebookRows)
  const instagram = normalizeInstagram(instagramRows)
  const sourceDates = [...facebookRows, ...instagramRows].map((row) => row.date).filter(Boolean).sort()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const periodEnd = sourceDates.length > 0 ? sourceDates.at(-1) : today
  const periodStart = sourceDates.length > 0 ? sourceDates.at(0) : today
  const facebookLastDate = facebookRows.length ? latestDate(facebookRows) : null
  const instagramLastDate = instagramRows.length ? latestDate(instagramRows) : null
  const instagramDiagnostic = diagnostics.find((diagnostic) => diagnostic.source === SOURCES.instagram.displayName)
  const period = {
    key: periodKey,
    days: config.days,
    period: { start: sourceDates.at(0), end: periodEnd, label: config.label },
    facebookAds: facebook,
    instagramInsights: instagram,
    totals: {
      spend: facebook.totals.spend,
      impressions: instagram.totals.accountsEngaged,
      clicks: facebook.totals.clicks,
      conversions: facebook.totals.leads,
      revenue: 0,
      sessions: instagram.totals.accountsEngaged,
    },
    socialTotals: {
      leads: facebook.totals.leads,
      instagramProfileVisits: instagram.totals.accountsEngaged,
      instagramMediaLikes: instagram.totals.follows,
      feedShares: 0,
      rows: facebook.totals.rows + instagram.totals.rows,
      accounts: Math.max(facebook.totals.accounts, instagram.totals.accounts),
      campaigns: facebook.totals.campaigns,
    },
    daily: facebook.daily.map((day) => ({
      date: day.date,
      source: 'Meta Ads',
      campaign: `${day.campaigns} campanhas / ${day.accounts} contas`,
      spend: day.spend,
      impressions: 0,
      clicks: day.clicks,
      conversions: day.leads,
      revenue: 0,
      sessions: 0,
    })),
    insights: [
      { severity: facebook.totals.leads ? 'positive' : 'neutral', title: 'Facebook Ads conectado', detail: `${facebook.totals.leads} leads e R$ ${facebook.totals.spend.toFixed(2)} investidos em ${config.label.toLowerCase()}.` },
      instagramRows.length
        ? { severity: instagram.totals.accountsEngaged ? 'positive' : 'neutral', title: 'Instagram Insights conectado', detail: `${instagram.totals.accountsEngaged} contas engajadas no período.` }
        : { severity: 'neutral', title: 'Instagram Insights parcial', detail: instagramDiagnostic?.error ?? 'A fonte não retornou dados neste momento.' },
    ],
    freshness: {
      sources: [
        { source: 'Meta Ads', status: statusFor(facebookLastDate, periodEnd), lastDate: facebookLastDate },
        { source: 'Instagram Insights', status: statusFor(instagramLastDate, periodEnd), lastDate: instagramLastDate },
        { source: 'GA4', status: 'missing' },
        { source: 'Google Ads', status: 'missing' },
      ],
    },
  }

  return {
    client: { id: 'meta-facebook-instagram', name: 'Facebook Ads + Instagram Insights', segment: 'Social / Performance' },
    period: period.period,
    freshness: { generatedAt: new Date().toISOString(), dataTimezone: 'UTC/Windsor', sources: period.freshness.sources },
    periods: { [periodKey]: period },
    facebookAds: facebook,
    instagramInsights: instagram,
    totals: period.totals,
    socialTotals: period.socialTotals,
    daily: period.daily,
    insights: period.insights,
    requestId,
    diagnostics,
  }
}

export default async function handler(request) {
  const requestId = crypto.randomUUID()
  const periodKey = new URL(request.url).searchParams.get('period') ?? '7d'
  const config = PERIODS[periodKey]

  if (!config) return json({ error: 'Período inválido.', requestId }, 400, requestId)

  try {
    if (!process.env.WINDSOR_API_KEY) {
      throw new Error('Chave de API Windsor não configurada no servidor.')
    }
    const { facebook: facebookRows, instagram: instagramRows, hasLiveRows, diagnostics } = await fetchSources(config.datePreset, process.env.WINDSOR_API_KEY)
    if (hasLiveRows) {
      return json(snapshotForPeriod(periodKey, config, facebookRows, instagramRows, requestId, diagnostics), 200, requestId)
    }
    throw new Error('Fontes externas retornaram zero registros no período.')
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Falha na consulta às fontes.'
    const fallback = getFallbackSnapshot()
    if (fallback?.periods?.[periodKey]) {
      const periodData = fallback.periods[periodKey]
      return json({
        client: fallback.client,
        period: periodData.period,
        freshness: fallback.freshness,
        periods: { [periodKey]: periodData },
        facebookAds: periodData.facebookAds,
        instagramInsights: periodData.instagramInsights,
        totals: periodData.totals,
        socialTotals: periodData.socialTotals,
        daily: periodData.daily,
        insights: periodData.insights,
        isFallback: true,
        fallbackReason: `Fontes externas em revalidação (${detail}). Exibindo snapshot consolidado mais recente.`,
        requestId,
      }, 200, requestId)
    }
    return json({ error: `Atualização indisponível: ${detail}`, requestId }, 502, requestId)
  }
}
