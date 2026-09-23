# Painel `meta.araunah.com` — Contexto operacional para IAs

> Documento de entrada para Antigravity, Gemini, Claude, ChatGPT, Hermes e outras IAs que precisem investigar, corrigir ou evoluir o painel.
>
> **Regra:** este documento descreve o estado verificado do código e da publicação. Antes de afirmar que algo está saudável, repita a validação ao vivo.

## 1. Identificação

- **Produto:** painel interno de marketing da Araunah.
- **Domínio público:** `https://meta.araunah.com`.
- **Repositório local:** `D:/HermesAraunah/projects/araunah-dashboard`.
- **Remote Git:** `https://github.com/higorlamonier/araunah-dashboard.git`.
- **Branch observada:** `main`, com remote `origin/main`.
- **Stack:** Vite + React + TypeScript + Netlify Functions + Windsor.ai.
- **Vertical:** Araunah Agro/marketing corporativo. Não misturar com Araunah Tech ou Florestas.
- **Fonte de verdade técnica:** código do repositório, funções publicadas e respostas HTTP atuais. O vault registra contexto, mas não substitui a validação operacional.

## 2. Estado verificado em 2026-09-23 11:45

A validação pública desta sessão encontrou:

| Superfície | Resultado | Interpretação |
|---|---:|---|
| `https://meta.araunah.com/` | HTTP 200 | Shell do painel acessível |
| `/.netlify/functions/dashboard-data?period=7d` | HTTP 502 | Refresh Windsor indisponível |
| `/.netlify/functions/dashboard-data?period=15d` | HTTP 502 | Refresh Windsor indisponível |
| `/.netlify/functions/dashboard-data?period=30d` | HTTP 502 | Refresh Windsor indisponível/timeout |
| `/.netlify/functions/dashboard-data?period=bad` | HTTP 400 | Validação de período funcionando |
| `/chatbot` | HTTP 200 | Rota SPA acessível |
| `/chatbot-api/summary?days=15` | HTTP 502 | Monitor n8n sem leitura disponível no momento |
| `/leads` | HTTP 200 | Rota SPA acessível |
| `/leads-api/summary?days=30` | HTTP 503 | Cloudflare Access ainda não configurado para a área de leads |

**Não declarar o painel como operacionalmente saudável neste estado.** A interface pública abre, mas as fontes ao vivo e as áreas operacionais têm falhas/configuração pendente.

O snapshot local `data/social/latest.json` observado nesta sessão foi gerado em `2026-07-29T12:51:15.081455+00:00`. Ele contém períodos `7d`, `15d` e `30d`; Meta Ads estava `partial` até `2026-07-28`, Instagram estava `ok` até `2026-07-29`, e GA4/Google Ads estavam `missing`. Esse snapshot é fallback de build e está desatualizado em relação à data desta documentação.

## 3. Rotas e superfícies

### 3.1 Marketing principal — `/`

Implementação principal em [`src/App.tsx`](../src/App.tsx).

- Seleção de rota é feita por `window.location.pathname`; não há React Router.
- A página importa o snapshot local por [`src/data/dashboardData.ts`](../src/data/dashboardData.ts).
- Abas/seções principais: Resumo, Mídia paga, Instagram, Eficiência e Dados.
- Períodos disponíveis na interface: `7d`, `15d`, `30d`.
- O botão **Atualizar dados** consulta somente o período ativo.
- A interface cancela a requisição anterior, aplica timeout de 45 s e repete uma vez falhas transitórias HTTP 502/503/504.
- Se o refresh falhar, mantém o último snapshot válido e mostra a falha e o `requestId`; não há fallback silencioso apresentado como dado novo.
- Datas são exibidas em `pt-BR`, timezone `America/Sao_Paulo`.

### 3.2 Monitor operacional do chatbot — `/chatbot`

Implementação em [`src/ChatbotMonitorPage.tsx`](../src/ChatbotMonitorPage.tsx) e [`netlify/functions/chatbot-monitor.mjs`](../netlify/functions/chatbot-monitor.mjs).

Endpoint amigável:

```text
/chatbot-api/summary?days=7
/chatbot-api/summary?days=15
/chatbot-api/summary?days=30
```

O redirect em [`netlify.toml`](../netlify.toml) encaminha `/chatbot-api/*` para a função `chatbot-monitor`.

O monitor consulta o n8n em modo de leitura, com `includeData=true`, e agrega:

- mensagens inbound;
- passagens pela IA;
- CRM criado/atualizado/confirmado;
- transferências aceitas pelo Graph;
- callbacks Meta por status;
- separação entre identidade produtiva, outras/legadas e desconhecidas;
- falhas de execução, falhas CRM e falhas de callback produtivo;
- série diária e incidentes recentes.

O endpoint deve devolver somente agregados sanitizados. Não adicionar nomes, telefones, mensagens ou payloads brutos a esta área.

