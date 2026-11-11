import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BRAZIL_UF_ORDER,
  extractContactHintsFromMessages,
  formatCommercialLabel,
  formatPersonDisplayName,
} from './utils/brLocation'
import './LeadsPage.css'

type LeadEvent = {
  occurredAt: string | null
  crmStatus: string
  recurrence: boolean
  transfer: string
  interactionKind?: 'chat' | 'followup_3h' | 'transfer' | 'meta_form' | 'crm'
  leadMessage?: string
  botMessage?: string
  currentObservation: string
  currentContactData: string
}

type LeadSource = 'meta' | 'n8n' | 'crm'

type Lead = {
  leadId: string
  occurredAt: string | null
  crmStatus: 'em-qualificacao' | 'criado' | 'atualizado' | 'confirmacao-pendente' | string
  name: string
  city: string
  state: string
  interest: string
  metaForm?: string
  segment: string
  campaign: string
  consultant: string
  inMesa?: boolean
  crmDelivery?: 'mesa' | 'consultant' | 'pending' | ''
  commercialScope?: 'customer' | 'supplier' | ''
  qualified: boolean
  recurrence: boolean
  recurrenceOrigin: string
  crmPersisted: boolean
  transfer: string
  sources?: LeadSource[]
  acquisitionSource?: LeadSource
  acquisitionLabel?: string
  leadMessage?: string
  botMessage?: string
  currentObservation: string
  currentContactData: string
  n8nEvents: LeadEvent[]
}

type ConsultantOption = {
  uid: string
  name: string
  segment?: string
  active?: boolean
}

type SourceHealthItem = {
  status: 'ok' | 'error' | 'unconfigured' | 'partial'
  message?: string
}

type Payload = {
  generatedAt: string
  rangeDays: number | string
  source: string
  trackingNotice: string
  coverage?: {
    complete: boolean
    reasons: string[]
    executionsListed: number
    detailsRequested: number
    detailsRead: number
  }
  sourceHealth?: {
    n8nChatbot?: SourceHealthItem
    n8nMeta?: SourceHealthItem
    crm?: SourceHealthItem
  }
  summary: {
    uniqueLeads: number
    created: number
    updated: number
    inQualification?: number
    pendingConfirmation?: number
    transferConfirmed: number
    recurrent: number
    totalInteractions?: number
  }
  tabs?: {
    all: number
    process: number
    crm: number
    mesa: number
    pending?: number
  }
  facets?: {
    bySource: {
      all: number
      meta: number
      n8n: number
      crm?: number
    }
  }
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  searchMeta?: {
    query: string
    globalDatabase: boolean
    matchesOutsidePeriod: number
  }
  consultants?: ConsultantOption[]
  leads: Lead[]
}

type ViewTab = 'all' | 'process' | 'crm'
type PeriodKey = 'today' | 7 | 15 | 30

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
]

const PAGE_SIZE = 25

type LeadModalPayload = {
  leadId: string
  phone: string
  name: string
  city: string
  state: string
  interest: string
  segment: string
  campaign: string
  origin: string
  consultant: string
  observations: string
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

function formatDemandLabel(lead: Lead, acqSource: LeadSource): string {
  const isMeta = acqSource === 'meta' || Boolean(lead.sources?.includes('meta'))
  const fallback = isMeta ? '-' : 'Em Qualificação'
  const raw = isMeta ? lead.metaForm : lead.interest
  return formatCommercialLabel(raw || fallback) || fallback
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis-left' | 'ellipsis-right'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const items: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [1]
  if (currentPage > 4) items.push('ellipsis-left')
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }
  if (currentPage < totalPages - 3) items.push('ellipsis-right')
  items.push(totalPages)
  return items
}

function inferLeadOrigin(lead?: Lead | null, isCreate = false): string {
  if (!isCreate && lead?.sources?.includes('meta') && !lead?.sources?.includes('n8n')) {
    return 'Instagram'
  }
  return 'WhatsApp'
}

function getNameInitials(name: string): string {
  return (
    formatPersonDisplayName(name || 'Lead')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'LD'
  )
}

function mineConversationContext(lead: Lead) {
  const events = Array.isArray(lead?.n8nEvents) ? [...lead.n8nEvents] : []
  events.sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')))
  const clientMessages = events.map((evt) => String(evt.leadMessage || '').trim()).filter((msg) => msg && !msg.startsWith('['))
  const joined = clientMessages.join('\n')

  const scaleMatches: string[] = []
  const volumeRegex = /\b(\d+[\d.,]*\s*(?:ton|tons|toneladas?|t\/mês|t\/dia|t\/ano|m3|m³|litros?|animais|bovinos|cabeças|ha|hectares)(?:\s+de\s+[a-zA-ZÀ-ÿ\s]+)?)/gi
  for (const msg of clientMessages) {
    let match: RegExpExecArray | null
    while ((match = volumeRegex.exec(msg)) !== null) {
      const normalized = match[0].trim().replace(/\s+/g, ' ')
      if (!scaleMatches.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
        scaleMatches.push(normalized)
      }
    }
  }

  const { name, city, state } = extractContactHintsFromMessages({
    name: lead.name,
    city: lead.city,
    state: lead.state,
    messages: clientMessages,
  })

  let interest =
    lead.interest && lead.interest !== 'Aguardando interesse' && lead.interest !== 'Em qualificação'
      ? lead.interest
      : ''

  if (!interest) {
    if (/compostagem|esterco|leira|revolvedor|bioinsumo/i.test(joined)) interest = 'Compostagem'
    else if (/efluente|esgoto|lagoa|tratamento de água|decantador/i.test(joined)) interest = 'Tratamento de Água'
    else if (/silvicultura|florest|eucalipto|mogno/i.test(joined)) interest = 'Florestas'
    else if (/ulexita/i.test(joined)) interest = 'Ulexita'
  }

  let segment = lead.segment || 'Agro'
  if (/tratamento de água|efluente|esgoto|lagoa/i.test(interest)) segment = 'Água'
  else if (/florest|silvicultura|eucalipto/i.test(interest)) segment = 'Florestas'

  const summaryBlocks: string[] = []
  if (interest) summaryBlocks.push(`[DEMANDA]: ${interest}`)
  if (scaleMatches.length > 0) summaryBlocks.push(`[VOLUME/ESCALA]: ${scaleMatches.join(' | ')}`)
  if (city) summaryBlocks.push(`[LOCALIZAÇÃO]: ${city}${state ? ` - ${state}` : ''}`)

  const keyClientLines = clientMessages
    .filter((msg) => msg.length > 3 && !/^(ok|sim|não|ola|olá|obrigado|boa|bom|dia|tarde|noite|🙏🙏🙏)$/i.test(msg))
    .slice(-6)
    .map((msg) => `• Cliente: "${msg}"`)

  let richObservations = ''
  if (summaryBlocks.length > 0 || keyClientLines.length > 0) {
    richObservations = [
      ...summaryBlocks,
      ...(keyClientLines.length > 0 ? ['', '--- INTERAÇÕES PRINCIPAIS ---', ...keyClientLines] : []),
    ].join('\n')
  }

  return {
    name: name || '-',
    city: city || '-',
    state: state || '-',
    interest: interest || '-',
    segment,
    richObservations: richObservations || lead.currentObservation || 'Qualificação pelo Chatbot Araunah',
  }
}

