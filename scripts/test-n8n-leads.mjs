import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { generateKeyPairSync, sign } from 'node:crypto'

const moduleUrl = pathToFileURL(`${process.cwd()}/netlify/functions/n8n-leads.mjs`).href
const { default: handler, __test__ } = await import(moduleUrl)

const execution = {
  startedAt: '2026-09-03T12:00:00.000Z',
  data: {
    resultData: {
      runData: {
        'API SUPABASE': [{ data: { main: [[{ json: { id: 123, status: 'atualizado' } }]] } }],
        'CRM OBS | Validar Persistência': [{ data: { main: [[{ json: { id: 123, crm_read_after_write: 'confirmed', crm_persistencia_confirmada: true, destino_crm_confirmado: true, consultor_atual: 'Consultor' } }]] } }],
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

const openMode = await __test__.requireAccess(new Request('https://meta.araunah.com/leads-api/summary'))
assert.equal(openMode.mode, 'open')
await assert.rejects(() => __test__.requireAccess(new Request('https://meta.araunah.com/leads-api/summary', { headers: { 'cf-access-jwt-assertion': 'forged.jwt.token' } })), /Token Cloudflare Access/)
const unconfiguredBackend = await handler(new Request('https://meta.araunah.com/leads-api/summary'))
assert.equal(unconfiguredBackend.status, 502)

// Períodos distintos não podem reutilizar a mesma amostra em cache.
const oldFetch = globalThis.fetch
const savedEnv = { ...process.env }
process.env.N8N_ARAUNAH_BASE_URL = 'https://synthetic.invalid'
process.env.N8N_ARAUNAH_API_KEY = 'synthetic-key'
const stamp = (days) => new Date(Date.now() - days * 86400000).toISOString()
const row = (id, days, ms = 2000) => ({id, status:'success', startedAt:stamp(days), stoppedAt:new Date(Date.parse(stamp(days)) + ms).toISOString()})
let shortRow = false
let failList = false
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture-key',alg:'RS256',use:'sig'}
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname
  if (path === '/cdn-cgi/access/certs') return Response.json({keys:[jwk]})
  if (path.includes('/workflows/')) return Response.json({staticData:{global:{araunahConversationState:{}}}})
  if (path.endsWith('/executions')) return failList ? new Response('',{status:503}) : Response.json({data:[row('1',1),row('2',20),...(shortRow?[row('3',1,100)]:[])]})
  if (path.includes('/executions/')) return Response.json({id:path.split('/').at(-1)})
  throw new Error('URL sintética inesperada')
}
const weekSnapshot = await __test__.fetchExecutions(new Date(Date.now()-7*86400000),'fixture-week')
const allSnapshot = await __test__.fetchExecutions(null,'fixture-all')
assert.equal(weekSnapshot.executions.length,1)
assert.equal(allSnapshot.executions.length,2,'um período maior não pode reutilizar cache de sete dias')
assert.equal(allSnapshot.coverage.complete,true)
shortRow=true
const partialSnapshot = await __test__.fetchExecutions(null,'fixture-partial')
assert.equal(partialSnapshot.coverage.complete,false)
assert(partialSnapshot.coverage.reasons.some((r)=>r.includes('curtas')))
failList=true
await assert.rejects(()=>__test__.fetchExecutions(null,'fixture-failure'),/Não foi possível consultar/)
process.env.CF_ACCESS_BYPASS='true'
process.env.CF_ACCESS_TEAM_DOMAIN='auth.synthetic.invalid'
process.env.CF_ACCESS_AUD='fixture-audience'
process.env.CF_ACCESS_ALLOWED_EMAILS='operator@example.invalid'
const bypassAttempt=await handler(new Request('https://meta.araunah.com/leads-api/summary?internal=1',{headers:{'x-dashboard-view':'1'}}))
assert.equal(bypassAttempt.status,401,'parâmetro e cabeçalho controláveis pelo cliente não autenticam')
const encode=(x)=>Buffer.from(JSON.stringify(x)).toString('base64url')
const signed=encode({alg:'RS256',kid:'fixture-key'})+'.'+encode({iss:'https://auth.synthetic.invalid/',aud:'fixture-audience',email:'operator@example.invalid',exp:Math.floor(Date.now()/1000)+300})
const token=signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url')
const validUser=await __test__.requireAccess(new Request('https://meta.araunah.com/leads-api/summary',{headers:{'cf-access-jwt-assertion':token}}))
assert.equal(validUser.email,'operator@example.invalid','JWT assinado e autorizado deve ser aceito')
const altered=encode({alg:'RS256',kid:'fixture-key'})+'.'+encode({iss:'https://auth.synthetic.invalid/',aud:'fixture-audience',email:'attacker@example.invalid',exp:Math.floor(Date.now()/1000)+300})+'.'+token.split('.')[2]
await assert.rejects(()=>__test__.requireAccess(new Request('https://meta.araunah.com/leads-api/summary',{headers:{'cf-access-jwt-assertion':altered}})),/Assinatura/)
const invalidPeriod=encode({alg:'RS256',kid:'fixture-key'})+'.'+encode({iss:'https://auth.synthetic.invalid/',aud:'fixture-audience',email:'operator@example.invalid',exp:'invalid'})
const invalidPeriodToken=invalidPeriod+'.'+sign('RSA-SHA256',Buffer.from(invalidPeriod),privateKey).toString('base64url')
await assert.rejects(()=>__test__.requireAccess(new Request('https://meta.araunah.com/leads-api/summary',{headers:{'cf-access-jwt-assertion':invalidPeriodToken}})),/expirada/)
const failedRead = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=15',{headers:{'cf-access-jwt-assertion':token}}))
assert.equal(failedRead.status,502,'indisponibilidade não deve virar lista vazia HTTP 200')
globalThis.fetch = oldFetch
for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
Object.assign(process.env,savedEnv)

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
        'CRM OBS | Validar Persistência': [{ data: { main: [[{ json: { id: 30068, crm_read_after_write: 'confirmed', crm_persistencia_confirmada: true, destino_crm_confirmado: true, consultor_atual: 'ADRIANO CAMARGO' } }]] } }],
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
assert.equal(stateSyncResult.summary.inQualification, 0, 'State com tentativa deve permanecer visível como pendência')
assert.equal(stateSyncResult.leads[0].crmStatus, 'confirmacao-pendente')
assert.equal(stateSyncResult.leads[0].leadId, '30068')
assert.equal(stateSyncResult.leads[0].name, 'Rowena Betina Petroll')
assert.equal(stateSyncResult.leads[0].transfer, 'nao-confirmada')
assert.equal(stateSyncResult.leads[0].crmPersisted, false)

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
assert.equal(resAll.summary.transferConfirmed, 0)
assert.equal(resAll.leads.find((x) => x.leadId === '9999').crmStatus, 'confirmacao-pendente')

// Uma RPC ou aceite de mensagem, isoladamente, não prova persistência/destino.
const noReadback = structuredClone(crmExecution)
delete noReadback.data.resultData.runData['CRM OBS | Validar Persistência']
let unconfirmed = __test__.buildLeads([noReadback], null)
assert.equal(unconfirmed.leads[0].crmStatus, 'confirmacao-pendente')
assert.equal(unconfirmed.leads[0].crmPersisted, false)
assert.equal(unconfirmed.summary.transferConfirmed, 0)
const wrongId = structuredClone(crmExecution)
wrongId.data.resultData.runData['CRM OBS | Validar Persistência'][0].data.main[0][0].json.id = 999
unconfirmed = __test__.buildLeads([wrongId], null)
assert.equal(unconfirmed.leads[0].crmStatus, 'confirmacao-pendente')
const duplicateReadback = structuredClone(crmExecution)
duplicateReadback.data.resultData.runData['CRM OBS | Validar Persistência'][0].data.main[0].push({json: {id: 30068, crm_read_after_write:'confirmed', crm_persistencia_confirmada:true, destino_crm_confirmado:true}})
unconfirmed = __test__.buildLeads([duplicateReadback], null)
assert.equal(unconfirmed.summary.transferConfirmed, 0)
const noDestination = structuredClone(crmExecution)
noDestination.data.resultData.runData['CRM OBS | Validar Persistência'][0].data.main[0][0].json.destino_crm_confirmado = false
unconfirmed = __test__.buildLeads([noDestination], null)
assert.equal(unconfirmed.leads[0].crmPersisted, false)

// A conversa só deve atribuir uma resposta à IA quando houver evidência de envio.
const item = (json) => [{ data: { main: [[{ json }]] } }]
const baseRun = {
  'Extrair Mensagem ou Botão': item({ telefone: '5500000000000', nome_cliente: 'Ana', mensagem: 'Mensagem sintética' }),
  'VALIDAR DADOS MINIMOS DO LEAD': item({ mensagem_cliente: 'Resposta anterior à guarda' }),
}
const asExecution = (runData) => ({ startedAt: '2026-11-09T12:00:00Z', data: { resultData: { runData } } })
const noSend = __test__.buildLeadEvent(asExecution(baseRun), {
  'whatsapp:5500000000000': { lastAssistantText: 'Resposta antiga' },
})
assert.equal(noSend.botMessage, '', 'Sem envio, não associar texto do estado ao evento')
const crmOnlyRun = {
  'API SUPABASE': item({ id: 'crm-sintetico', status: 'criado' }),
  'ORGANIZAR DADOS DO AGENT': item({ lead_telefone_original: '5500000000000' }),
}
const crmOnly = __test__.buildLeadEvent(asExecution(crmOnlyRun), {
  'whatsapp:5500000000000': { leadMessages: [{ id: 'outra', text: 'Mensagem de outra execução' }] },
})
assert.equal(crmOnly.leadMessage, '', 'Não atribuir mensagem do estado a execução sem entrada')
const acceptedRun = {
  ...baseRun,
  'GUARDA VALORES | Chat': item({ __guard_text: 'Resposta efetivamente preparada' }),
  'Enviar Resposta do Robô (Chat)': item({ messages: [{ id: 'sintetico' }] }),
}
assert.equal(__test__.buildLeadEvent(asExecution(acceptedRun), {}).botMessage, 'Resposta efetivamente preparada')
const failedRun = { ...acceptedRun, 'Enviar Resposta do Robô (Chat)': item({ error: 'falha sintética' }) }
assert.equal(__test__.buildLeadEvent(asExecution(failedRun), {}).botMessage, '')
const ambiguousRun = { ...acceptedRun, 'GUARDA VALORES | Chat': [{ data: { main: [[{ json: { __guard_text: 'A' } }, { json: { __guard_text: 'B' } }]] } }] }
assert.equal(__test__.buildLeadEvent(asExecution(ambiguousRun), {}).botMessage, '', 'Não adivinhar associação entre itens')
const multiInbound = { ...acceptedRun, 'Extrair Mensagem ou Botão': [{ data: { main: [[{ json: { telefone: '5500000000000', mensagem: 'A' } }, { json: { telefone: '5500000000000', mensagem: 'B' } }]] } }] }
assert.equal(__test__.buildLeadEvent(asExecution(multiInbound), {}).botMessage, '', 'Não associar uma saída a várias entradas sem vínculo')
const legacyRun = { ...baseRun, 'Enviar Resposta do Robô (Chat)': item({ messages: [{ id: 'sintetico' }] }) }
assert.equal(__test__.buildLeadEvent(asExecution(legacyRun), {}).botMessage, 'Resposta anterior à guarda')
const legacyTransfer = { ...baseRun, 'Enviar Resposta do Robô (Transferencia)': item({ messages: [{ id: 'sintetico' }] }) }
assert.equal(__test__.buildLeadEvent(asExecution(legacyTransfer), {}).botMessage, '', 'Não confundir validação com confirmação de transferência')
const oldState = { 'whatsapp:5500000000000': { status: 'open', lastInboundAt: '2026-11-09T12:00:00Z', lastOutboundAt: '2026-11-09T11:00:00Z', lastAssistantText: 'Resposta antiga', leadMessages: [{ text: 'Mensagem nova', at: '2026-11-09T12:00:00Z' }] } }
assert.equal(__test__.buildLeads([], null, oldState).leads[0].n8nEvents[0].botMessage, '')
const oldRun = {
  ...acceptedRun,
  'Extrair Mensagem ou Botão': item({ telefone: '5500000000000', nome_cliente: 'Ana', mensagem: 'Sim', message_id: 'm1' }),
}
const newRun = {
  'Extrair Mensagem ou Botão': item({ telefone: '5500000000000', nome_cliente: 'Ana', mensagem: 'Sim', message_id: 'm2' }),
}
const previousExec = { ...asExecution(oldRun), startedAt: '2026-11-09T11:59:00Z' }
const latestExec = { ...asExecution(newRun), startedAt: '2026-11-09T12:00:00Z' }
const repeatedState = { 'whatsapp:5500000000000': { status: 'open', lastInboundAt: '2026-11-09T12:01:00Z', leadMessages: [
  { id: 'm1', text: 'Sim', at: '2026-11-09T11:59:00Z' },
  { id: 'm2', text: 'Sim', at: '2026-11-09T12:00:00Z' },
  { id: 'm3', text: 'Sim', at: '2026-11-09T12:01:00Z' },
] } }
const conversation = __test__.buildLeads([previousExec, latestExec], null, repeatedState).leads[0]
assert.equal(conversation.n8nEvents.length, 3, 'Preservar mensagens iguais com IDs distintos e deduplicar IDs iguais')
assert.equal(conversation.botMessage, '', 'Não atribuir resposta antiga à entrada mais recente')
assert.equal(conversation.occurredAt, '2026-11-09T12:01:00Z', 'Reconhecer entrada mais recente do estado')
assert(!Object.hasOwn(conversation, 'messageId'), 'ID interno não deve aparecer no lead')
assert(conversation.n8nEvents.every((event) => !Object.hasOwn(event, 'messageId')), 'IDs internos não devem aparecer na resposta')
// Test 5: Meta Lead Ads workflow (IvkbTdyCJY242x1O), Meta+Chatbot correlation, Follow-up 3h, Views/Pagination, and CRM Upsert/Delete
{
  const metaExecVerified = {
    id: 'meta-1',
    startedAt: '2026-10-12T14:00:00.000Z',
    data: {
      resultData: {
        runData: {
          'ORGANIZAR DADOS DO AGENT': item({
            lead_nome: 'MARIA OLIVEIRA',
            lead_telefone_original: '5534991112222',
            cidade: 'Patrocínio',
            uf: 'MG',
            segmento: 'Agro',
            campanha: 'Campanhas Meta Ads',
            formulario_nome: 'Compostagem Bovina OUT26',
            meta_lead_id: 'meta-fb-1',
          }),
          'API SUPABASE': item({ id: 40010, status: 'criado' }),
          'MESA | Validar Destino': item({
            id: 40010,
            crm_persistencia_confirmada: true,
            destino_crm_confirmado: true,
            delivery: { destination: 'mesa', inMesa: true, consultant: '' },
          }),
        },
      },
    },
  }
  const metaExecUnverified = {
    id: 'meta-2',
    startedAt: '2026-10-12T15:00:00.000Z',
    data: {
      resultData: {
        runData: {
          'Code in JavaScript': item({
            'NOME COMPLETO': 'CARLOS MENDES',
            TELEFONE: '5511988887777',
            CIDADE: 'Ribeirão Preto',
            ESTADO: 'SP',
            SEGMENTO_CAMPANHA: 'Água',
            FORMULARIO_NOME: 'Tefen Dosador',
            META_LEAD_ID: 'meta-fb-2',
          }),
          'API SUPABASE': item({ id: 40011, status: 'criado' }),
        },
      },
    },
  }
  const followupChatExec = {
    id: 'chat-fup-1',
    startedAt: '2026-10-12T16:00:00.000Z',
    data: {
      resultData: {
        runData: {
          'Extrair Mensagem ou Botão': item({ telefone: '5534991112222', nome_cliente: 'Maria Oliveira', mensagem: 'Tenho interesse em compostagem' }),
          'GUARDA VALORES | Follow-up': item({ __guard_text: 'Olá! Passando para saber se ainda posso ajudar com sua dúvida?' }),
          'Enviar Follow-up 3h': item({ messages: [{ id: 'fup-msg-1' }] }),
        },
      },
    },
  }

  const unified = __test__.buildLeads([followupChatExec], null, {}, { metaExecutions: [metaExecVerified, metaExecUnverified] })
  assert.equal(unified.summary.uniqueLeads, 2)
  const maria = unified.leads.find((l) => l.leadId === '40010')
  assert.ok(maria, 'Lead Meta + Chatbot devem correlacionar pelo telefone')
  assert.deepEqual(maria.sources, ['meta', 'n8n'])
  assert.equal(maria.metaForm, 'Compostagem Bovina OUT26')
  assert.equal(maria.crmPersisted, true)
  assert.equal(maria.inMesa, true)
  assert.equal(maria.n8nEvents[0].interactionKind, 'followup_3h')
  const carlos = unified.leads.find((l) => l.leadId === '40011')
  assert.equal(carlos.crmStatus, 'confirmacao-pendente', 'Execução Meta sem MESA | Validar Destino deve ficar pendente')
  assert.equal(carlos.crmPersisted, false)

  // CRM Live reconciliation + Views/Pagination
  const reconciled = __test__.buildLeads([followupChatExec], null, {}, {
    metaExecutions: [metaExecVerified, metaExecUnverified],
    crmRows: [{
      id: 40011,
      nome: 'CARLOS MENDES',
      telefone: '5511988887777',
      cidade: 'Ribeirão Preto',
      uf: 'SP',
      na_mesa: false,
      consultor_nome: 'ADRIANO CAMARGO',
      criado_em: '2026-10-12T15:00:00.000Z',
    }],
  })
  const carlosLive = reconciled.leads.find((l) => l.leadId === '40011')
  assert.equal(carlosLive.crmPersisted, true)
  assert.equal(carlosLive.crmDelivery, 'consultant')
  assert.equal(carlosLive.consultant, 'ADRIANO CAMARGO')

  const differentCrm = __test__.buildLeads([], null, {}, {
    metaExecutions: [metaExecUnverified],
    crmRows: [{ id: 40012, nome: 'OUTRO CADASTRO', telefone: '5511988887777', na_mesa: true, criado_em: '2026-10-12T15:00:00.000Z' }],
  })
  assert.equal(differentCrm.leads.length, 2, 'IDs CRM diferentes devem permanecer separados mesmo com telefone igual')
  assert.equal(differentCrm.leads.find((lead) => lead.leadId === '40011')?.crmStatus, 'confirmacao-pendente')
  assert.equal(differentCrm.leads.find((lead) => lead.leadId === '40012')?.crmPersisted, true)

  const withoutDestination = __test__.buildLeads([], null, {}, {
    metaExecutions: [metaExecUnverified],
    crmRows: [{ id: 40011, nome: 'CARLOS MENDES', telefone: '5511988887777', na_mesa: false, consultor_nome: '' }],
  })
  assert.equal(withoutDestination.leads.find((lead) => lead.leadId === '40011')?.crmStatus, 'confirmacao-pendente', 'Persistência sem destino não confirma transferência')

  const otherEvent = structuredClone(metaExecUnverified)
  otherEvent.id = 'meta-distinto'
  otherEvent.data.resultData.runData['API SUPABASE'] = item({ id: 40012, status: 'criado' })
  const differentEvents = __test__.buildLeads([], null, {}, { metaExecutions: [metaExecUnverified, otherEvent] })
  assert.equal(differentEvents.leads.length, 2, 'Execuções com IDs CRM diferentes não devem ser fundidas pelo telefone')

  const paged = __test__.buildViewFacetsAndPaginate(unified.leads, { view: 'all', q: 'maria', page: 1, pageSize: 25 })
  assert.equal(paged.tabs.all, 2)
  assert.equal(paged.tabs.crm, 1)
  assert.equal(paged.tabs.process, 1)
  assert.equal(paged.facets.bySource.meta, 2)
  assert.equal(paged.facets.bySource.n8n, 1)
  assert.equal(paged.pagination.totalItems, 1)
  assert.equal(paged.leads[0].leadId, '40010')
}

// Test 6: Passwordless HTTP handler + POST /leads-api/crm-upsert (Mesa -> Yasmin fallback + read-after-write + delete)
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'
  __test__.resetCache()

  const crmStore = new Map()
  let nextId = 50001
  let mesaShouldRefuse = false
  let omitReadbackNext = false
  let webhookCalls = []

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/webhook/webhook-crm-transfer-araunah')) {
      webhookCalls.push(JSON.parse(init.body))
      return Response.json({ ok: true })
    }
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      const tool = rpc.params.name
      const args = rpc.params.arguments || {}
      const textResp = (obj) => Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(obj) }] } })
      if (tool === 'listar_consultores') {
        return textResp({
          consultores: [
            { id: 1, nome: 'YASMIN VALIM', ativo: true, segmento: 'Mesa / Triagem' },
            { id: 2, nome: 'ADRIANO CAMARGO', ativo: true, segmento: 'Agro' },
            { id: 3, nome: 'INATIVO EXEMPLO', ativo: false, segmento: 'Inativo' },
          ],
        })
      }
      if (tool === 'cadastrar_lead') {
        const id = nextId++
        crmStore.set(id, { id, nome: args.nome, telefone: args.telefone, cidade: args.cidade || '', uf: args.uf || '', na_mesa: false, consultor_nome: '', criado_em: '2026-10-12T17:00:00.000Z' })
        return textResp({ id, status: 'criado' })
      }
      if (tool === 'editar_lead') {
        const cur = crmStore.get(args.lead_id)
        if (!cur) return textResp({ error: 'Lead não encontrado' })
        Object.assign(cur, args.campos || {})
        return textResp({ id: cur.id, status: 'atualizado' })
      }
      if (tool === 'enviar_para_mesa') {
        if (mesaShouldRefuse) return textResp({ enviados: 0, recusados: args.ids })
        for (const id of args.ids || []) {
          const cur = crmStore.get(id)
          if (cur) cur.na_mesa = true
        }
        return textResp({ enviados: args.ids.length, recusados: [] })
      }
      if (tool === 'excluir_leads') {
        for (const id of args.ids || []) crmStore.delete(id)
        return textResp({ excluidos: args.ids.length })
      }
      if (tool === 'buscar_leads') {
        if (omitReadbackNext) {
          return textResp({ leads: [] })
        }
        const rows = [...crmStore.values()]
        const filtered = args.texto ? rows.filter((r) => String(r.telefone || '').includes(args.texto) || String(r.nome || '').toLowerCase().includes(String(args.texto).toLowerCase())) : rows
        return textResp({ leads: filtered })
      }
    }
    if (parsed.pathname.includes('/workflows/')) return Response.json({ staticData: { global: { araunahConversationState: {} } } })
    if (parsed.pathname.endsWith('/executions')) return Response.json({ data: [] })
    throw new Error('Unexpected synthetic URL: ' + url)
  }

  // 1) Open upsert to Mesa + manual webhook notification
  const upsertRes = await handler(new Request('https://meta.araunah.com/leads-api/crm-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upsert',
      phone: '(34) 99988-7766',
      name: 'Joao Produtor',
      city: 'Uberlândia',
      state: 'MG',
      interest: 'Compostagem',
      routeToMesa: true,
      manualTransferNotice: true,
    }),
  }))
  assert.equal(upsertRes.status, 200)
  const upsertJson = await upsertRes.json()
  assert.equal(upsertJson.delivery.destination, 'mesa')
  assert.equal(upsertJson.delivery.inMesa, true)
  assert.equal(upsertJson.verifiedReadback, true)
  assert.equal(webhookCalls.length, 1)
  assert.equal(webhookCalls[0].telefone, '5534999887766')

  // 2) Reincident / refused Mesa fallback to active YASMIN VALIM (never reported as inMesa!)
  mesaShouldRefuse = true
  const yasminRes = await handler(new Request('https://meta.araunah.com/leads-api/crm-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upsert',
      phone: '5511977776666',
      name: 'Ana Reincidente',
      routeToMesa: true,
    }),
  }))
  assert.equal(yasminRes.status, 200)
  const yasminJson = await yasminRes.json()
  assert.equal(yasminJson.delivery.destination, 'consultant')
  assert.equal(yasminJson.delivery.inMesa, false)
  assert.equal(yasminJson.delivery.consultant, 'YASMIN VALIM')

  // 3) Inactive consultant must be rejected 422
  const inactiveRes = await handler(new Request('https://meta.araunah.com/leads-api/crm-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update',
      leadId: String(upsertJson.crmResult.id),
      consultant: 'INATIVO EXEMPLO',
    }),
  }))
  assert.equal(inactiveRes.status, 422)

  // 4) Unconfirmed read-after-write must fail closed with 502
  omitReadbackNext = true
  const noRbRes = await handler(new Request('https://meta.araunah.com/leads-api/crm-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upsert',
      phone: '5531988881111',
      name: 'Sem Releitura',
      routeToMesa: true,
    }),
  }))
  omitReadbackNext = false
  assert.equal(noRbRes.status, 502)

  // 5) Summary works without auth password and exposes live active consultants + CRM records
  const summaryRes = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=all&view=crm'))
  assert.equal(summaryRes.status, 200)
  const summaryJson = await summaryRes.json()
  assert.equal(summaryJson.consultants.some((c) => c.name === 'INATIVO EXEMPLO'), false)
  assert.ok(summaryJson.consultants.some((c) => c.name === 'ADRIANO CAMARGO'))
  assert.ok(summaryJson.leads.some((l) => l.name === 'Joao Produtor' && l.inMesa === true))

  // 6) Delete verifies absence via readback
  const delRes = await handler(new Request('https://meta.araunah.com/leads-api/crm-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', leadId: String(upsertJson.crmResult.id), phone: '5534999887766' }),
  }))
  assert.equal(delRes.status, 200)
  assert.equal(crmStore.has(upsertJson.crmResult.id), false)

  globalThis.fetch = prevFetch
  for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

