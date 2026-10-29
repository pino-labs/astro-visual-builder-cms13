import type { CacheProvider, CacheProviderFactory } from 'astro';
import { createCluster } from 'redis';
import { EntraIdCredentialsProviderFactory, DEFAULT_TOKEN_MANAGER_CONFIG, REDIS_SCOPE_DEFAULT } from '@redis/entraid';
import { ManagedIdentityCredential } from '@azure/identity';
import { isIP } from 'node:net';

const DEPLOYMENT_ID = process.env.OPTIMIZELY_DXP_DEPLOYMENT_ID ?? 'local';
const REDIS_URL = process.env.REDIS_URL;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const MARKER_TTL = 3600;
const RETRY_AFTER_MS = 30_000;

type Entry = { body: string; status: number; headers: Record<string, string>; storedAt: number };
type Redis = ReturnType<typeof createCluster>;
type RequestContext = Parameters<NonNullable<CacheProvider['onRequest']>>[0];

export function cacheKey(url: URL): string {
  return `astro:${DEPLOYMENT_ID}:${url.pathname.replace(/\/+$/, '') || '/'}`;
}
const markerKey = (key: string) => `${key}#invalidated`;

function ttl(headers: Record<string, string>) {
  const cc = headers['cdn-cache-control'] ?? '';
  return {
    maxAge: Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0),
    swr: Number(/stale-while-revalidate=(\d+)/.exec(cc)?.[1] ?? 0),
  };
}

function edgeCacheControl(freshFor: number, swr: number): string {
  return freshFor > 0
    ? `public, max-age=0, s-maxage=${freshFor}, stale-while-revalidate=${swr}`
    : 'public, max-age=0, s-maxage=0, must-revalidate';
}

class RedisCacheProvider implements CacheProvider {
  readonly name = 'redis-isr-cache';
  private client: Redis | null = null;
  private connecting: Promise<Redis | null> | null = null;
  private readonly local = new Map<string, string>();
  private readonly localExpiry = new Map<string, number>();
  private readonly refreshing = new Set<string>();
  private retryAt = 0;

  setHeaders({ maxAge = 0, swr = 0 }: { maxAge?: number; swr?: number }): Headers {
    const h = new Headers();
    if (maxAge > 0) {
      h.set('Cache-Control', edgeCacheControl(maxAge, swr));
      h.set('CDN-Cache-Control', `max-age=${maxAge}, stale-while-revalidate=${swr}`);
    }
    return h;
  }

  async onRequest(ctx: RequestContext, next: () => Promise<Response>): Promise<Response> {
    const { method } = ctx.request;
    if (method !== 'GET' && method !== 'HEAD') return next();
    const key = cacheKey(ctx.url);
    const hit = await this.read(key);
    if (hit) {
      const { maxAge, swr } = ttl(hit.headers);
      const age = Math.floor((Date.now() - hit.storedAt) / 1000);
      const stale = age >= maxAge;
      if (age < maxAge + swr) {
        if (stale && method === 'GET') this.refreshInBackground(ctx, key, next);
        const headers = new Headers(hit.headers);
        headers.delete('cdn-cache-control');
        headers.set('Cache-Control', edgeCacheControl(stale ? 0 : maxAge - age, swr));
        headers.set('Age', String(age));
        headers.set('X-Astro-Cache', stale ? 'STALE' : 'HIT');
        return new Response(method === 'HEAD' ? null : hit.body, { status: hit.status, headers });
      }
    }
    if (method === 'HEAD') return next();
    const startedAt = Date.now();
    const res = await next();
    const stored = await this.store(key, res, startedAt);
    if (!stored) return res;
    stored.headers.set('X-Astro-Cache', 'MISS');
    return stored;
  }

  async invalidate({ path }: { path?: string; tags?: string | string[] }): Promise<void> {
    if (!path) return;
    const key = cacheKey(new URL(path, 'http://x'));
    const redis = await this.redis();
    if (redis) {
      await redis.set(markerKey(key), String(Date.now()), { EX: MARKER_TTL });
      await redis.del(key);
    } else {
      this.local.set(markerKey(key), String(Date.now()));
      this.localExpiry.set(markerKey(key), Date.now() + MARKER_TTL * 1000);
      this.local.delete(key);
    }
  }

