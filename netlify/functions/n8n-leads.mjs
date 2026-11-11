const DEFAULT_CHATBOT_WORKFLOW_ID = 'eXj1wyXmjshhMOtl'
const DEFAULT_META_WORKFLOW_ID = 'IvkbTdyCJY242x1O'
const DEFAULT_LEADS_API_URL = 'https://qzxabnagqlatytlvwpyq.supabase.co/functions/v1/api-leads'

const ALLOWED_CRM_ORIGINS = new Map([
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['site', 'Site'],
  ['indicacao', 'Indicacao'],
  ['indicação', 'Indicacao'],
  ['evento', 'Evento'],
  ['prospeccao', 'prospeccao'],
  ['prospecção', 'prospeccao'],
  ['prospeccao ativa', 'prospeccao'],
  ['prospecção ativa', 'prospeccao'],
  ['teste', 'teste'],
])

let jwksCache = { expiresAt: 0, keys: [] }
const leadsMemoryCache = new Map()

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

function hasCloudflareAccessConfig() {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim()
  const audience = process.env.CF_ACCESS_AUD?.trim()
  const allowedEmails = (process.env.CF_ACCESS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  return Boolean(teamDomain && audience && allowedEmails.length)
}

async function cloudflareKeys(teamDomain) {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length) return jwksCache.keys
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { 'User-Agent': 'Mozilla/5.0 AraunahDashboard/1.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Não foi possível validar o certificado do Cloudflare Access.')
  const data = await response.json()
  jwksCache = { expiresAt: Date.now() + 10 * 60 * 1000, keys: Array.isArray(data.keys) ? data.keys : [] }
  return jwksCache.keys
}