// Test 7: Raw array responses from api-leads MCP + window stop without false page limit + fast Meta trigger error skip
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'
  __test__.resetCache()

  const detailCalls = []
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      const textResp = (obj) => Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(obj) }] } })
      if (rpc.params.name === 'listar_consultores') {
        return textResp([
          { nome: 'ADRIANO CAMARGO', vertical: 'AGRO', cidade_base: 'Uberlandia' },
          { nome: 'YASMIN VALIM', vertical: 'CORPORATIVO', cidade_base: 'Patrocinio' },
        ])
      }
      if (rpc.params.name === 'buscar_leads') {
        return textResp([
          { id: 70001, nome: 'Produtor CRM', telefone: '5534997776655', cidade: 'Uberaba', uf: 'MG', produto: 'Ulexita', origem: 'WhatsApp', na_mesa: true, consultor_nome: '', criado_em: new Date().toISOString(), observacao: '' },
        ])
      }
    }
    if (parsed.pathname.includes('/workflows/')) return Response.json({ staticData: { global: { araunahConversationState: {} } } })
    if (parsed.pathname.endsWith('/executions')) {
      const wf = parsed.searchParams.get('workflowId')
      if (wf === 'IvkbTdyCJY242x1O') {
        return Response.json({
          data: [
            { id: 'm-err-1', mode: 'webhook', status: 'error', startedAt: new Date(Date.now() - 60_000).toISOString(), stoppedAt: new Date(Date.now() - 59_985).toISOString() },
          ],
          nextCursor: null,
        })
      }
      return Response.json({
        data: [
          { id: 'c-old', mode: 'trigger', status: 'success', startedAt: new Date(Date.now() - 48 * 3600_000).toISOString(), stoppedAt: new Date(Date.now() - 48 * 3600_000 + 100).toISOString() },
        ],
        nextCursor: 'cursor-page-2',
      })
    }
    if (parsed.pathname.includes('/executions/')) {
      detailCalls.push(parsed.pathname)
      return Response.json({ data: { resultData: { runData: {} } } })
    }
    throw new Error('Unexpected URL in Test 7: ' + url)
  }

  const consRes = await handler(new Request('https://meta.araunah.com/leads-api/consultants'))
  assert.equal(consRes.status, 200)
  const consJson = await consRes.json()
  assert.equal(consJson.consultants.length, 2)
  assert.equal(consJson.consultants[0].segment, 'AGRO')

  const sumRes = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=today&refresh=1'))
  assert.equal(sumRes.status, 200)
  const sumJson = await sumRes.json()
  assert.equal(sumJson.tabs.crm, 1)
  assert.equal(sumJson.tabs.mesa, 1)
  assert.equal(sumJson.coverage.reasons.includes('A listagem atingiu o limite de páginas'), false)
  assert.ok(sumJson.coverage.reasons.includes('No período consultado, execuções do workflow Meta falharam antes de processar leads'))
  assert.equal(detailCalls.length, 0, 'Fast 15ms Meta trigger error must not trigger detail download')

  globalThis.fetch = prevFetch
  for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

