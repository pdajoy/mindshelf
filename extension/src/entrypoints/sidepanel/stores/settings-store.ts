import { create } from 'zustand';
import type { AIProvider } from '@/lib/ai-client';

export type ThemeMode = 'system' | 'light' | 'dark';
export type NoteStyle = 'concise' | 'detailed' | 'deep' | 'custom';
export type ExtractorType = 'defuddle' | 'readability' | 'innerText';

export interface QuickPrompt {
  name: string;
  prompt: string;
}

export interface ModelProvider {
  id: string;
  type: AIProvider;
  name: string;
  apiKey: string;
  baseUrl?: string;
  models: string[];
}

interface SettingsState {
  providers: ModelProvider[];
  activeProviderId: string;
  activeModel: string;
  maxAgentSteps: number;

  backendUrl: string;
  theme: ThemeMode;
  defaultExportTarget: 'apple_notes' | 'obsidian';
  defaultFolder: string;
  noteStyle: NoteStyle;
  customStylePrompt: string;
  defaultExtractor: ExtractorType;
  quickPrompts: QuickPrompt[];

  addProvider: (p: Omit<ModelProvider, 'id'>) => string;
  updateProvider: (id: string, updates: Partial<Omit<ModelProvider, 'id'>>) => void;
  removeProvider: (id: string) => void;
  setActiveProvider: (id: string, model?: string) => void;
  setActiveModel: (model: string) => void;
  setMaxAgentSteps: (n: number) => void;
  setBackendUrl: (url: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setDefaultExportTarget: (t: 'apple_notes' | 'obsidian') => void;
  setDefaultFolder: (f: string) => void;
  setNoteStyle: (s: NoteStyle) => void;
  setCustomStylePrompt: (p: string) => void;
  setDefaultExtractor: (e: ExtractorType) => void;
  setQuickPrompts: (p: QuickPrompt[]) => void;
  loadFromStorage: () => Promise<void>;
  isAIConfigured: () => boolean;
  getAIConfig: () => { provider: AIProvider; apiKey: string; model: string; baseUrl?: string };
  getActiveProvider: () => ModelProvider | undefined;
}

const DEFAULT_QUICK_PROMPTS: QuickPrompt[] = [
  { name: '精简要点', prompt: '提取关键要点，用简洁的列表呈现' },
  { name: '翻译中文', prompt: '翻译成中文，保持专业术语' },
  { name: '重组结构', prompt: '重新组织结构，使其更有条理' },
  { name: '技术笔记', prompt: '整理为技术笔记格式，突出代码和实现细节' },
];

const STORAGE_KEY = 'mindshelf_settings';
const SYNC_KEYS = [
  'providers', 'activeProviderId', 'activeModel',
  'maxAgentSteps', 'backendUrl', 'theme',
  'defaultExportTarget', 'defaultFolder', 'noteStyle',
  'customStylePrompt', 'defaultExtractor', 'quickPrompts',
] as const;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: [],
  activeProviderId: '',
  activeModel: '',
  maxAgentSteps: 5,

  backendUrl: 'http://127.0.0.1:3456',
  theme: 'system',
  defaultExportTarget: 'apple_notes',
  defaultFolder: 'MindShelf',
  noteStyle: 'concise',
  customStylePrompt: '',
  defaultExtractor: 'defuddle',
  quickPrompts: DEFAULT_QUICK_PROMPTS,

  addProvider: (p) => {
    const id = crypto.randomUUID();
    const provider = { ...p, id };
    const providers = [...get().providers, provider];
    const updates: Record<string, unknown> = { providers };
    if (!get().activeProviderId) {
      updates.activeProviderId = id;
      updates.activeModel = p.models[0] || '';
    }
    set(updates as any);
    persist(updates);
    return id;
  },

  updateProvider: (id, updates) => {
    const providers = get().providers.map(p => p.id === id ? { ...p, ...updates } : p);
    set({ providers });
    persist({ providers });
  },

  removeProvider: (id) => {
    const providers = get().providers.filter(p => p.id !== id);
    const updates: Record<string, unknown> = { providers };
    if (get().activeProviderId === id) {
      updates.activeProviderId = providers[0]?.id || '';
      updates.activeModel = providers[0]?.models[0] || '';
    }
    set(updates as any);
    persist(updates);
  },

  setActiveProvider: (id, model) => {
    const provider = get().providers.find(p => p.id === id);
    if (!provider) return;
    const updates = { activeProviderId: id, activeModel: model || provider.models[0] || '' };
    set(updates);
    persist(updates);
  },

  setActiveModel: (model) => { set({ activeModel: model }); persist({ activeModel: model }); },
  setMaxAgentSteps: (v) => { set({ maxAgentSteps: v }); persist({ maxAgentSteps: v }); },
  setBackendUrl: (v) => { set({ backendUrl: v }); persist({ backendUrl: v }); },
  setTheme: (v) => { set({ theme: v }); applyTheme(v); persist({ theme: v }); },
  setDefaultExportTarget: (v) => { set({ defaultExportTarget: v }); persist({ defaultExportTarget: v }); },
  setDefaultFolder: (v) => { set({ defaultFolder: v }); persist({ defaultFolder: v }); },
  setNoteStyle: (v) => { set({ noteStyle: v }); persist({ noteStyle: v }); },
  setCustomStylePrompt: (v) => { set({ customStylePrompt: v }); persist({ customStylePrompt: v }); },
  setDefaultExtractor: (v) => { set({ defaultExtractor: v }); persist({ defaultExtractor: v }); },
  setQuickPrompts: (v) => { set({ quickPrompts: v }); persist({ quickPrompts: v }); },

  isAIConfigured: () => {
    const { providers, activeProviderId, activeModel } = get();
    const provider = providers.find(p => p.id === activeProviderId);
    return !!(provider?.apiKey && activeModel);
  },

  getAIConfig: () => {
    const { providers, activeProviderId, activeModel } = get();
    const provider = providers.find(p => p.id === activeProviderId);
    if (!provider) return { provider: 'openai' as const, apiKey: '', model: '' };
    return {
      provider: provider.type,
      apiKey: provider.apiKey,
      model: activeModel,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
    };
  },

  getActiveProvider: () => {
    const { providers, activeProviderId } = get();
    return providers.find(p => p.id === activeProviderId);
  },

  loadFromStorage: async () => {
    try {
      const r = await chrome.storage.local.get(STORAGE_KEY);
      const s = r[STORAGE_KEY];
      if (s) {
        // Migration: old single-provider format → multi-provider
        if (s.aiApiKey && (!s.providers || !s.providers.length)) {
          const provider: ModelProvider = {
            id: crypto.randomUUID(),
            type: s.aiProvider || 'openai',
            name: s.aiProvider === 'anthropic' ? 'Anthropic' : (s.aiBaseUrl ? '自定义 API' : 'OpenAI'),
            apiKey: s.aiApiKey,
            ...(s.aiBaseUrl ? { baseUrl: s.aiBaseUrl } : {}),
            models: [s.aiModel || 'gpt-4o-mini'],
          };
          s.providers = [provider];
          s.activeProviderId = provider.id;
          s.activeModel = s.aiModel || 'gpt-4o-mini';
          persist({ providers: s.providers, activeProviderId: s.activeProviderId, activeModel: s.activeModel });
        }
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
