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

Nunca exponha `WINDSOR_API_KEY` no frontend. Use apenas em ambiente server-side:

```bash
WINDSOR_API_KEY=*** python scripts/fetch_windsor.py \
  --connector facebook \
  --fields date,campaign,campaign_id,account_id,account_name,source,spend,impressions,clicks,ctr,cpc,cpm \
  --date-preset last_30d \
  --out data/raw/facebook.json
```

## Próxima fase

1. Conectar Windsor.ai e listar campos/contas disponíveis.
2. Criar normalização de raw data para `data/<cliente>/latest.json`.
3. Gerar insights executivos com Hermes/gpt-5.5.
4. Versionar no GitHub e conectar Netlify.
5. Criar automação recorrente via Hermes cron para atualizar snapshots e abrir PR.
