import type { TabRecord, DuplicateGroupResult } from './types';

export function detectDuplicates(tabs: TabRecord[]): DuplicateGroupResult[] {
  const active = tabs.filter(t => t.status === 'active');
  const groups: DuplicateGroupResult[] = [];
  const seenIds = new Set<string>();

  // 1. Exact full URL
  const byUrl = new Map<string, TabRecord[]>();
  for (const t of active) {
    const list = byUrl.get(t.url) || [];
    list.push(t);
    byUrl.set(t.url, list);
  }
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    groups.push({
      id: crypto.randomUUID(),
      canonicalUrl: url,
      tabs: list.map(toEntry),
      similarity: 1.0,
      reason: 'exact_url',
    });
    list.forEach(t => seenIds.add(t.id));
  }

  // 2. Canonical URL
  const byCanonical = new Map<string, TabRecord[]>();
  for (const t of active) {
    if (seenIds.has(t.id)) continue;
    const list = byCanonical.get(t.canonical_url) || [];
    list.push(t);
    byCanonical.set(t.canonical_url, list);
  }
  for (const [canon, list] of byCanonical) {
    if (list.length < 2) continue;
    groups.push({
      id: crypto.randomUUID(),
      canonicalUrl: canon,
      tabs: list.map(toEntry),
      similarity: 0.95,
      reason: 'canonical_url',
    });
    list.forEach(t => seenIds.add(t.id));
  }

  // 3. Exact title
  const byTitle = new Map<string, TabRecord[]>();
  for (const t of active) {
    if (seenIds.has(t.id) || !t.title) continue;
    const list = byTitle.get(t.title) || [];
    list.push(t);
    byTitle.set(t.title, list);
  }
  for (const [, list] of byTitle) {
    if (list.length < 2) continue;
    groups.push({
      id: crypto.randomUUID(),
      canonicalUrl: list[0].url,
      tabs: list.map(toEntry),
      similarity: 0.9,
      reason: 'exact_title',
    });
    list.forEach(t => seenIds.add(t.id));
  }

  // 4. Similar title (Levenshtein)
  const remaining = active.filter(t => !seenIds.has(t.id) && t.title);
  const used = new Set<string>();
  for (let i = 0; i < remaining.length; i++) {
    if (used.has(remaining[i].id)) continue;
    const cluster = [remaining[i]];
    for (let j = i + 1; j < remaining.length; j++) {
      if (used.has(remaining[j].id)) continue;
      const sim = levenshteinRatio(remaining[i].title.toLowerCase(), remaining[j].title.toLowerCase());
      if (sim >= 0.75) {
        cluster.push(remaining[j]);
        used.add(remaining[j].id);
      }
    }
    if (cluster.length > 1) {
      used.add(remaining[i].id);
      groups.push({
        id: crypto.randomUUID(),
        canonicalUrl: cluster[0].url,
        tabs: cluster.map(toEntry),
        similarity: 0.75,
        reason: 'similar_title',
      });
    }
  }

  return groups;
}

function toEntry(t: TabRecord) {
  return { id: t.id, title: t.title, url: t.url, scannedAt: t.scanned_at };
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
