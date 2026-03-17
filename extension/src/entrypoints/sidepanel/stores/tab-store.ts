import { create } from 'zustand';
import type { TabRecord, TabFilter, SortField, SortDirection, SyncedTab, DuplicateGroupResult } from '@/lib/types';
import { api } from '@/lib/api';
import { getAllEnrichments, batchSaveEnrichments, pruneExpired } from '@/lib/enrichment-cache';

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
        (t.ai_summary && t.ai_summary.toLowerCase().includes(q)) ||
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
      // Prune expired enrichments on each sync
      pruneExpired().catch(() => {});
      // Load persisted enrichments
      const enrichments = await getAllEnrichments();

      const syncPayload = chromeTabs.map((t) => {
        let canonical = t.url;
        try {
          const u = new URL(t.url);
          u.hash = '';
          for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref']) {
            u.searchParams.delete(p);
          }
          canonical = u.href.replace(/\/+$/, '');
        } catch {}
        const cached = enrichments[canonical];
        return {
          url: t.url,
          title: t.title,
          favIconUrl: t.favIconUrl,
          tabId: t.tabId,
          windowId: t.windowId,
          // Send persisted enrichments so backend can restore them
          topic: cached?.topic ?? undefined,
          tags: cached?.tags ? JSON.stringify(cached.tags) : undefined,
          ai_summary: cached?.ai_summary ?? undefined,
          user_score: cached?.user_score ?? undefined,
        };
      });
      await api.tabs.sync(syncPayload);
      const { tabs } = await api.tabs.list();
      const parsed = tabs.map((t) => ({
        ...t,
        tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags || [],
      }));

      // Write back any new enrichments from backend to cache
      const toSave = parsed
        .filter(t => t.topic || t.ai_summary || t.user_score)
        .map(t => ({
          url: t.url,
          topic: t.topic,
          tags: t.tags,
          ai_summary: t.ai_summary,
          user_score: t.user_score,
        }));
      if (toSave.length) batchSaveEnrichments(toSave).catch(() => {});

      set({ tabs: parsed, isScanning: false });
    } catch (e) {
      set({ error: (e as Error).message, isScanning: false });
    }
  },

  fetchTabs: async () => {
    try {
      const { tabs } = await api.tabs.list();
      const parsed = tabs.map((t) => ({
        ...t,
        tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags || [],
      }));
      // Persist enrichments
      const toSave = parsed
        .filter(t => t.topic || t.ai_summary || t.user_score)
        .map(t => ({ url: t.url, topic: t.topic, tags: t.tags, ai_summary: t.ai_summary, user_score: t.user_score }));
      if (toSave.length) batchSaveEnrichments(toSave).catch(() => {});
      set({ tabs: parsed });
    } catch (e) {
      set({ error: (e as Error).message });
    }
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
      state.tabs,
      state.filter,
      state.topicFilter,
      state.searchQuery,
      state.sortField,
      state.sortDirection,
    );
    set({ selectedIds: new Set(visible.map((t) => t.id)) });
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  updateTab: (id, updates) => {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    });
  },

  removeTab: (id) => {
    const next = new Set(get().selectedIds);
    next.delete(id);
    set({
      tabs: get().tabs.filter((t) => t.id !== id),
      selectedIds: next,
    });
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
