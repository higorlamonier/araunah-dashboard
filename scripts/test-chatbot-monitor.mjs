import assert from 'node:assert/strict'
import { __test__ } from '../netlify/functions/chatbot-monitor.mjs'

function run(items, branches = [items]) {
  return [{ data: { main: branches } }]
}

function execution({ id, startedAt, status = 'success', inboundId, callbackStatuses = [], ai = false, crmStatus, graphId, transferId, blocked = false, phoneId = '1260236903829724' }) {
  const webhookValue = {
    body: {
      entry: [{ changes: [{ value: {
        ...(inboundId ? { messages: [{ id: inboundId, type: 'text' }] } : {}),
        metadata: { phone_number_id: phoneId },
        ...(callbackStatuses.length ? { statuses: callbackStatuses.map((value, index) => ({ id: `${id}-callback-${index}`, status: value })) } : {}),
      } }] }],
    },
  }
  const runData = { 'Webhook WhatsApp POST': run([{ json: webhookValue }]) }
  if (ai) runData['AI Agent'] = run([{ json: { output: 'Olá! Resposta de teste.' } }])
  runData['VALIDAR DADOS MINIMOS DO LEAD'] = run([{ json: { qualificacao_minima_completa: !blocked, crm_bloqueado: blocked, campos_faltantes: blocked ? ['VOLUME'] : [] } }])
  if (crmStatus) runData['API SUPABASE'] = run([{ json: { id: `crm-${id}`, status: crmStatus } }])
  if (graphId) runData['Enviar Resposta do Robô (Chat)'] = run([{ json: { messages: [{ id: graphId, message_status: 'accepted' }] } }])
  if (transferId) runData['Enviar Resposta do Robô (Transferencia)'] = run([{ json: { messages: [{ id: transferId, message_status: 'accepted' }] } }])
  return { id, startedAt, status, data: { resultData: { lastNodeExecuted: status === 'error' ? 'VALIDAR DADOS MINIMOS DO LEAD' : 'Enviar Resposta do Robô (Chat)', runData } } }
}

const now = new Date('2026-09-10T12:00:00.000Z')
const executions = [
  execution({ id: 'complete', startedAt: '2026-09-09T12:00:00.000Z', inboundId: 'in-1', callbackStatuses: ['sent', 'delivered'], ai: true, crmStatus: 'criado', graphId: 'out-1', transferId: 'transfer-1' }),
  execution({ id: 'blocked', startedAt: '2026-09-08T12:00:00.000Z', status: 'error', inboundId: 'in-2', callbackStatuses: ['failed'], ai: true, blocked: true, phoneId: 'legacy' }),
]
const summary = __test__.buildMonitoringSummary(executions, { id: 'eXj1wyXmjshhMOtl', active: true, updatedAt: '2026-09-09T00:00:00.000Z' }, 15, now)

assert.equal(summary.workflow.active, true)
assert.equal(summary.totals.inbound, 2)
assert.equal(summary.totals.ai, 2)
assert.equal(summary.totals.graphAccepted, 2)
assert.equal(summary.totals.transferAccepted, 1)
assert.equal(summary.totals.crmCreated, 1)
assert.equal(summary.totals.crmConfirmed, 1)
assert.equal(summary.totals.blocked, 1)
assert.equal(summary.totals.failedExecutions, 1)
assert.equal(summary.totals.operationalFailures, 1)
assert.equal(summary.totals.identitySplit.production.inbound, 1)
assert.equal(summary.totals.identitySplit.production.callbackStatuses.delivered, 1)
assert.equal(summary.totals.identitySplit.other.callbackStatuses.failed, 1)
assert.deepEqual(summary.totals.callbackStatuses, { sent: 1, delivered: 1, read: 0, failed: 1 })
assert.equal(summary.incidents.length, 1)
assert.equal(summary.daily.length, 2)
assert.doesNotMatch(JSON.stringify(summary), /in-1|out-1|mensagem de teste|Cliente Teste/)

