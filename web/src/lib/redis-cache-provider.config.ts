import type { CacheProviderConfig } from 'astro';

export function redisCache(): CacheProviderConfig {
  return { entrypoint: './src/lib/redis-cache-provider.ts', config: {} };
}
