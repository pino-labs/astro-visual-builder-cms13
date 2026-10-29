const { OPTIMIZELY_GRAPH_APP_KEY: APP_KEY, OPTIMIZELY_GRAPH_SECRET: SECRET, OPTIMIZELY_GRAPH_CALLBACK_APIKEY: CALLBACK_KEY } = process.env;
const rawHost = process.env.OPTIMIZELY_SITE_HOSTNAME ?? '';
const SITE = rawHost && !/^https?:\/\//.test(rawHost) ? `https://${rawHost}` : rawHost;
const GRAPH = (process.env.OPTIMIZELY_GRAPH_GATEWAY ?? 'https://cg.optimizely.com').replace(/\/+$/, '').replace(/\/content\/v2$/, '');

if (!APP_KEY || !SECRET || !CALLBACK_KEY || !SITE) {
  console.error('[register-webhook] set OPTIMIZELY_GRAPH_APP_KEY, OPTIMIZELY_GRAPH_SECRET, OPTIMIZELY_GRAPH_CALLBACK_APIKEY and OPTIMIZELY_SITE_HOSTNAME');
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${APP_KEY}:${SECRET}`).toString('base64')}`;
const callback = `${SITE}/hooks/graph`;

try {
  const list = await fetch(`${GRAPH}/api/webhooks`, { headers: { Authorization: auth } });
  const hooks = list.ok ? await list.json() : [];
  if (Array.isArray(hooks) && hooks.some((h) => h?.request?.url === callback)) {
    console.log(`[register-webhook] already registered: ${callback}`);
    process.exit(0);
  }
  const res = await fetch(`${GRAPH}/api/webhooks`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disabled: false,
      request: { url: callback, method: 'POST', headers: { 'x-api-key': CALLBACK_KEY } },
      topic: ['*.*'],
      filters: [{ status: { eq: 'Published' } }],
    }),
  });
  console.log(`[register-webhook] ${res.status} ${callback}`);
  if (!res.ok) process.exitCode = 1;
} catch (e) {
  console.error('[register-webhook] failed:', e);
  process.exitCode = 1;
}