const EMPTY_NEW_LEAD: Lead = {
  leadId: 'new',
  occurredAt: null,
  crmStatus: 'em-qualificacao',
  name: '',
  city: '',
  state: 'MG',
  interest: '',
  segment: 'Agro',
  campaign: 'Cadastro manual pelo dashboard',
  consultant: '',
  qualified: false,
  recurrence: false,
  recurrenceOrigin: '',
  crmPersisted: false,
  transfer: 'nao-confirmada',
  currentObservation: '',
  currentContactData: '',
  n8nEvents: [],
}

function LeadModal({
  lead,
  mode,
  consultants,
  onClose,
  onSave,
  isSaving,
}: {
  lead: Lead
  mode: 'create' | 'edit'
  consultants: ConsultantOption[]
  onClose: () => void
  onSave: (payload: LeadModalPayload) => void
  isSaving: boolean
}) {
  const mined = useMemo(() => mineConversationContext(lead), [lead])
  const [name, setName] = useState(() => (mined.name === '-' ? '' : formatPersonDisplayName(mined.name, '')))
  const [phone, setPhone] = useState(lead.currentContactData || '')
  const [city, setCity] = useState(() => (mined.city === '-' ? '' : mined.city))
  const [stateUf, setStateUf] = useState(() => (mined.state === '-' ? '' : mined.state))
  const [interest, setInterest] = useState(() =>
    lead.interest && lead.interest !== 'Aguardando interesse' && lead.interest !== 'Em qualificação'
      ? lead.interest
      : mined.interest === '-'
      ? ''
      : mined.interest
  )
  const [segment, setSegment] = useState(() => mined.segment || lead.segment || 'Agro')
  const [origin, setOrigin] = useState(() => inferLeadOrigin(lead, mode === 'create'))
  const [campaign, setCampaign] = useState(() =>
    lead.campaign && lead.campaign !== 'Campanha'
      ? lead.campaign
      : lead.sources?.includes('meta')
      ? 'Campanhas Meta Ads'
      : 'WhatsApp Direto'
  )

  const matchedConsultant = useMemo(() => {
    const current = lead.consultant?.trim().toLowerCase()
    if (!current || current === 'mesa' || current === 'a confirmar' || current === 'chatbot ia (qualificação)') {
      return ''
    }
    const found = consultants.find((c) => c.name.trim().toLowerCase() === current)
    return found ? found.name : lead.consultant.trim()
  }, [consultants, lead.consultant])

  const [selectedConsultant, setSelectedConsultant] = useState(matchedConsultant)
  const [observations, setObservations] = useState(() =>
    lead.currentObservation &&
    !lead.currentObservation.startsWith('Disponha') &&
    !lead.currentObservation.startsWith('Olá') &&
    lead.currentObservation.length > 20
      ? lead.currentObservation
      : mined.richObservations
  )

  const handleRepullHistory = () => {
    const refreshed = mineConversationContext(lead)
    if (refreshed.name && refreshed.name !== '-') setName(formatPersonDisplayName(refreshed.name, ''))
    if (refreshed.city && refreshed.city !== '-') setCity(refreshed.city)
    if (refreshed.state && refreshed.state !== '-') setStateUf(refreshed.state)
    if (refreshed.interest && refreshed.interest !== '-') setInterest(refreshed.interest)
    if (refreshed.segment) setSegment(refreshed.segment)
    if (refreshed.richObservations) setObservations(refreshed.richObservations)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({
      leadId: lead.leadId,
      phone: phone.trim(),
      name: formatPersonDisplayName(name.trim() || '-', '-'),
      city: city.trim() || '-',
      state: stateUf.trim() || '-',
      interest: interest.trim() || '-',
      segment,
      campaign: campaign.trim() || 'WhatsApp Direto',
      origin,
      consultant: selectedConsultant,
      observations: observations.trim(),
    })
  }

  const hasCustomExistingConsultant =
    Boolean(selectedConsultant) &&
    !consultants.some((c) => c.name.trim().toLowerCase() === selectedConsultant.trim().toLowerCase())

  return (
    <div className="lead-modal-backdrop" onClick={onClose}>
      <div className="lead-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="lead-modal-header">
          <div className="lead-modal-title-box">
            <span className="lead-modal-kicker">GESTÃO OPERACIONAL DE LEADS</span>
            <h3 className="lead-modal-title">{mode === 'create' ? 'Cadastrar novo lead' : 'Editar lead no CRM'}</h3>
            <p className="lead-modal-subtitle">
              Os dados serão confirmados pela API oficial antes de a interface indicar sucesso.
            </p>
          </div>
          <button type="button" className="lead-modal-close-btn" onClick={onClose} aria-label="Fechar modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lead-modal-form">
          <div className="lead-modal-body">
            <div className="modal-form-grid">
              <div className="modal-form-group col-span-2">
                <label className="modal-label">
                  Nome Completo / Produtor / Empresa <span className="req">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva / Fazenda Esperança"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">
                  Telefone / WhatsApp <span className="req">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: (34) 99888-7766 ou 5534998887766"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="modal-input text-tabular"
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Segmento Araunah</label>
                <select value={segment} onChange={(e) => setSegment(e.target.value)} className="modal-select">
                  <option value="Agro">Agro (Compostagem & Bioinsumos)</option>
                  <option value="Água">Água (Tratamento de Efluentes)</option>
                  <option value="Florestas">Florestas (Silvicultura)</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Cidade</label>
                <input
                  type="text"
                  placeholder="Ex: Uberlândia"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Estado (UF)</label>
                <select value={stateUf} onChange={(e) => setStateUf(e.target.value)} className="modal-select">
                  <option value="">Não Informado</option>
                  {BRAZIL_UF_ORDER.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-form-group col-span-2">
                <label className="modal-label">Interesse / Produto Solicitado</label>
                <input
                  type="text"
                  placeholder="Ex: Compostagem de esterco bovino, bioacelerador, aeração"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-form-group col-span-2">
                <label className="modal-label">Destino após salvar</label>
                <select
                  value={selectedConsultant}
                  onChange={(e) => setSelectedConsultant(e.target.value)}
                  className="modal-select font-medium"
                >
                  <option value="">Mesa de Leads — triagem final (padrão)</option>
                  {hasCustomExistingConsultant ? (
                    <option value={selectedConsultant}>{selectedConsultant} (atribuição atual)</option>
                  ) : null}
                  {consultants.map((item) => (
                    <option key={item.uid} value={item.name}>
                      {item.name}
                      {item.segment ? ` — ${item.segment}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-label">
                  Origem do Lead no CRM <span className="req">*</span>
                </label>
                <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="modal-select font-medium">
                  <option value="WhatsApp">WhatsApp (Oficial)</option>
                  <option value="Instagram">Instagram (Oficial)</option>
                  <option value="Site">Site Institucional</option>
                  <option value="Indicacao">Indicação</option>
                  <option value="Evento">Evento</option>
                  <option value="prospeccao">Prospecção Ativa</option>
                  <option value="teste">Ambiente de Teste</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Campanha / Detalhamento</label>
                <input
                  type="text"
                  placeholder="Ex: Campanhas Meta Ads, WhatsApp Direto, Orgânico"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-form-group col-span-2">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label className="modal-label">Observações & Anotações de Atendimento</label>
                  {lead.n8nEvents && lead.n8nEvents.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleRepullHistory}
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#10b981',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      title="Recarregar resumo completo minerado do histórico da conversa"
                    >
                      ↻ Puxar do Histórico da Conversa
                    </button>
                  ) : null}
                </div>
                <textarea
                  rows={6}
                  placeholder="Anotações comerciais, contexto técnico ou histórico adicional..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="modal-textarea font-mono"
                  style={{ whiteSpace: 'pre-wrap' }}
                />
              </div>
            </div>

            <div className="modal-crm-toggle">
              <span className="crm-toggle-text">
                <strong>Persistência obrigatória no CRM</strong>
                <span className="crm-toggle-subtext">
                  Criar e editar nesta tela sempre grava na API oficial de leads com releitura de confirmação.
                </span>
              </span>
            </div>
          </div>

          <div className="lead-modal-footer">
            <button type="button" className="modal-footer-btn cancel" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="modal-footer-btn submit btn-emerald" disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="btn-spinner" />
                  <span>Salvando no CRM...</span>
                </>
              ) : (
                <span>{mode === 'create' ? 'Cadastrar no CRM' : 'Salvar alterações no CRM'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LeadsPage({
  onBackToDashboard,
  embedded = false,
}: {
  onBackToDashboard?: () => void
  embedded?: boolean
}) {
  const [days, setDays] = useState<PeriodKey>(7)
  const [view, setView] = useState<ViewTab>('all')
  const [data, setData] = useState<Payload | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, boolean>>({})
  const [syncBarDismissed, setSyncBarDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const [modalLead, setModalLead] = useState<Lead | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [syncingLeadId, setSyncingLeadId] = useState<string | null>(null)
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const requestRef = useRef<AbortController | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 4500)
  }, [])

  const openEditModal = (lead: Lead) => {
    setIsCreateMode(false)
    setModalLead(lead)
    setIsModalOpen(true)
  }

  const openCreateModal = () => {
    setIsCreateMode(true)
    setModalLead(EMPTY_NEW_LEAD)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setIsCreateMode(false)
    setModalLead(null)
  }

  const currentPeriodOption = useMemo(
    () => PERIOD_OPTIONS.find((opt) => opt.key === days) ?? PERIOD_OPTIONS[1],
    [days]
  )

  const lastSyncMsRef = useRef<number>(0)
  const initialMountRef = useRef(true)

  const load = useCallback(
    async (forceRefresh = false, silent = false) => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      if (forceRefresh && !silent) {
        setDismissedAlerts({})
        setSyncBarDismissed(false)
      }
      if (!silent) setLoading(true)
      setIsSyncing(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          days: String(days),
          view,
          page: String(currentPage),
          pageSize: String(PAGE_SIZE),
        })
        if (forceRefresh) params.set('refresh', '1')
        if (searchTerm) params.set('q', searchTerm)

        const response = await fetch(`/leads-api/summary?${params.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? 'Não foi possível carregar os leads.')
        if (requestRef.current === controller) {
          setData(body as Payload)
          lastSyncMsRef.current = Date.now()
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os leads.')
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null
          setLoading(false)
          setIsSyncing(false)
        }
      }
    },
    [view, days, searchTerm, currentPage]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput.trim()), 320)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const shouldForceOnMountOrSearch = initialMountRef.current && !searchTerm
    initialMountRef.current = false
    const timer = window.setTimeout(() => void load(shouldForceOnMountOrSearch, false), 0)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(true, true)
      }
    }, 120_000)
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        if (Date.now() - lastSyncMsRef.current > 60_000) {
          void load(true, true)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityOrOnline)
    window.addEventListener('online', handleVisibilityOrOnline)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline)
      window.removeEventListener('online', handleVisibilityOrOnline)
      requestRef.current?.abort()
    }
  }, [load, searchTerm])

  const handleSendToMesa = async (lead: Lead) => {
    setSyncingLeadId(lead.leadId)
    try {
      const mined = mineConversationContext(lead)
      const response = await fetch('/leads-api/crm-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          leadId: lead.leadId,
          phone: lead.currentContactData,
          name: formatPersonDisplayName(mined.name, '-'),
          city: mined.city,
          state: mined.state,
          interest: mined.interest,
          segment: mined.segment || lead.segment || 'Agro',
          campaign:
            lead.campaign && lead.campaign !== 'Campanha'
              ? lead.campaign
              : lead.sources?.includes('meta')
              ? 'Campanhas Meta Ads'
              : 'WhatsApp Direto',
          consultant: '',
          routeToMesa: true,
          manualTransferNotice: lead.crmPersisted !== true,
          observations: mined.richObservations || lead.currentObservation || 'Qualificação pelo Chatbot Araunah',
          origin: inferLeadOrigin(lead),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Falha ao sincronizar com o CRM.')
      await load(true)
      const destinationMessage =
        body.delivery?.destination === 'consultant'
          ? `na carteira de ${formatPersonDisplayName(body.delivery.consultant || 'consultor responsável')}`
          : body.delivery?.destination === 'mesa'
          ? 'na Mesa de Leads'
          : 'no CRM'
      showToast(
        `Lead ${formatPersonDisplayName(mined.name || lead.name)} confirmado ${destinationMessage}. (ID: #${body.crmResult?.id || 'OK'})`,
        'success'
      )
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Falha ao enviar ao CRM.', 'error')
    } finally {
      setSyncingLeadId(null)
    }
  }

  const handleModalSave = async (payload: LeadModalPayload) => {
    setIsSaving(true)
    try {
      const response = await fetch('/leads-api/crm-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          action: isCreateMode || !/^\d+$/.test(payload.leadId) ? 'upsert' : 'update',
          origin: payload.origin || inferLeadOrigin(modalLead, isCreateMode),
          routeToMesa: !payload.consultant,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Falha ao salvar dados do lead.')
      closeModal()
      await load(true)
      showToast(`Lead ${payload.name} persistido e confirmado no CRM. (ID: #${body.crmResult?.id || 'OK'})`, 'success')
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Falha ao salvar lead.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteLead = async (lead: Lead) => {
    if (!/^\d+$/.test(lead.leadId)) {
      showToast('Este contato ainda não possui registro persistente no CRM para excluir.', 'info')
      return
    }
    if (!window.confirm(`Excluir ${formatPersonDisplayName(lead.name)} do CRM? O histórico do chatbot continuará disponível.`)) {
      return
    }
    setDeletingLeadId(lead.leadId)
    try {
      const response = await fetch('/leads-api/crm-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          leadId: lead.leadId,
          phone: lead.currentContactData,
          reason: 'Exclusão solicitada na Central de Leads Araunah',
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Falha ao excluir lead do CRM.')
      await load(true)
      showToast(`Lead ${formatPersonDisplayName(lead.name)} excluído do CRM.`, 'success')
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Falha ao excluir lead.', 'error')
    } finally {
      setDeletingLeadId(null)
    }
  }

  const handleViewChange = (nextView: ViewTab) => {
    setView(nextView)
    setCurrentPage(1)
    setExpanded(null)
  }

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value)
    setCurrentPage(1)
  }

  const handlePeriodChange = (period: PeriodKey) => {
    setDays(period)
    setCurrentPage(1)
  }

  const leads = data?.leads ?? []
  const countAll = data?.tabs?.all ?? 0
  const countProcess = data?.tabs?.process ?? 0
  const countCrm = data?.tabs?.crm ?? 0
  const countMesa = data?.tabs?.mesa ?? 0
  const countPending = data?.tabs?.pending ?? data?.summary.pendingConfirmation ?? 0
  const totalPages = data?.pagination?.totalPages ?? 1
  const totalItems = data?.pagination?.totalItems ?? leads.length
  const effectivePageSize = data?.pagination?.pageSize ?? PAGE_SIZE

  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages])

  const uniqueLeads = data?.summary.uniqueLeads ?? countAll
  const inProcessCount = countProcess
  const crmPersistedCount = countCrm
  const mesaCount = countMesa
  const totalInteractions =
    data?.summary.totalInteractions ?? leads.reduce((sum, item) => sum + (item.n8nEvents?.length || 1), 0)

  const triagemRate = uniqueLeads > 0 ? Math.min(100, Math.round((inProcessCount / uniqueLeads) * 100)) : 100
  const crmRate = uniqueLeads > 0 ? Math.min(100, Math.round((crmPersistedCount / uniqueLeads) * 100)) : 0
  const mesaRate = crmPersistedCount > 0 ? Math.min(100, Math.round((mesaCount / crmPersistedCount) * 100)) : 0

  const sourceHealth = data?.sourceHealth
  const sourceErrors = useMemo(() => {
    if (!sourceHealth) return []
    return Object.values(sourceHealth).filter((item) => item && item.status === 'error' && item.message)
  }, [sourceHealth])

  return (
    <div className={`leads-page ${embedded ? 'leads-embedded-pane' : ''}`}>
      {!embedded && (
        <header className="leads-header">
          <div className="leads-brand">
            <div className="leads-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#leads-grad-1)" />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="url(#leads-grad-2)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="url(#leads-grad-1)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
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
              <h1>Central de Leads Araunah</h1>
              <p>
                Captação via <strong>Meta Lead Ads</strong> ou <strong>Chatbot</strong>, com etapa comercial acompanhada no CRM.
              </p>
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
            {data?.generatedAt && (
              <span className="leads-sync-time-chip" title="Última sincronização com Meta, n8n e CRM oficial">
                <span>Sincronizado</span>
                <strong>{formatDate(data.generatedAt)}</strong>
              </span>
            )}
            <button type="button" onClick={() => void load(true, false)} className="leads-reload-btn" disabled={isSyncing}>
              {isSyncing ? 'Sincronizando...' : 'Atualizar'}
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
          <div className="leads-sync-controls">
            {data?.generatedAt && (
              <span className="leads-sync-time-chip" title="Última sincronização com Meta, n8n e CRM oficial">
                <span>Sincronizado</span>
                <strong>{formatDate(data.generatedAt)}</strong>
              </span>
            )}
            <button type="button" onClick={() => void load(true, false)} className="leads-reload-btn" disabled={isSyncing}>
              {isSyncing ? 'Sincronizando...' : 'Atualizar Leads'}
            </button>
          </div>
        </div>
      )}

      <nav className="leads-view-tabs" role="tablist" aria-label="Visualização de leads">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'all'}
          className={`leads-view-tab ${view === 'all' ? 'active' : ''}`}
          onClick={() => handleViewChange('all')}
        >
          <span>Todos ({countAll})</span>
          <small>Meta + Chatbot + CRM</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'process'}
          className={`leads-view-tab ${view === 'process' ? 'active' : ''}`}
          onClick={() => handleViewChange('process')}
        >
          <span>Em Processo ({countProcess})</span>
          <small>Chatbot em Conversa</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'crm'}
          className={`leads-view-tab ${view === 'crm' ? 'active' : ''}`}
          onClick={() => handleViewChange('crm')}
        >
          <span>CRM / Mesa ({countCrm})</span>
          <small>Persistidos na base comercial</small>
        </button>
      </nav>

      {data && !syncBarDismissed && !error && (
        <aside
          className={`status-badge-bar ${sourceErrors.length > 0 ? 'warning' : 'success'}`}
          role="status"
          aria-live="polite"
        >
          <div className="status-badge-info">
            <span className="status-badge-pill">
              {isSyncing ? 'SINCRONIZANDO' : sourceErrors.length > 0 ? 'ATENÇÃO' : 'SINCRONIZADO'}
            </span>
            <span>
              {sourceErrors.length > 0
                ? `Falha ao consultar fonte(s): ${sourceErrors.map((s) => s.message).join(' · ')} · ${formatDate(data.generatedAt)}`
                : `Base sincronizada (${currentPeriodOption.shortLabel}) com Meta Lead Ads, n8n Chatbot e CRM oficial · ${formatDate(data.generatedAt)}`}
              {data.searchMeta?.globalDatabase
                ? ` · Busca direta no banco ativa (${data.searchMeta.matchesOutsidePeriod} fora do período)`
                : ''}
            </span>
          </div>
          <button
            type="button"
            className="status-badge-dismiss"
            onClick={() => setSyncBarDismissed(true)}
            aria-label="Fechar aviso de sincronização"
          >
            ✕
          </button>
        </aside>
      )}

      {error && !dismissedAlerts[`error:${days}:${error}`] ? (
        <div className="leads-error-card" role="alert">
          <button
            type="button"
            className="leads-banner-close"
            onClick={() => setDismissedAlerts((prev) => ({ ...prev, [`error:${days}:${error}`]: true }))}
            aria-label="Fechar alerta de erro"
          >
            ✕
          </button>
          <strong>Acesso ou leitura indisponível</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {(() => {
        const errSig = sourceErrors.map((s) => s.message).join('|')
        const srcErrKey = `srcerr:${days}:${errSig}`
        if (error || sourceErrors.length === 0 || dismissedAlerts[srcErrKey]) return null
        return (
          <div className="leads-error-card" role="alert">
            <button
              type="button"
              className="leads-banner-close"
              onClick={() => setDismissedAlerts((prev) => ({ ...prev, [srcErrKey]: true }))}
              aria-label="Fechar alerta de falha nas fontes"
            >
              ✕
            </button>
            <strong>Falha na leitura das fontes</strong>
            <ul>
              {sourceErrors.map((s) => (
                <li key={s.message}>{s.message}</li>
              ))}
            </ul>
          </div>
        )
      })()}

      {(() => {
        const pendingKey = `pending:${days}:${countPending}`
        if (countPending <= 0 || error || dismissedAlerts[pendingKey]) return null
        return (
          <div className="leads-error-card" role="status">
            <button
              type="button"
              className="leads-banner-close"
              onClick={() => setDismissedAlerts((prev) => ({ ...prev, [pendingKey]: true }))}
              aria-label="Fechar aviso de confirmação pendente"
            >
              ✕
            </button>
            <strong>
              {countPending} {countPending === 1 ? 'registro com confirmação pendente' : 'registros com confirmação pendente'}
            </strong>
            <p>
              Não foi possível confirmar a gravação e o destino desses contatos. Confira na aba Em Processo e no CRM antes de reenviar.
            </p>
          </div>
        )
      })()}

      {view === 'all' && (
        <>
          <section className="leads-funnel-card">
            <div className="funnel-header">
              <div>
                <span className="funnel-kicker">FLUXO DE CONVERSÃO EM TEMPO REAL</span>
                <h3 className="funnel-title">Funil Operacional de Leads</h3>
                <p className="funnel-lead-summary">
                  <strong>{uniqueLeads}</strong> {uniqueLeads === 1 ? 'lead convertido' : 'leads convertidos'} no período
                  {totalInteractions > 0 ? ` · ${totalInteractions} interações vinculadas a leads` : ''}
                </p>
              </div>
              <span className="funnel-period-badge">Período: {currentPeriodOption.badgeLabel}</span>
            </div>

            <div className="leads-funnel-stages">
              <div className="funnel-step">
                <div className="step-badge">01</div>
                <div className="step-content">
                  <span className="step-label">Captação Inbound</span>
                  <strong className="step-value text-tabular">{uniqueLeads}</strong>
                  <span className="step-subtext">Meta, CRM e Bot confirmado</span>
                </div>
                <div className="step-rate-tag">100% Entradas</div>
                <div className="step-arrow" aria-hidden="true" />
              </div>

              <div className="funnel-step">
                <div className="step-badge">02</div>
                <div className="step-content">
                  <span className="step-label">Triagem IA</span>
                  <strong className="step-value font-cyan text-tabular">{inProcessCount}</strong>
                  <span className="step-subtext">Qualificação Agente Gemini</span>
                </div>
                <div className="step-rate-tag">{triagemRate}% em Triagem</div>
                <div className="step-arrow" aria-hidden="true" />
              </div>

              <div className="funnel-step">
                <div className="step-badge">03</div>
                <div className="step-content">
                  <span className="step-label">Persistência CRM</span>
                  <strong className="step-value font-emerald text-tabular">{crmPersistedCount}</strong>
                  <span className="step-subtext">Supabase RPC Leads</span>
                </div>
                <div className="step-rate-tag">{crmRate}% Persistidos</div>
                <div className="step-arrow" aria-hidden="true" />
              </div>

              <div className="funnel-step">
                <div className="step-badge">04</div>
                <div className="step-content">
                  <span className="step-label">Aguardando Triagem</span>
                  <strong className="step-value font-lime text-tabular">{mesaCount}</strong>
                  <span className="step-subtext">Na Mesa para triagem comercial</span>
                </div>
                <div className="step-rate-tag">{mesaRate}% do CRM na Mesa</div>
              </div>
            </div>
          </section>

          <section className="leads-kpi-grid">
            <div className="leads-kpi-card highlight-emerald">
              <span className="leads-kpi-title">Leads Únicos</span>
              <strong className="leads-kpi-num text-tabular">{uniqueLeads}</strong>
              <span className="leads-kpi-detail">Conversões válidas ({currentPeriodOption.badgeLabel})</span>
            </div>
            <div className="leads-kpi-card">
              <span className="leads-kpi-title">Em processamento</span>
              <strong className="leads-kpi-num text-tabular font-cyan">{inProcessCount}</strong>
              <span className="leads-kpi-detail">Conversas do Chatbot ainda sem cadastro</span>
            </div>
            <div className="leads-kpi-card">
              <span className="leads-kpi-title">Gravados no CRM</span>
              <strong className="leads-kpi-num text-tabular">{crmPersistedCount}</strong>
              <span className="leads-kpi-detail">Persistidos na tabela do Supabase</span>
            </div>
            <div className="leads-kpi-card">
              <span className="leads-kpi-title">Interações de IA</span>
              <strong className="leads-kpi-num text-tabular font-emerald">{totalInteractions}</strong>
              <span className="leads-kpi-detail">Mensagens processadas no workflow</span>
            </div>
          </section>

          <section className="unified-overview" aria-label="Resumo das fontes de leads">
            <div className="unified-overview-copy">
              <span className="funnel-kicker">ORIGENS DE CAPTAÇÃO</span>
              <h3>Meta Forms e Chatbot em Uma Única Visão</h3>
              <p>
                As tags identificam a origem: <strong>Meta</strong> para formulários e <strong>Chatbot</strong> para conversas.
                CRM é uma etapa comercial, exibida nas abas próprias.
              </p>
            </div>
            <div className="unified-source-stats">
              <div className="source-stat source-stat-total">
                <span>Total único</span>
                <strong>{data?.facets?.bySource?.all ?? 0}</strong>
              </div>
              <div className="source-stat source-stat-meta">
                <span>Meta Lead Ads</span>
                <strong>{data?.facets?.bySource?.meta ?? 0}</strong>
              </div>
              <div className="source-stat source-stat-n8n">
                <span>Chatbot</span>
                <strong>{data?.facets?.bySource?.n8n ?? 0}</strong>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="leads-filters-bar">
        <div className="leads-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar direto no banco (nome, telefone, cidade ou campanha em todo histórico)..."
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            className="leads-search-input"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => handleSearchInputChange('')}
              className="clear-search-btn"
              title="Limpar busca"
              aria-label="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>

        <button type="button" className="leads-create-btn" onClick={openCreateModal}>
          Novo lead
        </button>
      </section>

      {searchInput && (
        <div className="leads-search-feedback">
          <span className="search-feedback-text">
            🔍 <strong>{totalItems}</strong> {totalItems === 1 ? 'lead encontrado' : 'leads encontrados'} para "
            <em>{searchInput}</em>" · <span>Busca direta no banco CRM e histórico completo</span>
            {data?.searchMeta?.matchesOutsidePeriod ? (
              <span className="search-outside-pill"> (+{data.searchMeta.matchesOutsidePeriod} fora de {currentPeriodOption.shortLabel})</span>
            ) : null}
          </span>
          <div className="search-feedback-actions">
            <button type="button" onClick={() => handleSearchInputChange('')} className="search-feedback-clear">
              ✕ Limpar busca
            </button>
          </div>
        </div>
      )}

      <section className={`leads-table-container ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
        {loading && (
          <div className="table-sync-banner" role="status">
            <span className="btn-spinner" aria-hidden="true" />
            Atualizando leads e origens...
          </div>
        )}

        <table className="leads-table">
          <thead>
            <tr>
              <th className="lead-col-contact">Lead</th>
              <th className="lead-col-demand">Demanda</th>
              <th className="lead-col-stage">Etapa atual</th>
              <th className="lead-col-activity">Última atividade</th>
              <th className="lead-col-actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="leads-empty-row">
                  <div className="leads-empty-state">
                    <span className="empty-icon">🔍</span>
                    <p className="empty-title">
                      {searchInput
                        ? `Nenhum lead encontrado para "${searchInput}"`
                        : 'Nenhum lead encontrado com os filtros atuais.'}
                    </p>
                    <p className="empty-subtitle">
                      {searchInput
                        ? 'A busca pesquisa em nomes, telefones, cidades, interesses e nas mensagens do diálogo.'
                        : 'Tente selecionar outro status ou ampliar o período.'}
                    </p>
                    <div className="empty-state-actions">
                      {searchInput ? (
                        <button type="button" onClick={() => handleSearchInputChange('')} className="pill-btn active">
                          ✕ Limpar busca no banco
                        </button>
                      ) : days !== 30 ? (
                        <button type="button" onClick={() => handlePeriodChange(30)} className="pill-btn">
                          Ver últimos 30 dias
                        </button>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const isOpen = expanded === lead.leadId
                const isCrm = lead.crmStatus === 'criado' || lead.crmStatus === 'atualizado'
                const isPending = lead.crmStatus === 'confirmacao-pendente'
                const isTransferred = lead.transfer === 'enviada'
                const msgCount = (lead.sources?.includes('n8n') && lead.n8nEvents?.length) || 0
                const displayName = formatPersonDisplayName(lead.name)
                const sources: LeadSource[] = lead.sources?.length ? lead.sources : isCrm ? ['crm'] : ['n8n']
                const acqSource: LeadSource =
                  lead.acquisitionSource ?? (sources.includes('meta') ? 'meta' : sources.includes('n8n') ? 'n8n' : 'crm')
                const acqLabel =
                  lead.acquisitionLabel ?? (acqSource === 'meta' ? 'Meta' : acqSource === 'n8n' ? 'Chatbot' : 'CRM')

                const stageDetail =
                  lead.commercialScope === 'supplier'
                    ? 'Fornecedor/vendedor — não é oportunidade comercial'
                    : isPending
                    ? 'Aguardando releitura oficial do CRM'
                    : isTransferred
                    ? 'Cadastro no CRM confirmado'
                    : lead.transfer === 'oferecida-em-reincidencia'
                    ? 'Continuidade de atendimento oferecida'
                    : isCrm && lead.crmDelivery === 'consultant'
                    ? `Carteira de ${formatPersonDisplayName(lead.consultant || 'consultor')}`
                    : isCrm && lead.inMesa
                    ? 'Na Mesa de Leads'
                    : 'Atendimento pela IA'

                return (
                  <Fragment key={lead.leadId}>
                    <tr
                      className={`lead-main-row ${isOpen ? 'is-expanded' : ''}`}
                      onClick={() => setExpanded(isOpen ? null : lead.leadId)}
                    >
                      <td className="lead-col-contact">
                        <div className="lead-person-cell">
                          <span className="lead-avatar-mark" aria-hidden="true">
                            {getNameInitials(displayName)}
                          </span>
                          <div className="lead-identity">
                            <span className="lead-name">{displayName}</span>
                            <span className="lead-source-badges" aria-label={`Origem: ${sources.join(', ')}`}>
                              {sources.map((src) => (
                                <span key={src} className={`lead-source-badge source-${src}`}>
                                  {src === 'meta' ? 'Meta' : src === 'n8n' ? 'Chatbot' : 'CRM'}
                                </span>
                              ))}
                            </span>
                            <span className="lead-location-inline">
                              {lead.city ? formatPersonDisplayName(lead.city) : 'Localização Pendente'}
                              {lead.state && lead.state !== '--' ? ` · ${lead.state}` : ''}
                            </span>
                            <div className="lead-contact-line">
                              <span className="lead-contact-muted text-tabular">
                                {lead.currentContactData || 'Telefone pendente'}
                              </span>
                              {getWhatsAppUrl(lead.currentContactData) && (
                                <a
                                  href={getWhatsAppUrl(lead.currentContactData)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="lead-wa-link"
                                  title={`Abrir WhatsApp com ${displayName}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  WhatsApp
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="lead-col-demand">
                        <div className="lead-demand-cell">
                          <span className="lead-interest-text">{formatDemandLabel(lead, acqSource)}</span>
                          <div className="lead-context-meta">
                            <span className="lead-tag">{lead.segment ? formatCommercialLabel(lead.segment) : 'Agro'}</span>
                            <span className="lead-campaign-text">
                              {lead.campaign ? formatCommercialLabel(lead.campaign) : 'WhatsApp Direto'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="lead-col-stage">
                        <div className="lead-stage-stack">
                          <span
                            className={`badge ${
                              lead.commercialScope === 'supplier'
                                ? 'badge-danger'
                                : isCrm
                                ? 'badge-emerald'
                                : isPending
                                ? 'badge-warning'
                                : 'badge-cyan'
                            }`}
                          >
                            {lead.commercialScope === 'supplier'
                              ? 'FORA DO ESCOPO · FORNECEDOR'
                              : lead.crmStatus === 'criado'
                              ? lead.inMesa
                                ? 'CRM · Na Mesa'
                                : 'CRM · Criado'
                              : lead.crmStatus === 'atualizado'
                              ? lead.crmDelivery === 'consultant'
                                ? 'CRM · Carteira'
                                : lead.inMesa
                                ? 'CRM · Na Mesa'
                                : 'CRM · Atualizado'
                              : isPending
                              ? 'Confirmação pendente'
                              : 'Em qualificação'}
                          </span>
                          <span className={`lead-transfer-state ${isTransferred ? 'is-transferred' : 'is-active'}`}>
                            <span className="lead-transfer-dot" aria-hidden="true" />
                            {stageDetail}
                          </span>
                          {lead.consultant && (isTransferred || isCrm) && (
                            <span className="lead-consultant-name">{formatPersonDisplayName(lead.consultant)}</span>
                          )}
                        </div>
                      </td>

                      <td className="lead-col-activity">
                        <div className="lead-activity-cell">
                          <span className="lead-activity-date text-tabular">{formatDate(lead.occurredAt)}</span>
                          {msgCount > 0 ? (
                            <span className="interaction-count-pill" title={`${msgCount} mensagens trocadas`}>
                              {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
                            </span>
                          ) : (
                            <span className="lead-campaign-text">Sem conversa Chatbot</span>
                          )}
                        </div>
                      </td>

                      <td className="lead-col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="lead-row-actions">
                          {isCrm ? null : (
                            <button
                              type="button"
                              className="action-btn action-btn-crm"
                              title="Enviar este lead para a Mesa fazer a triagem final"
                              disabled={syncingLeadId === lead.leadId}
                              onClick={() => void handleSendToMesa(lead)}
                            >
                              {syncingLeadId === lead.leadId ? (
                                <span className="btn-spinner" />
                              ) : (
                                <span>Enviar para Mesa</span>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            className="action-btn action-btn-edit"
                            title="Editar informações deste lead"
                            onClick={() => openEditModal(lead)}
                          >
                            <span>Editar</span>
                          </button>
                          {isCrm && (
                            <button
                              type="button"
                              className="action-btn action-btn-delete"
                              title="Excluir este lead do CRM"
                              disabled={deletingLeadId === lead.leadId}
                              onClick={() => void handleDeleteLead(lead)}
                            >
                              <span>{deletingLeadId === lead.leadId ? 'Excluindo...' : 'Excluir'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="action-btn action-btn-details"
                            aria-expanded={isOpen}
                            title={isOpen ? 'Fechar detalhes do lead' : 'Ver detalhes do lead'}
                            onClick={() => setExpanded(isOpen ? null : lead.leadId)}
                          >
                            <span>{isOpen ? 'Fechar' : 'Detalhes'}</span>
                            <span className={`details-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true">
                              ⌄
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="lead-details-row">
                        <td colSpan={5}>
                          <div className="lead-drawer">
                            <div className="drawer-actions-bar">
                              <div className="drawer-actions-info">
                                <span
                                  className={`drawer-status-dot ${
                                    isCrm ? 'dot-crm' : isPending ? 'dot-pending' : 'dot-qual'
                                  }`}
                                />
                                <span className="drawer-status-text">
                                  Status:{' '}
                                  <strong>
                                    {isCrm
                                      ? 'Sincronizado no CRM Supabase'
                                      : isPending
                                      ? 'Confirmação pendente no CRM'
                                      : 'Em Qualificação (Chatbot IA)'}
                                  </strong>
                                  {(isCrm || isPending) && /^\d+$/.test(lead.leadId) && (
                                    <span className="drawer-crm-id"> · ID #{lead.leadId}</span>
                                  )}
                                </span>
                              </div>
                              <div className="drawer-actions-btns">
                                <button
                                  type="button"
                                  className="drawer-btn drawer-btn-primary"
                                  disabled={syncingLeadId === lead.leadId}
                                  onClick={() => void handleSendToMesa(lead)}
                                >
                                  {syncingLeadId === lead.leadId ? (
                                    <>
                                      <span className="btn-spinner" />
                                      <span>Sincronizando...</span>
                                    </>
                                  ) : isCrm ? (
                                    <span>🔄 Reenviar / Atualizar no CRM</span>
                                  ) : (
                                    <span>🚀 Enviar ao CRM Agora</span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="drawer-btn drawer-btn-secondary"
                                  onClick={() => openEditModal(lead)}
                                >
                                  <span>✏️ Editar Informações</span>
                                </button>
                                {getWhatsAppUrl(lead.currentContactData) && (
                                  <a
                                    href={getWhatsAppUrl(lead.currentContactData)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="drawer-btn drawer-btn-wa"
                                    title="Abrir WhatsApp com este contato"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span>💬 Conversar no WhatsApp</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {lead.sources?.includes('n8n') && lead.n8nEvents.length > 0 && (
                              <section
                                className="drawer-conversation-block conversation-history-prominent"
                                aria-label="Histórico completo da conversa"
                              >
                                <span className="drawer-lbl">
                                  Histórico Completo da Conversa ({lead.n8nEvents.length} Interações)
                                </span>
                                <p className="conversation-history-note">
                                  Mensagens registradas entre o cliente e o Chatbot Araunah nesta conversa.
                                </p>
                                <div className="timeline-items">
                                  {lead.n8nEvents.map((evt, idx) => {
                                    const isFollowup =
                                      evt.interactionKind === 'followup_3h' ||
                                      Boolean(evt.botMessage && evt.botMessage.includes('Passando para saber se ainda posso ajudar'))
                                    const hasBotReply = Boolean(evt.botMessage && evt.botMessage.trim())
                                    return (
                                      <article key={`${evt.occurredAt || 'evento'}-${idx}`} className="timeline-item">
                                        <div className="timeline-header">
                                          <span className="timeline-time text-tabular">{formatDate(evt.occurredAt)}</span>
                                          <span className="timeline-status badge badge-neutral">
                                            {formatCommercialLabel(evt.crmStatus)}
                                          </span>
                                        </div>
                                        <div className="timeline-messages">
                                          {evt.leadMessage && (
                                            <div className="timeline-msg-lead">
                                              <span className="timeline-role">Cliente</span>
                                              <p className="timeline-text">{evt.leadMessage}</p>
                                            </div>
                                          )}
                                          {hasBotReply && (
                                            <div className={`timeline-msg-bot ${isFollowup ? 'timeline-msg-followup' : ''}`}>
                                              <span className="timeline-role">
                                                {isFollowup ? '⏰ Chatbot (Follow-up 3h)' : 'Chatbot'}
                                              </span>
                                              <p className="timeline-text">{evt.botMessage}</p>
                                            </div>
                                          )}
                                        </div>
                                      </article>
                                    )
                                  })}
                                </div>
                              </section>
                            )}

                            <div className="drawer-grid">
                              <div className="drawer-item">
                                <span className="drawer-lbl">ID Interno</span>
                                <span className="drawer-val font-mono">{lead.leadId}</span>
                              </div>
                              <div className="drawer-item">
                                <span className="drawer-lbl">Origem da captação</span>
                                <span className="drawer-val">{acqLabel}</span>
                              </div>
                              {lead.metaForm && (
                                <div className="drawer-item">
                                  <span className="drawer-lbl">Formulário Meta</span>
                                  <span className="drawer-val">{formatCommercialLabel(lead.metaForm)}</span>
                                </div>
                              )}
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
                                <span className="drawer-val">
                                  {lead.consultant ||
                                    (lead.inMesa ? 'Sem consultor — aguardando triagem na Mesa' : 'Não atribuído')}
                                </span>
                              </div>
                              <div className="drawer-item">
                                <span className="drawer-lbl">Qualificação Mínima</span>
                                <span className="drawer-val">
                                  {lead.commercialScope === 'supplier'
                                    ? '⛔ Fora do escopo — fornecedor/vendedor'
                                    : lead.sources?.includes('n8n')
                                    ? lead.qualified
                                      ? '✅ Concluída'
                                      : '⏳ Em andamento'
                                    : '— Não verificada pelo Chatbot'}
                                </span>
                              </div>
                              <div className="drawer-item">
                                <span className="drawer-lbl">Total de Mensagens</span>
                                <span className="drawer-val font-tabular">{msgCount} interações registradas</span>
                              </div>
                            </div>
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

        {totalItems > 0 && (
          <div className="leads-pagination-bar">
            <div className="pagination-info">
              <span>
                Mostrando <strong>{(currentPage - 1) * effectivePageSize + 1}</strong> a{' '}
                <strong>{Math.min(currentPage * effectivePageSize, totalItems)}</strong> de <strong>{totalItems}</strong>{' '}
                {totalItems === 1 ? 'lead' : 'leads'}
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
                  {paginationItems.map((item) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        className={`pagination-page-btn ${currentPage === item ? 'active' : ''}`}
                        onClick={() => setCurrentPage(item)}
                        aria-label={`Ir para página ${item}`}
                        aria-current={currentPage === item ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={item} className="pagination-ellipsis" aria-hidden="true">
                        …
                      </span>
                    )
                  )}
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

      {isModalOpen && modalLead && (
        <LeadModal
          lead={modalLead}
          mode={isCreateMode ? 'create' : 'edit'}
          consultants={data?.consultants ?? []}
          onClose={closeModal}
          onSave={handleModalSave}
          isSaving={isSaving}
        />
      )}

      {toast && (
        <div className={`leads-toast-notification toast-${toast.type}`}>
          <div className="toast-icon">{toast.type === 'success' ? '✅' : toast.type === 'error' ? '⚠️' : 'ℹ️'}</div>
          <div className="toast-message">{toast.message}</div>
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Fechar notificação">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