async function requireAccess(request) {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim()
  const audience = process.env.CF_ACCESS_AUD?.trim()
  const allowedEmails = (process.env.CF_ACCESS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  const token = request.headers.get('cf-access-jwt-assertion')

  // Senha da aplicação removida a pedido de Higor: se Cloudflare Access não estiver configurado,
  // o endpoint opera em acesso aberto, rejeitando apenas cabeçalhos JWT enviados indevidamente.
  if (!teamDomain || !audience || !allowedEmails.length) {
    if (token) {
      const error = new Error('Token Cloudflare Access enviado sem política configurada no servidor.')
      error.status = 401
      throw error
    }
    return { email: null, mode: 'open' }
  }

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

  let header, payload
  try {
    header = base64urlJson(parts[0])
    payload = base64urlJson(parts[1])
  } catch {
    const error = new Error('Token Cloudflare Access inválido.')
    error.status = 401
    throw error
  }
  if (
    !header ||
    typeof header !== 'object' ||
    !payload ||
    typeof payload !== 'object' ||
    header.alg !== 'RS256' ||
    !header.kid ||
    payload.iss !== `https://${teamDomain}/`
  ) {
    const error = new Error('Token Cloudflare Access não corresponde à política configurada.')
    error.status = 401
    throw error
  }
  const now = Math.floor(Date.now() / 1000)
  const expires = Number(payload.exp)
  const notBefore = payload.nbf === undefined ? null : Number(payload.nbf)
  if (!Number.isFinite(expires) || expires <= now || (notBefore !== null && (!Number.isFinite(notBefore) || notBefore > now))) {
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
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(parts[2], 'base64url'),
    Buffer.from(`${parts[0]}.${parts[1]}`)
  )
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
  return { email, mode: 'cloudflare-access' }
}

function getLeadsApiConfig() {
  const url = (process.env.ARAUNAH_LEADS_API_URL || DEFAULT_LEADS_API_URL).trim()
  const token = (process.env.ARAUNAH_LEADS_API_TOKEN || process.env.MCP_ARAUNAH_LEADS_API_KEY || '').trim()
  return { url, token, configured: Boolean(url && token) }
}

async function callLeadsApiTool(name, args = {}) {
  const { url, token, configured } = getLeadsApiConfig()
  if (!configured) {
    const err = new Error('API oficial de leads (CRM) não configurada no servidor.')
    err.status = 503
    throw err
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: token,
      'User-Agent': 'AraunahDashboard/1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    const err = new Error(`Falha ao consultar API oficial do CRM (HTTP ${response.status}).`)
    err.status = 502
    throw err
  }

  const payload = await response.json()
  if (payload?.error) {
    const err = new Error(String(payload.error.message || 'Erro retornado pela API oficial do CRM.'))
    err.status = 502
    throw err
  }

  const textBlock = payload?.result?.content?.find?.((item) => item?.type === 'text')?.text
  let parsed = payload?.result
  if (typeof textBlock === 'string') {
    try {
      parsed = JSON.parse(textBlock)
    } catch {
      parsed = { rawText: textBlock }
    }
  }
  if (payload?.result?.isError || parsed?.error) {
    const err = new Error(String(parsed?.error || parsed?.message || 'Operação recusada pela API oficial do CRM.'))
    err.status = 422
    throw err
  }
  return parsed ?? {}
}

function normalizeTextKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhoneDigits(phone) {
  return String(phone ?? '').replace(/\D/g, '')
}

function normalizePhoneTo55(phone) {
  const digits = normalizePhoneDigits(phone)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits
  return ''
}

function normalizeBrCanonicalDigits(phone) {
  const digits = normalizePhoneDigits(phone)
  if (digits.length < 8) return ''
  let canonical = normalizePhoneTo55(digits) || digits
  // Unifica celular BR com 13 digitos (55+DDD+9XXXX-XXXX) e WhatsApp Cloud com 12 digitos (55+DDD+XXXXXXXX)
  if (canonical.length === 13 && canonical.startsWith('55') && canonical[4] === '9' && /[6-9]/.test(canonical[5])) {
    canonical = `${canonical.slice(0, 4)}${canonical.slice(5)}`
  }
  return canonical
}

function phoneCorrelationKey(phone) {
  const canonical = normalizeBrCanonicalDigits(phone)
  return canonical ? `phone-${canonical}` : ''
}

function crmPhoneSearchText(phone) {
  const digits = normalizePhoneDigits(phone)
  if (digits.length < 8) return ''
  return digits.slice(-8)
}

function extractLeadPhoneDigits(lead) {
  const idMatch = String(lead?.leadId || '').match(/^(?:waba|meta)-(\d{8,})$/)
  if (idMatch) return idMatch[1]
  return normalizePhoneDigits(lead?.currentContactData || '')
}

function convStateCrmId(state) {
  const raw = state?.crmLeadId ?? state?.manualCrmLeadId ?? ''
  const id = String(raw).trim()
  return id && id !== '0' ? id : ''
}

function normalizeComparableText(value) {
  return normalizeTextKey(value).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isGenericLeadName(name) {
  const norm = normalizeComparableText(name)
  return (
    !norm ||
    ['LEAD WHATSAPP', 'LEAD META ADS', 'LEAD CRM', 'NAO INFORMADO', 'CONTATO', 'CLIENTE', 'SEM NOME'].includes(norm)
  )
}

function crmIdentityCompatible(lead, row, phoneCount = 1) {
  const leadIdStr = String(lead?.leadId || '')
  const rowIdStr = String(row?.id || '')
  if (/^\d+$/.test(leadIdStr)) return leadIdStr === rowIdStr
  if (phoneCount > 1) return false

  const leadNameNorm = normalizeComparableText(lead?.name || '')
  const rowNameNorm = normalizeComparableText(row?.nome || '')
  if (isGenericLeadName(leadNameNorm) || isGenericLeadName(rowNameNorm)) return false
  if (leadNameNorm === rowNameNorm) return true

  const leadWords = leadNameNorm.split(' ').filter((w) => w.length >= 2)
  const rowWords = rowNameNorm.split(' ').filter((w) => w.length >= 2)
  if (!leadWords.length || !rowWords.length) return false

  const shared = leadWords.filter((w) => rowWords.includes(w))
  if (shared.length === 0) return false

  const leadSubset = leadWords.every((w) => rowWords.includes(w))
  const rowSubset = rowWords.every((w) => leadWords.includes(w))
  const leadCity = normalizeComparableText(lead?.city || '')
  const rowCity = normalizeComparableText(row?.cidade || '')
  const cityConflicts = Boolean(
    leadCity &&
      rowCity &&
      !['EM ATENDIMENTO', 'LOCALIZACAO PENDENTE'].includes(leadCity) &&
      leadCity !== rowCity
  )
  if (cityConflicts) return false

  if (shared.length >= 2 && (leadSubset || rowSubset)) return true
  const cityMatches = Boolean(leadCity && rowCity && leadCity === rowCity)
  const leadUf = normalizeComparableText(lead?.state || '')
  const rowUf = normalizeComparableText(row?.uf || '')
  const ufMatches = Boolean(leadUf && rowUf && leadUf !== '--' && leadUf === rowUf)
  if ((leadSubset || rowSubset) && cityMatches && ufMatches) return true
  return false
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

function verifiedCrmReadback(execution, crm) {
  const writes = nodeItems(execution, 'API SUPABASE')
  const incoming = nodeItems(execution, 'Extrair Mensagem ou Botão')
  const observations = nodeItems(execution, 'CRM OBS | Validar Persistência')

  if (observations.length > 0) {
    if (writes.length !== 1 || observations.length !== 1 || incoming.length > 1 || !crm.id) return null
    const readback = observations[0]
    if (String(readback.id ?? readback.lead_id ?? '') !== String(crm.id)) return null
    if (
      readback.crm_read_after_write !== 'confirmed' ||
      readback.crm_persistencia_confirmada !== true ||
      readback.destino_crm_confirmado !== true
    ) {
      return null
    }
    return readback
  }

  // Fallback exclusivo para execuções do fluxo Meta Lead Ads (sem nó chatbot 'Extrair Mensagem ou Botão')
  if (incoming.length === 0) {
    const metaValidations = nodeItems(execution, 'MESA | Validar Destino')
    if (writes.length === 1 && metaValidations.length === 1 && crm.id) {
      const readback = metaValidations[0]
      const rbId = readback.id ?? readback.lead_id ?? readback.crm_id
      if (rbId !== undefined && rbId !== null && String(rbId) !== String(crm.id)) return null
      if (readback.crm_persistencia_confirmada !== true || readback.destino_crm_confirmado !== true) return null
      return {
        ...readback,
        na_mesa: readback.delivery?.inMesa === true || readback.na_mesa === true,
        consultor_atual: readback.delivery?.consultant || readback.consultor_atual || '',
      }
    }
  }

  return null
}

function acceptedBotText(execution) {
  if (nodeItems(execution, 'Extrair Mensagem ou Botão').length !== 1) return { text: '', kind: 'chat' }
  const routes = [
    ['Enviar Resposta do Robô (Chat)', 'GUARDA VALORES | Chat', 'chat'],
    ['Enviar Resposta do Robô (ENCERRAR)', 'GUARDA VALORES | Encerrar', 'chat'],
    ['Enviar Resposta do Robô (Transferencia)', 'GUARDA VALORES | Transferencia', 'transfer'],
    ['Enviar Follow-up 3h', 'GUARDA VALORES | Follow-up', 'followup_3h'],
  ]
  const accepted = routes.filter(([sender]) => {
    const items = nodeItems(execution, sender)
    return items.length === 1 && Array.isArray(items[0].messages) && items[0].messages.length > 0
  })
  if (accepted.length !== 1) return { text: '', kind: 'chat' }
  const [senderNode, guardNode, kind] = accepted[0]
  const guarded = guardNode ? nodeItems(execution, guardNode) : []
  if (guarded.length === 1) {
    const text = redactObservation(guarded[0].__guard_text)
    const effectiveKind =
      kind === 'followup_3h' || text.includes('Passando para saber se ainda posso ajudar') ? 'followup_3h' : kind
    return { text, kind: effectiveKind }
  }
  if (guarded.length > 1) return { text: '', kind: 'chat' }
  // Execuções anteriores às guardas só permitem reconstrução com um único item validado no ramo Chat.
  if (senderNode !== 'Enviar Resposta do Robô (Chat)') return { text: '', kind: 'chat' }
  const validated = nodeItems(execution, 'VALIDAR DADOS MINIMOS DO LEAD')
  if (validated.length !== 1) return { text: '', kind: 'chat' }
  const text = redactObservation(validated[0].mensagem_cliente)
  const effectiveKind = text.includes('Passando para saber se ainda posso ajudar') ? 'followup_3h' : 'chat'
  return { text, kind: effectiveKind }
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

function detectCommercialScope(organized = {}, crm = {}) {
  const rawScope = normalizeTextKey(organized.escopo_comercial || organized.commercial_scope || organized.tipo_contato || crm.status)
  if (rawScope.includes('FORNECEDOR') || rawScope === 'SUPPLIER') return 'supplier'
  return ''
}

function buildMetaLeadEvent(execution) {
  const crm = firstNodeItem(execution, 'API SUPABASE')
  const validatedCrm = firstNodeItem(execution, 'VALIDAR RETORNO SUPABASE')
  const effectiveCrm = crm.id ? crm : validatedCrm
  const organized = firstNodeItem(execution, 'ORGANIZAR DADOS DO AGENT')
  const codeJs = firstNodeItem(execution, 'Code in JavaScript')
  const formDetector = firstNodeItem(execution, 'GERADORES + MAQUINÁRIOS | Identificar Formulário')

  const metaForm = String(
    organized.formulario_nome || codeJs.FORMULARIO_NOME || formDetector.formName || formDetector.formulario_nome || ''
  ).trim()
  const rawPhone = normalizePhoneDigits(
    organized.lead_telefone_original || codeJs.TELEFONE || effectiveCrm.telefone || ''
  )
  const name = String(organized.lead_nome || codeJs['NOME COMPLETO'] || '').trim()
  if (!metaForm && !organized.meta_lead_id && !codeJs.META_LEAD_ID && !effectiveCrm.id) return null
  if (!name && !rawPhone && !effectiveCrm.id) return null

  const readback = verifiedCrmReadback({ ...execution, _workflowKind: 'meta' }, effectiveCrm)
  const inMesa = Boolean(readback?.na_mesa === true || readback?.delivery?.inMesa === true)
  const consultantName = readback
    ? String(readback.consultor_atual || readback.delivery?.consultant || (inMesa ? 'Mesa' : '')).trim()
    : 'A confirmar'
  const crmStatus = effectiveCrm.id
    ? readback
      ? String(effectiveCrm.status || 'criado')
      : 'confirmacao-pendente'
    : 'confirmacao-pendente'

  return {
    leadId: effectiveCrm.id ? String(effectiveCrm.id) : rawPhone ? `meta-${rawPhone}` : `meta-${execution.id || Date.now()}`,
    rawPhone: rawPhone || undefined,
    occurredAt: executionDate(execution),
    crmStatus,
    name: name || 'Lead Meta Ads',
    city: String(organized.cidade || codeJs.CIDADE || '').trim(),
    state: String(organized.uf || codeJs.ESTADO || '').trim(),
    interest: '',
    metaForm,
    segment: String(organized.segmento || codeJs.SEGMENTO_CAMPANHA || formDetector.segment || 'Agro').trim(),
    campaign: String(organized.campanha || formDetector.campaignName || 'Campanhas Meta Ads').trim(),
    consultant: consultantName,
    inMesa,
    crmDelivery: readback ? (inMesa ? 'mesa' : consultantName ? 'consultant' : '') : 'pending',
    commercialScope: '',
    qualified: false,
    recurrence: effectiveCrm.status === 'atualizado',
    recurrenceOrigin: effectiveCrm.status === 'atualizado' ? 'meta' : '',
    crmPersisted: Boolean(readback),
    transfer: readback ? 'enviada' : 'nao-confirmada',
    sources: ['meta'],
    acquisitionSource: 'meta',
    acquisitionLabel: 'Meta',
    interactionKind: 'meta_form',
    messageId: '',
    leadMessage: '',
    botMessage: '',
    currentObservation: redactObservation(organized.informações || codeJs.INFORMAÇÕES || metaForm || ''),
    currentContactData: formatContactPhone(rawPhone),
  }
}

function buildLeadEvent(execution, conversationStates = {}) {
  const incomingItems = nodeItems(execution, 'Extrair Mensagem ou Botão')
  const codeJs = firstNodeItem(execution, 'Code in JavaScript')
  const organized = firstNodeItem(execution, 'ORGANIZAR DADOS DO AGENT')

  // Execuções exclusivas do workflow Meta Lead Ads não passam pelo nó do chatbot WhatsApp
  if (
    execution?._workflowKind === 'meta' ||
    (incomingItems.length === 0 &&
      (codeJs.FORMULARIO_NOME || codeJs.META_LEAD_ID || organized.formulario_nome || organized.meta_lead_id))
  ) {
    return buildMetaLeadEvent(execution)
  }

  const crm = firstNodeItem(execution, 'API SUPABASE')
  const leadId = crm.id
  const validador = firstNodeItem(execution, 'VALIDAR DADOS MINIMOS DO LEAD')
  const extrair = firstNodeItem(execution, 'Extrair Mensagem ou Botão')
  const recurrence = firstNodeItem(execution, 'IF Lead Reincidente Atualizado')
  const recurrenceReply = firstNodeItem(execution, 'Preparar Resposta Lead Reincidente')
  const readback = verifiedCrmReadback(execution, crm)
  const recurrent = recurrence.lead_reincidente === true || crm.status === 'atualizado'
  const commercialScope = detectCommercialScope(organized, crm)

  // A resposta da RPC é uma tentativa; só a releitura confirma CRM e destino.
  if (leadId && crm.status) {
    const rawPhone = normalizePhoneDigits(
      organized.lead_telefone_original || extrair.telefone || extrair.de_numero || crm.telefone || ''
    )
    const leadMsg = redactObservation(extrair.mensagem || '')
    const botReply = acceptedBotText(execution)
    const inMesa = Boolean(readback?.na_mesa === true)
    const readbackConsultant = readback
      ? String(readback.consultor_atual || (inMesa ? 'Mesa' : 'Equipe comercial')).trim()
      : 'A confirmar'

    return {
      leadId: String(leadId),
      rawPhone: rawPhone || undefined,
      occurredAt: executionDate(execution),
      crmStatus: readback ? String(crm.status) : 'confirmacao-pendente',
      name: String(organized.lead_nome ?? '').trim(),
      city: String(organized.cidade ?? '').trim(),
      state: String(organized.uf ?? '').trim(),
      interest: String(organized.interesse ?? '').trim(),
      metaForm: String(organized.formulario_nome ?? '').trim(),
      segment: String(organized.segmento ?? 'Agro').trim(),
      campaign: String(organized.campanha ?? 'Campanha').trim(),
      consultant: readbackConsultant,
      inMesa,
      crmDelivery: readback ? (inMesa ? 'mesa' : 'consultant') : 'pending',
      commercialScope,
      qualified: organized.qualificacao_minima_completa === true,
      recurrence: recurrent,
      recurrenceOrigin: String(recurrence.recorrencia_origem ?? '').trim(),
      crmPersisted: Boolean(readback),
      transfer: readback
        ? 'enviada'
        : recurrenceReply.atendimento_humano_oferecido === true
        ? 'oferecida-em-reincidencia'
        : 'nao-confirmada',
      sources: ['n8n'],
      acquisitionSource: 'n8n',
      acquisitionLabel: 'Chatbot',
      interactionKind: botReply.kind,
      messageId: String(extrair.message_id || ''),
      leadMessage: leadMsg,
      botMessage: botReply.text,
      currentObservation: botReply.text || leadMsg,
      currentContactData: formatContactPhone(rawPhone) || redactObservation(organized.data),
    }
  }

  // Caso 2: Lead em atendimento/qualificação ativa pelo bot
  const confirmed = validador.dados_minimos_confirmados || {}
  const candidateName = confirmed.nome || extrair.nome_cliente || organized.lead_nome
  if (candidateName || extrair.telefone) {
    const rawPhone = normalizePhoneDigits(extrair.telefone || extrair.de_numero || organized.lead_telefone_original || '')
    const convState = rawPhone ? conversationStates[`whatsapp:${rawPhone}`] : null
    const leadMsg = redactObservation(extrair.mensagem || '')
    const botReply = acceptedBotText(execution)
    const stateCrmId = convStateCrmId(convState)
    const isTransferredInState = convState?.status === 'transferred' || Boolean(stateCrmId)
    const virtualId = rawPhone ? `waba-${rawPhone}` : `n8n-${execution.id || Date.now()}`
    const city = String(confirmed.cidade || extrair.cidade || organized.cidade || '').trim()
    const state = String(
      confirmed.uf || extrair.uf || (extrair.mensagem?.length === 2 ? extrair.mensagem.toUpperCase() : '') || ''
    ).trim()
    const interest = String(confirmed.interesse || extrair.interesse || organized.interesse || '').trim()

    if (isTransferredInState) {
      const effectiveLeadId = stateCrmId || virtualId
      const confirmedName = convState?.qualification?.nome?.value || candidateName
      const confirmedCity = convState?.qualification?.cidade?.value || city
      const confirmedUf = convState?.qualification?.uf?.value || state
      const confirmedInteresse = convState?.qualification?.interesse?.value || interest
      return {
        leadId: effectiveLeadId,
        rawPhone: rawPhone || undefined,
        occurredAt: executionDate(execution),
        crmStatus: 'confirmacao-pendente',
        name: String(confirmedName || 'Lead WhatsApp').trim(),
        city: confirmedCity || 'Em atendimento',
        state: confirmedUf || '--',
        interest: confirmedInteresse || 'Aguardando interesse',
        metaForm: '',
        segment: String(organized.segmento || extrair.segmento || 'Agro').trim(),
        campaign: String(extrair.campanha || organized.campanha || 'WhatsApp Direto').trim(),
        consultant: 'A confirmar',
        inMesa: false,
        crmDelivery: 'pending',
        commercialScope,
        qualified: Boolean(validador.qualificacao_minima_completa),
        recurrence: false,
        recurrenceOrigin: '',
        crmPersisted: false,
        transfer: 'nao-confirmada',
        sources: ['n8n'],
        acquisitionSource: 'n8n',
        acquisitionLabel: 'Chatbot',
        interactionKind: botReply.kind,
        messageId: String(extrair.message_id || ''),
        leadMessage: leadMsg,
        botMessage: botReply.text,
        currentObservation: botReply.text || leadMsg,
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
      metaForm: '',
      segment: String(organized.segmento || extrair.segmento || 'Agro').trim(),
      campaign: String(extrair.campanha || organized.campanha || 'WhatsApp Direto').trim(),
      consultant: 'Chatbot IA (Qualificação)',
      inMesa: false,
      crmDelivery: '',
      commercialScope,
      qualified: Boolean(validador.qualificacao_minima_completa),
      recurrence: false,
      recurrenceOrigin: '',
      crmPersisted: false,
      transfer: 'em-atendimento-ia',
      sources: ['n8n'],
      acquisitionSource: 'n8n',
      acquisitionLabel: 'Chatbot',
      interactionKind: botReply.kind,
      messageId: String(extrair.message_id || ''),
      leadMessage: leadMsg,
      botMessage: botReply.text,
      currentObservation: botReply.text || leadMsg,
      currentContactData: formatContactPhone(rawPhone),
    }
  }

  return null
}

function mergeSources(existingSources = [], extraSources = []) {
  const order = ['meta', 'n8n', 'crm']
  const combined = new Set([...(existingSources || []), ...(extraSources || [])])
  return order.filter((src) => combined.has(src))
}

function resolveAcquisition(sources = []) {
  if (sources.includes('meta')) return { acquisitionSource: 'meta', acquisitionLabel: 'Meta' }
  if (sources.includes('n8n')) return { acquisitionSource: 'n8n', acquisitionLabel: 'Chatbot' }
  return { acquisitionSource: 'crm', acquisitionLabel: 'CRM' }
}

function formatCrmSegment(crmRow = {}) {
  const hay = normalizeTextKey(`${crmRow.segmento || ''} ${crmRow.produto || ''} ${crmRow.interesse || ''} ${crmRow.campanha || ''}`)
  if (hay.includes('AGUA') || hay.includes('EFLUENTE') || hay.includes('ESGOTO') || hay.includes('TEFEN')) return 'Água'
  if (hay.includes('FLOREST') || hay.includes('SILVICULTURA') || hay.includes('EUCALIPTO')) return 'Florestas'
  return String(crmRow.segmento || 'Agro').trim() || 'Agro'
}

function buildLeads(executions, start, conversationStates = {}, options = {}) {
  const metaExecutions = Array.isArray(options?.metaExecutions)
    ? options.metaExecutions.map((ex) => ({ ...ex, _workflowKind: 'meta' }))
    : []
  const crmRows = Array.isArray(options?.crmRows) ? options.crmRows : []

  // 1. Processa execuções detalhadas (Chatbot + Meta Lead Ads)
  const combinedExecutions = [...(executions || []), ...metaExecutions]
  const events = combinedExecutions
    .filter((execution) => executionDate(execution))
    .map((execution) => buildLeadEvent(execution, conversationStates))
    .filter(Boolean)
    .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')))

  const grouped = new Map()

  for (const event of events) {
    let groupKey = event.rawPhone ? phoneCorrelationKey(event.rawPhone) || `phone-${event.rawPhone}` : event.leadId
    const existingPhoneLead = grouped.get(groupKey)
    if (existingPhoneLead && /^\d+$/.test(String(existingPhoneLead.leadId)) && /^\d+$/.test(String(event.leadId)) && String(existingPhoneLead.leadId) !== String(event.leadId)) {
      groupKey = `crm-${event.leadId}`
    }
    const current = grouped.get(groupKey)
    if (!current) {
      grouped.set(groupKey, {
        ...event,
        sources: mergeSources(event.sources),
        n8nEvents: event.sources?.includes('n8n') ? [event] : [],
      })
    } else {
      if (event.sources?.includes('n8n')) current.n8nEvents.push(event)
      current.sources = mergeSources(current.sources, event.sources)
      Object.assign(current, resolveAcquisition(current.sources))

      if (event.metaForm && !current.metaForm) current.metaForm = event.metaForm
      if (event.commercialScope === 'supplier') current.commercialScope = 'supplier'
      if (event.leadMessage && !current.leadMessage) {
        current.leadMessage = event.leadMessage
        current.botMessage = event.botMessage || ''
      }
      if (!current.crmPersisted && event.crmPersisted) {
        current.crmPersisted = true
        current.crmStatus = event.crmStatus
        current.leadId = event.leadId
        current.inMesa = Boolean(event.inMesa)
        current.crmDelivery = event.crmDelivery || ''
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
      if (event.qualified) current.qualified = true
      if (event.recurrence) current.recurrence = true
    }
  }

  // 2. Enriquece e sintetiza com estados de conversação persistidos no n8n (staticData)
  for (const [key, state] of Object.entries(conversationStates || {})) {
    if (!state || typeof state !== 'object') continue
    const rawPhone = normalizePhoneDigits(key.replace(/^whatsapp:/, ''))
    const groupKey = rawPhone ? phoneCorrelationKey(rawPhone) || `phone-${rawPhone}` : key
    const dateStr = state.lastInboundAt || state.updatedAt || state.closedAt || null
    const leadMsgs = Array.isArray(state.leadMessages) ? state.leadMessages : []
    const latestLeadMsg = leadMsgs.length > 0 ? leadMsgs[leadMsgs.length - 1].text : ''
    const lastOutbound = Date.parse(String(state.lastOutboundAt || ''))
    const lastInbound = Date.parse(String(state.lastInboundAt || ''))
    const botMsg =
      Number.isFinite(lastOutbound) && Number.isFinite(lastInbound) && lastOutbound >= lastInbound
        ? redactObservation(state.lastAssistantText || '')
        : ''
    const stateCrmId = convStateCrmId(state)
    const isTransferred = state.status === 'transferred' || Boolean(stateCrmId)
    const qual = state.qualification || {}
    const name = qual.nome?.value || state.name || 'Lead WhatsApp'
    const city = qual.cidade?.value || 'Em atendimento'
    const stateUf = qual.uf?.value || '--'
    const interest = qual.interesse?.value || 'Aguardando interesse'

    const existing = grouped.get(groupKey)
    if (existing) {
      existing.sources = mergeSources(existing.sources, ['n8n'])
      Object.assign(existing, resolveAcquisition(existing.sources))
      if (Number.isFinite(Date.parse(String(dateStr || ''))) && Date.parse(String(dateStr)) > Date.parse(String(existing.occurredAt || ''))) {
        existing.occurredAt = dateStr
      }
      if (!existing.leadMessage && latestLeadMsg) {
        existing.leadMessage = latestLeadMsg
        existing.botMessage = ''
      }
      if ((!existing.name || existing.name === 'Lead WhatsApp') && name) existing.name = String(name).trim()
      if ((!existing.city || existing.city === 'Em atendimento') && city && city !== 'Em atendimento') existing.city = city
      if ((!existing.state || existing.state === '--') && stateUf && stateUf !== '--') existing.state = stateUf
      if ((!existing.interest || existing.interest === 'Aguardando interesse') && interest && interest !== 'Aguardando interesse') {
        existing.interest = interest
      }
      if (isTransferred && !existing.crmPersisted) {
        existing.crmStatus = 'confirmacao-pendente'
        existing.crmDelivery = 'pending'
        existing.transfer = 'nao-confirmada'
        if (stateCrmId && !/^\d+$/.test(String(existing.leadId || ''))) existing.leadId = stateCrmId
        if (existing.consultant === 'Chatbot IA (Qualificação)') existing.consultant = 'A confirmar'
      }
      if (leadMsgs.length > 0) {
        const existingIds = new Set(existing.n8nEvents.map((e) => e.messageId).filter(Boolean))
        for (let i = 0; i < leadMsgs.length; i++) {
          const msg = leadMsgs[i]
          const messageId = String(msg.id || '')
          const duplicate = messageId
            ? existingIds.has(messageId)
            : existing.n8nEvents.some((e) => !e.messageId && e.leadMessage === msg.text && e.occurredAt === (msg.at || dateStr))
          if (msg.text && !duplicate) {
            const eventBotMsg = i === leadMsgs.length - 1 ? botMsg : ''
            existing.n8nEvents.push({
              occurredAt: msg.at || dateStr,
              crmStatus: existing.crmStatus,
              recurrence: existing.recurrence,
              transfer: existing.transfer,
              interactionKind: eventBotMsg.includes('Passando para saber se ainda posso ajudar') ? 'followup_3h' : 'chat',
              messageId,
              leadMessage: msg.text,
              botMessage: eventBotMsg,
              currentObservation: i === leadMsgs.length - 1 ? eventBotMsg || msg.text : msg.text,
              currentContactData: existing.currentContactData || formatContactPhone(rawPhone),
            })
            if (messageId) existingIds.add(messageId)
          }
        }
      }
    } else {
      const syntheticEvents =
        leadMsgs.length > 0
          ? leadMsgs.map((m, idx) => {
              const evtBot = idx === leadMsgs.length - 1 ? botMsg : ''
              return {
                occurredAt: m.at || dateStr,
                crmStatus: isTransferred ? 'confirmacao-pendente' : 'em-qualificacao',
                recurrence: false,
                transfer: isTransferred ? 'nao-confirmada' : 'em-atendimento-ia',
                interactionKind: evtBot.includes('Passando para saber se ainda posso ajudar') ? 'followup_3h' : 'chat',
                leadMessage: m.text || '',
                botMessage: evtBot,
                currentObservation: idx === leadMsgs.length - 1 ? evtBot || m.text : m.text || '',
                currentContactData: formatContactPhone(rawPhone),
              }
            })
          : [
              {
                occurredAt: dateStr,
                crmStatus: isTransferred ? 'confirmacao-pendente' : 'em-qualificacao',
                recurrence: false,
                transfer: isTransferred ? 'nao-confirmada' : 'em-atendimento-ia',
                interactionKind: botMsg.includes('Passando para saber se ainda posso ajudar') ? 'followup_3h' : 'chat',
                leadMessage: latestLeadMsg,
                botMessage: botMsg,
                currentObservation: botMsg || latestLeadMsg || '',
                currentContactData: formatContactPhone(rawPhone),
              },
            ]

      grouped.set(groupKey, {
        leadId: stateCrmId || (rawPhone ? `waba-${rawPhone}` : `n8n-${key}`),
        rawPhone: rawPhone || undefined,
        occurredAt: dateStr,
        crmStatus: isTransferred ? 'confirmacao-pendente' : 'em-qualificacao',
        name: String(name).trim(),
        city,
        state: stateUf,
        interest,
        metaForm: '',
        segment: 'Agro',
        campaign: 'WhatsApp Direto',
        consultant: isTransferred ? 'A confirmar' : 'Chatbot IA (Qualificação)',
        inMesa: false,
        crmDelivery: isTransferred ? 'pending' : '',
        commercialScope: '',
        qualified: Boolean(qual.nome?.value && qual.cidade?.value),
        recurrence: false,
        recurrenceOrigin: '',
        crmPersisted: false,
        transfer: isTransferred ? 'nao-confirmada' : 'em-atendimento-ia',
        sources: ['n8n'],
        acquisitionSource: 'n8n',
        acquisitionLabel: 'Chatbot',
        leadMessage: latestLeadMsg,
        botMessage: botMsg,
        currentObservation: botMsg || latestLeadMsg || '',
        currentContactData: formatContactPhone(rawPhone),
        n8nEvents: syntheticEvents,
      })
    }
  }

  // 3. Reconcilia linhas confirmadas da base oficial do CRM (buscar_leads) quando consultadas ao vivo
  if (crmRows.length > 0) {
    const crmIdIndex = new Map()
    for (const [gKey, lead] of grouped.entries()) {
      if (/^\d+$/.test(String(lead.leadId))) crmIdIndex.set(String(lead.leadId), gKey)
    }

    const crmPhoneRowIds = new Map()
    for (const row of crmRows) {
      if (!row || !row.id) continue
      const rKey = phoneCorrelationKey(row.telefone || '')
      if (!rKey) continue
      if (!crmPhoneRowIds.has(rKey)) crmPhoneRowIds.set(rKey, new Set())
      crmPhoneRowIds.get(rKey).add(String(row.id))
    }

    for (const row of crmRows) {
      if (!row || !row.id) continue
      const rowId = String(row.id)
      const rowPhoneDigits = normalizePhoneDigits(row.telefone || '')
      const rowPhoneKey = phoneCorrelationKey(rowPhoneDigits)
      const phoneLead = rowPhoneKey ? grouped.get(rowPhoneKey) : null
      const crmPhoneCount = rowPhoneKey ? (crmPhoneRowIds.get(rowPhoneKey)?.size ?? 1) : 1
      const phoneCompatible = phoneLead && crmIdentityCompatible(phoneLead, row, crmPhoneCount)
      const matchedKey = crmIdIndex.get(rowId) || (phoneCompatible ? rowPhoneKey : null)
      const rowDateRaw = row.atualizado_em || row.criado_em || null
      const rowDateIso = rowDateRaw && !Number.isNaN(Date.parse(rowDateRaw)) ? new Date(rowDateRaw).toISOString() : null
      const inMesa = row.na_mesa === true
      const consultant = String(row.consultor_nome || '').trim()
      const inferredMeta =
        normalizeTextKey(row.origem) === 'INSTAGRAM' && /META|FORM/i.test(String(row.campanha || ''))
      const rowSources = inferredMeta ? ['meta', 'crm'] : ['crm']

      if (matchedKey) {
        const current = grouped.get(matchedKey)
        const destinationConfirmed = inMesa || Boolean(consultant)
        current.leadId = rowId
        current.crmPersisted = true
        current.crmStatus = destinationConfirmed ? (current.crmStatus === 'atualizado' ? 'atualizado' : 'criado') : 'confirmacao-pendente'
        current.transfer = destinationConfirmed ? 'enviada' : 'nao-confirmada'
        current.inMesa = inMesa
        current.consultant = consultant || (inMesa ? 'Mesa' : 'A confirmar')
        current.crmDelivery = inMesa ? 'mesa' : consultant ? 'consultant' : 'pending'
        current.sources = mergeSources(current.sources, rowSources)
        Object.assign(current, resolveAcquisition(current.sources))
        if (row.nome && (!current.name || current.name === 'Lead WhatsApp' || current.name === 'Lead Meta Ads')) {
          current.name = String(row.nome).trim()
        }
        if (row.cidade && (!current.city || current.city === 'Em atendimento')) current.city = String(row.cidade).trim()
        if (row.uf && (!current.state || current.state === '--')) current.state = String(row.uf).trim()
        if ((row.produto || row.interesse) && (!current.interest || current.interest === 'Aguardando interesse')) {
          current.interest = String(row.produto || row.interesse).trim()
        }
        if (row.campanha && (!current.campaign || current.campaign === 'Campanha' || current.campaign === 'WhatsApp Direto')) {
          current.campaign = String(row.campanha).trim()
        }
        if (row.observacao && !current.currentObservation) current.currentObservation = redactObservation(row.observacao)
        if (!current.currentContactData && rowPhoneDigits) current.currentContactData = formatContactPhone(rowPhoneDigits)
        if (rowDateIso && (!current.occurredAt || Date.parse(rowDateIso) > Date.parse(String(current.occurredAt)))) {
          current.occurredAt = rowDateIso
        }
        crmIdIndex.set(rowId, matchedKey)
      } else {
        const targetKey = rowPhoneKey && !grouped.has(rowPhoneKey) ? rowPhoneKey : `crm-${rowId}`
        const acq = resolveAcquisition(rowSources)
        grouped.set(targetKey, {
          leadId: rowId,
          rawPhone: rowPhoneDigits || undefined,
          occurredAt: rowDateIso,
          crmStatus: row.atualizado_em && row.criado_em && row.atualizado_em !== row.criado_em ? 'atualizado' : 'criado',
          name: String(row.nome || 'Lead CRM').trim(),
          city: String(row.cidade || '').trim(),
          state: String(row.uf || '').trim(),
          interest: String(row.produto || row.interesse || '').trim(),
          metaForm: '',
          segment: formatCrmSegment(row),
          campaign: String(row.campanha || row.origem || 'CRM Oficial').trim(),
          consultant: consultant || (inMesa ? 'Mesa' : 'Equipe comercial'),
          inMesa,
          crmDelivery: inMesa ? 'mesa' : consultant ? 'consultant' : '',
          commercialScope: '',
          qualified: false,
          recurrence: false,
          recurrenceOrigin: '',
          crmPersisted: true,
          transfer: 'enviada',
          sources: rowSources,
          acquisitionSource: acq.acquisitionSource,
          acquisitionLabel: acq.acquisitionLabel,
          leadMessage: '',
          botMessage: '',
          currentObservation: redactObservation(row.observacao || ''),
          currentContactData: formatContactPhone(rowPhoneDigits),
          n8nEvents: [],
        })
      }
    }
  }

  // 4. Sanitiza saída (zero rawPhone/messageId) e aplica janela do período
  const allLeads = [...grouped.values()].map((lead) => {
    const { rawPhone, messageId, ...leadData } = lead
    const orderedEvents = (lead.n8nEvents || [])
      .slice()
      .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')))
    const latestInbound = orderedEvents.find((event) => event.leadMessage)
    const sources = mergeSources(leadData.sources)
    const acq = resolveAcquisition(sources)

    return {
      ...leadData,
      sources,
      acquisitionSource: leadData.acquisitionSource || acq.acquisitionSource,
      acquisitionLabel: leadData.acquisitionLabel || acq.acquisitionLabel,
      leadMessage: latestInbound ? latestInbound.leadMessage : lead.leadMessage || '',
      botMessage: latestInbound ? latestInbound.botMessage || '' : lead.botMessage || '',
      n8nEvents: orderedEvents.map((event) => ({
        occurredAt: event.occurredAt,
        crmStatus: event.crmStatus,
        recurrence: event.recurrence,
        transfer: event.transfer,
        interactionKind: event.interactionKind || 'chat',
        leadMessage: event.leadMessage || '',
        botMessage: event.botMessage || '',
        currentObservation: event.currentObservation,
        currentContactData: event.currentContactData,
      })),
    }
  })

  const leads = allLeads
    .filter((lead) => {
      if (!start) return true
      if (!lead.occurredAt) return false
      return new Date(lead.occurredAt) >= start
    })
    .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')))

  const uniqueLeads = leads.length
  const inQualification = leads.filter((l) => l.crmStatus === 'em-qualificacao').length
  const pendingConfirmation = leads.filter((l) => l.crmStatus === 'confirmacao-pendente').length
  const created = leads.filter((l) => l.crmStatus === 'criado').length
  const updated = leads.filter((l) => l.crmStatus === 'atualizado').length
  const transferConfirmed = leads.filter((l) => l.transfer === 'enviada').length
  const recurrent = leads.filter((l) => l.recurrence).length
  const totalInteractions = leads.reduce((sum, l) => sum + (l.n8nEvents?.length || 1), 0)

  return {
    leads,
    summary: {
      uniqueLeads,
      created,
      updated,
      inQualification,
      pendingConfirmation,
      transferConfirmed,
      recurrent,
      totalInteractions,
    },
  }
}

async function fetchWorkflowExecutions(workflowId, start, rangeKey = 'default', options = {}) {
  const baseUrl = process.env.N8N_ARAUNAH_BASE_URL?.replace(/\/$/, '')
  const apiKey = process.env.N8N_ARAUNAH_API_KEY
  if (!baseUrl || !apiKey) throw new Error('Integração n8n não configurada no ambiente do servidor.')

  const cacheKey = `${workflowId}:${String(rangeKey)}:${start ? start.toISOString().slice(0, 10) : 'all'}`
  if (!options.forceRefresh) {
    const cached = leadsMemoryCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }
  }

  let conversationStates = {}
  let statesAvailable = options.expectConversationState === false
  const workflowDeadline = Date.now() + 11500
  const listDeadline = Date.now() + 6500

  const statesTask =
    options.expectConversationState === false
      ? Promise.resolve()
      : (async () => {
          try {
            const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
              headers: {
                'X-N8N-API-KEY': apiKey,
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
              },
              signal: AbortSignal.timeout(11000),
            })
            if (wfRes.ok) {
              const wfJson = await wfRes.json()
              const states = wfJson?.staticData?.global?.araunahConversationState
              if (states && typeof states === 'object' && !Array.isArray(states)) {
                conversationStates = states
                statesAvailable = true
              }
            }
          } catch {
            /* Cobertura parcial informada na resposta. */
          }
        })()

  const allRows = []
  let cursor = null
  let listFailure = false
  let reachedWindowStart = false
  const maxListPages = Number.isFinite(options.maxListPages) ? options.maxListPages : 12
  const listTask = (async () => {
    for (let page = 0; page < maxListPages; page += 1) {
      if (page > 0 && Date.now() >= listDeadline) break
      const query = new URLSearchParams({ workflowId, limit: '250' })
      if (cursor) query.set('cursor', cursor)
      try {
        const listRes = await fetch(`${baseUrl}/api/v1/executions?${query}`, {
          headers: {
            'X-N8N-API-KEY': apiKey,
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
          },
          signal: AbortSignal.timeout(page === 0 ? 11500 : 7500),
        })
        if (!listRes.ok) {
          if (page === 0) throw new Error('Não foi possível consultar as execuções do n8n.')
          listFailure = true
          break
        }
        const payload = await listRes.json()
        if (!Array.isArray(payload?.data)) {
          if (page === 0) throw new Error('Resposta de execuções do n8n inválida.')
          listFailure = true
          break
        }
        const rows = payload.data
        allRows.push(...rows)
        cursor = payload.nextCursor ?? payload.next_cursor ?? null
        const oldestAt = rows.length > 0 ? executionDate(rows[rows.length - 1]) : null
        if (start && oldestAt && new Date(oldestAt) < start) {
          reachedWindowStart = true
          cursor = null
          break
        }
        if (!cursor || rows.length === 0) break
      } catch (err) {
        if (page === 0) throw err
        listFailure = true
        break
      }
    }
  })()

  await Promise.all([statesTask, listTask])

  const periodRows = allRows.filter((r) => {
    const at = executionDate(r)
    return Boolean(at) && (!start || new Date(at) >= start)
  })
  const minDurationMs = Number.isFinite(options.minDurationMs) ? options.minDurationMs : 1200
  const isMetaSource = options.expectConversationState === false
  let fastWorkflowErrors = false
  let shortUnanalyzedCount = 0
  const priorityCandidates = []
  const shortWebhooks = []

  for (const r of periodRows) {
    const dur = new Date(r.stoppedAt || 0).getTime() - new Date(r.startedAt || 0).getTime()
    if (isMetaSource) {
      if (r.status === 'error' && (!Number.isFinite(dur) || dur <= 1200)) {
        fastWorkflowErrors = true
        continue
      }
      if (r.status === 'success' || dur > minDurationMs || (r.status === 'error' && dur > 1200)) {
        priorityCandidates.push(r)
      } else {
        shortUnanalyzedCount += 1
      }
      continue
    }

    // Execuções periódicas curtas (cron de limpeza/follow-up sem carga útil) não são descartadas como leads omitidos.
    if (r.mode === 'trigger' && r.status === 'success' && dur < minDurationMs) {
      continue
    }

    if (dur > minDurationMs || (r.mode === 'webhook' && dur >= 500) || r.status === 'error') {
      priorityCandidates.push(r)
    } else if (r.mode === 'webhook' && r.status === 'success') {
      shortWebhooks.push(r)
    } else {
      shortUnanalyzedCount += 1
    }
  }

  const maxDetails = Number.isFinite(options.maxDetails) ? options.maxDetails : 80
  let candidateRows = priorityCandidates
  if (!isMetaSource && shortWebhooks.length > 0) {
    if (priorityCandidates.length + shortWebhooks.length <= maxDetails && shortWebhooks.length <= 35) {
      candidateRows = [...priorityCandidates, ...shortWebhooks]
    } else {
      shortUnanalyzedCount += shortWebhooks.length
    }
  }

  const targetRows = candidateRows.slice(0, maxDetails)
  const detailDeadline = workflowDeadline
  const batchSize = 15
  const executions = []
  let detailBudgetExceeded = false
  for (let i = 0; i < targetRows.length; i += batchSize) {
    if (i > 0 && Date.now() >= detailDeadline) {
      detailBudgetExceeded = true
      break
    }
    const reqTimeoutMs = Math.max(3000, Math.min(5500, detailDeadline - Date.now()))
    const slice = targetRows.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      slice.map(async (row) => {
        try {
          const res = await fetch(`${baseUrl}/api/v1/executions/${row.id}?includeData=true`, {
            headers: {
              'X-N8N-API-KEY': apiKey,
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
            },
            signal: AbortSignal.timeout(reqTimeoutMs),
          })
          if (!res.ok) return null
          return res.json()
        } catch {
          return null
        }
      })
    )
    for (const item of batchResults) {
      if (item) executions.push(item)
    }
  }

  const reasons = []
  if (!statesAvailable && options.expectConversationState !== false) {
    reasons.push('Estados de conversa indisponíveis')
  }
  if (listFailure) reasons.push('Falha em parte da paginação de execuções')
  if (cursor && !reachedWindowStart) reasons.push('A listagem atingiu o limite de páginas')
  if (fastWorkflowErrors) reasons.push('No período consultado, execuções do workflow Meta falharam antes de processar leads')
  if (allRows.some((r) => !executionDate(r))) reasons.push('Algumas execuções não têm data válida')
  if (candidateRows.length > targetRows.length) reasons.push('A listagem atingiu o limite de detalhes de execução')
  if (detailBudgetExceeded || executions.length < targetRows.length) reasons.push('Alguns detalhes de execução não puderam ser consultados')
  if (shortUnanalyzedCount > 0) reasons.push('Execuções curtas não foram analisadas individualmente')

  const coverage = {
    complete: reasons.length === 0,
    reasons,
    executionsListed: periodRows.length,
    detailsRequested: targetRows.length,
    detailsRead: executions.length,
  }
  const output = { executions, conversationStates, coverage }
  leadsMemoryCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, data: output })
  return output
}

