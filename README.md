# Marketing Dashboard AI Pipeline

Dashboard de marketing com snapshot seguro para o build e atualização sob demanda via Netlify Function. A chave da Windsor.ai permanece exclusivamente no servidor.

## Entrada para outras IAs

Antes de investigar ou alterar o painel, leia [`docs/AI-CONTEXT.md`](docs/AI-CONTEXT.md) e [`HANDOFF.md`](HANDOFF.md). A documentação registra a arquitetura, rotas, variáveis server-side, comandos, regras de segurança e o último estado publicado verificado.

## Stack

- Vite + React + TypeScript
- Snapshots JSON sanitizados em `data/<cliente>/latest.json`
- Scripts Python para fetch/validação
- Netlify Function `/.netlify/functions/dashboard-data` com timeout, `cache-control: no-store`, ID de correlação e status real por fonte

## Comandos

```bash
npm install
npm run validate:data
npm run build
npm run dev
```

## Windsor.ai

Nunca exponha `WINDSOR_API_KEY` no frontend. Use apenas em ambiente server-side. A chave padrão deve ficar em `~/.hermes/.env`:

```bash
WINDSOR_API_KEY=sua_chave_windsor
```

Fluxo de snapshot para build (Meta + Instagram separados):

```bash
npm run fetch:social
npm run normalize:social
npm run validate:data
npm run build
```

O fetch gera arquivos brutos ignorados pelo Git, para os períodos de 7, 15 e 30 dias:

- `data/raw/facebook_ads_last_7d.json`
- `data/raw/instagram_insights_last_7d.json`

O normalizador gera o snapshot agregado e seguro para o frontend:

- `data/social/latest.json`

Campos usados no Facebook Ads:

```text
date,datasource,account_name,source,campaign,clicks,spend,actions_lead,cost_per_action_type_lead
```

Campos usados no Instagram Insights:

```text
date,account_name,source,followers_count,audience_gender_age_size,accounts_engaged,follows_and_unfollows,follows_count,follower_count_1d
```

## Atualização sob demanda

O botão **Atualizar dados** consulta somente o período ativo (7, 15 ou 30 dias) por `/.netlify/functions/dashboard-data`. A função busca Meta Ads e Instagram Insights em paralelo, mantém a chave em `WINDSOR_API_KEY` no ambiente do Netlify, devolve `cache-control: no-store` e marca uma fonte como `partial` quando sua `lastDate` está atrasada em relação ao período retornado.

Se a atualização falhar, a interface preserva o último snapshot válido e mostra a falha com o ID de solicitação. Não há fallback silencioso.

Configure no Netlify:

```text
WINDSOR_API_KEY=sua_chave_windsor
```

## Próxima fase

1. Criar repositório remoto no GitHub.
2. Conectar deploy no Netlify.
3. Ativar proteção de acesso ao dashboard.
4. Criar automação recorrente via Hermes cron para atualizar o snapshot de build.
5. Evoluir insights executivos com análise de variação, anomalias e recomendações.