  private refreshInBackground(ctx: RequestContext, key: string, next: () => Promise<Response>) {
    if (this.refreshing.has(key)) return;
    this.refreshing.add(key);
    const startedAt = Date.now();
    const refresh = next()
      .then((fresh) => this.store(key, fresh, startedAt))
      .catch((e) => ctx.logger.warn(`refresh failed for ${key}: ${String(e)}`))
      .finally(() => this.refreshing.delete(key));
    ctx.waitUntil?.(refresh);
  }

  private async store(key: string, res: Response, startedAt: number): Promise<Response | null> {
    const type = res.headers.get('content-type') ?? '';
    if (res.status !== 200 || res.headers.has('set-cookie') || !type.includes('text/html')) return null;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    const { maxAge, swr } = ttl(headers);
    if (maxAge === 0) return null;
    const body = await res.text();
    const replay = new Headers(headers);
    replay.delete('cdn-cache-control');
    const response = new Response(body, { status: res.status, headers: replay });

    const invalidatedAt = Number(await this.get(markerKey(key)) ?? 0);
    if (invalidatedAt >= startedAt) return response;

    const entry: Entry = { body, status: res.status, headers, storedAt: Date.now() };
    await this.put(key, JSON.stringify(entry), maxAge + swr);
    return response;
  }

  private async read(key: string): Promise<Entry | null> {
    const raw = await this.get(key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  }

  private async get(key: string): Promise<string | null> {
    const redis = await this.redis();
    if (redis) return redis.get(key).catch(() => null);
    const expires = this.localExpiry.get(key) ?? 0;
    if (expires < Date.now()) { this.local.delete(key); this.localExpiry.delete(key); return null; }
    return this.local.get(key) ?? null;
  }

  private async put(key: string, value: string, seconds: number): Promise<void> {
    const redis = await this.redis();
    if (redis) {
      await redis.set(key, value, { EX: seconds }).catch((e: Error) => console.warn('[redis-cache] write failed:', e.message));
    } else {
      this.local.set(key, value);
      this.localExpiry.set(key, Date.now() + seconds * 1000);
    }
  }

  private redis(): Promise<Redis | null> {
    if (!REDIS_URL) return Promise.resolve(null);
    if (this.client) return Promise.resolve(this.client);
    if (Date.now() < this.retryAt) return Promise.resolve(null);
    this.connecting ??= this.connect();
    return this.connecting;
  }

  private async connect(): Promise<Redis | null> {
    try {
      const credentialsProvider = EntraIdCredentialsProviderFactory.createForDefaultAzureCredential({
        credential: new ManagedIdentityCredential({ clientId: AZURE_CLIENT_ID }),
        scopes: REDIS_SCOPE_DEFAULT,
        tokenManagerConfig: DEFAULT_TOKEN_MANAGER_CONFIG,
      });
      const [host, portStr] = REDIS_URL!.replace(/^rediss?:\/\//, '').split(':');
      const port = portStr ? Number(portStr) : 10000;
      const tls = REDIS_URL!.startsWith('rediss://') || /\.redis\.azure\.net$/i.test(host);
      const cluster = createCluster({
        rootNodes: [{ url: `${tls ? 'rediss' : 'redis'}://${host}:${port}` }],
        defaults: { socket: { tls, connectTimeout: 10_000 }, credentialsProvider },
        nodeAddressMap: (address: string) => {
          const [hostOrIp, nodePort] = address.split(':');
          return { host: isIP(hostOrIp) !== 0 ? host : hostOrIp, port: Number(nodePort) };
        },
      });
      cluster.on('error', (e: Error) => console.warn('[redis-cache] cluster error:', e.message));
      await cluster.connect();
      this.client = cluster;
      return cluster;
    } catch (e) {
      console.warn('[redis-cache] connection failed, using in-memory fallback (per process):', (e as Error).message);
      this.connecting = null;
      this.retryAt = Date.now() + RETRY_AFTER_MS;
      return null;
    }
  }
}

const provider = new RedisCacheProvider();
const factory: CacheProviderFactory = () => provider;
export default factory;
