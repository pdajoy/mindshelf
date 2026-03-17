import { create } from 'zustand';

export type Panel = 'tabs' | 'chat';

interface NavState {
  activePanel: Panel;
  setActivePanel: (panel: Panel) => void;
  pendingSummarizeTabId: string | null;
  requestSummarize: (tabId: string) => void;
  clearPendingSummarize: () => void;
  showSettings: boolean;
  toggleSettings: () => void;
  pendingLocateTabId: string | null;
  requestLocate: (tabId: string) => void;
  clearPendingLocate: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activePanel: 'tabs',
  setActivePanel: (panel) => set({ activePanel: panel }),
  pendingSummarizeTabId: null,
  requestSummarize: (tabId) => set({ activePanel: 'chat', pendingSummarizeTabId: tabId }),
  clearPendingSummarize: () => set({ pendingSummarizeTabId: null }),
  showSettings: false,
  toggleSettings: () => set(s => ({ showSettings: !s.showSettings })),
  pendingLocateTabId: null,
  requestLocate: (tabId) => set({ pendingLocateTabId: tabId }),
  clearPendingLocate: () => set({ pendingLocateTabId: null }),
  toast: null,
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set({ toast: null }), 2500);
  },
}));
