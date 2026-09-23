const DEFAULT_WORKFLOW_ID = 'eXj1wyXmjshhMOtl'
const MAX_PAGES = 8
const PAGE_SIZE = 250
let jwksCache = { expiresAt: 0, keys: [] }

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function base64urlJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

async function cloudflareKeys(teamDomain) {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length) return jwksCache.keys
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Não foi possível validar o certificado do Cloudflare Access.')
  const data = await response.json()
  jwksCache = { expiresAt: Date.now() + (10 * 60 * 1000), keys: Array.isArray(data.keys) ? data.keys : [] }
  return jwksCache.keys
}

async function requireAccess(request) {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN
  const audience = process.env.CF_ACCESS_AUD
  const allowedEmails = (process.env.CF_ACCESS_ALLOWED_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!teamDomain || !audience || !allowedEmails.length) {
    const error = new Error('O Cloudflare Access ainda não foi configurado para a área de leads.')
    error.status = 503
    throw error
  }

  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) {
    const error = new Error('Autenticação Cloudflare Access obrigatória.')
    error.status = 401
    throw error
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    const error = new Error('Token Cloudflare Access inválido.')
    error.status = 401
    throw error
  }

  const header = base64urlJson(parts[0])
  const payload = base64urlJson(parts[1])
  if (header.alg !== 'RS256' || !header.kid || payload.iss !== `https://${teamDomain}/`) {
    const error = new Error('Token Cloudflare Access não corresponde à política configurada.')
    error.status = 401
    throw error
  }
  if (Number(payload.exp ?? 0) <= Math.floor(Date.now() / 1000)) {
    const error = new Error('Sessão Cloudflare Access expirada.')
    error.status = 401
    throw error
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(audience)) {
    const error = new Error('Audiência Cloudflare Access não autorizada.')
    error.status = 401
    throw error
  }

  const key = (await cloudflareKeys(teamDomain)).find((item) => item.kid === header.kid)
  if (!key) {
    const error = new Error('Chave de assinatura Cloudflare Access não encontrada.')
    error.status = 401
    throw error
  }
  const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, Buffer.from(parts[2], 'base64url'), Buffer.from(`${parts[0]}.${parts[1]}`))
  if (!valid) {
    const error = new Error('Assinatura Cloudflare Access inválida.')
    error.status = 401
    throw error
  }

  const email = String(payload.email ?? '').trim().toLowerCase()
  if (!allowedEmails.includes(email)) {
    const error = new Error('Usuário não autorizado para o painel de leads.')
    error.status = 403
    throw error
  }
  return { email }
}

function nodeItems(execution, nodeName) {
  const runs = execution?.data?.resultData?.runData?.[nodeName] ?? []
  const items = []
  for (const run of runs) {
    for (const branch of run?.data?.main ?? []) {
      for (const item of branch ?? []) {
        if (item && typeof item.json === 'object' && item.json !== null) items.push(item.json)
      }
    }
  }
  return items
}

function firstNodeItem(execution, nodeName) {
  return nodeItems(execution, nodeName)[0] ?? {}
}

function executionDate(execution) {
  const raw = execution?.startedAt ?? execution?.createdAt ?? execution?.stoppedAt
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null
}

function redactObservation(value) {
  return typeof value === 'string' ? value.trim().slice(0, 1400) : ''
}

