import { useCallback, useEffect, useRef, useState } from 'react'
import './ChatbotMonitorPage.css'

type CallbackStatuses = { sent: number; delivered: number; read: number; failed: number }
type Totals = {
  executions: number
  inbound: number
  callbacks: number
  ai: number
  graphAccepted: number
  transferAccepted: number
  crmCreated: number
  crmUpdated: number
  crmConfirmed: number
  crmErrors: number
  blocked: number
  failedExecutions: number
  callbackStatuses: CallbackStatuses
  identitySplit: {
    production: { inbound: number; callbacks: number; callbackStatuses: CallbackStatuses }
    other: { inbound: number; callbacks: number; callbackStatuses: CallbackStatuses }
    unknown: { inbound: number; callbacks: number; callbackStatuses: CallbackStatuses }
  }
  operationalFailures: number
  statuses: Record<string, number>
  deliveryRate: number | null
}
type DailyRow = {
  date: string
  executions: number
  inbound: number
  ai: number
  crm: number
  transfers: number
  failures: number
  callbacksFailed: number
}
type Incident = { occurredAt: string; status: string; lastNode: string }
type Payload = {
  source: string
  generatedAt: string
  rangeDays: number
  workflow: { id?: string; name: string; active: boolean; updatedAt: string | null }
  coverage: { start: string; end: string; timezone: string; executionsFetched: number; executionsInRange: number }
  totals: Totals
  daily: DailyRow[]
  incidents: Incident[]
  trackingNotice: string
  isDegraded?: boolean
  degradationReason?: string
}

const PERIODS = [7, 15, 30]
const TZ = 'America/Sao_Paulo'

function integer(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }).format(
    new Date(value),
  )
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: TZ })
    .format(new Date(`${value}T12:00:00Z`))
    .replace('.', '')
}

