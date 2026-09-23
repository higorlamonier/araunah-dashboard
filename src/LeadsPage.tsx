import { Fragment, useCallback, useEffect, useState } from 'react'
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
  summary: { uniqueLeads: number; created: number; updated: number; transferConfirmed: number; recurrent: number }
  leads: Lead[]
}

const periods = [7, 15, 30, 60, 90]

function statusLabel(value: string) {
  if (value === 'enviada') return 'Transferência enviada'
  if (value === 'oferecida-em-reincidencia') return 'Atendimento oferecido'
  return 'Sem transferência confirmada'
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

export default function LeadsPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/leads-api/summary?days=${days}`, { credentials: 'same-origin', cache: 'no-store' })
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

  return (
    <main className="leads-shell">
      <header className="leads-header">
        <a className="leads-brand" href="/" aria-label="Voltar ao painel de marketing">
          <div className="leads-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div><strong>Araunah Agro</strong><small>Operação comercial · Leads CRM</small></div>
        </a>
        <div className="leads-header-actions">
          <span className="leads-access">Cloudflare Access</span>
          <a className="leads-back" href="/">Marketing</a>
        </div>
      </header>

      <section className="leads-hero">
        <div>
          <p className="leads-eyebrow">Painel administrativo</p>
          <h1>Leads do chatbot n8n</h1>
          <p>Somente contatos que concluíram a persistência no CRM pelo workflow <strong>CHATBOT-ARAUNAH WHATSAPP</strong>.</p>
        </div>
        <div className="leads-periods" aria-label="Período dos leads">
          {periods.map((period) => <button className={days === period ? 'active' : ''} onClick={() => setDays(period)} key={period} type="button">{period}d</button>)}
          <button className="leads-refresh" onClick={() => void load()} disabled={loading} type="button">{loading ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </section>

      {error && <section className="leads-message error"><strong>Acesso ou leitura indisponível.</strong><span>{error}</span></section>}
      {data && <section className="leads-message info"><strong>Escopo confirmado.</strong><span>{data.trackingNotice}</span></section>}

      {data && <>
        <section className="leads-kpis" aria-label="Resumo dos leads n8n">
          <article><span>Leads únicos</span><strong>{data.summary.uniqueLeads}</strong><small>CRM confirmado no n8n</small></article>
          <article><span>Novos no CRM</span><strong>{data.summary.created}</strong><small>Eventos de criação</small></article>
          <article><span>Atualizações</span><strong>{data.summary.updated}</strong><small>Eventos de reincidência</small></article>
          <article><span>Transferências</span><strong>{data.summary.transferConfirmed}</strong><small>Graph aceito pelo workflow</small></article>
        </section>

        <section className="leads-table-card">
          <div className="leads-table-head"><div><p className="leads-eyebrow">Origem n8n</p><h2>Fila qualificada</h2></div><span>Atualizado {formatDate(data.generatedAt)}</span></div>
          {data.leads.length === 0 ? <div className="leads-empty">Nenhum lead n8n com CRM confirmado no período selecionado.</div> : <div className="leads-table-wrap"><table><thead><tr><th>Contato</th><th>Interesse</th><th>CRM</th><th>Transferência</th><th>Consultor</th><th>Último evento</th><th aria-label="Detalhes" /></tr></thead><tbody>
            {data.leads.map((lead) => <Fragment key={lead.leadId}>
              <tr>
                <td><strong>{lead.name || 'Sem nome confirmado'}</strong><small>{[lead.city, lead.state].filter(Boolean).join(' · ') || 'Localização não registrada'}</small></td>
                <td><strong>{lead.interest || 'Não informado'}</strong><small>{lead.segment || lead.campaign || '—'}</small></td>
                <td><span className={`lead-pill ${lead.crmStatus === 'criado' ? 'created' : 'updated'}`}>{lead.crmStatus}</span>{lead.recurrence && <small>Reincidente</small>}</td>
                <td><span className={`lead-pill ${lead.transfer === 'enviada' ? 'sent' : 'pending'}`}>{statusLabel(lead.transfer)}</span></td>
                <td>{lead.consultant || 'Não definido'}</td>
                <td>{formatDate(lead.occurredAt)}</td>
                <td><button className="lead-details" onClick={() => setExpanded(expanded === lead.leadId ? null : lead.leadId)} type="button">{expanded === lead.leadId ? 'Fechar' : 'Detalhes'}</button></td>
              </tr>
              {expanded === lead.leadId && <tr className="lead-expand"><td colSpan={7}><div className="lead-detail-grid"><div><span>Dados registrados no contato atual</span><p>{lead.currentContactData || 'Sem detalhe adicional.'}</p></div><div><span>Observação atual do CRM</span><p>{lead.currentObservation || 'Sem observação disponível.'}</p></div><div><span>Eventos n8n no período</span><p>{lead.n8nEvents.length} evento(s). O histórico anterior ao período e o desfecho humano serão exibidos após a migração de rastreio no Supabase.</p></div></div></td></tr>}
            </Fragment>)}
          </tbody></table></div>}
        </section>
      </>}
    </main>
  )
}
