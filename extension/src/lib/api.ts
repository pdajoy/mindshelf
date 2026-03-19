import { apiUrl } from './utils';
import type { ExportTarget } from './types';
import i18next from 'i18next';

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

export const api = {
  health: () => fetchJSON<{ status: string; version: string; name: string }>('/api/health'),

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

    single: (data: {
      title: string;
      url: string;
      domain?: string;
      topic?: string;
      tags?: string[];
      userScore?: number;
      content: string;
      target: ExportTarget;
      folder?: string;
    }) => fetchJSON<{
      success: boolean; logId: string; targetId?: string; targetPath?: string; error?: string;
    }>('/api/export/single', {
      method: 'POST',
      body: JSON.stringify({ ...data, locale: i18next.language }),
    }),
  },
};