function rate(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function percent(value: number, total: number) {
  return total ? Math.min(100, Math.max(0, (value / total) * 100)) : 0
}

export default function ChatbotMonitorPage({
  onBackToDashboard,
  embedded = false,
}: {
  onBackToDashboard?: () => void
  embedded?: boolean
} = {}) {
  const [days, setDays] = useState(15)
  const [data, setData] = useState<Payload | null>(null)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const activeRequest = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)

    try {
      const timeout = window.setTimeout(() => controller.abort(), 35_000)
      const response = await fetch(`/chatbot-api/summary?days=${days}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      window.clearTimeout(timeout)

      const body = (await response.json().catch(() => ({}))) as Payload & { error?: string }
      if (response.ok && body.workflow) {
        setData(body)
        if (body.isDegraded) {
          setErrorNotice(body.degradationReason ?? 'Consulta com alta latência. Exibindo contingência segura.')
        } else {
          setErrorNotice(null)
        }
      } else {
        setErrorNotice(body.error ?? 'Lentidão na leitura de execuções do n8n.')
      }
    } catch {
      if (!controller.signal.aborted) {
        setErrorNotice('Serviço n8n sob alta latência. Mantendo a última leitura disponível.')
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        setLoading(false)
      }
    }
  }, [days])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(timer)
      activeRequest.current?.abort()
    }
  }, [load])

  // Fallback seguro de baseline se data for nulo
  const currentData = data ?? {
    source: 'n8n: CHATBOT-ARAUNAH WHATSAPP',
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    workflow: { id: 'eXj1wyXmjshhMOtl', name: 'CHATBOT-ARAUNAH WHATSAPP', active: true, updatedAt: null },
    coverage: { start: '', end: '', timezone: TZ, executionsFetched: 0, executionsInRange: 0 },
    totals: {
      executions: 0,
      inbound: 0,
      callbacks: 0,
      ai: 0,
      graphAccepted: 0,
      transferAccepted: 0,
      crmCreated: 0,
      crmUpdated: 0,
      crmConfirmed: 0,
      crmErrors: 0,
      blocked: 0,
      failedExecutions: 0,
      callbackStatuses: { sent: 0, delivered: 0, read: 0, failed: 0 },
      identitySplit: {
        production: { inbound: 0, callbacks: 0, callbackStatuses: { sent: 0, delivered: 0, read: 0, failed: 0 } },
        other: { inbound: 0, callbacks: 0, callbackStatuses: { sent: 0, delivered: 0, read: 0, failed: 0 } },
        unknown: { inbound: 0, callbacks: 0, callbackStatuses: { sent: 0, delivered: 0, read: 0, failed: 0 } },
      },
      operationalFailures: 0,
      statuses: {},
      deliveryRate: 100,
    },
    daily: [],
    incidents: [],
    trackingNotice: 'Métricas agregadas exclusivamente do workflow CHATBOT-ARAUNAH WHATSAPP. Sem PII.',
  }

  const totals = currentData.totals
  const callbacks = totals.identitySplit.production.callbackStatuses
  const legacyFailedCallbacks = totals.identitySplit.other.callbackStatuses.failed + totals.identitySplit.unknown.callbackStatuses.failed
  const isHealthy = currentData.workflow.active && totals.operationalFailures === 0

  return (
    <div className={`monitor-shell ${embedded ? 'monitor-embedded-pane' : ''}`}>
      {!embedded && (
        <header className="monitor-header">
          <a className="monitor-brand" href="/" aria-label="Voltar ao dashboard de marketing">
            <div className="monitor-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <div>
              <strong>Araunah · Automação WhatsApp</strong>
              <small>Monitoramento Operacional n8n</small>
            </div>
          </a>

          <div className="monitor-header-actions">
            <span className={`monitor-status ${currentData.workflow.active ? 'ok' : 'warning'}`}>
              <span className="service-dot ok" />
              <span>{currentData.workflow.active ? 'Workflow Ativo' : 'Em Verificação'}</span>
            </span>
            {onBackToDashboard ? (
              <button type="button" className="monitor-back-btn" onClick={onBackToDashboard}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
                <span>Marketing</span>
              </button>
            ) : (
              <a className="monitor-back-btn" href="/">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
                <span>Marketing</span>
              </a>
            )}
          </div>
        </header>
      )}

      <section className="monitor-hero">
        <div>
          <p className="monitor-eyebrow">
            <span className="live-pulse" style={{ background: 'var(--accent-whatsapp)' }} />
            <span>Operação · n8n · WhatsApp Cloud API</span>
          </p>
          <h1>Monitoramento do Chatbot</h1>
          <p>
            Visão técnica em tempo real do workflow <strong>CHATBOT-ARAUNAH WHATSAPP</strong>, com rastreio de ponta a ponta:
            recebimento de mensagem, triagem por IA, qualificação, persistência CRM e entrega via Graph.
          </p>
        </div>

        <div className="monitor-periods" aria-label="Selecionar período">
          <div className="monitor-periods-control" role="tablist">
            {PERIODS.map((period) => (
              <button
                className={days === period ? 'active' : ''}
                key={period}
                onClick={() => setDays(period)}
                type="button"
                role="tab"
              >
                {period}d
              </button>
            ))}
          </div>

          <button
            className="monitor-refresh-btn"
            onClick={() => void load()}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <>
                <span className="spinner-icon" />
                <span>Consultando…</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <span>Atualizar</span>
              </>
            )}
          </button>
        </div>
      </section>

      {errorNotice && (
        <aside className="status-badge-bar warning">
          <div className="status-badge-info">
            <span className="status-badge-pill">Contingência</span>
            <span>{errorNotice}</span>
          </div>
          <button className="status-badge-dismiss" onClick={() => setErrorNotice(null)} type="button">
            ✕
          </button>
        </aside>
      )}

      {/* Grid de Saúde dos Serviços (Service Health) */}
      <section className="service-health-grid" aria-label="Status dos serviços conectados">
        <div className="service-card">
          <div className="service-card-head">
            <span>n8n Engine</span>
            <span className={`service-dot ${currentData.workflow.active ? 'ok' : 'warning'}`} />
          </div>
          <strong>{currentData.workflow.active ? 'Ativo & Operante' : 'Inativo'}</strong>
          <small>ID: {currentData.workflow.id ?? 'eXj1wyXmjshhMOtl'}</small>
        </div>

        <div className="service-card">
          <div className="service-card-head">
            <span>WhatsApp Cloud API</span>
            <span className="service-dot ok" />
          </div>
          <strong>{rate(totals.deliveryRate)} Entrega</strong>
          <small>{integer(callbacks.delivered)} mensagens entregues</small>
        </div>

        <div className="service-card">
          <div className="service-card-head">
            <span>Supabase CRM</span>
            <span className="service-dot ok" />
          </div>
          <strong>{integer(totals.crmConfirmed)} Sincronizados</strong>
          <small>{integer(totals.crmCreated)} novos · {integer(totals.crmUpdated)} reincidentes</small>
        </div>

        <div className="service-card">
          <div className="service-card-head">
            <span>Agente IA</span>
            <span className="service-dot ok" />
          </div>
          <strong>{totals.inbound ? rate((totals.ai / totals.inbound) * 100) : '100%'} Taxa Resposta</strong>
          <small>{integer(totals.ai)} interações com lead</small>
        </div>
      </section>

      {/* KPIs Técnicos Principais */}
      <section className="monitor-kpis" aria-label="Indicadores do chatbot">
        <article className="monitor-metric whatsapp">
          <span>Inbound Webhook</span>
          <strong className="font-tabular">{integer(totals.inbound)}</strong>
          <small>{integer(totals.executions)} execuções n8n</small>
        </article>

        <article className="monitor-metric purple">
          <span>Respostas da IA</span>
          <strong className="font-tabular">{integer(totals.ai)}</strong>
          <small>{totals.inbound ? rate((totals.ai / totals.inbound) * 100) : '—'} dos contatos</small>
        </article>

        <article className="monitor-metric teal">
          <span>CRM Confirmado</span>
          <strong className="font-tabular">{integer(totals.crmConfirmed)}</strong>
          <small>{integer(totals.crmCreated)} novos leads</small>
        </article>

        <article className="monitor-metric blue">
          <span>Transferências Graph</span>
          <strong className="font-tabular">{integer(totals.transferAccepted)}</strong>
          <small>Aceitas para consultor</small>
        </article>

        <article className="monitor-metric whatsapp">
          <span>Entregas Meta</span>
          <strong className="font-tabular">{integer(callbacks.delivered)}</strong>
          <small>{integer(callbacks.sent)} disparos aceitos</small>
        </article>

        <article className="monitor-metric red">
          <span>Falhas Produtivas</span>
          <strong className="font-tabular">{integer(totals.operationalFailures)}</strong>
          <small>{integer(totals.crmErrors)} CRM · {integer(callbacks.failed)} entrega</small>
        </article>
      </section>

      {/* Funil Visual Técnico Interativo */}
      <section className="pipeline-funnel-card">
        <div className="card-header">
          <div>
            <h2>Funil Técnico de Processamento</h2>
            <span>Ciclo de vida da mensagem: do webhook inicial à entrega ao cliente</span>
          </div>
          <span className="card-header-badge font-tabular">{days} dias analisados</span>
        </div>

        <div className="funnel-pipeline">
          <div className="funnel-stage">
            <span className="funnel-stage-num">Etapa 01</span>
            <span className="funnel-stage-title">Inbound Webhook</span>
            <span className="funnel-stage-value font-tabular">{integer(totals.inbound)}</span>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: '100%' }} />
            </div>
            <span className="funnel-stage-rate">100% recebidas</span>
          </div>

          <div className="funnel-stage">
            <span className="funnel-stage-num">Etapa 02</span>
            <span className="funnel-stage-title">Agente IA</span>
            <span className="funnel-stage-value font-tabular">{integer(totals.ai)}</span>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${percent(totals.ai, totals.inbound)}%` }} />
            </div>
            <span className="funnel-stage-rate font-tabular">{percent(totals.ai, totals.inbound).toFixed(1)}% processadas</span>
          </div>

          <div className="funnel-stage">
            <span className="funnel-stage-num">Etapa 03</span>
            <span className="funnel-stage-title">CRM Supabase</span>
            <span className="funnel-stage-value font-tabular">{integer(totals.crmConfirmed)}</span>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${percent(totals.crmConfirmed, totals.inbound)}%` }} />
            </div>
            <span className="funnel-stage-rate font-tabular">{percent(totals.crmConfirmed, totals.inbound).toFixed(1)}% qualificados</span>
          </div>

          <div className="funnel-stage">
            <span className="funnel-stage-num">Etapa 04</span>
            <span className="funnel-stage-title">Transferência Graph</span>
            <span className="funnel-stage-value font-tabular">{integer(totals.transferAccepted)}</span>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${percent(totals.transferAccepted, totals.inbound)}%` }} />
            </div>
            <span className="funnel-stage-rate font-tabular">{percent(totals.transferAccepted, totals.inbound).toFixed(1)}% repassados</span>
          </div>

          <div className="funnel-stage">
            <span className="funnel-stage-num">Etapa 05</span>
            <span className="funnel-stage-title">Entrega Meta</span>
            <span className="funnel-stage-value font-tabular">{integer(callbacks.delivered)}</span>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${percent(callbacks.delivered, callbacks.sent || 1)}%` }} />
            </div>
            <span className="funnel-stage-rate font-tabular">{rate(totals.deliveryRate)} entrega</span>
          </div>
        </div>
      </section>

      {/* Grid Secundário: Callbacks & Incidentes */}
      <section className="monitor-grid">
        <article className="monitor-card card-delivery">
          <div className="card-header">
            <div>
              <h2>Callbacks & Entrega Meta</h2>
              <span>Status de confirmação na Cloud API</span>
            </div>
            <span className="card-header-badge font-tabular">{integer(totals.graphAccepted)} envios</span>
          </div>

          <div className="stat-tiles-grid">
            <div className="stat-tile">
              <span>Enviadas</span>
              <strong className="font-tabular">{integer(callbacks.sent)}</strong>
            </div>
            <div className="stat-tile">
              <span>Entregues</span>
              <strong className="font-tabular" style={{ color: 'var(--accent-whatsapp)' }}>{integer(callbacks.delivered)}</strong>
            </div>
            <div className="stat-tile">
              <span>Lidas</span>
              <strong className="font-tabular" style={{ color: 'var(--accent-meta)' }}>{integer(callbacks.read)}</strong>
            </div>
            <div className={`stat-tile ${callbacks.failed ? 'danger' : ''}`}>
              <span>Falhas Produtivas</span>
              <strong className="font-tabular">{integer(callbacks.failed)}</strong>
            </div>
            <div className={`stat-tile ${legacyFailedCallbacks ? 'danger' : ''}`}>
              <span>Falhas Legadas</span>
              <strong className="font-tabular">{integer(legacyFailedCallbacks)}</strong>
            </div>
            <div className="stat-tile">
              <span>Bloqueios Gate</span>
              <strong className="font-tabular">{integer(totals.blocked)}</strong>
            </div>
          </div>
        </article>

        <article className="monitor-card card-health">
          <div className="card-header">
            <div>
              <h2>Estado Operacional</h2>
              <span>Diagnóstico e conformidade</span>
            </div>
            <span className="card-header-badge" style={{ color: isHealthy ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
              {isHealthy ? 'Operação Estável' : 'Atenção Operacional'}
            </span>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            <div className="info-item">
              <div className="info-label">
                <span>Última Publicação</span>
                <small>Deploy do workflow</small>
              </div>
              <strong className="font-tabular">{formatDate(currentData.workflow.updatedAt)}</strong>
            </div>
            <div className="info-item">
              <div className="info-label">
                <span>Execuções Analisadas</span>
                <small>Janela de {days} dias</small>
              </div>
              <strong className="font-tabular">{integer(currentData.coverage.executionsInRange)}</strong>
            </div>
            <div className="info-item">
              <div className="info-label">
                <span>Execuções com Erro</span>
                <small>Falhas no n8n</small>
              </div>
              <strong className="font-tabular" style={{ color: totals.failedExecutions ? 'var(--status-error)' : 'inherit' }}>
                {integer(totals.failedExecutions)}
              </strong>
            </div>
          </div>
        </article>

        <article className="monitor-card card-daily">
          <div className="card-header">
            <div>
              <h2>Rastreamento Diário do Fluxo</h2>
              <span>Métricas agregadas por data sem identificação pessoal</span>
            </div>
            <span className="card-header-badge font-tabular">{currentData.daily.length} dias</span>
          </div>

          <div className="table-wrap">
            <table className="data-table-modern">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Inbound</th>
                  <th>Passagem IA</th>
                  <th>CRM Persistido</th>
                  <th>Transferências</th>
                  <th>Falhas</th>
                </tr>
              </thead>
              <tbody>
                {currentData.daily.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      Nenhuma execução registrada no período selecionado.
                    </td>
                  </tr>
                ) : (
                  currentData.daily.map((row) => (
                    <tr key={row.date}>
                      <td>{formatDay(row.date)}</td>
                      <td className="font-tabular">{integer(row.inbound)}</td>
                      <td className="font-tabular">{integer(row.ai)}</td>
                      <td className="font-tabular">{integer(row.crm)}</td>
                      <td className="font-tabular">{integer(row.transfers)}</td>
                      <td>
                        <span className={`table-cpl-badge ${row.failures + row.callbacksFailed > 0 ? 'good' : ''} font-tabular`} style={{ background: row.failures + row.callbacksFailed > 0 ? 'rgba(244,63,94,0.15)' : 'transparent', color: row.failures + row.callbacksFailed > 0 ? 'var(--status-error)' : 'var(--text-muted)' }}>
                          {integer(row.failures + row.callbacksFailed)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="monitor-card card-incidents">
          <div className="card-header">
            <div>
              <h2>Acompanhamento de Incidentes</h2>
              <span>Ocorrências de erro de execução recentes para investigação</span>
            </div>
            <span className="card-header-badge font-tabular">{currentData.incidents.length} registros</span>
          </div>

          {currentData.incidents.length === 0 ? (
            <div className="incident-clear">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <strong>Nenhum erro de execução registrado no período.</strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', opacity: 0.8 }}>O monitor segue em observação contínua a cada novo ciclo de atualização.</p>
              </div>
            </div>
          ) : (
            <div className="incident-terminal">
              {currentData.incidents.map((incident, idx) => (
                <div className="incident-row" key={`${incident.occurredAt}-${idx}`}>
                  <span className="incident-date">{formatDate(incident.occurredAt)}</span>
                  <span className="incident-node">{incident.lastNode}</span>
                  <span style={{ color: 'var(--status-error)', fontWeight: 700 }}>Execução com erro</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
