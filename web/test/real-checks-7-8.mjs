import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const BASE = env.BASE ?? 'http://127.0.0.1:4321';
const ARTICLE = env.ARTICLE;
const KEY = env.CONTENT_KEY;
const LOCALE = env.LOCALE ?? 'en';
const CMS = `${env.OPTIMIZELY_CMS_API_URL?.replace(/\/$/, '')}/_cms/v1`;
const GRAPH = `${(env.OPTIMIZELY_GRAPH_GATEWAY || 'https://cg.optimizely.com').replace(/\/$/, '')}/content/v2`;
if (!ARTICLE || !KEY || !env.OPTIMIZELY_CMS_API_URL) {
  console.error('Set ARTICLE, CONTENT_KEY and OPTIMIZELY_CMS_API_URL (see the header of this file).');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const result = (ok, label, detail) => {
  console.log(ok ? `PASS  ${label}` : `FAIL  ${label}  -> ${detail}`);
  ok ? passed++ : failed++;
};

async function cms(method, path, body) {
  const auth = await fetch(`${CMS}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.OPTIMIZELY_CMS_CLIENT_ID, client_secret: env.OPTIMIZELY_CMS_CLIENT_SECRET }),
  });
  if (!auth.ok) throw new Error(`token: HTTP ${auth.status}`);
  const { access_token } = await auth.json();
  const res = await fetch(`${CMS}${path}`, {
    method,
    headers: { authorization: `Bearer ${access_token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function graphHeading() {
  const query = `{ ArticlePage(locale: ${LOCALE}, where: { _metadata: { key: { eq: "${KEY}" } } }) { items { heading } } }`;
  const res = await fetch(GRAPH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `epi-single ${env.OPTIMIZELY_GRAPH_SINGLE_KEY}` },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  return json.data?.ArticlePage?.items?.[0]?.heading;
}

async function page() {
  const res = await fetch(`${BASE}${ARTICLE}`);
  return { cache: res.headers.get('x-astro-cache'), html: await res.text() };
}

console.log('== 7. A publish reaches the next request (real CMS publish, real Graph sync)');
try {
  const { items } = await cms('GET', `/content/${KEY}/versions`);
  const published = items.find((v) => v.status === 'published' && v.locale === LOCALE);
  const current = await cms('GET', `/content/${KEY}/versions/${published.version}`);
  await page();
  const heading = `Published heading v${Date.now()}`;
  await cms('POST', `/content/${KEY}/versions`, {
    displayName: current.displayName,
    locale: LOCALE,
    routeSegment: current.routeSegment,
    properties: { ...current.properties, heading: { value: heading } },
  });
  await new Promise((r) => setTimeout(r, 3000));
  const { items: after } = await cms('GET', `/content/${KEY}/versions`);
  const draft = after.filter((v) => v.status === 'draft' && v.locale === LOCALE).sort((a, b) => Number(b.version) - Number(a.version))[0];
  const tPublish = Date.now();
  await cms('POST', `/content/${KEY}/versions/${draft.version}:publish`, {});
  let synced = null;
  for (let i = 0; i < 120 && synced === null; i++) {
    if ((await graphHeading()) === heading) synced = Date.now() - tPublish;
    else await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(synced === null ? '      Graph did not serve the new version within 120 s' : `      published version ${draft.version}; Graph (single key) served it after ${(synced / 1000).toFixed(1)} s (polled once a second)`);
  const before = await page();
  const t0 = Date.now();
  const hook = await fetch(`${BASE}/hooks/graph`, {
    method: 'POST',
    headers: { 'x-api-key': env.OPTIMIZELY_GRAPH_CALLBACK_APIKEY ?? '', 'content-type': 'text/plain' },
    body: JSON.stringify({ data: { docId: `${KEY}_${LOCALE}_Published` } }),
  });
  const hookBody = await hook.text();
  const next = await page();
  const ms = Date.now() - t0;
  result(
    synced !== null && before.cache === 'HIT' && !before.html.includes(heading) && hookBody.includes(`"path":"${ARTICLE}"`) && next.cache === 'MISS' && next.html.includes(heading),
    `7 cached old heading -> webhook (${hook.status}) -> MISS -> new heading, webhook + fresh render in ${ms} ms`,
    `before=${before.cache}/${before.html.includes(heading) ? 'new' : 'old'} hook=${hookBody.slice(0, 120)} after=${next.cache}/${next.html.includes(heading) ? 'new' : 'old'}`,
  );
} catch (e) {
  result(false, '7 publish', e.message);
}

console.log('== 8. No secrets in the client bundle');
const secrets = Object.entries(env).filter(([name, value]) => /^OPTIMIZELY_.*(KEY|SECRET)/.test(name) && value && value.length >= 8);
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
const found = new Set();
for (const file of files('dist/client')) {
  const data = readFileSync(file);
  for (const [name, value] of secrets) if (data.includes(value)) found.add(name);
}
result(found.size === 0, `8 none of ${secrets.length} secret values (${secrets.map(([n]) => n).sort().join(', ')}) appears in dist/client`, `found: ${[...found].join(', ')}`);

console.log('-----');
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
