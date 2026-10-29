import { OPTIMIZELY_CMS_URL } from 'astro:env/server';

const MEDIA_PATH = /^\/(globalassets|siteassets|contentassets)\//i;

export function absolutizeMedia<T>(content: T): T {
  const origin = new URL(OPTIMIZELY_CMS_URL).origin;
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if ((key === 'url' || key === 'default') && typeof value === 'string' && MEDIA_PATH.test(value)) {
        record[key] = origin + value;
      } else if (key === 'json' && typeof value === 'string') {
        const parsed = parseRichText(value);
        if (parsed) {
          record[key] = parsed;
          visit(parsed);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(content);
  return content;
}

function parseRichText(value: string): object | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && (parsed as { type?: unknown }).type === 'richText' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