### 3.3 Leads operacionais — `/leads`

Implementação em [`src/LeadsPage.tsx`](../src/LeadsPage.tsx) e [`netlify/functions/n8n-leads.mjs`](../netlify/functions/n8n-leads.mjs).

Endpoint amigável:

```text
/leads-api/summary?days=7
/leads-api/summary?days=15
/leads-api/summary?days=30
/leads-api/summary?days=60
/leads-api/summary?days=90
```

Esta área contém dados individuais de leads e deve permanecer protegida por Cloudflare Access. A função também valida o JWT do Access; não confiar somente no bloqueio da borda ou em rota escondida.

A função exige, no servidor:

- `CF_ACCESS_TEAM_DOMAIN`;
- `CF_ACCESS_AUD`;
- `CF_ACCESS_ALLOWED_EMAILS`;
- `N8N_ARAUNAH_BASE_URL`;
- `N8N_ARAUNAH_API_KEY`.

O contrato da resposta inclui leads únicos, criação/atualização no CRM, transferência confirmada, reincidência e detalhes do contato. A função informa que responsável humano, primeira resposta, resolução/perda e motivo dependem da migração de rastreio no Supabase.

**Estado público verificado:** a função respondeu HTTP 503 informando que o Cloudflare Access ainda não está configurado. Não remover a proteção para “fazer funcionar”.

## 4. Arquitetura de dados

```text
Snapshot local data/social/latest.json
        │
        ├── importado pelo frontend como dashboardData
        │
        └── fallback visual do build

Browser → /.netlify/functions/dashboard-data?period=...
              │
              ├── Windsor connector facebook → Meta Ads
              └── Windsor connector instagram → Instagram Insights
```

### 4.1 Windsor no refresh do marketing

A função [`netlify/functions/dashboard-data.mjs`](../netlify/functions/dashboard-data.mjs):

- usa `https://connectors.windsor.ai` server-side;
- consulta os conectores `facebook` e `instagram` separadamente;
- usa os presets `last_7dT`, `last_15dT` e `last_30dT` para incluir o dia atual;
- reduz os campos ao necessário para o painel;
- executa as duas fontes em paralelo;
- aplica timeout de 10 s por fonte;
- faz no máximo uma nova tentativa após falha transitória;
- retorna `cache-control: no-store` e `x-request-id`;
- devolve diagnósticos por fonte: status, tentativas, duração, `lastDate` e erro sanitizado;
- marca uma fonte como `partial` quando seu `lastDate` não alcança o fim do período retornado;
- marca GA4 e Google Ads como `missing`, pois ainda não estão conectados a esta função.

**Não voltar automaticamente ao conector agregado `/all`** para corrigir timeout. A separação `facebook`/`instagram` é uma decisão de confiabilidade validada no histórico do projeto.

### 4.2 Snapshot de build

Scripts:

- [`scripts/fetch_social_sources.py`](../scripts/fetch_social_sources.py): busca os dados Windsor dos períodos 7/15/30; usa `WINDSOR_API_KEY` somente no processo local/server-side.
- [`scripts/normalize_social.py`](../scripts/normalize_social.py): normaliza os arquivos brutos e grava `data/social/latest.json`.
- [`scripts/validate_data.py`](../scripts/validate_data.py): valida schema mínimo e procura marcadores de segredo.

Arquivos brutos em `data/raw/` são ignorados pelo Git porque podem conter dados de cliente/campanha.

## 5. Variáveis de ambiente

Nunca salvar valores neste documento, no Git, no frontend ou em mensagens. Os nomes esperados são:

```text
WINDSOR_API_KEY
N8N_ARAUNAH_BASE_URL
N8N_ARAUNAH_API_KEY
N8N_CHATBOT_WORKFLOW_ID        # opcional; há default no código
N8N_PRODUCTION_PHONE_NUMBER_ID # opcional; há default no código
CF_ACCESS_TEAM_DOMAIN
CF_ACCESS_AUD
CF_ACCESS_ALLOWED_EMAILS
```

`WINDSOR_API_KEY`, chaves n8n e configurações Cloudflare devem existir somente no ambiente server-side apropriado. Qualquer URL de Windsor contendo `api_key` deve ser tratada como segredo e nunca repetida integralmente.

## 6. Comandos de desenvolvimento e validação

Executar em `D:/HermesAraunah/projects/araunah-dashboard`:

```bash
npm install
npm run validate:data
npm run lint
npm run build
npm run dev
npm run preview
```

Fluxo para regenerar snapshot local, somente quando houver credencial autorizada disponível no ambiente:

```bash
npm run fetch:social
npm run normalize:social
npm run validate:data
npm run build
```

Testes específicos existentes:

```bash
npm run test:chatbot
node scripts/test-n8n-leads.mjs
```

Em Windows, usar `python`, não assumir `python3`.

## 7. Deploy Netlify

