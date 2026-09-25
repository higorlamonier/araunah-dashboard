import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import './LeadsPage.css'

type LeadEvent = {
  occurredAt: string | null
  crmStatus: string
  recurrence: boolean
  transfer: string
  leadMessage?: string
  botMessage?: string
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
  leadMessage?: string
  botMessage?: string
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

type PeriodKey = 'today' | 7 | 15 | 30 | 'all'

type PeriodOption = {
  key: PeriodKey
  label: string
  shortLabel: string
  badgeLabel: string
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'today', label: 'Hoje (Dia Atual)', shortLabel: 'Hoje (24h)', badgeLabel: 'Hoje (Dia Atual)' },
  { key: 7, label: '7 dias', shortLabel: '7 dias', badgeLabel: 'Últimos 7 dias' },
  { key: 15, label: '15 dias', shortLabel: '15 dias', badgeLabel: 'Últimos 15 dias' },
  { key: 30, label: '30 dias', shortLabel: '30 dias', badgeLabel: 'Últimos 30 dias' },
  { key: 'all', label: 'Todo o Período', shortLabel: 'Todo o período', badgeLabel: 'Todo o Histórico' },
]

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

function getWhatsAppUrl(phoneStr: string | undefined): string | null {
  if (!phoneStr) return null
  const clean = phoneStr.replace(/\D/g, '')
  if (clean.length < 10) return null
  const full = clean.startsWith('55') ? clean : `55${clean}`
  return `https://wa.me/${full}`
}

