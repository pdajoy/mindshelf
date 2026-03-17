import { apiUrl } from './utils';
import type { TabRecord, AIModel, ExportTarget, ExportDepth, DuplicateGroupResult } from './types';

async function fetchJSON<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface SSEMessage {
  type: string;
  [key: string]: unknown;
}

export async function* fetchSSE(
  path: string,
  body?: Record<string, unknown>,
): AsyncGenerator<SSEMessage> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw new Error(`SSE error: ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop()!;

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6);
          if (payload === '[DONE]') return;
          try {
            yield JSON.parse(payload) as SSEMessage;
          } catch {}
        }
      }
    }
  }
}

export const api = {
  health: () => fetchJSON<{ status: string; version: string; name: string }>('/api/health'),

  tabs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchJSON<{ tabs: TabRecord[]; total: number }>(`/api/tabs${qs}`);
    },
    get: (id: string) => fetchJSON<TabRecord>(`/api/tabs/${id}`),
    sync: (tabs: Array<{
      url: string; title: string; favIconUrl?: string; tabId?: number; windowId?: number;
      topic?: string | null; tags?: string; ai_summary?: string | null; user_score?: number | null;
    }>) =>
      fetchJSON<{ created: number; updated: number; total: number }>('/api/tabs/sync', {
        method: 'POST',
        body: JSON.stringify({ tabs }),
      }),
    update: (id: string, fields: Partial<TabRecord>) =>
      fetchJSON<TabRecord>(`/api/tabs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      }),
    delete: (id: string) =>
      fetchJSON<{ success: boolean }>(`/api/tabs/${id}`, { method: 'DELETE' }),
    batchStatus: (ids: string[], status: string) =>
      fetchJSON<{ updated: number }>('/api/tabs/batch/status', {
        method: 'POST',
        body: JSON.stringify({ ids, status }),
      }),
  },

  ai: {
    models: () => fetchJSON<AIModel[]>('/api/ai/models'),
    categories: () => fetchJSON<Record<string, { name: string; icon: string; color: string }>>('/api/ai/categories'),
  },

  stats: () => fetchJSON<{
    total: number; active: number; processed: number; exported: number; closed: number;
    topDomains: Array<{ domain: string; count: number }>;
    topTopics: Array<{ topic: string; count: number }>;
  }>('/api/stats'),

  content: {
    extract: (opts: { html: string; url: string; extractor?: string }) =>
      fetchJSON<{
        title: string; markdown: string; html: string; plainText: string;
        excerpt: string; wordCount: number; extractor: string;
      }>('/api/content/extract', {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
  },

  export: {
    targets: () => fetchJSON<{
      apple_notes: { available: boolean; error?: string };
      obsidian: { available: boolean; error?: string };
    }>('/api/export/targets'),

    appleNotesFolders: () => fetchJSON<{
      folders: Array<{ id: string; name: string }>;
    }>('/api/export/folders/apple-notes'),

    obsidianFolders: () => fetchJSON<{
      folders: string[];
    }>('/api/export/folders/obsidian'),

    single: (tabId: string, opts: {
      target: ExportTarget;
      depth: ExportDepth;
      folder?: string;
      model?: string;
      editedContent?: string;
      extractor?: string;
      imageUrls?: string[];
    }) => fetchJSON<{
      success: boolean; logId: string; targetId?: string; targetPath?: string; error?: string;
    }>('/api/export/single', {
      method: 'POST',
      body: JSON.stringify({ tabId, ...opts }),
    }),

    validate: (tabId: string, target: ExportTarget) =>
      fetchJSON<{ valid: boolean; issues: string[] }>('/api/export/validate', {
        method: 'POST',
        body: JSON.stringify({ tabId, target }),
      }),

    score: (tabId: string, score: number) =>
      fetchJSON<{ success: boolean }>('/api/export/score', {
        method: 'POST',
        body: JSON.stringify({ tabId, score }),
      }),
  },

  duplicates: {
    detect: () => fetchJSON<{
      groups: DuplicateGroupResult[];
      totalGroups: number;
    }>('/api/duplicates/detect'),
  },
};
