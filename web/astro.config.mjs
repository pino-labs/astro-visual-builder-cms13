import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import mkcert from 'vite-plugin-mkcert';
import { redisCache } from './src/lib/redis-cache-provider.config.ts';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), svelte()],
  vite: { plugins: [mkcert()] },
  server: { port: 3001 },

  env: {
    schema: {
      OPTIMIZELY_GRAPH_SINGLE_KEY: envField.string({ context: 'server', access: 'secret' }),
      OPTIMIZELY_GRAPH_GATEWAY: envField.string({ context: 'server', access: 'secret', optional: true }),
      OPTIMIZELY_CMS_URL: envField.string({ context: 'server', access: 'secret' }),
      OPTIMIZELY_GRAPH_CALLBACK_APIKEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      OPTIMIZELY_SITE_HOSTNAME: envField.string({ context: 'server', access: 'secret', optional: true }),
      OPTIMIZELY_APPLICATION_HOST: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },

  cache: { provider: redisCache() },
  routeRules: {
    '/[...slug]': { maxAge: 600, swr: 1800 },
  },
});
