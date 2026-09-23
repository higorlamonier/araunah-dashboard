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

console.log(JSON.stringify({ status: 'ok', cases: ['aggregate funnel', 'callback split', 'blocked qualification', 'date window', 'no raw identifiers'], inbound: summary.totals.inbound, crm: summary.totals.crmConfirmed }))
