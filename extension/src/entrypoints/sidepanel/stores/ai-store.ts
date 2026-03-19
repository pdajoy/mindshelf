import { create } from 'zustand';
import type { ClassifyProgress } from '@/lib/types';
import { categorizeTabs, CATEGORY_DEFINITIONS } from '@/lib/ai-classify';
import { useTabStore } from './tab-store';
import { useSettingsStore } from './settings-store';
import { batchSaveEnrichments } from '@/lib/enrichment-cache';

let classifyAbortController: AbortController | null = null;

interface AIState {
  isClassifying: boolean;
  classifyProgress: ClassifyProgress | null;
  categories: Record<string, { name: string; icon: string; color: string }>;

  startClassify: (tabIds?: string[]) => Promise<void>;
  stopClassify: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  isClassifying: false,
  classifyProgress: null,
  categories: CATEGORY_DEFINITIONS,

  stopClassify: () => {
    if (classifyAbortController) {
      classifyAbortController.abort();
      classifyAbortController = null;
    }
  },

  startClassify: async (tabIds) => {
    const settings = useSettingsStore.getState();
    if (!settings.isAIConfigured()) {
      console.error('[AI] AI not configured. Please set API key in settings.');
      return;
    }

    classifyAbortController = new AbortController();
    set({ isClassifying: true, classifyProgress: { stage: 0, stageName: '初始化...', processed: 0, total: 0 } });

    try {
      const allTabs = useTabStore.getState().tabs;
      const targetTabs = tabIds?.length
        ? allTabs.filter(t => tabIds.includes(t.id))
        : allTabs.filter(t => t.status === 'active');

      if (!targetTabs.length) {
        set({ isClassifying: false, classifyProgress: null });
        return;
      }

      const tabInputs = targetTabs.map(t => ({
        id: t.id, url: t.url, title: t.title, domain: t.domain, content_text: t.content_text,
      }));

      const config = settings.getAIConfig();
      const { classifications } = await categorizeTabs(tabInputs, config, {
        abortSignal: classifyAbortController?.signal,
        onProgress: (progress) => {
          set({
            classifyProgress: {
              stage: progress.stage,
              stageName: progress.stageName,
              processed: progress.processed,
              total: progress.total,
            },
          });
        },
      });

      const enrichToSave: Array<{ url: string; topic: string | null; tags: string[]; ai_summary: string | null; user_score: number | null }> = [];

      for (const [tabId, data] of Object.entries(classifications)) {
        const tab = allTabs.find(t => t.id === tabId);
        useTabStore.getState().updateTab(tabId, {
          topic: data.category,
          tags: data.tags || [],
          processed_at: new Date().toISOString(),
        });
        if (tab) {
          enrichToSave.push({
            url: tab.url,
            topic: data.category,
            tags: data.tags || [],
            ai_summary: tab.ai_summary,
            user_score: tab.user_score,
          });
        }
      }

      if (enrichToSave.length) batchSaveEnrichments(enrichToSave).catch(() => {});
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[AI] Classify failed:', err);
      }
    } finally {
      classifyAbortController = null;
      set({ isClassifying: false, classifyProgress: null });
    }
  },
}));
