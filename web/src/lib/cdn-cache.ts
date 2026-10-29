import { ManagedIdentityCredential } from '@azure/identity';

const API_URL = process.env.OPTIMIZELY_CLOUDPLATFORM_API_URL ?? '';
const API_RESOURCE_ID = process.env.OPTIMIZELY_CLOUDPLATFORM_API_RESOURCE_ID ?? '';
let token: { value: string; expiresAt: number } | null = null;

export async function purgeCdnCache(urls: string[]): Promise<void> {
  if (!API_URL || !API_RESOURCE_ID || urls.length === 0) return;
  if (!token || token.expiresAt < Date.now() + 60_000) {
    const t = await new ManagedIdentityCredential({ clientId: process.env.AZURE_CLIENT_ID }).getToken(`${API_RESOURCE_ID}/.default`);
    token = { value: t.token, expiresAt: t.expiresOnTimestamp };
  }
  const res = await fetch(`${API_URL}/v1/edge-cache/purge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error(`CDN purge failed ${res.status}: ${await res.text()}`);
}
