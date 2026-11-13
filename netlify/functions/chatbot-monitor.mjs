const DEFAULT_WORKFLOW_ID = 'eXj1wyXmjshhMOtl'
const WORKFLOW_NAME = 'CHATBOT-ARAUNAH WHATSAPP'
const PAGE_SIZE = 250
const MAX_PAGES = 16
const MAX_DETAIL_FETCHES = 100
const BR_TIMEZONE = 'America/Sao_Paulo'
const BR_OFFSET = '-03:00'
const PRODUCTION_PHONE_NUMBER_ID = process.env.N8N_PRODUCTION_PHONE_NUMBER_ID ?? '1260236903829724'

const memoryCache = new Map()
const CACHE_TTL_MS = 60 * 1000

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

function parseBrDateStart(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return null
  const date = new Date(`${isoDate}T00:00:00${BR_OFFSET}`)
  return Number.isNaN(date.valueOf()) || localDateKey(date) !== isoDate ? null : date
}

function parseBrDateEnd(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return null
  const date = new Date(`${isoDate}T23:59:59.999${BR_OFFSET}`)
  return Number.isNaN(date.valueOf()) || localDateKey(date) !== isoDate ? null : date
}

function resolvePeriodRange(url, now = new Date()) {
  const periodRaw = String(url.searchParams.get('period') || '').trim().toLowerCase()
  const daysRaw = url.searchParams.get('days')
  const startParam = String(url.searchParams.get('start') || '').trim()
  const endParam = String(url.searchParams.get('end') || '').trim()
  const todayBr = localDateKey(now)

  if (periodRaw === 'custom' || (!periodRaw && startParam && endParam)) {
    const start = parseBrDateStart(startParam)
    const end = parseBrDateEnd(endParam)
    if (!start || !end || start > end) {
      throw Object.assign(new Error('Período específico inválido. Informe start e end válidos (YYYY-MM-DD).'), { status: 400 })
    }
    const clampedEnd = end > now ? now : end
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / (24 * 60 * 60 * 1000)))
    if (diffDays > 90) {
      throw Object.assign(new Error('O período específico não pode exceder 90 dias.'), { status: 400 })
    }
    return {
      key: `custom:${startParam}:${endParam}`,
      rangeDays: diffDays,
      start,
      end: clampedEnd,
      period: { key: 'custom', label: 'Período específico', type: 'custom', start: startParam, end: endParam },
    }
  }

  if (periodRaw === 'today') {
    const start = parseBrDateStart(todayBr)
    return {
      key: `today:${todayBr}`,
      rangeDays: 1,
      start,
      end: now,
      period: { key: 'today', label: 'Dia atual', type: 'today' },
    }
  }

  if (periodRaw === 'month') {
    const monthStart = `${todayBr.slice(0, 7)}-01`
    const start = parseBrDateStart(monthStart)
    const rangeDays = Number(todayBr.slice(8, 10)) || 1
    return {
      key: `month:${monthStart}`,
      rangeDays,
      start,
      end: now,
      period: { key: 'month', label: 'Mês atual', type: 'month' },
    }
  }

  let days = null
  if (periodRaw) {
    const match = periodRaw.match(/^(\d+)d$/)
    days = match ? Number(match[1]) : Number(periodRaw)
  } else if (daysRaw !== null) {
    days = Number(daysRaw)
  } else {
    days = 7
  }

  if (!Number.isInteger(days) || ![1, 7, 15, 30].includes(days)) {
    throw Object.assign(new Error('Período inválido.'), { status: 400 })
  }

  if (days === 1) {
    const start = parseBrDateStart(todayBr)
    return {
      key: `today:${todayBr}`,
      rangeDays: 1,
      start,
      end: now,
      period: { key: 'today', label: 'Dia atual', type: 'today' },
    }
  }

  return {
    key: `${days}d`,
    rangeDays: days,
    start: new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)),
    end: now,
    period: { key: `${days}d`, label: `${days} dias`, type: 'days' },
  }
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

