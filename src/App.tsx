import './App.css'
import { dashboardData } from './data/dashboardData'
import { decimal, integer, money, safeDiv } from './lib/kpis'

type ExecutiveInsight = {
  tone: 'success' | 'warning' | 'info'
  label: string
  title: string
  detail: string
}

const BR_TIMEZONE = 'America/Sao_Paulo'

function App() {
  const snapshot = dashboardData
  const facebook = snapshot.facebookAds
  const instagram = snapshot.instagramInsights
  const paidDaily = facebook?.daily ?? []
  const organicDaily = instagram?.daily ?? []
  const maxLeads = Math.max(...paidDaily.map((day) => day.leads), 1)
  const maxEngagement = Math.max(...organicDaily.map((day) => day.accountsEngaged), 1)
  const bestLeadDay = paidDaily.reduce<(typeof paidDaily)[number] | undefined>((best, day) => (!best || day.leads > best.leads ? day : best), undefined)
  const bestCplDay = paidDaily
    .filter((day) => day.leads > 0)
    .reduce<(typeof paidDaily)[number] | undefined>((best, day) => (!best || day.costPerLead < best.costPerLead ? day : best), undefined)
  const weakCplDay = paidDaily.reduce<(typeof paidDaily)[number] | undefined>((worst, day) => (!worst || day.costPerLead > worst.costPerLead ? day : worst), undefined)
  const topEngagementDay = organicDaily.reduce<(typeof organicDaily)[number] | undefined>((best, day) => (!best || day.accountsEngaged > best.accountsEngaged ? day : best), undefined)
  const averageDailySpend = safeDiv(facebook?.totals.spend ?? snapshot.totals.spend, Math.max(paidDaily.length, 1))
  const leadRate = safeDiv(facebook?.totals.leads ?? 0, facebook?.totals.clicks ?? 0)
  const engagementPerLead = safeDiv(instagram?.totals.accountsEngaged ?? 0, facebook?.totals.leads ?? 0)
  const periodLabel = `${formatDate(snapshot.period.start)} — ${formatDate(snapshot.period.end)}`
  const generatedAt = formatDateTime(snapshot.freshness.generatedAt)

  const executiveInsights = [
    facebook && {
      tone: 'success' as const,
      label: 'Oportunidade de escala',
      title: `${integer.format(facebook.totals.leads)} leads captados com CPL médio de ${money.format(facebook.totals.costPerLead)}`,
      detail: bestCplDay
        ? `${formatDate(bestCplDay.date)} teve o melhor custo por lead (${money.format(bestCplDay.costPerLead)}). Use esse dia/campanha como referência para realocação de verba.`
        : 'Acompanhe a evolução do CPL antes de aumentar orçamento.',
    },
    weakCplDay && {
      tone: 'warning' as const,
      label: 'Ponto de atenção',
      title: `Maior CPL em ${formatDate(weakCplDay.date)}: ${money.format(weakCplDay.costPerLead)}`,
      detail: 'Revise criativos, público e distribuição de orçamento nos dias com custo acima da média.',
    },
    instagram && {
      tone: 'info' as const,
      label: 'Orgânico alimentando demanda',
      title: `${integer.format(instagram.totals.accountsEngaged)} contas engajadas no Instagram`,
      detail: topEngagementDay
        ? `${formatDate(topEngagementDay.date)} concentrou o maior engajamento (${integer.format(topEngagementDay.accountsEngaged)} contas). Transforme o tema em variações para mídia paga.`
        : 'Mantenha o Instagram separado da mídia paga para preservar leitura correta.',
    },
  ].filter((insight): insight is ExecutiveInsight => Boolean(insight))

  return (
    <main className="dashboard-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Marketing Intelligence · Araunah</p>
          <h1>Dashboard de Performance</h1>
          <p className="subtitle">Facebook Ads e Instagram Insights organizados por decisão: aquisição, conversão, engajamento e qualidade dos dados.</p>
          <div className="hero-meta" aria-label="Configuração de período e timezone">
            <span>{snapshot.period.label}</span>
            <span>{periodLabel}</span>
            <span>Fuso: São Paulo ({BR_TIMEZONE})</span>
          </div>
        </div>
        <aside className="freshness-card">
          <span>Última atualização</span>
          <strong>{generatedAt}</strong>
          <small>Dados exibidos em horário de Brasília. Fonte original: {snapshot.freshness.dataTimezone}</small>
        </aside>
      </section>

      <section className="executive-grid" aria-label="Resumo executivo">
        <Kpi label="Investimento" value={money.format(facebook?.totals.spend ?? snapshot.totals.spend)} helper={`${money.format(averageDailySpend)} / dia`} category="Mídia paga" tone="paid" />
        <Kpi label="Leads" value={integer.format(facebook?.totals.leads ?? snapshot.totals.conversions)} helper={`${decimal.format(leadRate * 100)}% clique → lead`} category="Conversão" tone="success" />
        <Kpi label="CPL médio" value={money.format(facebook?.totals.costPerLead ?? 0)} helper="Spend / leads" category="Eficiência" tone="warning" />
        <Kpi label="Cliques" value={integer.format(facebook?.totals.clicks ?? snapshot.totals.clicks)} helper="Tráfego pago Meta" category="Aquisição" tone="neutral" />
        <Kpi label="Engajamento IG" value={integer.format(instagram?.totals.accountsEngaged ?? 0)} helper={`${decimal.format(engagementPerLead)} engajamentos por lead`} category="Orgânico" tone="organic" />
      </section>

      <section className="content-grid executive-section">
        <article className="panel span-2">
          <SectionHeading eyebrow="Análise geral" title="Leitura executiva e próximas ações" badge="prioridade" />
          <div className="insight-list featured">
            {executiveInsights.map((insight) => (
              <div className={`insight ${insight.tone}`} key={insight.title}>
                <span>{insight.label}</span>
                <strong>{insight.title}</strong>
                <p>{insight.detail}</p>
              </div>
            ))}
          </div>
        </article>
        <article className="panel decision-card">
          <SectionHeading eyebrow="Diagnóstico" title="Resumo rápido" />
          <ul className="decision-list">
            <li><b>Escalar:</b> dias com CPL abaixo da média e bom volume de leads.</li>
            <li><b>Otimizar:</b> dias com gasto alto e leads abaixo do esperado.</li>
            <li><b>Conectar:</b> GA4/Google Ads para fechar ROAS, receita e jornada pós-lead.</li>
          </ul>
        </article>
      </section>

      <CategorySection
        eyebrow="Categoria 1"
        title="Aquisição e mídia paga"
        description="Mostra quanto foi investido e como o tráfego pago gerou cliques e leads."
      >
        {facebook ? (
          <>
            <div className="kpi-grid compact">
              <Kpi label="Investimento Meta" value={money.format(facebook.totals.spend)} helper="Facebook Ads" category="Spend" tone="paid" />
              <Kpi label="Cliques" value={integer.format(facebook.totals.clicks)} helper="Entrada de tráfego" category="Aquisição" tone="neutral" />
              <Kpi label="Campanhas" value={integer.format(facebook.totals.campaigns)} helper={`${integer.format(facebook.totals.accounts)} conta ativa`} category="Cobertura" tone="neutral" />
              <Kpi label="Linhas Windsor" value={integer.format(facebook.totals.rows)} helper="Dados processados" category="Fonte" tone="neutral" />
            </div>
            <DailyBars
              title="Leads por dia"
              days={paidDaily.map((day) => ({ date: day.date, value: day.leads, helper: `${integer.format(day.clicks)} cliques • ${money.format(day.spend)} investidos • CPL ${money.format(day.costPerLead)}` }))}
              max={maxLeads}
              tone="paid"
            />
          </>
        ) : <EmptyState text="Facebook Ads ainda não disponível no snapshot." />}
      </CategorySection>

      <CategorySection
        eyebrow="Categoria 2"
        title="Conversão e eficiência"
        description="Isola o que realmente vira oportunidade comercial: leads, custo por lead e melhor/pior dia de eficiência."
      >
        {facebook ? (
          <div className="efficiency-grid">
            <Kpi label="Leads totais" value={integer.format(facebook.totals.leads)} helper="Actions lead" category="Conversão" tone="success" />
            <Kpi label="CPL médio" value={money.format(facebook.totals.costPerLead)} helper="Quanto custa gerar 1 lead" category="Eficiência" tone="warning" />
            <Kpi label="Melhor dia" value={bestLeadDay ? integer.format(bestLeadDay.leads) : '—'} helper={bestLeadDay ? `${formatDate(bestLeadDay.date)} • ${money.format(bestLeadDay.costPerLead)} CPL` : 'Sem dados'} category="Volume" tone="success" />
            <Kpi label="Melhor CPL" value={bestCplDay ? money.format(bestCplDay.costPerLead) : '—'} helper={bestCplDay ? formatDate(bestCplDay.date) : 'Sem dados'} category="Benchmark" tone="success" />
          </div>
        ) : <EmptyState text="Sem dados de conversão de mídia paga." />}
      </CategorySection>

      <CategorySection
        eyebrow="Categoria 3"
        title="Instagram orgânico e demanda"
        description="Mantém Instagram Insights separado para não misturar engajamento orgânico com performance paga."
      >
        {instagram ? (
          <>
            <div className="kpi-grid compact">
              <Kpi label="Contas engajadas" value={integer.format(instagram.totals.accountsEngaged)} helper="accounts_engaged" category="Engajamento" tone="organic" />
              <Kpi label="Follows" value={integer.format(instagram.totals.follows)} helper="follows_count" category="Crescimento" tone="organic" />
              <Kpi label="Saldo follows/unfollows" value={integer.format(instagram.totals.followsAndUnfollows)} helper="saldo informado" category="Audiência" tone="neutral" />
              <Kpi label="Base audiência" value={integer.format(instagram.totals.audienceGenderAgeSize)} helper="gender/age size" category="Perfil" tone="neutral" />
            </div>
            <DailyBars
              title="Contas engajadas por dia"
              days={organicDaily.map((day) => ({ date: day.date, value: day.accountsEngaged, helper: `${integer.format(day.follows)} follows • ${integer.format(day.followsAndUnfollows)} saldo follow/unfollow` }))}
              max={maxEngagement}
              tone="organic"
            />
          </>
        ) : <EmptyState text="Instagram Insights ainda não disponível no snapshot." />}
      </CategorySection>

      <section className="content-grid">
        <article className="panel span-2">
          <SectionHeading eyebrow="Categoria 4" title="Calendário de performance" badge={`${paidDaily.length || organicDaily.length} dias`} />
          <div className="bar-chart">
            {paidDaily.map((day) => (
              <div className="bar-column" key={day.date} title={`${formatDate(day.date)}: ${integer.format(day.leads)} leads`}>
                <div className="bar revenue" style={{ height: `${Math.max(8, (day.leads / maxLeads) * 100)}%` }} />
                <small>{formatShortDate(day.date)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <SectionHeading eyebrow="Insights originais" title="Notas do snapshot" />
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

      <section className="panel data-quality-panel">
        <SectionHeading eyebrow="Categoria 5" title="Qualidade dos dados e fontes" badge="governança" />
        <div className="status-row">
          {snapshot.freshness.sources.map((source) => (
            <span className={`status-pill ${source.status}`} key={source.source}>
              {source.source}: {translateStatus(source.status)} {source.lastDate ? `• ${formatDate(source.lastDate)}` : ''}
            </span>
          ))}
          {facebook && <span className="status-pill ok">Facebook Ads: separado</span>}
          {instagram && <span className="status-pill ok">Instagram Insights: separado</span>}
          <span className="status-pill partial">Timezone aplicado: São Paulo</span>
        </div>
      </section>
    </main>
  )
}

function SectionHeading({ eyebrow, title, badge }: { eyebrow: string; title: string; badge?: string }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {badge && <span className="badge">{badge}</span>}
    </div>
  )
}

function CategorySection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="panel category-section">
      <div className="category-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}

function DailyBars({ title, days, max, tone }: { title: string; days: Array<{ date: string; value: number; helper: string }>; max: number; tone: 'paid' | 'organic' }) {
  return (
    <div className={`daily-card ${tone}`}>
      <strong>{title}</strong>
      <div className="mini-bars">
        {days.map((day) => (
          <div className="mini-bar-row" key={day.date}>
            <span>{formatShortDate(day.date)}</span>
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

function Kpi({ label, value, helper, category, tone = 'neutral' }: { label: string; value: string; helper: string; category: string; tone?: 'success' | 'warning' | 'paid' | 'organic' | 'neutral' }) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span>{category}</span>
      <strong>{value}</strong>
      <em>{label}</em>
      <small>{helper}</small>
    </article>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function formatDate(date: string) {
  const normalized = date.includes('T') ? date : `${date}T12:00:00Z`
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(normalized))
}

function formatShortDate(date: string) {
  const normalized = date.includes('T') ? date : `${date}T12:00:00Z`
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: '2-digit' }).format(new Date(normalized))
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

function translateStatus(status: 'ok' | 'missing' | 'partial') {
  return status === 'ok' ? 'ok' : status === 'missing' ? 'ausente' : 'parcial'
}

export default App