O [`netlify.toml`](../netlify.toml) define:

- build: `npm ci && npm run validate:data && npm run build`;
- publicação: `dist`;
- funções: `netlify/functions`;
- Node `22`;
- redirects para `/chatbot`, `/chatbot-api/*`, `/leads`, `/leads-api/*`.

Fluxo manual somente após validar o working tree e obter autorização para publicar:

```bash
npm run validate:data
npm run lint
npm run build
npx netlify deploy --prod --dir=dist --functions=netlify/functions --json
```

Antes de publicar:

1. verificar `git status --short --branch`;
2. conferir `git diff --check`;
3. confirmar que nenhum segredo entrou em código, `dist` ou snapshot;
4. validar variáveis no Netlify sem imprimir valores;
5. publicar somente o escopo autorizado;
6. testar diretamente o domínio e as funções publicadas;
7. atualizar o `HANDOFF.md` com resultado real.

## 8. Diagnóstico recomendado

### Marketing retornando 502

1. Testar `period=7d`, `15d`, `30d` e um período inválido.
2. Registrar somente HTTP, `x-request-id`, status por fonte, duração e `lastDate`; nunca registrar token.
3. Verificar a variável `WINDSOR_API_KEY` no ambiente da função sem expor o valor.
4. Reproduzir cada conector separadamente com os mesmos campos e presets do código.
5. Confirmar se o Windsor está retornando array de linhas ou `{ data: [...] }`.
6. Não tratar HTTP 200 da página como saúde do refresh.
7. Após correção, validar o endpoint publicado, não somente o build local.

### Chatbot retornando 502

1. Verificar `N8N_ARAUNAH_BASE_URL` e `N8N_ARAUNAH_API_KEY` no Netlify.
2. Confirmar leitura do workflow e da API de execuções com `includeData=true`.
3. Conferir se `N8N_CHATBOT_WORKFLOW_ID` aponta para o workflow correto.
4. Validar paginação, volume de execuções e timeout.
5. Preservar separação inbound versus callback e identidade produtiva versus legada.

### Leads retornando 503/401/403

- `503`: configuração de Cloudflare Access ou n8n ausente.
- `401`: JWT ausente, expirado, audiência/issuer inválido ou assinatura não validada.
- `403`: e-mail não está na allowlist.
- Não remover `requireAccess` nem publicar a função sem proteção para contornar o erro.

## 9. Regras de alteração para outras IAs

- Ler [`AGENTS.md`](../../../AGENTS.md), o [`HANDOFF.md`](../HANDOFF.md) local e o handoff raiz antes de editar.
- Ler esta documentação e os arquivos de código diretamente envolvidos.
- Não assumir que o snapshot é atual só porque o build passa.
- Não misturar Meta Ads pago com Instagram orgânico nas métricas.
- Não adicionar GA4/Google Ads como “conectados” sem endpoint e leitura ao vivo confirmados.
- Não expor PII da área de leads no monitor agregado.
- Não alterar SEO, navegação ou conteúdo institucional para corrigir este painel sem pedido explícito.
- Não apagar, reverter ou sobrescrever alterações não relacionadas de outras IAs; o working tree observado já contém mudanças não commitadas.
- Não fazer merge, push, deploy ou alteração externa sem autorização compatível com o escopo.
- Não afirmar que uma correção foi publicada sem URL, HTTP e resposta verificadas.

## 10. Arquivos de entrada rápida

- [`README.md`](../README.md) — comandos e visão resumida.
- [`src/App.tsx`](../src/App.tsx) — roteamento, refresh e dashboard principal.
- [`src/types.ts`](../src/types.ts) — contrato TypeScript do snapshot.
- [`src/data/dashboardData.ts`](../src/data/dashboardData.ts) — import do snapshot.
- [`data/social/latest.json`](../data/social/latest.json) — snapshot local/fallback.
- [`netlify/functions/dashboard-data.mjs`](../netlify/functions/dashboard-data.mjs) — refresh Windsor.
- [`netlify/functions/chatbot-monitor.mjs`](../netlify/functions/chatbot-monitor.mjs) — monitor agregado n8n.
- [`netlify/functions/n8n-leads.mjs`](../netlify/functions/n8n-leads.mjs) — leads individuais protegido por Access.
- [`netlify.toml`](../netlify.toml) — build, funções e redirects.
- [`HANDOFF.md`](../HANDOFF.md) — continuidade obrigatória do projeto.

## 11. Critério de conclusão

Uma mudança só deve ser considerada concluída quando:

- o comportamento local passa em validação, lint e build;
- a função relevante é testada com fixtures ou fonte real apropriada;
- o domínio publicado é testado diretamente;
- cada fonte possui status compatível com `lastDate`;
- nenhum segredo aparece no diff ou no build;
- o estado parcial, ausente ou bloqueado é reportado sem maquiagem;
- o `HANDOFF.md` local é atualizado no topo.