// Consulta individual por ID confirma o destino de um registro fora da listagem inicial.
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.N8N_META_WORKFLOW_ID = 'off'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'
  __test__.resetCache()
  let directReads = 0
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      let rows = []
      if (rpc.params.name === 'buscar_leads' && rpc.params.arguments.texto === '80801') {
        directReads++
        rows = [{ id: 80801, nome: 'Lead fictício', telefone: '5534999990000', na_mesa: true, consultor_nome: '' }]
      }
      return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(rows) }] } })
    }
    if (parsed.pathname.includes('/workflows/')) return Response.json({ staticData: { global: { araunahConversationState: {
      'whatsapp:5534999990000': { status: 'transferred', crmLeadId: 80801, name: 'Lead fictício', lastInboundAt: new Date().toISOString() },
    } } } })
    if (parsed.pathname.endsWith('/executions')) return Response.json({ data: [], nextCursor: null })
    throw new Error('URL sintética inesperada')
  }
  const response = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=30&refresh=1'))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(directReads, 1)
  assert.equal(body.leads.find((lead) => lead.leadId === '80801')?.inMesa, true)
  assert.equal(body.tabs.pending, 0)
  globalThis.fetch = prevFetch
  for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

// Test 9: BR 12-vs-13 correlation, strict crmIdentityCompatible, and manualCrmLeadId resolution
{
  assert.equal(__test__.phoneCorrelationKey('553499887766'), 'phone-553499887766')
  assert.equal(__test__.phoneCorrelationKey('+55 (34) 99988-7766'), 'phone-553499887766')

  assert.equal(__test__.crmIdentityCompatible({ leadId: '501', name: 'Qualquer' }, { id: 501, nome: 'Outro Nome' }, 3), true)
  assert.equal(__test__.crmIdentityCompatible({ leadId: 'waba-553499887766', name: 'Carlos Ferreira' }, { id: 501, nome: 'Carlos Ferreira' }, 2), false)
  assert.equal(__test__.crmIdentityCompatible({ leadId: 'waba-553499887766', name: 'Cliente' }, { id: 501, nome: 'Cliente Vip' }, 1), false)
  assert.equal(__test__.crmIdentityCompatible({ leadId: 'waba-553499887766', name: 'Maria Clara' }, { id: 501, nome: 'Pedro Alves' }, 1), false)
  assert.equal(__test__.crmIdentityCompatible({ leadId: 'waba-553499887766', name: 'Carlos Silva', city: 'Uberaba' }, { id: 501, nome: 'Carlos Eduardo Silva', cidade: 'Uberaba' }, 1), true)
  assert.equal(__test__.crmIdentityCompatible({ leadId: 'waba-553499887766', name: 'Carlos Silva', city: 'Uberlandia' }, { id: 501, nome: 'Carlos Eduardo Silva', cidade: 'Uberaba' }, 1), false)
  assert.equal(__test__.crmIdentityCompatible({ leadId: 'waba-553499887766', name: 'Carlos', city: 'Patos de Minas', state: 'MG' }, { id: 501, nome: 'Carlos Henrique', cidade: 'Patos de Minas', uf: 'MG' }, 1), true)

  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.N8N_META_WORKFLOW_ID = 'off'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'
  __test__.resetCache()

  const nowIso = new Date().toISOString()
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      const rows = rpc.params.name === 'buscar_leads'
        ? [{ id: 90901, nome: 'Produtor Teste', telefone: '+55 (34) 99988-7766', cidade: 'Uberaba', uf: 'MG', na_mesa: false, consultor_nome: 'Consultor Alfa', criado_em: nowIso }]
        : []
      return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(rows) }] } })
    }
    if (parsed.pathname.includes('/workflows/')) {
      return Response.json({
        staticData: {
          global: {
            araunahConversationState: {
              'whatsapp:553499887766': { status: 'transferred', manualCrmLeadId: 90901, name: 'Produtor Teste', lastInboundAt: nowIso },
            },
          },
        },
      })
    }
    if (parsed.pathname.endsWith('/executions')) return Response.json({ data: [], nextCursor: null })
    throw new Error('Unexpected URL in Test 9: ' + url)
  }

  try {
    const res = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=7&refresh=1'))
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.tabs.pending, 0)
    assert.equal(body.leads.length, 1)
    assert.equal(body.leads[0].leadId, '90901')
    assert.equal(body.leads[0].consultant, 'Consultor Alfa')
  } finally {
    globalThis.fetch = prevFetch
    for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
    Object.assign(process.env, envBackup)
  }
}

