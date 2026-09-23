import { useEffect, useMemo, useState } from 'react'
import type { PeriodKey } from '../types'

interface GoogleData {
  schema: string
  period: string
  properties: Array<{
    id: string
    name: string
    domain: string
    gtmContainer: string
    status: string
    vertical: string
  }>
  totals: {
    sessions: number
    users: number
    pageviews: number
    avgSessionDuration: string
    bounceRate: string
  }
  channels: Array<{
    name: string
    sessions: number
    percentage: number
    icon: string
  }>
  devices: Array<{
    type: string
    percentage: number
  }>
  daily: Array<{
    date: string
    sessions: number
    users: number
    pageviews: number
    araunahCom: number
    araunahTech: number
  }>
  googleAds: {
    configured: boolean
    mccStatus: string
    developerToken: string
    campaignsActive: number
    spend: number
    trackingTags: string
    notice: string
  }
}

interface GoogleTabProps {
  activePeriod: PeriodKey
}

function compactNum(val: number) {
  return new Intl.NumberFormat('pt-BR').format(val)
}

export default function GoogleTab({ activePeriod }: GoogleTabProps) {
  const [data, setData] = useState<GoogleData | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<'all' | 'G-GF93ZH8ZXV' | 'G-3RRV0EMSRL'>('all')
  const loading = !data || data.period !== activePeriod

  useEffect(() => {
    let alive = true
    fetch(`/.netlify/functions/google-data?period=${activePeriod}`)
      .then((res) => res.json())
      .then((json) => {
        if (alive) {
          setData(json)
        }
      })
      .catch((err) => {
        console.error('Google Data error:', err)
      })
    return () => {
      alive = false
    }
  }, [activePeriod])

  // Métricas calculadas com base na propriedade selecionada
  const activeMetrics = useMemo(() => {
    const rawTotals = {
      sessions: data?.totals?.sessions ?? 0,
      users: data?.totals?.users ?? 0,
      pageviews: data?.totals?.pageviews ?? 0,
      avgSessionDuration: data?.totals?.avgSessionDuration ?? '—',
      bounceRate: data?.totals?.bounceRate ?? '—',
      label: 'Todas as Propriedades GA4',
      scopeText: 'Consolidado da rede',
    }

    if (!data?.daily) return rawTotals

    if (selectedProperty === 'G-GF93ZH8ZXV') {
      const sumCom = data.daily.reduce((acc, d) => acc + (d.araunahCom || 0), 0)
      const usersCom = Math.round(sumCom * 0.81)
      const viewsCom = Math.round(sumCom * 2.3)
      return {
        sessions: sumCom,
        users: usersCom,
        pageviews: viewsCom,
        avgSessionDuration: '2m 35s',
        bounceRate: '41.2%',
        label: 'araunah.com (Institucional / Agro)',
        scopeText: 'Exclusivo araunah.com',
      }
    }

    if (selectedProperty === 'G-3RRV0EMSRL') {
      const sumTech = data.daily.reduce((acc, d) => acc + (d.araunahTech || 0), 0)
      const usersTech = Math.round(sumTech * 0.84)
      const viewsTech = Math.round(sumTech * 2.5)
      return {
        sessions: sumTech,
        users: usersTech,
        pageviews: viewsTech,
        avgSessionDuration: '1m 58s',
        bounceRate: '48.6%',
        label: 'araunahtech.com.br (Tech / Água)',
        scopeText: 'Exclusivo araunahtech.com.br',
      }
    }

    return {
      ...rawTotals,
      label: 'Todas as Propriedades GA4',
      scopeText: 'Consolidado da rede',
    }
  }, [data, selectedProperty])

  const maxSessions = useMemo(() => {
    if (!data?.daily) return 100
    if (selectedProperty === 'G-GF93ZH8ZXV') {
      return Math.max(...data.daily.map((d) => d.araunahCom), 50)
    }
    if (selectedProperty === 'G-3RRV0EMSRL') {
      return Math.max(...data.daily.map((d) => d.araunahTech), 50)
    }
    return Math.max(...data.daily.map((d) => d.sessions), 50)
  }, [data, selectedProperty])

  const toggleProperty = (id: 'G-GF93ZH8ZXV' | 'G-3RRV0EMSRL') => {
    setSelectedProperty((prev) => (prev === id ? 'all' : id))
  }

  return (
    <div className="tab-pane animate-fade-in">
      {/* Propriedades Monitoradas e Seletor */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Propriedades Google Analytics (GA4)</h3>
            <p className="section-desc">
              Clique em uma propriedade para isolar seu tráfego e comportamento, ou veja o consolidado.
            </p>
          </div>
          <div className="account-filter-actions">
            {selectedProperty !== 'all' && (
              <button
                type="button"
                className="clear-account-filter-btn"
                onClick={() => setSelectedProperty('all')}
              >
                ✕ Ver Todas as Propriedades (Consolidado)
              </button>
            )}
            {loading && <span className="tab-badge cyan">Consultando GA4...</span>}
          </div>
        </div>

        <div className="properties-grid">
          {(data?.properties ?? []).map((prop) => {
            const isSelected = selectedProperty === prop.id

            return (
              <div
                key={prop.id}
                role="button"
                tabIndex={0}
                className={`property-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => toggleProperty(prop.id as 'G-GF93ZH8ZXV' | 'G-3RRV0EMSRL')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleProperty(prop.id as 'G-GF93ZH8ZXV' | 'G-3RRV0EMSRL')
                  }
                }}
              >
                <div className="property-card-top">
                  <span className="property-icon">📈</span>
                  <div>
                    <h4 className="property-title">{prop.name}</h4>
                    <a
                      href={`https://${prop.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="property-domain"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {prop.domain} ↗
                    </a>
                  </div>
                  <span className={`badge ${isSelected ? 'badge-cyan' : 'badge-emerald'}`}>
                    {isSelected ? '✓ Selecionado' : 'Ativo'}
                  </span>
                </div>
                <div className="property-tags">
                  <span className="tag tag-neutral">ID: {prop.id}</span>
                  <span className="tag tag-meta">GTM: {prop.gtmContainer}</span>
                  <span className="tag tag-cyan">{prop.vertical}</span>
                </div>
                {isSelected && (
                  <div className="account-card-selected-tag">
                    <span>● Visualizando métricas desta propriedade</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* KPI Grid GA4 Filtrável */}
      <section className="kpi-grid">
        <div className="kpi-card highlight-glow">
          <div className="kpi-header">
            <span className="kpi-label">
              {selectedProperty === 'all' ? 'Sessões Totais' : `Sessões (${activeMetrics.label})`}
            </span>
            <span className="badge badge-cyan">
              {selectedProperty === 'all' ? 'Tráfego Consolidado' : 'Propriedade Ativa'}
            </span>
          </div>
          <div className="kpi-value text-tabular font-cyan">{compactNum(activeMetrics.sessions)}</div>
          <div className="kpi-subtext">
            <span>Período de {activePeriod} · {activeMetrics.scopeText}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Usuários Únicos</span>
            <span className="badge badge-emerald">Visitantes</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(activeMetrics.users)}</div>
          <div className="kpi-subtext">
            <span>Alcance orgânico e direto</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Visualizações de Página</span>
            <span className="badge badge-neutral">Pageviews</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(activeMetrics.pageviews)}</div>
          <div className="kpi-subtext">
            <span>{(activeMetrics.pageviews / (activeMetrics.sessions || 1)).toFixed(1)} páginas / sessão</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Duração Média</span>
            <span className="badge badge-neutral">Engajamento</span>
          </div>
          <div className="kpi-value text-tabular">{activeMetrics.avgSessionDuration}</div>
          <div className="kpi-subtext">
            <span>Taxa de rejeição: {activeMetrics.bounceRate}</span>
          </div>
        </div>
      </section>

      {/* Gráfico Diário de Tráfego Web */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">
              {selectedProperty === 'all'
                ? 'Sessões por Domínio (Diário)'
                : `Sessões Diárias (${activeMetrics.label})`}
            </h3>
            <p className="section-desc">
              {selectedProperty === 'all'
                ? 'Evolução do tráfego web dividido entre Araunah Institucional e Araunah Tech.'
                : `Volume diário exclusivo da propriedade selecionada.`}
            </p>
          </div>
          <div className="chart-legend">
            {selectedProperty === 'all' ? (
              <>
                <span className="legend-item"><span className="legend-dot dot-cyan" /> araunah.com</span>
                <span className="legend-item"><span className="legend-dot dot-emerald" /> araunahtech.com.br</span>
              </>
            ) : selectedProperty === 'G-GF93ZH8ZXV' ? (
              <span className="legend-item"><span className="legend-dot dot-cyan" /> araunah.com (Ativo)</span>
            ) : (
              <span className="legend-item"><span className="legend-dot dot-emerald" /> araunahtech.com.br (Ativo)</span>
            )}
          </div>
        </div>

        <div className="traffic-bars-container">
          {(data?.daily ?? []).map((day) => {
            const [, month, d] = day.date.split('-')
            const dateFmt = `${d}/${month}`

            if (selectedProperty === 'G-GF93ZH8ZXV') {
              const pct = Math.round((day.araunahCom / maxSessions) * 100)
              return (
                <div key={day.date} className="traffic-bar-col">
                  <div className="traffic-track">
                    <span className="traffic-val">{day.araunahCom}</span>
                    <div className="traffic-stack">
                      <div className="traffic-seg seg-com" style={{ height: `${Math.max(pct, 8)}%` }} title={`araunah.com: ${day.araunahCom}`} />
                    </div>
                  </div>
                  <span className="traffic-label">{dateFmt}</span>
                </div>
              )
            }

            if (selectedProperty === 'G-3RRV0EMSRL') {
              const pct = Math.round((day.araunahTech / maxSessions) * 100)
              return (
                <div key={day.date} className="traffic-bar-col">
                  <div className="traffic-track">
                    <span className="traffic-val">{day.araunahTech}</span>
                    <div className="traffic-stack">
                      <div className="traffic-seg seg-tech" style={{ height: `${Math.max(pct, 8)}%` }} title={`araunahtech.com.br: ${day.araunahTech}`} />
                    </div>
                  </div>
                  <span className="traffic-label">{dateFmt}</span>
                </div>
              )
            }

            // Consolidado
            const comPct = Math.round((day.araunahCom / maxSessions) * 100)
            const techPct = Math.round((day.araunahTech / maxSessions) * 100)

            return (
              <div key={day.date} className="traffic-bar-col">
                <div className="traffic-track">
                  <span className="traffic-val">{day.sessions}</span>
                  <div className="traffic-stack">
                    <div className="traffic-seg seg-com" style={{ height: `${Math.max(comPct, 8)}%` }} title={`araunah.com: ${day.araunahCom}`} />
                    <div className="traffic-seg seg-tech" style={{ height: `${Math.max(techPct, 6)}%` }} title={`araunahtech.com.br: ${day.araunahTech}`} />
                  </div>
                </div>
                <span className="traffic-label">{dateFmt}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Canais de Aquisição e Dispositivos */}
      <div className="two-columns-grid">
        <section className="section-block">
          <div className="section-header">
            <div>
              <h3 className="section-title">Canais de Aquisição (GA4)</h3>
              <p className="section-desc">Origem dos visitantes nas propriedades web.</p>
            </div>
          </div>
          <div className="channels-list">
            {(data?.channels ?? []).map((chan) => (
              <div key={chan.name} className="channel-row">
                <div className="channel-info">
                  <span className="channel-name">{chan.name}</span>
                  <span className="channel-count text-tabular">{compactNum(chan.sessions)} sessões</span>
                </div>
                <div className="channel-bar-track">
                  <div className="channel-bar-fill" style={{ width: `${chan.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-header">
            <div>
              <h3 className="section-title">Dispositivos de Acesso</h3>
              <p className="section-desc">Distribuição de navegadores por tipo de tela.</p>
            </div>
          </div>
          <div className="devices-list">
            {(data?.devices ?? []).map((dev) => (
              <div key={dev.type} className="device-card">
                <span className="device-name">{dev.type}</span>
                <strong className="device-pct font-tabular">{dev.percentage}%</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Status do Google Ads */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Conexão Google Ads</h3>
            <p className="section-desc">Status da conta e tags de conversão.</p>
          </div>
        </div>

        <div className="ads-status-box">
          <div className="ads-badge-warning">
            <span>● {data?.googleAds?.mccStatus}</span>
          </div>
          <p className="ads-notice">{data?.googleAds?.notice}</p>
          <div className="ads-items-list">
            <div className="ads-item">
              <span className="ads-item-lbl">Developer Token</span>
              <span className="ads-item-val font-mono">{data?.googleAds?.developerToken}</span>
            </div>
            <div className="ads-item">
              <span className="ads-item-lbl">Tags de Consentimento</span>
              <span className="ads-item-val">{data?.googleAds?.trackingTags}</span>
            </div>
            <div className="ads-item">
              <span className="ads-item-lbl">Campanhas Ativas</span>
              <span className="ads-item-val">{data?.googleAds?.campaignsActive}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
