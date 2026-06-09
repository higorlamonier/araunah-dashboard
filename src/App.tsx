import './App.css'
import { dashboardData } from './data/dashboardData'
import { decimal, integer, money, safeDiv } from './lib/kpis'

const BR_TIMEZONE = 'America/Sao_Paulo'

function App() {
  const snapshot = dashboardData
  const facebook = snapshot.facebookAds
  const instagram = snapshot.instagramInsights
  const paidDaily = facebook?.daily ?? []
  const organicDaily = instagram?.daily ?? []
  const maxLeads = Math.max(...paidDaily.map((day) => day.leads), 1)
  const maxSpend = Math.max(...paidDaily.map((day) => day.spend), 1)
  const maxEngagement = Math.max(...organicDaily.map((day) => day.accountsEngaged), 1)
  const bestLeadDay = paidDaily.reduce<(typeof paidDaily)[number] | undefined>((best, day) => (!best || day.leads > best.leads ? day : best), undefined)
  const bestCplDay = paidDaily
    .filter((day) => day.leads > 0)
    .reduce<(typeof paidDaily)[number] | undefined>((best, day) => (!best || day.costPerLead < best.costPerLead ? day : best), undefined)
  const averageDailySpend = safeDiv(facebook?.totals.spend ?? 0, Math.max(paidDaily.length, 1))
  const leadRate = safeDiv(facebook?.totals.leads ?? 0, facebook?.totals.clicks ?? 0)

  return (
    <main className="app-frame">
      <aside className="sidebar" aria-label="Navegação do dashboard">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <strong>Araunah</strong>
            <span>Marketing</span>
          </div>
        </div>
        <nav>
          <a href="#resumo" className="active">Resumo</a>
          <a href="#midia-paga">Mídia paga</a>
          <a href="#instagram">Instagram</a>
          <a href="#eficiencia">Eficiência</a>
          <a href="#dados">Dados</a>
        </nav>
        <div className="sidebar-note">
          <span>Período</span>
          <strong>{formatShortDate(snapshot.period.start)} — {formatShortDate(snapshot.period.end)}</strong>
        </div>
      </aside>

      <section className="dashboard-page">
        <header className="topbar">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Performance de Marketing</h1>
          </div>
          <div className="date-chip">
            <span>{snapshot.period.label}</span>
            <strong>São Paulo · {formatDateTime(snapshot.freshness.generatedAt)}</strong>
          </div>
        </header>

        <section id="resumo" className="metric-grid" aria-label="Resumo principal">
          <MetricCard title="Investimento" value={money.format(facebook?.totals.spend ?? 0)} helper={`${money.format(averageDailySpend)} por dia`} accent="purple" />
          <MetricCard title="Leads" value={integer.format(facebook?.totals.leads ?? 0)} helper={`${decimal.format(leadRate * 100)}% clique → lead`} accent="teal" />
          <MetricCard title="CPL médio" value={money.format(facebook?.totals.costPerLead ?? 0)} helper="Custo por lead" accent="blue" />
        </section>

        <section className="dashboard-grid">
          <article id="midia-paga" className="card card-large">
            <CardHeader title="Mídia paga" subtitle="Facebook Ads" />
            <div className="overview-number">
              <strong>{integer.format(facebook?.totals.leads ?? 0)}</strong>
              <span>leads gerados</span>
            </div>
            <div className="stacked-chart" aria-label="Leads e investimento por dia">
              {paidDaily.map((day) => (
                <div className="stack-column" key={day.date}>
                  <span className="stack-value">{integer.format(day.leads)}</span>
                  <div className="stack-bars">
                    <i className="bar-purple" style={{ height: `${Math.max(16, (day.leads / maxLeads) * 96)}px` }} />
                    <i className="bar-blue" style={{ height: `${Math.max(10, (day.spend / maxSpend) * 74)}px` }} />
                  </div>
                  <small>{formatShortDate(day.date)}</small>
                </div>
              ))}
            </div>
            <div className="legend-row">
              <span><i className="dot purple" /> Leads</span>
              <span><i className="dot blue" /> Investimento</span>
            </div>
          </article>

          <article id="instagram" className="card">
            <CardHeader title="Instagram" subtitle="Orgânico" />
            <div className="overview-number compact">
              <strong>{integer.format(instagram?.totals.accountsEngaged ?? 0)}</strong>
              <span>contas engajadas</span>
            </div>
            <div className="vertical-bars" aria-label="Contas engajadas por dia">
              {organicDaily.map((day) => (
                <div className="vertical-column" key={day.date}>
                  <div className="vertical-track">
                    <i style={{ height: `${Math.max(8, (day.accountsEngaged / maxEngagement) * 150)}px` }} />
                  </div>
                  <small>{formatWeekday(day.date)}</small>
                </div>
              ))}
            </div>
          </article>

          <article id="eficiencia" className="card">
            <CardHeader title="Eficiência" subtitle="Melhores sinais" />
            <div className="efficiency-list">
              <InfoRow label="Melhor volume" value={bestLeadDay ? `${integer.format(bestLeadDay.leads)} leads` : '—'} helper={bestLeadDay ? formatDate(bestLeadDay.date) : ''} />
              <InfoRow label="Melhor CPL" value={bestCplDay ? money.format(bestCplDay.costPerLead) : '—'} helper={bestCplDay ? formatDate(bestCplDay.date) : ''} />
              <InfoRow label="Cliques" value={integer.format(facebook?.totals.clicks ?? 0)} helper="Facebook Ads" />
              <InfoRow label="Campanhas" value={integer.format(facebook?.totals.campaigns ?? 0)} helper="ativas no período" />
            </div>
          </article>

          <article className="card card-table">
            <CardHeader title="Dias de campanha" subtitle="Leads, gasto e CPL" />
            <div className="data-table">
              <div className="table-head">
                <span>Data</span>
                <span>Leads</span>
                <span>Investimento</span>
                <span>CPL</span>
              </div>
              {paidDaily.map((day) => (
                <div className="table-row" key={day.date}>
                  <span>{formatDate(day.date)}</span>
                  <strong>{integer.format(day.leads)}</strong>
                  <span>{money.format(day.spend)}</span>
                  <span>{money.format(day.costPerLead)}</span>
                </div>
              ))}
            </div>
          </article>

          <article id="dados" className="card data-card">
            <CardHeader title="Dados" subtitle="Status das fontes" />
            <div className="source-status">
              {snapshot.freshness.sources.map((source) => (
                <span className={source.status} key={source.source}>{source.source}: {translateStatus(source.status)}</span>
              ))}
              {facebook && <span className="ok">Facebook Ads: separado</span>}
              {instagram && <span className="ok">Instagram Insights: separado</span>}
              <span className="partial">Timezone: America/Sao_Paulo</span>
            </div>
          </article>
        </section>
      </section>
    </main>
  )
}

function MetricCard({ title, value, helper, accent }: { title: string; value: string; helper: string; accent: 'purple' | 'blue' | 'teal' }) {
  return (
    <article className={`metric-card ${accent}`}>
      <div className="metric-icon" />
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="card-header">
      <div>
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}

function InfoRow({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="info-row">
      <div>
        <span>{label}</span>
        <small>{helper}</small>
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00Z`))
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00Z`))
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, weekday: 'short' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '')
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

function translateStatus(status: 'ok' | 'missing' | 'partial') {
  return status === 'ok' ? 'ok' : status === 'missing' ? 'ausente' : 'parcial'
}

export default App
