import { useMemo } from 'react'
import type { DashboardPeriodData, PeriodKey } from '../types'

interface MetaAdsTabProps {
  data: DashboardPeriodData | null
  activePeriod: PeriodKey
  loading: boolean
}

function currency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

function compactNum(val: number) {
  return new Intl.NumberFormat('pt-BR').format(val)
}

export default function MetaAdsTab({ data, activePeriod, loading }: MetaAdsTabProps) {
  const fbTotals = data?.facebookAds?.totals ?? { clicks: 0, spend: 0, leads: 0, costPerLead: 0, campaigns: 0 }
  const daily = useMemo(() => data?.facebookAds?.daily ?? [], [data?.facebookAds?.daily])

  // Identificar dia com melhor CPL (mínimo > 0 com leads)
  const bestCplDate = useMemo(() => {
    let minCpl = Infinity
    let best = ''
    for (const d of daily) {
      if (d.leads > 0 && d.costPerLead > 0 && d.costPerLead < minCpl) {
        minCpl = d.costPerLead
        best = d.date
      }
    }
    return best
  }, [daily])

  const maxSpend = useMemo(() => Math.max(...daily.map((d) => d.spend), 100), [daily])
  const maxLeads = useMemo(() => Math.max(...daily.map((d) => d.leads), 5), [daily])

  const campaignsList = (data as unknown as { facebookAds?: { campaignsList?: Array<{ name: string; spend: number; clicks: number; leads: number }> } })?.facebookAds?.campaignsList ?? []

  return (
    <div className="tab-pane animate-fade-in">
      {/* KPI Cards */}
      <section className="kpi-grid">
        <div className="kpi-card highlight-glow">
          <div className="kpi-header">
            <span className="kpi-label">Investimento Total</span>
            <span className="badge badge-meta">Meta Ads API</span>
          </div>
          <div className="kpi-value text-tabular">{currency(fbTotals.spend)}</div>
          <div className="kpi-subtext">
            <span>Média de {currency(daily.length > 0 ? fbTotals.spend / daily.length : 0)}/dia</span>
          </div>
        </div>

        <div className="kpi-card highlight-glow">
          <div className="kpi-header">
            <span className="kpi-label">Leads Gerados</span>
            <span className="badge badge-emerald">Conversão</span>
          </div>
          <div className="kpi-value text-tabular font-emerald">{compactNum(fbTotals.leads)}</div>
          <div className="kpi-subtext">
            <span>{fbTotals.clicks > 0 ? ((fbTotals.leads / fbTotals.clicks) * 100).toFixed(2) : 0}% taxa clique ➔ lead</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">CPL Médio</span>
            <span className="badge badge-neutral">Custo / Lead</span>
          </div>
          <div className="kpi-value text-tabular">{currency(fbTotals.costPerLead)}</div>
          <div className="kpi-subtext">
            <span>{fbTotals.leads > 0 ? 'Base consolidada' : 'Sem leads no período'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Cliques no Link</span>
            <span className="badge badge-cyan">Tráfego</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(fbTotals.clicks)}</div>
          <div className="kpi-subtext">
            <span>{campaignsList.length || fbTotals.campaigns} campanhas monitoradas</span>
          </div>
        </div>
      </section>

      {/* Gráfico Híbrido Split Bars */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Investimento vs Leads Gerados (Diário)</h3>
            <p className="section-desc">Comparativo de investimento diário em azul e conversões de leads em esmeralda.</p>
          </div>
          <div className="chart-legend">
            {loading && <span className="tag tag-meta">Atualizando...</span>}
            <span className="legend-item"><span className="legend-dot dot-meta" /> Investimento (R$)</span>
            <span className="legend-item"><span className="legend-dot dot-emerald" /> Leads</span>
          </div>
        </div>

        <div className="split-bars-container">
          {daily.map((item) => {
            const isBest = item.date === bestCplDate
            const spendPercent = Math.min(100, Math.round((item.spend / maxSpend) * 100))
            const leadsPercent = Math.min(100, Math.round((item.leads / maxLeads) * 100))
            const [, month, day] = item.date.split('-')
            const dateFmt = `${day}/${month}`

            return (
              <div key={item.date} className={`split-bar-column ${isBest ? 'is-best-cpl' : ''}`}>
                {isBest && <span className="best-cpl-badge">Melhor CPL</span>}
                <div className="bar-hover-tooltip">
                  <span className="tooltip-spend">{currency(item.spend)}</span>
                  <span className="tooltip-sep">·</span>
                  <span className="tooltip-leads">{item.leads} {item.leads === 1 ? 'lead' : 'leads'}</span>
                </div>
                <div className="bars-track">
                  <div className="bar-subcolumn">
                    <div className="bar-fill bar-meta" style={{ height: `${Math.max(spendPercent, 6)}%` }} />
                  </div>
                  <div className="bar-subcolumn">
                    <div className="bar-fill bar-emerald" style={{ height: `${Math.max(leadsPercent, item.leads > 0 ? 8 : 2)}%` }} />
                  </div>
                </div>
                <span className="bar-date-label">{dateFmt}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Campanhas Ativas */}
      {campaignsList.length > 0 && (
        <section className="section-block">
          <div className="section-header">
            <div>
              <h3 className="section-title">Campanhas em Veiculação (Meta Ads)</h3>
              <p className="section-desc">Desempenho detalhado de cada campanha no período de {activePeriod}.</p>
            </div>
          </div>
          <div className="campaigns-grid">
            {campaignsList.map((camp, idx) => (
              <div key={idx} className="campaign-card">
                <div className="campaign-card-header">
                  <h4 className="campaign-name">{camp.name}</h4>
                  <span className="badge badge-meta">Meta Ads</span>
                </div>
                <div className="campaign-stats">
                  <div className="campaign-stat">
                    <span className="stat-label">Investimento</span>
                    <span className="stat-value text-tabular">{currency(camp.spend)}</span>
                  </div>
                  <div className="campaign-stat">
                    <span className="stat-label">Cliques</span>
                    <span className="stat-value text-tabular">{compactNum(camp.clicks)}</span>
                  </div>
                  <div className="campaign-stat">
                    <span className="stat-label">Leads</span>
                    <span className="stat-value text-tabular font-emerald">{camp.leads}</span>
                  </div>
                  <div className="campaign-stat">
                    <span className="stat-label">CPL</span>
                    <span className="stat-value text-tabular">{camp.leads > 0 ? currency(camp.spend / camp.leads) : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabela de Desempenho Diário */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Relatório Diário de Mídia Paga</h3>
            <p className="section-desc">Detalhamento diário com custos e volume de conversão.</p>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th className="text-right">Investimento</th>
                <th className="text-right">Cliques</th>
                <th className="text-right">Leads</th>
                <th className="text-right">CPL</th>
                <th className="text-center">Eficiência</th>
              </tr>
            </thead>
            <tbody>
              {daily.slice().reverse().map((row) => {
                const isEfficient = row.leads > 0 && row.costPerLead <= fbTotals.costPerLead
                const [year, month, day] = row.date.split('-')
                const dateLabel = `${day}/${month}/${year}`

                return (
                  <tr key={row.date}>
                    <td className="font-semibold">{dateLabel}</td>
                    <td className="text-right text-tabular">{currency(row.spend)}</td>
                    <td className="text-right text-tabular">{compactNum(row.clicks)}</td>
                    <td className="text-right text-tabular font-emerald font-bold">{row.leads}</td>
                    <td className="text-right text-tabular">{row.leads > 0 ? currency(row.costPerLead) : '—'}</td>
                    <td className="text-center">
                      {row.leads === 0 ? (
                        <span className="tag tag-neutral">Sem conversão</span>
                      ) : isEfficient ? (
                        <span className="tag tag-success">Alta eficiência</span>
                      ) : (
                        <span className="tag tag-warning">CPL elevado</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
