const DEFAULT_WORKFLOW_ID = 'eXj1wyXmjshhMOtl'
const WORKFLOW_NAME = 'CHATBOT-ARAUNAH WHATSAPP'
const PAGE_SIZE = 40
const MAX_PAGES = 4
const PERIODS = new Set([7, 15, 30])
const BR_TIMEZONE = 'America/Sao_Paulo'
const PRODUCTION_PHONE_NUMBER_ID = process.env.N8N_PRODUCTION_PHONE_NUMBER_ID ?? '1260236903829724'

function json(body, status = 200, requestId) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
    },
  })
}

function nodeRuns(execution, nodeName) {
  return execution?.data?.resultData?.runData?.[nodeName] ?? []
}

function nodeItems(execution, nodeName, branchIndex = null) {
  const items = []
  for (const run of nodeRuns(execution, nodeName)) {
    const branches = run?.data?.main ?? []
    const selected = branchIndex === null ? branches : [branches[branchIndex] ?? []]
    for (const branch of selected) {
      for (const item of branch ?? []) {
        if (item && typeof item.json === 'object' && item.json !== null) items.push(item.json)
      }
    }
  }
  return items
}

function allNodeNames(execution) {
  return Object.keys(execution?.data?.resultData?.runData ?? {})
}

function collectArrays(value, key, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectArrays(item, key, result)
    return result
  }
  if (!value || typeof value !== 'object') return result
  if (Array.isArray(value[key])) result.push(...value[key])
  for (const child of Object.values(value)) collectArrays(child, key, result)
  return result
}

function executionDate(execution) {
  const raw = execution?.startedAt ?? execution?.createdAt ?? execution?.stoppedAt
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.valueOf()) ? date : null
}

function localDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BR_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function graphMessageIds(execution) {
  const ids = new Set()
  for (const name of allNodeNames(execution)) {
    if (/webhook|respond to webhook/i.test(name)) continue
    for (const item of nodeItems(execution, name)) {
      for (const message of collectArrays(item, 'messages')) {
        const id = String(message?.id ?? '').trim()
        if (id && (message?.message_status === 'accepted' || /enviar|graph|resposta|fallback/i.test(name))) ids.add(id)
      }
    }
  }
  return ids
}

function transferMessageIds(execution) {
  const ids = new Set()
  for (const name of allNodeNames(execution)) {
    if (!/transfer/i.test(name)) continue
    for (const item of nodeItems(execution, name)) {
      for (const message of collectArrays(item, 'messages')) {
        const id = String(message?.id ?? '').trim()
        if (id) ids.add(id)
      }
    }
  }
  return ids
}

function identityKey(item) {
  const metadata = collectMetadata(item).find((value) => String(value?.phone_number_id ?? '').trim())
  const phoneNumberId = String(metadata?.phone_number_id ?? '').trim()
  if (!phoneNumberId) return 'unknown'
  return phoneNumberId === PRODUCTION_PHONE_NUMBER_ID ? 'production' : 'other'
}

function collectMetadata(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMetadata(item, result)
    return result
  }
  if (!value || typeof value !== 'object') return result
  if (value.metadata && typeof value.metadata === 'object') result.push(value.metadata)
  for (const child of Object.values(value)) collectMetadata(child, result)
  return result
}

function emptyIdentityStats() {
  return { inbound: 0, callbacks: 0, callbackStatuses: { sent: 0, delivered: 0, read: 0, failed: 0 } }
}

function webhookSignals(execution) {
  const messageKeys = new Set()
  const callbackKeys = new Set()
  const callbackStatuses = { sent: 0, delivered: 0, read: 0, failed: 0 }
  const identitySplit = { production: emptyIdentityStats(), other: emptyIdentityStats(), unknown: emptyIdentityStats() }
  for (const item of nodeItems(execution, 'Webhook WhatsApp POST')) {
    const identity = identitySplit[identityKey(item)]
    const messages = collectArrays(item, 'messages')
    messages.forEach((message, index) => {
      const key = String(message?.id ?? `${message?.timestamp ?? ''}:${message?.type ?? ''}:${index}`)
      if (!messageKeys.has(key)) {
        messageKeys.add(key)
        identity.inbound += 1
      }
    })
    const statuses = collectArrays(item, 'statuses')
    statuses.forEach((status, index) => {
      const state = String(status?.status ?? '').toLowerCase()
      const key = `${String(status?.id ?? `${status?.timestamp ?? ''}:${index}`)}:${state}`
      if (!callbackKeys.has(key)) {
        callbackKeys.add(key)
        identity.callbacks += 1
        if (Object.hasOwn(callbackStatuses, state)) {
          callbackStatuses[state] += 1
          identity.callbackStatuses[state] += 1
        }
      }
    })
  }
  return { inbound: messageKeys.size, callbacks: callbackKeys.size, callbackStatuses, identitySplit }
}

