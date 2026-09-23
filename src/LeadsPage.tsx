import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import './LeadsPage.css'

type LeadEvent = {
  occurredAt: string | null
  crmStatus: string
  recurrence: boolean
  transfer: string
  currentObservation: string
  currentContactData: string
}

type Lead = {
  leadId: string
  occurredAt: string | null
  crmStatus: string
  name: string
  city: string
  state: string
  interest: string
  segment: string
  campaign: string
  consultant: string
  qualified: boolean
  recurrence: boolean
  recurrenceOrigin: string
  crmPersisted: boolean
  transfer: string
  currentObservation: string
  currentContactData: string
  n8nEvents: LeadEvent[]
}

type Payload = {
  generatedAt: string
  rangeDays: number
  source: string
  trackingNotice: string
  summary: {
    uniqueLeads: number
    created: number
    updated: number
    inQualification?: number
    transferConfirmed: number
    recurrent: number
  }
  leads: Lead[]
}

const periods = [7, 15, 30, 60, 90]

function statusLabel(value: string) {
  if (value === 'enviada') return 'Transferência enviada'
  if (value === 'oferecida-em-reincidencia') return 'Atendimento oferecido'
  if (value === 'em-atendimento-ia') return 'Em atendimento IA'
  return 'Sem transferência confirmada'
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

export default function LeadsPage({
  onBackToDashboard,
  embedded = false,
}: {
  onBackToDashboard?: () => void
  embedded?: boolean
}) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'crm' | 'qualificacao'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/leads-api/summary?days=${days}&internal=1`, {
        headers: {
          'x-dashboard-view': '1',
        },
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível carregar os leads n8n.')
      setData(body as Payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os leads n8n.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredLeads = useMemo(() => {
    const leads = data?.leads ?? []
    return leads.filter((lead) => {
      // Status filter
      if (statusFilter === 'crm' && lead.crmStatus !== 'criado' && lead.crmStatus !== 'atualizado') {
        return false
      }
      if (statusFilter === 'qualificacao' && lead.crmStatus !== 'em-qualificacao') {
        return false
      }
      // Search term
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        lead.name?.toLowerCase().includes(term) ||
        lead.city?.toLowerCase().includes(term) ||
        lead.state?.toLowerCase().includes(term) ||
        lead.interest?.toLowerCase().includes(term) ||
        lead.campaign?.toLowerCase().includes(term) ||
        lead.currentContactData?.toLowerCase().includes(term)
      )
    })
  }, [data?.leads, searchTerm, statusFilter])

  return (
    <div className={`leads-page ${embedded ? 'leads-embedded-pane' : ''}`}>
      {!embedded && (
        <header className="leads-header">
          <div className="leads-brand">
            <div className="leads-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#leads-grad-1)" />
                <path d="M2 17L12 22L22 17" stroke="url(#leads-grad-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="url(#leads-grad-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="leads-grad-1" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#10b981" />
                    <stop offset="1" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="leads-grad-2" x1="2" y1="12" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#34d399" />
                    <stop offset="1" stopColor="#10b981" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <span className="leads-kicker">PAINEL OPERACIONAL</span>
              <h1>Leads do Chatbot n8n & CRM</h1>
              <p>Contatos em qualificação e persistência no CRM pelo workflow <strong>CHATBOT-ARAUNAH WHATSAPP</strong>.</p>
            </div>
          </div>

          <div className="leads-actions">
            {onBackToDashboard ? (
              <button type="button" onClick={onBackToDashboard} className="leads-back-btn">
                ← Voltar ao Dashboard
              </button>
            ) : (
              <a href="/" className="leads-back-btn">
                ← Voltar ao Dashboard
              </a>
            )}
            <div className="leads-segmented-control">
              {periods.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`leads-segmented-btn ${days === item ? 'active' : ''}`}
                  onClick={() => setDays(item)}
                >
                  {item}d
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void load()} className="leads-reload-btn" disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </header>
      )}

      {embedded && (
        <div className="leads-embedded-toolbar">
          <div className="leads-segmented-control">
            {periods.map((item) => (
              <button
                key={item}
                type="button"
                className={`leads-segmented-btn ${days === item ? 'active' : ''}`}
                onClick={() => setDays(item)}
              >
                {item} dias
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} className="leads-reload-btn" disabled={loading}>
            {loading ? 'Sincronizando...' : 'Atualizar Leads'}
          </button>
        </div>
      )}

      {error ? (
        <div className="leads-error-card">
          <strong>Acesso ou leitura indisponível</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {/* Funil Operacional de Leads */}
      <section className="leads-funnel-card">
        <div className="funnel-header">
          <div>
            <span className="funnel-kicker">FLUXO DE CONVERSÃO EM TEMPO REAL</span>
            <h3 className="funnel-title">Funil Operacional de Leads</h3>
          </div>
          <span className="funnel-period-badge">Período de {days} dias</span>
        </div>

        <div className="leads-funnel-stages">
          <div className="funnel-step">
            <div className="step-badge">01</div>
            <div className="step-content">
              <span className="step-label">Captação Inbound</span>
              <strong className="step-value text-tabular">{data?.summary.uniqueLeads ?? data?.leads.length ?? 0}</strong>
              <span className="step-subtext">WhatsApp Webhook & Meta Ads</span>
            </div>
            <div className="step-rate-tag">100% Entradas</div>
            <div className="step-arrow" aria-hidden="true" />
          </div>

          <div className="funnel-step">
            <div className="step-badge">02</div>
            <div className="step-content">
              <span className="step-label">Triagem IA</span>
              <strong className="step-value font-cyan text-tabular">
                {(data?.summary.inQualification ?? 0) + (data?.summary.created ?? 0) + (data?.summary.updated ?? 0)}
              </strong>
              <span className="step-subtext">Qualificação Agente Gemini</span>
            </div>
            <div className="step-rate-tag">
              {(data?.summary.uniqueLeads ?? 0) > 0
                ? ((((data?.summary.inQualification ?? 0) + (data?.summary.created ?? 0) + (data?.summary.updated ?? 0)) / (data?.summary.uniqueLeads || 1)) * 100).toFixed(1)
                : '100'}% Triados
            </div>
            <div className="step-arrow" aria-hidden="true" />
          </div>

          <div className="funnel-step">
            <div className="step-badge">03</div>
            <div className="step-content">
              <span className="step-label">Persistência CRM</span>
              <strong className="step-value font-emerald text-tabular">
                {(data?.summary.created ?? 0) + (data?.summary.updated ?? 0)}
              </strong>
              <span className="step-subtext">Supabase RPC Leads</span>
            </div>
            <div className="step-rate-tag">
              {(data?.summary.uniqueLeads ?? 0) > 0
                ? ((((data?.summary.created ?? 0) + (data?.summary.updated ?? 0)) / (data?.summary.uniqueLeads || 1)) * 100).toFixed(1)
                : '—'}% Persistidos
            </div>
            <div className="step-arrow" aria-hidden="true" />
          </div>

          <div className="funnel-step">
            <div className="step-badge">04</div>
            <div className="step-content">
              <span className="step-label">Handoff Consultor</span>
              <strong className="step-value font-lime text-tabular">{data?.summary.transferConfirmed ?? 0}</strong>
              <span className="step-subtext">Transferência Humana WhatsApp</span>
            </div>
            <div className="step-rate-tag">
              {((data?.summary.created ?? 0) + (data?.summary.updated ?? 0)) > 0
                ? (((data?.summary.transferConfirmed ?? 0) / ((data?.summary.created ?? 0) + (data?.summary.updated ?? 0))) * 100).toFixed(1)
                : (data?.summary.uniqueLeads ?? 0) > 0
                  ? (((data?.summary.transferConfirmed ?? 0) / (data?.summary.uniqueLeads || 1)) * 100).toFixed(1)
                  : '—'}% Entregues
            </div>
          </div>
        </div>
      </section>

      <section className="leads-kpi-grid">
        <div className="leads-kpi-card highlight-emerald">
          <span className="leads-kpi-title">Leads Únicos</span>
          <strong className="leads-kpi-num text-tabular">{data?.summary.uniqueLeads ?? '—'}</strong>
          <span className="leads-kpi-detail">Contatos rastreados no período de {days} dias</span>
        </div>
        <div className="leads-kpi-card">
          <span className="leads-kpi-title">Criados no CRM</span>
          <strong className="leads-kpi-num text-tabular">{data?.summary.created ?? '—'}</strong>
          <span className="leads-kpi-detail">Novos leads inseridos no Supabase</span>
        </div>
        <div className="leads-kpi-card">
          <span className="leads-kpi-title">Em Qualificação / Atendimento</span>
          <strong className="leads-kpi-num text-tabular font-cyan">
            {data?.summary.inQualification ?? 0}
          </strong>
          <span className="leads-kpi-detail">Em diálogo ativo com o bot</span>
        </div>
        <div className="leads-kpi-card">
          <span className="leads-kpi-title">Transferências ao Consultor</span>
          <strong className="leads-kpi-num text-tabular">{data?.summary.transferConfirmed ?? '—'}</strong>
          <span className="leads-kpi-detail">Handoff confirmado pelo WhatsApp</span>
        </div>
      </section>

      {/* Barra de Filtros e Busca */}
      <section className="leads-filters-bar">
        <div className="leads-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nome, cidade, UF, interesse ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="leads-search-input"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} className="clear-search-btn">
              ✕
            </button>
          )}
        </div>

        <div className="leads-filter-pills">
          <button
            type="button"
            className={`pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            Todos ({data?.leads.length ?? 0})
          </button>
          <button
            type="button"
            className={`pill-btn ${statusFilter === 'crm' ? 'active' : ''}`}
            onClick={() => setStatusFilter('crm')}
          >
            No CRM ({(data?.summary.created ?? 0) + (data?.summary.updated ?? 0)})
          </button>
          <button
            type="button"
            className={`pill-btn ${statusFilter === 'qualificacao' ? 'active' : ''}`}
            onClick={() => setStatusFilter('qualificacao')}
          >
            Em Qualificação ({data?.summary.inQualification ?? 0})
          </button>
        </div>
      </section>

      <section className="leads-table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Contato / Nome</th>
              <th>Localização</th>
              <th>Interesse & Segmento</th>
              <th>Origem / Campanha</th>
              <th>Status CRM</th>
              <th>Transferência</th>
              <th>Última Interação</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => {
              const isOpen = expanded === lead.leadId
              const isCrm = lead.crmStatus === 'criado' || lead.crmStatus === 'atualizado'

              return (
                <Fragment key={lead.leadId}>
                  <tr
                    className={`lead-main-row ${isOpen ? 'is-expanded' : ''}`}
                    onClick={() => setExpanded(isOpen ? null : lead.leadId)}
                  >
                    <td>
                      <div className="lead-identity">
                        <span className="lead-name font-semibold">{lead.name || 'Contato Sem Nome'}</span>
                        <span className="lead-contact-muted text-tabular">{lead.currentContactData || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="lead-location">
                        {lead.city || '—'} {lead.state && lead.state !== '--' ? `· ${lead.state}` : ''}
                      </span>
                    </td>
                    <td>
                      <div className="lead-interest-cell">
                        <span className="lead-interest-text">{lead.interest || 'Em qualificação'}</span>
                        <span className="lead-tag">{lead.segment || 'Agro'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="lead-campaign-text">{lead.campaign || 'WhatsApp Direto'}</span>
                    </td>
                    <td>
                      <span className={`badge ${isCrm ? 'badge-emerald' : 'badge-cyan'}`}>
                        {lead.crmStatus === 'criado'
                          ? 'Criado CRM'
                          : lead.crmStatus === 'atualizado'
                          ? 'Atualizado CRM'
                          : 'Em Qualificação'}
                      </span>
                    </td>
                    <td>
                      <span className="transfer-status-text">{statusLabel(lead.transfer)}</span>
                    </td>
                    <td className="text-tabular">{formatDate(lead.occurredAt)}</td>
                  </tr>

                  {isOpen && (
                    <tr className="lead-details-row">
                      <td colSpan={7}>
                        <div className="lead-drawer">
                          <div className="drawer-grid">
                            <div className="drawer-item">
                              <span className="drawer-lbl">ID Interno</span>
                              <span className="drawer-val font-mono">{lead.leadId}</span>
                            </div>
                            <div className="drawer-item">
                              <span className="drawer-lbl">Consultor Atribuído</span>
                              <span className="drawer-val">{lead.consultant || 'Atendimento Chatbot'}</span>
                            </div>
                            <div className="drawer-item">
                              <span className="drawer-lbl">Qualificação Mínima</span>
                              <span className="drawer-val">{lead.qualified ? '✅ Concluída' : '⏳ Em andamento'}</span>
                            </div>
                            <div className="drawer-item">
                              <span className="drawer-lbl">Reincidência</span>
                              <span className="drawer-val">{lead.recurrence ? `Sim (${lead.recurrenceOrigin || 'CRM'})` : 'Primeiro Contato'}</span>
                            </div>
                          </div>
                          {lead.currentObservation && (
                            <div className="drawer-obs">
                              <span className="drawer-lbl">Última Mensagem / Observação</span>
                              <p className="obs-text">{lead.currentObservation}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filteredLeads.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted">
                  Nenhum lead encontrado para os filtros selecionados no período de {days} dias.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
