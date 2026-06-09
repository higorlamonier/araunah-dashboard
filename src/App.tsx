import './App.css'
import { dashboardData } from './data/dashboardData'
import { computeKpis, decimal, groupBySource, integer, money, percent, safeDiv, trendPoints } from './lib/kpis'

function App() {
  const snapshot = dashboardData
  const kpis = computeKpis(snapshot)
  const sources = groupBySource(snapshot.daily)
  const trend = trendPoints(snapshot.daily)
  const maxRevenue = Math.max(...trend.map((day) => day.revenue), 1)

  return (
    <main className="dashboard-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Marketing Intelligence Dashboard</p>
          <h1>{snapshot.client.name}</h1>
          <p className="subtitle">{snapshot.client.segment} • {snapshot.period.label}</p>
        </div>
        <div className="freshness-card">
          <span>Atualizado em</span>
          <strong>{new Date(snapshot.freshness.generatedAt).toLocaleString('pt-BR')}</strong>
          <small>Timezone dos dados: {snapshot.freshness.dataTimezone}</small>
        </div>
      </section>

      <section className="kpi-grid" aria-label="Indicadores principais">
        {snapshot.socialTotals ? (
          <>
            <Kpi label="Leads" value={integer.format(snapshot.socialTotals.leads)} helper="Meta Ads" positive />
            <Kpi label="Visitas ao perfil" value={integer.format(snapshot.socialTotals.instagramProfileVisits)} helper="Instagram Insights" positive />
            <Kpi label="Curtidas em mídias" value={integer.format(snapshot.socialTotals.instagramMediaLikes)} helper="Conteúdo Instagram" />
            <Kpi label="Posts no feed" value={integer.format(snapshot.socialTotals.feedShares)} helper="Mídias compartilhadas" />
            <Kpi label="Campanhas" value={integer.format(snapshot.socialTotals.campaigns)} helper="Campanhas detectadas" />
            <Kpi label="Contas" value={integer.format(snapshot.socialTotals.accounts)} helper={`${integer.format(snapshot.socialTotals.rows)} linhas Windsor`} />
          </>
        ) : (
          <>
            <Kpi label="Investimento" value={money.format(kpis.spend)} helper="Mídia paga" />
            <Kpi label="Receita" value={money.format(kpis.revenue)} helper="GA4/e-commerce" positive />
            <Kpi label="ROAS" value={`${decimal.format(kpis.roas)}x`} helper="Receita / investimento" positive={kpis.roas >= 3} />
            <Kpi label="CAC/CPA" value={money.format(kpis.cpa)} helper="Custo por conversão" />
            <Kpi label="CTR" value={percent.format(kpis.ctr)} helper="Cliques / impressões" />
            <Kpi label="CPC" value={money.format(kpis.cpc)} helper="Custo médio por clique" />
          </>
        )}
      </section>

      <section className="content-grid">
        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tendência</p>
              <h2>Receita e investimento por dia</h2>
            </div>
            <span className="badge">{trend.length} dias</span>
          </div>
          <div className="bar-chart">
            {trend.map((day) => (
              <div className="bar-column" key={day.date} title={`${day.date}: ${money.format(day.revenue)}`}>
                <div className="bar revenue" style={{ height: `${Math.max(8, (day.revenue / maxRevenue) * 100)}%` }} />
                <small>{day.date.slice(5)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Alertas</p>
              <h2>Leitura executiva</h2>
            </div>
          </div>
          <div className="insight-list">
            {snapshot.insights.map((insight) => (
              <div className={`insight ${insight.severity}`} key={insight.title}>
                <strong>{insight.title}</strong>
                <p>{insight.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Canais</p>
            <h2>Performance por origem</h2>
          </div>
        </div>
        <div className="source-grid">
          {Object.entries(sources).map(([source, values]) => (
            <div className="source-card" key={source}>
              <strong>{source}</strong>
              <dl>
                <div><dt>Investimento</dt><dd>{money.format(values.spend)}</dd></div>
                <div><dt>Receita</dt><dd>{money.format(values.revenue)}</dd></div>
                <div><dt>Conversões</dt><dd>{integer.format(values.conversions)}</dd></div>
                <div><dt>ROAS</dt><dd>{decimal.format(safeDiv(values.revenue, values.spend))}x</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Qualidade dos dados</p>
            <h2>Status das fontes</h2>
          </div>
        </div>
        <div className="status-row">
          {snapshot.freshness.sources.map((source) => (
            <span className={`status-pill ${source.status}`} key={source.source}>
              {source.source}: {source.status} {source.lastDate ? `• ${source.lastDate}` : ''}
            </span>
          ))}
        </div>
      </section>
    </main>
  )
}

function Kpi({ label, value, helper, positive = false }: { label: string; value: string; helper: string; positive?: boolean }) {
  return (
    <article className={`kpi-card ${positive ? 'positive' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

export default App
