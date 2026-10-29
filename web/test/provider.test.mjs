import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import factory, { cacheKey } from '../src/lib/redis-cache-provider.ts';

const provider = factory({});
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-28T10:00:00Z') });
const tick = (seconds) => mock.timers.tick(seconds * 1000);

async function get(path, render, { method = 'GET', waitUntil = true } = {}) {
  const pending = [];
  const url = new URL(path, 'http://site.test');
  const ctx = { request: new Request(url, { method }), url, logger: { warn() {} } };
  if (waitUntil) ctx.waitUntil = (p) => pending.push(p);
  const res = await provider.onRequest(ctx, render);
  await Promise.all(pending);
  return { res, body: await res.text(), cache: res.headers.get('x-astro-cache'), cc: res.headers.get('cache-control') };
}

function page(body, { maxAge = 600, swr = 1800, status = 200, extra = {} } = {}) {
  let calls = 0;
  const render = async () => {
    calls++;
    const headers = maxAge ? provider.setHeaders({ maxAge, swr }) : new Headers();
    headers.set('content-type', 'text/html');
    for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    return new Response(typeof body === 'function' ? body() : body, { status, headers });
  };
  render.calls = () => calls;
  return render;
}

test('MISS stores, HIT replays with the remaining freshness for the CDN', async () => {
  const render = page('<h1>v1</h1>');
  const first = await get('/a/', render);
  assert.equal(first.cache, 'MISS');
  assert.equal(first.cc, 'public, max-age=0, s-maxage=600, stale-while-revalidate=1800');
  assert.equal(first.res.headers.get('cdn-cache-control'), null);
  tick(100);
  const second = await get('/a', render);
  assert.equal(second.cache, 'HIT');
  assert.equal(second.body, '<h1>v1</h1>');
  assert.equal(second.cc, 'public, max-age=0, s-maxage=500, stale-while-revalidate=1800');
  assert.equal(second.res.headers.get('age'), '100');
  assert.equal(render.calls(), 1);
});

test('query strings neither create entries nor bypass the cache', async () => {
  const render = page('<h1>q</h1>');
  await get('/q/', render);
  const withQuery = await get('/q/?utm_source=x&bust=123', render);
  assert.equal(withQuery.cache, 'HIT');
  assert.equal(render.calls(), 1);
});

test('STALE serves the old copy once, refreshes in the background, never hands the CDN a stale copy as fresh', async () => {
  let version = 1;
  const render = page(() => `<h1>v${version}</h1>`);
  await get('/s/', render);
  version = 2;
  tick(601);
  const stale = await get('/s/', render);
  assert.equal(stale.cache, 'STALE');
  assert.equal(stale.body, '<h1>v1</h1>');
  assert.equal(stale.cc, 'public, max-age=0, s-maxage=0, must-revalidate');
  const fresh = await get('/s/', render);
  assert.equal(fresh.cache, 'HIT');
  assert.equal(fresh.body, '<h1>v2</h1>');
  assert.equal(render.calls(), 2);
});

test('past maxAge + swr the entry is gone and the page renders again', async () => {
  const render = page('<h1>e</h1>');
  await get('/e/', render);
  tick(600 + 1800 + 1);
  assert.equal((await get('/e/', render)).cache, 'MISS');
  assert.equal(render.calls(), 2);
});

test('invalidate() makes the next request render fresh', async () => {
  let version = 1;
  const render = page(() => `<h1>v${version}</h1>`);
  await get('/i/', render);
  version = 2;
  await provider.invalidate({ path: '/i/' });
  const after = await get('/i/', render);
  assert.equal(after.cache, 'MISS');
  assert.equal(after.body, '<h1>v2</h1>');
});

test('a render that started before an invalidation is served but not stored', async () => {
  let release, started;
  const gate = new Promise((r) => (release = r));
  const renderStarted = new Promise((r) => (started = r));
  const slow = page('<h1>pre-publish</h1>');
  const inFlight = get('/g/', async () => { started(); await gate; return slow(); });
  await renderStarted;
  tick(1);
  await provider.invalidate({ path: '/g/' });
  tick(1);
  release();
  assert.equal((await inFlight).body, '<h1>pre-publish</h1>');
  const next = page('<h1>post-publish</h1>');
  const after = await get('/g/', next);
  assert.equal(after.cache, 'MISS');
  assert.equal(after.body, '<h1>post-publish</h1>');
});

test('uncacheable responses pass through untouched and are not stored', async () => {
  const cases = [
    ['/n1/', page('<p>no ttl</p>', { maxAge: 0 })],
    ['/n2/', page('<p>not found</p>', { status: 404 })],
    ['/n3/', page('<p>session</p>', { extra: { 'set-cookie': 'sid=1' } })],
  ];
  for (const [path, render] of cases) {
    const first = await get(path, render);
    assert.equal(first.cache, null, `${path} must not carry X-Astro-Cache`);
    await get(path, render);
    assert.equal(render.calls(), 2, `${path} must not be stored`);
  }
});

test('the key is the pathname only, namespaced by deployment', () => {
  assert.equal(cacheKey(new URL('http://site.test/a/b/?utm_source=x')), 'astro:local:/a/b');
  assert.equal(cacheKey(new URL('http://site.test/')), 'astro:local:/');
});

test('the stale refresh runs on a host without waitUntil (@astrojs/node)', async () => {
  let version = 1;
  const render = page(() => `<h1>v${version}</h1>`);
  await get('/w/', render, { waitUntil: false });
  version = 2;
  tick(601);
  assert.equal((await get('/w/', render, { waitUntil: false })).cache, 'STALE');
  for (let i = 0; i < 20 && render.calls() < 2; i++) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const after = await get('/w/', render, { waitUntil: false });
  assert.equal(after.cache, 'HIT');
  assert.equal(after.body, '<h1>v2</h1>');
});

test('only GET fills the cache; HEAD is answered from it; POST never touches it', async () => {
  const render = page('<h1>m</h1>');
  const headFirst = await get('/m/', render, { method: 'HEAD' });
  assert.equal(headFirst.cache, null);
  await get('/m/', render);
  const head = await get('/m/', render, { method: 'HEAD' });
  assert.equal(head.cache, 'HIT');
  assert.equal(head.body, '');
  const post = await get('/m/', render, { method: 'POST' });
  assert.equal(post.cache, null);
  assert.equal(render.calls(), 3);
});
