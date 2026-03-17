import { create } from 'zustand';
import type { ClassifyProgress } from '@/lib/types';
import { fetchSSE } from '@/lib/api';
import { useTabStore } from './tab-store';
import { useSettingsStore } from './settings-store';

interface AIState {
  isClassifying: boolean;
  classifyProgress: ClassifyProgress | null;
  categories: Record<string, { name: string; icon: string; color: string }>;

  startClassify: (tabIds?: string[]) => Promise<void>;
}

export const useAIStore = create<AIState>((set) => ({
  isClassifying: false,
  classifyProgress: null,
  categories: {},

  startClassify: async (tabIds) => {
    set({ isClassifying: true, classifyProgress: { stage: 0, stageName: '初始化...', processed: 0, total: 0 } });

    try {
      const body: Record<string, unknown> = {};
      const model = useSettingsStore.getState().selectedModel;
      if (model) body.model = model;
      if (tabIds?.length) body.tabIds = tabIds;

      for await (const msg of fetchSSE('/api/ai/classify', body)) {
        if (msg.type === 'progress') {
          set({
            classifyProgress: {
              stage: msg.stage as number,
              stageName: msg.stageName as string,
              processed: msg.processed as number,
              total: msg.total as number,
            },
          });
        } else if (msg.type === 'complete') {
          const classifications = msg.classifications as Record<string, { category: string; tags?: string[]; recommendation?: string; freshness?: number; confidence?: number }>;
          for (const [tabId, data] of Object.entries(classifications)) {
            useTabStore.getState().updateTab(tabId, {
              topic: data.category,
              tags: data.tags || [],
              ai_recommendation: data.recommendation as any,
              freshness_score: data.freshness ?? null,
              value_score: data.confidence ?? null,
              processed_at: new Date().toISOString(),
            });
          }
          await useTabStore.getState().fetchTabs();
        } else if (msg.type === 'error') {
          console.error('[AI] Classify error:', msg.message);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[AI] Classify failed:', err);
      }
    } finally {
      set({ isClassifying: false, classifyProgress: null });
    }
  },
}));
