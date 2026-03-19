import { create } from 'zustand';
import type { TabRecord, TabFilter, SortField, SortDirection, SyncedTab, DuplicateGroupResult } from '@/lib/types';
import { getAllEnrichments, batchSaveEnrichments, pruneExpired } from '@/lib/enrichment-cache';
import { computeCanonicalUrl, formatDomain } from '@/lib/utils';

interface TabState {
  tabs: TabRecord[];
  selectedIds: Set<string>;
  filter: TabFilter;
  topicFilter: string | null;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
  isScanning: boolean;
  error: string | null;
  duplicateGroups: DuplicateGroupResult[];

  syncTabs: (chromeTabs: SyncedTab[]) => Promise<void>;
  fetchTabs: () => Promise<void>;
  setFilter: (filter: TabFilter) => void;
  setTopicFilter: (topic: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSort: (field: SortField, direction?: SortDirection) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  updateTab: (id: string, updates: Partial<TabRecord>) => void;
  removeTab: (id: string) => void;
  setDuplicateGroups: (groups: DuplicateGroupResult[]) => void;
}

function applyFilters(
  tabs: TabRecord[],
  filter: TabFilter,
  topicFilter: string | null,
  searchQuery: string,
  sortField: SortField,
  sortDirection: SortDirection,
): TabRecord[] {
  let filtered = [...tabs];

  if (filter === 'processed') filtered = filtered.filter((t) => t.topic !== null);
  else if (filter === 'unprocessed') filtered = filtered.filter((t) => t.topic === null);

  if (topicFilter) filtered = filtered.filter((t) => t.topic === topicFilter);

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.domain.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'domain':
        cmp = a.domain.localeCompare(b.domain);
        break;
      case 'scanned_at':
        cmp = new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime();
        break;
      case 'topic':
        cmp = (a.topic || 'zzz').localeCompare(b.topic || 'zzz');
        break;
      case 'user_score':
        cmp = (a.user_score || 0) - (b.user_score || 0);
        break;
    }
    return sortDirection === 'desc' ? -cmp : cmp;
  });

  return filtered;
}

function buildLocalTabRecords(
  chromeTabs: SyncedTab[],
  enrichments: Record<string, any>,
): TabRecord[] {
  const seen = new Map<string, TabRecord>();

  for (const t of chromeTabs) {
    const canonical = computeCanonicalUrl(t.url);
    const domain = formatDomain(t.url);
    const cached = enrichments[canonical];

    if (seen.has(canonical)) {
      const existing = seen.get(canonical)!;
      existing.source_tab_id = t.tabId;
      existing.source_window_id = t.windowId;
      if (t.title !== 'Untitled') existing.title = t.title;
      if (t.favIconUrl) existing.favicon_url = t.favIconUrl;
      continue;
    }

    const record: TabRecord = {
      id: canonical,
      url: t.url,
      canonical_url: canonical,
      title: t.title,
      domain,
      favicon_url: t.favIconUrl || '',
      topic: cached?.topic ?? null,
      tags: cached?.tags ?? [],
      user_score: cached?.user_score ?? null,
      status: 'active',
      content_text: null,
      language: null,
      word_count: null,
      source_tab_id: t.tabId,
      source_window_id: t.windowId,
      scanned_at: new Date().toISOString(),
      processed_at: cached?.topic ? new Date().toISOString() : null,
      closed_at: null,
      created_at: new Date().toISOString(),
    };

    seen.set(canonical, record);
  }

  return Array.from(seen.values());
}

function syncTabsToStorage(tabs: TabRecord[]): void {
  const lightweight = tabs.map(t => ({
    id: t.id,
    tabId: t.source_tab_id,
    title: t.title,
    url: t.url,
    domain: t.domain,
    topic: t.topic,
    tags: t.tags,
    userScore: t.user_score,
  }));
  chrome.storage.local.set({ tabs: lightweight }).catch(() => {});
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  selectedIds: new Set(),
  filter: 'all',
  topicFilter: null,
  searchQuery: '',
  sortField: 'scanned_at',
  sortDirection: 'desc',
  isScanning: false,
  error: null,
  duplicateGroups: [],

  syncTabs: async (chromeTabs) => {
    set({ isScanning: true, error: null });
    try {
      pruneExpired().catch(() => {});
      const enrichments = await getAllEnrichments();
      const tabs = buildLocalTabRecords(chromeTabs, enrichments);
      set({ tabs, isScanning: false });
      syncTabsToStorage(tabs);
    } catch (e) {
      set({ error: (e as Error).message, isScanning: false });
    }
  },

  fetchTabs: async () => {
    /* tabs are in-memory from syncTabs; no backend fetch needed */
  },

  setFilter: (filter) => set({ filter }),
  setTopicFilter: (topic) => set({ topicFilter: topic }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSort: (field, direction) => {
    const state = get();
    const dir = direction || (state.sortField === field && state.sortDirection === 'asc' ? 'desc' : 'asc');
    set({ sortField: field, sortDirection: dir });
  },

  toggleSelect: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },

  selectAll: () => {
    const state = get();
    const visible = applyFilters(
      state.tabs, state.filter, state.topicFilter,
      state.searchQuery, state.sortField, state.sortDirection,
    );
    set({ selectedIds: new Set(visible.map((t) => t.id)) });
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  updateTab: (id, updates) => {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    });
    const tab = get().tabs.find(t => t.id === id);
    if (tab && (updates.topic !== undefined || updates.user_score !== undefined || updates.tags !== undefined)) {
      batchSaveEnrichments([{
        url: tab.url,
        topic: tab.topic,
        tags: tab.tags,
        user_score: tab.user_score,
      }]).catch(() => {});
    }
    syncTabsToStorage(get().tabs);
  },

  removeTab: (id) => {
    const next = new Set(get().selectedIds);
    next.delete(id);
    const tabs = get().tabs.filter((t) => t.id !== id);
    set({ tabs, selectedIds: next });
    syncTabsToStorage(tabs);
  },

  setDuplicateGroups: (groups) => set({ duplicateGroups: groups }),
}));

export function useFilteredTabs(): TabRecord[] {
  const { tabs, filter, topicFilter, searchQuery, sortField, sortDirection } = useTabStore();
  return applyFilters(tabs, filter, topicFilter, searchQuery, sortField, sortDirection);
}

export function useTopics(): { topic: string; count: number }[] {
  const tabs = useTabStore((s) => s.tabs);
  const counts: Record<string, number> = {};
  for (const t of tabs) {
    if (t.topic) counts[t.topic] = (counts[t.topic] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}
