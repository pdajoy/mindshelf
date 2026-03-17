import { create } from 'zustand';
import type { AIModel } from '@/lib/types';
import { api } from '@/lib/api';

export type ThemeMode = 'system' | 'light' | 'dark';
export type NoteStyle = 'concise' | 'detailed' | 'deep' | 'custom';
export type ExtractorType = 'defuddle' | 'readability' | 'innerText';

export interface QuickPrompt {
  name: string;
  prompt: string;
}

interface SettingsState {
  selectedModel: string;
  availableModels: AIModel[];
  backendUrl: string;
  theme: ThemeMode;
  defaultExportTarget: 'apple_notes' | 'obsidian';
  defaultFolder: string;
  noteStyle: NoteStyle;
  customStylePrompt: string;
  defaultExtractor: ExtractorType;
  quickPrompts: QuickPrompt[];

  loadModels: () => Promise<void>;
  setModel: (model: string) => void;
  setBackendUrl: (url: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setDefaultExportTarget: (t: 'apple_notes' | 'obsidian') => void;
  setDefaultFolder: (f: string) => void;
  setNoteStyle: (s: NoteStyle) => void;
  setCustomStylePrompt: (p: string) => void;
  setDefaultExtractor: (e: ExtractorType) => void;
  setQuickPrompts: (p: QuickPrompt[]) => void;
  loadFromStorage: () => Promise<void>;
}

const DEFAULT_QUICK_PROMPTS: QuickPrompt[] = [
  { name: '精简要点', prompt: '提取关键要点，用简洁的列表呈现' },
  { name: '翻译中文', prompt: '翻译成中文，保持专业术语' },
  { name: '重组结构', prompt: '重新组织结构，使其更有条理' },
  { name: '技术笔记', prompt: '整理为技术笔记格式，突出代码和实现细节' },
];

const STORAGE_KEY = 'mindshelf_settings';
const SYNC_KEYS = [
  'selectedModel', 'backendUrl', 'theme',
  'defaultExportTarget', 'defaultFolder', 'noteStyle',
  'customStylePrompt', 'defaultExtractor', 'quickPrompts',
] as const;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  selectedModel: '',
  availableModels: [],
  backendUrl: 'http://127.0.0.1:3456',
  theme: 'system',
  defaultExportTarget: 'apple_notes',
  defaultFolder: 'MindShelf',
  noteStyle: 'concise',
  customStylePrompt: '',
  defaultExtractor: 'defuddle',
  quickPrompts: DEFAULT_QUICK_PROMPTS,

  loadModels: async () => {
    try {
      const models = await api.ai.models();
      set({ availableModels: models });
      const dm = models.find(m => m.isDefault) || models[0];
      if (dm && !get().selectedModel) set({ selectedModel: dm.model });
    } catch {}
  },

  setModel: (v) => { set({ selectedModel: v }); persist({ selectedModel: v }); },
  setBackendUrl: (v) => { set({ backendUrl: v }); persist({ backendUrl: v }); },
  setTheme: (v) => { set({ theme: v }); applyTheme(v); persist({ theme: v }); },
  setDefaultExportTarget: (v) => { set({ defaultExportTarget: v }); persist({ defaultExportTarget: v }); },
  setDefaultFolder: (v) => { set({ defaultFolder: v }); persist({ defaultFolder: v }); },
  setNoteStyle: (v) => { set({ noteStyle: v }); persist({ noteStyle: v }); },
  setCustomStylePrompt: (v) => { set({ customStylePrompt: v }); persist({ customStylePrompt: v }); },
  setDefaultExtractor: (v) => { set({ defaultExtractor: v }); persist({ defaultExtractor: v }); },
  setQuickPrompts: (v) => { set({ quickPrompts: v }); persist({ quickPrompts: v }); },

  loadFromStorage: async () => {
    try {
      const r = await chrome.storage.local.get(STORAGE_KEY);
      const s = r[STORAGE_KEY];
      if (s) {
        const u: Record<string, unknown> = {};
        for (const k of SYNC_KEYS) if (s[k] !== undefined) u[k] = s[k];
        if (Object.keys(u).length) set(u as any);
      }
    } catch {}
    applyTheme(get().theme);
  },
}));

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(isDark ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useSettingsStore.getState().theme === 'system') applyTheme('system');
  });
}

function persist(partial: Record<string, unknown>) {
  chrome.storage.local.get(STORAGE_KEY).then(r => {
    chrome.storage.local.set({ [STORAGE_KEY]: { ...(r[STORAGE_KEY] || {}), ...partial } });
  }).catch(() => {});
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const nv = changes[STORAGE_KEY].newValue;
    if (!nv) return;
    const state = useSettingsStore.getState();
    const u: Record<string, unknown> = {};
    for (const k of SYNC_KEYS) {
      if (nv[k] !== undefined && nv[k] !== (state as any)[k]) u[k] = nv[k];
    }
    if (Object.keys(u).length) {
      useSettingsStore.setState(u);
      if (u.theme) applyTheme(u.theme as ThemeMode);
    }
  });
}
