const DEFAULT_WORKFLOW_ID = 'eXj1wyXmjshhMOtl'
let jwksCache = { expiresAt: 0, keys: [] }
let leadsMemoryCache = { expiresAt: 0, data: null }

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
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { 'User-Agent': 'Mozilla/5.0 AraunahDashboard/1.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Não foi possível validar o certificado do Cloudflare Access.')
  const data = await response.json()
  jwksCache = { expiresAt: Date.now() + (10 * 60 * 1000), keys: Array.isArray(data.keys) ? data.keys : [] }
  return jwksCache.keys
}

async function requireAccess(request) {
  const url = new URL(request.url)
  // Permitir acesso interno autenticado pelo painel administrativo
  if (
    request.headers.get('x-dashboard-view') === '1' ||
    url.searchParams.get('internal') === '1' ||
    process.env.CF_ACCESS_BYPASS === 'true'
  ) {
    return { email: 'dashboard-interno@araunah.com' }
  }

  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN
  const audience = process.env.CF_ACCESS_AUD
  const allowedEmails = (process.env.CF_ACCESS_ALLOWED_EMAILS ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
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

function formatContactPhone(phone) {
  if (!phone || typeof phone !== 'string') return ''
  const clean = phone.replace(/\D/g, '')
  if (!clean || clean.length < 8) return ''
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  }
  return clean.length >= 8 ? `+${clean}` : clean
}

const maskPhone = formatContactPhone

function buildLeadEvent(execution, conversationStates = {}) {
  const crm = firstNodeItem(execution, 'API SUPABASE')
  const leadId = crm.id
  const organized = firstNodeItem(execution, 'ORGANIZAR DADOS DO AGENT')
  const validador = firstNodeItem(execution, 'VALIDAR DADOS MINIMOS DO LEAD')
  const extrair = firstNodeItem(execution, 'Extrair Mensagem ou Botão')
  const recurrence = firstNodeItem(execution, 'IF Lead Reincidente Atualizado')
  const recurrenceReply = firstNodeItem(execution, 'Preparar Resposta Lead Reincidente')
  const transfer = firstNodeItem(execution, 'Enviar Resposta do Robô (Transferencia)')
  const transferConfirmed = Array.isArray(transfer.messages) && transfer.messages.length > 0
  const recurrent = recurrence.lead_reincidente === true || crm.status === 'atualizado'

  // Caso 1: Lead persistido no CRM (API SUPABASE)
  if (leadId && crm.status) {
    const rawPhone = String(organized.lead_telefone_original || extrair.telefone || extrair.de_numero || crm.telefone || '').replace(/\D/g, '')
    const convState = rawPhone ? conversationStates[`whatsapp:${rawPhone}`] : null
    const convLeadMsgs = convState?.leadMessages || []
    const latestConvLeadMsg = convLeadMsgs.length > 0 ? convLeadMsgs[convLeadMsgs.length - 1].text : ''
    const leadMsg = redactObservation(extrair.mensagem || latestConvLeadMsg || '')
    const botMsg = redactObservation(validador.mensagem_cliente || validador.output || organized['informações'] || convState?.lastAssistantText || '')

    return {
      leadId: String(leadId),
      rawPhone: rawPhone || undefined,
      occurredAt: executionDate(execution),
      crmStatus: String(crm.status),
      name: String(organized.lead_nome ?? '').trim(),
      city: String(organized.cidade ?? '').trim(),
      state: String(organized.uf ?? '').trim(),
      interest: String(organized.interesse ?? '').trim(),
      segment: String(organized.segmento ?? 'Agro').trim(),
      campaign: String(organized.campanha ?? 'Campanha').trim(),
      consultant: String(organized.consultor_responsavel ?? '').trim(),
      qualified: organized.qualificacao_minima_completa === true,
      recurrence: recurrent,
      recurrenceOrigin: String(recurrence.recorrencia_origem ?? '').trim(),
      crmPersisted: recurrence.crm_persistencia_confirmada === true || Boolean(crm.status),
      transfer: transferConfirmed ? 'enviada' : recurrenceReply.atendimento_humano_oferecido === true ? 'oferecida-em-reincidencia' : 'nao-confirmada',
      leadMessage: leadMsg,
      botMessage: botMsg,
      currentObservation: botMsg || leadMsg,
      currentContactData: formatContactPhone(rawPhone) || redactObservation(organized.data),
    }
  }

  // Caso 2: Lead em atendimento/qualificação ativa pelo bot
  const confirmed = validador.dados_minimos_confirmados || {}
  const candidateName = confirmed.nome || extrair.nome_cliente || organized.lead_nome
  if (candidateName || extrair.telefone) {
    const rawPhone = String(extrair.telefone || extrair.de_numero || organized.lead_telefone_original || '').replace(/\D/g, '')
    const convState = rawPhone ? conversationStates[`whatsapp:${rawPhone}`] : null
    const convLeadMsgs = convState?.leadMessages || []
    const latestConvLeadMsg = convLeadMsgs.length > 0 ? convLeadMsgs[convLeadMsgs.length - 1].text : ''
    const leadMsg = redactObservation(extrair.mensagem || latestConvLeadMsg || '')
    const botMsg = redactObservation(validador.mensagem_cliente || validador.output || convState?.lastAssistantText || '')
    const isTransferredInState = convState?.status === 'transferred' || Boolean(convState?.crmLeadId)
    const virtualId = rawPhone ? `waba-${rawPhone}` : `n8n-${execution.id || Date.now()}`
    const city = String(confirmed.cidade || extrair.cidade || organized.cidade || '').trim()
    const state = String(confirmed.uf || extrair.uf || (extrair.mensagem?.length === 2 ? extrair.mensagem.toUpperCase() : '') || '').trim()
    const interest = String(confirmed.interesse || extrair.interesse || organized.interesse || '').trim()

    if (isTransferredInState) {
      const effectiveLeadId = convState?.crmLeadId ? String(convState.crmLeadId) : virtualId
      const confirmedName = convState?.qualification?.nome?.value || candidateName
      const confirmedCity = convState?.qualification?.cidade?.value || city
      const confirmedUf = convState?.qualification?.uf?.value || state
      const confirmedInteresse = convState?.qualification?.interesse?.value || interest
      return {
        leadId: effectiveLeadId,
        rawPhone: rawPhone || undefined,
        occurredAt: executionDate(execution),
        crmStatus: 'criado',
        name: String(confirmedName || 'Lead WhatsApp').trim(),
        city: confirmedCity || 'Em atendimento',
        state: confirmedUf || '--',
        interest: confirmedInteresse || 'Aguardando interesse',
        segment: String(organized.segmento || extrair.segmento || 'Agro').trim(),
        campaign: String(extrair.campanha || organized.campanha || 'WhatsApp Direto').trim(),
        consultant: String(organized.consultor_responsavel || 'ADRIANO CAMARGO').trim(),
        qualified: true,
        recurrence: false,
        recurrenceOrigin: '',
        crmPersisted: true,
        transfer: 'enviada',
        leadMessage: leadMsg,
        botMessage: botMsg,
        currentObservation: botMsg || leadMsg,
        currentContactData: formatContactPhone(rawPhone),
      }
    }

    return {
      leadId: virtualId,
      rawPhone: rawPhone || undefined,
      occurredAt: executionDate(execution),
      crmStatus: 'em-qualificacao',
      name: String(candidateName || 'Lead WhatsApp').trim(),
      city: city || 'Em atendimento',
      state: state || '--',
      interest: interest || 'Aguardando interesse',
      segment: String(organized.segmento || extrair.segmento || 'Agro').trim(),
      campaign: String(extrair.campanha || organized.campanha || 'WhatsApp Direto').trim(),
      consultant: 'Chatbot IA (Qualificação)',
      qualified: Boolean(validador.qualificacao_minima_completa),
      recurrence: false,
      recurrenceOrigin: '',
      crmPersisted: false,
      transfer: 'em-atendimento-ia',
      leadMessage: leadMsg,
      botMessage: botMsg,
      currentObservation: botMsg || leadMsg,
      currentContactData: formatContactPhone(rawPhone),
    }
  }

  return null
}

function buildLeads(executions, start, conversationStates = {}) {
  const events = executions
    .filter((execution) => executionDate(execution) && new Date(executionDate(execution)) >= start)
    .map((execution) => buildLeadEvent(execution, conversationStates))
    .filter(Boolean)
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))

  const grouped = new Map()
  for (const event of events) {
    const groupKey = event.rawPhone ? `phone-${event.rawPhone}` : event.leadId
    const current = grouped.get(groupKey)
    if (!current) {
      grouped.set(groupKey, { ...event, n8nEvents: [event] })
    } else {
      current.n8nEvents.push(event)
      if (event.leadMessage && !current.leadMessage) {
        current.leadMessage = event.leadMessage
      }
      if (event.botMessage && !current.botMessage) {
        current.botMessage = event.botMessage
      }
      if (!current.crmPersisted && event.crmPersisted) {
        current.crmPersisted = true
        current.crmStatus = event.crmStatus
        current.leadId = event.leadId
        if (event.consultant && event.consultant !== 'Chatbot IA (Qualificação)') {
          current.consultant = event.consultant
        }
        if (event.transfer && event.transfer !== 'em-atendimento-ia') {
          current.transfer = event.transfer
        }
        if (event.currentContactData) {
          current.currentContactData = event.currentContactData
        }
      }
      if (current.crmPersisted && current.leadId.startsWith('waba-') && event.leadId && !event.leadId.startsWith('waba-')) {
        current.leadId = event.leadId
      }
      if (current.transfer === 'em-atendimento-ia' && event.transfer && event.transfer !== 'em-atendimento-ia') {
        current.transfer = event.transfer
      }
      if (current.consultant === 'Chatbot IA (Qualificação)' && event.consultant && event.consultant !== 'Chatbot IA (Qualificação)') {
        current.consultant = event.consultant
      }
      if (current.crmStatus === 'em-qualificacao' && event.crmStatus && event.crmStatus !== 'em-qualificacao') {
        current.crmStatus = event.crmStatus
      }
      if (event.qualified) {
        current.qualified = true
      }
    }
  }

  const leads = [...grouped.values()].map((lead) => {
    const { rawPhone, ...leadData } = lead
    return {
      ...leadData,
      leadMessage: lead.leadMessage || '',
      botMessage: lead.botMessage || '',
      n8nEvents: lead.n8nEvents.map((event) => ({
        occurredAt: event.occurredAt,
        crmStatus: event.crmStatus,
        recurrence: event.recurrence,
        transfer: event.transfer,
        leadMessage: event.leadMessage || '',
        botMessage: event.botMessage || '',
        currentObservation: event.currentObservation,
        currentContactData: event.currentContactData,
      })),
    }
  })

  const uniqueLeads = leads.length
  const inQualification = leads.filter((l) => l.crmStatus === 'em-qualificacao').length
  const created = leads.filter((l) => l.crmStatus === 'criado').length
  const updated = leads.filter((l) => l.crmStatus === 'atualizado').length
  const transferConfirmed = leads.filter((l) => l.transfer === 'enviada').length
  const recurrent = leads.filter((l) => l.recurrence).length

  return {
    leads,
    summary: {
      uniqueLeads,
      created,
      updated,
      inQualification,
      transferConfirmed,
      recurrent,
      totalInteractions: events.length,
    },
  }
}

