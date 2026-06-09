import './App.css'
import { dashboardData } from './data/dashboardData'
import { computeKpis, decimal, integer, money, percent, trendPoints } from './lib/kpis'

function App() {
  const snapshot = dashboardData
  const kpis = computeKpis(snapshot)
  const trend = trendPoints(snapshot.daily)
  const facebook = snapshot.facebookAds
  const instagram = snapshot.instagramInsights
  const maxLeads = Math.max(...(facebook?.daily.map((day) => day.leads) ?? [0]), 1)
  const maxEngagement = Math.max(...(instagram?.daily.map((day) => day.accountsEngaged) ?? [0]), 1)

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

      {facebook && (
        <section className="panel source-section facebook-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Facebook Ads</p>
              <h2>Performance paga separada</h2>
            </div>
            <span className="badge">{integer.format(facebook.totals.rows)} linhas Windsor</span>
          </div>
          <div className="kpi-grid compact">
            <Kpi label="Investimento" value={money.format(facebook.totals.spend)} helper="Spend" />
            <Kpi label="Cliques" value={integer.format(facebook.totals.clicks)} helper="Clicks" positive />
            <Kpi label="Leads" value={integer.format(facebook.totals.leads)} helper="Actions lead" positive />
            <Kpi label="Custo por lead" value={money.format(facebook.totals.costPerLead)} helper="Spend / leads" />
            <Kpi label="Campanhas" value={integer.format(facebook.totals.campaigns)} helper="Campanhas ativas" />
            <Kpi label="Contas" value={integer.format(facebook.totals.accounts)} helper="Ad accounts" />
          </div>
          <DailyBars
            title="Leads por dia"
            days={facebook.daily.map((day) => ({ date: day.date, value: day.leads, helper: `${integer.format(day.clicks)} cliques • ${money.format(day.spend)}` }))}
            max={maxLeads}
          />
        </section>
      )}

      {instagram && (
        <section className="panel source-section instagram-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Instagram Insights</p>
              <h2>Performance orgânica separada</h2>
            </div>
            <span className="badge">{integer.format(instagram.totals.rows)} linhas Windsor</span>
          </div>
          <div className="kpi-grid compact">
            <Kpi label="Contas engajadas" value={integer.format(instagram.totals.accountsEngaged)} helper="accounts_engaged" positive />
            <Kpi label="Follows" value={integer.format(instagram.totals.follows)} helper="follows_count" positive />
            <Kpi label="Follows/unfollows" value={integer.format(instagram.totals.followsAndUnfollows)} helper="saldo informado" />
            <Kpi label="Seguidores" value={integer.format(instagram.totals.followersCount)} helper="snapshot mais recente" />
            <Kpi label="Seguidores 1d" value={integer.format(instagram.totals.followerCount1d)} helper="follower_count_1d" />
            <Kpi label="Audiência" value={integer.format(instagram.totals.audienceGenderAgeSize)} helper="gender/age size" />
          </div>
          <DailyBars
            title="Contas engajadas por dia"
            days={instagram.daily.map((day) => ({ date: day.date, value: day.accountsEngaged, helper: `${integer.format(day.follows)} follows • ${integer.format(day.followsAndUnfollows)} follow/unfollow` }))}
            max={maxEngagement}
          />
        </section>
      )}

      {!facebook && !instagram && (
        <section className="kpi-grid" aria-label="Indicadores principais">
          <Kpi label="Investimento" value={money.format(kpis.spend)} helper="Mídia paga" />
          <Kpi label="Receita" value={money.format(kpis.revenue)} helper="GA4/e-commerce" positive />
          <Kpi label="ROAS" value={`${decimal.format(kpis.roas)}x`} helper="Receita / investimento" positive={kpis.roas >= 3} />
          <Kpi label="CAC/CPA" value={money.format(kpis.cpa)} helper="Custo por conversão" />
          <Kpi label="CTR" value={percent.format(kpis.ctr)} helper="Cliques / impressões" />
          <Kpi label="CPC" value={money.format(kpis.cpc)} helper="Custo médio por clique" />
        </section>
      )}

      <section className="content-grid">
        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tendência consolidada</p>
              <h2>{facebook || instagram ? 'Leads Facebook Ads por dia' : 'Receita e investimento por dia'}</h2>
            </div>
            <span className="badge">{trend.length} dias</span>
          </div>
          <div className="bar-chart">
            {(facebook?.daily ?? trend).map((day) => {
              const value = 'leads' in day ? day.leads : day.revenue
              const max = facebook ? maxLeads : Math.max(...trend.map((item) => item.revenue), 1)
              return (
                <div className="bar-column" key={day.date} title={`${day.date}: ${integer.format(value)}`}>
                  <div className="bar revenue" style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />
                  <small>{day.date.slice(5)}</small>
                </div>
              )
            })}
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
          {facebook && <span className="status-pill ok">Facebook Ads: separado</span>}
          {instagram && <span className="status-pill ok">Instagram Insights: separado</span>}
        </div>
      </section>
    </main>
  )
}

function DailyBars({ title, days, max }: { title: string; days: Array<{ date: string; value: number; helper: string }>; max: number }) {
  return (
    <div className="daily-card">
      <strong>{title}</strong>
      <div className="mini-bars">
        {days.map((day) => (
          <div className="mini-bar-row" key={day.date}>
            <span>{day.date.slice(5)}</span>
            <div className="mini-bar-track">
              <div className="mini-bar-fill" style={{ width: `${Math.max(4, (day.value / max) * 100)}%` }} />
            </div>
            <b>{integer.format(day.value)}</b>
            <small>{day.helper}</small>
          </div>
        ))}
      </div>
    </div>
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
