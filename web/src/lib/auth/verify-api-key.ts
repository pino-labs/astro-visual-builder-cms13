import { timingSafeEqual } from 'node:crypto';

export function verifyApiKey(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
