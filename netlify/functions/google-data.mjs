const VALID_PERIODS = new Set(['today', '7d', '15d', '30d']);

function json(body, status = 200, requestId) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store, private',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  });
}

export default async function handler(req) {
  const requestId = crypto.randomUUID();
  if (req.method && req.method !== 'GET') {
    return json({ error: 'Método não permitido.', requestId }, 405, requestId);
  }
  const url = new URL(req.url);
  const periodParam = (url.searchParams.get('period') || '7d').toLowerCase();
  if (!VALID_PERIODS.has(periodParam)) {
    return json({
      schema: 'araunah.google-data.v2',
      period: periodParam,
      status: 'invalid_period',
      error: `Período inválido: '${periodParam}'. Use 'today', '7d', '15d' ou '30d'.`,
      requestId,
    }, 400, requestId);
  }
  return json({
    schema: 'araunah.google-data.v2',
    period: periodParam,
    status: 'unavailable',
    error: 'Dados GA4 e Google Ads indisponíveis: a integração server-side ainda não possui autorização válida. Nenhuma métrica estimada está sendo exibida.',
    requestId,
  }, 503, requestId);
}
