/**
 * Enrichment cache — persists AI-generated and user-set metadata
 * in chrome.storage.local, keyed by canonical URL.
 * Includes TTL-based expiration.
 */

const CACHE_KEY = 'mindshelf_enrichments';
const DEFAULT_TTL_DAYS = 60;

export interface EnrichmentEntry {
  topic?: string | null;
  tags?: string[];
  ai_summary?: string | null;
  user_score?: number | null;
  updatedAt: number; // epoch ms
}

type EnrichmentStore = Record<string, EnrichmentEntry>;

function canonicalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref']) {
      u.searchParams.delete(p);
    }
    return u.href.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

async function loadStore(): Promise<EnrichmentStore> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    return (result[CACHE_KEY] as EnrichmentStore) || {};
  } catch {
    return {};
  }
}

async function saveStore(store: EnrichmentStore): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: store });
}

/** Save enrichment for a tab URL */
export async function saveEnrichment(url: string, data: Partial<Omit<EnrichmentEntry, 'updatedAt'>>): Promise<void> {
  const store = await loadStore();
  const key = canonicalize(url);
  const existing = store[key] || { updatedAt: 0 };
  store[key] = {
    ...existing,
    ...data,
    updatedAt: Date.now(),
  };
  await saveStore(store);
}

/** Batch save enrichments (after classify/sync) */
export async function batchSaveEnrichments(
  entries: Array<{ url: string; topic?: string | null; tags?: string[]; ai_summary?: string | null; user_score?: number | null }>
): Promise<void> {
  const store = await loadStore();
  for (const entry of entries) {
    const key = canonicalize(entry.url);
    const existing = store[key] || { updatedAt: 0 };
    store[key] = {
      topic: entry.topic ?? existing.topic,
      tags: entry.tags ?? existing.tags,
      ai_summary: entry.ai_summary ?? existing.ai_summary,
      user_score: entry.user_score ?? existing.user_score,
      updatedAt: Date.now(),
    };
  }
  await saveStore(store);
}

/** Get enrichment for a single URL */
export async function getEnrichment(url: string): Promise<EnrichmentEntry | null> {
  const store = await loadStore();
  return store[canonicalize(url)] || null;
}

/** Get all enrichments as a map (canonical_url → entry) */
export async function getAllEnrichments(): Promise<EnrichmentStore> {
  return loadStore();
}

/** Prune expired entries (older than ttlDays) */
export async function pruneExpired(ttlDays: number = DEFAULT_TTL_DAYS): Promise<number> {
  const store = await loadStore();
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const [key, entry] of Object.entries(store)) {
    if (entry.updatedAt < cutoff) {
      delete store[key];
      pruned++;
    }
  }
  if (pruned > 0) await saveStore(store);
  return pruned;
}

/** Clear all cached enrichments */
export async function clearAllEnrichments(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