function buildDaily(executions, start, end = new Date()) {
  const byDate = new Map()
  for (const execution of executions) {
    const date = executionDate(execution)
    if (!date || date < start || date > end) continue
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

function incidentRows(executions, start, end = new Date()) {
  return executions
    .filter((execution) => {
      const date = executionDate(execution)
      return date && date >= start && date <= end && String(execution?.status ?? '').toLowerCase() === 'error'
    })
    .sort((left, right) => executionDate(right) - executionDate(left))
    .slice(0, 8)
    .map((execution) => ({
      occurredAt: executionDate(execution).toISOString(),
      status: 'error',
      lastNode: String(execution?.data?.resultData?.lastNodeExecuted ?? 'nó não identificado').slice(0, 120),
    }))
}

function buildMonitoringSummary(executions, workflow, daysOrRange, now = new Date()) {
  const isNum = typeof daysOrRange === 'number'
  const rangeDays = isNum ? daysOrRange : (daysOrRange?.rangeDays ?? 15)
  const start = isNum ? new Date(now.getTime() - (rangeDays * 24 * 60 * 60 * 1000)) : daysOrRange.start
  const end = isNum ? now : (daysOrRange.end ?? now)
  const periodMeta = isNum ? { key: `${rangeDays}d`, label: `${rangeDays} dias`, type: 'days' } : daysOrRange.period

  const filtered = executions.filter((execution) => {
    const date = executionDate(execution)
    return date && date >= start && date <= end
  })
  const totals = emptyAggregate()
  for (const execution of filtered) addSignals(totals, executionSignals(execution))
  const daily = buildDaily(filtered, start, end)
  const productionCallbacks = totals.identitySplit.production.callbackStatuses
  const operationalFailures = totals.failedExecutions + totals.crmErrors + productionCallbacks.failed
  return {
    schema: 'araunah.n8n-chatbot-monitor.v1',
    source: `n8n: ${WORKFLOW_NAME}`,
    workflow: { id: String(workflow?.id ?? DEFAULT_WORKFLOW_ID), name: WORKFLOW_NAME, active: workflow?.active === true, updatedAt: workflow?.updatedAt ?? null },
    generatedAt: now.toISOString(),
    rangeDays,
    period: periodMeta,
    coverage: { start: start.toISOString(), end: end.toISOString(), timezone: BR_TIMEZONE, executionsFetched: executions.length, executionsInRange: filtered.length, complete: true },
    totals: { ...totals, operationalFailures, deliveryRate: productionCallbacks.sent ? Math.round((productionCallbacks.delivered / productionCallbacks.sent) * 1000) / 10 : null },
    daily,
    incidents: incidentRows(filtered, start, end),
    trackingNotice: 'Métricas agregadas exclusivamente do workflow CHATBOT-ARAUNAH WHATSAPP. Sem nomes, telefones, mensagens ou payloads brutos.',
  }
}

async function n8nJson(path) {
  const baseUrl = process.env.N8N_ARAUNAH_BASE_URL?.replace(/\/$/, '')
  const apiKey = process.env.N8N_ARAUNAH_API_KEY
  if (!baseUrl || !apiKey) throw new Error('Integração n8n não configurada no servidor.')
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350))
    }
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AraunahDashboard/1.0',
        },
        signal: AbortSignal.timeout(attempt === 0 ? 12_000 : 8_000),
      })
      if (!response.ok) {
        lastErr = new Error(`Leitura n8n indisponível (HTTP ${response.status}).`)
        continue
      }
      return await response.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Leitura n8n indisponível.')
}

async function fetchWorkflow(workflowId) {
  return n8nJson(`/api/v1/workflows/${workflowId}`)
}

function executionDurationMs(execution) {
  const start = execution?.startedAt ? Date.parse(execution.startedAt) : NaN
  const stop = execution?.stoppedAt ? Date.parse(execution.stoppedAt) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return 0
  return Math.max(0, stop - start)
}