// Test 10: Fast (<1200ms) Meta Lead Ads success executions are hydrated & trigger cron ticks do not warn
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.N8N_META_WORKFLOW_ID = 'meta-fast-wf'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'
  __test__.resetCache()

  const detailPaths = []
  const startMs = Date.now() - 10_000
  const metaStart = new Date(startMs).toISOString()
  const metaStop = new Date(startMs + 350).toISOString()
  const cronStart = new Date(startMs - 5_000).toISOString()
  const cronStop = new Date(startMs - 4_910).toISOString()

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      const rows = rpc.params.name === 'buscar_leads'
        ? [{ id: 91234, nome: 'Lead Meta Rapido', telefone: '+55 (34) 98877-6655', cidade: 'Uberaba', uf: 'MG', origem: 'Meta Ads', na_mesa: true, consultor_nome: '', criado_em: metaStart }]
        : []
      return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(rows) }] } })
    }
    if (parsed.pathname.includes('/workflows/')) return Response.json({ staticData: { global: { araunahConversationState: {} } } })
    if (parsed.pathname.endsWith('/executions')) {
      const wf = parsed.searchParams.get('workflowId')
      if (wf === 'meta-fast-wf') {
        return Response.json({ data: [{ id: 'm-fast-350', mode: 'webhook', status: 'success', startedAt: metaStart, stoppedAt: metaStop }], nextCursor: null })
      }
      return Response.json({ data: [{ id: 'c-cron-90', mode: 'trigger', status: 'success', startedAt: cronStart, stoppedAt: cronStop }], nextCursor: null })
    }
    if (parsed.pathname.includes('/executions/m-fast-350')) {
      detailPaths.push(parsed.pathname)
      return Response.json({
        id: 'm-fast-350',
        startedAt: metaStart,
        stoppedAt: metaStop,
        data: {
          resultData: {
            runData: {
              'Code in JavaScript': [{ data: { main: [[{ json: { FORMULARIO_NOME: 'Form Teste Meta', TELEFONE: '5534988776655', 'NOME COMPLETO': 'Lead Meta Rapido', CIDADE: 'Uberaba', ESTADO: 'MG' } }]] } }],
            },
          },
        },
      })
    }
    throw new Error('Unexpected URL in Test 10: ' + url)
  }

  try {
    const res = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=7&refresh=1'))
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.ok(detailPaths.includes('/api/v1/executions/m-fast-350'))
    assert.ok(body.leads.some((lead) => lead.name === 'Lead Meta Rapido'))
    assert.equal(body.coverage.reasons.includes('Execuções curtas não foram analisadas individualmente'), false)
    assert.equal(body.sourceHealth.n8nMeta.status, 'ok')
  } finally {
    globalThis.fetch = prevFetch
    for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
    Object.assign(process.env, envBackup)
  }
}

