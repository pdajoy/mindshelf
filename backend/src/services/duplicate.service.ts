/**
 * Duplicate detection — pure in-memory, works with the tab-repo Map.
 */

import { allActiveTabs, type TabRecordRow } from '../db/tab-repo.js';
import { randomUUID } from 'crypto';

export interface DuplicateGroup {
  id: string;
  canonicalUrl: string;
  tabs: Array<{ id: string; title: string; url: string; scannedAt: string }>;
  similarity: number;
  reason: string;
}

function toEntry(t: TabRecordRow) {
  return { id: t.id, title: t.title, url: t.url, scannedAt: t.scanned_at };
}

export function detectDuplicates(): DuplicateGroup[] {
  const active = allActiveTabs();
  const groups: DuplicateGroup[] = [];
  const seenIds = new Set<string>();

  // 1. Exact full URL
  const byUrl = new Map<string, TabRecordRow[]>();
  for (const t of active) {
    const list = byUrl.get(t.url) || [];
    list.push(t);
    byUrl.set(t.url, list);
  }
  for (const [url, tabs] of byUrl) {
    if (tabs.length < 2) continue;
    groups.push({
      id: randomUUID(),
      canonicalUrl: url,
      tabs: tabs.map(toEntry),
      similarity: 1.0,
      reason: 'exact_url',
    });
    tabs.forEach(t => seenIds.add(t.id));
  }

  // 2. Canonical URL
  const byCanonical = new Map<string, TabRecordRow[]>();
  for (const t of active) {
    if (seenIds.has(t.id)) continue;
    const list = byCanonical.get(t.canonical_url) || [];
    list.push(t);
    byCanonical.set(t.canonical_url, list);
  }
  for (const [canon, tabs] of byCanonical) {
    if (tabs.length < 2) continue;
    groups.push({
      id: randomUUID(),
      canonicalUrl: canon,
      tabs: tabs.map(toEntry),
      similarity: 0.95,
      reason: 'canonical_url',
    });
    tabs.forEach(t => seenIds.add(t.id));
  }

  // 3. Exact title
  const byTitle = new Map<string, TabRecordRow[]>();
  for (const t of active) {
    if (seenIds.has(t.id) || !t.title) continue;
    const list = byTitle.get(t.title) || [];
    list.push(t);
    byTitle.set(t.title, list);
  }
  for (const [, tabs] of byTitle) {
    if (tabs.length < 2) continue;
    groups.push({
      id: randomUUID(),
      canonicalUrl: tabs[0].url,
      tabs: tabs.map(toEntry),
      similarity: 0.9,
      reason: 'exact_title',
    });
    tabs.forEach(t => seenIds.add(t.id));
  }

  return groups;
}

function levenshteinRatio(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[la][lb] / Math.max(la, lb);
}

export function detectSimilarTitles(threshold = 0.75): DuplicateGroup[] {
  const active = allActiveTabs().filter(t => t.title);
  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    if (used.has(active[i].id)) continue;
    const cluster = [active[i]];
    for (let j = i + 1; j < active.length; j++) {
      if (used.has(active[j].id)) continue;
      const sim = levenshteinRatio(active[i].title.toLowerCase(), active[j].title.toLowerCase());
      if (sim >= threshold) {
        cluster.push(active[j]);
        used.add(active[j].id);
      }
    }
    if (cluster.length > 1) {
      used.add(active[i].id);
      groups.push({
        id: randomUUID(),
        canonicalUrl: cluster[0].url,
        tabs: cluster.map(toEntry),
        similarity: threshold,
        reason: 'similar_title',
      });
    }
  }

  return groups;
}