async function fetchExecutions(workflowId, cutoffDate = null) {
  const headers = []
  let cursor = null
  const headerDeadline = Date.now() + 4_500
  let truncated = false
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (page > 0 && Date.now() >= headerDeadline) {
      truncated = true
      break
    }
    const query = new URLSearchParams({ workflowId, limit: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)
    const payload = await n8nJson(`/api/v1/executions?${query}`)
    const rows = Array.isArray(payload.data) ? payload.data : []
    headers.push(...rows)
    cursor = payload.nextCursor ?? payload.next_cursor ?? null
    const oldestInBatch = rows.length > 0 ? executionDate(rows[rows.length - 1]) : null
    if (cutoffDate && oldestInBatch && oldestInBatch < cutoffDate) break
    if (!cursor || rows.length === 0) break
    if (page === MAX_PAGES - 1 && cursor) truncated = true
  }

  const inWindow = headers.filter((row) => {
    if (!cutoffDate) return true
    const at = executionDate(row)
    return Boolean(at) && at >= cutoffDate
  })

  const hydrated = []
  const stubs = []
  const needDetail = []
  for (const row of inWindow) {
    if (row?.data?.resultData?.runData) {
      hydrated.push(row)
      continue
    }
    const isTrivialTrigger = Boolean(row?.mode) && row.mode !== 'webhook' && row.status !== 'error' && executionDurationMs(row) < 500
    if (isTrivialTrigger) {
      stubs.push({ ...row, data: { resultData: { runData: {} } } })
    } else {
      needDetail.push(row)
    }
  }

  const targetDetails = needDetail.slice(0, MAX_DETAIL_FETCHES)
  if (needDetail.length > targetDetails.length) truncated = true
  const detailDeadline = Date.now() + 13_500
  const batchSize = 10
  for (let i = 0; i < targetDetails.length; i += batchSize) {
    if (i > 0 && Date.now() >= detailDeadline) {
      truncated = true
      break
    }
    const slice = targetDetails.slice(i, i + batchSize)
    const results = await Promise.all(
      slice.map(async (row) => {
        try {
          return await n8nJson(`/api/v1/executions/${encodeURIComponent(String(row.id))}?includeData=true`)
        } catch {
          truncated = true
          return null
        }
      })
    )
    for (const item of results) {
      if (item) hydrated.push(item)
    }
  }

  const executions = [...hydrated, ...stubs].sort((a, b) => {
    const da = executionDate(a)?.getTime() ?? 0
    const db = executionDate(b)?.getTime() ?? 0
    return db - da
  })
  return { executions, complete: !truncated }
}

export default async function handler(request) {
  const requestId = crypto.randomUUID()
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405, requestId)
  const url = new URL(request.url)
  const now = new Date()

  let range
  try {
    range = resolvePeriodRange(url, now)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Período inválido.', requestId }, err?.status || 400, requestId)
  }

  const forceRefresh = url.searchParams.get('refresh') === '1'
  const cacheKey = `monitor_${range.key}`
  const cached = memoryCache.get(cacheKey)
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return json({ ...cached.data, isCached: true }, 200, requestId)
  }

  const workflowId = process.env.N8N_CHATBOT_WORKFLOW_ID ?? DEFAULT_WORKFLOW_ID
  let workflow = { id: workflowId, name: WORKFLOW_NAME, active: true, updatedAt: null }
  let executions = []
  let complete = false
  let isDegraded = false
  let degradationReason = null

  try {
    const [fetchedWorkflow, execResult] = await Promise.all([
      fetchWorkflow(workflowId).catch((err) => {
        console.warn('fetchWorkflow warning:', err.message)
        return workflow
      }),
      fetchExecutions(workflowId, range.start),
    ])
    if (fetchedWorkflow) workflow = fetchedWorkflow
    executions = execResult.executions
    complete = execResult.complete
  } catch (error) {
    console.error('chatbot-monitor fetch error', { requestId, message: error instanceof Error ? error.message : 'unknown' })
    isDegraded = true
    degradationReason = 'Consulta ao histórico n8n com alta latência. Exibindo estado de contingência sem interromper a visualização.'
  }

  const summary = buildMonitoringSummary(executions, workflow, range, now)
  summary.coverage.complete = !isDegraded && complete
  const result = { ...summary, isDegraded, degradationReason }
  if (!isDegraded && executions.length > 0) {
    memoryCache.set(cacheKey, { timestamp: Date.now(), data: result })
  }
  return json(result, 200, requestId)
}

export const __test__ = { buildMonitoringSummary, resolvePeriodRange, executionSignals, nodeItems, webhookSignals, graphMessageIds, fetchExecutions }
