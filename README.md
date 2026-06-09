# Marketing Dashboard AI Pipeline

MVP local para dashboards de marketing gerados/atualizados por Hermes Agent + gpt-5.5, com dados extraídos server-side via Windsor.ai e deploy estático no Netlify.

## Stack

- Vite + React + TypeScript
- Snapshots JSON sanitizados em `data/<cliente>/latest.json`
- Scripts Python para fetch/validação
- Netlify-ready via `netlify.toml`

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

Fluxo final Meta + Instagram separado:

```bash
npm run fetch:social
npm run normalize:social
npm run validate:data
npm run build
```

O fetch gera arquivos brutos ignorados pelo Git:

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

## Próxima fase

1. Criar repositório remoto no GitHub.
2. Conectar deploy no Netlify.
3. Ativar proteção de acesso ao dashboard.
4. Criar automação recorrente via Hermes cron para atualizar Facebook Ads + Instagram Insights.
5. Evoluir insights executivos com análise de variação, anomalias e recomendações.
