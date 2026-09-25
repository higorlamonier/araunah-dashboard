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

// Test 2: Phone correlation across qualification and CRM transfer
const qualExecution = {
  startedAt: '2026-09-24T16:00:00.000Z',
  data: {
    resultData: {
      runData: {
        'Extrair Mensagem ou Botão': [{ data: { main: [[{ json: { telefone: '553899884538', nome_cliente: 'Rowena Petroll' } }]] } }],
        'VALIDAR DADOS MINIMOS DO LEAD': [{ data: { main: [[{ json: { qualificacao_minima_completa: false, mensagem_cliente: 'Qual o interesse?' } }]] } }],
      },
    },
  },
}
const crmExecution = {
  startedAt: '2026-09-24T16:30:00.000Z',
  data: {
    resultData: {
      runData: {
        'API SUPABASE': [{ data: { main: [[{ json: { id: 30068, status: 'criado' } }]] } }],
        'ORGANIZAR DADOS DO AGENT': [{ data: { main: [[{ json: {
          lead_nome: 'ROWENA BETINA PETROLL', cidade: 'PARACATU', uf: 'MG', interesse: 'compostagem', segmento: 'Agro',
          campanha: 'Campanhas Meta Ads', consultor_responsavel: 'ADRIANO CAMARGO', qualificacao_minima_completa: true,
          informações: 'Lead qualificado', data: 'Dados do lead', lead_telefone_original: '553899884538',
        } }]] } }],
        'IF Lead Reincidente Atualizado': [{ data: { main: [[{ json: { lead_reincidente: false } }]] } }],
        'Enviar Resposta do Robô (Transferencia)': [{ data: { main: [[{ json: { messages: [{ id: 'graph-rowena' }] } }]] } }],
      },
    },
  },
}

const mergedResult = __test__.buildLeads([qualExecution, crmExecution], new Date('2026-09-01T00:00:00.000Z'))
assert.equal(mergedResult.summary.uniqueLeads, 1, 'Should merge 2 executions of same phone into 1 lead')
assert.equal(mergedResult.summary.created, 1, 'Should count as created, not in-qualification')
assert.equal(mergedResult.summary.inQualification, 0, 'Should not count as in-qualification')
assert.equal(mergedResult.summary.transferConfirmed, 1, 'Should confirm transfer')
assert.equal(mergedResult.leads[0].leadId, '30068', 'Should use CRM lead ID')
assert.equal(mergedResult.leads[0].crmStatus, 'criado')
assert.equal(mergedResult.leads[0].consultant, 'ADRIANO CAMARGO')
assert.equal(Object.hasOwn(mergedResult.leads[0], 'phone'), false)
assert.equal(Object.hasOwn(mergedResult.leads[0], 'rawPhone'), false)
assert.equal(mergedResult.leads[0].n8nEvents.length, 2, 'Should preserve interaction history')

// Test 3: StaticData conversationStates sync when execution only has bot qualification
const stateSyncExecution = {
  startedAt: '2026-09-24T16:20:00.000Z',
  data: {
    resultData: {
      runData: {
        'Extrair Mensagem ou Botão': [{ data: { main: [[{ json: { telefone: '553899884538', nome_cliente: 'Rowena Petroll' } }]] } }],
        'VALIDAR DADOS MINIMOS DO LEAD': [{ data: { main: [[{ json: { qualificacao_minima_completa: false } }]] } }],
      },
    },
  },
}
const mockConvStates = {
  'whatsapp:553899884538': {
    status: 'transferred',
    crmLeadId: 30068,
    qualification: {
      nome: { value: 'Rowena Betina Petroll' },
      cidade: { value: 'Paracatu' },
      uf: { value: 'MG' },
      interesse: { value: 'compostagem de esterco de confinamento' },
    },
  },
}
const stateSyncResult = __test__.buildLeads([stateSyncExecution], new Date('2026-09-01T00:00:00.000Z'), mockConvStates)
assert.equal(stateSyncResult.summary.uniqueLeads, 1)
assert.equal(stateSyncResult.summary.inQualification, 0, 'Transferred state must not be in qualification')
assert.equal(stateSyncResult.leads[0].crmStatus, 'criado')
assert.equal(stateSyncResult.leads[0].leadId, '30068')
assert.equal(stateSyncResult.leads[0].name, 'Rowena Betina Petroll')
assert.equal(stateSyncResult.leads[0].transfer, 'enviada')

// Test 4: Synthesis from conversationStates with period filtering ('today', '7d', 'all')
const mockMultiConvStates = {
  'whatsapp:5511999990001': {
    status: 'open',
    lastInboundAt: '2026-09-25T12:00:00.000Z',
    name: 'Lead Hoje',
    leadMessages: [{ text: 'Mensagem de hoje', at: '2026-09-25T12:00:00.000Z' }],
    lastAssistantText: 'Olá de hoje',
    qualification: { nome: { value: 'Lead Hoje' }, cidade: { value: 'Uberlândia' }, uf: { value: 'MG' } },
  },
  'whatsapp:5511999990002': {
    status: 'open',
    lastInboundAt: '2026-09-21T10:00:00.000Z',
    name: 'Lead 4 Dias Atrás',
    leadMessages: [{ text: 'Mensagem de 4 dias atrás', at: '2026-09-21T10:00:00.000Z' }],
    lastAssistantText: 'Olá de 4 dias',
    qualification: { nome: { value: 'Lead 4 Dias' }, cidade: { value: 'Frutal' }, uf: { value: 'MG' } },
  },
  'whatsapp:5511999990003': {
    status: 'transferred',
    crmLeadId: 9999,
    lastInboundAt: '2026-08-20T10:00:00.000Z',
    name: 'Lead Mes Passado',
    leadMessages: [{ text: 'Mensagem antiga', at: '2026-08-20T10:00:00.000Z' }],
    lastAssistantText: 'Olá antigo',
    qualification: { nome: { value: 'Lead Antigo' }, cidade: { value: 'Patos' }, uf: { value: 'MG' } },
  },
}

// Today filter
const todayStart = new Date('2026-09-25T00:00:00.000Z')
const resToday = __test__.buildLeads([], todayStart, mockMultiConvStates)
assert.equal(resToday.summary.uniqueLeads, 1, 'Only today lead should match')
assert.equal(resToday.leads[0].name, 'Lead Hoje')
assert.equal(resToday.leads[0].leadMessage, 'Mensagem de hoje')

// 7 days filter
const sevenDaysStart = new Date('2026-09-18T00:00:00.000Z')
const res7d = __test__.buildLeads([], sevenDaysStart, mockMultiConvStates)
assert.equal(res7d.summary.uniqueLeads, 2, 'Today + 4 days ago leads should match')

// All period filter (null start)
const resAll = __test__.buildLeads([], null, mockMultiConvStates)
assert.equal(resAll.summary.uniqueLeads, 3, 'All 3 leads should match')
assert.equal(resAll.leads[0].name, 'Lead Hoje', 'Should sort most recent first')
assert.equal(resAll.summary.transferConfirmed, 1)

console.log('OK: all n8n leads tests (CRM fixtures, phone correlation, staticData sync, period filters) passed!')