// Test 11: Direct CRM global search outside period + honest CRM 100-row cap reporting
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.N8N_META_WORKFLOW_ID = 'off'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'

  const nowIso = new Date().toISOString()
  const oldIso = new Date(Date.now() - 20 * 86_400_000).toISOString()
  const recentDayIso = new Date(Date.now() - 86_400_000).toISOString()
  let returnCappedRows = false

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      let rows = []
      if (rpc.params.name === 'buscar_leads') {
        if (rpc.params.arguments?.texto === 'Comp') {
          rows = [{ id: 95501, nome: 'Companhia Agricola Antiga', telefone: '5534977665544', cidade: 'Araxa', uf: 'MG', na_mesa: true, consultor_nome: '', criado_em: oldIso }]
        } else if (returnCappedRows) {
          rows = Array.from({ length: 100 }, (_, i) => ({
            id: 96000 + i,
            nome: `Lead Lote ${i}`,
            telefone: `553491000${String(i).padStart(4, '0')}`,
            na_mesa: true,
            consultor_nome: '',
            criado_em: recentDayIso,
          }))
        } else {
          rows = [{ id: 95500, nome: 'Produtor Hoje', telefone: '5534966554433', na_mesa: true, consultor_nome: '', criado_em: nowIso }]
        }
      }
      return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(rows) }] } })
    }
    if (parsed.pathname.includes('/workflows/')) return Response.json({ staticData: { global: { araunahConversationState: {} } } })
    if (parsed.pathname.endsWith('/executions')) return Response.json({ data: [], nextCursor: null })
    throw new Error('Unexpected URL in Test 11: ' + url)
  }

  try {
    __test__.resetCache()
    const searchRes = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=today&q=Comp&refresh=1'))
    const searchBody = await searchRes.json()
    assert.equal(searchRes.status, 200)
    assert.deepEqual(searchBody.searchMeta, { query: 'Comp', globalDatabase: true, matchesOutsidePeriod: 1 })
    assert.ok(searchBody.leads.some((lead) => lead.leadId === '95501'))

    __test__.resetCache()
    returnCappedRows = true
    const capRes = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=30&refresh=1'))
    const capBody = await capRes.json()
    assert.equal(capRes.status, 200)
    assert.equal(capBody.sourceHealth.crm.status, 'ok')
    assert.equal(capBody.coverage.reasons.some((reason) => reason.includes('Listagem inicial do CRM limitada')), false)
  } finally {
    globalThis.fetch = prevFetch
    for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
    Object.assign(process.env, envBackup)
  }
}