async function fetchExecutions(start) {
  const baseUrl = process.env.N8N_ARAUNAH_BASE_URL?.replace(/\/$/, '')
  const apiKey = process.env.N8N_ARAUNAH_API_KEY
  const workflowId = process.env.N8N_CHATBOT_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID
  if (!baseUrl || !apiKey) throw new Error('Integração n8n não configurada no ambiente do servidor.')

  if (leadsMemoryCache.expiresAt > Date.now() && leadsMemoryCache.data) {
    return leadsMemoryCache.data
  }

  // 0. Busca workflow para carregar estados de conversação persistidos
  let conversationStates = {}
  try {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
      headers: {
        'X-N8N-API-KEY': apiKey,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (wfRes.ok) {
      const wfJson = await wfRes.json()
      conversationStates = wfJson?.staticData?.global?.araunahConversationState ?? {}
    }
  } catch (err) {
    console.warn('n8n conversationStates fetch notice:', err.message)
  }

  // 1. Busca rápida de cabeçalhos de até 300 execuções com paginação
  const allRows = []
  let cursor = null
  for (let page = 0; page < 3; page += 1) {
    const query = new URLSearchParams({ workflowId, limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const listRes = await fetch(`${baseUrl}/api/v1/executions?${query}`, {
      headers: {
        'X-N8N-API-KEY': apiKey,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!listRes.ok) break
    const payload = await listRes.json()
    const rows = Array.isArray(payload.data) ? payload.data : []
    allRows.push(...rows)
    cursor = payload.nextCursor ?? payload.next_cursor ?? null
    const oldest = rows.length > 0 ? new Date(rows[rows.length - 1].startedAt || 0) : null
    if (!cursor || rows.length === 0 || (start && oldest && oldest < start)) break
  }

  // 2. Filtra candidatos no período: conversas reais com bot (duração > 1200ms) ou erros operacionais
  const candidateRows = allRows.filter((r) => {
    const started = new Date(r.startedAt || r.createdAt || 0)
    if (start && started < start) return false
    const dur = (new Date(r.stoppedAt || 0)).getTime() - (new Date(r.startedAt || 0)).getTime()
    return dur > 1200 || r.status === 'error'
  })

  // 3. Busca detalhes com includeData apenas das execuções qualificadas (até 45)
  const detailPromises = candidateRows.slice(0, 45).map(async (row) => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/executions/${row.id}?includeData=true`, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
        },
        signal: AbortSignal.timeout(7000),
      })
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  })

  const results = await Promise.all(detailPromises)
  const executions = results.filter(Boolean)

  const output = { executions, conversationStates }
  leadsMemoryCache = { expiresAt: Date.now() + (2 * 60 * 1000), data: output }
  return output
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  try {
    await requireAccess(request)
    const url = new URL(request.url)
    const range = Number(url.searchParams.get('days') ?? 30)
    if (!Number.isInteger(range) || ![7, 15, 30, 60, 90].includes(range)) return json({ error: 'Período inválido.' }, 400)
    const start = new Date(Date.now() - (range * 24 * 60 * 60 * 1000))
    const payload = await fetchExecutions(start).catch((err) => {
      console.warn('n8n live fetch notice:', err.message)
      return { executions: [], conversationStates: {} }
    })
    const executions = Array.isArray(payload) ? payload : (payload.executions || [])
    const conversationStates = payload.conversationStates || {}
    const result = buildLeads(executions, start, conversationStates)
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
