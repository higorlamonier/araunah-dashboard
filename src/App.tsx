import { useCallback, useRef, useState } from 'react'
import './App.css'
import { dashboardData } from './data/dashboardData'
import { decimal, integer, money, safeDiv } from './lib/kpis'
import type { DashboardPeriodData, PeriodKey } from './types'
import LeadsPage from './LeadsPage'
import ChatbotMonitorPage from './ChatbotMonitorPage'

const BR_TIMEZONE = 'America/Sao_Paulo'
const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
  { key: '30d', label: '30 dias' },
]

function BrandLogo() {
  return (
    <div className="brand-svg-mark" title="Araunah">
      <svg viewBox="0 0 48 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="url(#araunah-grad)" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z" />
        <defs>
          <linearGradient id="araunah-grad" x1="0" y1="0" x2="48" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#863bff" />
            <stop offset="1" stopColor="#47bfff" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function MarketingDashboard() {
  const [snapshot, setSnapshot] = useState(dashboardData)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('7d')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusNotice, setStatusNotice] = useState<{
    type: 'info' | 'warning' | 'success'
    message: string
    requestId?: string
  } | null>(null)

  const activeRequest = useRef<AbortController | null>(null)
  const current = snapshot.periods?.[selectedPeriod] ?? snapshot.periods?.['7d'] ?? periodFromLegacy(snapshot)
  const facebook = current.facebookAds
  const instagram = current.instagramInsights
  const paidDaily = facebook?.daily ?? []
  const organicDaily = instagram?.daily ?? []

  const maxLeads = Math.max(...paidDaily.map((day) => day.leads), 1)
  const maxSpend = Math.max(...paidDaily.map((day) => day.spend), 1)
  const maxEngagement = Math.max(...organicDaily.map((day) => day.accountsEngaged), 1)

  const bestLeadDay = paidDaily.reduce<(typeof paidDaily)[number] | undefined>(
    (best, day) => (!best || day.leads > best.leads ? day : best),
    undefined,
  )
  const bestCplDay = paidDaily
    .filter((day) => day.leads > 0)
    .reduce<(typeof paidDaily)[number] | undefined>(
      (best, day) => (!best || day.costPerLead < best.costPerLead ? day : best),
      undefined,
    )

  const averageDailySpend = safeDiv(facebook?.totals.spend ?? 0, Math.max(paidDaily.length, 1))
  const leadRate = safeDiv(facebook?.totals.leads ?? 0, facebook?.totals.clicks ?? 0)
  const tableRows = paidDaily.slice(-10).reverse()

  const refreshData = useCallback(async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setIsRefreshing(true)

    try {
      const nextSnapshot = await fetchDashboardData(selectedPeriod, controller.signal)
      setSnapshot((currentSnapshot) => ({
        ...nextSnapshot,
        periods: { ...currentSnapshot.periods, ...nextSnapshot.periods },
      }))

      if (nextSnapshot.isFallback) {
        setStatusNotice({
          type: 'warning',
          message: nextSnapshot.fallbackReason ?? 'Fontes externas em revalidação. Mantivemos o snapshot consolidado mais recente.',
          requestId: nextSnapshot.requestId,
        })
      } else {
        setStatusNotice({
          type: 'success',
          message: 'Métricas sincronizadas em tempo real com sucesso.',
          requestId: nextSnapshot.requestId,
        })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatusNotice({
          type: 'warning',
          message: error instanceof Error ? `${error.message}. Mantivemos o snapshot consolidado.` : 'Não foi possível atualizar em tempo real.',
        })
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        setIsRefreshing(false)
      }
    }
  }, [selectedPeriod])

  return (
    <main className="app-frame">
      <aside className="sidebar" aria-label="Navegação do dashboard">
        <div className="brand-block">
          <BrandLogo />
          <div className="brand-text">
            <strong>Araunah Agro</strong>
            <span>Performance & IA</span>
          </div>
        </div>

        <nav>
          <a href="#resumo" className="active">
            <span className="nav-dot" />
            <span>Resumo Geral</span>
          </a>
          <a href="/chatbot" className="sidebar-badge-link">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="nav-dot" style={{ background: 'var(--accent-whatsapp)' }} />
              <span>Chatbot n8n</span>
            </span>
            <span className="sidebar-pill">Live</span>
          </a>
          <a href="/leads" className="sidebar-badge-link">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="nav-dot" style={{ background: 'var(--accent-purple)' }} />
              <span>Leads CRM</span>
            </span>
            <span className="sidebar-pill" style={{ color: 'var(--accent-purple)', background: 'rgba(168, 85, 247, 0.15)' }}>Access</span>
          </a>
          <a href="#midia-paga">
            <span className="nav-dot" style={{ background: 'var(--accent-meta)' }} />
            <span>Mídia Paga</span>
          </a>
          <a href="#instagram">
            <span className="nav-dot" style={{ background: '#ec4899' }} />
            <span>Instagram</span>
          </a>
          <a href="#eficiencia">
            <span className="nav-dot" style={{ background: 'var(--accent-lime)' }} />
            <span>Eficiência</span>
          </a>
          <a href="#dados">
            <span className="nav-dot" />
            <span>Status das Fontes</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-note">
            <span>Período Ativo</span>
            <strong>{formatShortDate(current.period.start)} — {formatShortDate(current.period.end)}</strong>
          </div>
          <div className="sidebar-note" style={{ padding: '10px 14px' }}>
            <span>Fuso Horário</span>
            <strong style={{ fontSize: '0.78rem' }}>America/Sao_Paulo (BRT)</strong>
          </div>
        </div>
      </aside>

      <section className="dashboard-page">
        <header className="topbar">
          <div className="topbar-header">
            <p className="eyebrow">
              <span className="live-pulse" />
              <span>Painel Executivo de Marketing</span>
            </p>
            <h1>Performance de Marketing</h1>
            <p>Acompanhamento unificado de campanhas Meta Ads e tração orgânica do Instagram.</p>
          </div>

          <div className="topbar-actions">
            <div className="period-segmented-control" role="tablist" aria-label="Selecionar período">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  className={selectedPeriod === option.key ? 'active' : ''}
                  key={option.key}
                  onClick={() => setSelectedPeriod(option.key)}
                  type="button"
                  role="tab"
                  aria-selected={selectedPeriod === option.key}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="date-chip">
              <span>{current.period.label}</span>
              <strong>{formatDateTime(snapshot.freshness.generatedAt)}</strong>
            </div>

            <button
              className="refresh-button"
              disabled={isRefreshing}
              onClick={() => void refreshData()}
              type="button"
              title="Sincronizar métricas mais recentes com a API"
            >
              {isRefreshing ? (
                <>
                  <span className="spinner-icon" />
                  <span>Sincronizando…</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                  <span>Atualizar dados</span>
                </>
              )}
            </button>
          </div>
        </header>

        {statusNotice && (
          <aside className={`status-badge-bar ${statusNotice.type}`} role="status">
            <div className="status-badge-info">
              <span className="status-badge-pill">
                {statusNotice.type === 'success' ? 'Sincronizado' : statusNotice.type === 'warning' ? 'Snapshot Ativo' : 'Aviso'}
              </span>
              <span>{statusNotice.message}{statusNotice.requestId ? ` (Ref: ${statusNotice.requestId.slice(0, 8)})` : ''}</span>
            </div>
            <button className="status-badge-dismiss" onClick={() => setStatusNotice(null)} type="button" aria-label="Fechar notificação">
              ✕
            </button>
          </aside>
        )}

        <section className="period-summary-row" aria-label="Visão rápida dos períodos">
          {PERIOD_OPTIONS.map((option) => {
            const period = snapshot.periods?.[option.key]
            const periodLeads = period?.facebookAds?.totals.leads ?? 0
            const periodCpl = period?.facebookAds?.totals.costPerLead ?? 0
            return (
              <button
                className={selectedPeriod === option.key ? 'period-card active' : 'period-card'}
                key={option.key}
                onClick={() => setSelectedPeriod(option.key)}
                type="button"
              >
                <span>{option.label}</span>
                <strong>{integer.format(periodLeads)} leads</strong>
                <small>{money.format(periodCpl)} CPL médio</small>
              </button>
            )
          })}
        </section>

        <section id="resumo" className="metric-grid" aria-label="Métricas principais de mídia paga">
          <article className="metric-card meta">
            <div className="metric-header">
              <span className="metric-label">Investimento Total</span>
              <span className="metric-badge">Meta Ads</span>
            </div>
            <span className="metric-value font-tabular">{money.format(facebook?.totals.spend ?? 0)}</span>
            <small className="metric-helper font-tabular">{money.format(averageDailySpend)} / dia</small>
          </article>

          <article className="metric-card emerald">
            <div className="metric-header">
              <span className="metric-label">Leads Gerados</span>
              <span className="metric-badge positive">{decimal.format(leadRate * 100)}% conv.</span>
            </div>
            <span className="metric-value font-tabular">{integer.format(facebook?.totals.leads ?? 0)}</span>
            <small className="metric-helper font-tabular">{integer.format(facebook?.totals.clicks ?? 0)} cliques no período</small>
          </article>

          <article className="metric-card lime">
            <div className="metric-header">
              <span className="metric-label">CPL Médio</span>
              <span className="metric-badge highlight">Eficiência</span>
            </div>
            <span className="metric-value font-tabular">{money.format(facebook?.totals.costPerLead ?? 0)}</span>
            <small className="metric-helper">Custo por lead qualificado</small>
          </article>

          <article className="metric-card purple">
            <div className="metric-header">
              <span className="metric-label">Campanhas Ativas</span>
              <span className="metric-badge">{facebook?.totals.accounts ?? 1} conta</span>
            </div>
            <span className="metric-value font-tabular">{integer.format(facebook?.totals.campaigns ?? 0)}</span>
            <small className="metric-helper font-tabular">{integer.format(facebook?.totals.rows ?? 0)} linhas consolidadas</small>
          </article>
        </section>

        <section className="dashboard-grid">
          <article id="midia-paga" className="card card-large">
            <div className="card-header">
              <div>
                <h2>Mídia Paga: Leads & Investimento Diário</h2>
                <span>Facebook Ads · {current.period.label}</span>
              </div>
              <span className="card-header-badge font-tabular">{paidDaily.length} dias monitorados</span>
            </div>

            <div className="overview-stats">
              <strong>{integer.format(facebook?.totals.leads ?? 0)}</strong>
              <span>leads totais no período</span>
            </div>

            <div className="chart-container" aria-label="Gráfico de barras de leads e investimento diário">
              {paidDaily.map((day) => {
                const isBestCpl = bestCplDay && day.date === bestCplDay.date && day.leads > 0
                return (
                  <div
                    className="chart-column"
                    key={day.date}
                    title={`${formatDate(day.date)}: ${day.leads} leads • ${money.format(day.spend)} investidos (CPL ${money.format(day.costPerLead)})`}
                  >
                    {isBestCpl && <span className="chart-column-best">Melhor CPL</span>}
                    <span className="chart-val font-tabular">{day.leads > 0 ? integer.format(day.leads) : ''}</span>
                    <div className="chart-bars-wrap">
                      <div
                        className="bar-lead"
                        style={{ height: `${Math.max(8, (day.leads / maxLeads) * 115)}px` }}
                      />
                      <div
                        className="bar-spend"
                        style={{ height: `${Math.max(6, (day.spend / maxSpend) * 85)}px` }}
                      />
                    </div>
                    <span className="chart-date">{formatShortDate(day.date)}</span>
                  </div>
                )
              })}
            </div>

            <div className="legend-bar">
              <div className="legend-items">
                <span className="legend-item">
                  <span className="legend-dot lead" />
                  <span>Leads Gerados</span>
                </span>
                <span className="legend-item">
                  <span className="legend-dot spend" />
                  <span>Investimento (R$)</span>
                </span>
              </div>
              {bestCplDay && (
                <span className="legend-item">
                  <span className="legend-dot cpl" />
                  <span style={{ color: 'var(--accent-lime)' }}>Melhor CPL: {money.format(bestCplDay.costPerLead)} ({formatShortDate(bestCplDay.date)})</span>
                </span>
              )}
            </div>
          </article>

          <article id="instagram" className="card card-side">
            <div className="card-header">
              <div>
                <h2>Instagram Orgânico</h2>
                <span>Engajamento & Alcance</span>
              </div>
              <span className="card-header-badge">Orgânico</span>
            </div>

            <div className="overview-stats">
              <strong>{integer.format(instagram?.totals.accountsEngaged ?? 0)}</strong>
              <span>contas engajadas</span>
            </div>

            <div className="insta-bars-container" aria-label="Engajamento diário no Instagram">
              {organicDaily.map((day) => (
                <div
                  className="insta-bar-col"
                  key={day.date}
                  title={`${formatDate(day.date)}: ${integer.format(day.accountsEngaged)} contas engajadas`}
                >
                  <div className="insta-bar-track">
                    <div
                      className="insta-bar-fill"
                      style={{ height: `${Math.max(8, (day.accountsEngaged / maxEngagement) * 110)}px` }}
                    />
                  </div>
                  <span className="chart-date">
                    {selectedPeriod === '30d' ? formatDay(day.date) : formatWeekday(day.date)}
                  </span>
                </div>
              ))}
            </div>

            <div className="legend-items" style={{ marginTop: 'auto', paddingTop: '10px' }}>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#ec4899' }} />
                <span>Tração diária de interações</span>
              </span>
            </div>
          </article>

          <article id="eficiencia" className="card card-table-span">
            <div className="card-header">
              <div>
                <h2>Performance Recente por Dia</h2>
                <span>Histórico diário de volume de leads, investimento e custo por aquisição</span>
              </div>
              <span className="card-header-badge font-tabular">Últimos {tableRows.length} dias</span>
            </div>

            <div className="table-wrap">
              <table className="data-table-modern">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Campanhas</th>
                    <th>Cliques</th>
                    <th>Investimento</th>
                    <th>Leads</th>
                    <th>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((day) => {
                    const isGoodCpl = day.leads > 0 && day.costPerLead <= (facebook?.totals.costPerLead ?? 999)
                    return (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td className="font-tabular">{day.campaigns}</td>
                        <td className="font-tabular">{integer.format(day.clicks)}</td>
                        <td className="font-tabular">{money.format(day.spend)}</td>
                        <td>
                          <span className="table-lead-badge font-tabular">{integer.format(day.leads)}</span>
                        </td>
                        <td>
                          <span className={`table-cpl-badge ${isGoodCpl ? 'good' : ''} font-tabular`}>
                            {day.leads > 0 ? money.format(day.costPerLead) : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <article className="card">
              <div className="card-header">
                <div>
                  <h2>Indicadores de Eficiência</h2>
                  <span>Melhores sinais de tração</span>
                </div>
              </div>

              <div className="efficiency-grid">
                <div className="info-item">
                  <div className="info-label">
                    <span>Melhor Volume Diário</span>
                    <small>{bestLeadDay ? formatDate(bestLeadDay.date) : 'Sem registro'}</small>
                  </div>
                  <strong style={{ color: 'var(--accent-emerald)' }}>
                    {bestLeadDay ? `${integer.format(bestLeadDay.leads)} leads` : '—'}
                  </strong>
                </div>

                <div className="info-item">
                  <div className="info-label">
                    <span>Melhor CPL Obtido</span>
                    <small>{bestCplDay ? formatDate(bestCplDay.date) : 'Sem registro'}</small>
                  </div>
                  <strong style={{ color: 'var(--accent-lime)' }}>
                    {bestCplDay ? money.format(bestCplDay.costPerLead) : '—'}
                  </strong>
                </div>

                <div className="info-item">
                  <div className="info-label">
                    <span>Taxa Clique ➔ Lead</span>
                    <small>Conversão global</small>
                  </div>
                  <strong>{decimal.format(leadRate * 100)}%</strong>
                </div>
              </div>
            </article>

            <article id="dados" className="card">
              <div className="card-header">
                <div>
                  <h2>Status das Conexões</h2>
                  <span>Fontes de dados integradas</span>
                </div>
              </div>

              <div className="source-status-grid">
                {(current.freshness?.sources ?? snapshot.freshness.sources).map((source) => (
                  <div className="source-status-item" key={`${source.source}-${source.status}`}>
                    <span className="source-name">{source.source}</span>
                    <span className={`source-badge ${source.status}`}>
                      {source.status === 'ok' ? 'Conectado' : source.status === 'partial' ? 'Parcial' : 'Ausente'}
                      {source.lastDate ? ` · ${formatShortDate(source.lastDate)}` : ''}
                    </span>
                  </div>
                ))}
                <div className="source-status-item">
                  <span className="source-name">Chatbot n8n</span>
                  <span className="source-badge ok">Operacional</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  )
}

function periodFromLegacy(snapshot: typeof dashboardData): DashboardPeriodData {
  return {
    key: '7d',
    days: 7,
    period: snapshot.period,
    facebookAds: snapshot.facebookAds,
    instagramInsights: snapshot.instagramInsights,
    totals: snapshot.totals,
    socialTotals: snapshot.socialTotals,
    daily: snapshot.daily,
    insights: snapshot.insights,
    freshness: { sources: snapshot.freshness.sources },
  }
}

async function fetchDashboardData(period: PeriodKey, signal: AbortSignal): Promise<typeof dashboardData> {
  const timeout = AbortSignal.timeout(30_000)
  const requestSignal = AbortSignal.any([signal, timeout])
  const response = await fetch(`/.netlify/functions/dashboard-data?period=${period}`, {
    cache: 'no-store',
    signal: requestSignal,
  })

  const payload = (await response.json().catch(() => null)) as
    | (typeof dashboardData & { error?: string; requestId?: string; isFallback?: boolean; fallbackReason?: string })
    | null

  if (response.ok && payload) return payload
  throw new Error(payload?.error ?? `A atualização retornou HTTP ${response.status}`)
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: 'short' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: '2-digit' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, weekday: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '')
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function App() {
  const pathname = window.location.pathname
  if (pathname.startsWith('/leads')) return <LeadsPage />
  if (pathname.startsWith('/chatbot')) return <ChatbotMonitorPage />
  return <MarketingDashboard />
}

export default App