// Test 12: Recovered morning Meta errors + <500ms webhook status callbacks do not generate false warnings
{
  const prevFetch = globalThis.fetch
  const envBackup = { ...process.env }
  delete process.env.CF_ACCESS_TEAM_DOMAIN
  delete process.env.CF_ACCESS_AUD
  delete process.env.CF_ACCESS_ALLOWED_EMAILS
  process.env.N8N_ARAUNAH_BASE_URL = 'https://n8n.synthetic.invalid'
  process.env.N8N_ARAUNAH_API_KEY = 'synthetic-n8n-key'
  process.env.N8N_META_WORKFLOW_ID = 'meta-recovered-wf'
  process.env.ARAUNAH_LEADS_API_URL = 'https://crm.synthetic.invalid/functions/v1/api-leads'
  process.env.ARAUNAH_LEADS_API_TOKEN = 'synthetic-crm-token'
  __test__.resetCache()

  const errStart = new Date(Date.now() - 3600_000).toISOString()
  const errStop = new Date(Date.now() - 3599_990).toISOString()
  const okStart = new Date(Date.now() - 60_000).toISOString()
  const okStop = new Date(Date.now() - 59_500).toISOString()
  const cbStart = new Date(Date.now() - 30_000).toISOString()
  const cbStop = new Date(Date.now() - 29_800).toISOString()

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/functions/v1/api-leads')) {
      const rpc = JSON.parse(init.body)
      return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify([]) }] } })
    }
    if (parsed.pathname.includes('/workflows/')) return Response.json({ staticData: { global: { araunahConversationState: {} } } })
    if (parsed.pathname.endsWith('/executions')) {
      const wf = parsed.searchParams.get('workflowId')
      if (wf === 'meta-recovered-wf') {
        return Response.json({
          data: [
            { id: 'm-ok-new', mode: 'webhook', status: 'success', startedAt: okStart, stoppedAt: okStop },
            { id: 'm-err-old', mode: 'webhook', status: 'error', startedAt: errStart, stoppedAt: errStop },
          ],
          nextCursor: null,
        })
      }
      return Response.json({
        data: [{ id: 'c-cb-200ms', mode: 'webhook', status: 'success', startedAt: cbStart, stoppedAt: cbStop }],
        nextCursor: null,
      })
    }
    if (parsed.pathname.includes('/executions/m-ok-new')) {
      return Response.json({ id: 'm-ok-new', startedAt: okStart, stoppedAt: okStop, data: { resultData: { runData: {} } } })
    }
    throw new Error('Unexpected URL in Test 12: ' + url)
  }

  try {
    const res = await handler(new Request('https://meta.araunah.com/leads-api/summary?days=7&refresh=1'))
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.coverage.complete, true)
    assert.deepEqual(body.coverage.reasons, [])
    assert.equal(body.sourceHealth.n8nChatbot.status, 'ok')
    assert.equal(body.sourceHealth.n8nMeta.status, 'ok')
    assert.equal(body.sourceHealth.crm.status, 'ok')
  } finally {
    globalThis.fetch = prevFetch
    for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
    Object.assign(process.env, envBackup)
  }
}

console.log('OK: all n8n leads tests (open access, CF Access, Meta Lead Ads, CRM readback/upsert/delete, views/pagination) passed!')
