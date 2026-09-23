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
    totalInteractions?: number
  }
  leads: Lead[]
}

const periods = [7, 15, 30, 60, 90]
const PAGE_SIZE = 10

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'crm' | 'qualificacao' | 'transfer'>('all')
  const [currentPage, setCurrentPage] = useState(1)

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

  // Resetar página ao trocar filtros ou período
  const handleStatusFilterChange = (filter: 'all' | 'crm' | 'qualificacao' | 'transfer') => {
    setStatusFilter(filter)
    setCurrentPage(1)
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handlePeriodChange = (p: number) => {
    setDays(p)
    setCurrentPage(1)
  }

  const filteredLeads = useMemo(() => {
    const leads = data?.leads ?? []
    return leads.filter((lead) => {
      // Filtros de status
      if (statusFilter === 'crm' && lead.crmStatus !== 'criado' && lead.crmStatus !== 'atualizado') {
        return false
      }
      if (statusFilter === 'qualificacao' && lead.crmStatus !== 'em-qualificacao') {
        return false
      }
      if (statusFilter === 'transfer' && lead.transfer !== 'enviada') {
        return false
      }
      // Busca textual
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

  // Contagens dinâmicas 1:1 com a base real
  const countAll = data?.leads?.length ?? 0
  const countQual = useMemo(() => (data?.leads ?? []).filter((l) => l.crmStatus === 'em-qualificacao').length, [data?.leads])
  const countCrm = useMemo(() => (data?.leads ?? []).filter((l) => l.crmStatus === 'criado' || l.crmStatus === 'atualizado').length, [data?.leads])
  const countTransfer = useMemo(() => (data?.leads ?? []).filter((l) => l.transfer === 'enviada').length, [data?.leads])

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE))
  const paginatedLeads = useMemo(() => {
    const startIdx = (currentPage - 1) * PAGE_SIZE
    return filteredLeads.slice(startIdx, startIdx + PAGE_SIZE)
  }, [filteredLeads, currentPage])

  // Métricas do Funil
  const totalLeads = data?.summary.uniqueLeads ?? countAll
  const inQual = countQual
  const crmPersisted = countCrm
  const transfers = countTransfer
  const totalInteractions = data?.summary.totalInteractions ?? (data?.leads ?? []).reduce((acc, l) => acc + (l.n8nEvents?.length || 1), 0)

  const triagemRate = totalLeads > 0 ? Math.min(100, Math.round((inQual / totalLeads) * 100)) : 100
  const crmRate = totalLeads > 0 ? Math.min(100, Math.round((crmPersisted / totalLeads) * 100)) : 0
  const transferRate = crmPersisted > 0
    ? Math.min(100, Math.round((transfers / crmPersisted) * 100))
    : (totalLeads > 0 ? Math.min(100, Math.round((transfers / totalLeads) * 100)) : 0)

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
                  onClick={() => handlePeriodChange(item)}
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
                onClick={() => handlePeriodChange(item)}
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
            <p className="funnel-lead-summary">
              <strong>{totalLeads}</strong> {totalLeads === 1 ? 'lead único identificado' : 'leads únicos identificados'} no período
              {totalInteractions > 0 ? ` · ${totalInteractions} mensagens trocadas com o chatbot` : ''}
            </p>
          </div>
          <span className="funnel-period-badge">Período de {days} dias</span>
        </div>

        <div className="leads-funnel-stages">
          <div className="funnel-step">
            <div className="step-badge">01</div>
            <div className="step-content">
              <span className="step-label">Captação Inbound</span>
              <strong className="step-value text-tabular">{totalLeads}</strong>
              <span className="step-subtext">WhatsApp Webhook & Meta Ads</span>
            </div>
            <div className="step-rate-tag">100% Entradas</div>
            <div className="step-arrow" aria-hidden="true" />
          </div>

          <div className="funnel-step">
            <div className="step-badge">02</div>
            <div className="step-content">
              <span className="step-label">Triagem IA</span>
              <strong className="step-value font-cyan text-tabular">{inQual}</strong>
              <span className="step-subtext">Qualificação Agente Gemini</span>
            </div>
            <div className="step-rate-tag">{triagemRate}% em Triagem</div>
            <div className="step-arrow" aria-hidden="true" />
          </div>

          <div className="funnel-step">
            <div className="step-badge">03</div>
            <div className="step-content">
              <span className="step-label">Persistência CRM</span>
              <strong className="step-value font-emerald text-tabular">{crmPersisted}</strong>
              <span className="step-subtext">Supabase RPC Leads</span>
            </div>
            <div className="step-rate-tag">{crmRate}% Persistidos</div>
            <div className="step-arrow" aria-hidden="true" />
          </div>

          <div className="funnel-step">
            <div className="step-badge">04</div>
            <div className="step-content">
              <span className="step-label">Handoff Consultor</span>
              <strong className="step-value font-lime text-tabular">{transfers}</strong>
              <span className="step-subtext">Transferência Humana WhatsApp</span>
            </div>
            <div className="step-rate-tag">{transferRate}% Entregues</div>
          </div>
        </div>
      </section>

      {/* KPI Grid */}
      <section className="leads-kpi-grid">
        <div className="leads-kpi-card highlight-emerald">
          <span className="leads-kpi-title">Leads Únicos</span>
          <strong className="leads-kpi-num text-tabular">{totalLeads}</strong>
          <span className="leads-kpi-detail">Contatos rastreados no período de {days} dias</span>
        </div>
        <div className="leads-kpi-card">
          <span className="leads-kpi-title">Em Qualificação IA</span>
          <strong className="leads-kpi-num text-tabular font-cyan">{inQual}</strong>
          <span className="leads-kpi-detail">Em diálogo ativo com o bot</span>
        </div>
        <div className="leads-kpi-card">
          <span className="leads-kpi-title">Gravados no CRM</span>
          <strong className="leads-kpi-num text-tabular">{crmPersisted}</strong>
          <span className="leads-kpi-detail">Persistidos na tabela do Supabase</span>
        </div>
        <div className="leads-kpi-card">
          <span className="leads-kpi-title">Interações de IA</span>
          <strong className="leads-kpi-num text-tabular font-emerald">{totalInteractions}</strong>
          <span className="leads-kpi-detail">Mensagens processadas no workflow</span>
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
            onChange={(e) => handleSearchChange(e.target.value)}
            className="leads-search-input"
          />
          {searchTerm && (
            <button type="button" onClick={() => handleSearchChange('')} className="clear-search-btn">
              ✕
            </button>
          )}
        </div>

        <div className="leads-filter-pills">
          <button
            type="button"
            className={`pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleStatusFilterChange('all')}
          >
            Todos ({countAll})
          </button>
          <button
            type="button"
            className={`pill-btn ${statusFilter === 'qualificacao' ? 'active' : ''}`}
            onClick={() => handleStatusFilterChange('qualificacao')}
          >
            Em Qualificação ({countQual})
          </button>
          <button
            type="button"
            className={`pill-btn ${statusFilter === 'crm' ? 'active' : ''}`}
            onClick={() => handleStatusFilterChange('crm')}
          >
            No CRM ({countCrm})
          </button>
          {countTransfer > 0 && (
            <button
              type="button"
              className={`pill-btn ${statusFilter === 'transfer' ? 'active' : ''}`}
              onClick={() => handleStatusFilterChange('transfer')}
            >
              Transferidos ({countTransfer})
            </button>
          )}
        </div>
      </section>

      {/* Tabela de Leads com Paginação */}
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
            {paginatedLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="leads-empty-row">
                  <div className="leads-empty-state">
                    <span className="empty-icon">📂</span>
                    <p>Nenhum lead encontrado com os filtros atuais.</p>
                    {searchTerm && (
                      <button type="button" onClick={() => handleSearchChange('')} className="clear-filter-link">
                        Limpar busca
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedLeads.map((lead) => {
                const isOpen = expanded === lead.leadId
                const isCrm = lead.crmStatus === 'criado' || lead.crmStatus === 'atualizado'
                const msgCount = lead.n8nEvents?.length || 1

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
                      <td>
                        <div className="lead-date-cell">
                          <span className="text-tabular">{formatDate(lead.occurredAt)}</span>
                          <span className="interaction-count-pill" title={`${msgCount} mensagens trocadas`}>
                            {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
                          </span>
                        </div>
                      </td>
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
                                <span className="drawer-val">{lead.consultant || 'Atendimento Chatbot IA'}</span>
                              </div>
                              <div className="drawer-item">
                                <span className="drawer-lbl">Qualificação Mínima</span>
                                <span className="drawer-val">{lead.qualified ? '✅ Concluída' : '⏳ Em andamento'}</span>
                              </div>
                              <div className="drawer-item">
                                <span className="drawer-lbl">Total de Mensagens</span>
                                <span className="drawer-val font-tabular">{msgCount} interações registradas</span>
                              </div>
                            </div>

                            {lead.currentObservation && (
                              <div className="drawer-obs">
                                <span className="drawer-lbl">Última Mensagem / Registro da IA:</span>
                                <p className="obs-text">{lead.currentObservation}</p>
                              </div>
                            )}

                            {lead.n8nEvents && lead.n8nEvents.length > 1 && (
                              <div className="drawer-timeline">
                                <span className="drawer-lbl">Histórico de Interações ({lead.n8nEvents.length}):</span>
                                <div className="timeline-items">
                                  {lead.n8nEvents.map((evt, idx) => (
                                    <div key={idx} className="timeline-item">
                                      <span className="timeline-time text-tabular">{formatDate(evt.occurredAt)}</span>
                                      <span className="timeline-status badge badge-neutral">{evt.crmStatus}</span>
                                      {evt.currentObservation && (
                                        <p className="timeline-msg">{evt.currentObservation}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>

        {/* Barra de Paginação */}
        {filteredLeads.length > 0 && (
          <div className="leads-pagination-bar">
            <div className="pagination-info">
              <span>
                Mostrando <strong>{(currentPage - 1) * PAGE_SIZE + 1}</strong> a{' '}
                <strong>{Math.min(currentPage * PAGE_SIZE, filteredLeads.length)}</strong> de{' '}
                <strong>{filteredLeads.length}</strong> {filteredLeads.length === 1 ? 'lead' : 'leads'}
              </span>
            </div>

            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  title="Primeira página"
                >
                  « Primeira
                </button>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  ‹ Anterior
                </button>

                <div className="pagination-pages">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`pagination-page-btn ${currentPage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Próxima página"
                >
                  Próxima ›
                </button>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Última página"
                >
                  Última »
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