function buildLeadEvent(execution) {
  const crm = firstNodeItem(execution, 'API SUPABASE')
  const leadId = crm.id
  if (!leadId || !crm.status) return null
  const organized = firstNodeItem(execution, 'ORGANIZAR DADOS DO AGENT')
  const recurrence = firstNodeItem(execution, 'IF Lead Reincidente Atualizado')
  const recurrenceReply = firstNodeItem(execution, 'Preparar Resposta Lead Reincidente')
  const transfer = firstNodeItem(execution, 'Enviar Resposta do Robô (Transferencia)')
  const transferConfirmed = Array.isArray(transfer.messages) && transfer.messages.length > 0
  const recurrent = recurrence.lead_reincidente === true || crm.status === 'atualizado'

  return {
    leadId: String(leadId),
    occurredAt: executionDate(execution),
    crmStatus: String(crm.status),
    name: String(organized.lead_nome ?? '').trim(),
    city: String(organized.cidade ?? '').trim(),
    state: String(organized.uf ?? '').trim(),
    interest: String(organized.interesse ?? '').trim(),
    segment: String(organized.segmento ?? '').trim(),
    campaign: String(organized.campanha ?? '').trim(),
    consultant: String(organized.consultor_responsavel ?? '').trim(),
    qualified: organized.qualificacao_minima_completa === true,
    recurrence: recurrent,
    recurrenceOrigin: String(recurrence.recorrencia_origem ?? '').trim(),
    crmPersisted: recurrence.crm_persistencia_confirmada === true || Boolean(crm.status),
    transfer: transferConfirmed ? 'enviada' : recurrenceReply.atendimento_humano_oferecido === true ? 'oferecida-em-reincidencia' : 'nao-confirmada',
    currentObservation: redactObservation(organized['informações']),
    currentContactData: redactObservation(organized.data),
  }
}

function buildLeads(executions, start) {
  const events = executions
    .filter((execution) => executionDate(execution) && new Date(executionDate(execution)) >= start)
    .map(buildLeadEvent)
    .filter(Boolean)
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))

  const grouped = new Map()
  for (const event of events) {
    const current = grouped.get(event.leadId)
    if (!current) {
      grouped.set(event.leadId, { ...event, n8nEvents: [event] })
    } else {
      current.n8nEvents.push(event)
    }
  }

  const leads = [...grouped.values()].map((lead) => ({
    ...lead,
    n8nEvents: lead.n8nEvents.map((event) => ({
      occurredAt: event.occurredAt,
      crmStatus: event.crmStatus,
      recurrence: event.recurrence,
      transfer: event.transfer,
      currentObservation: event.currentObservation,
      currentContactData: event.currentContactData,
    })),
  }))

  return {
    leads,
    summary: {
      uniqueLeads: leads.length,
      created: events.filter((event) => event.crmStatus === 'criado').length,
      updated: events.filter((event) => event.crmStatus === 'atualizado').length,
      transferConfirmed: events.filter((event) => event.transfer === 'enviada').length,
      recurrent: events.filter((event) => event.recurrence).length,
    },
  }
}

async function fetchExecutions() {
  const baseUrl = process.env.N8N_ARAUNAH_BASE_URL?.replace(/\/$/, '')
  const apiKey = process.env.N8N_ARAUNAH_API_KEY
  const workflowId = process.env.N8N_CHATBOT_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID
  if (!baseUrl || !apiKey) throw new Error('Integração n8n não configurada no ambiente do servidor.')

  const executions = []
  let cursor = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ workflowId, includeData: 'true', limit: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(`${baseUrl}/api/v1/executions?${query}`, {
      headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`Leitura n8n indisponível (HTTP ${response.status}).`)
    const payload = await response.json()
    const rows = Array.isArray(payload.data) ? payload.data : []
    executions.push(...rows)
    cursor = payload.nextCursor ?? payload.next_cursor ?? null
    if (!cursor || rows.length === 0) break
  }
  return executions
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  try {
    await requireAccess(request)
    const url = new URL(request.url)
    const range = Number(url.searchParams.get('days') ?? 30)
    if (!Number.isInteger(range) || ![7, 15, 30, 60, 90].includes(range)) return json({ error: 'Período inválido.' }, 400)
    const start = new Date(Date.now() - (range * 24 * 60 * 60 * 1000))
    const result = buildLeads(await fetchExecutions(), start)
    return json({
      schema: 'araunah.n8n-leads.v1',
      source: 'n8n: CHATBOT-ARAUNAH WHATSAPP',
      generatedAt: new Date().toISOString(),
      rangeDays: range,
      summary: result.summary,
      leads: result.leads,
      trackingNotice: 'O n8n confirma CRM e transferência. Responsável humano, primeira resposta, resolução/perda e motivo exigem a migração de rastreio no Supabase.',
    })
  } catch (error) {
    const status = Number(error?.status) || 500
    const safeMessage = error instanceof Error ? error.message : 'Falha ao carregar leads n8n.'
    return json({ error: safeMessage }, status)
  }
}

export const __test__ = { buildLeadEvent, buildLeads, nodeItems }
