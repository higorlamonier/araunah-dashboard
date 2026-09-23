import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const moduleUrl = pathToFileURL(`${process.cwd()}/netlify/functions/n8n-leads.mjs`).href
const { default: handler, __test__ } = await import(moduleUrl)

const execution = {
  startedAt: '2026-09-03T12:00:00.000Z',
  data: {
    resultData: {
      runData: {
        'API SUPABASE': [{ data: { main: [[{ json: { id: 123, status: 'atualizado' } }]] } }],
        'ORGANIZAR DADOS DO AGENT': [{ data: { main: [[{ json: {
          lead_nome: 'Lead Fixture', cidade: 'Uberlândia', uf: 'MG', interesse: 'Tratamento de água', segmento: 'Água',
          campanha: 'Orgânico', consultor_responsavel: 'Consultor', qualificacao_minima_completa: true,
          informações: 'Contexto atual', data: 'Novas informações', lead_telefone_original: 'não deve sair',
        } }]] } }],
        'IF Lead Reincidente Atualizado': [{ data: { main: [[{ json: { lead_reincidente: true, recorrencia_origem: 'crm', crm_persistencia_confirmada: true } }]] } }],
        'Enviar Resposta do Robô (Transferencia)': [{ data: { main: [[{ json: { messages: [{ id: 'graph-fixture' }] } }]] } }],
      },
    },
  },
}

const result = __test__.buildLeads([execution], new Date('2026-09-01T00:00:00.000Z'))
assert.equal(result.summary.uniqueLeads, 1)
assert.equal(result.summary.updated, 1)
assert.equal(result.summary.transferConfirmed, 1)
assert.equal(result.leads[0].recurrence, true)
assert.equal(result.leads[0].transfer, 'enviada')
assert.equal(Object.hasOwn(result.leads[0], 'phone'), false)
assert.equal(JSON.stringify(result.leads).includes('não deve sair'), false)

const blocked = await handler(new Request('https://meta.araunah.com/leads-api/summary'))
assert.equal(blocked.status, 503)
console.log('OK: n8n leads parser and secure Access gate passed')