async function fetchExecutions(start, rangeKey = 'default', options = {}) {
  const workflowId = process.env.N8N_CHATBOT_WORKFLOW_ID?.trim() || DEFAULT_CHATBOT_WORKFLOW_ID
  return fetchWorkflowExecutions(workflowId, start, rangeKey, options)
}

function getConfiguredMetaWorkflowIds() {
  const chatbotId = process.env.N8N_CHATBOT_WORKFLOW_ID?.trim() || DEFAULT_CHATBOT_WORKFLOW_ID
  const explicitMeta = process.env.N8N_META_WORKFLOW_ID?.trim()
  if (explicitMeta === 'off') return []
  const rawList = (process.env.N8N_ARAUNAH_WORKFLOW_IDS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((id) => id !== chatbotId)
  const fallbackMeta = explicitMeta || DEFAULT_META_WORKFLOW_ID
  const ids = new Set(rawList)
  if (fallbackMeta && fallbackMeta !== chatbotId) ids.add(fallbackMeta)
  return [...ids]
}

function extractToolRows(res, key) {
  if (Array.isArray(res)) return res
  if (res && Array.isArray(res[key])) return res[key]
  if (res && Array.isArray(res.data)) return res.data
  if (res && Array.isArray(res.rows)) return res.rows
  return []
}

async function fetchActiveConsultants() {
  if (!getLeadsApiConfig().configured) return []
  const res = await callLeadsApiTool('listar_consultores', {})
  const list = extractToolRows(res, 'consultores')
  return list
    .filter((item) => item && item.nome && item.ativo !== false)
    .map((item) => ({
      uid: String(item.uid ?? item.id ?? item.nome),
      name: String(item.nome).trim(),
      segment: String(item.vertical || item.segmento || item.regional || item.cidade_base || '').trim(),
      active: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

async function fetchCrmLeads() {
  if (!getLeadsApiConfig().configured) return []
  const res = await callLeadsApiTool('buscar_leads', { limite: 250 })
  return extractToolRows(res, 'leads')
}

async function verifyCrmRecordAfterWrite({ crmId, phone55, name }) {
  const targetId = Number(crmId)
  const searchQueries = [
    ...(phone55 ? [{ texto: phone55, limite: 50 }] : []),
    ...(name ? [{ texto: name, limite: 50 }] : []),
    { limite: 250 },
  ]
  for (const args of searchQueries) {
    const res = await callLeadsApiTool('buscar_leads', args)
    const rows = extractToolRows(res, 'leads')
    const match = rows.find((row) => Number(row?.id) === targetId)
    if (match) return match
  }
  return null
}

function parsePeriod(param) {
  const raw = String(param ?? '30').trim().toLowerCase()
  if (['today', '1', '1d', 'dia', 'hoje'].includes(raw)) {
    const now = new Date()
    const brtOffsetMs = 3 * 60 * 60 * 1000
    const brtDate = new Date(now.getTime() - brtOffsetMs)
    const midnightBrt = new Date(
      Date.UTC(brtDate.getUTCFullYear(), brtDate.getUTCMonth(), brtDate.getUTCDate(), 3, 0, 0, 0)
    )
    const start = midnightBrt <= now ? midnightBrt : new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return { key: 'today', days: 1, start }
  }
  if (['all', 'total', '0', 'tudo', 'completo'].includes(raw)) {
    return { key: 'all', days: 0, start: null }
  }
  const days = Number(raw.replace(/\D/g, ''))
  if (!Number.isInteger(days) || days <= 0) {
    return { key: 30, days: 30, start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  }
  return { key: days, days, start: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function matchesSearchQuery(lead, rawQuery) {
  const term = normalizeSearchText(rawQuery)
  if (!term) return true
  const termDigits = String(rawQuery).replace(/\D/g, '')
  const phoneDigits = String(lead.currentContactData || '').replace(/\D/g, '')
  if (termDigits.length >= 3 && phoneDigits.includes(termDigits)) return true

  const haystacks = [
    lead.leadId,
    lead.name,
    lead.city,
    lead.state,
    lead.interest,
    lead.metaForm,
    lead.segment,
    lead.campaign,
    lead.consultant,
    lead.currentContactData,
    lead.leadMessage,
    lead.botMessage,
    lead.currentObservation,
  ]
  if (haystacks.some((item) => normalizeSearchText(item).includes(term))) return true

  if (Array.isArray(lead.n8nEvents)) {
    return lead.n8nEvents.some(
      (evt) =>
        normalizeSearchText(evt.leadMessage).includes(term) ||
        normalizeSearchText(evt.botMessage).includes(term) ||
        normalizeSearchText(evt.currentObservation).includes(term)
    )
  }
  return false
}

function buildViewFacetsAndPaginate(allLeads, { view = 'all', q = '', page = 1, pageSize = 25 } = {}) {
  const isCrmConfirmed = (l) => Boolean(l.crmPersisted && (l.crmStatus === 'criado' || l.crmStatus === 'atualizado'))
  const processLeads = allLeads.filter((l) => !isCrmConfirmed(l))
  const crmLeads = allLeads.filter(isCrmConfirmed)
  const pendingLeads = allLeads.filter((l) => l.crmStatus === 'confirmacao-pendente')
  const mesaCount = crmLeads.filter((l) => l.inMesa === true).length

  const tabs = {
    all: allLeads.length,
    process: processLeads.length,
    crm: crmLeads.length,
    mesa: mesaCount,
    pending: pendingLeads.length,
  }

  const facets = {
    bySource: {
      all: allLeads.length,
      meta: allLeads.filter((l) => l.sources?.includes('meta')).length,
      n8n: allLeads.filter((l) => l.sources?.includes('n8n')).length,
      crm: allLeads.filter((l) => l.sources?.includes('crm') || isCrmConfirmed(l)).length,
    },
  }

  const viewPool = view === 'process' ? processLeads : view === 'crm' ? crmLeads : allLeads
  const searched = q ? viewPool.filter((lead) => matchesSearchQuery(lead, q)) : viewPool

  const safePageSize = Math.min(100, Math.max(1, Number.parseInt(String(pageSize), 10) || 25))
  const totalItems = searched.length
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize))
  const safePage = Math.min(totalPages, Math.max(1, Number.parseInt(String(page), 10) || 1))
  const offset = (safePage - 1) * safePageSize

  return {
    tabs,
    facets,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
    },
    leads: searched.slice(offset, offset + safePageSize),
  }
}

async function notifyManualCrmTransferWebhook(payload) {
  const baseUrl = process.env.N8N_ARAUNAH_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl || !/^55\d{10,11}$/.test(String(payload?.telefone || ''))) return false
  try {
    const res = await fetch(`${baseUrl}/webhook/webhook-crm-transfer-araunah`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AraunahDashboard/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function handleCrmUpsert(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Corpo JSON inválido.' }, 400)
  }

  const action = String(body?.action || 'upsert').trim().toLowerCase()
  if (!['upsert', 'update', 'delete'].includes(action)) {
    return json({ error: 'Ação não suportada para CRM.' }, 400)
  }

  if (action === 'delete') {
    const rawId = String(body?.leadId || '').trim()
    if (!/^\d+$/.test(rawId)) {
      return json({ error: 'ID numérico do CRM inválido para exclusão.' }, 400)
    }
    const crmId = Number(rawId)
    const reason = String(body?.reason || 'Exclusão solicitada na Central de Leads Araunah').trim().slice(0, 300)
    await callLeadsApiTool('excluir_leads', { ids: [crmId], motivo: reason })
    const remaining = await verifyCrmRecordAfterWrite({
      crmId,
      phone55: normalizePhoneTo55(body?.phone || ''),
    })
    if (remaining) {
      return json({ error: 'Exclusão não confirmada pela releitura oficial do CRM.' }, 502)
    }
    leadsMemoryCache.clear()
    return json({ ok: true, action: 'delete', leadId: String(crmId), verifiedReadback: true })
  }

  const cleanName = String(body?.name || '').trim()
  const cleanPhoneInput = String(body?.phone || '').trim()
  const phone55 = normalizePhoneTo55(cleanPhoneInput)
  const cleanCity = body?.city && String(body.city).trim() !== '-' ? String(body.city).trim() : ''
  const rawUf = body?.state && String(body.state).trim() !== '-' ? normalizeTextKey(body.state).slice(0, 2) : ''
  const cleanUf = /^[A-Z]{2}$/.test(rawUf) ? rawUf : ''
  const cleanInterest = body?.interest && String(body.interest).trim() !== '-' ? String(body.interest).trim() : ''
  const cleanCampaign = String(body?.campaign || '').trim()
  const cleanObs = redactObservation(body?.observations || '')
  const mappedOrigin = ALLOWED_CRM_ORIGINS.get(String(body?.origin || 'WhatsApp').toLowerCase().trim()) || 'WhatsApp'
  const requestedConsultant = String(body?.consultant || '').trim()
  const routeToMesa = requestedConsultant ? false : body?.routeToMesa !== false

  const activeConsultants = await fetchActiveConsultants()
  let targetConsultant = null
  if (requestedConsultant) {
    const targetKey = normalizeTextKey(requestedConsultant)
    targetConsultant = activeConsultants.find((item) => normalizeTextKey(item.name) === targetKey) || null
    if (!targetConsultant) {
      return json({ error: 'Consultor selecionado não consta como ativo na base oficial do CRM.' }, 422)
    }
  }
  const yasminFallback =
    activeConsultants.find((item) => {
      const key = normalizeTextKey(item.name)
      return key === 'YASMIN VALIM' || (key.startsWith('YASMIN') && key.includes('VALIM'))
    }) || null

  let crmId = null
  let crmStatus = 'criado'

  if (action === 'upsert') {
    if (!cleanName || cleanName === '-') {
      return json({ error: 'Informe o nome do lead antes de salvar no CRM.' }, 400)
    }
    if (!phone55) {
      return json({ error: 'Informe um telefone/WhatsApp válido com DDD antes de salvar no CRM.' }, 400)
    }
    const upsertRes = await callLeadsApiTool('cadastrar_lead', {
      nome: cleanName,
      telefone: phone55,
      ...(cleanCity ? { cidade: cleanCity } : {}),
      ...(cleanUf ? { uf: cleanUf } : {}),
      ...(cleanInterest ? { produto: cleanInterest } : {}),
      origem: mappedOrigin,
      ...(cleanCampaign ? { campanha: cleanCampaign } : {}),
      ...(cleanObs ? { observacao: cleanObs } : {}),
    })
    const createdRecord = Array.isArray(upsertRes) ? upsertRes[0] : upsertRes
    crmId = Number(createdRecord?.id ?? createdRecord?.lead_id ?? createdRecord?.lead?.id)
    if (!Number.isInteger(crmId) || crmId <= 0) {
      return json({ error: 'A API oficial não retornou um ID válido para o cadastro no CRM.' }, 502)
    }
    crmStatus = String(createdRecord?.status || 'criado')
  } else {
    const rawId = String(body?.leadId || '').trim()
    if (!/^\d+$/.test(rawId)) {
      return json({ error: 'ID numérico do CRM obrigatório para atualização.' }, 400)
    }
    crmId = Number(rawId)
    const campos = {}
    if (cleanName && cleanName !== '-') campos.nome = cleanName
    if (phone55) campos.telefone = phone55
    if (cleanCity) campos.cidade = cleanCity
    if (cleanUf) campos.uf = cleanUf
    if (cleanInterest) campos.produto = cleanInterest
    if (mappedOrigin) campos.origem = mappedOrigin
    if (cleanCampaign) campos.campanha = cleanCampaign
    if (cleanObs) campos.observacao = cleanObs
    if (targetConsultant) campos.consultor_nome = targetConsultant.name

    await callLeadsApiTool('editar_lead', { lead_id: crmId, campos })
    crmStatus = 'atualizado'
  }

  if (targetConsultant && action === 'upsert') {
    await callLeadsApiTool('editar_lead', {
      lead_id: crmId,
      campos: { consultor_nome: targetConsultant.name },
    })
  } else if (routeToMesa) {
    let mesaAccepted = false
    try {
      const mesaRes = await callLeadsApiTool('enviar_para_mesa', {
        ids: [crmId],
        motivo:
          action === 'update'
            ? 'Atualização via Central de Leads Araunah'
            : 'Lead encaminhado pela Central de Leads Araunah',
      })
      const enviados = Number(mesaRes?.enviados ?? 0)
      const recusados = Array.isArray(mesaRes?.recusados) ? mesaRes.recusados : []
      mesaAccepted = enviados > 0 && recusados.length === 0
    } catch {
      mesaAccepted = false
    }

    if (!mesaAccepted && yasminFallback) {
      await callLeadsApiTool('editar_lead', {
        lead_id: crmId,
        campos: { consultor_nome: yasminFallback.name },
      })
    }
  }

  const verifiedRow = await verifyCrmRecordAfterWrite({ crmId, phone55, name: cleanName })
  if (!verifiedRow) {
    return json({ error: 'Gravação no CRM não confirmada pela releitura independente.' }, 502)
  }

  const inMesa = verifiedRow.na_mesa === true
  const persistedConsultant = String(verifiedRow.consultor_nome || '').trim()
  if (targetConsultant && normalizeTextKey(persistedConsultant) !== normalizeTextKey(targetConsultant.name)) {
    return json({ error: 'A releitura oficial do CRM não confirmou o consultor atribuído.' }, 502)
  }
  if (routeToMesa && !inMesa && !persistedConsultant) {
    return json({ error: 'A releitura oficial do CRM não confirmou o destino do lead (Mesa ou consultora responsável).' }, 502)
  }

  const delivery = {
    destination: inMesa ? 'mesa' : 'consultant',
    inMesa,
    consultant: persistedConsultant,
  }

  let webhookNotified = false
  if (body?.manualTransferNotice === true && phone55) {
    webhookNotified = await notifyManualCrmTransferWebhook({
      telefone: phone55,
      crmLeadId: crmId,
      nome: cleanName,
      consultor: persistedConsultant || (inMesa ? 'MESA DE LEADS' : ''),
      cidade: cleanCity,
      uf: cleanUf,
      interesse: cleanInterest,
      destino: delivery.destination,
      notifyLead: true,
    })
  }

  leadsMemoryCache.clear()
  return json({
    ok: true,
    action,
    crmResult: { id: crmId, status: crmStatus },
    delivery,
    verifiedReadback: true,
    webhookNotified,
  })
}

export default async function handler(request) {
  const url = new URL(request.url)
  const pathname = url.pathname

  try {
    await requireAccess(request)

    if (request.method === 'POST' && pathname.endsWith('/crm-upsert')) {
      return await handleCrmUpsert(request)
    }

    if (request.method !== 'GET') {
      return json({ error: 'Método não permitido.' }, 405)
    }

    if (pathname.endsWith('/consultants')) {
      try {
        const consultants = await fetchActiveConsultants()
        return json({ consultants })
      } catch {
        return json({ error: 'Não foi possível consultar os consultores ativos no CRM.' }, 502)
      }
    }

    const summaryDeadline = Date.now() + 15500
    const rangeParam = url.searchParams.get('days') || url.searchParams.get('period') || '7'
    const period = parsePeriod(rangeParam)
    const start = period.start
    const forceRefresh = url.searchParams.get('refresh') === '1'
    const view = String(url.searchParams.get('view') || 'all').trim().toLowerCase()
    const searchQuery = url.searchParams.get('q') || ''
    const page = url.searchParams.get('page') || '1'
    const pageSize = url.searchParams.get('pageSize') || '25'

    const hasN8nConfig = Boolean(process.env.N8N_ARAUNAH_BASE_URL && process.env.N8N_ARAUNAH_API_KEY)
    const hasCrmConfig = getLeadsApiConfig().configured

    const metaIds = getConfiguredMetaWorkflowIds()
    const trimmedSearch = searchQuery.trim()

    let chatPayload = { executions: [], conversationStates: {}, coverage: { complete: false, reasons: ['n8n não consultado'], executionsListed: 0, detailsRequested: 0, detailsRead: 0 } }
    let chatbotError = null
    const metaExecutions = []
    const metaReasons = []
    let metaError = null
    let initialCrmRows = []
    let consultants = []
    let crmError = null
    let crmSearchRows = []
    let crmSearchError = false

    const chatTask = hasN8nConfig
      ? fetchExecutions(start, period.key, { forceRefresh }).catch((err) => {
          chatbotError = err
          return null
        })
      : Promise.resolve().then(() => {
          chatbotError = new Error('Integração n8n não configurada no servidor.')
          return null
        })

    const metaTasks =
      hasN8nConfig && metaIds.length > 0
        ? Promise.all(
            metaIds.map((metaId) =>
              fetchWorkflowExecutions(metaId, start, `meta-${period.key}`, {
                forceRefresh,
                expectConversationState: false,
                minDurationMs: 200,
                maxDetails: 120,
              }).catch((err) => {
                metaError = err
                return null
              })
            )
          )
        : Promise.resolve([])

    const crmListTask = hasCrmConfig
      ? Promise.all([fetchCrmLeads(), fetchActiveConsultants()]).catch((err) => {
          crmError = err
          return [[], []]
        })
      : Promise.resolve([[], []])

    const crmSearchTask =
      hasCrmConfig && trimmedSearch.length >= 2
        ? (async () => {
            const qDigits = trimmedSearch.replace(/\D/g, '')
            const searchTerms = [trimmedSearch]
            if (qDigits.length >= 8 && qDigits.slice(-8) !== trimmedSearch) {
              searchTerms.push(qDigits.slice(-8))
            }
            const searchReads = await Promise.allSettled(
              searchTerms.map(async (texto) => {
                const response = await callLeadsApiTool('buscar_leads', { texto, limite: 100 })
                return extractToolRows(response, 'leads')
              })
            )
            for (const sr of searchReads) {
              if (sr.status === 'fulfilled') crmSearchRows.push(...sr.value)
              else crmSearchError = true
            }
          })()
        : Promise.resolve()

    const [chatSnap, metaSnaps, crmTuple] = await Promise.all([chatTask, metaTasks, crmListTask, crmSearchTask])
    if (chatSnap) chatPayload = chatSnap
    if (Array.isArray(metaSnaps)) {
      for (const metaSnap of metaSnaps) {
        if (!metaSnap) continue
        metaExecutions.push(...(metaSnap.executions || []))
        for (const reason of metaSnap.coverage?.reasons || []) {
          if (!metaReasons.includes(reason)) metaReasons.push(reason)
        }
      }
    }
    if (Array.isArray(crmTuple)) {
      ;[initialCrmRows, consultants] = crmTuple
    }
    if (chatbotError) {
      metaExecutions.length = 0
      metaReasons.length = 0
    }

    const mergeCrmRowCollections = (...lists) => {
      const byId = new Map()
      for (const list of lists) {
        for (const row of list || []) {
          if (!row || !row.id) continue
          byId.set(String(row.id), row)
        }
      }
      return [...byId.values()]
    }

    let crmRows = mergeCrmRowCollections(initialCrmRows, crmSearchRows)
    const initialOldestCrmMs = initialCrmRows
      .map((row) => Date.parse(String(row?.criado_em || row?.atualizado_em || '')))
      .filter(Number.isFinite)
      .reduce((min, ts) => (min === null || ts < min ? ts : min), null)
    const crmListCapped =
      !trimmedSearch &&
      initialCrmRows.length >= 100 &&
      (!start || initialOldestCrmMs === null || initialOldestCrmMs >= start.getTime())

    if (chatbotError && (!hasCrmConfig || crmError)) {
      const failure = new Error('Não foi possível carregar os dados do n8n. Tente novamente.')
      failure.status = 502
      throw failure
    }

    const executions = Array.isArray(chatPayload) ? chatPayload : chatPayload.executions || []
    const conversationStates = chatPayload.conversationStates || {}
    let result = buildLeads(executions, start, conversationStates, { metaExecutions, crmRows })
    let specificReadIncomplete = false
    if (hasCrmConfig && !crmError) {
      const knownIds = new Set(crmRows.map((row) => String(row?.id ?? '')))
      const pendingCandidates = result.leads.filter((lead) => {
        if (lead.crmStatus !== 'confirmacao-pendente') return false
        const idStr = String(lead.leadId || '')
        if (/^\d+$/.test(idStr)) return !knownIds.has(idStr)
        return Boolean(crmPhoneSearchText(extractLeadPhoneDigits(lead))) || !isGenericLeadName(lead.name)
      })
      const maxPendingReads = 25
      const selectedPending = pendingCandidates.slice(0, maxPendingReads)
      specificReadIncomplete = pendingCandidates.length > selectedPending.length

      const pendingLookupRows = []
      const pendingDeadline = Math.min(summaryDeadline, Date.now() + 3500)
      for (let i = 0; i < selectedPending.length; i += 8) {
        if (i > 0 && Date.now() >= pendingDeadline) {
          specificReadIncomplete = true
          break
        }
        const slice = selectedPending.slice(i, i + 8)
        const reads = await Promise.allSettled(
          slice.map(async (lead) => {
            const idStr = String(lead.leadId || '')
            const rawPhone = extractLeadPhoneDigits(lead)
            const last8 = crmPhoneSearchText(rawPhone)
            if (/^\d+$/.test(idStr)) {
              const response = await callLeadsApiTool('buscar_leads', { texto: idStr, limite: 10 })
              const idMatches = extractToolRows(response, 'leads').filter((row) => String(row?.id ?? '') === idStr)
              if (idMatches.length > 0) return idMatches
              if (last8) {
                const phoneRes = await callLeadsApiTool('buscar_leads', { texto: last8, limite: 20 })
                return extractToolRows(phoneRes, 'leads').filter((row) => String(row?.id ?? '') === idStr)
              }
              return []
            }
            if (last8) {
              const phoneKey = phoneCorrelationKey(rawPhone)
              const response = await callLeadsApiTool('buscar_leads', { texto: last8, limite: 20 })
              return extractToolRows(response, 'leads').filter(
                (row) => phoneKey && phoneCorrelationKey(row?.telefone || '') === phoneKey
              )
            }
            const cleanName = String(lead.name || '').trim()
            if (!isGenericLeadName(cleanName)) {
              const response = await callLeadsApiTool('buscar_leads', { texto: cleanName, limite: 20 })
              return extractToolRows(response, 'leads')
            }
            return []
          })
        )
        for (const read of reads) {
          if (read.status === 'rejected') {
            specificReadIncomplete = true
          } else {
            pendingLookupRows.push(...read.value)
          }
        }
      }

      if (pendingLookupRows.length > 0) {
        crmRows = mergeCrmRowCollections(crmRows, pendingLookupRows)
        result = buildLeads(executions, start, conversationStates, { metaExecutions, crmRows })
      }
    }

    let searchableLeads = result.leads
    let searchMeta = null
    if (trimmedSearch.length >= 2) {
      const globalResult = buildLeads(executions, null, conversationStates, { metaExecutions, crmRows })
      const inPeriodIds = new Set(result.leads.map((lead) => String(lead.leadId)))
      const outsideMatches = globalResult.leads.filter(
        (lead) => !inPeriodIds.has(String(lead.leadId)) && matchesSearchQuery(lead, trimmedSearch)
      )
      searchableLeads = outsideMatches.length ? [...result.leads, ...outsideMatches] : result.leads
      searchMeta = {
        query: trimmedSearch,
        globalDatabase: true,
        matchesOutsidePeriod: outsideMatches.length,
      }
    }

    const coverageReasons = [...new Set([...(chatPayload.coverage?.reasons || []), ...metaReasons])]
    if (metaError) coverageReasons.push('Leitura de execuções Meta Lead Ads incompleta')
    if (hasCrmConfig && crmError) coverageReasons.push('Base oficial do CRM indisponível nesta consulta')
    if (crmListCapped) coverageReasons.push('Listagem inicial do CRM limitada aos 100 registros mais recentes; use a busca para consultar todo o banco')
    if (crmSearchError) coverageReasons.push('Parte da busca direta na base do CRM falhou')
    if (specificReadIncomplete) coverageReasons.push('Parte das confirmações individuais do CRM não pôde ser consultada')

    const coverage = {
      complete: !chatbotError && coverageReasons.length === 0,
      reasons: coverageReasons,
      executionsListed: chatPayload.coverage?.executionsListed ?? 0,
      detailsRequested: chatPayload.coverage?.detailsRequested ?? 0,
      detailsRead: chatPayload.coverage?.detailsRead ?? 0,
    }

    const sourceHealth = {
      n8nChatbot: chatbotError
        ? { status: 'error', message: 'Chatbot n8n indisponível' }
        : chatPayload.coverage?.complete === false
        ? { status: 'partial', message: 'Leitura do chatbot incompleta' }
        : { status: 'ok' },
      n8nMeta:
        metaIds.length === 0
          ? { status: 'ok' }
          : metaError
          ? { status: 'error', message: 'Workflow Meta Ads indisponível' }
          : metaReasons.length > 0
          ? { status: 'partial', message: 'Leitura ou processamento Meta incompleto' }
          : { status: 'ok' },
      crm: !hasCrmConfig
        ? { status: 'unconfigured', message: 'API oficial do CRM não configurada' }
        : crmError
        ? { status: 'error', message: 'API oficial do CRM indisponível' }
        : crmListCapped || crmSearchError || specificReadIncomplete
        ? { status: 'partial', message: 'Listagem inicial do CRM limitada aos 100 mais recentes; use a busca para consultar todo o banco' }
        : { status: 'ok' },
    }

    const sliced = buildViewFacetsAndPaginate(searchableLeads, { view, q: searchQuery, page, pageSize })

    return json({
      schema: 'araunah.n8n-leads.v2',
      source: 'Meta Lead Ads + n8n Chatbot + CRM oficial',
      generatedAt: new Date().toISOString(),
      rangeDays: period.key,
      summary: result.summary,
      tabs: sliced.tabs,
      facets: sliced.facets,
      pagination: sliced.pagination,
      sourceHealth,
      coverage,
      ...(searchMeta ? { searchMeta } : {}),
      consultants,
      leads: sliced.leads,
      trackingNotice:
        'CRM e destino são confirmados apenas por releitura oficial (na execução ou na API CRM). Registros sem essa evidência permanecem pendentes de confirmação.',
    })
  } catch (error) {
    const status = Number(error?.status) || 500
    const safeMessage = error instanceof Error ? error.message : 'Falha ao carregar leads.'
    return json({ error: safeMessage }, status)
  }
}

export const __test__ = {
  buildLeadEvent,
  buildMetaLeadEvent,
  buildLeads,
  nodeItems,
  fetchExecutions,
  fetchWorkflowExecutions,
  requireAccess,
  buildViewFacetsAndPaginate,
  verifyCrmRecordAfterWrite,
  phoneCorrelationKey,
  crmIdentityCompatible,
  resetCache: () => leadsMemoryCache.clear(),
}
