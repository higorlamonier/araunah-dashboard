import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { dashboardData } from './data/dashboardData'
import type { DashboardPeriodData, PeriodKey } from './types'
import MetaAdsTab from './components/MetaAdsTab'
import InstagramTab from './components/InstagramTab'
import GoogleTab from './components/GoogleTab'
import ChatbotMonitorPage from './ChatbotMonitorPage'
import LeadsPage from './LeadsPage'

const BR_TIMEZONE = 'America/Sao_Paulo'
const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
  { key: '30d', label: '30 dias' },
]

type ActiveTab = 'meta' | 'instagram' | 'google' | 'chatbot' | 'leads'

interface TabConfig {
  id: ActiveTab
  label: string
  icon: string
  badge: string
  badgeClass: string
  path: string
  title: string
  eyebrow: string
  subtitle: string
}

const TABS: TabConfig[] = [
  {
    id: 'meta',
    label: 'Meta Ads',
    icon: '📊',
    badge: 'API v22.0',
    badgeClass: 'meta',
    path: '/',
    title: 'Performance Meta Ads',
    eyebrow: 'Meta Graph API v22.0 · Integração Direta Ativa',
    subtitle: 'Campanhas ativas, investimento diário consolidado, volume de leads e CPL sem intermediários.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: '📸',
    badge: '3 Contas',
    badgeClass: 'pink',
    path: '/instagram',
    title: 'Tração & Engajamento Instagram',
    eyebrow: 'Instagram Graph API · Presença Multicanal',
    subtitle: 'Acompanhamento dos perfis @araunah.agro, @araunah.agua e @araunah.florestas.',
  },
  {
    id: 'google',
    label: 'Google Ads & GA4',
    icon: '📈',
    badge: 'Analytics',
    badgeClass: 'cyan',
    path: '/google',
    title: 'Google Analytics 4 & Google Ads',
    eyebrow: 'Google Analytics 4 & Google Ads MCC',
    subtitle: 'Métricas de tráfego web consolidado nos domínios araunah.com e araunahtech.com.br, canais e consentimento.',
  },
  {
    id: 'chatbot',
    label: 'Chatbot n8n',
    icon: '🤖',
    badge: 'WhatsApp',
    badgeClass: 'green',
    path: '/chatbot',
    title: 'Monitoramento do Chatbot n8n',
    eyebrow: 'Operação n8n · WhatsApp Cloud API',
    subtitle: 'Visão operacional do fluxo CHATBOT-ARAUNAH WHATSAPP: webhooks, IA, persistência CRM e entrega.',
  },
  {
    id: 'leads',
    label: 'Leads CRM',
    icon: '👥',
    badge: 'Tempo Real',
    badgeClass: 'purple',
    path: '/leads',
    title: 'Leads Qualificados do Chatbot',
    eyebrow: 'Base de Leads CRM · n8n & Supabase',
    subtitle: 'Contatos em qualificação e registros de CRM em tempo real processados por IA no WhatsApp.',
  },
]