function normalizeText(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export default function LeadsPage({
  onBackToDashboard,
  embedded = false,
}: {
  onBackToDashboard?: () => void
  embedded?: boolean
}) {
  const [days, setDays] = useState<PeriodKey>(7)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'crm' | 'qualificacao' | 'transfer'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const currentPeriodOption = useMemo(
    () => PERIOD_OPTIONS.find((opt) => opt.key === days) ?? PERIOD_OPTIONS[1],
    [days]
  )

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

  const handlePeriodChange = (p: PeriodKey) => {
    setDays(p)
    setCurrentPage(1)
  }

  const filteredLeads = useMemo(() => {
    const leads = data?.leads ?? []
    const term = normalizeText(searchTerm)
    const termDigits = searchTerm.replace(/\D/g, '')

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

      // Busca textual ampla
      if (!term) return true

      // Busca por dígitos de telefone (ex: 9979 ou 349979)
      const phoneDigits = lead.currentContactData?.replace(/\D/g, '') || ''
      if (termDigits.length >= 3 && phoneDigits.includes(termDigits)) {
        return true
      }

      // Busca nos campos principais do lead
      if (
        normalizeText(lead.name).includes(term) ||
        normalizeText(lead.city).includes(term) ||
        normalizeText(lead.state).includes(term) ||
        normalizeText(lead.interest).includes(term) ||
        normalizeText(lead.segment).includes(term) ||
        normalizeText(lead.campaign).includes(term) ||
        normalizeText(lead.consultant).includes(term) ||
        normalizeText(lead.currentContactData).includes(term) ||
        normalizeText(lead.leadMessage).includes(term) ||
        normalizeText(lead.botMessage).includes(term) ||
        normalizeText(lead.currentObservation).includes(term)
      ) {
        return true
      }

      // Busca em qualquer mensagem histórica do diálogo
      if (Array.isArray(lead.n8nEvents)) {
        return lead.n8nEvents.some(
          (e) =>
            normalizeText(e.leadMessage).includes(term) ||
            normalizeText(e.botMessage).includes(term) ||
            normalizeText(e.currentObservation).includes(term)
        )
      }

      return false
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
              {PERIOD_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`leads-segmented-btn ${days === item.key ? 'active' : ''}`}
                  onClick={() => handlePeriodChange(item.key)}
                >
                  {item.label}
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
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`leads-segmented-btn ${days === item.key ? 'active' : ''}`}
                onClick={() => handlePeriodChange(item.key)}
              >
                {item.shortLabel}
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
          <span className="funnel-period-badge">Período: {currentPeriodOption.badgeLabel}</span>
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
          <span className="leads-kpi-detail">Contatos rastreados ({currentPeriodOption.badgeLabel})</span>
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
            placeholder="Buscar por nome, telefone, cidade, interesse ou conteúdo da conversa..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="leads-search-input"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="clear-search-btn"
              title="Limpar busca"
              aria-label="Limpar busca"
            >
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

      {/* Indicador de Busca Ativa */}
      {searchTerm && (
        <div className="leads-search-feedback">
          <span className="search-feedback-text">
            🔍 <strong>{filteredLeads.length}</strong> {filteredLeads.length === 1 ? 'lead encontrado' : 'leads encontrados'} para "<em>{searchTerm}</em>"
          </span>
          <div className="search-feedback-actions">
            <button type="button" onClick={() => handleSearchChange('')} className="search-feedback-clear">
              ✕ Limpar busca
            </button>
            {days !== 'all' && (
              <button type="button" onClick={() => handlePeriodChange('all')} className="search-feedback-expand">
                🔎 Buscar em Todo o Período
              </button>
            )}
          </div>
        </div>
      )}

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
                    <span className="empty-icon">🔍</span>
                    <p className="empty-title">
                      {searchTerm
                        ? `Nenhum lead encontrado para "${searchTerm}"`
                        : 'Nenhum lead encontrado com os filtros atuais.'}
                    </p>
                    <p className="empty-subtitle">
                      {searchTerm
                        ? 'A busca pesquisa em nomes, telefones, cidades, interesses e nas mensagens do diálogo.'
                        : 'Tente selecionar outro status ou ampliar o período.'}
                    </p>
                    <div className="empty-state-actions">
                      {searchTerm && (
                        <button type="button" onClick={() => handleSearchChange('')} className="pill-btn active">
                          ✕ Limpar busca
                        </button>
                      )}
                      {days !== 'all' && (
                        <button type="button" onClick={() => handlePeriodChange('all')} className="pill-btn">
                          🔎 Buscar em Todo o Período
                        </button>
                      )}
                    </div>
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
                          <div className="lead-contact-line">
                            <span className="lead-contact-muted text-tabular">{lead.currentContactData || '—'}</span>
                            {getWhatsAppUrl(lead.currentContactData) && (
                              <a
                                href={getWhatsAppUrl(lead.currentContactData)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="lead-wa-link"
                                title={`Abrir WhatsApp com ${lead.name || 'contato'}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                                </svg>
                                <span>WhatsApp</span>
                              </a>
                            )}
                          </div>
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
                                <span className="drawer-lbl">Telefone / WhatsApp</span>
                                <span className="drawer-val font-tabular lead-drawer-contact">
                                  {lead.currentContactData || '—'}
                                  {getWhatsAppUrl(lead.currentContactData) && (
                                    <a
                                      href={getWhatsAppUrl(lead.currentContactData)!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="drawer-wa-btn"
                                      title="Abrir WhatsApp"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Abrir Conversa →
                                    </a>
                                  )}
                                </span>
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

                            {(lead.leadMessage || lead.botMessage || lead.currentObservation) && (
                              <div className="drawer-conversation-block">
                                <span className="drawer-lbl">Diálogo Recente (Mensagem do Lead & Resposta da IA):</span>
                                <div className="conversation-bubbles">
                                  {lead.leadMessage && (
                                    <div className="chat-bubble chat-bubble-lead">
                                      <div className="chat-bubble-header">
                                        <span className="chat-avatar">👤</span>
                                        <span className="chat-sender-name font-semibold">{lead.name || 'Cliente / Lead'}</span>
                                        <span className="chat-role-tag">Mensagem do Lead</span>
                                      </div>
                                      <p className="chat-bubble-text">{lead.leadMessage}</p>
                                    </div>
                                  )}
                                  {(lead.botMessage || lead.currentObservation) && (
                                    <div className="chat-bubble chat-bubble-bot">
                                      <div className="chat-bubble-header">
                                        <span className="chat-avatar">🤖</span>
                                        <span className="chat-sender-name font-semibold">Assistente Virtual (Araunah IA)</span>
                                        <span className="chat-role-tag">Resposta do Chatbot</span>
                                      </div>
                                      <p className="chat-bubble-text">{lead.botMessage || lead.currentObservation}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {lead.n8nEvents && lead.n8nEvents.length > 1 && (
                              <div className="drawer-timeline">
                                <span className="drawer-lbl">Histórico de Interações ({lead.n8nEvents.length}):</span>
                                <div className="timeline-items">
                                  {lead.n8nEvents.map((evt, idx) => (
                                    <div key={idx} className="timeline-item">
                                      <div className="timeline-header">
                                        <span className="timeline-time text-tabular">{formatDate(evt.occurredAt)}</span>
                                        <span className="timeline-status badge badge-neutral">{evt.crmStatus}</span>
                                      </div>
                                      <div className="timeline-messages">
                                        {evt.leadMessage && (
                                          <div className="timeline-msg-lead">
                                            <span className="timeline-role">👤 Cliente:</span>
                                            <p className="timeline-text">{evt.leadMessage}</p>
                                          </div>
                                        )}
                                        {(evt.botMessage || evt.currentObservation) && (
                                          <div className="timeline-msg-bot">
                                            <span className="timeline-role">🤖 IA:</span>
                                            <p className="timeline-text">{evt.botMessage || evt.currentObservation}</p>
                                          </div>
                                        )}
                                      </div>
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
