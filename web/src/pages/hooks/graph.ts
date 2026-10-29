import type { APIRoute } from 'astro';
import { OPTIMIZELY_GRAPH_CALLBACK_APIKEY, OPTIMIZELY_SITE_HOSTNAME } from 'astro:env/server';
import { verifyApiKey } from '@/lib/auth/verify-api-key';
import { purgeCdnCache } from '@/lib/cdn-cache';
import { RESOLVE_DOC_PATH } from '@/lib/graph-queries';
import { initOptimizely, getClient } from '@/lib/optimizely';

export const prerender = false;

function parseDocId(docId: string) {
  const parts = docId.split('_');
  if (parts.length < 3) return null;
  return {
    key: parts[0].replace(/-/g, ''),
    locale: parts.slice(1, -1).join('_'),
    status: parts[parts.length - 1],
  };
}

export const POST: APIRoute = async (context) => {
  if (context.cache?.enabled) context.cache.set(false);
  const { request } = context;
  if (!verifyApiKey(request.headers.get('x-api-key'), OPTIMIZELY_GRAPH_CALLBACK_APIKEY)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let docId: unknown;
  try {
    docId = JSON.parse(await request.text())?.data?.docId;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const doc = typeof docId === 'string' ? parseDocId(docId) : null;
  if (!doc) return new Response('Bad Request', { status: 400 });
  if (doc.status !== 'Published') return Response.json({ ok: true, path: null }, { status: 202 });

  initOptimizely();
  const result: any = await getClient().request(
    RESOLVE_DOC_PATH,
    { key: doc.key, locale: [doc.locale.replace(/-/g, '_')] },
    undefined,
    false,
  );
  const path: string | undefined = result?._Content?.items?.[0]?._metadata?.url?.default;
  if (!path) return Response.json({ ok: true, path: null }, { status: 202 });

  const paths = [...new Set([path, '/'])];
  try {
    await Promise.all(paths.map((p) => context.cache.invalidate({ path: p })));
  } catch (e) {
    console.error('[graph-webhook] origin invalidation failed', e);
    return new Response('Origin invalidation failed', { status: 500 });
  }

  const site = OPTIMIZELY_SITE_HOSTNAME
    ? (/^https?:\/\//.test(OPTIMIZELY_SITE_HOSTNAME) ? OPTIMIZELY_SITE_HOSTNAME : `https://${OPTIMIZELY_SITE_HOSTNAME}`)
    : undefined;
  if (site) {
    const urls = paths.flatMap((p) => [p, p.replace(/\/+$/, '') || '/', p.endsWith('/') ? p : `${p}/`]);
    try {
      await purgeCdnCache([...new Set(urls)].map((p) => `${site}${p}`));
    } catch (e) {
      console.error('[graph-webhook] CDN purge failed', e);
      return Response.json({ ok: false, path, error: 'CDN purge failed' }, { status: 502 });
    }
  }

  return Response.json({ ok: true, path });
};