const outside = execution({ id: 'outside', startedAt: '2026-08-01T12:00:00.000Z', inboundId: 'old' })
const filtered = __test__.buildMonitoringSummary([...executions, outside], { active: true }, 15, now)
assert.equal(filtered.coverage.executionsInRange, 2)
// Date periods: today, month, and custom range BRT boundaries
const brtRef = new Date('2026-10-15T15:00:00.000Z')
const todayRange = __test__.resolvePeriodRange(new URL('https://meta.araunah.com/chatbot-api/summary?period=today'), brtRef)
assert.equal(todayRange.period.key, 'today')
assert.equal(todayRange.start.toISOString(), '2026-10-15T03:00:00.000Z')

const monthRange = __test__.resolvePeriodRange(new URL('https://meta.araunah.com/chatbot-api/summary?period=month'), brtRef)
assert.equal(monthRange.period.key, 'month')
assert.equal(monthRange.start.toISOString(), '2026-10-01T03:00:00.000Z')

const customRange = __test__.resolvePeriodRange(new URL('https://meta.araunah.com/chatbot-api/summary?period=custom&start=2026-09-08&end=2026-09-09'), now)
const customSummary = __test__.buildMonitoringSummary(executions, { id: 'eXj1wyXmjshhMOtl', active: true }, customRange, now)
assert.equal(customSummary.coverage.executionsInRange, 2)
assert.equal(customSummary.period.key, 'custom')

assert.throws(
  () => __test__.resolvePeriodRange(new URL('https://meta.araunah.com/chatbot-api/summary?period=custom&start=2026-10-10&end=2026-10-01'), brtRef),
  /Período específico inválido/
)

// Header pagination skips <500ms trigger cron ticks and hydrates webhook executions
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-key'

  const fetchedUrls = []
  globalThis.fetch = async (url) => {
    const parsed = new URL(url)
    fetchedUrls.push(parsed.pathname + parsed.search)
    if (parsed.pathname.endsWith('/executions')) {
      return Response.json({
        data: [
          { id: 'trig-1', mode: 'trigger', status: 'success', startedAt: '2026-09-09T13:00:00.000Z', stoppedAt: '2026-09-09T13:00:00.120Z' },
          { id: 'wh-1', mode: 'webhook', status: 'success', startedAt: '2026-09-09T12:00:00.000Z', stoppedAt: '2026-09-09T12:00:02.500Z' },
          { id: 'old-trig', mode: 'trigger', status: 'success', startedAt: '2026-08-01T00:00:00.000Z', stoppedAt: '2026-08-01T00:00:00.100Z' },
        ],
        nextCursor: 'should-stop-before-page-2',
      })
    }
    if (parsed.pathname.endsWith('/executions/wh-1')) {
      return Response.json(execution({ id: 'wh-1', startedAt: '2026-09-09T12:00:00.000Z', inboundId: 'msg-hdr-1', callbackStatuses: ['delivered'], ai: true, graphId: 'out-hdr-1' }))
    }
    throw new Error('Unexpected URL in bot fetchExecutions test: ' + url)
  }

  const fetched = await __test__.fetchExecutions('eXj1wyXmjshhMOtl', new Date('2026-09-01T00:00:00.000Z'))
  assert.equal(fetched.complete, true)
  assert.equal(fetched.executions.length, 2)
  assert.equal(fetchedUrls.some((u) => u.includes('/executions/trig-1')), false, 'Trigger <500ms no-op should not be hydrated')
  assert.equal(fetchedUrls.some((u) => u.includes('/executions/wh-1?includeData=true')), true)
  const hdrSummary = __test__.buildMonitoringSummary(fetched.executions, { id: 'eXj1wyXmjshhMOtl', active: true }, 15, new Date('2026-09-10T12:00:00.000Z'))
  assert.equal(hdrSummary.totals.executions, 2)
  assert.equal(hdrSummary.totals.inbound, 1)
  assert.equal(hdrSummary.totals.callbackStatuses.delivered, 1)

  globalThis.fetch = prevFetch
  for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

console.log(JSON.stringify({ status: 'ok', cases: ['aggregate funnel', 'callback split', 'blocked qualification', 'date window', 'no raw identifiers', 'today/month/custom BRT ranges'], inbound: summary.totals.inbound, crm: summary.totals.crmConfirmed }))