function crmSignals(execution) {
  const items = nodeItems(execution, 'API SUPABASE')
  const created = items.filter((item) => String(item?.status ?? '').toLowerCase() === 'criado').length
  const updated = items.filter((item) => String(item?.status ?? '').toLowerCase() === 'atualizado').length
  const errors = items.filter((item) => Boolean(item?.error) || String(item?.status ?? '').toLowerCase() === 'erro').length
  return { created, updated, errors, confirmed: created + updated }
}

function aiSignal(execution) {
  return allNodeNames(execution)
    .filter((name) => /^AI Agent(?:\s|$|\[)/i.test(name))
    .reduce((total, name) => total + nodeItems(execution, name).length, 0)
}

function blockedSignal(execution) {
  return nodeItems(execution, 'VALIDAR DADOS MINIMOS DO LEAD')
    .filter((item) => item?.qualificacao_minima_completa === false || item?.crm_bloqueado === true).length
}

function executionSignals(execution) {
  const webhook = webhookSignals(execution)
  const crm = crmSignals(execution)
  const graphIds = graphMessageIds(execution)
  const transferIds = transferMessageIds(execution)
  const ai = aiSignal(execution)
  const blocked = blockedSignal(execution)
  const failedExecution = String(execution?.status ?? '').toLowerCase() === 'error'
  return {
    inbound: webhook.inbound,
    callbacks: webhook.callbacks,
    callbackStatuses: webhook.callbackStatuses,
    identitySplit: webhook.identitySplit,
    ai,
    graphAccepted: graphIds.size,
    transferAccepted: transferIds.size,
    crmCreated: crm.created,
    crmUpdated: crm.updated,
    crmConfirmed: crm.confirmed,
    crmErrors: crm.errors,
    blocked,
    failedExecutions: failedExecution ? 1 : 0,
    executionStatus: String(execution?.status ?? 'unknown'),
  }
}

function addSignals(target, source) {
  for (const key of ['inbound', 'callbacks', 'ai', 'graphAccepted', 'transferAccepted', 'crmCreated', 'crmUpdated', 'crmConfirmed', 'crmErrors', 'blocked', 'failedExecutions']) target[key] += source[key]
  for (const key of ['sent', 'delivered', 'read', 'failed']) target.callbackStatuses[key] += source.callbackStatuses[key]
  for (const identity of ['production', 'other', 'unknown']) {
    target.identitySplit[identity].inbound += source.identitySplit[identity].inbound
    target.identitySplit[identity].callbacks += source.identitySplit[identity].callbacks
    for (const key of ['sent', 'delivered', 'read', 'failed']) target.identitySplit[identity].callbackStatuses[key] += source.identitySplit[identity].callbackStatuses[key]
  }
  target.executions += 1
  target.statuses[source.executionStatus] = (target.statuses[source.executionStatus] ?? 0) + 1
}

function emptyAggregate() {
  return {
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
    identitySplit: { production: emptyIdentityStats(), other: emptyIdentityStats(), unknown: emptyIdentityStats() },
    statuses: {},
  }
}

function buildDaily(executions, start) {
  const byDate = new Map()
  for (const execution of executions) {
    const date = executionDate(execution)
    if (!date || date < start) continue
    const key = localDateKey(date)
    const row = byDate.get(key) ?? { date: key, executions: 0, inbound: 0, ai: 0, crm: 0, transfers: 0, failures: 0, callbacksFailed: 0 }
    const signals = executionSignals(execution)
    row.executions += 1
    row.inbound += signals.inbound
    row.ai += signals.ai
    row.crm += signals.crmConfirmed
    row.transfers += signals.transferAccepted
    row.failures += signals.failedExecutions + signals.crmErrors
    row.callbacksFailed += signals.identitySplit.production.callbackStatuses.failed
    byDate.set(key, row)
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function incidentRows(executions, start) {
  return executions
    .filter((execution) => {
      const date = executionDate(execution)
      return date && date >= start && String(execution?.status ?? '').toLowerCase() === 'error'
    })
    .sort((left, right) => executionDate(right) - executionDate(left))
    .slice(0, 8)
    .map((execution) => ({
      occurredAt: executionDate(execution).toISOString(),
      status: 'error',
      lastNode: String(execution?.data?.resultData?.lastNodeExecuted ?? 'nó não identificado').slice(0, 120),
    }))
}

function sourceStatus(workflow) {
  return workflow?.active === true ? 'ok' : 'error'
}

function buildMonitoringSummary(executions, workflow, days, now = new Date()) {
  const start = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))
  const filtered = executions.filter((execution) => {
    const date = executionDate(execution)
    return date && date >= start && date <= now
  })
  const totals = emptyAggregate()
  for (const execution of filtered) addSignals(totals, executionSignals(execution))
  const daily = buildDaily(filtered, start)
  const productionCallbacks = totals.identitySplit.production.callbackStatuses
  const operationalFailures = totals.failedExecutions + totals.crmErrors + productionCallbacks.failed
  return {
    schema: 'araunah.n8n-chatbot-monitor.v1',
    source: `n8n: ${WORKFLOW_NAME}`,
    workflow: { id: String(workflow?.id ?? DEFAULT_WORKFLOW_ID), name: WORKFLOW_NAME, active: workflow?.active === true, updatedAt: workflow?.updatedAt ?? null },
    generatedAt: now.toISOString(),
    rangeDays: days,
    coverage: { start: start.toISOString(), end: now.toISOString(), timezone: BR_TIMEZONE, executionsFetched: executions.length, executionsInRange: filtered.length },
    totals: { ...totals, operationalFailures, deliveryRate: productionCallbacks.sent ? Math.round((productionCallbacks.delivered / productionCallbacks.sent) * 1000) / 10 : null },
    daily,
    incidents: incidentRows(filtered, start),
    trackingNotice: 'Métricas agregadas exclusivamente do workflow CHATBOT-ARAUNAH WHATSAPP. Sem nomes, telefones, mensagens ou payloads brutos.',
  }
}

async function n8nJson(path) {
  const baseUrl = process.env.N8N_ARAUNAH_BASE_URL?.replace(/\/$/, '')
  const apiKey = process.env.N8N_ARAUNAH_API_KEY
  if (!baseUrl || !apiKey) throw new Error('Integração n8n não configurada no servidor.')
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'X-N8N-API-KEY': apiKey,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Leitura n8n indisponível (HTTP ${response.status}).`)
  return response.json()
}

async function fetchWorkflow(workflowId) {
  return n8nJson(`/api/v1/workflows/${workflowId}`)
}

async function fetchExecutions(workflowId, cutoffDate = null) {
  const executions = []
  let cursor = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ workflowId, includeData: 'true', limit: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)
    const payload = await n8nJson(`/api/v1/executions?${query}`)
    const rows = Array.isArray(payload.data) ? payload.data : []
    executions.push(...rows)
    cursor = payload.nextCursor ?? payload.next_cursor ?? null
    const oldestInBatch = rows.length > 0 ? executionDate(rows[rows.length - 1]) : null
    if (!cursor || rows.length === 0 || (cutoffDate && oldestInBatch && oldestInBatch < cutoffDate)) break
  }
  return executions
}

export default async function handler(request) {
  const requestId = crypto.randomUUID()
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405, requestId)
  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') ?? 15)
  if (!Number.isInteger(days) || !PERIODS.has(days)) return json({ error: 'Período inválido.', requestId }, 400, requestId)
  const workflowId = process.env.N8N_CHATBOT_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID
  const now = new Date()
  const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))

  let workflow = { id: workflowId, name: WORKFLOW_NAME, active: true, updatedAt: null }
  let executions = []
  let isDegraded = false
  let degradationReason = null

  try {
    const [fetchedWorkflow, fetchedExecutions] = await Promise.all([
      fetchWorkflow(workflowId).catch((err) => {
        console.warn('fetchWorkflow warning:', err.message)
        return workflow
      }),
      fetchExecutions(workflowId, cutoffDate),
    ])
    if (fetchedWorkflow) workflow = fetchedWorkflow
    executions = fetchedExecutions
  } catch (error) {
    console.error('chatbot-monitor fetch error', { requestId, message: error instanceof Error ? error.message : 'unknown' })
    isDegraded = true
    degradationReason = 'Consulta ao histórico n8n com alta latência. Exibindo estado de contingência sem interromper a visualização.'
  }

  const summary = buildMonitoringSummary(executions, workflow, days, now)
  return json({ ...summary, isDegraded, degradationReason }, 200, requestId)
}

export const __test__ = { buildMonitoringSummary, executionSignals, nodeItems, webhookSignals, graphMessageIds }