function getInitialTab(): ActiveTab {
  if (typeof window === 'undefined') return 'meta'
  const path = window.location.pathname.toLowerCase()
  if (path.startsWith('/leads')) return 'leads'
  if (path.startsWith('/chatbot')) return 'chatbot'
  if (path.startsWith('/google')) return 'google'
  if (path.startsWith('/instagram')) return 'instagram'
  if (path.startsWith('/meta')) return 'meta'
  return 'meta'
}

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

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: '2-digit' }).format(
    new Date(`${date}T12:00:00Z`),
  )
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTab)
  const [snapshot, setSnapshot] = useState(dashboardData)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('7d')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusNotice, setStatusNotice] = useState<{
    type: 'info' | 'warning' | 'success'
    message: string
    requestId?: string
  } | null>(null)

  const activeRequest = useRef<AbortController | null>(null)
  const current =
    snapshot.periods?.[selectedPeriod] ??
    (snapshot.facebookAds ? (snapshot as unknown as DashboardPeriodData) : periodFromLegacy(snapshot))
  const activeTabConfig = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  // Sincronização com botões avançar/voltar do navegador
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const selectTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab)
    const target = TABS.find((t) => t.id === tab)
    if (target) {
      window.history.pushState(null, '', target.path)
    }
  }, [])

  const refreshData = useCallback(async (periodToFetch?: PeriodKey) => {
    const targetPeriod = periodToFetch ?? selectedPeriod
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setIsRefreshing(true)

    try {
      const nextSnapshot = await fetchDashboardData(targetPeriod, controller.signal)
      const periodData = (nextSnapshot.periods?.[targetPeriod] ?? nextSnapshot) as unknown as DashboardPeriodData
      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        periods: {
          ...currentSnapshot.periods,
          [targetPeriod]: periodData,
        },
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
          message: `Métricas (${targetPeriod}) sincronizadas em tempo real com a Meta Graph API v22.0.`,
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

  const handleSelectPeriod = useCallback((key: PeriodKey) => {
    setSelectedPeriod(key)
    void refreshData(key)
  }, [refreshData])

  const showPeriodSelector = activeTab === 'meta' || activeTab === 'instagram' || activeTab === 'google'

  return (
    <main className="app-frame">
      {/* Sidebar de Navegação Contínua */}
      <aside className="sidebar" aria-label="Navegação do dashboard">
        <div className="brand-block">
          <BrandLogo />
          <div className="brand-text">
            <strong>Araunah Agro</strong>
            <span>Performance & IA</span>
          </div>
        </div>

        <nav aria-label="Seções do sistema">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sidebar-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              <div className="sidebar-btn-content">
                <span
                  className="nav-dot"
                  style={{
                    background:
                      tab.id === 'meta'
                        ? 'var(--accent-meta)'
                        : tab.id === 'instagram'
                        ? '#ec4899'
                        : tab.id === 'google'
                        ? '#38bdf8'
                        : tab.id === 'chatbot'
                        ? 'var(--accent-whatsapp)'
                        : 'var(--accent-purple)',
                  }}
                />
                <span>{tab.label}</span>
              </div>
              <span className={`tab-badge ${tab.badgeClass}`}>{tab.badge}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-note">
            <span>Período Ativo</span>
            <strong>
              {formatShortDate(current.period.start)} — {formatShortDate(current.period.end)}
            </strong>
          </div>
          <div className="sidebar-note" style={{ padding: '10px 14px' }}>
            <span>Fuso Horário</span>
            <strong style={{ fontSize: '0.78rem' }}>America/Sao_Paulo (BRT)</strong>
          </div>
          <div className="sidebar-note" style={{ padding: '10px 14px' }}>
            <span>Conexões Diretas</span>
            <strong style={{ fontSize: '0.78rem', color: 'var(--accent-emerald)' }}>
              ● Meta Graph v22 · n8n · GA4
            </strong>
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal do Dashboard */}
      <section className="dashboard-page">
        {/* Topbar Superior */}
        <header className="topbar">
          <div className="topbar-header">
            <p className="eyebrow">
              <span className="live-pulse" />
              <span>{activeTabConfig.eyebrow}</span>
            </p>
            <h1>{activeTabConfig.title}</h1>
            <p>{activeTabConfig.subtitle}</p>
          </div>

          <div className="topbar-actions">
            {showPeriodSelector && (
              <div className="period-segmented-control" role="tablist" aria-label="Selecionar período">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    className={selectedPeriod === option.key ? 'active' : ''}
                    key={option.key}
                    onClick={() => handleSelectPeriod(option.key)}
                    type="button"
                    role="tab"
                    aria-selected={selectedPeriod === option.key}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

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

        {/* Notificação de Status */}
        {statusNotice && (
          <aside className={`status-badge-bar ${statusNotice.type}`} role="status">
            <div className="status-badge-info">
              <span className="status-badge-pill">
                {statusNotice.type === 'success' ? 'Sincronizado' : statusNotice.type === 'warning' ? 'Snapshot Ativo' : 'Aviso'}
              </span>
              <span>
                {statusNotice.message}
                {statusNotice.requestId ? ` (Ref: ${statusNotice.requestId.slice(0, 8)})` : ''}
              </span>
            </div>
            <button className="status-badge-dismiss" onClick={() => setStatusNotice(null)} type="button" aria-label="Fechar notificação">
              ✕
            </button>
          </aside>
        )}

        {/* Barra de Abas Segmentadas no Topo */}
        <nav className="dashboard-tab-nav" aria-label="Abas do Sistema">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`dashboard-tab-btn tab-${tab.id} ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`tab-badge ${tab.badgeClass}`}>{tab.badge}</span>
            </button>
          ))}
        </nav>

        {/* Conteúdo Dinâmico por Aba */}
        {activeTab === 'meta' && (
          <MetaAdsTab data={current} activePeriod={selectedPeriod} loading={isRefreshing} />
        )}

        {activeTab === 'instagram' && (
          <InstagramTab data={current} activePeriod={selectedPeriod} loading={isRefreshing} />
        )}

        {activeTab === 'google' && (
          <GoogleTab activePeriod={selectedPeriod} />
        )}

        {activeTab === 'chatbot' && (
          <ChatbotMonitorPage embedded={true} onBackToDashboard={() => selectTab('meta')} />
        )}

        {activeTab === 'leads' && (
          <LeadsPage embedded={true} onBackToDashboard={() => selectTab('meta')} />
        )}
      </section>
    </main>
  )
}
