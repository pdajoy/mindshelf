/**
 * Tab repository — in-memory Map<id, TabRecordRow>.
 * Replaces the previous SQLite-backed implementation.
 */

import { getStore } from './index.js';
import { randomUUID } from 'crypto';

export interface TabRecordRow {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  domain: string;
  favicon_url: string;
  topic: string | null;
  tags: string; // JSON array string
  ai_summary: string | null;
  ai_detailed_summary: string | null;
  status: string;
  user_score: number | null;
  content_text: string | null;
  content_html: string | null;
  language: string | null;
  word_count: number | null;
  source_tab_id: number | null;
  source_window_id: number | null;
  scanned_at: string;
  processed_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export function canonicalize(url: string): string {
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

export interface SyncTabInput {
  url: string;
  title: string;
  favIconUrl?: string;
  tabId?: number;
  windowId?: number;
  // Enrichments from chrome.storage.local
  topic?: string | null;
  tags?: string;
  ai_summary?: string | null;
  user_score?: number | null;
}

export function syncTabs(tabs: SyncTabInput[]): { created: number; updated: number; total: number } {
  const store = getStore();
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  const incomingCanonicals = new Set<string>();

  for (const tab of tabs) {
    const canonical = canonicalize(tab.url);
    incomingCanonicals.add(canonical);
    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}

    let existing: TabRecordRow | undefined;
    for (const rec of store.values()) {
      if (rec.canonical_url === canonical) { existing = rec; break; }
    }

    if (existing) {
      existing.title = tab.title;
      existing.favicon_url = tab.favIconUrl || '';
      existing.source_tab_id = tab.tabId ?? null;
      existing.source_window_id = tab.windowId ?? null;
      existing.status = 'active';
      existing.scanned_at = now;
      // Restore enrichments from frontend cache if missing locally
      if (tab.topic !== undefined && !existing.topic) existing.topic = tab.topic ?? null;
      if (tab.tags && existing.tags === '[]') existing.tags = tab.tags;
      if (tab.ai_summary && !existing.ai_summary) existing.ai_summary = tab.ai_summary ?? null;
      if (tab.user_score !== undefined && !existing.user_score) existing.user_score = tab.user_score ?? null;
      updated++;
    } else {
      const id = randomUUID();
      store.set(id, {
        id,
        url: tab.url,
        canonical_url: canonical,
        title: tab.title,
        domain,
        favicon_url: tab.favIconUrl || '',
        topic: tab.topic ?? null,
        tags: tab.tags || '[]',
        ai_summary: tab.ai_summary ?? null,
        ai_detailed_summary: null,
        status: 'active',
        user_score: tab.user_score ?? null,
        content_text: null,
        content_html: null,
        language: null,
        word_count: null,
        source_tab_id: tab.tabId ?? null,
        source_window_id: tab.windowId ?? null,
        scanned_at: now,
        processed_at: tab.topic ? now : null,
        closed_at: null,
        created_at: now,
      });
      created++;
    }
  }

  // Mark tabs not in current sync set as closed
  for (const rec of store.values()) {
    if (rec.status === 'active' && !incomingCanonicals.has(rec.canonical_url)) {
      rec.status = 'closed';
      rec.closed_at = now;
    }
  }

  // Prune closed tabs older than 1 hour to keep memory lean
  const cutoff = Date.now() - 3600_000;
  for (const [id, rec] of store.entries()) {
    if (rec.status === 'closed' && rec.closed_at && new Date(rec.closed_at).getTime() < cutoff) {
      store.delete(id);
    }
  }

  const total = [...store.values()].filter(r => r.status === 'active').length;
  return { created, updated, total };
}

export interface ListTabsOptions {
  status?: string;
  topic?: string;
  search?: string;
  domain?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export function listTabs(opts: ListTabsOptions = {}): { tabs: TabRecordRow[]; total: number } {
  let tabs = [...getStore().values()];

  const status = opts.status || 'active';
  tabs = tabs.filter(t => t.status === status);

  if (opts.topic) tabs = tabs.filter(t => t.topic === opts.topic);
  if (opts.domain) tabs = tabs.filter(t => t.domain === opts.domain);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    tabs = tabs.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.url.toLowerCase().includes(q) ||
      t.domain.toLowerCase().includes(q)
    );
  }

  const sort = opts.sort || 'scanned_at';
  const dir = opts.order === 'asc' ? 1 : -1;
  tabs.sort((a, b) => {
    const av = (a as any)[sort] ?? '';
    const bv = (b as any)[sort] ?? '';
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const total = tabs.length;
  const offset = opts.offset || 0;
  const limit = opts.limit || 2000;
  tabs = tabs.slice(offset, offset + limit);

  return { tabs, total };
}

export function getTabById(id: string): TabRecordRow | null {
  return getStore().get(id) ?? null;
}

export function updateTab(id: string, fields: Partial<TabRecordRow>): TabRecordRow | null {
  const rec = getStore().get(id);
  if (!rec) return null;
  for (const [key, value] of Object.entries(fields)) {
    if (key !== 'id') (rec as any)[key] = value;
  }
  return rec;
}

export function deleteTab(id: string): boolean {
  return getStore().delete(id);
}

export function batchUpdateStatus(ids: string[], status: string): number {
  const store = getStore();
  let count = 0;
  for (const id of ids) {
    const rec = store.get(id);
    if (rec) { rec.status = status; count++; }
  }
  return count;
}

export function getStats() {
  const all = [...getStore().values()];
  const total = all.length;
  const active = all.filter(r => r.status === 'active').length;
  const processed = all.filter(r => r.processed_at !== null).length;
  const closed = all.filter(r => r.status === 'closed').length;

  const domainCounts: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  for (const r of all) {
    if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
    if (r.topic) topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1;
  }

  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return { total, active, processed, exported: 0, closed, topDomains, topTopics };
}

/** Utility: get all active tabs as an array */
export function allActiveTabs(): TabRecordRow[] {
  return [...getStore().values()].filter(r => r.status === 'active');
}
