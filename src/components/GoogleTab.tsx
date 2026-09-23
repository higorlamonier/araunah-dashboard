import { useEffect, useState } from 'react'
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

  const totals = data?.totals ?? {
    sessions: 0,
    users: 0,
    pageviews: 0,
    avgSessionDuration: '—',
    bounceRate: '—',
  }

  const maxSessions = Math.max(...(data?.daily?.map((d) => d.sessions) ?? [100]), 50)

  return (
    <div className="tab-pane animate-fade-in">
      {/* Propriedades Monitoradas */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Propriedades Google Analytics (GA4)</h3>
            <p className="section-desc">Estrutura centralizada sob a conta araunah.tech.ltda@gmail.com.</p>
          </div>
          {loading && <span className="tab-badge cyan">Consultando GA4...</span>}
        </div>

        <div className="properties-grid">
          {(data?.properties ?? []).map((prop) => (
            <div key={prop.id} className="property-card">
              <div className="property-card-top">
                <span className="property-icon">📈</span>
                <div>
                  <h4 className="property-title">{prop.name}</h4>
                  <a href={`https://${prop.domain}`} target="_blank" rel="noopener noreferrer" className="property-domain">
                    {prop.domain} ↗
                  </a>
                </div>
                <span className="badge badge-emerald">Ativo</span>
              </div>
              <div className="property-tags">
                <span className="tag tag-neutral">ID: {prop.id}</span>
                <span className="tag tag-meta">GTM: {prop.gtmContainer}</span>
                <span className="tag tag-cyan">{prop.vertical}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* KPI Grid GA4 */}
      <section className="kpi-grid">
        <div className="kpi-card highlight-glow">
          <div className="kpi-header">
            <span className="kpi-label">Sessões Totais</span>
            <span className="badge badge-cyan">Tráfego Web</span>
          </div>
          <div className="kpi-value text-tabular font-cyan">{compactNum(totals.sessions)}</div>
          <div className="kpi-subtext">
            <span>Período de {activePeriod}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Usuários Únicos</span>
            <span className="badge badge-emerald">Visitantes</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(totals.users)}</div>
          <div className="kpi-subtext">
            <span>Alcance orgânico e direto</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Visualizações de Página</span>
            <span className="badge badge-neutral">Pageviews</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(totals.pageviews)}</div>
          <div className="kpi-subtext">
            <span>{(totals.pageviews / (totals.sessions || 1)).toFixed(1)} páginas / sessão</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Duração Média</span>
            <span className="badge badge-neutral">Engajamento</span>
          </div>
          <div className="kpi-value text-tabular">{totals.avgSessionDuration}</div>
          <div className="kpi-subtext">
            <span>Taxa de rejeição: {totals.bounceRate}</span>
          </div>
        </div>
      </section>

      {/* Gráfico Diário de Tráfego Web */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Sessões por Domínio (Diário)</h3>
            <p className="section-desc">Evolução do tráfego web dividido entre Araunah Institucional e Araunah Tech.</p>
          </div>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot dot-cyan" /> araunah.com</span>
            <span className="legend-item"><span className="legend-dot dot-emerald" /> araunahtech.com.br</span>
          </div>
        </div>

        <div className="traffic-bars-container">
          {(data?.daily ?? []).map((day) => {
            const comPct = Math.round((day.araunahCom / maxSessions) * 100)
            const techPct = Math.round((day.araunahTech / maxSessions) * 100)
            const [, month, d] = day.date.split('-')
            const dateFmt = `${d}/${month}`

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
                  <span className="channel-val text-tabular">{compactNum(chan.sessions)} sessões ({chan.percentage}%)</span>
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
              <h3 className="section-title">Google Ads & Integrações</h3>
              <p className="section-desc">Status da conta e prontidão de campanhas patrocinadas.</p>
            </div>
          </div>
          <div className="ads-status-box">
            <div className="ads-status-header">
              <span className="ads-badge-warning">🟡 {data?.googleAds?.mccStatus}</span>
            </div>
            <p className="ads-notice">{data?.googleAds?.notice}</p>
            <div className="ads-items-list">
              <div className="ads-item">
                <span className="ads-item-lbl">GTM Consent Mode v2:</span>
                <span className="ads-item-val font-emerald">Ativo e Concedido</span>
              </div>
              <div className="ads-item">
                <span className="ads-item-lbl">Campanhas Patrocinadas:</span>
                <span className="ads-item-val">0 ativas (Foco em Meta Ads)</span>
              </div>
              <div className="ads-item">
                <span className="ads-item-lbl">Dispositivos Principais:</span>
                <span className="ads-item-val text-tabular">74% Mobile · 24% Desktop · 2% Tablet</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
